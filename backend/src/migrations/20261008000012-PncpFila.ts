import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E7 — FILA DO PNCP (outbox): `pncp_sync` passa a ser a fila de operações.
 *  - tipos novos: RETIFICACAO_COMPRA, SITUACAO_COMPRA, RETIFICACAO_CONTRATO;
 *  - status novos: ERRO_TEMPORARIO, ERRO_DEFINITIVO;
 *  - colunas: chave_idempotencia (única), referencia, ordem, proximo_envio,
 *    max_tentativas, enviado_em;
 *  - `itens_licitacao.tipo_item` (MATERIAL | SERVICO — PNCP materialOuServico).
 * Sem dados a migrar: registros anteriores ficam como histórico (sem chave, o
 * worker os ignora; "reenviar agora" converte COMPRA/CONTRATO/ATA).
 *
 * IDEMPOTENTE e sem transação (ALTER TYPE … ADD VALUE). Produção usa
 * synchronize — esta migration existe para quando ele for desligado (E9).
 */
export class PncpFila20261008000012 implements MigrationInterface {
  name = 'PncpFila20261008000012';
  transaction = false as const;

  public async up(q: QueryRunner): Promise<void> {
    for (const v of ['RETIFICACAO_COMPRA', 'SITUACAO_COMPRA', 'RETIFICACAO_CONTRATO']) {
      await q.query(`ALTER TYPE pncp_sync_tipo_enum ADD VALUE IF NOT EXISTS '${v}'`);
    }
    for (const v of ['ERRO_TEMPORARIO', 'ERRO_DEFINITIVO']) {
      await q.query(`ALTER TYPE pncp_sync_status_enum ADD VALUE IF NOT EXISTS '${v}'`);
    }
    await q.query(`ALTER TABLE pncp_sync ADD COLUMN IF NOT EXISTS chave_idempotencia varchar(200)`);
    await q.query(`ALTER TABLE pncp_sync ADD COLUMN IF NOT EXISTS referencia jsonb`);
    await q.query(`ALTER TABLE pncp_sync ADD COLUMN IF NOT EXISTS ordem int NOT NULL DEFAULT 100`);
    await q.query(`ALTER TABLE pncp_sync ADD COLUMN IF NOT EXISTS proximo_envio timestamptz`);
    await q.query(`ALTER TABLE pncp_sync ADD COLUMN IF NOT EXISTS max_tentativas int NOT NULL DEFAULT 8`);
    await q.query(`ALTER TABLE pncp_sync ADD COLUMN IF NOT EXISTS enviado_em timestamptz`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pncp_sync_chave" ON pncp_sync (chave_idempotencia)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_pncp_sync_fila" ON pncp_sync (status, proximo_envio)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_pncp_sync_licitacao" ON pncp_sync (licitacao_id)`);
    await q.query(`ALTER TABLE itens_licitacao ADD COLUMN IF NOT EXISTS tipo_item varchar(10)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE itens_licitacao DROP COLUMN IF EXISTS tipo_item`);
    await q.query(`DROP INDEX IF EXISTS "UQ_pncp_sync_chave"`);
    for (const c of ['chave_idempotencia', 'referencia', 'ordem', 'proximo_envio', 'max_tentativas', 'enviado_em']) {
      await q.query(`ALTER TABLE pncp_sync DROP COLUMN IF EXISTS ${c}`);
    }
  }
}
