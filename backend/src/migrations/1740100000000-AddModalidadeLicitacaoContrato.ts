import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModalidadeLicitacaoContrato1740100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contratos" 
      ADD COLUMN IF NOT EXISTS "modalidade_licitacao" varchar(50) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contratos" DROP COLUMN IF EXISTS "modalidade_licitacao"
    `);
  }
}
