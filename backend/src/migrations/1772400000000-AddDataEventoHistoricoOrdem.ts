import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: data_evento no histórico de ordens + novos tipos PEDIDO_CRIADO, PEDIDO_AUTORIZADO
 */
export class AddDataEventoHistoricoOrdem1772400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "historico_ordens_fornecimento"
      ADD COLUMN IF NOT EXISTS "data_evento" timestamp NULL
    `);

    const existe = await queryRunner.query(
      `SELECT 1 FROM pg_enum WHERE enumlabel = 'PEDIDO_CRIADO' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'historico_ordens_fornecimento_tipo_acao_enum')`
    );
    if (!existe || (existe as any[]).length === 0) {
      await queryRunner.query(
        `ALTER TYPE "historico_ordens_fornecimento_tipo_acao_enum" ADD VALUE IF NOT EXISTS 'PEDIDO_CRIADO'`
      );
    }
    const existe2 = await queryRunner.query(
      `SELECT 1 FROM pg_enum WHERE enumlabel = 'PEDIDO_AUTORIZADO' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'historico_ordens_fornecimento_tipo_acao_enum')`
    );
    if (!existe2 || (existe2 as any[]).length === 0) {
      await queryRunner.query(
        `ALTER TYPE "historico_ordens_fornecimento_tipo_acao_enum" ADD VALUE IF NOT EXISTS 'PEDIDO_AUTORIZADO'`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "historico_ordens_fornecimento" DROP COLUMN IF EXISTS "data_evento"`
    );
  }
}
