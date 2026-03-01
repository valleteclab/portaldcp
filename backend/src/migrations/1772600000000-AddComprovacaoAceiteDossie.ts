import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddComprovacaoAceiteDossie1772600000000 implements MigrationInterface {
  name = 'AddComprovacaoAceiteDossie1772600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recebimentos"
      ADD COLUMN IF NOT EXISTS "comprovacao_aceite_path" varchar(500) NULL,
      ADD COLUMN IF NOT EXISTS "comprovacao_aceite_codigo_validacao" varchar(16) NULL
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dossies_ordem" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "ordem_fornecimento_id" uuid NOT NULL REFERENCES "ordens_fornecimento"("id") ON DELETE CASCADE,
        "contrato_id" uuid NOT NULL REFERENCES "contratos"("id") ON DELETE CASCADE,
        "fiscal_id" varchar NULL,
        "entregue_financeiro_em" timestamp NULL,
        "entregue_financeiro_por" varchar NULL,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "dossies_anexo" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "dossie_ordem_id" uuid NOT NULL REFERENCES "dossies_ordem"("id") ON DELETE CASCADE,
        "nome_arquivo" varchar(255) NOT NULL,
        "caminho" varchar(500) NOT NULL,
        "tipo_mime" varchar(100) NOT NULL,
        "usuario_upload_id" varchar NOT NULL,
        "usuario_upload_nome" varchar(255) NOT NULL,
        "created_at" timestamp DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dossies_ordem_ordem_id" ON "dossies_ordem" ("ordem_fornecimento_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dossies_ordem_contrato_id" ON "dossies_ordem" ("contrato_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_dossies_ordem_fiscal_id" ON "dossies_ordem" ("fiscal_id")
    `);

    const existeNotif = await queryRunner.query(
      `SELECT 1 FROM pg_enum WHERE enumlabel = 'DOSSIE_FISCAL_DISPONIVEL' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'notificacoes_tipo_enum')`
    );
    if (!existeNotif || existeNotif.length === 0) {
      await queryRunner.query(
        `ALTER TYPE "notificacoes_tipo_enum" ADD VALUE IF NOT EXISTS 'DOSSIE_FISCAL_DISPONIVEL'`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "dossies_anexo"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "dossies_ordem"`);
    await queryRunner.query(`
      ALTER TABLE "recebimentos"
      DROP COLUMN IF EXISTS "comprovacao_aceite_path",
      DROP COLUMN IF EXISTS "comprovacao_aceite_codigo_validacao"
    `);
  }
}
