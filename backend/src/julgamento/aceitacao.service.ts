import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { extname } from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { FaseLicitacao } from '../licitacoes/entities/licitacao.entity';
import { SessaoDisputa, EtapaSessao } from '../sessao/entities/sessao-disputa.entity';
import { EventoSessao, TipoEvento } from '../sessao/entities/evento-sessao.entity';
import { exigirLicitacaoAtiva } from '../sessao/licitacao-ativa';
import { ItemLicitacao, StatusItem } from '../itens/entities/item-licitacao.entity';
import { TransicoesService } from '../licitacoes/transicoes/transicoes.service';
import { AtoLicitacao, AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { ParametrosLicitacaoService } from '../parametros-licitacao/parametros-licitacao.service';
import { ModoDisputaService } from '../disputa-v2/modo-disputa.service';
import { BaseLance, valoresGravados } from '../disputa-v2/modelo-lance';
import { ordemSql } from '../disputa-v2/modos-disputa';
import { AceitacaoProposta } from './entities/aceitacao-proposta.entity';
import { RankingService, UnidadeJulgamento } from './ranking.service';
import {
  EntradaRanking,
  PRAZO_MINIMO_ACEITACAO_HORAS,
  STATUS_ACEITACAO_ATIVOS,
  SITUACOES_EXCLUIDAS,
  SITUACOES_PROPOSTA_ACEITA,
  SituacaoLicitante,
  StatusAceitacao,
  ValorReadequadoEntrada,
  alertaExequibilidade,
  atualDaUnidade,
  ehPropostaAceita,
  motivoNaoAceita,
  motivoNaoEnvia,
  motivoNaoProrroga,
  motivoNaoRecusa,
  motivoPrazoInvalido,
  prazoAte,
  prazoExpirado,
  validarValoresReadequados,
} from './regras-julgamento';

/** Arquivo da proposta adequada (PDF/JPG/PNG, até 10 MB). */
export interface ArquivoProposta {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const MIMES_PERMITIDOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
const EXTENSOES_PERMITIDAS = ['.pdf', '.jpg', '.jpeg', '.png'];
export const TAMANHO_MAXIMO_ARQUIVO = 10 * 1024 * 1024;

/**
 * GANCHO antes de convocar a aceitação numa unidade: devolve o motivo que
 * impede (ex.: "desempate ME/EPP pendente" — LC 123 art. 45) ou null.
 * A etapa ME/EPP registra o seu em `AceitacaoService.registrarGanchoAntesDaConvocacao`.
 */
export type GanchoAntesDaAceitacao = (ctx: {
  licitacaoId: string;
  sessaoId: string;
  unidade: UnidadeJulgamento;
  primeiro: EntradaRanking;
  manager: EntityManager;
}) => Promise<string | null> | string | null;

/**
 * GANCHO antes do ACEITE da proposta adequada: devolve o motivo que impede
 * (ex.: "proposta acima do preço máximo sem negociação" — Lei 14.133 art. 61;
 * IN 73 art. 30) ou null. A negociação registra o seu em
 * `AceitacaoService.registrarGanchoAntesDoAceite`.
 */
export type GanchoAntesDoAceite = (ctx: {
  aceitacao: AceitacaoProposta;
  unidade: UnidadeJulgamento;
  opts: { justificativaExequibilidade?: string | null; justificativaPrecoAcimaEstimado?: string | null };
  manager: EntityManager;
}) => Promise<string | null> | string | null;

/**
 * Pendência de um gancho (desempate do art. 60, ME/EPP...) que impede a
 * convocação: 409 no ato explícito; na convocação AUTOMÁTICA do próximo
 * (recusa/inabilitação) o ato principal segue e o próximo fica aguardando
 * (evento na sala) — a unidade NÃO fracassa por isso.
 */
export class PendenciaAntesDaAceitacao extends ConflictException {}

/** Etapas da sessão das quais a convocação para a aceitação leva a sala à etapa ACEITACAO_PROPOSTA. */
const ETAPAS_QUE_VAO_A_ACEITACAO: string[] = [
  EtapaSessao.NEGOCIACAO,
  EtapaSessao.BENEFICIO_MPE,
  EtapaSessao.CONVOCACAO_HABILITACAO,
  EtapaSessao.ANALISE_HABILITACAO,
  EtapaSessao.DISPUTA_LANCES,
  EtapaSessao.RANDOM_ENCERRAMENTO,
];

const brl = (v: number) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;
const dataHora = (d: Date) =>
  new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * ============================================================================
 * ACEITAÇÃO DA PROPOSTA (plano E3 item 2 — IN SEGES 73/2022 art. 29; Lei
 * 14.133/2021 art. 59)
 * ============================================================================
 *
 * Etapa de cada UNIDADE (item ou lote) depois dos lances:
 *   lances encerrados → [desempate ME/EPP — gancho] → ACEITAÇÃO → [negociação] → habilitação
 *
 *  - o agente de contratação CONVOCA o licitante na vez (ranking único) a
 *    enviar a proposta adequada ao último lance, com prazo ≥ 2 h (parâmetro
 *    do órgão), prorrogável UMA vez pelo mesmo período, de ofício ou a pedido;
 *  - o licitante ENVIA o arquivo + os valores por item (soma ≤ último lance;
 *    no lote, cada item ≤ o rateio do lance);
 *  - o agente ACEITA (licitante ACEITO) ou RECUSA com motivo (RECUSADO — sai
 *    do ranking e o próximo é convocado automaticamente; sem próximo, a
 *    unidade fracassa). Prazo vencido sem envio → pode recusar;
 *  - exequibilidade (art. 59 §4º; IN 73 art. 34): alerta que exige
 *    justificativa no aceite — nunca bloqueio automático.
 * A licitação fica em JULGAMENTO enquanto houver aceitação; a habilitação
 * (INICIAR_HABILITACAO) só começa com TODAS as unidades resolvidas
 * (pré-condição da máquina de estados). Cada ato vira evento da sessão (ata).
 */
@Injectable()
export class AceitacaoService {
  private readonly logger = new Logger(AceitacaoService.name);
  private readonly ganchos: GanchoAntesDaAceitacao[] = [];

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly ranking: RankingService,
    private readonly transicoes: TransicoesService,
    private readonly parametros: ParametrosLicitacaoService,
    private readonly modos: ModoDisputaService,
  ) {}

  /** GANCHO da etapa ME/EPP (e outras): impede a convocação enquanto houver pendência na unidade. */
  registrarGanchoAntesDaConvocacao(fn: GanchoAntesDaAceitacao): void {
    this.ganchos.push(fn);
  }

  private readonly ganchosAceite: GanchoAntesDoAceite[] = [];

  /** GANCHO da negociação (e outras): impede o aceite (ex.: preço acima do máximo sem negociar). */
  registrarGanchoAntesDoAceite(fn: GanchoAntesDoAceite): void {
    this.ganchosAceite.push(fn);
  }

  // ==========================================================================
  // LEITURAS
  // ==========================================================================

  private async sessao(sessaoId: string, manager?: EntityManager): Promise<SessaoDisputa> {
    const s = await (manager ?? this.dataSource.manager).findOne(SessaoDisputa, { where: { id: sessaoId } });
    if (!s) throw new NotFoundException('Sessão não encontrada');
    return s;
  }

  /** Prazo mínimo do órgão (nunca abaixo das 2 h legais). */
  async prazoMinimoHoras(licitacaoId: string, manager?: EntityManager): Promise<number> {
    const [l] = await (manager ?? this.dataSource.manager).query(`SELECT orgao_id FROM licitacoes WHERE id = $1`, [licitacaoId]);
    const p = await this.parametros.resolver(l?.orgao_id).catch(() => null);
    const valor = Number((p as any)?.prazo_proposta_adequada_horas);
    return Math.max(PRAZO_MINIMO_ACEITACAO_HORAS, Number.isFinite(valor) && valor > 0 ? valor : PRAZO_MINIMO_ACEITACAO_HORAS);
  }

  private async aceitacoesDaLicitacao(licitacaoId: string, manager?: EntityManager): Promise<AceitacaoProposta[]> {
    return (manager ?? this.dataSource.manager).find(AceitacaoProposta, {
      where: { licitacao_id: licitacaoId },
      order: { convocada_em: 'ASC' },
    });
  }

  private async nomes(ids: string[]): Promise<Map<string, { razaoSocial: string; cpfCnpj: string; porte: string | null }>> {
    const validos = [...new Set(ids.filter(Boolean))];
    if (!validos.length) return new Map();
    const rows: any[] = await this.dataSource.query(
      `SELECT id::text AS id, razao_social, cpf_cnpj, porte::text AS porte FROM fornecedores WHERE id::text = ANY($1)`,
      [validos],
    );
    return new Map(rows.map((r) => [r.id, { razaoSocial: r.razao_social, cpfCnpj: r.cpf_cnpj, porte: r.porte ?? null }]));
  }

  private visaoAceitacao(a: AceitacaoProposta, agora = new Date()) {
    return {
      id: a.id,
      unidadeId: a.unidade_id,
      tipoUnidade: a.tipo_unidade,
      fornecedorId: a.fornecedor_id,
      status: a.status,
      convocadaEm: a.convocada_em,
      prazoHoras: Number(a.prazo_horas),
      prazoAte: a.prazo_ate,
      prazoExpirado: a.status === StatusAceitacao.AGUARDANDO_ENVIO && prazoExpirado(a, agora),
      segundosRestantes: Math.max(0, Math.floor((new Date(a.prazo_ate).getTime() - agora.getTime()) / 1000)),
      prorrogadaEm: a.prorrogada_em,
      prorrogacaoOrigem: a.prorrogacao_origem,
      prorrogacaoMotivo: a.prorrogacao_motivo,
      podeProrrogar: !motivoNaoProrroga(a, agora),
      pedidoProrrogacaoEm: a.pedido_prorrogacao_em,
      pedidoProrrogacaoMotivo: a.pedido_prorrogacao_motivo,
      limites: a.limites,
      enviadaEm: a.enviada_em,
      valoresItens: a.valores_itens,
      valorTotalReadequado: a.valor_total_readequado != null ? Number(a.valor_total_readequado) : null,
      observacaoFornecedor: a.observacao_fornecedor,
      arquivo: a.arquivo_nome
        ? { nome: a.arquivo_nome, mime: a.arquivo_mime, tamanho: a.arquivo_tamanho, sha256: a.arquivo_sha256 }
        : null,
      alertaExequibilidade: a.alerta_exequibilidade,
      justificativaExequibilidade: a.justificativa_exequibilidade,
      decididaEm: a.decidida_em,
      decisaoMotivo: a.decisao_motivo,
    };
  }

  /**
   * Painel do agente (órgão dono): por unidade, o ranking único com a
   * situação de cada licitante, a convocação atual e o histórico.
   */
  async painel(sessaoId: string) {
    const sessao = await this.sessao(sessaoId);
    const licitacaoId = sessao.licitacao_id;
    const [lic] = await this.dataSource.query(`SELECT fase::text AS fase, situacao::text AS situacao FROM licitacoes WHERE id = $1`, [licitacaoId]);
    const rankings = await this.ranking.rankingsDaLicitacao(licitacaoId);
    const aceitacoes = await this.aceitacoesDaLicitacao(licitacaoId);
    const ids = rankings.flatMap((r) => r.ranking.map((e) => e.fornecedorId));
    const cadastro = await this.nomes(ids);
    const agora = new Date();

    const unidades = rankings.map(({ unidade, ranking }) => {
      const doUnidade = aceitacoes.filter((a) => a.unidade_id === unidade.id);
      const ativa = doUnidade.find((a) => STATUS_ACEITACAO_ATIVOS.includes(a.status)) ?? null;
      const atual = atualDaUnidade(ranking);
      const comResultado = RankingService.unidadeComResultadoPossivel(unidade);
      const resolvida = !comResultado || ranking.length === 0 || (!!atual && ehPropostaAceita(atual.situacao));
      return {
        tipo: unidade.tipo,
        id: unidade.id,
        numero: unidade.numero,
        descricao: unidade.descricao,
        encerrada: unidade.encerrada,
        itens: unidade.itens,
        statusResultado: comResultado ? null : unidade.itens.map((i) => i.status)[0],
        resolvida,
        podeConvocar:
          unidade.encerrada && comResultado && !ativa && !!atual && !ehPropostaAceita(atual.situacao) && lic?.fase === FaseLicitacao.JULGAMENTO &&
          !atual.desempate?.pendente,
        ranking: ranking.map((e) => ({
          posicao: e.posicao,
          fornecedorId: e.fornecedorId,
          razaoSocial: cadastro.get(e.fornecedorId)?.razaoSocial ?? e.fornecedorNome,
          cpfCnpj: cadastro.get(e.fornecedorId)?.cpfCnpj ?? '',
          porte: cadastro.get(e.fornecedorId)?.porte ?? null,
          melhorValor: e.melhorValor,
          situacao: e.situacao,
          excluido: e.excluido,
          empatado: !!e.empatado,
          // Critérios pontuados (nota/índice) e desempate do art. 60 (julgamento técnico / desempate.service)
          criterio: e.criterio ?? null,
          desempate: e.desempate ?? null,
        })),
        atual: atual ? { fornecedorId: atual.fornecedorId, situacao: atual.situacao } : null,
        aceitacaoAtual: ativa ? { ...this.visaoAceitacao(ativa, agora), razaoSocial: cadastro.get(ativa.fornecedor_id)?.razaoSocial ?? null } : null,
        historico: doUnidade.map((a) => ({ ...this.visaoAceitacao(a, agora), razaoSocial: cadastro.get(a.fornecedor_id)?.razaoSocial ?? null })),
      };
    });
    const pendentes = unidades.filter((u) => u.encerrada && !u.resolvida).map((u) => `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`);
    return {
      sessaoId,
      licitacaoId,
      etapa: sessao.etapa,
      faseLicitacao: lic?.fase ?? null,
      prazoMinimoHoras: await this.prazoMinimoHoras(licitacaoId),
      todasResolvidas: unidades.length > 0 && unidades.every((u) => u.resolvida),
      pendentes,
      unidades,
    };
  }

  /**
   * Visão do LICITANTE: só as próprias convocações (unidade, itens, limites,
   * prazo, status). Nada do ranking nem das propostas dos outros.
   */
  async minhas(sessaoId: string, fornecedorId: string) {
    const sessao = await this.sessao(sessaoId);
    const lista = await this.dataSource.manager.find(AceitacaoProposta, {
      where: { sessao_id: sessao.id, fornecedor_id: fornecedorId },
      order: { convocada_em: 'ASC' },
    });
    const unidades = await this.ranking.unidades(sessao.licitacao_id);
    const agora = new Date();
    return {
      sessaoId,
      licitacaoId: sessao.licitacao_id,
      convocacoes: lista.map((a) => {
        const u = unidades.find((x) => x.id === a.unidade_id);
        return {
          ...this.visaoAceitacao(a, agora),
          podeEnviar: !motivoNaoEnvia(a, agora),
          podePedirProrrogacao: a.status === StatusAceitacao.AGUARDANDO_ENVIO && !a.prorrogada_em && !a.pedido_prorrogacao_em && !prazoExpirado(a, agora),
          unidade: u ? { tipo: u.tipo, id: u.id, numero: u.numero, descricao: u.descricao, itens: u.itens } : null,
        };
      }),
    };
  }

  // ==========================================================================
  // GUARDAS
  // ==========================================================================

  /**
   * Transação do ato: licitação ATIVA (FOR SHARE — um SUSPENDER concorrente
   * espera) e em JULGAMENTO; trava a unidade (advisory lock) para dois atos
   * na mesma unidade não se cruzarem.
   */
  private async prepararAto(m: EntityManager, sessao: SessaoDisputa, unidadeId: string): Promise<void> {
    const lic = await exigirLicitacaoAtiva(m, sessao.licitacao_id, { bloquear: true });
    if (lic.fase !== FaseLicitacao.JULGAMENTO) {
      throw new ConflictException(
        `A aceitação de propostas ocorre no julgamento (depois da etapa de lances); a licitação está em ${lic.fase}.`,
      );
    }
    await m.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`aceitacao:${unidadeId}`]);
  }

  private async aceitacaoDaSessao(m: EntityManager, sessaoId: string, aceitacaoId: string, travar = true): Promise<AceitacaoProposta> {
    const a = await m.findOne(AceitacaoProposta, {
      where: { id: aceitacaoId, sessao_id: sessaoId },
      ...(travar ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!a) throw new NotFoundException('Convocação não encontrada nesta sessão');
    return a;
  }

  private async evento(
    m: EntityManager,
    e: { sessaoId: string; tipo: TipoEvento; descricao: string; itemId?: string | null; fornecedorId?: string | null; usuario?: string; sistema?: boolean; dados?: Record<string, any>; valor?: number | null },
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
        is_sistema: e.sistema ?? true,
        dados_adicionais: e.dados,
      }),
    );
  }

  private rotulo(u: Pick<UnidadeJulgamento, 'tipo' | 'numero'>): string {
    return `${u.tipo === 'LOTE' ? 'Lote' : 'Item'} ${u.numero}`;
  }

  private async nomeFornecedor(m: EntityManager, fornecedorId: string): Promise<string> {
    const [f] = await m.query(`SELECT razao_social FROM fornecedores WHERE id::text = $1`, [fornecedorId]);
    return f?.razao_social ?? fornecedorId;
  }

  /**
   * Valor final do licitante na unidade (último lance, na direção do critério)
   * e o teto de cada item: no item, o próprio lance; no lote, o rateio do
   * lance do lote por item.
   */
  private async limitesDoLicitante(m: EntityManager, u: UnidadeJulgamento, fornecedorId: string): Promise<AceitacaoProposta['limites']> {
    const direcao = await this.modos.direcao(u.licitacaoId, m);
    if (u.tipo === 'LOTE') {
      const [lance] = await m.query(
        `SELECT l.id, l.valor FROM lances l
          WHERE l.lote_id = $1 AND l.item_id IS NULL AND l.fornecedor_id = $2 AND l.cancelado = false
            AND ${ModoDisputaService.SQL_LANCE_LOTE_VISIVEL}
          ORDER BY l.valor ${ordemSql(direcao)}, l.created_at ASC LIMIT 1`,
        [u.id, fornecedorId],
      );
      if (!lance) throw new ConflictException('Licitante sem lance ativo neste lote');
      const rateio: any[] = await m.query(`SELECT item_id::text AS item_id, valor_total FROM lances WHERE lance_lote_id = $1`, [lance.id]);
      const porItem = new Map(rateio.map((r) => [r.item_id, Number(r.valor_total)]));
      return {
        valorFinalTotal: Number(lance.valor),
        valorFinalNaBase: Number(lance.valor),
        baseLance: u.baseLance,
        itens: u.itens.map((i) => ({
          itemId: i.id,
          numero: i.numero,
          descricao: i.descricao,
          quantidade: i.quantidade,
          valorMaximoTotal: porItem.has(i.id) ? porItem.get(i.id)! : null,
        })),
      };
    }
    const item = u.itens[0];
    const [lance] = await m.query(
      `SELECT l.valor, l.valor_unitario, l.valor_total, l.base_lance FROM lances l JOIN itens_licitacao i ON i.id = l.item_id
        WHERE l.item_id = $1 AND l.fornecedor_id = $2 AND l.cancelado = false AND ${ModoDisputaService.SQL_LANCE_VISIVEL}
        ORDER BY l.valor ${ordemSql(direcao)}, l.created_at ASC LIMIT 1`,
      [u.id, fornecedorId],
    );
    if (!lance) throw new ConflictException('Licitante sem lance ativo neste item');
    const v = valoresGravados(lance, (lance.base_lance as BaseLance) || u.baseLance, item.quantidade);
    return {
      valorFinalTotal: v.valor_total,
      valorFinalNaBase: Number(lance.valor),
      baseLance: u.baseLance,
      itens: [{ itemId: item.id, numero: item.numero, descricao: item.descricao, quantidade: item.quantidade, valorMaximoTotal: v.valor_total }],
    };
  }

  // ==========================================================================
  // ATOS DO AGENTE DE CONTRATAÇÃO
  // ==========================================================================

  /**
   * Convoca o licitante NA VEZ da unidade (ranking único — a ordem não pode
   * ser pulada) a enviar a proposta adequada ao último lance.
   */
  async convocar(
    sessaoId: string,
    unidadeId: string,
    opts: { prazoHoras?: number | null },
    ator: AtorTransicao,
    usuarioNome?: string,
  ) {
    const sessao = await this.sessao(sessaoId);
    const u = await this.ranking.unidade(unidadeId);
    if (!u || u.licitacaoId !== sessao.licitacao_id) throw new NotFoundException('Unidade não encontrada nesta licitação');
    const minimo = await this.prazoMinimoHoras(sessao.licitacao_id);
    const invalido = motivoPrazoInvalido(opts.prazoHoras, minimo);
    if (invalido) throw new BadRequestException(invalido);
    const horas = opts.prazoHoras != null ? Number(opts.prazoHoras) : minimo;

    const criada = await this.dataSource.transaction(async (m) => {
      await this.prepararAto(m, sessao, u.id);
      return this.convocarNaTransacao(m, sessao, u, horas, ator, usuarioNome);
    });
    return this.visaoAceitacao(criada);
  }

  private async convocarNaTransacao(
    m: EntityManager,
    sessao: SessaoDisputa,
    u: UnidadeJulgamento,
    horas: number,
    ator: AtorTransicao,
    usuarioNome?: string,
  ): Promise<AceitacaoProposta> {
    if (!u.encerrada) throw new ConflictException(`${this.rotulo(u)}: a etapa de lances ainda não terminou`);
    if (!RankingService.unidadeComResultadoPossivel(u)) {
      throw new ConflictException(`${this.rotulo(u)} está deserto/fracassado/cancelado`);
    }
    const ativa = await m.findOne(AceitacaoProposta, {
      where: STATUS_ACEITACAO_ATIVOS.map((status) => ({ unidade_id: u.id, status })),
    });
    if (ativa) throw new ConflictException(`${this.rotulo(u)}: já há um licitante convocado para a aceitação`);

    const ranking = await this.ranking.ranking(u, m);
    const primeiro = atualDaUnidade(ranking);
    if (!primeiro) throw new ConflictException(`${this.rotulo(u)}: não há licitante classificado para convocar`);
    if (ehPropostaAceita(primeiro.situacao)) {
      throw new ConflictException(`${this.rotulo(u)}: a proposta do licitante na vez já foi aceita`);
    }
    for (const gancho of this.ganchos) {
      const pendencia = await gancho({ licitacaoId: u.licitacaoId, sessaoId: sessao.id, unidade: u, primeiro, manager: m });
      if (pendencia) throw new PendenciaAntesDaAceitacao(pendencia);
    }

    const limites = await this.limitesDoLicitante(m, u, primeiro.fornecedorId);
    const agora = new Date();
    const a = await m.save(
      m.create(AceitacaoProposta, {
        licitacao_id: u.licitacaoId,
        sessao_id: sessao.id,
        tipo_unidade: u.tipo,
        unidade_id: u.id,
        fornecedor_id: primeiro.fornecedorId,
        status: StatusAceitacao.AGUARDANDO_ENVIO,
        convocada_em: agora,
        prazo_horas: horas,
        prazo_ate: prazoAte(agora, horas),
        limites,
        convocada_por_tipo: ator.tipo,
        convocada_por_id: ator.id,
      }),
    );
    await this.ranking.definirSituacao(m, u, primeiro.fornecedorId, SituacaoLicitante.CONVOCADO_ACEITACAO, { ator });
    const nome = await this.nomeFornecedor(m, primeiro.fornecedorId);
    await this.evento(m, {
      sessaoId: sessao.id,
      tipo: TipoEvento.ACEITACAO_CONVOCADA,
      descricao:
        `${this.rotulo(u)}: ${nome} (${primeiro.posicao}º colocado) convocado(a) a enviar a proposta adequada ao último lance ` +
        `(${brl(limites.valorFinalTotal)}) até ${dataHora(a.prazo_ate)} — prazo de ${horas} h (IN SEGES 73/2022, art. 29).`,
      itemId: u.tipo === 'ITEM' ? u.id : null,
      fornecedorId: primeiro.fornecedorId,
      usuario: usuarioNome,
      sistema: false,
      valor: limites.valorFinalTotal,
      dados: { aceitacao_id: a.id, unidade_id: u.id, tipo_unidade: u.tipo, prazo_ate: a.prazo_ate, prazo_horas: horas },
    });
    // Sala na etapa de aceitação (a partir da etapa pós-lances)
    await m.query(`UPDATE sessoes_disputa SET etapa = $2 WHERE id = $1 AND etapa::text = ANY($3)`, [
      sessao.id,
      EtapaSessao.ACEITACAO_PROPOSTA,
      ETAPAS_QUE_VAO_A_ACEITACAO,
    ]);
    return a;
  }

  /** Prorrogação (uma vez, mesmo período) — de ofício ou deferindo o pedido do licitante. */
  async prorrogar(sessaoId: string, aceitacaoId: string, motivo: string | undefined, ator: AtorTransicao, usuarioNome?: string) {
    const texto = (motivo ?? '').trim();
    if (!texto) throw new BadRequestException('Informe o motivo da prorrogação');
    const sessao = await this.sessao(sessaoId);
    const r = await this.dataSource.transaction(async (m) => {
      const pre = await this.aceitacaoDaSessao(m, sessaoId, aceitacaoId, false);
      await this.prepararAto(m, sessao, pre.unidade_id);
      const a = await this.aceitacaoDaSessao(m, sessaoId, aceitacaoId);
      const erro = motivoNaoProrroga(a);
      if (erro) throw new ConflictException(erro);
      a.prorrogada_em = new Date();
      a.prorrogacao_origem = a.pedido_prorrogacao_em ? 'PEDIDO' : 'DE_OFICIO';
      a.prorrogacao_motivo = texto;
      a.prazo_ate = prazoAte(new Date(a.prazo_ate), Number(a.prazo_horas));
      await m.save(a);
      const u = await this.ranking.unidade(a.unidade_id, m);
      await this.evento(m, {
        sessaoId,
        tipo: TipoEvento.ACEITACAO_PRAZO_PRORROGADO,
        descricao:
          `${u ? this.rotulo(u) : 'Unidade'}: prazo da proposta adequada prorrogado ${a.prorrogacao_origem === 'PEDIDO' ? 'a pedido do licitante' : 'de ofício'} ` +
          `por ${Number(a.prazo_horas)} h, até ${dataHora(a.prazo_ate)}. Motivo: ${texto}`,
        itemId: a.tipo_unidade === 'ITEM' ? a.unidade_id : null,
        fornecedorId: a.fornecedor_id,
        usuario: usuarioNome ?? sessao.pregoeiro_nome ?? undefined,
        sistema: false,
        dados: { aceitacao_id: a.id, prazo_ate: a.prazo_ate, origem: a.prorrogacao_origem },
      });
      return a;
    });
    return this.visaoAceitacao(r);
  }

  /** Aceite da proposta adequada (licitante ACEITO). */
  async aceitar(
    sessaoId: string,
    aceitacaoId: string,
    opts: { justificativaExequibilidade?: string | null; justificativaPrecoAcimaEstimado?: string | null },
    ator: AtorTransicao,
    usuarioNome?: string,
  ) {
    const sessao = await this.sessao(sessaoId);
    const r = await this.dataSource.transaction(async (m) => {
      const pre = await this.aceitacaoDaSessao(m, sessaoId, aceitacaoId, false);
      await this.prepararAto(m, sessao, pre.unidade_id);
      const a = await this.aceitacaoDaSessao(m, sessaoId, aceitacaoId);
      const erro = motivoNaoAceita(a, opts.justificativaExequibilidade);
      if (erro) throw new BadRequestException(erro);
      const u = await this.ranking.unidade(a.unidade_id, m);
      if (!u) throw new NotFoundException('Unidade não encontrada');
      for (const gancho of this.ganchosAceite) {
        const impedimento = await gancho({ aceitacao: a, unidade: u, opts, manager: m });
        if (impedimento) throw new BadRequestException(impedimento);
      }
      a.status = StatusAceitacao.ACEITA;
      a.decidida_em = new Date();
      a.decidida_por_tipo = ator.tipo;
      a.decidida_por_id = ator.id;
      a.justificativa_exequibilidade = a.alerta_exequibilidade ? (opts.justificativaExequibilidade ?? '').trim() : null;
      await m.save(a);
      await this.ranking.definirSituacao(m, u, a.fornecedor_id, SituacaoLicitante.ACEITO, { ator });
      const nome = await this.nomeFornecedor(m, a.fornecedor_id);
      await this.evento(m, {
        sessaoId,
        tipo: TipoEvento.PROPOSTA_ACEITA,
        descricao:
          `${this.rotulo(u)}: proposta de ${nome} ACEITA (${brl(Number(a.valor_total_readequado))}).` +
          (a.alerta_exequibilidade ? ` Exequibilidade justificada: ${a.justificativa_exequibilidade}` : '') +
          (opts.justificativaPrecoAcimaEstimado?.trim()
            ? ` Aceite acima do preço máximo, após negociação, motivado: ${opts.justificativaPrecoAcimaEstimado.trim()}`
            : ''),
        itemId: u.tipo === 'ITEM' ? u.id : null,
        fornecedorId: a.fornecedor_id,
        usuario: usuarioNome ?? sessao.pregoeiro_nome ?? undefined,
        sistema: false,
        valor: Number(a.valor_total_readequado),
        dados: { aceitacao_id: a.id, unidade_id: u.id },
      });
      await this.seguirSeTodasResolvidas(m, sessao);
      return a;
    });
    return this.visaoAceitacao(r);
  }

  /**
   * Recusa com motivo: licitante RECUSADO (sai do ranking) e o próximo é
   * convocado automaticamente com o mesmo prazo; sem próximo, a unidade fracassa.
   */
  async recusar(sessaoId: string, aceitacaoId: string, motivo: string | undefined, ator: AtorTransicao, usuarioNome?: string) {
    const texto = (motivo ?? '').trim();
    if (!texto) throw new BadRequestException('Informe o motivo da recusa');
    const sessao = await this.sessao(sessaoId);
    let fracassou = false;
    const r = await this.dataSource.transaction(async (m) => {
      const pre = await this.aceitacaoDaSessao(m, sessaoId, aceitacaoId, false);
      await this.prepararAto(m, sessao, pre.unidade_id);
      const a = await this.aceitacaoDaSessao(m, sessaoId, aceitacaoId);
      const erro = motivoNaoRecusa(a);
      if (erro) throw new ConflictException(erro);
      const u = await this.ranking.unidade(a.unidade_id, m);
      if (!u) throw new NotFoundException('Unidade não encontrada');
      const semEnvio = a.status === StatusAceitacao.AGUARDANDO_ENVIO;
      a.status = StatusAceitacao.RECUSADA;
      a.decidida_em = new Date();
      a.decisao_motivo = texto;
      a.decidida_por_tipo = ator.tipo;
      a.decidida_por_id = ator.id;
      await m.save(a);
      await this.ranking.definirSituacao(m, u, a.fornecedor_id, SituacaoLicitante.RECUSADO, { motivo: texto, ator });
      const nome = await this.nomeFornecedor(m, a.fornecedor_id);
      await this.evento(m, {
        sessaoId,
        tipo: TipoEvento.PROPOSTA_RECUSADA,
        descricao:
          `${this.rotulo(u)}: proposta de ${nome} RECUSADA${semEnvio ? ' (prazo encerrado sem envio da proposta adequada)' : ''}. Motivo: ${texto}`,
        itemId: u.tipo === 'ITEM' ? u.id : null,
        fornecedorId: a.fornecedor_id,
        usuario: usuarioNome ?? sessao.pregoeiro_nome ?? undefined,
        sistema: false,
        dados: { aceitacao_id: a.id, unidade_id: u.id, motivo: texto, sem_envio: semEnvio },
      });
      const proxima = await this.convocarProximoOuFracassar(m, sessao, u, Number(a.prazo_horas), ator, usuarioNome);
      fracassou = !proxima && (await this.unidadeFracassada(m, u));
      return { recusada: a, proxima };
    });
    if (fracassou) await this.transicoes.aplicarRollup(sessao.licitacao_id, ator);
    return {
      recusada: this.visaoAceitacao(r.recusada),
      proximaConvocacao: r.proxima ? this.visaoAceitacao(r.proxima) : null,
      unidadeFracassada: fracassou,
    };
  }

  /** A unidade foi declarada fracassada (todos os itens FRACASSADO)? */
  private async unidadeFracassada(m: EntityManager, u: UnidadeJulgamento): Promise<boolean> {
    const [r] = await m.query(
      `SELECT COUNT(*) FILTER (WHERE status::text <> 'FRACASSADO')::int AS vivos FROM itens_licitacao WHERE id::text = ANY($1::text[])`,
      [u.itens.map((i) => i.id)],
    );
    return Number(r?.vivos ?? 1) === 0;
  }

  /** Convoca o próximo da unidade (mesma transação) ou declara a unidade fracassada. */
  private async convocarProximoOuFracassar(
    m: EntityManager,
    sessao: SessaoDisputa,
    u: UnidadeJulgamento,
    horas: number,
    ator: AtorTransicao,
    usuarioNome?: string,
  ): Promise<AceitacaoProposta | null> {
    const ranking = await this.ranking.ranking(u, m);
    const proximo = atualDaUnidade(ranking);
    if (proximo && !ehPropostaAceita(proximo.situacao)) {
      try {
        return await this.convocarNaTransacao(m, sessao, u, Math.max(horas, PRAZO_MINIMO_ACEITACAO_HORAS), ator, usuarioNome);
      } catch (e) {
        if (!(e instanceof PendenciaAntesDaAceitacao)) throw e;
        // Pendência de gancho (desempate art. 60, ME/EPP): o próximo aguarda; nada fracassa
        await this.evento(m, {
          sessaoId: sessao.id,
          tipo: TipoEvento.MENSAGEM_SISTEMA,
          descricao: `${this.rotulo(u)}: convocação do próximo classificado aguardando — ${e.message}`,
          itemId: u.tipo === 'ITEM' ? u.id : null,
          dados: { unidade_id: u.id, pendencia: e.message },
        });
        return null;
      }
    }
    if (proximo) return null; // já há proposta aceita (não deveria ocorrer aqui)
    await m.update(
      ItemLicitacao,
      u.itens.map((i) => i.id),
      { status: StatusItem.FRACASSADO, observacoes: 'Fracassado: nenhum licitante com proposta aceitável (IN 73 art. 29)' },
    );
    await this.evento(m, {
      sessaoId: sessao.id,
      tipo: TipoEvento.UNIDADE_FRACASSADA,
      descricao: `${this.rotulo(u)} FRACASSADO: não há mais licitantes classificados para convocar.`,
      itemId: u.tipo === 'ITEM' ? u.id : null,
      dados: { unidade_id: u.id, tipo_unidade: u.tipo },
    });
    return null;
  }

  /** Todas as unidades resolvidas → a sala segue para a convocação da habilitação. */
  private async seguirSeTodasResolvidas(m: EntityManager, sessao: SessaoDisputa): Promise<void> {
    const pend = await this.transicoes.unidadesSemPropostaAceita(sessao.licitacao_id, m);
    if (pend.length) return;
    const r = await m.query(
      `UPDATE sessoes_disputa SET etapa = $2 WHERE id = $1 AND etapa::text = $3`,
      [sessao.id, EtapaSessao.CONVOCACAO_HABILITACAO, EtapaSessao.ACEITACAO_PROPOSTA],
    );
    await this.evento(m, {
      sessaoId: sessao.id,
      tipo: TipoEvento.MENSAGEM_SISTEMA,
      descricao: 'Aceitação concluída em todas as unidades. Segue a habilitação do(s) licitante(s) com proposta aceita (art. 62).',
      dados: { etapa_atualizada: !!(r?.[1] ?? r?.affected) },
    });
  }

  // ==========================================================================
  // ATOS DO LICITANTE (sempre o fornecedor do token)
  // ==========================================================================

  private async exigirDono(m: EntityManager, sessaoId: string, aceitacaoId: string, fornecedorId: string): Promise<AceitacaoProposta> {
    const a = await this.aceitacaoDaSessao(m, sessaoId, aceitacaoId);
    // Convocação de outro licitante: 404 (não revela a existência)
    if (a.fornecedor_id !== fornecedorId) throw new NotFoundException('Convocação não encontrada nesta sessão');
    return a;
  }

  /** Pedido justificado de prorrogação (o agente decide — `prorrogar`). */
  async pedirProrrogacao(sessaoId: string, aceitacaoId: string, fornecedorId: string, motivo: string | undefined) {
    const texto = (motivo ?? '').trim();
    if (texto.length < 10) throw new BadRequestException('Justifique o pedido de prorrogação (mín. 10 caracteres)');
    const sessao = await this.sessao(sessaoId);
    const r = await this.dataSource.transaction(async (m) => {
      const pre = await this.exigirDono(m, sessaoId, aceitacaoId, fornecedorId);
      await this.prepararAto(m, sessao, pre.unidade_id);
      const a = await this.exigirDono(m, sessaoId, aceitacaoId, fornecedorId);
      const erro = motivoNaoProrroga(a);
      if (erro) throw new ConflictException(erro);
      if (a.pedido_prorrogacao_em) throw new ConflictException('Já há um pedido de prorrogação registrado');
      a.pedido_prorrogacao_em = new Date();
      a.pedido_prorrogacao_motivo = texto;
      await m.save(a);
      await this.evento(m, {
        sessaoId,
        tipo: TipoEvento.ACEITACAO_PRORROGACAO_SOLICITADA,
        descricao: `Licitante convocado pediu a prorrogação do prazo da proposta adequada. Justificativa: ${texto}`,
        itemId: a.tipo_unidade === 'ITEM' ? a.unidade_id : null,
        fornecedorId,
        usuario: fornecedorId,
        sistema: false,
        dados: { aceitacao_id: a.id },
      });
      return a;
    });
    return this.visaoAceitacao(r);
  }

  /** Envio (ou reenvio antes da decisão) da proposta adequada: arquivo + valores por item. */
  async enviarProposta(
    sessaoId: string,
    aceitacaoId: string,
    fornecedorId: string,
    dados: { arquivo?: ArquivoProposta | null; valores?: ValorReadequadoEntrada[] | string | null; observacao?: string | null },
  ) {
    const arquivo = dados.arquivo;
    if (!arquivo || !arquivo.buffer?.length) throw new BadRequestException('Anexe o arquivo da proposta adequada (PDF, JPG ou PNG)');
    const ext = extname(arquivo.originalname || '').toLowerCase();
    if (!MIMES_PERMITIDOS.includes(arquivo.mimetype) || !EXTENSOES_PERMITIDAS.includes(ext)) {
      throw new BadRequestException('Tipo de arquivo não permitido. Use PDF, JPG ou PNG.');
    }
    if (arquivo.size > TAMANHO_MAXIMO_ARQUIVO) throw new BadRequestException('Arquivo acima de 10 MB');
    let valores: ValorReadequadoEntrada[] | null = null;
    try {
      valores = typeof dados.valores === 'string' ? JSON.parse(dados.valores) : (dados.valores ?? null);
    } catch {
      throw new BadRequestException('Valores por item em formato inválido');
    }

    const sessao = await this.sessao(sessaoId);
    const r = await this.dataSource.transaction(async (m) => {
      const pre = await this.exigirDono(m, sessaoId, aceitacaoId, fornecedorId);
      await this.prepararAto(m, sessao, pre.unidade_id);
      const a = await this.exigirDono(m, sessaoId, aceitacaoId, fornecedorId);
      const erro = motivoNaoEnvia(a);
      if (erro) throw new ConflictException(erro);
      const direcao = await this.modos.direcao(a.licitacao_id, m);
      let normalizados: ReturnType<typeof validarValoresReadequados>;
      try {
        normalizados = validarValoresReadequados(a.limites.itens, valores, Number(a.limites.valorFinalTotal), direcao);
      } catch (e: any) {
        throw new BadRequestException(e?.message ?? 'Valores inválidos');
      }
      const u = await this.ranking.unidade(a.unidade_id, m);
      const [lic] = await m.query(`SELECT tipo_contratacao::text AS tipo FROM licitacoes WHERE id = $1`, [a.licitacao_id]);
      const orcado = (u?.itens ?? []).reduce((s, i) => s + Number(i.valorTotalEstimado || 0), 0);
      const alerta = alertaExequibilidade({ tipoContratacao: lic?.tipo, valorProposta: normalizados.total, valorOrcado: orcado });

      a.status = StatusAceitacao.ENVIADA;
      a.enviada_em = new Date();
      a.valores_itens = normalizados.itens;
      a.valor_total_readequado = normalizados.total;
      a.observacao_fornecedor = (dados.observacao ?? '').trim() || null;
      a.arquivo_nome = (arquivo.originalname || `proposta${ext}`).replace(/[^\w.\- ()À-ú]/g, '_').slice(0, 200);
      a.arquivo_mime = arquivo.mimetype;
      a.arquivo_tamanho = arquivo.size;
      a.arquivo_sha256 = createHash('sha256').update(arquivo.buffer).digest('hex');
      a.arquivo_conteudo = arquivo.buffer;
      a.alerta_exequibilidade = alerta as any;
      await m.save(a);
      await this.evento(m, {
        sessaoId,
        tipo: TipoEvento.PROPOSTA_ADEQUADA_ENVIADA,
        descricao:
          `${u ? this.rotulo(u) : 'Unidade'}: proposta adequada ao último lance enviada (${brl(normalizados.total)}; arquivo ${a.arquivo_nome}, SHA-256 ${a.arquivo_sha256.slice(0, 12)}…).`,
        itemId: a.tipo_unidade === 'ITEM' ? a.unidade_id : null,
        fornecedorId,
        usuario: fornecedorId,
        sistema: false,
        valor: normalizados.total,
        dados: { aceitacao_id: a.id, alerta_exequibilidade: !!alerta },
      });
      return a;
    });
    return this.visaoAceitacao(r);
  }

  /** Arquivo da proposta: órgão dono (controller) ou o próprio licitante. */
  async arquivo(sessaoId: string, aceitacaoId: string, fornecedorId?: string): Promise<{ nome: string; mime: string; conteudo: Buffer }> {
    const a = await this.dataSource.manager
      .createQueryBuilder(AceitacaoProposta, 'a')
      .addSelect('a.arquivo_conteudo')
      .where('a.id = :id AND a.sessao_id = :s', { id: aceitacaoId, s: sessaoId })
      .getOne();
    if (!a || (fornecedorId && a.fornecedor_id !== fornecedorId)) throw new NotFoundException('Convocação não encontrada nesta sessão');
    if (!a.arquivo_conteudo) throw new NotFoundException('Proposta adequada ainda não enviada');
    return { nome: a.arquivo_nome || 'proposta', mime: a.arquivo_mime || 'application/octet-stream', conteudo: a.arquivo_conteudo };
  }

  // ==========================================================================
  // GANCHOS DA HABILITAÇÃO (sessao) — B3: o inabilitado sai do ranking
  // ==========================================================================

  /** Convocar para a habilitação só quem tem proposta aceita (400). */
  async exigirPropostaAceita(licitacaoId: string, fornecedorId: string): Promise<void> {
    const unidades = await this.ranking.unidadesDoLicitante(licitacaoId, fornecedorId, SITUACOES_PROPOSTA_ACEITA);
    if (!unidades.length) {
      throw new BadRequestException(
        'O licitante não tem proposta aceita: a habilitação é do licitante cuja proposta foi aceita na etapa de aceitação (IN 73 art. 29 / Lei 14.133 art. 62).',
      );
    }
  }

  /** Habilitação aprovada: ACEITO → HABILITADO nas unidades do licitante. */
  async aoHabilitar(licitacaoId: string, fornecedorId: string, ator: AtorTransicao): Promise<number> {
    return this.dataSource.transaction(async (m) => {
      const ids = await this.ranking.unidadesDoLicitante(licitacaoId, fornecedorId, [SituacaoLicitante.ACEITO, SituacaoLicitante.HABILITADO], m);
      for (const id of ids) {
        const u = await this.ranking.unidade(id, m);
        if (u) await this.ranking.definirSituacao(m, u, fornecedorId, SituacaoLicitante.HABILITADO, { ator });
      }
      return ids.length;
    });
  }

  /**
   * Inabilitação: o licitante vira INABILITADO em TODAS as unidades (a
   * habilitação é do licitante); convocações ativas dele são canceladas; nas
   * unidades em que ele estava na vez, a licitação volta ao julgamento
   * (RETORNAR_JULGAMENTO) e o próximo do ranking é convocado para a aceitação.
   * Sem próximo, a unidade fracassa.
   */
  async aoInabilitar(
    sessaoId: string,
    fornecedorId: string,
    motivo: string,
    ator: AtorTransicao,
    usuarioNome?: string,
  ): Promise<{ reconvocadas: number; fracassadas: number; restantesComAceite: number }> {
    const sessao = await this.sessao(sessaoId);
    const licitacaoId = sessao.licitacao_id;
    const naVez = new Set(
      await this.ranking.unidadesDoLicitante(
        licitacaoId,
        fornecedorId,
        [...SITUACOES_PROPOSTA_ACEITA, SituacaoLicitante.CONVOCADO_ACEITACAO],
      ),
    );
    const todas: any[] = await this.dataSource.query(
      `SELECT unidade_id FROM licitantes_unidade WHERE licitacao_id = $1 AND fornecedor_id = $2 AND NOT (situacao = ANY($3))`,
      [licitacaoId, fornecedorId, [...SITUACOES_EXCLUIDAS]],
    );
    await this.dataSource.transaction(async (m) => {
      for (const row of todas) {
        const u = await this.ranking.unidade(String(row.unidade_id), m);
        if (u) await this.ranking.definirSituacao(m, u, fornecedorId, SituacaoLicitante.INABILITADO, { motivo, ator });
      }
      await m.query(
        `UPDATE aceitacoes_proposta SET status = $3, decidida_em = now(), decisao_motivo = $4, updated_at = now()
          WHERE licitacao_id = $1 AND fornecedor_id = $2 AND status = ANY($5)`,
        [licitacaoId, fornecedorId, StatusAceitacao.CANCELADA, `Licitante inabilitado: ${motivo}`, STATUS_ACEITACAO_ATIVOS],
      );
    });

    let reconvocadas = 0;
    let fracassadas = 0;
    if (naVez.size) {
      // Há o que julgar de novo: a licitação volta ao julgamento (ato nomeado, com motivo)
      const [lic] = await this.dataSource.query(`SELECT fase::text AS fase FROM licitacoes WHERE id = $1`, [licitacaoId]);
      if (lic?.fase !== FaseLicitacao.JULGAMENTO) {
        await this.transicoes.executar(licitacaoId, AtoLicitacao.RETORNAR_JULGAMENTO, {
          ator,
          motivo: `Inabilitação: ${motivo}. Convocação do próximo classificado para a aceitação.`,
          registro: { origem: 'julgamento', fornecedor_inabilitado: fornecedorId },
        });
      }
      const horas = await this.prazoMinimoHoras(licitacaoId);
      for (const unidadeId of naVez) {
        await this.dataSource.transaction(async (m) => {
          const u = await this.ranking.unidade(unidadeId, m);
          if (!u) return;
          await this.prepararAto(m, sessao, u.id);
          const nova = await this.convocarProximoOuFracassar(m, sessao, u, horas, ator, usuarioNome);
          if (nova) reconvocadas++;
          else if (await this.unidadeFracassada(m, u)) fracassadas++;
        });
      }
      if (fracassadas) await this.transicoes.aplicarRollup(licitacaoId, ator);
    }
    const [{ total }] = await this.dataSource.query(
      `SELECT COUNT(DISTINCT unidade_id)::int AS total FROM licitantes_unidade WHERE licitacao_id = $1 AND situacao = ANY($2)`,
      [licitacaoId, [...SITUACOES_PROPOSTA_ACEITA]],
    );
    return { reconvocadas, fracassadas, restantesComAceite: Number(total) };
  }

  // ==========================================================================
  // GANCHO DA NEGOCIAÇÃO (Lei 14.133 art. 61; IN 73 art. 30 §4º)
  // ==========================================================================

  /**
   * Valor negociado (lance NEGOCIACAO já registrado no motor): a convocação
   * ATIVA do licitante na unidade passa a exigir a proposta adequada ao valor
   * negociado — novos limites (último lance, rateio no lote), nova solicitação
   * com prazo ≥ 2 h contado de agora (IN 73 art. 30 §4º) e, se a proposta já
   * tinha sido enviada, ela é descartada (volta a AGUARDANDO_ENVIO). Sem
   * convocação ativa não faz nada (a convocação futura já nasce com o valor
   * negociado). Devolve a convocação readequada ou null.
   */
  async readequarAposNegociacao(
    m: EntityManager,
    sessaoId: string,
    u: UnidadeJulgamento,
    fornecedorId: string,
    ator: AtorTransicao,
    usuarioNome?: string,
  ): Promise<AceitacaoProposta | null> {
    const a = await m.findOne(AceitacaoProposta, {
      where: STATUS_ACEITACAO_ATIVOS.map((status) => ({ unidade_id: u.id, fornecedor_id: fornecedorId, status })),
      lock: { mode: 'pessimistic_write' },
    });
    if (!a) return null;
    const minimo = await this.prazoMinimoHoras(u.licitacaoId, m);
    const horas = Math.max(minimo, Number(a.prazo_horas) || minimo);
    const agora = new Date();
    const tinhaEnvio = a.status === StatusAceitacao.ENVIADA;
    a.limites = await this.limitesDoLicitante(m, u, fornecedorId);
    a.status = StatusAceitacao.AGUARDANDO_ENVIO;
    a.convocada_em = agora;
    a.prazo_horas = horas;
    a.prazo_ate = prazoAte(agora, horas);
    a.prorrogada_em = null;
    a.prorrogacao_origem = null;
    a.prorrogacao_motivo = null;
    a.pedido_prorrogacao_em = null;
    a.pedido_prorrogacao_motivo = null;
    a.enviada_em = null;
    a.valores_itens = null;
    a.valor_total_readequado = null;
    a.observacao_fornecedor = null;
    a.arquivo_nome = null;
    a.arquivo_mime = null;
    a.arquivo_tamanho = null;
    a.arquivo_sha256 = null;
    a.arquivo_conteudo = null;
    a.alerta_exequibilidade = null;
    await m.save(a);
    await this.evento(m, {
      sessaoId,
      tipo: TipoEvento.ACEITACAO_CONVOCADA,
      descricao:
        `${this.rotulo(u)}: valor negociado — nova solicitação de proposta adequada ao último lance negociado ` +
        `(${brl(a.limites.valorFinalTotal)}) até ${dataHora(a.prazo_ate)}, prazo de ${horas} h (IN SEGES 73/2022, art. 30 §4º)` +
        (tinhaEnvio ? '; a proposta enviada antes da negociação foi substituída.' : '.'),
      itemId: u.tipo === 'ITEM' ? u.id : null,
      fornecedorId,
      usuario: usuarioNome,
      sistema: false,
      valor: a.limites.valorFinalTotal,
      dados: { aceitacao_id: a.id, unidade_id: u.id, origem: 'NEGOCIACAO', prazo_ate: a.prazo_ate, prazo_horas: horas, ator_tipo: ator.tipo },
    });
    return a;
  }
}
