import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { DisputaService } from '../disputa-v2/disputa.service';
import { ModoDisputaService } from '../disputa-v2/modo-disputa.service';
import { BaseLance } from '../disputa-v2/modelo-lance';
import type { DirecaoLance } from '../disputa-v2/modos-disputa';
import type { AtorTransicao } from '../licitacoes/transicoes/transicoes.tipos';
import { registrarLicitantesDaUnidade } from './licitantes-unidade.sql';
import {
  Desempatador,
  EntradaRanking,
  SituacaoLicitante,
  atualDaUnidade,
  desempatePorRegistro,
  montarRanking,
  rankingAgregado,
  vencedorDaUnidade,
} from './regras-julgamento';

/** Unidade do julgamento: o ITEM, ou o LOTE quando a licitação disputa por lote. */
export interface UnidadeJulgamento {
  tipo: 'ITEM' | 'LOTE';
  id: string;
  licitacaoId: string;
  numero: number;
  descricao: string;
  /** Etapa de lances da unidade encerrada (ENCERRADO/NEGOCIACAO). */
  encerrada: boolean;
  baseLance: BaseLance;
  itens: Array<{
    id: string;
    numero: number;
    descricao: string;
    quantidade: number;
    unidadeMedida: string | null;
    valorUnitarioEstimado: number;
    valorTotalEstimado: number;
    status: string;
  }>;
}

const STATUS_ENCERRADA = ['ENCERRADO', 'NEGOCIACAO'];
const STATUS_ITEM_SEM_RESULTADO = ['DESERTO', 'FRACASSADO', 'CANCELADO'];

const num = (v: unknown) => (v == null || v === '' ? 0 : Number(v));

/**
 * ============================================================================
 * RANKING ÚNICO (plano E3 item 1 — fim do B4)
 * ============================================================================
 *
 * Uma só fonte para "quem é o 1º", "quem é o próximo" e "quem vence", por
 * UNIDADE (item ou lote): as melhores ofertas ATIVAS de cada licitante vêm do
 * motor (`DisputaService.rankingDoItem` — lances cancelados fora, lance
 * fechado sigiloso fora até o encerramento, lote pelo lance global), na
 * direção do critério (maior lance = decrescente), menos quem foi
 * DESCLASSIFICADO / RECUSADO / INABILITADO em `licitantes_unidade`; empate
 * de valor → `desempatador` (padrão: registro mais antigo; gancho para o
 * art. 60 / sorteio). Usado pela aceitação, habilitação, negociação, recursos,
 * adjudicação e homologação — nada mais ordena propostas por
 * `valor_total_proposta`.
 */
