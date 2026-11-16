import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * DFD consolidado no fluxo do processo eletrônico: além de abrir uma
 * licitação (`licitacao_id`), o DFD pode ser juntado a um processo
 * eletrônico na etapa DFD do fluxo (`processo_id`). Um ou outro, nunca os dois.
 */
export class DfdConsolidadoProcessoEletronico1761300010000 implements MigrationInterface {
  name = 'DfdConsolidadoProcessoEletronico1761300010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dfds_consolidados" ADD COLUMN IF NOT EXISTS "processo_id" uuid`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "dfds_consolidados" DROP COLUMN IF EXISTS "processo_id"`);
  }
}
