import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrdemServicoFieldsToRequisicao1739491200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Adicionar ORDEM_SERVICO ao enum tipo_requisicao se ainda não existir
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "tipo_requisicao_enum" ADD VALUE IF NOT EXISTS 'ORDEM_SERVICO';
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `).catch(() => {
      // Se o tipo não existir como enum (pode ser varchar), ignora
    });

    // 2. Adicionar campos específicos de OS na tabela requisicoes
    await queryRunner.query(`
      ALTER TABLE "requisicoes"
      ADD COLUMN IF NOT EXISTS "descricao_os" text,
      ADD COLUMN IF NOT EXISTS "local_execucao" text,
      ADD COLUMN IF NOT EXISTS "data_inicio_prevista" date,
      ADD COLUMN IF NOT EXISTS "data_fim_prevista" date,
      ADD COLUMN IF NOT EXISTS "prazo_execucao_dias" integer,
      ADD COLUMN IF NOT EXISTS "responsavel_tecnico" varchar,
      ADD COLUMN IF NOT EXISTS "fiscal_contrato_id" varchar,
      ADD COLUMN IF NOT EXISTS "fiscal_contrato_nome" varchar
    `);

    // 3. Índice para buscar OS por contrato
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_requisicoes_contrato_tipo" 
      ON "requisicoes" ("contrato_id", "tipo")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_requisicoes_contrato_tipo"`);

    await queryRunner.query(`
      ALTER TABLE "requisicoes"
      DROP COLUMN IF EXISTS "descricao_os",
      DROP COLUMN IF EXISTS "local_execucao",
      DROP COLUMN IF EXISTS "data_inicio_prevista",
      DROP COLUMN IF EXISTS "data_fim_prevista",
      DROP COLUMN IF EXISTS "prazo_execucao_dias",
      DROP COLUMN IF EXISTS "responsavel_tecnico",
      DROP COLUMN IF EXISTS "fiscal_contrato_id",
      DROP COLUMN IF EXISTS "fiscal_contrato_nome"
    `);
  }
}
