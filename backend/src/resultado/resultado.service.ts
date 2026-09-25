import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
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
  motivoVencedorInvalido,
  valorHomologado,
  valoresAdjudicadosDaAceitacao,
} from './regras-resultado';
import { marcarContratacaoIniciada } from './status-demanda-pca.sql';
import { FormalizacaoService, PlanoParaTermo } from './formalizacao/formalizacao.service';
import { FormalizacaoResultado } from './formalizacao/formalizacao.entities';
import {
  AutoridadeDoAto,
  ModoFormalizacao,
  ROTULO_MODO,
  STATUS_EM_ANDAMENTO,
  StatusFormalizacao,
  TipoFormalizacao,
  efeitoDoRegistro,
  motivoArquivoExternoInvalido,
  motivoAutoridadeInaptaParaModo,
  motivoOperadorInvalido,
  termoEhPublico,
} from './formalizacao/regras-formalizacao';

/** Arquivo enviado (multer, memória) — termo externo. */
export interface ArquivoEnviado {
  buffer: Buffer;
  originalname?: string;
  mimetype?: string;
  size?: number;
}

/** Opções de quem registra o ato (operador): autoridade escolhida, termo externo. */
export interface OpcoesRegistroAto {
  motivo?: string | null;
  usuarioNome?: string | null;
  /** Autoridade do cadastro do órgão (padrão quando ausente). */
  autoridadeId?: string | null;
  /** TERMO_EXTERNO: termo assinado / publicação no Diário Oficial. */
  arquivo?: ArquivoEnviado | null;
  publicacao?: { veiculo?: string | null; data?: string | null } | null;
}

/** Contexto da formalização levado ao efeito do ato. */
interface ContextoFormalizacao {
  id: string;
  /** true → INSERT (efeito imediato); false → UPDATE da pendente (assinatura). */
  novo: boolean;
  modo: ModoFormalizacao;
  autoridade: AutoridadeDoAto;
  operador: AtorTransicao;
  operadorNome: string;
  arquivoAssinado?: string | null;
  dados?: Record<string, any> | null;
}

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
 *  - OPERADOR × AUTORIDADE (decisão 25/09/2026): o agente de contratação/
 *    pregoeiro (ou ADMIN/conta do órgão) REGISTRA adjudicar/homologar em nome
 *    da AUTORIDADE escolhida do cadastro do órgão; efeito conforme o modo do
 *    órgão (registro direto, assinatura eletrônica da autoridade, termo
 *    externo) e termo em PDF com os dados da autoridade — formalizacao/.
 *  - HOMOLOGAR (um método para TODAS as modalidades): autoridade escolhida,
 *    data (efeito do ato), valor = soma dos valores adjudicados
 *    (nunca do corpo), itens → HOMOLOGADO, sessão encerrada; depois do
 *    commit: contrato por vencedor (não SRP) ou gancho da ARP (SRP), PNCP e
 *    avisos. Efeito suspensivo dos recursos: pré-condição do ato (art. 168).
 */
@Injectable()
export class ResultadoService implements OnModuleInit {
  private readonly logger = new Logger(ResultadoService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly transicoes: TransicoesService,
    private readonly ranking: RankingService,
    private readonly contratos: ContratosService,
    private readonly notificacoes: NotificacoesService,
    @Inject(GERADOR_ATA_REGISTRO_PRECO) private readonly geradorAta: GeradorAtaRegistroPreco,
    private readonly formalizacao: FormalizacaoService,
  ) {}

