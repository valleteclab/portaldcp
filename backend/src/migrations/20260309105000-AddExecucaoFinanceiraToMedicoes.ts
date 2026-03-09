import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddExecucaoFinanceiraToMedicoes20260309105000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'medicoes',
      new TableColumn({
        name: 'execucao_financeira',
        type: 'json',
        isNullable: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('medicoes', 'execucao_financeira');
  }
}
