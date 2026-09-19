import { MigrationInterface, QueryRunner } from 'typeorm';

/** Patrimônio no SIGA (TCM-BA): tipo do bem, CPF do responsável e controle de envio. */
export class AddSigaPatrimonio20260919000003 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE categorias_bem
      ADD COLUMN IF NOT EXISTS siga_tipo_bem int NULL`);
    await queryRunner.query(`ALTER TABLE bens_patrimoniais
      ADD COLUMN IF NOT EXISTS responsavel_cpf varchar(14) NULL,
      ADD COLUMN IF NOT EXISTS siga_tipo_bem int NULL,
      ADD COLUMN IF NOT EXISTS siga_enviado_em timestamp NULL,
      ADD COLUMN IF NOT EXISTS siga_baixa_lancada_em timestamp NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE bens_patrimoniais
      DROP COLUMN IF EXISTS responsavel_cpf,
      DROP COLUMN IF EXISTS siga_tipo_bem,
      DROP COLUMN IF EXISTS siga_enviado_em,
      DROP COLUMN IF EXISTS siga_baixa_lancada_em`);
    await queryRunner.query(`ALTER TABLE categorias_bem DROP COLUMN IF EXISTS siga_tipo_bem`);
  }
}
