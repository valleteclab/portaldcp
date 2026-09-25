import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { FaseLicitacao, Licitacao, ModalidadeLicitacao } from '../licitacoes/entities/licitacao.entity';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao, atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { definicaoDoAto } from '../licitacoes/transicoes/definicoes';
import type { Ator } from '../auth/acesso/ator';
import { RankingService, UnidadeJulgamento } from '../julgamento/ranking.service';
import { SituacaoLicitante, StatusAceitacao } from '../julgamento/regras-julgamento';
import { ContratosService } from '../contratos/contratos.service';
import { PncpService } from '../pncp/pncp.service';
import { NotificacoesService } from '../notificacoes/notificacoes.service';
import { TipoNotificacao } from '../notificacoes/entities/notificacao.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { EtapaSessao, StatusSessao } from '../sessao/entities/sessao-disputa.entity';
import { GERADOR_ATA_REGISTRO_PRECO } from './gerador-ata';
import type { GeradorAtaRegistroPreco } from './gerador-ata';
import {
  OrigemResultado,
  STATUS_ITEM_COM_RESULTADO,
  STATUS_ITEM_SEM_RESULTADO,
  ValorAdjudicado,
  arred,
  motivoAutoridadeInvalida,
  motivoVencedorInvalido,
  valorHomologado,
  valoresAdjudicadosDaAceitacao,
} from './regras-resultado';
import { marcarContratacaoIniciada } from './status-demanda-pca.sql';

/** Uma unidade pronta para a adjudicação: vencedor + valores por item. */
export interface EntradaAdjudicacao {
  tipo: 'ITEM' | 'LOTE';
  unidadeId: string;
  numero: number;
  fornecedorId: string;
  valores: ValorAdjudicado[];
  /** Aceitação de origem (sala) — trilha. */
  aceitacaoId?: string | null;
}

export interface PlanoAdjudicacao {
  unidades: EntradaAdjudicacao[];
  pendencias: string[];
}

/** Modalidades cujo resultado nasce da sala (ADJUDICAR/DECIDIR_RECURSOS). */
const brl = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * ============================================================================
 * RESULTADO ÚNICO (plano E6) — adjudicação, homologação e geração do
 * instrumento (contrato, ou ARP no SRP). Lei 14.133/2021 arts. 71, 90–95;
 * IN SEGES 73/2022 art. 42 e seguintes.
 * ============================================================================
 *
 *  - ADJUDICAR (pregão/concorrência pela sala): por unidade (item, ou lote na
 *    disputa por lote), o vencedor do RANKING ÚNICO que está HABILITADO vira
 *    VENCEDOR em `licitantes_unidade`; cada item fica ADJUDICADO com os
 *    valores da PROPOSTA ADEQUADA ACEITA (IN 73 art. 29 — nunca o lance cru).
 *    Ato ADJUDICAR (de HABILITACAO; ou ADJUDICACAO → ADJUDICACAO depois que a
 *    fase recursal foi decidida) ou DECIDIR_RECURSOS (de RECURSO).
 *  - Dispensa (JULGAR_DISPENSA) e seleção externa (REGISTRAR_RESULTADO_EXTERNO)
 *    gravam o MESMO dado por `gravarAdjudicacao` (vencedor VENCEDOR + item
 *    ADJUDICADO + valores), dentro do próprio ato.
 *  - HOMOLOGAR (um método para TODAS as modalidades): autoridade do cadastro
 *    (token), data (efeito do ato), valor = soma dos valores adjudicados
 *    (nunca do corpo), itens → HOMOLOGADO, sessão encerrada; depois do
 *    commit: contrato por vencedor (não SRP) ou gancho da ARP (SRP), PNCP e
 *    avisos. Efeito suspensivo dos recursos: pré-condição do ato (art. 168).
 */
@Injectable()
export class ResultadoService {
  private readonly logger = new Logger(ResultadoService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transicoes: TransicoesService,
    private readonly ranking: RankingService,
    private readonly contratos: ContratosService,
    private readonly pncp: PncpService,
    private readonly notificacoes: NotificacoesService,
    @Inject(GERADOR_ATA_REGISTRO_PRECO) private readonly geradorAta: GeradorAtaRegistroPreco,
  ) {}

