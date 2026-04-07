import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSpedyFieldsFornecedor1772200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fornecedores
        ADD COLUMN IF NOT EXISTS spedy_company_id VARCHAR NULL,
        ADD COLUMN IF NOT EXISTS spedy_api_key VARCHAR NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE fornecedores
        DROP COLUMN IF EXISTS spedy_company_id,
        DROP COLUMN IF EXISTS spedy_api_key
    `);
  }
}
