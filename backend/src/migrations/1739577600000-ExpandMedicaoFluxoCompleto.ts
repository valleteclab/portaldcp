import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExpandMedicaoFluxoCompleto1739577600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Adicionar novos valores ao enum status_medicao
    await queryRunner.query(`
      ALTER TYPE "status_medicao_enum" RENAME TO "status_medicao_enum_old"
    `).catch(() => {
      // Enum pode não existir com esse nome exato
    });

    // Recriar enum com todos os valores
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'statusmedicao_enum') THEN
          -- Tentar adicionar valores ao enum existente
          BEGIN
            ALTER TYPE "public"."medicoes_status_enum" ADD VALUE IF NOT EXISTS 'SUBMETIDA';
            ALTER TYPE "public"."medicoes_status_enum" ADD VALUE IF NOT EXISTS 'AGUARDANDO_ATESTE';
            ALTER TYPE "public"."medicoes_status_enum" ADD VALUE IF NOT EXISTS 'DEVOLVIDA';
          EXCEPTION WHEN others THEN
            NULL;
          END;
        END IF;
      END
      $$;
    `);

    // Tentar com nome alternativo do enum
    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE "public"."medicoes_status_enum" ADD VALUE IF NOT EXISTS 'SUBMETIDA';
      EXCEPTION WHEN others THEN
        BEGIN
          ALTER TYPE "status_medicao_enum" ADD VALUE IF NOT EXISTS 'SUBMETIDA';
        EXCEPTION WHEN others THEN
          NULL;
        END;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE "public"."medicoes_status_enum" ADD VALUE IF NOT EXISTS 'AGUARDANDO_ATESTE';
      EXCEPTION WHEN others THEN
        BEGIN
          ALTER TYPE "status_medicao_enum" ADD VALUE IF NOT EXISTS 'AGUARDANDO_ATESTE';
        EXCEPTION WHEN others THEN
          NULL;
        END;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        ALTER TYPE "public"."medicoes_status_enum" ADD VALUE IF NOT EXISTS 'DEVOLVIDA';
      EXCEPTION WHEN others THEN
        BEGIN
          ALTER TYPE "status_medicao_enum" ADD VALUE IF NOT EXISTS 'DEVOLVIDA';
        EXCEPTION WHEN others THEN
          NULL;
        END;
      END
      $$;
    `);

    // 2. Adicionar colunas do fornecedor
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "fornecedor_id" varchar NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "fornecedor_nome" varchar NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "fornecedor_observacoes" text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "data_submissao" timestamp NULL
    `);

    // 3. Adicionar colunas de nota fiscal
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "nota_fiscal_numero" varchar NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "nota_fiscal_valor" decimal(15,2) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "nota_fiscal_data" date NULL
    `);

    // 4. Adicionar colunas de ateste do fiscal
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "ateste_fiscal_id" varchar NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "ateste_fiscal_nome" varchar NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "ateste_data" timestamp NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "ateste_observacoes" text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "ateste_verificado_in_loco" boolean DEFAULT false
    `);

    // 5. Adicionar colunas de devolução
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "motivo_devolucao" text NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "medicoes" ADD COLUMN IF NOT EXISTS "data_devolucao" timestamp NULL
    `);

    // 6. Criar índices
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_medicoes_fornecedor_id" ON "medicoes" ("fornecedor_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_medicoes_status" ON "medicoes" ("status")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_medicoes_contrato_status" ON "medicoes" ("contrato_id", "status")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_medicoes_contrato_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_medicoes_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_medicoes_fornecedor_id"`);

    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "data_devolucao"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "motivo_devolucao"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "ateste_verificado_in_loco"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "ateste_observacoes"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "ateste_data"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "ateste_fiscal_nome"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "ateste_fiscal_id"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "nota_fiscal_data"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "nota_fiscal_valor"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "nota_fiscal_numero"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "data_submissao"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "fornecedor_observacoes"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "fornecedor_nome"`);
    await queryRunner.query(`ALTER TABLE "medicoes" DROP COLUMN IF EXISTS "fornecedor_id"`);
  }
}