  // ==========================================================================
  // LEITURA
  // ==========================================================================

  private async licitacao(id: string, m: EntityManager = this.dataSource.manager): Promise<Licitacao> {
    const lic = await m.getRepository(Licitacao).findOne({ where: { id } });
    if (!lic) throw new NotFoundException('Licitação não encontrada');
    return lic;
  }

  private rotulo(u: { tipo: 'ITEM' | 'LOTE'; numero: number }): string {
    return `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`;
  }

  /** A modalidade adjudica pela sala (ato ADJUDICAR existe no fluxo)? */
  static adjudicaPelaSala(modalidade: ModalidadeLicitacao | string): boolean {
    return !!definicaoDoAto(modalidade, AtoLicitacao.ADJUDICAR);
  }

  private async nomesFornecedores(m: EntityManager, ids: string[]): Promise<Map<string, { razaoSocial: string; cpfCnpj: string }>> {
    const validos = [...new Set(ids.filter(Boolean))];
    if (!validos.length) return new Map();
    const rows: any[] = await m.query(`SELECT id::text AS id, razao_social, cpf_cnpj FROM fornecedores WHERE id::text = ANY($1)`, [validos]);
    return new Map(rows.map((r) => [String(r.id), { razaoSocial: r.razao_social ?? '', cpfCnpj: r.cpf_cnpj ?? '' }]));
  }

  /**
   * Plano da adjudicação pela sala: para cada unidade com resultado possível,
   * o vencedor do ranking único (HABILITADO) e os valores da proposta adequada
   * ACEITA dele. Pendências (sem vencedor habilitado, sem proposta aceita) são
   * listadas — o ato só acontece sem nenhuma.
   */
  async planoAdjudicacao(licitacaoId: string, m: EntityManager = this.dataSource.manager): Promise<PlanoAdjudicacao> {
    const unidades = await this.ranking.unidades(licitacaoId, m);
    const plano: PlanoAdjudicacao = { unidades: [], pendencias: [] };
    for (const u of unidades) {
      if (!RankingService.unidadeComResultadoPossivel(u)) continue;
      const rotulo = this.rotulo(u);
      const vencedor = await this.ranking.vencedor(u, m);
      const invalido = motivoVencedorInvalido(rotulo, vencedor);
      if (invalido) {
        plano.pendencias.push(invalido);
        continue;
      }
      const aceita = await this.aceitacaoAceita(m, u.id, vencedor!.fornecedorId);
      if (!aceita) {
        plano.pendencias.push(`${rotulo}: proposta adequada aceita do vencedor não encontrada (IN SEGES 73/2022, art. 29).`);
        continue;
      }
      const itens = u.itens
        .filter((i) => !STATUS_ITEM_SEM_RESULTADO.includes(i.status))
        .map((i) => ({ itemId: i.id, numero: i.numero, quantidade: i.quantidade }));
      try {
        const valores = valoresAdjudicadosDaAceitacao(rotulo, itens, aceita.valores_itens);
        plano.unidades.push({ tipo: u.tipo, unidadeId: u.id, numero: u.numero, fornecedorId: vencedor!.fornecedorId, valores, aceitacaoId: aceita.id });
      } catch (e: any) {
        plano.pendencias.push(e?.message ?? String(e));
      }
    }
    return plano;
  }

  /** Última proposta adequada ACEITA do licitante na unidade. */
  private async aceitacaoAceita(
    m: EntityManager,
    unidadeId: string,
    fornecedorId: string,
  ): Promise<{ id: string; valores_itens: any[] | null } | null> {
    const [a] = await m.query(
      `SELECT id, valores_itens FROM aceitacoes_proposta
        WHERE unidade_id::text = $1 AND fornecedor_id = $2 AND status = $3
        ORDER BY decidida_em DESC NULLS LAST, created_at DESC LIMIT 1`,
      [unidadeId, fornecedorId, StatusAceitacao.ACEITA],
    );
    return a ? { id: String(a.id), valores_itens: a.valores_itens ?? null } : null;
  }

