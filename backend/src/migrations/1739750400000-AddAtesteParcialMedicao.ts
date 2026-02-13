import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAtesteParcialMedicao1739750400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Adicionar valor PARCIALMENTE_ATESTADA ao enum de status da medição
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE "public"."medicoes_status_enum" ADD VALUE IF NOT EXISTS 'PARCIALMENTE_ATESTADA';
      EXCEPTION WHEN others THEN
        BEGIN
          ALTER TYPE "status_medicao_enum" ADD VALUE IF NOT EXISTS 'PARCIALMENTE_ATESTADA';
        EXCEPTION WHEN others THEN
          NULL;
        END;
      END
      $$;
    `);

    // 2. Adicionar colunas de ateste por item na tabela itens_medicao
    await queryRunner.query(`
      ALTER TABLE "itens_medicao" ADD COLUMN IF NOT EXISTS "atestado" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "itens_medicao" ADD COLUMN IF NOT EXISTS "ateste_fiscal_nome" varchar NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "itens_medicao" ADD COLUMN IF NOT EXISTS "ateste_data" timestamp NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "itens_medicao" ADD COLUMN IF NOT EXISTS "ateste_observacoes" text NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "itens_medicao" DROP COLUMN IF EXISTS "ateste_observacoes"`);
    await queryRunner.query(`ALTER TABLE "itens_medicao" DROP COLUMN IF EXISTS "ateste_data"`);
    await queryRunner.query(`ALTER TABLE "itens_medicao" DROP COLUMN IF EXISTS "ateste_fiscal_nome"`);
    await queryRunner.query(`ALTER TABLE "itens_medicao" DROP COLUMN IF EXISTS "atestado"`);
    // Nota: Não é possível remover um valor de enum no PostgreSQL sem recriar o tipo
  }
}
