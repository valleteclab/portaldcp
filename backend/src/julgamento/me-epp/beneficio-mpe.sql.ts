import type { ExecutorSql } from '../../disputa/migracao-lances';
import {
  BeneficioUnidade,
  ConferenciaArt48,
  DadosBeneficio,
  LIMITE_EXCLUSIVO_MPE,
  beneficioDaUnidade,
  enquadramentoMpe,
  motivoForaDaExclusividade,
} from './regras-me-epp';

/**
 * Funções SQL SEM injeção de dependência (mesmo padrão de
 * `licitantes-unidade.sql.ts`): o motor de disputa e as propostas as chamam
 * sem importar o módulo de julgamento (sem ciclo de módulos).
 */

const LICITACAO_COLS = `l.id AS licitacao_id, l.modalidade::text AS modalidade, l.tratamento_diferenciado_mpe, l.modo_beneficio_mpe,
  l.tipo_beneficio_mpe AS tipo_licitacao,
  l.percentual_cota_reservada AS percentual_licitacao, COALESCE(l.base_lance, 'TOTAL_ITEM') AS base_lance`;

export interface UnidadeBeneficio {
  tipoUnidade: 'ITEM' | 'LOTE';
  unidadeId: string;
  licitacaoId: string;
  numero: number;
  rotulo: string;
  beneficio: BeneficioUnidade;
}

const dadosDaLinha = (r: any, tipos: Array<string | null>, ehCota: boolean, tipoLote: string | null): DadosBeneficio => ({
  tratamentoDiferenciado: r.tratamento_diferenciado_mpe,
  modo: r.modo_beneficio_mpe,
  tipoLicitacao: r.tipo_licitacao,
  tipoLote,
  tiposParticipacaoItens: tipos,
  ehCota,
});

/**
 * Benefício da UNIDADE (id de item ou de lote). O item de um lote-cota é
 * cota; no modo POR_LOTE o item herda o tipo do seu lote. Null se o id não
 * for de item nem de lote.
 */
export async function beneficioDaUnidadeSql(db: ExecutorSql, unidadeId: string): Promise<UnidadeBeneficio | null> {
  const [lote] = await db.query(
    `SELECT lo.id, lo.numero, lo.tipo_beneficio_mpe AS tipo_lote, lo.lote_cota_origem_id, ${LICITACAO_COLS}
       FROM lotes_licitacao lo JOIN licitacoes l ON l.id = lo.licitacao_id WHERE lo.id::text = $1`,
    [unidadeId],
  );
  if (lote) {
    const itens: any[] = await db.query(
      `SELECT tipo_participacao::text AS tipo, item_cota_origem_id FROM itens_licitacao WHERE lote_id = $1`,
      [lote.id],
    );
    const ehCota = !!lote.lote_cota_origem_id || (itens.length > 0 && itens.every((i) => !!i.item_cota_origem_id));
    return {
      tipoUnidade: 'LOTE',
      unidadeId: String(lote.id),
      licitacaoId: String(lote.licitacao_id),
      numero: Number(lote.numero),
      rotulo: `Lote ${lote.numero}`,
      beneficio: beneficioDaUnidade(dadosDaLinha(lote, itens.map((i) => i.tipo), ehCota, lote.tipo_lote)),
    };
  }
  const [item] = await db.query(
    `SELECT i.id, i.numero_item, i.tipo_participacao::text AS tipo, i.item_cota_origem_id,
            lo.tipo_beneficio_mpe AS tipo_lote, lo.lote_cota_origem_id, ${LICITACAO_COLS}
       FROM itens_licitacao i JOIN licitacoes l ON l.id = i.licitacao_id
       LEFT JOIN lotes_licitacao lo ON lo.id = i.lote_id
      WHERE i.id::text = $1`,
    [unidadeId],
  );
  if (!item) return null;
  const ehCota = !!item.item_cota_origem_id || !!item.lote_cota_origem_id;
  return {
    tipoUnidade: 'ITEM',
    unidadeId: String(item.id),
    licitacaoId: String(item.licitacao_id),
    numero: Number(item.numero_item),
    rotulo: `Item ${item.numero_item}`,
    beneficio: beneficioDaUnidade(dadosDaLinha(item, [item.tipo], ehCota, item.tipo_lote ?? null)),
  };
}

/**
 * Fornecedores ENQUADRADOS como ME/EPP na licitação, pelo retrato da
 * proposta (porte do cadastro na criação + declaração). Proposta anterior ao
 * retrato (coluna nula): cadastro atual + declaração.
 */
