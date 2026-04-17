import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmpenhoOrdemServico20260417000001 implements MigrationInterface {
  name = 'AddEmpenhoOrdemServico20260417000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE ordens_servico_contrato
        ADD COLUMN IF NOT EXISTS numero_empenho VARCHAR(100) NULL
    `);

    await queryRunner.query(`
      INSERT INTO system_config (key, value, description, active)
      VALUES ('FATOR_TRANSPARENCIA_ID', 'cmlem', 'ID do órgão no Portal Fator Transparência (ex: cmlem)', true)
      ON CONFLICT (key) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE ordens_servico_contrato DROP COLUMN IF EXISTS numero_empenho`,
    );
    await queryRunner.query(
      `DELETE FROM system_config WHERE key = 'FATOR_TRANSPARENCIA_ID'`,
    );
  }
}
