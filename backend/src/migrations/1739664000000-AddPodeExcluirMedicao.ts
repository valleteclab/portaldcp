import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodeExcluirMedicao1739664000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verificar se a coluna já existe antes de adicionar
    const table = await queryRunner.getTable('usuarios');
    if (table && !table.findColumnByName('pode_excluir_medicao')) {
      await queryRunner.query(
        `ALTER TABLE "usuarios" ADD COLUMN "pode_excluir_medicao" boolean NOT NULL DEFAULT false`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('usuarios');
    if (table && table.findColumnByName('pode_excluir_medicao')) {
      await queryRunner.query(
        `ALTER TABLE "usuarios" DROP COLUMN "pode_excluir_medicao"`
      );
    }
  }
}
