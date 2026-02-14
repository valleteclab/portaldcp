import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class AddDiscriminacoesDespesaMedicao1739940000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'discriminacoes_despesa_medicao',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'medicao_id', type: 'uuid', isNullable: false },
          { name: 'numero_item', type: 'int', isNullable: false },
          { name: 'descricao', type: 'varchar', length: '255', isNullable: false },
          { name: 'valor', type: 'decimal', precision: 15, scale: 2, isNullable: false },
          { name: 'percentual', type: 'decimal', precision: 7, scale: 4, isNullable: false },
          { name: 'corrigido_por_id', type: 'uuid', isNullable: true },
          { name: 'corrigido_por_nome', type: 'varchar', length: '255', isNullable: true },
          { name: 'corrigido_em', type: 'timestamp', isNullable: true },
          { name: 'motivo_correcao', type: 'text', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
          { name: 'updated_at', type: 'timestamp', default: 'now()', isNullable: false },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'discriminacoes_despesa_medicao',
      new TableForeignKey({
        columnNames: ['medicao_id'],
        referencedTableName: 'medicoes',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createIndex(
      'discriminacoes_despesa_medicao',
      new TableIndex({
        name: 'IDX_discriminacoes_medicao_id',
        columnNames: ['medicao_id'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('discriminacoes_despesa_medicao');
    if (table) {
      const fk = table.foreignKeys.find((fk) => fk.columnNames.indexOf('medicao_id') !== -1);
      if (fk) {
        await queryRunner.dropForeignKey('discriminacoes_despesa_medicao', fk);
      }
    }
    await queryRunner.dropTable('discriminacoes_despesa_medicao', true);
  }
}
