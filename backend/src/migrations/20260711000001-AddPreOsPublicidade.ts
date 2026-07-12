import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pré-OS de publicidade: proposta do fornecedor com aprovação prévia do órgão
 * (cláusulas 3.6/3.7 da Lei 12.232/2010) antes de virar Requisição/OS.
 */
export class AddPreOsPublicidade20260711000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "status_pre_os_enum" AS ENUM ('RASCUNHO','ENVIADA','DEVOLVIDA','ACEITA','CONVERTIDA')
    `);
    await queryRunner.query(`
      CREATE TABLE "pre_os_publicidade" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contrato_id" uuid NOT NULL,
        "orgao_id" uuid NOT NULL,
        "fornecedor_id" uuid NOT NULL,
        "sequencial" integer NOT NULL,
        "titulo" varchar NOT NULL,
        "justificativa" text,
        "linhas" jsonb NOT NULL,
        "valor_total_estimado" decimal(15,2) NOT NULL DEFAULT 0,
        "status" "status_pre_os_enum" NOT NULL DEFAULT 'RASCUNHO',
        "motivo_devolucao" text,
        "enviada_em" TIMESTAMP,
        "respondida_em" TIMESTAMP,
        "respondida_por_nome" varchar,
        "itens_gerados_ids" jsonb,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_pre_os_publicidade" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pre_os_publicidade_contrato" FOREIGN KEY ("contrato_id")
          REFERENCES "contratos"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_pre_os_publicidade_contrato" ON "pre_os_publicidade" ("contrato_id")`,
    );
    // Tipos de notificação do fluxo da pré-OS
    await queryRunner.query(`ALTER TYPE "notificacoes_tipo_enum" ADD VALUE IF NOT EXISTS 'PRE_OS_ENVIADA'`);
    await queryRunner.query(`ALTER TYPE "notificacoes_tipo_enum" ADD VALUE IF NOT EXISTS 'PRE_OS_DEVOLVIDA'`);
    await queryRunner.query(`ALTER TYPE "notificacoes_tipo_enum" ADD VALUE IF NOT EXISTS 'PRE_OS_ACEITA'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_pre_os_publicidade_contrato"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "pre_os_publicidade"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "status_pre_os_enum"`);
  }
}