  /**
   * Painel do resultado (órgão dono): unidades com vencedor e valores
   * (gravados, ou a prévia do que a adjudicação gravará), total, pendências,
   * atos disponíveis e instrumentos gerados.
   */
  async painel(licitacaoId: string, ator?: Ator | null) {
    const m = this.dataSource.manager;
    const lic = await this.licitacao(licitacaoId, m);
    const pelaSala = ResultadoService.adjudicaPelaSala(lic.modalidade);
    const unidades = await this.ranking.unidades(licitacaoId, m);
    const itensDb: any[] = await m.query(
      `SELECT id::text AS id, numero_item, status::text AS status, fornecedor_vencedor_id, fornecedor_vencedor_nome,
              valor_unitario_homologado, valor_total_homologado
         FROM itens_licitacao WHERE licitacao_id = $1`,
      [licitacaoId],
    );
    const porItem = new Map(itensDb.map((i) => [String(i.id), i]));

    const fasesDePrevia = [FaseLicitacao.HABILITACAO, FaseLicitacao.RECURSO, FaseLicitacao.ADJUDICACAO];
    const previa = pelaSala && fasesDePrevia.includes(lic.fase) ? await this.planoAdjudicacao(licitacaoId, m) : null;
    const previaPorUnidade = new Map((previa?.unidades ?? []).map((e) => [e.unidadeId, e]));

    const idsFornecedores = [
      ...itensDb.map((i) => i.fornecedor_vencedor_id).filter(Boolean),
      ...(previa?.unidades ?? []).map((e) => e.fornecedorId),
    ];
    const cadastro = await this.nomesFornecedores(m, idsFornecedores.map(String));

    const saida = unidades.map((u) => {
      const itens = u.itens.map((i) => {
        const db = porItem.get(i.id);
        const comResultado = !!db?.fornecedor_vencedor_id && STATUS_ITEM_COM_RESULTADO.includes(String(db.status));
        const prev = previaPorUnidade.get(u.id)?.valores.find((v) => v.itemId === i.id);
        return {
          itemId: i.id,
          numero: i.numero,
          descricao: i.descricao,
          quantidade: i.quantidade,
          unidadeMedida: i.unidadeMedida,
          status: String(db?.status ?? i.status),
          valorUnitario: comResultado ? Number(db.valor_unitario_homologado) : (prev?.valorUnitario ?? null),
          valorTotal: comResultado ? Number(db.valor_total_homologado) : (prev?.valorTotal ?? null),
          gravado: comResultado,
          fornecedorId: comResultado ? String(db.fornecedor_vencedor_id) : (previaPorUnidade.get(u.id)?.fornecedorId ?? null),
        };
      });
      const fornecedorId = itens.find((i) => i.fornecedorId)?.fornecedorId ?? null;
      const semResultado = itens.every((i) => STATUS_ITEM_SEM_RESULTADO.includes(i.status));
      const homologada = itens.some((i) => i.status === 'HOMOLOGADO');
      const adjudicada = itens.some((i) => i.gravado);
      return {
        tipo: u.tipo,
        unidadeId: u.id,
        numero: u.numero,
        descricao: u.descricao,
        situacao: semResultado
          ? itens.every((i) => i.status === 'DESERTO')
            ? 'DESERTA'
            : 'SEM_RESULTADO'
          : homologada
            ? 'HOMOLOGADA'
            : adjudicada
              ? 'ADJUDICADA'
              : previaPorUnidade.has(u.id)
                ? 'A_ADJUDICAR'
                : 'PENDENTE',
        vencedor: fornecedorId
          ? { fornecedorId, razaoSocial: cadastro.get(fornecedorId)?.razaoSocial ?? '', cpfCnpj: cadastro.get(fornecedorId)?.cpfCnpj ?? '' }
          : null,
        valorTotal: arred(itens.reduce((s, i) => s + Number(i.valorTotal || 0), 0), 2),
        itens,
      };
    });

    const atos = await this.transicoes.atosDisponiveis(lic);
    const ato = (a: AtoLicitacao) => {
      const d = atos.find((x) => x.ato === a);
      return d ? { disponivel: d.disponivel, pendencias: d.pendencias } : null;
    };
    const atoAdjudicar = lic.fase === FaseLicitacao.RECURSO ? ato(AtoLicitacao.DECIDIR_RECURSOS) : ato(AtoLicitacao.ADJUDICAR);
    const adjudicar = pelaSala && atoAdjudicar
      ? {
          disponivel: atoAdjudicar.disponivel && !!previa && previa.pendencias.length === 0 && previa.unidades.length > 0,
          pendencias: [...atoAdjudicar.pendencias, ...(previa?.pendencias ?? [])],
        }
      : null;
    const homologar = ato(AtoLicitacao.HOMOLOGAR);
    const autoridadeInvalida = ator ? motivoAutoridadeInvalida(ator) : null;

    const [contratos, atas] = await Promise.all([
      m.query(
        `SELECT id, numero_contrato, fornecedor_razao_social, valor_global, status::text AS status, data_assinatura, prazo_execucao_dias
           FROM contratos WHERE licitacao_id = $1 AND status::text <> 'CANCELADO' ORDER BY numero_contrato`,
        [licitacaoId],
      ),
      m.query(`SELECT id, numero_ata, fornecedor_razao_social, valor_total, status::text AS status FROM atas_registro_preco WHERE licitacao_id = $1 ORDER BY numero_ata`, [licitacaoId]),
    ]);

    const valorAdjudicado = valorHomologado(itensDb);
    return {
      licitacao: {
        id: lic.id,
        numero_processo: lic.numero_processo,
        modalidade: lic.modalidade,
        fase: lic.fase,
        situacao: lic.situacao,
        srp: !!(lic as any).srp,
        selecao_externa: !!lic.selecao_externa,
        valor_homologado: lic.valor_homologado != null ? Number(lic.valor_homologado) : null,
        data_adjudicacao: lic.data_adjudicacao ?? null,
        data_homologacao: lic.data_homologacao ?? null,
        autoridade_homologacao: lic.homologacao_autoridade_nome
          ? { nome: lic.homologacao_autoridade_nome, cargo: lic.homologacao_autoridade_cargo }
          : null,
      },
      adjudicaPelaSala: pelaSala,
      unidades: saida,
      /** Soma dos valores adjudicados gravados (= valor a homologar). */
      valorAdjudicado,
      /** Soma da prévia (antes de adjudicar) — informativa. */
      valorPrevia: previa ? arred(previa.unidades.reduce((s, e) => s + e.valores.reduce((x, v) => x + v.valorTotal, 0), 0), 2) : null,
      atos: {
        adjudicar,
        homologar: homologar
          ? {
              disponivel: homologar.disponivel && !autoridadeInvalida,
              pendencias: [...homologar.pendencias, ...(autoridadeInvalida ? [autoridadeInvalida] : [])],
            }
          : null,
      },
      autoridade: ator && !autoridadeInvalida ? await this.autoridadeDoAtor(ator, m) : null,
      instrumentos: { tipo: (lic as any).srp ? 'ATA' : 'CONTRATO', contratos, atas },
    };
  }

