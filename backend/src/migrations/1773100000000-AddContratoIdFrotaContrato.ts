import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AddContratoIdFrotaContrato1773100000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'frota_contratos_abastecimento',
      new TableColumn({
        name: 'contrato_id',
        type: 'uuid',
        isNullable: true,
      }),
    );

    await queryRunner.createForeignKey(
      'frota_contratos_abastecimento',
      new TableForeignKey({
        columnNames: ['contrato_id'],
        referencedTableName: 'contratos',
        referencedColumnNames: ['id'],
        onDelete: 'SET NULL',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('frota_contratos_abastecimento');
    const fk = table?.foreignKeys.find(
      (k) => k.columnNames.indexOf('contrato_id') !== -1,
    );
    if (fk) await queryRunner.dropForeignKey('frota_contratos_abastecimento', fk);
    await queryRunner.dropColumn('frota_contratos_abastecimento', 'contrato_id');
  }
}
