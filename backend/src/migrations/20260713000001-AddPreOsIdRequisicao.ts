import { MigrationInterface, QueryRunner } from 'typeorm';

/** Vincula a Requisição/OS à pré-OS de publicidade que a originou (badge na lista). */
export class AddPreOsIdRequisicao20260713000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "requisicoes" ADD COLUMN IF NOT EXISTS "pre_os_id" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "requisicoes" DROP COLUMN IF EXISTS "pre_os_id"
    `);
  }
}