  // ==========================================================================
  // GRAVAÇÃO COMUM (sala, dispensa, seleção externa)
  // ==========================================================================

  /**
   * Grava a adjudicação de cada unidade, na transação do ATO que a pratica:
   * vencedor → VENCEDOR em `licitantes_unidade` (quem era VENCEDOR antes na
   * unidade volta a CLASSIFICADO — rejulgamento da dispensa / novo registro
   * externo), itens → ADJUDICADO com vencedor e valores adjudicados.
   */
  async gravarAdjudicacao(
    m: EntityManager,
    licitacaoId: string,
    entradas: EntradaAdjudicacao[],
    ator: AtorTransicao,
    origem: OrigemResultado,
  ): Promise<Array<EntradaAdjudicacao & { razaoSocial: string; valorTotal: number }>> {
    const cadastro = await this.nomesFornecedores(m, entradas.map((e) => e.fornecedorId));
    const saida: Array<EntradaAdjudicacao & { razaoSocial: string; valorTotal: number }> = [];
    for (const e of entradas) {
      const razaoSocial = cadastro.get(String(e.fornecedorId))?.razaoSocial ?? '';
      await m.query(
        `UPDATE licitantes_unidade SET situacao = $3, motivo = $4, situacao_em = now(), updated_at = now()
          WHERE unidade_id::text = $1 AND fornecedor_id <> $2 AND situacao = $5`,
        [e.unidadeId, e.fornecedorId, SituacaoLicitante.CLASSIFICADO, `Resultado refeito (${origem})`, SituacaoLicitante.VENCEDOR],
      );
      await this.ranking.definirSituacao(m, { id: e.unidadeId, tipo: e.tipo, licitacaoId }, e.fornecedorId, SituacaoLicitante.VENCEDOR, {
        motivo: `Adjudicado (${origem}) — Lei 14.133/2021, art. 71 IV`,
        ator,
      });
      for (const v of e.valores) {
        const r = await m.query(
          `UPDATE itens_licitacao
              SET status = 'ADJUDICADO', fornecedor_vencedor_id = $3, fornecedor_vencedor_nome = $4,
                  valor_unitario_homologado = $5, valor_total_homologado = $6, updated_at = now()
            WHERE id::text = $1 AND licitacao_id = $2`,
          [v.itemId, licitacaoId, e.fornecedorId, razaoSocial || null, v.valorUnitario, v.valorTotal],
        );
        const n = Array.isArray(r) ? Number(r[1] ?? 0) : Number(r?.affected ?? 0);
        if (n !== 1) throw new BadRequestException(`Item ${v.numero} não pertence a esta licitação`);
      }
      saida.push({ ...e, razaoSocial, valorTotal: arred(e.valores.reduce((s, v) => s + v.valorTotal, 0), 2) });
    }
    return saida;
  }

