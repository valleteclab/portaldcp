import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFluxoOsOrgao1772000004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "fluxo_os" varchar(20) DEFAULT 'REQUISICAO'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "fluxo_os"`);
  }
}
