import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNumerosEmpenhosOSAndOF20260419000001 implements MigrationInterface {
  name = 'AddNumerosEmpenhosOSAndOF20260419000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ordens_servico_contrato
        ADD COLUMN IF NOT EXISTS numeros_empenhos JSONB NULL
    `);

    await queryRunner.query(`
      ALTER TABLE ordens_fornecimento
        ADD COLUMN IF NOT EXISTS numeros_empenhos JSONB NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ordens_servico_contrato DROP COLUMN IF EXISTS numeros_empenhos`,
    );
    await queryRunner.query(
      `ALTER TABLE ordens_fornecimento DROP COLUMN IF EXISTS numeros_empenhos`,
    );
  }
}
