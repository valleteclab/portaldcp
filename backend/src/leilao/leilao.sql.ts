import type { ExecutorSql } from '../disputa/migracao-lances';
import { motivoLanceInicialAbaixoDoMinimo, pendenciasEditalLeilao, pendenciasPagamento } from './regras-leilao';

/**
 * Consultas do leilão SEM injeção de dependência — usadas pelas pré-condições
 * da máquina de estados (`modalidades-especiais/pendencias.sql.ts`) e pela
 * guarda da proposta (lance inicial ≥ preço mínimo).
 */

export async function pendenciasEditalLeilaoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const [lic] = await db.query(
    `SELECT criterio_julgamento::text AS criterio, tipo_contratacao::text AS tipo FROM licitacoes WHERE id = $1`,
    [licitacaoId],
  );
  const [config] = await db.query(`SELECT * FROM leilao_configuracoes WHERE licitacao_id = $1`, [licitacaoId]);
  const itens: any[] = await db.query(
    `SELECT id::text AS id, numero_item, COALESCE(valor_total_estimado, valor_unitario_estimado * quantidade) AS total
       FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`,
    [licitacaoId],
  );
  const bens: any[] = await db.query(`SELECT *, item_licitacao_id::text AS item_licitacao_id FROM leilao_bens WHERE licitacao_id = $1`, [licitacaoId]);
  return pendenciasEditalLeilao({
    criterio: lic?.criterio,
    tipoContratacao: lic?.tipo,
    config: config ?? null,
    itens: itens.map((i) => ({ id: i.id, numero_item: Number(i.numero_item), valor_total_estimado: Number(i.total) })),
    bens: bens.map((b) => ({ ...b, numero_item: 0 })),
  });
}

/** Unidades de julgamento (item, ou lote na base TOTAL_LOTE) com rótulo e se ainda têm resultado possível. */
export async function unidadesDoLeilaoSql(db: ExecutorSql, licitacaoId: string): Promise<Array<{ id: string; rotulo: string; comResultado: boolean; tipo: 'ITEM' | 'LOTE'; numero: number }>> {
  const [l] = await db.query(`SELECT COALESCE(base_lance, 'TOTAL_ITEM') AS base FROM licitacoes WHERE id = $1`, [licitacaoId]);
  const semResultado = ['DESERTO', 'FRACASSADO', 'CANCELADO'];
  if (l?.base === 'TOTAL_LOTE') {
    const lotes: any[] = await db.query(
      `SELECT lt.id::text AS id, lt.numero,
              EXISTS (SELECT 1 FROM itens_licitacao i WHERE i.lote_id = lt.id AND i.status::text <> ALL($2::text[])) AS com
         FROM lotes_licitacao lt WHERE lt.licitacao_id = $1 ORDER BY lt.numero`,
      [licitacaoId, semResultado],
    );
    return lotes.map((x) => ({ id: x.id, rotulo: `Lote ${x.numero}`, comResultado: !!x.com, tipo: 'LOTE' as const, numero: Number(x.numero) }));
  }
  const itens: any[] = await db.query(
    `SELECT id::text AS id, numero_item, status::text AS status FROM itens_licitacao WHERE licitacao_id = $1 ORDER BY numero_item`,
    [licitacaoId],
  );
  return itens.map((i) => ({ id: i.id, rotulo: `Item ${i.numero_item}`, comResultado: !semResultado.includes(i.status), tipo: 'ITEM' as const, numero: Number(i.numero_item) }));
}

export async function pendenciasPagamentoLeilaoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const unidades = await unidadesDoLeilaoSql(db, licitacaoId);
  const arrs: any[] = await db.query(`SELECT unidade_id::text AS unidade_id, status FROM leilao_arrematacoes WHERE licitacao_id = $1`, [licitacaoId]);
  if (!unidades.some((u) => u.comResultado)) return ['Nenhum bem com resultado — declare o leilão deserto/fracassado.'];
  return pendenciasPagamento(unidades, arrs);
}

export async function pendenciasTermosLeilaoSql(db: ExecutorSql, licitacaoId: string): Promise<string[]> {
  const rows: any[] = await db.query(
    `SELECT numero_unidade, tipo_unidade FROM leilao_arrematacoes WHERE licitacao_id = $1 AND status = 'PAGA' AND termo_gerado_em IS NULL ORDER BY numero_unidade`,
    [licitacaoId],
  );
  const [{ n }] = await db.query(`SELECT COUNT(*)::int AS n FROM leilao_arrematacoes WHERE licitacao_id = $1 AND status = 'PAGA'`, [licitacaoId]);
  if (!Number(n)) return ['Nenhuma arrematação paga com termo de arrematação gerado.'];
  return rows.map((r) => `${r.tipo_unidade === 'LOTE' ? 'Lote' : 'Item'} ${r.numero_unidade}: termo de arrematação não gerado (gere pelo painel do leilão).`);
}

/** Proposta (lance inicial) do leilão: cada item ≥ preço mínimo do bem. */
export async function motivoPropostaLeilaoSql(
  db: ExecutorSql,
  licitacaoId: string,
  itens: Array<{ item_licitacao_id: string; valor_unitario: number }>,
): Promise<string | null> {
  for (const it of itens) {
    const [r] = await db.query(
      `SELECT i.numero_item, i.quantidade, b.valor_minimo FROM itens_licitacao i
         LEFT JOIN leilao_bens b ON b.item_licitacao_id = i.id
        WHERE i.id::text = $1 AND i.licitacao_id = $2`,
      [it.item_licitacao_id, licitacaoId],
    );
    if (!r) continue;
    if (r.valor_minimo == null) return `Item ${r.numero_item}: bem sem preço mínimo cadastrado.`;
    const total = Math.round(Number(it.valor_unitario) * (Number(r.quantidade) || 1) * 100) / 100;
    const m = motivoLanceInicialAbaixoDoMinimo(Number(r.numero_item), total, Number(r.valor_minimo));
    if (m) return m;
  }
  return null;
}
