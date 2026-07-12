import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fase 2 da pré-OS: conversão automática em Requisição/OS + PDF da aprovação prévia. */
export class AddPreOsConversao20260712000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pre_os_publicidade"
      ADD COLUMN IF NOT EXISTS "requisicao_id" uuid,
      ADD COLUMN IF NOT EXISTS "pdf_url" varchar
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "pre_os_publicidade"
      DROP COLUMN IF EXISTS "pdf_url",
      DROP COLUMN IF EXISTS "requisicao_id"
    `);
  }
}
