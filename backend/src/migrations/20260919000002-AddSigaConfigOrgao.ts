import { MigrationInterface, QueryRunner } from 'typeorm';

/** Códigos do SIGA (TCM-BA) no cadastro do órgão. */
export class AddSigaConfigOrgao20260919000002 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE orgaos
      ADD COLUMN IF NOT EXISTS siga_codigo_unidade varchar(4) NULL,
      ADD COLUMN IF NOT EXISTS siga_codigo_orgao varchar(4) NULL,
      ADD COLUMN IF NOT EXISTS siga_codigo_unidade_orcamentaria varchar(4) NULL,
      ADD COLUMN IF NOT EXISTS siga_data_inicio date NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE orgaos
      DROP COLUMN IF EXISTS siga_codigo_unidade,
      DROP COLUMN IF EXISTS siga_codigo_orgao,
      DROP COLUMN IF EXISTS siga_codigo_unidade_orcamentaria,
      DROP COLUMN IF EXISTS siga_data_inicio`);
  }
}
