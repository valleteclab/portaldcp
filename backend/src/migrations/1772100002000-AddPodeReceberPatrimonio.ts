import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodeReceberPatrimonio1772100002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usuarios"
      ADD COLUMN IF NOT EXISTS "pode_receber_patrimonio" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "pode_receber_patrimonio"
    `);
  }
}
