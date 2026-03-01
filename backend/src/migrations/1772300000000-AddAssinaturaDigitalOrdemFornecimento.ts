import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Assinatura digital e notificação para Ordem de Fornecimento
 * - codigo_validacao em ordens_fornecimento
 * - ORDEM_FORNECIMENTO_APROVADA em notificacoes_tipo_enum
 */
export class AddAssinaturaDigitalOrdemFornecimento1772300000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ordens_fornecimento"
      ADD COLUMN IF NOT EXISTS "codigo_validacao" varchar(16) NULL
    `);

    const existe = await queryRunner.query(
      `SELECT 1 FROM pg_enum WHERE enumlabel = 'ORDEM_FORNECIMENTO_APROVADA' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificacoes_tipo_enum')`
    );
    if (!existe || existe.length === 0) {
      await queryRunner.query(
        `ALTER TYPE "notificacoes_tipo_enum" ADD VALUE IF NOT EXISTS 'ORDEM_FORNECIMENTO_APROVADA'`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "ordens_fornecimento" DROP COLUMN IF EXISTS "codigo_validacao"`
    );
    // Não remove valor do enum (complexo no PostgreSQL)
  }
}