export async function fornecedoresMpeDaLicitacao(db: ExecutorSql, licitacaoId: string): Promise<Set<string>> {
  const rows: any[] = await db.query(
    `SELECT p.fornecedor_id::text AS fornecedor_id, p.enquadramento_mpe, p.declaracao_mpe, f.porte::text AS porte
       FROM propostas p LEFT JOIN fornecedores f ON f.id::text = p.fornecedor_id::text
      WHERE p.licitacao_id = $1`,
    [licitacaoId],
  );
  const saida = new Set<string>();
  for (const r of rows) {
    const enq = r.enquadramento_mpe == null ? enquadramentoMpe(r.porte, r.declaracao_mpe) : !!r.enquadramento_mpe;
    if (enq) saida.add(String(r.fornecedor_id));
  }
  return saida;
}

/**
 * Participação na unidade exclusiva/cota (art. 48 I e III): motivo da recusa
 * ou null. Usado pelo motor (lance e conversão proposta→lance) — a proposta
 * já é barrada na criação (PropostasService).
 */
export async function motivoForaDoBeneficioMpe(db: ExecutorSql, unidadeId: string, fornecedorId: string): Promise<string | null> {
  const u = await beneficioDaUnidadeSql(db, unidadeId);
  if (!u || !u.beneficio.somenteMpe) return null;
  const mpe = await fornecedoresMpeDaLicitacao(db, u.licitacaoId);
  return motivoForaDaExclusividade(u.beneficio, mpe.has(fornecedorId), u.rotulo);
}

/** Modalidades (licitações) em que a conferência do art. 48 I é exigida ao publicar. */
const MODALIDADES_ART48 = ['PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL', 'CONCORRENCIA'];

/** Limite legal vigente do art. 48 I (órgão → nacional → R$ 80.000). */
export async function limiteExclusivoMpeSql(db: ExecutorSql, orgaoId: string | null): Promise<number> {
  const [l] = await db.query(
    `SELECT valor FROM limites_legais
      WHERE chave = 'MPE_EXCLUSIVO_ITEM' AND (orgao_id IS NULL OR orgao_id::text = $1)
        AND vigencia_inicio <= CURRENT_DATE AND (vigencia_fim IS NULL OR vigencia_fim >= CURRENT_DATE)
      ORDER BY (orgao_id IS NULL), vigencia_inicio DESC LIMIT 1`,
    [orgaoId ?? ''],
  );
  return l ? Number(l.valor) : LIMITE_EXCLUSIVO_MPE;
}

/**
 * Conferência do art. 48 I da licitação: cada UNIDADE (item; na disputa por
 * lote, o lote pelo valor TOTAL estimado) com o benefício resolvido. Null
 * fora das modalidades licitatórias (contratação direta, leilão, concurso).
 */
export async function conferenciaArt48Sql(db: ExecutorSql, licitacaoId: string): Promise<ConferenciaArt48 | null> {
  const [lic] = await db.query(
    `SELECT modalidade::text AS modalidade, orgao_id::text AS orgao_id, COALESCE(base_lance, 'TOTAL_ITEM') AS base_lance
       FROM licitacoes WHERE id = $1`,
    [licitacaoId],
  );
  if (!lic || !MODALIDADES_ART48.includes(lic.modalidade)) return null;
  const limite = await limiteExclusivoMpeSql(db, lic.orgao_id);
  const valorItem = `COALESCE(NULLIF(i.valor_total_estimado, 0), i.valor_unitario_estimado * i.quantidade, 0)`;
  const linhas: Array<{ id: string; rotulo: string; valor: string }> =
    lic.base_lance === 'TOTAL_LOTE'
      ? await db.query(
          `SELECT lo.id::text AS id, 'Lote ' || lo.numero AS rotulo, COALESCE(SUM(${valorItem}), 0) AS valor
             FROM lotes_licitacao lo JOIN itens_licitacao i ON i.lote_id = lo.id
            WHERE lo.licitacao_id = $1 GROUP BY lo.id, lo.numero ORDER BY lo.numero`,
          [licitacaoId],
        )
      : await db.query(
          `SELECT i.id::text AS id, 'Item ' || i.numero_item AS rotulo, ${valorItem} AS valor
             FROM itens_licitacao i WHERE i.licitacao_id = $1 ORDER BY i.numero_item`,
          [licitacaoId],
        );
  const unidades = [];
  for (const l of linhas) {
    const u = await beneficioDaUnidadeSql(db, l.id);
    unidades.push({
      rotulo: l.rotulo,
      valorEstimado: Math.round(Number(l.valor) * 100) / 100,
      exclusiva: !!u?.beneficio.somenteMpe,
      ehCota: !!u?.beneficio.ehCota,
    });
  }
  return { limite, unidades };
}
