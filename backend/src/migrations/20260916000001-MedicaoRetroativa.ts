import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Lançamento retroativo de medição pelo suporte.
 *
 * Problema: execução autorizada por OS que foi liquidada e PAGA na contabilidade
 * sem nunca ter medição no sistema (caso da Ata de Registro de Preços 001/2025,
 * OS-0116/2026 — NF 14, 240 unidades). O fluxo normal (submeter → atestar →
 * aprovar, com assinaturas) não cabe: não há o que assinar, o fato já ocorreu.
 *
 * Solução: registrar a medição já APROVADA por um usuário de suporte, marcando-a
 * como lançamento retroativo com motivo e autoria, para que saldo e histórico
 * reflitam a contabilidade sem mascarar a origem do registro.
 */
export class MedicaoRetroativa20260916000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "medicoes"
        ADD COLUMN IF NOT EXISTS "lancamento_retroativo" BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS "retroativo_motivo" TEXT,
        ADD COLUMN IF NOT EXISTS "retroativo_por_id" UUID,
        ADD COLUMN IF NOT EXISTS "retroativo_por_nome" VARCHAR(255),
        ADD COLUMN IF NOT EXISTS "retroativo_em" TIMESTAMP
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "medicoes"
        DROP COLUMN IF EXISTS "lancamento_retroativo",
        DROP COLUMN IF EXISTS "retroativo_motivo",
        DROP COLUMN IF EXISTS "retroativo_por_id",
        DROP COLUMN IF EXISTS "retroativo_por_nome",
        DROP COLUMN IF EXISTS "retroativo_em"
    `);
  }
}
