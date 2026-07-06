import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBoletimDataEmissaoMedicao20260706000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE medicoes ADD COLUMN IF NOT EXISTS boletim_data_emissao date DEFAULT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE medicoes DROP COLUMN IF EXISTS boletim_data_emissao`
    );
  }
}
