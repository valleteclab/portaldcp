import { MigrationInterface, QueryRunner } from 'typeorm';
import { garantirIndicesDisputaLote } from '../disputa/migracao-lote';

/**
 * E2 item 5 — Disputa por LOTE no motor único (`disputa-v2/disputa-lote.service.ts`):
 *  - `lances.lote_id` (lance do lote: item_id nulo) e `lances.lance_lote_id`
 *    (linhas de rateio por item apontam para o lance do lote);
 *  - estado da disputa em `lotes_licitacao` (mesmas colunas do item: status,
 *    tempos, melhor lance) e o benefício ME/EPP do lote (`tipo_beneficio_mpe`,
 *    coerente com `exclusivo_mpe`/`percentual_cota_reservada`);
 *  - índice único parcial da proposta-lance do lote.
 * Dados: lotes com `exclusivo_mpe = true` recebem `tipo_beneficio_mpe = EXCLUSIVO`
 * e com cota > 0, `COTA_RESERVADA`.
 *
 * IDEMPOTENTE. Produção (synchronize ligado, sem migrationsRun): o synchronize
 * cria as colunas e o boot (MigracaoLancesBootService) o índice parcial; o
 * passo de dados do benefício pode ser rodado à mão:
 *   UPDATE lotes_licitacao SET tipo_beneficio_mpe = 'EXCLUSIVO' WHERE exclusivo_mpe AND tipo_beneficio_mpe = 'NENHUM';
 *   UPDATE lotes_licitacao SET tipo_beneficio_mpe = 'COTA_RESERVADA'
 *    WHERE NOT exclusivo_mpe AND COALESCE(percentual_cota_reservada,0) > 0 AND tipo_beneficio_mpe = 'NENHUM';
 */
export class DisputaPorLote20260927000001 implements MigrationInterface {
  name = 'DisputaPorLote20260927000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE lances ADD COLUMN IF NOT EXISTS lote_id uuid`);
    await q.query(`ALTER TABLE lances ADD COLUMN IF NOT EXISTS lance_lote_id uuid`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_lances_lote_ativo" ON lances (lote_id, cancelado)`);

    await q.query(`ALTER TABLE lotes_licitacao ADD COLUMN IF NOT EXISTS tipo_beneficio_mpe varchar(20) NOT NULL DEFAULT 'NENHUM'`);
    await q.query(`ALTER TABLE lotes_licitacao ADD COLUMN IF NOT EXISTS status_disputa varchar(20)`);
    await q.query(`ALTER TABLE lotes_licitacao ADD COLUMN IF NOT EXISTS disputa_iniciada_em timestamp`);
    await q.query(`ALTER TABLE lotes_licitacao ADD COLUMN IF NOT EXISTS ultimo_lance_em timestamp`);
    await q.query(`ALTER TABLE lotes_licitacao ADD COLUMN IF NOT EXISTS inicio_tempo_aleatorio timestamp`);
    await q.query(`ALTER TABLE lotes_licitacao ADD COLUMN IF NOT EXISTS tempo_aleatorio_sorteado int`);
    await q.query(`ALTER TABLE lotes_licitacao ADD COLUMN IF NOT EXISTS disputa_encerrada_em timestamp`);
    await q.query(`ALTER TABLE lotes_licitacao ADD COLUMN IF NOT EXISTS melhor_lance_valor numeric(15,2)`);
    await q.query(`ALTER TABLE lotes_licitacao ADD COLUMN IF NOT EXISTS melhor_lance_fornecedor_id uuid`);

    await q.query(`UPDATE lotes_licitacao SET tipo_beneficio_mpe = 'EXCLUSIVO' WHERE exclusivo_mpe = true AND tipo_beneficio_mpe = 'NENHUM'`);
    await q.query(
      `UPDATE lotes_licitacao SET tipo_beneficio_mpe = 'COTA_RESERVADA'
        WHERE exclusivo_mpe = false AND COALESCE(percentual_cota_reservada, 0) > 0 AND tipo_beneficio_mpe = 'NENHUM'`,
    );
    await garantirIndicesDisputaLote(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS "UQ_lances_lote_proposta_ativa"`);
    await q.query(`DROP INDEX IF EXISTS "IDX_lances_lote_ativo"`);
    for (const c of [
      'status_disputa', 'disputa_iniciada_em', 'ultimo_lance_em', 'inicio_tempo_aleatorio',
      'tempo_aleatorio_sorteado', 'disputa_encerrada_em', 'melhor_lance_valor', 'melhor_lance_fornecedor_id', 'tipo_beneficio_mpe',
    ]) {
      await q.query(`ALTER TABLE lotes_licitacao DROP COLUMN IF EXISTS ${c}`);
    }
    await q.query(`ALTER TABLE lances DROP COLUMN IF EXISTS lance_lote_id`);
    await q.query(`ALTER TABLE lances DROP COLUMN IF EXISTS lote_id`);
  }
}
