import { MigrationInterface, QueryRunner } from 'typeorm';

/** Fluxo de Contratação por modalidade: onde cada fluxo vale (modalidades, enquadramentos, padrão). */
export class WorkflowAplicacao1761300014000 implements MigrationInterface {
  name = 'WorkflowAplicacao1761300014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workflow_modelos" ADD COLUMN IF NOT EXISTS "aplicacao" jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workflow_modelos" DROP COLUMN IF EXISTS "aplicacao"`);
  }
}