  onModuleInit(): void {
    // Termo assinado pela autoridade (modo ASSINATURA_ELETRONICA) → efeito do ato
    this.formalizacao.registrarAoConcluir((docId, url) => this.aoConcluirAssinatura(docId, url));
  }

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
    const formalizacao = await this.painelFormalizacao(lic, ator ?? null);
    const bloqueios = [
      ...(formalizacao.operador.motivo ? [formalizacao.operador.motivo] : []),
      ...(formalizacao.pendente
        ? [`Há ${formalizacao.pendente.tipo === TipoFormalizacao.ADJUDICACAO ? 'adjudicação' : 'homologação'} aguardando a assinatura da autoridade ${formalizacao.pendente.autoridade_nome}.`]
        : []),
    ];
    const atoAdjudicar = lic.fase === FaseLicitacao.RECURSO ? ato(AtoLicitacao.DECIDIR_RECURSOS) : ato(AtoLicitacao.ADJUDICAR);
    const adjudicar = pelaSala && atoAdjudicar
      ? {
          disponivel: atoAdjudicar.disponivel && !!previa && previa.pendencias.length === 0 && previa.unidades.length > 0 && bloqueios.length === 0,
          pendencias: [...atoAdjudicar.pendencias, ...(previa?.pendencias ?? []), ...bloqueios],
        }
      : null;
    const homologar = ato(AtoLicitacao.HOMOLOGAR);

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
              disponivel: homologar.disponivel && bloqueios.length === 0,
              pendencias: [...homologar.pendencias, ...bloqueios],
            }
          : null,
      },
      /** Autoridade padrão (quem pratica o ato quando o operador não escolhe outra). */
      autoridade: formalizacao.autoridadePadrao ? { nome: formalizacao.autoridadePadrao.nome, cargo: formalizacao.autoridadePadrao.cargo } : null,
      formalizacao,
      instrumentos: { tipo: (lic as any).srp ? 'ATA' : 'CONTRATO', contratos, atas },
    };
  }

  /** Bloco da formalização no painel: modo, autoridades, operador, registros e pendência. */
  private async painelFormalizacao(lic: Licitacao, ator: Ator | null) {
    const orgaoId = String(lic.orgao_id);
    const modo = await this.formalizacao.modoDoOrgao(orgaoId);
    const autoridades = await this.formalizacao.listarAutoridades(orgaoId);
    const autoridadePadrao = await this.formalizacao.autoridadeDoAto(orgaoId, null);
    const regs = await this.dataSource.getRepository(FormalizacaoResultado).find({
      where: { licitacao_id: lic.id },
      order: { created_at: 'DESC' },
    });
    const registros = [];
    for (const f of regs) {
      registros.push({
        id: f.id,
        tipo: f.tipo,
        modo: f.modo,
        status: f.status,
        autoridade_nome: f.autoridade_nome,
        autoridade_cargo: f.autoridade_cargo,
        autoridade_ato_delegacao_numero: f.autoridade_ato_delegacao_numero,
        autoridade_ato_delegacao_data: f.autoridade_ato_delegacao_data,
        operador_nome: f.operador_nome,
        operador_tipo: f.operador_tipo,
        valor_total: f.valor_total != null ? Number(f.valor_total) : null,
        created_at: f.created_at,
        efetivado_em: f.efetivado_em,
        erro: f.erro,
        tem_termo: !!f.arquivo_termo,
        tem_assinado: !!f.arquivo_assinado,
        publico: termoEhPublico(f, lic),
        assinatura: STATUS_EM_ANDAMENTO.includes(f.status) || f.status === StatusFormalizacao.FALHOU ? await this.formalizacao.situacaoAssinatura(f) : null,
      });
    }
    const operadorMotivo = ator ? motivoOperadorInvalido(ator) : null;
    return {
      modo,
      rotuloModo: ROTULO_MODO[modo],
      autoridades: autoridades.map((a) => ({
        id: a.id,
        nome: a.nome,
        cargo: a.cargo,
        padrao: a.padrao,
        tem_email: !!a.email,
        tem_cpf: !!a.cpf,
        ato_delegacao_numero: a.ato_delegacao_numero,
        ato_delegacao_data: a.ato_delegacao_data,
      })),
      autoridadePadrao,
      operador: { pode: !operadorMotivo, motivo: operadorMotivo },
      registros,
      pendente: registros.find((r) => STATUS_EM_ANDAMENTO.includes(r.status)) ?? null,
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

  // --------------------------------------------------------------------------
  // Registro do ato pelo OPERADOR × prática pela AUTORIDADE (art. 71 IV)
  // --------------------------------------------------------------------------

  /**
   * Preparação comum de ADJUDICAR/HOMOLOGAR: operador habilitado, modo do
   * órgão, autoridade (escolhida/padrão), nada pendente, e o que o modo exige
   * (e-mail da autoridade na assinatura; arquivo no termo externo).
   */
  private async prepararRegistro(lic: Licitacao, atorJwt: Ator, opts: OpcoesRegistroAto) {
    const invalido = motivoOperadorInvalido(atorJwt);
    if (invalido) throw new ForbiddenException(invalido);
    const orgaoId = String(lic.orgao_id);
    const modo = await this.formalizacao.modoDoOrgao(orgaoId);
    const autoridade = await this.formalizacao.autoridadeDoAto(orgaoId, opts.autoridadeId ?? null);
    const inapta = motivoAutoridadeInaptaParaModo(modo, autoridade);
    if (inapta) throw new BadRequestException(inapta);
    const efeito = efeitoDoRegistro(modo, !!opts.arquivo);
    if (efeito.efeito === 'RECUSADO') throw new BadRequestException(efeito.motivo);
    if (modo === ModoFormalizacao.TERMO_EXTERNO) {
      const arqInvalido = motivoArquivoExternoInvalido(opts.arquivo);
      if (arqInvalido) throw new BadRequestException(arqInvalido);
    }
    const [pend] = await this.dataSource.query(
      `SELECT tipo, autoridade_nome FROM formalizacoes_resultado WHERE licitacao_id = $1 AND status = ANY($2) LIMIT 1`,
      [lic.id, STATUS_EM_ANDAMENTO],
    );
    if (pend) {
      throw new ConflictException(
        `Já há ${pend.tipo === TipoFormalizacao.ADJUDICACAO ? 'adjudicação' : 'homologação'} aguardando a assinatura da autoridade ${pend.autoridade_nome} — ` +
          'aguarde a assinatura ou cancele o pedido antes de registrar outro ato.',
      );
    }
    const ctx: ContextoFormalizacao = {
      id: randomUUID(),
      novo: true,
      modo,
      autoridade,
      operador: atorTransicaoDe(atorJwt),
      operadorNome: await this.formalizacao.nomeOperador(atorJwt),
      dados: opts.publicacao && (opts.publicacao.veiculo || opts.publicacao.data) ? { publicacao: opts.publicacao } : null,
    };
    return { ctx, efeito: efeito.efeito };
  }

  /** Grava (INSERT no efeito imediato; UPDATE da pendente) a formalização EFETIVADA, na transação do ato. */
  private async gravarFormalizacaoEfetivada(
    m: EntityManager,
    lic: Licitacao,
    tipo: TipoFormalizacao,
    f: ContextoFormalizacao,
    valor: number,
    motivo: string | null,
  ): Promise<void> {
    if (f.novo) {
      await m.getRepository(FormalizacaoResultado).insert(this.novaFormalizacao(lic, tipo, f, StatusFormalizacao.EFETIVADO, valor, motivo, true));
      return;
    }
    await m.query(
      `UPDATE formalizacoes_resultado SET status = $2, efetivado_em = now(), erro = NULL, valor_total = $3, updated_at = now() WHERE id = $1`,
      [f.id, StatusFormalizacao.EFETIVADO, valor],
    );
  }

  private novaFormalizacao(
    lic: Licitacao,
    tipo: TipoFormalizacao,
    f: ContextoFormalizacao,
    status: StatusFormalizacao,
    valor: number | null,
    motivo: string | null,
    efetivado: boolean,
  ): Partial<FormalizacaoResultado> {
    const a = f.autoridade;
    return {
      id: f.id,
      licitacao_id: lic.id,
      orgao_id: String(lic.orgao_id),
      tipo,
      modo: f.modo,
      status,
      autoridade_id: a.id,
      autoridade_nome: a.nome,
      autoridade_cargo: a.cargo,
      autoridade_cpf: a.cpf,
      autoridade_email: a.email,
      autoridade_ato_delegacao_numero: a.ato_delegacao_numero,
      autoridade_ato_delegacao_data: a.ato_delegacao_data,
      operador_tipo: f.operador.tipo,
      operador_id: f.operador.id,
      operador_nome: f.operadorNome,
      motivo,
      valor_total: valor,
      dados: f.dados ?? null,
      arquivo_assinado: f.arquivoAssinado ?? null,
      efetivado_em: efetivado ? new Date() : null,
    };
  }

  /** Registro da trilha (transição): autoridade que pratica × operador que registrou. */
  private registroDoAto(f: ContextoFormalizacao) {
    return {
      origem: 'resultado',
      autoridade: {
        id: f.autoridade.id,
        nome: f.autoridade.nome,
        cargo: f.autoridade.cargo,
        ato_delegacao_numero: f.autoridade.ato_delegacao_numero,
        ato_delegacao_data: f.autoridade.ato_delegacao_data,
      },
      operador: { tipo: f.operador.tipo, id: f.operador.id, nome: f.operadorNome },
      formalizacao_id: f.id,
      modo: f.modo,
    };
  }

  /** Depois do efeito (REGISTRO_DIRETO/TERMO_EXTERNO): gera e guarda o termo — falha não desfaz o ato. */
  private async gerarTermoDoAto(formalizacaoId: string): Promise<void> {
    try {
      const f = await this.dataSource.getRepository(FormalizacaoResultado).findOne({ where: { id: formalizacaoId } });
      if (!f || f.arquivo_termo) return;
      const dados = await this.formalizacao.dadosDoTermo(f.licitacao_id, { ...f, autoridade: this.formalizacao.autoridadeDaFormalizacao(f) });
      const { buffer } = this.formalizacao.gerarPdf(dados);
      await this.formalizacao.gravarTermo(f, buffer);
    } catch (e: any) {
      this.logger.error(`Termo da formalização ${formalizacaoId} não gerado: ${e?.message ?? e}`);
    }
  }

  /**
   * ASSINATURA_ELETRONICA: cria o ato PENDENTE com o termo (prévia dos valores)
   * no assinador, tendo a autoridade como signatária. O efeito só vem com a
   * assinatura (`aoConcluirAssinatura`).
   */
  private async criarPendente(lic: Licitacao, tipo: TipoFormalizacao, f: ContextoFormalizacao, valor: number, motivo: string | null, plano: PlanoParaTermo | null) {
    const repo = this.dataSource.getRepository(FormalizacaoResultado);
    await this.dataSource.transaction(async (m) => {
      // um pedido por licitação (dois cliques simultâneos)
      await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`formalizacao:${lic.id}`]);
      const [pend] = await m.query(`SELECT 1 FROM formalizacoes_resultado WHERE licitacao_id = $1 AND status = ANY($2) LIMIT 1`, [lic.id, STATUS_EM_ANDAMENTO]);
      if (pend) throw new ConflictException('Já há um ato do resultado aguardando a assinatura da autoridade.');
      const dados = { ...(f.dados ?? {}), ...(plano ? { plano } : {}), motivo };
      await m.getRepository(FormalizacaoResultado).insert({
        ...this.novaFormalizacao(lic, tipo, { ...f, dados }, StatusFormalizacao.PENDENTE_ASSINATURA, valor, motivo, false),
      });
    });
    const reg = (await repo.findOne({ where: { id: f.id } }))!;
    try {
      const dadosTermo = await this.formalizacao.dadosDoTermo(lic.id, { ...reg, autoridade: f.autoridade }, { plano });
      const { buffer, ultimaPagina } = this.formalizacao.gerarPdf(dadosTermo);
      const rel = await this.formalizacao.gravarTermo(reg, buffer);
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const criadoPor = f.operador.id && uuid.test(String(f.operador.id)) ? String(f.operador.id) : String(lic.orgao_id);
      const doc = await this.formalizacao.criarDocumentoAssinatura(reg, rel, ultimaPagina, criadoPor, lic);
      await this.dataSource.query(`UPDATE formalizacoes_resultado SET documento_assinatura_id = $2, updated_at = now() WHERE id = $1`, [reg.id, doc.id]);
      this.logger.log(`[${lic.numero_processo}] ${tipo} registrada por ${f.operadorNome} — aguardando a assinatura de ${f.autoridade.nome}`);
    } catch (e: any) {
      await this.dataSource.query(`UPDATE formalizacoes_resultado SET status = $2, erro = $3, updated_at = now() WHERE id = $1`, [
        reg.id,
        StatusFormalizacao.CANCELADO,
        `Termo não enviado ao assinador: ${e?.message ?? e}`,
      ]);
      throw e;
    }
  }

  // ==========================================================================
  // ADJUDICAR (sala — pregão/concorrência)
  // ==========================================================================

  /**
   * ADJUDICAR registrado pelo operador (agente de contratação/pregoeiro, ADMIN
   * ou conta do órgão) em nome da AUTORIDADE escolhida (art. 71 IV). Efeito
   * conforme o modo do órgão: imediato (registro direto / termo externo
   * enviado) ou pendente da assinatura da autoridade.
   */
  async adjudicar(licitacaoId: string, atorJwt: Ator, opts: OpcoesRegistroAto = {}) {
    const lic = await this.licitacao(licitacaoId);
    if (!ResultadoService.adjudicaPelaSala(lic.modalidade)) {
      throw new BadRequestException(
        lic.modalidade === ModalidadeLicitacao.DISPENSA_ELETRONICA
          ? 'Na dispensa eletrônica a adjudicação é feita pelo julgamento (POST /licitacoes/:id/julgar-dispensa).'
          : 'Nesta modalidade o resultado é registrado pelo resultado externo (POST /licitacoes/:id/resultado-externo).',
      );
    }
    const { ctx, efeito } = await this.prepararRegistro(lic, atorJwt, opts);
    const ato = lic.fase === FaseLicitacao.RECURSO ? AtoLicitacao.DECIDIR_RECURSOS : AtoLicitacao.ADJUDICAR;
    const motivo = (opts.motivo ?? '').trim() || null;

    if (efeito === 'AGUARDA_ASSINATURA') {
      await this.transicoes.verificar(licitacaoId, ato, { ator: ctx.operador, motivo: motivo ?? undefined });
      const plano = await this.planoAdjudicacao(licitacaoId);
      this.assertPlano(plano);
      const valor = arred(plano.unidades.reduce((s, e) => s + e.valores.reduce((x, v) => x + v.valorTotal, 0), 0), 2);
      await this.criarPendente(lic, TipoFormalizacao.ADJUDICACAO, ctx, valor, motivo, { unidades: plano.unidades });
      return this.painel(licitacaoId, atorJwt);
    }

    const arquivoRel = opts.arquivo ? this.formalizacao.gravarArquivoExterno(lic.id, ctx.id, opts.arquivo) : null;
    try {
      await this.efetivarAdjudicacao(licitacaoId, { ...ctx, arquivoAssinado: arquivoRel }, { motivo, usuarioNome: opts.usuarioNome ?? null });
    } catch (e) {
      this.apagarArquivo(arquivoRel);
      throw e;
    }
    await this.gerarTermoDoAto(ctx.id);
    return this.painel(licitacaoId, atorJwt);
  }

  private assertPlano(plano: PlanoAdjudicacao) {
    if (plano.pendencias.length) {
      throw new BadRequestException({
        message: plano.pendencias.length === 1 ? plano.pendencias[0] : `Pendências para adjudicar: ${plano.pendencias.join(' | ')}`,
        pendencias: plano.pendencias,
      });
    }
    if (!plano.unidades.length) throw new BadRequestException('Nenhuma unidade com vencedor habilitado para adjudicar.');
  }

  private apagarArquivo(rel: string | null) {
    if (!rel) return;
    try {
      const p = this.formalizacao.caminhoFisico(rel);
      if (p) require('fs').unlinkSync(p);
    } catch {
      /* arquivo órfão não é problema */
    }
  }

  /**
   * EFEITO da adjudicação (transação do ato): vencedores e itens ADJUDICADO,
   * sala → HOMOLOGACAO, eventos e a formalização EFETIVADA. `planoAssinado`
   * (assinatura eletrônica): o resultado precisa ser o MESMO que a autoridade
   * assinou — senão o ato não produz efeito.
   */
  private async efetivarAdjudicacao(
    licitacaoId: string,
    f: ContextoFormalizacao,
    opts: { motivo?: string | null; usuarioNome?: string | null; planoAssinado?: PlanoParaTermo | null },
  ) {
    const lic0 = await this.licitacao(licitacaoId);
    const ato = lic0.fase === FaseLicitacao.RECURSO ? AtoLicitacao.DECIDIR_RECURSOS : AtoLicitacao.ADJUDICAR;
    let gravadas: Awaited<ReturnType<ResultadoService['gravarAdjudicacao']>> = [];
    await this.transicoes.executar(licitacaoId, ato, {
      ator: f.operador,
      motivo: opts.motivo ?? undefined,
      registro: this.registroDoAto(f),
      aplicar: async (l, m) => {
        const plano = await this.planoAdjudicacao(licitacaoId, m);
        this.assertPlano(plano);
        if (opts.planoAssinado && !ResultadoService.mesmoPlano(opts.planoAssinado, plano)) {
          throw new ConflictException(
            'O resultado mudou depois que a autoridade assinou o termo (vencedor ou valores diferentes) — cancele e registre a adjudicação novamente.',
          );
        }
        gravadas = await this.gravarAdjudicacao(m, licitacaoId, plano.unidades, f.operador, 'SALA');
        const total = arred(gravadas.reduce((s, g) => s + g.valorTotal, 0), 2);
        await this.gravarFormalizacaoEfetivada(m, l, TipoFormalizacao.ADJUDICACAO, f, total, opts.motivo ?? null);

        // Sala: etapa HOMOLOGACAO + registro na ata da sessão
        const [sessao] = (await this.sessoes(m, licitacaoId)).filter((s) => s.status !== StatusSessao.ENCERRADA);
        if (sessao) {
          await m.query(`UPDATE sessoes_disputa SET etapa = $2, updated_at = now() WHERE id = $1`, [sessao.id, EtapaSessao.HOMOLOGACAO]);
          const usuario = opts.usuarioNome ?? f.operadorNome ?? sessao.pregoeiro_nome ?? null;
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
          await this.evento(m, {
            sessaoId: sessao.id,
            tipo: TipoEvento.LICITACAO_ADJUDICADA,
            descricao:
              `Licitação adjudicada por ${f.autoridade.nome} (${f.autoridade.cargo}): ${gravadas.length} unidade(s), ${brl(total)} ` +
              `(art. 71 IV, Lei 14.133/2021) — registrado por ${f.operadorNome}.`,
            usuario,
            valor: total,
            dados: { unidades: gravadas.length, autoridade: f.autoridade, operador: f.operadorNome, formalizacao_id: f.id },
          });
        }
      },
    });
    this.logger.log(`[${lic0.numero_processo}] adjudicada: ${gravadas.length} unidade(s) — autoridade ${f.autoridade.nome}, operador ${f.operadorNome}`);
  }

  /** Mesmo vencedor e mesmos valores por item (plano assinado × plano atual). */
  static mesmoPlano(a: PlanoParaTermo, b: PlanoParaTermo): boolean {
    const chave = (p: PlanoParaTermo) =>
      p.unidades
        .flatMap((u) => u.valores.map((v) => `${u.unidadeId}|${u.fornecedorId}|${v.itemId}|${arred(Number(v.valorTotal), 2)}`))
        .sort()
        .join(';');
    return chave(a) === chave(b);
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
   * HOMOLOGAR registrado pelo operador em nome da AUTORIDADE escolhida (art.
   * 71 IV): valor = soma dos valores adjudicados; itens → HOMOLOGADO; sessão
   * encerrada; depois do efeito: contrato(s) ou ARP, PNCP e avisos (falhas
   * não desfazem a homologação). Modo ASSINATURA_ELETRONICA: pendente até a
   * autoridade assinar o Termo de Adjudicação e Homologação.
   */
  async homologar(licitacaoId: string, atorJwt: Ator, opts: OpcoesRegistroAto = {}) {
    const lic0 = await this.licitacao(licitacaoId);
    const { ctx, efeito } = await this.prepararRegistro(lic0, atorJwt, opts);

    if (efeito === 'AGUARDA_ASSINATURA') {
      await this.transicoes.verificar(licitacaoId, AtoLicitacao.HOMOLOGAR, { ator: ctx.operador });
      const itens: any[] = await this.dataSource.query(
        `SELECT status::text AS status, fornecedor_vencedor_id, valor_total_homologado FROM itens_licitacao WHERE licitacao_id = $1`,
        [licitacaoId],
      );
      const valor = valorHomologado(itens);
      if (!(valor > 0)) throw new BadRequestException('Nenhum item adjudicado com valor — adjudique o resultado antes de homologar (art. 71 IV).');
      await this.criarPendente(lic0, TipoFormalizacao.HOMOLOGACAO, ctx, valor, null, null);
      const f = await this.dataSource.getRepository(FormalizacaoResultado).findOne({ where: { id: ctx.id } });
      return {
        licitacao_id: lic0.id,
        fase: lic0.fase,
        pendente_assinatura: true,
        valorHomologado: null,
        valorAHomologar: valor,
        autoridade: { nome: ctx.autoridade.nome, cargo: ctx.autoridade.cargo },
        operador: ctx.operadorNome,
        formalizacao: { id: ctx.id, status: f?.status, documento_assinatura_id: f?.documento_assinatura_id ?? null },
        instrumentos: null,
      };
    }

    const arquivoRel = opts.arquivo ? this.formalizacao.gravarArquivoExterno(lic0.id, ctx.id, opts.arquivo) : null;
    let r: Awaited<ReturnType<ResultadoService['efetivarHomologacao']>>;
    try {
      r = await this.efetivarHomologacao(licitacaoId, { ...ctx, arquivoAssinado: arquivoRel });
    } catch (e) {
      this.apagarArquivo(arquivoRel);
      throw e;
    }
    await this.gerarTermoDoAto(ctx.id);
    return { ...r, pendente_assinatura: false, operador: ctx.operadorNome, formalizacao: { id: ctx.id, status: StatusFormalizacao.EFETIVADO } };
  }

  /** EFEITO da homologação (transação do ato) + instrumentos e efeitos externos depois do commit. */
  private async efetivarHomologacao(licitacaoId: string, f: ContextoFormalizacao, opts: { valorAssinado?: number | null } = {}) {
    const autoridade = { nome: f.autoridade.nome, cargo: f.autoridade.cargo };
    let valor = 0;
    let itensHomologados = 0;
    const lic = await this.transicoes.executar(licitacaoId, AtoLicitacao.HOMOLOGAR, {
      ator: f.operador,
      registro: this.registroDoAto(f),
      aplicar: async (l, m) => {
        const itens: any[] = await m.query(
          `SELECT id, status::text AS status, fornecedor_vencedor_id, valor_total_homologado FROM itens_licitacao WHERE licitacao_id = $1`,
          [licitacaoId],
        );
        valor = valorHomologado(itens);
        if (!(valor > 0)) {
          throw new BadRequestException('Nenhum item adjudicado com valor — adjudique o resultado antes de homologar (art. 71 IV).');
        }
        if (opts.valorAssinado != null && arred(Number(opts.valorAssinado), 2) !== valor) {
          throw new ConflictException(
            `O valor a homologar mudou depois da assinatura da autoridade (${brl(Number(opts.valorAssinado))} assinado × ${brl(valor)} atual) — cancele e registre de novo.`,
          );
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
        await this.gravarFormalizacaoEfetivada(m, l, TipoFormalizacao.HOMOLOGACAO, f, valor, null);

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
              `valor total ${brl(valor)} (art. 71 IV, Lei 14.133/2021) — registrado por ${f.operadorNome}.`,
            usuario: autoridade.nome,
            valor,
            dados: { autoridade, itensHomologados, valorTotal: valor, operador: f.operadorNome, formalizacao_id: f.id },
          });
        }
      },
    });

    const instrumentos = await this.gerarInstrumentosSemFalhar(licitacaoId, f.operador);
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
  // ASSINATURA DA AUTORIDADE (ouvinte do assinador) · CANCELAR · REPROCESSAR
  // ==========================================================================

  /**
   * Última assinatura do termo (a da autoridade) → o ato produz efeito:
   * ADJUDICAR/HOMOLOGAR pela máquina (com o operador que registrou), contrato
   * ou ata. Idempotente (trava pelo status); falha → FALHOU com o motivo.
   */
  async aoConcluirAssinatura(documentoId: string, arquivoAssinadoUrl?: string): Promise<void> {
    const rows: any[] = await this.dataSource.query(
      `UPDATE formalizacoes_resultado SET status = $3, arquivo_assinado = COALESCE($2, arquivo_assinado), updated_at = now()
        WHERE documento_assinatura_id = $1 AND status = $4 RETURNING id`,
      [documentoId, arquivoAssinadoUrl || null, StatusFormalizacao.EFETIVANDO, StatusFormalizacao.PENDENTE_ASSINATURA],
    );
    const lista = Array.isArray(rows[0]) ? rows[0] : rows;
    const id = lista?.[0]?.id;
    if (!id) return;
    await this.efetivarPendente(String(id));
  }

  private async efetivarPendente(formalizacaoId: string): Promise<void> {
    const f = await this.dataSource.getRepository(FormalizacaoResultado).findOne({ where: { id: formalizacaoId } });
    if (!f) return;
    const ctx: ContextoFormalizacao = {
      id: f.id,
      novo: false,
      modo: f.modo as ModoFormalizacao,
      autoridade: this.formalizacao.autoridadeDaFormalizacao(f),
      operador: { tipo: f.operador_tipo as AtorTransicao['tipo'], id: f.operador_id },
      operadorNome: f.operador_nome,
      arquivoAssinado: f.arquivo_assinado,
      dados: f.dados,
    };
    try {
      if (f.tipo === TipoFormalizacao.ADJUDICACAO) {
        await this.efetivarAdjudicacao(f.licitacao_id, ctx, { motivo: f.motivo, planoAssinado: (f.dados?.plano as PlanoParaTermo) ?? null });
      } else {
        await this.efetivarHomologacao(f.licitacao_id, ctx, { valorAssinado: f.valor_total != null ? Number(f.valor_total) : null });
      }
      this.logger.log(`Formalização ${f.id} (${f.tipo}) efetivada pela assinatura de ${f.autoridade_nome}`);
    } catch (e: any) {
      const msg = String(e?.response?.message ?? e?.message ?? e);
      await this.dataSource.query(`UPDATE formalizacoes_resultado SET status = $2, erro = $3, updated_at = now() WHERE id = $1`, [
        f.id,
        StatusFormalizacao.FALHOU,
        msg.slice(0, 2000),
      ]);
      this.logger.warn(`Formalização ${f.id} (${f.tipo}) assinada, mas o efeito falhou: ${msg}`);
    }
  }

  private async formalizacaoDoOrgao(formalizacaoId: string, ator: Ator): Promise<FormalizacaoResultado> {
    const f = await this.dataSource.getRepository(FormalizacaoResultado).findOne({ where: { id: formalizacaoId } });
    if (!f) throw new NotFoundException('Formalização não encontrada');
    if (!ator.admin && String(ator.orgaoId) !== String(f.orgao_id)) throw new NotFoundException('Formalização não encontrada');
    return f;
  }

  /** Cancela o pedido pendente (ou que falhou): o documento no assinador é cancelado; nenhum efeito. */
  async cancelarFormalizacao(formalizacaoId: string, ator: Ator, motivo?: string | null) {
    const invalido = motivoOperadorInvalido(ator);
    if (invalido) throw new ForbiddenException(invalido);
    const f = await this.formalizacaoDoOrgao(formalizacaoId, ator);
    if (![StatusFormalizacao.PENDENTE_ASSINATURA, StatusFormalizacao.FALHOU].includes(f.status as StatusFormalizacao)) {
      throw new ConflictException(`A formalização está ${f.status} — só se cancela a pendente de assinatura ou a que falhou.`);
    }
    if (f.status === StatusFormalizacao.PENDENTE_ASSINATURA) await this.formalizacao.cancelarDocumento(f);
    await this.dataSource.query(
      `UPDATE formalizacoes_resultado SET status = $2, erro = COALESCE($3, erro), updated_at = now() WHERE id = $1 AND status = $4`,
      [f.id, StatusFormalizacao.CANCELADO, motivo ? `Cancelado: ${String(motivo).slice(0, 500)}` : null, f.status],
    );
    return this.painel(f.licitacao_id, ator);
  }

  /** Assinado mas o efeito falhou (ex.: estado mudou e foi corrigido): tenta o efeito de novo. */
  async reprocessarFormalizacao(formalizacaoId: string, ator: Ator) {
    const invalido = motivoOperadorInvalido(ator);
    if (invalido) throw new ForbiddenException(invalido);
    const f = await this.formalizacaoDoOrgao(formalizacaoId, ator);
    if (f.status !== StatusFormalizacao.FALHOU) throw new ConflictException('Só se reprocessa a formalização assinada cujo efeito falhou.');
    const r: any[] = await this.dataSource.query(
      `UPDATE formalizacoes_resultado SET status = $2, updated_at = now() WHERE id = $1 AND status = $3 RETURNING id`,
      [f.id, StatusFormalizacao.EFETIVANDO, StatusFormalizacao.FALHOU],
    );
    const lista = Array.isArray(r[0]) ? r[0] : r;
    if (lista?.length) await this.efetivarPendente(f.id);
    return this.painel(f.licitacao_id, ator);
  }

  // ==========================================================================
  // TERMO: prévia, download (órgão dono) e consulta pública
  // ==========================================================================

  /** Prévia do termo (não grava nada): adjudicação = plano; homologação = itens adjudicados. */
  async previaTermo(licitacaoId: string, ator: Ator, tipo: string, autoridadeId?: string | null): Promise<Buffer> {
    const lic = await this.licitacao(licitacaoId);
    const t = tipo === TipoFormalizacao.ADJUDICACAO ? TipoFormalizacao.ADJUDICACAO : TipoFormalizacao.HOMOLOGACAO;
    const autoridade = await this.formalizacao.autoridadeDoAto(String(lic.orgao_id), autoridadeId ?? null);
    const modo = await this.formalizacao.modoDoOrgao(String(lic.orgao_id));
    let plano: PlanoParaTermo | null = null;
    if (t === TipoFormalizacao.ADJUDICACAO) {
      if (!ResultadoService.adjudicaPelaSala(lic.modalidade)) throw new BadRequestException('Nesta modalidade a adjudicação vem do julgamento — gere a prévia da homologação.');
      const p = await this.planoAdjudicacao(licitacaoId);
      this.assertPlano(p);
      plano = { unidades: p.unidades };
    }
    const dados = await this.formalizacao.dadosDoTermo(
      licitacaoId,
      {
        tipo: t,
        modo,
        status: 'PREVIA',
        operador_nome: await this.formalizacao.nomeOperador(ator),
        created_at: new Date(),
        efetivado_em: null,
        autoridade,
      },
      { plano, previa: true },
    );
    if (!dados.linhas.length) throw new BadRequestException('Nenhum item com vencedor para o termo — adjudique antes de gerar o termo de homologação.');
    return this.formalizacao.gerarPdf(dados).buffer;
  }

  /** Arquivo da formalização para o órgão dono: termo gerado ou assinado/enviado. */
  async arquivoFormalizacao(formalizacaoId: string, ator: Ator, versao: string): Promise<{ caminho: string; nome: string }> {
    const f = await this.formalizacaoDoOrgao(formalizacaoId, ator);
    return this.arquivoDe(f, versao);
  }

  private arquivoDe(f: FormalizacaoResultado, versao: string): { caminho: string; nome: string } {
    const rel = versao === 'termo' ? f.arquivo_termo : (f.arquivo_assinado ?? f.arquivo_termo);
    const caminho = this.formalizacao.caminhoFisico(rel);
    if (!rel || !caminho) throw new NotFoundException('Arquivo do termo não encontrado');
    return { caminho, nome: String(rel).split('/').pop() || 'termo.pdf' };
  }

  /** Termos PÚBLICOS da licitação: só depois da homologação e só atos efetivados. */
  async termosPublicos(licitacaoId: string) {
    const lic = await this.dataSource.getRepository(Licitacao).findOne({ where: { id: licitacaoId } });
    if (!lic || !lic.data_homologacao) return [];
    const regs = await this.dataSource.getRepository(FormalizacaoResultado).find({
      where: { licitacao_id: licitacaoId, status: StatusFormalizacao.EFETIVADO },
      order: { efetivado_em: 'ASC' },
    });
    return regs
      .filter((f) => termoEhPublico(f, lic) && (f.arquivo_termo || f.arquivo_assinado))
      .map((f) => ({
        id: f.id,
        tipo: f.tipo,
        titulo: f.tipo === TipoFormalizacao.ADJUDICACAO ? 'Termo de Adjudicação' : 'Termo de Adjudicação e Homologação',
        autoridade_nome: f.autoridade_nome,
        autoridade_cargo: f.autoridade_cargo,
        autoridade_ato_delegacao_numero: f.autoridade_ato_delegacao_numero,
        autoridade_ato_delegacao_data: f.autoridade_ato_delegacao_data,
        valor_total: f.valor_total != null ? Number(f.valor_total) : null,
        efetivado_em: f.efetivado_em,
        assinado: !!f.arquivo_assinado,
      }));
  }

  async arquivoPublico(formalizacaoId: string): Promise<{ caminho: string; nome: string }> {
    const f = await this.dataSource.getRepository(FormalizacaoResultado).findOne({ where: { id: formalizacaoId } });
    const lic = f ? await this.dataSource.getRepository(Licitacao).findOne({ where: { id: f.licitacao_id } }) : null;
    if (!f || !lic || !termoEhPublico(f, lic)) throw new NotFoundException('Termo não encontrado');
    return this.arquivoDe(f, 'oficial');
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

  /**
   * Aviso da demanda de origem. O PNCP (resultado por item + termo de
   * homologação) sai pela FILA disparada pelo ato HOMOLOGAR
   * (PncpFilaService.aoTransitar); o contrato só depois de assinado (art. 94).
   */
  private async efeitosExternosDaHomologacao(lic: Licitacao, instrumentos: { contratos: any[]; atas: any[] }): Promise<void> {
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
