import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddRequisicaoIdToMedicoes20260309020000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'medicoes',
      new TableColumn({
        name: 'requisicao_id',
        type: 'varchar',
        isNullable: true,
      })
    );

    // Criar índice para melhor performance
    await queryRunner.query(`
      CREATE INDEX "IDX_medicoes_requisicao_id" 
      ON "medicoes"("requisicao_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_medicoes_requisicao_id"`);
    await queryRunner.dropColumn('medicoes', 'requisicao_id');
  }
}