  /** Sessões da licitação (mais recente primeiro). */
  private async sessoes(m: EntityManager, licitacaoId: string): Promise<Array<{ id: string; status: string; pregoeiro_nome: string | null }>> {
    return m.query(
      `SELECT id::text AS id, status::text AS status, pregoeiro_nome FROM sessoes_disputa WHERE licitacao_id = $1 ORDER BY created_at DESC`,
      [licitacaoId],
    );
  }

  private async evento(
    m: EntityManager,
    e: { sessaoId: string; tipo: TipoEvento; descricao: string; itemId?: string | null; fornecedorId?: string | null; usuario?: string | null; valor?: number | null; dados?: Record<string, any> },
  ): Promise<void> {
    await m.save(
      m.create(EventoSessao, {
        sessao_id: e.sessaoId,
        tipo: e.tipo,
        descricao: e.descricao,
        item_id: e.itemId ?? undefined,
        fornecedor_id: e.fornecedorId ?? undefined,
        fornecedor_identificador: e.fornecedorId ?? undefined,
        valor: e.valor ?? undefined,
        usuario_nome: e.usuario ?? 'SISTEMA',
        is_sistema: false,
        dados_adicionais: e.dados,
      }),
    );
  }

  // ==========================================================================
  // ADJUDICAR (sala — pregão/concorrência)
  // ==========================================================================

