import { MigrationInterface, QueryRunner } from 'typeorm';

/** Campos do cadastro de frota exigidos pelo SIGA (TCM-BA), tabela 68. */
export class AddSigaFrota20260919000004 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE frota_veiculos
      ADD COLUMN IF NOT EXISTS siga_tipo_veiculo integer NULL,
      ADD COLUMN IF NOT EXISTS siga_marca_veiculo integer NULL,
      ADD COLUMN IF NOT EXISTS alugado boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS nota_fiscal_ou_contrato varchar NULL,
      ADD COLUMN IF NOT EXISTS valor_aquisicao decimal(15,2) NULL,
      ADD COLUMN IF NOT EXISTS numero_empenho varchar NULL,
      ADD COLUMN IF NOT EXISTS data_aquisicao date NULL,
      ADD COLUMN IF NOT EXISTS data_baixa date NULL,
      ADD COLUMN IF NOT EXISTS siga_enviado_em timestamptz NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE frota_veiculos
      DROP COLUMN IF EXISTS siga_tipo_veiculo,
      DROP COLUMN IF EXISTS siga_marca_veiculo,
      DROP COLUMN IF EXISTS alugado,
      DROP COLUMN IF EXISTS nota_fiscal_ou_contrato,
      DROP COLUMN IF EXISTS valor_aquisicao,
      DROP COLUMN IF EXISTS numero_empenho,
      DROP COLUMN IF EXISTS data_aquisicao,
      DROP COLUMN IF EXISTS data_baixa,
      DROP COLUMN IF EXISTS siga_enviado_em`);
  }
}
