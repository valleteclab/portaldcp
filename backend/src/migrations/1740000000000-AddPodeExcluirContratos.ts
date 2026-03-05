import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodeExcluirContratos1740000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE usuarios ADD COLUMN pode_excluir_contratos boolean DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE usuarios DROP COLUMN pode_excluir_contratos`,
    );
  }
}