  async adjudicar(licitacaoId: string, atorJwt: Ator, opts: { motivo?: string | null; usuarioNome?: string | null } = {}) {
    const ator = atorTransicaoDe(atorJwt);
    const lic = await this.licitacao(licitacaoId);
    if (!ResultadoService.adjudicaPelaSala(lic.modalidade)) {
      throw new BadRequestException(
        lic.modalidade === ModalidadeLicitacao.DISPENSA_ELETRONICA
          ? 'Na dispensa eletrônica a adjudicação é feita pelo julgamento (POST /licitacoes/:id/julgar-dispensa).'
          : 'Nesta modalidade o resultado é registrado pelo resultado externo (POST /licitacoes/:id/resultado-externo).',
      );
    }
    const ato = lic.fase === FaseLicitacao.RECURSO ? AtoLicitacao.DECIDIR_RECURSOS : AtoLicitacao.ADJUDICAR;
    let gravadas: Awaited<ReturnType<ResultadoService['gravarAdjudicacao']>> = [];
    await this.transicoes.executar(licitacaoId, ato, {
      ator,
      motivo: opts.motivo ?? undefined,
      registro: { origem: 'resultado' },
      aplicar: async (_l, m) => {
        const plano = await this.planoAdjudicacao(licitacaoId, m);
        if (plano.pendencias.length) {
          throw new BadRequestException({
            message: plano.pendencias.length === 1 ? plano.pendencias[0] : `Pendências para adjudicar: ${plano.pendencias.join(' | ')}`,
            pendencias: plano.pendencias,
          });
        }
        if (!plano.unidades.length) throw new BadRequestException('Nenhuma unidade com vencedor habilitado para adjudicar.');
        gravadas = await this.gravarAdjudicacao(m, licitacaoId, plano.unidades, ator, 'SALA');

        // Sala: etapa HOMOLOGACAO + registro na ata da sessão
        const [sessao] = (await this.sessoes(m, licitacaoId)).filter((s) => s.status !== StatusSessao.ENCERRADA);
        if (sessao) {
          await m.query(`UPDATE sessoes_disputa SET etapa = $2, updated_at = now() WHERE id = $1`, [sessao.id, EtapaSessao.HOMOLOGACAO]);
          const usuario = opts.usuarioNome ?? sessao.pregoeiro_nome ?? null;
          for (const g of gravadas) {
            await this.evento(m, {
              sessaoId: sessao.id,
              tipo: TipoEvento.ITEM_ADJUDICADO,
              descricao: `${this.rotulo(g)} adjudicado a ${g.razaoSocial || g.fornecedorId} por ${brl(g.valorTotal)} (proposta adequada aceita).`,
              itemId: g.tipo === 'ITEM' ? g.unidadeId : null,
              fornecedorId: g.fornecedorId,
              usuario,
              valor: g.valorTotal,
              dados: { unidade_id: g.unidadeId, tipo_unidade: g.tipo, aceitacao_id: g.aceitacaoId ?? null, itens: g.valores },
            });
          }
          const total = arred(gravadas.reduce((s, g) => s + g.valorTotal, 0), 2);
          await this.evento(m, {
            sessaoId: sessao.id,
            tipo: TipoEvento.LICITACAO_ADJUDICADA,
            descricao: `Licitação adjudicada: ${gravadas.length} unidade(s), ${brl(total)} (art. 71 IV, Lei 14.133/2021).`,
            usuario,
            valor: total,
            dados: { unidades: gravadas.length },
          });
        }
      },
    });
    this.logger.log(`[${lic.numero_processo}] adjudicada: ${gravadas.length} unidade(s)`);
    return this.painel(licitacaoId, atorJwt);
  }

  // ==========================================================================
  // HOMOLOGAR (todas as modalidades)
  // ==========================================================================

  /** Nome e cargo da autoridade: usuário do token ou responsável do órgão (cadastro). */
  async autoridadeDoAtor(ator: Ator, m: EntityManager = this.dataSource.manager): Promise<{ nome: string; cargo: string }> {
    if (ator.tipo === 'USUARIO') {
      const [u] = await m.query(`SELECT nome, cargo FROM usuarios WHERE id::text = $1`, [ator.usuarioId ?? ator.id]);
      return { nome: u?.nome || 'Usuário do órgão', cargo: u?.cargo || 'Administrador do órgão' };
    }
    if (ator.orgaoId) {
      const [o] = await m.query(`SELECT nome, responsavel_nome, responsavel_cargo FROM orgaos WHERE id::text = $1`, [ator.orgaoId]);
      return {
        nome: o?.responsavel_nome || o?.nome || 'Autoridade competente',
        cargo: o?.responsavel_cargo || 'Autoridade competente',
      };
    }
    return { nome: 'Administrador da plataforma', cargo: 'Administrador' };
  }

