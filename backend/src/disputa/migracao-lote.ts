import type { ExecutorSql } from './migracao-lances';

/**
 * DISPUTA POR LOTE (E2 item 5) — índice único parcial da proposta-lance do
 * LOTE: uma linha de origem PROPOSTA ativa por (lote, fornecedor) no lance do
 * lote (`item_id` nulo). As linhas de rateio da proposta já são cobertas por
 * `UQ_lances_proposta_ativa` (item, fornecedor). Idempotente; roda no boot
 * (MigracaoLancesBootService) e na migration 20260927000001-DisputaPorLote —
 * o synchronize não cria índice parcial (a entidade o declara com
 * `synchronize: false` para não apagá-lo).
 */
export async function garantirIndicesDisputaLote(db: ExecutorSql): Promise<void> {
  await db.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_lances_lote_proposta_ativa"
        ON lances (lote_id, fornecedor_id)
     WHERE origem = 'PROPOSTA' AND cancelado = false AND item_id IS NULL AND lote_id IS NOT NULL`,
  );
}
