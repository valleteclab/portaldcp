import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuantidadeApresentadaRequisicaoItemOS20260602000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE requisicao_itens_os ADD COLUMN IF NOT EXISTS quantidade_apresentada numeric(15,4) DEFAULT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE requisicao_itens_os DROP COLUMN IF EXISTS quantidade_apresentada`
    );
  }
}
