import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLogoOrgao1768400004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "logo_url" varchar(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "logo_url"`);
  }
}
