import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tela "Desenhar o fluxo": o fluxo diz para qual tipo de processo serve (as
 * etapas exigidas por lei dependem disso) e as versões de um mesmo fluxo
 * ficam numa família — editar um fluxo ativo cria um rascunho novo, e os
 * processos em andamento seguem na versão com que começaram.
 */
export class WorkflowVersoesDesenho1761300011000 implements MigrationInterface {
  name = 'WorkflowVersoesDesenho1761300011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "workflow_modelos"
        ADD COLUMN IF NOT EXISTS "tipo_processo" character varying(30),
        ADD COLUMN IF NOT EXISTS "familia_id" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "workflow_modelos" DROP COLUMN IF EXISTS "familia_id", DROP COLUMN IF EXISTS "tipo_processo"`);
  }
}
