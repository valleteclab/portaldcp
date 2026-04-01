import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMesesSolicitadosRequisicaoItemOS20260401000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE requisicao_itens_os ADD COLUMN IF NOT EXISTS meses_solicitados INTEGER DEFAULT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE requisicao_itens_os DROP COLUMN IF EXISTS meses_solicitados`
    );
  }
}