  /**
   * HOMOLOGAR: valor = soma dos valores adjudicados; itens → HOMOLOGADO;
   * autoridade do cadastro; sessão encerrada. Depois do commit: contrato(s)
   * ou ARP, PNCP e avisos (falhas não desfazem a homologação).
   */
  async homologar(licitacaoId: string, atorJwt: Ator) {
    const invalida = motivoAutoridadeInvalida(atorJwt);
    if (invalida) throw new ForbiddenException(invalida);
    const ator = atorTransicaoDe(atorJwt);
    const autoridade = await this.autoridadeDoAtor(atorJwt);
    let valor = 0;
    let itensHomologados = 0;
    const lic = await this.transicoes.executar(licitacaoId, AtoLicitacao.HOMOLOGAR, {
      ator,
      registro: { origem: 'resultado', autoridade },
      aplicar: async (l, m) => {
        const itens: any[] = await m.query(
          `SELECT id, status::text AS status, fornecedor_vencedor_id, valor_total_homologado FROM itens_licitacao WHERE licitacao_id = $1`,
          [licitacaoId],
        );
        valor = valorHomologado(itens);
        if (!(valor > 0)) {
          throw new BadRequestException('Nenhum item adjudicado com valor — adjudique o resultado antes de homologar (art. 71 IV).');
        }
        const r = await m.query(
          `UPDATE itens_licitacao SET status = 'HOMOLOGADO', updated_at = now()
            WHERE licitacao_id = $1 AND fornecedor_vencedor_id IS NOT NULL AND status::text IN ('ADJUDICADO','HOMOLOGADO')`,
          [licitacaoId],
        );
        itensHomologados = Array.isArray(r) ? Number(r[1] ?? 0) : Number(r?.affected ?? 0);
        l.valor_homologado = valor;
        l.homologacao_autoridade_nome = autoridade.nome.slice(0, 200);
        l.homologacao_autoridade_cargo = autoridade.cargo.slice(0, 200);

        // Sessão pública: encerrada com o registro da homologação na ata
        const sessoes = await this.sessoes(m, licitacaoId);
        const abertas = sessoes.filter((s) => s.status !== StatusSessao.ENCERRADA);
        for (const s of abertas) {
          await m.query(
            `UPDATE sessoes_disputa SET etapa = $2, status = $3, data_hora_encerramento = now(), updated_at = now() WHERE id = $1`,
            [s.id, EtapaSessao.ENCERRAMENTO, StatusSessao.ENCERRADA],
          );
        }
        const alvo = abertas[0] ?? sessoes[0];
        if (alvo) {
          await this.evento(m, {
            sessaoId: alvo.id,
            tipo: TipoEvento.LICITACAO_HOMOLOGADA,
            descricao:
              `Resultado HOMOLOGADO por ${autoridade.nome} (${autoridade.cargo}): ${itensHomologados} item(ns), ` +
              `valor total ${brl(valor)} (art. 71 IV, Lei 14.133/2021).`,
            usuario: autoridade.nome,
            valor,
            dados: { autoridade, itensHomologados, valorTotal: valor },
          });
        }
      },
    });

    const instrumentos = await this.gerarInstrumentosSemFalhar(licitacaoId, ator);
    this.efeitosExternosDaHomologacao(lic, instrumentos).catch(() => undefined);

    return {
      licitacao_id: lic.id,
      fase: lic.fase,
      valorHomologado: valor,
      itensHomologados,
      autoridade,
      data_homologacao: lic.data_homologacao,
      instrumentos,
    };
  }

  // ==========================================================================
  // INSTRUMENTOS (contrato ou ARP)
  // ==========================================================================

  /**
   * Gera o instrumento da licitação homologada (idempotente): SRP → gancho da
   * ARP; demais → um contrato por fornecedor vencedor, AGUARDANDO_ASSINATURA.
   */
  async gerarInstrumentos(licitacaoId: string, ator: AtorTransicao) {
    const lic = await this.licitacao(licitacaoId);
    if (lic.fase !== FaseLicitacao.HOMOLOGACAO) {
      throw new ConflictException('Contrato/ata só são gerados a partir da licitação homologada.');
    }
    if ((lic as any).srp) {
      const atas = await this.geradorAta.gerarAtaRegistroPreco(licitacaoId, { ator });
      return { tipo: 'ATA' as const, atas, contratos: [] as any[] };
    }
    const contratos = await this.contratos.gerarContratoAutomatico(licitacaoId);
    return {
      tipo: 'CONTRATO' as const,
      atas: [] as any[],
      contratos: contratos.map((c) => ({
        id: c.id,
        numero_contrato: c.numero_contrato,
        fornecedor_id: c.fornecedor_id,
        fornecedor_razao_social: c.fornecedor_razao_social,
        valor_global: Number(c.valor_global),
        status: c.status,
        prazo_execucao_dias: c.prazo_execucao_dias,
        data_assinatura: c.data_assinatura ?? null,
      })),
    };
  }

