import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddItensFrotaContrato1773200000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'frota_contratos_abastecimento',
      new TableColumn({
        name: 'itens',
        type: 'jsonb',
        isNullable: true,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('frota_contratos_abastecimento', 'itens');
  }
}
