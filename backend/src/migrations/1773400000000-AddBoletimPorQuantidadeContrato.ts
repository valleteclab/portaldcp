import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBoletimPorQuantidadeContrato1773400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contratos"
        ADD COLUMN IF NOT EXISTS "boletim_por_quantidade" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contratos"
        DROP COLUMN IF EXISTS "boletim_por_quantidade"
    `);
  }
}
