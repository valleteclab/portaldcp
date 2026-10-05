import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Dados da comissão na campanha de inventário, exigidos pelo relatório final:
 * a portaria que designou a comissão, o processo administrativo, os membros
 * (para os blocos de assinatura) e a autoridade que ratifica.
 *
 * Até aqui só existia `comissao`, um texto livre — bastava para o cabeçalho do
 * termo de setor, mas não para montar assinaturas nominais.
 */
export class InventarioDadosComissao1761300007000 implements MigrationInterface {
  name = 'InventarioDadosComissao1761300007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "patrimonio_inventarios"
        ADD COLUMN IF NOT EXISTS "portaria" character varying,
        ADD COLUMN IF NOT EXISTS "processo" character varying,
        ADD COLUMN IF NOT EXISTS "membros" jsonb,
        ADD COLUMN IF NOT EXISTS "autoridade_nome" character varying,
        ADD COLUMN IF NOT EXISTS "autoridade_cargo" character varying
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "patrimonio_inventarios"
        DROP COLUMN IF EXISTS "autoridade_cargo",
        DROP COLUMN IF EXISTS "autoridade_nome",
        DROP COLUMN IF EXISTS "membros",
        DROP COLUMN IF EXISTS "processo",
        DROP COLUMN IF EXISTS "portaria"
    `);
  }
}
