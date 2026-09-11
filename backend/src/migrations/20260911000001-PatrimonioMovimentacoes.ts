import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patrimônio fase 3: movimentações (transferência com aceite, baixa formal,
 * empréstimo) e parâmetros de depreciação por categoria.
 */
export class PatrimonioMovimentacoes20260911000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bens_patrimoniais"
        ADD COLUMN IF NOT EXISTS "emprestado_para" varchar,
        ADD COLUMN IF NOT EXISTS "emprestado_ate" date,
        ADD COLUMN IF NOT EXISTS "data_baixa" date,
        ADD COLUMN IF NOT EXISTS "motivo_baixa" varchar
    `);
    await queryRunner.query(`
      ALTER TABLE "categorias_bem"
        ADD COLUMN IF NOT EXISTS "vida_util_anos" integer,
        ADD COLUMN IF NOT EXISTS "valor_residual_pct" numeric(5,2) NOT NULL DEFAULT 10,
        ADD COLUMN IF NOT EXISTS "conta_contabil" varchar
    `);
    // Vida útil de referência (MCASP / tabela usual) para as categorias do sistema
    await queryRunner.query(`
      UPDATE "categorias_bem" SET "vida_util_anos" = CASE "nome"
        WHEN 'Informática' THEN 5
        WHEN 'Móveis' THEN 10
        WHEN 'Veículos' THEN 15
        WHEN 'Elétrico' THEN 10
        WHEN 'Mat. Elétrico' THEN 10
        WHEN 'Eletrônico' THEN 10
        ELSE "vida_util_anos" END
      WHERE "sistema" = true AND "vida_util_anos" IS NULL
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'patrimonio_movimentacoes_tipo_enum') THEN
          CREATE TYPE "patrimonio_movimentacoes_tipo_enum" AS ENUM ('TRANSFERENCIA', 'BAIXA', 'EMPRESTIMO');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'patrimonio_movimentacoes_status_enum') THEN
          CREATE TYPE "patrimonio_movimentacoes_status_enum" AS ENUM ('PENDENTE', 'ACEITA', 'RECUSADA', 'CANCELADA', 'EM_ANDAMENTO', 'CONCLUIDA');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'patrimonio_movimentacoes_motivo_baixa_enum') THEN
          CREATE TYPE "patrimonio_movimentacoes_motivo_baixa_enum" AS ENUM ('INSERVIVEL', 'ALIENACAO', 'DOACAO', 'FURTO_EXTRAVIO', 'OUTRO');
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patrimonio_movimentacoes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orgao_id" uuid NOT NULL,
        "bem_id" uuid NOT NULL,
        "lote_id" uuid NOT NULL,
        "tipo" "patrimonio_movimentacoes_tipo_enum" NOT NULL,
        "status" "patrimonio_movimentacoes_status_enum" NOT NULL DEFAULT 'PENDENTE',
        "setor_origem_id" uuid,
        "setor_origem_nome" varchar,
        "setor_destino_id" uuid,
        "setor_destino_nome" varchar,
        "responsavel_origem_nome" varchar,
        "responsavel_destino_nome" varchar,
        "responsavel_destino_telefone" varchar,
        "destino_texto" varchar,
        "token_aceite" varchar(64),
        "motivo" text,
        "motivo_baixa" "patrimonio_movimentacoes_motivo_baixa_enum",
        "documento_url" varchar,
        "data_prevista_retorno" date,
        "data_retorno" date,
        "solicitado_por" varchar,
        "aceito_por" varchar,
        "aceito_em" timestamp,
        "recusa_motivo" text,
        "inventario_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_patrimonio_movimentacoes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pat_mov_bem" FOREIGN KEY ("bem_id") REFERENCES "bens_patrimoniais"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pat_mov_orgao" ON "patrimonio_movimentacoes" ("orgao_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pat_mov_bem" ON "patrimonio_movimentacoes" ("bem_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pat_mov_lote" ON "patrimonio_movimentacoes" ("lote_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pat_mov_token" ON "patrimonio_movimentacoes" ("token_aceite")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "patrimonio_movimentacoes"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "patrimonio_movimentacoes_motivo_baixa_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "patrimonio_movimentacoes_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "patrimonio_movimentacoes_tipo_enum"`);
    await queryRunner.query(`ALTER TABLE "categorias_bem" DROP COLUMN IF EXISTS "conta_contabil", DROP COLUMN IF EXISTS "valor_residual_pct", DROP COLUMN IF EXISTS "vida_util_anos"`);
    await queryRunner.query(`ALTER TABLE "bens_patrimoniais" DROP COLUMN IF EXISTS "motivo_baixa", DROP COLUMN IF EXISTS "data_baixa", DROP COLUMN IF EXISTS "emprestado_ate", DROP COLUMN IF EXISTS "emprestado_para"`);
  }
}
