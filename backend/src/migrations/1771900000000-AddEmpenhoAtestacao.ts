import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmpenhoAtestacao1771900000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "atestacoes_mensais"
      ADD COLUMN IF NOT EXISTS "empenho" varchar(100),
      ADD COLUMN IF NOT EXISTS "data_empenho" date,
      ADD COLUMN IF NOT EXISTS "tipo_empenho" varchar(20)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "atestacoes_mensais"
      DROP COLUMN IF EXISTS "empenho",
      DROP COLUMN IF EXISTS "data_empenho",
      DROP COLUMN IF EXISTS "tipo_empenho"
    `);
  }
}
