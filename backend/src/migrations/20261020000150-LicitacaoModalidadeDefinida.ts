import { MigrationInterface, QueryRunner } from 'typeorm';

/** Modalidade provisória: o processo abre "a definir" e a etapa Definição da modalidade confirma. */
export class LicitacaoModalidadeDefinida1761300015000 implements MigrationInterface {
  name = 'LicitacaoModalidadeDefinida1761300015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "licitacoes" ADD COLUMN IF NOT EXISTS "modalidade_definida" boolean NOT NULL DEFAULT true`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "licitacoes" DROP COLUMN IF EXISTS "modalidade_definida"`);
  }
}
