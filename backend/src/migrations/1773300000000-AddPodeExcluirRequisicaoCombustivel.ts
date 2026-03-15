import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodeExcluirRequisicaoCombustivel1773300000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE usuarios ADD COLUMN pode_excluir_requisicao_combustivel boolean DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE usuarios DROP COLUMN pode_excluir_requisicao_combustivel`,
    );
  }
}
