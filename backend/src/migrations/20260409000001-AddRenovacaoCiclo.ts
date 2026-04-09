import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRenovacaoCiclo20260409000001 implements MigrationInterface {
  name = 'AddRenovacaoCiclo20260409000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE termos_aditivos
        ADD COLUMN IF NOT EXISTS renovacao_ciclo BOOLEAN NOT NULL DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS valor_ciclo DECIMAL(15,2) NULL
    `);
    await queryRunner.query(`
      ALTER TABLE contratos
        ADD COLUMN IF NOT EXISTS data_renovacao_ciclo DATE NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE contratos DROP COLUMN IF EXISTS data_renovacao_ciclo`);
    await queryRunner.query(`ALTER TABLE termos_aditivos DROP COLUMN IF EXISTS valor_ciclo, DROP COLUMN IF EXISTS renovacao_ciclo`);
  }
}