  private async gerarInstrumentosSemFalhar(licitacaoId: string, ator: AtorTransicao) {
    try {
      return { ...(await this.gerarInstrumentos(licitacaoId, ator)), erro: null as string | null };
    } catch (e: any) {
      this.logger.error(`Instrumento da licitação ${licitacaoId} não gerado: ${e?.message ?? e}`);
      return { tipo: null, atas: [], contratos: [], erro: String(e?.message ?? e), status: e?.status ?? 500 };
    }
  }

  /** PNCP e aviso da demanda — fire-and-forget (falha fica em pncp_sync / log). */
  private async efeitosExternosDaHomologacao(lic: Licitacao, instrumentos: { contratos: any[]; atas: any[] }): Promise<void> {
    // Seleção externa: a plataforma de origem publica o resultado no PNCP
    if (!lic.selecao_externa) {
      this.pncp
        .enviarResultadoHomologacao(lic.id)
        .then((r: any) => this.logger.log(`[PNCP] Resultado ${lic.numero_processo}: ${r?.enviados}/${r?.total} item(ns)`))
        .catch((e: any) => this.logger.warn(`[PNCP] Resultado ${lic.numero_processo} não enviado: ${e.message} (reenvie pelo cockpit)`));
      // Contrato no PNCP (art. 94) — hoje na homologação; E7 move para depois da assinatura
      if (instrumentos.contratos.length) {
        this.pncp
          .enviarContratosHomologacao(lic.id)
          .then((r: any) => this.logger.log(`[PNCP] Contratos ${lic.numero_processo}: ${r?.enviados}/${r?.total}`))
          .catch((e: any) => this.logger.warn(`[PNCP] Contratos ${lic.numero_processo} não enviados: ${e.message} (reenvie pelo cockpit)`));
      }
    }
    if (lic.demanda_id) {
      try {
        const [d] = await this.dataSource.query(`SELECT id, responsavel_email FROM demandas WHERE id::text = $1`, [lic.demanda_id]);
        if (d) {
          const numeros = [...instrumentos.contratos.map((c) => c.numero_contrato), ...instrumentos.atas.map((a) => a.numero)].filter(Boolean);
          await this.notificacoes.criar({
            orgao_id: lic.orgao_id,
            usuario_id: lic.orgao_id,
            usuario_email: d.responsavel_email || undefined,
            tipo: TipoNotificacao.DEMANDA_CONTRATADA,
            titulo: 'Sua demanda foi homologada ✅',
            mensagem:
              `O processo ${lic.numero_processo} foi homologado` +
              (numeros.length ? ` e gerou ${numeros.join(', ')} (aguardando assinaturas).` : '.'),
            entidade_tipo: 'DEMANDA',
            entidade_id: d.id,
            link: `/orgao/demandas/${d.id}`,
          } as any);
        }
      } catch (e: any) {
        this.logger.warn(`Aviso da demanda de origem não enviado: ${e?.message ?? e}`);
      }
    }
  }

  // ==========================================================================
  // DEMANDA / PCA (plano E6 item 5)
  // ==========================================================================

  /** Processo criado a partir da demanda/PCA: demanda EM_CONTRATACAO, item do PCA LICITACAO_INICIADA. */
  async aoCriarProcesso(licitacaoId: string): Promise<void> {
    try {
      await marcarContratacaoIniciada(this.dataSource, licitacaoId);
    } catch (e: any) {
      this.logger.warn(`Status da demanda/PCA não atualizado (licitação ${licitacaoId}): ${e?.message ?? e}`);
    }
  }
}