@Injectable()
export class RankingService {
  private desempatador: Desempatador = desempatePorRegistro;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly disputa: DisputaService,
    private readonly modos: ModoDisputaService,
  ) {}

  /**
   * GANCHO do desempate (Lei 14.133 art. 60 e sorteio público — IN 73 art. 28):
   * a etapa de desempate registra aqui a sua regra; o padrão é "registrado primeiro".
   */
  definirDesempatador(fn: Desempatador): void {
    this.desempatador = fn ?? desempatePorRegistro;
  }

  private m(manager?: EntityManager): EntityManager {
    return manager ?? this.dataSource.manager;
  }

  // ==========================================================================
  // UNIDADES
  // ==========================================================================

  async baseDaLicitacao(licitacaoId: string, manager?: EntityManager): Promise<BaseLance> {
    const [l] = await this.m(manager).query(`SELECT base_lance FROM licitacoes WHERE id = $1`, [licitacaoId]);
    return (l?.base_lance as BaseLance) || BaseLance.TOTAL_ITEM;
  }

  async direcao(licitacaoId: string, manager?: EntityManager): Promise<DirecaoLance> {
    return this.modos.direcao(licitacaoId, manager);
  }

  /** Unidades de julgamento da licitação, em ordem (itens, ou lotes quando a base é TOTAL_LOTE). */
  async unidades(licitacaoId: string, manager?: EntityManager): Promise<UnidadeJulgamento[]> {
    const m = this.m(manager);
    const base = await this.baseDaLicitacao(licitacaoId, m);
    const itens: any[] = await m.query(
      `SELECT id, numero_item, descricao_resumida, descricao_detalhada, quantidade, unidade_medida::text AS unidade_medida,
              valor_unitario_estimado, valor_total_estimado, status::text AS status,
              status_disputa::text AS status_disputa, lote_id
         FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`,
      [licitacaoId],
    );
    const mapaItem = (i: any) => ({
      id: String(i.id),
      numero: Number(i.numero_item),
      descricao: i.descricao_resumida || i.descricao_detalhada || '',
      quantidade: num(i.quantidade) || 1,
      unidadeMedida: i.unidade_medida ?? null,
      valorUnitarioEstimado: num(i.valor_unitario_estimado),
      valorTotalEstimado: num(i.valor_total_estimado) || Math.round(num(i.valor_unitario_estimado) * (num(i.quantidade) || 1) * 100) / 100,
      status: String(i.status || 'ATIVO'),
    });
    if (base !== BaseLance.TOTAL_LOTE) {
      return itens.map((i) => ({
        tipo: 'ITEM' as const,
        id: String(i.id),
        licitacaoId,
        numero: Number(i.numero_item),
        descricao: i.descricao_resumida || i.descricao_detalhada || '',
        encerrada: STATUS_ENCERRADA.includes(String(i.status_disputa)),
        baseLance: base,
        itens: [mapaItem(i)],
      }));
    }
    const lotes: any[] = await m.query(
      `SELECT id, numero, descricao, status_disputa FROM lotes_licitacao WHERE licitacao_id = $1 ORDER BY numero`,
      [licitacaoId],
    );
    return lotes
      .map((l) => ({
        tipo: 'LOTE' as const,
        id: String(l.id),
        licitacaoId,
        numero: Number(l.numero),
        descricao: l.descricao || `Lote ${l.numero}`,
        encerrada: STATUS_ENCERRADA.includes(String(l.status_disputa)),
        baseLance: base,
        itens: itens.filter((i) => String(i.lote_id) === String(l.id)).map(mapaItem),
      }))
      .filter((u) => u.itens.length > 0);
  }

  /** Unidade pelo id (item ou lote). Item de licitação por lote → o lote dele. */
  async unidade(id: string, manager?: EntityManager): Promise<UnidadeJulgamento | null> {
    const m = this.m(manager);
    const [dono] = await m.query(
      `SELECT licitacao_id, NULL::uuid AS lote_id FROM lotes_licitacao WHERE id::text = $1
        UNION ALL
       SELECT licitacao_id, lote_id FROM itens_licitacao WHERE id::text = $1`,
      [id],
    );
    if (!dono) return null;
    const todas = await this.unidades(String(dono.licitacao_id), m);
    return todas.find((u) => u.id === id) ?? todas.find((u) => u.itens.some((i) => i.id === id)) ?? null;
  }

  /** A unidade tem resultado a julgar (não deserta/fracassada/cancelada)? */
  static unidadeComResultadoPossivel(u: UnidadeJulgamento): boolean {
    return u.itens.some((i) => !STATUS_ITEM_SEM_RESULTADO.includes(i.status));
  }

  // ==========================================================================
  // RANKING
  // ==========================================================================

  /** Situações registradas na unidade (fornecedor → situação). */
  async situacoes(unidadeId: string, manager?: EntityManager): Promise<Map<string, string>> {
    const rows: any[] = await this.m(manager).query(
      `SELECT fornecedor_id, situacao FROM licitantes_unidade WHERE unidade_id::text = $1`,
      [unidadeId],
    );
    return new Map(rows.map((r) => [String(r.fornecedor_id), String(r.situacao)]));
  }

  /**
   * Garante as linhas CLASSIFICADO da unidade encerrada (idempotente) — cobre
   * encerramentos pelo relógio, pelos modos e dados anteriores à E3.
   */
  async sincronizar(u: UnidadeJulgamento, manager?: EntityManager): Promise<void> {
    if (!u.encerrada) return;
    const m = this.m(manager);
    const ofertas = await this.disputa.rankingDoItem(u.id, m);
    if (!ofertas.length) return;
    const direcao = await this.direcao(u.licitacaoId, m);
    const ordenado = await montarRanking(ofertas, new Map(), direcao, { unidadeId: u.id, licitacaoId: u.licitacaoId });
    await registrarLicitantesDaUnidade(m, {
      licitacaoId: u.licitacaoId,
      tipoUnidade: u.tipo,
      unidadeId: u.id,
      ranking: ordenado.map((e) => ({ fornecedorId: e.fornecedorId, melhorValor: e.melhorValor })),
    });
  }

  /** Ranking ÚNICO da unidade (ver cabeçalho). */
  async ranking(u: UnidadeJulgamento | string, manager?: EntityManager): Promise<EntradaRanking[]> {
    const m = this.m(manager);
    const unidade = typeof u === 'string' ? await this.unidade(u, m) : u;
    if (!unidade) return [];
    await this.sincronizar(unidade, m);
    const ofertas = await this.disputa.rankingDoItem(unidade.id, m);
    const situacoes = await this.situacoes(unidade.id, m);
    const direcao = await this.direcao(unidade.licitacaoId, m);
    return montarRanking(ofertas, situacoes, direcao, {
      desempatar: this.desempatador,
      licitacaoId: unidade.licitacaoId,
      unidadeId: unidade.id,
    });
  }

  /** Quem está na vez na unidade (melhor não excluído). */
  async atual(u: UnidadeJulgamento | string, manager?: EntityManager): Promise<EntradaRanking | null> {
    return atualDaUnidade(await this.ranking(u, manager));
  }

  /**
   * Vencedor para adjudicar/homologar: o licitante na vez com proposta aceita
   * (nunca RECUSADO/INABILITADO/DESCLASSIFICADO). Unidade legada sem nenhum
   * registro de licitante → 1º do ranking de lances.
   */
  async vencedor(u: UnidadeJulgamento | string, manager?: EntityManager): Promise<EntradaRanking | null> {
    const m = this.m(manager);
    const unidade = typeof u === 'string' ? await this.unidade(u, m) : u;
    if (!unidade) return null;
    const ranking = await this.ranking(unidade, m);
    const situacoes = await this.situacoes(unidade.id, m);
    // Linhas só CLASSIFICADO (criadas pelo encerramento) não contam como "registro de julgamento"
    const temJulgamento = [...situacoes.values()].some((s) => s !== SituacaoLicitante.CLASSIFICADO);
    return vencedorDaUnidade(ranking, temJulgamento);
  }

  /** Rankings de todas as unidades da licitação. */
  async rankingsDaLicitacao(
    licitacaoId: string,
    manager?: EntityManager,
  ): Promise<Array<{ unidade: UnidadeJulgamento; ranking: EntradaRanking[] }>> {
    const m = this.m(manager);
    const saida: Array<{ unidade: UnidadeJulgamento; ranking: EntradaRanking[] }> = [];
    for (const u of await this.unidades(licitacaoId, m)) {
      saida.push({ unidade: u, ranking: u.encerrada ? await this.ranking(u, m) : [] });
    }
    return saida;
  }

  /** Ranking por LICITANTE (telas por licitante: habilitação, negociação, recursos). */
  async rankingAgregado(licitacaoId: string, manager?: EntityManager) {
    const porUnidade = await this.rankingsDaLicitacao(licitacaoId, manager);
    return { porUnidade, agregado: rankingAgregado(porUnidade) };
  }

  // ==========================================================================
  // SITUAÇÃO DO LICITANTE
  // ==========================================================================

  /** Grava a situação do licitante na unidade (upsert), com motivo e ator. */
  async definirSituacao(
    m: EntityManager,
    u: Pick<UnidadeJulgamento, 'id' | 'tipo' | 'licitacaoId'>,
    fornecedorId: string,
    situacao: SituacaoLicitante,
    opts: { motivo?: string | null; ator?: AtorTransicao | null } = {},
  ): Promise<void> {
    await m.query(
      `INSERT INTO licitantes_unidade
         (id, licitacao_id, tipo_unidade, unidade_id, fornecedor_id, situacao, motivo, ator_tipo, ator_id, situacao_em, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, now(), now(), now())
       ON CONFLICT (unidade_id, fornecedor_id) DO UPDATE
         SET situacao = EXCLUDED.situacao, motivo = EXCLUDED.motivo, ator_tipo = EXCLUDED.ator_tipo,
             ator_id = EXCLUDED.ator_id, situacao_em = now(), updated_at = now()`,
      [u.licitacaoId, u.tipo, u.id, fornecedorId, situacao, opts.motivo ?? null, opts.ator?.tipo ?? null, opts.ator?.id ?? null],
    );
  }

  /** Unidades em que o licitante está numa das situações dadas. */
  async unidadesDoLicitante(
    licitacaoId: string,
    fornecedorId: string,
    situacoes: ReadonlyArray<string>,
    manager?: EntityManager,
  ): Promise<string[]> {
    const rows: any[] = await this.m(manager).query(
      `SELECT unidade_id FROM licitantes_unidade WHERE licitacao_id = $1 AND fornecedor_id = $2 AND situacao = ANY($3)`,
      [licitacaoId, fornecedorId, [...situacoes]],
    );
    return rows.map((r) => String(r.unidade_id));
  }
}
