import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class AddMensagensSolicitacaoMedicao1739930000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'mensagens_solicitacao_medicao',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, generationStrategy: 'uuid', default: 'uuid_generate_v4()' },
          { name: 'contrato_id', type: 'uuid', isNullable: false },
          { name: 'orgao_id', type: 'uuid', isNullable: false },
          { name: 'fornecedor_id', type: 'uuid', isNullable: false },
          { name: 'mes_referencia', type: 'varchar', length: '7', isNullable: false },
          { name: 'titulo', type: 'varchar', length: '255', isNullable: false },
          { name: 'mensagem', type: 'text', isNullable: false },
          { name: 'solicitado_por', type: 'uuid', isNullable: false },
          { name: 'solicitado_por_nome', type: 'varchar', length: '255', isNullable: false },
          { name: 'created_at', type: 'timestamp', default: 'now()', isNullable: false },
          { name: 'lida', type: 'boolean', default: false, isNullable: false },
          { name: 'lida_em', type: 'timestamp', isNullable: true },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      'mensagens_solicitacao_medicao',
      new TableForeignKey({
        columnNames: ['contrato_id'],
        referencedTableName: 'contratos',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.query(`
      CREATE INDEX "IDX_mensagens_solicitacao_orgao_created"
      ON "mensagens_solicitacao_medicao" ("orgao_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_mensagens_solicitacao_fornecedor_lida"
      ON "mensagens_solicitacao_medicao" ("fornecedor_id", "lida")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable('mensagens_solicitacao_medicao');
    if (table?.foreignKeys?.length) {
      await queryRunner.dropForeignKey('mensagens_solicitacao_medicao', table.foreignKeys[0]);
    }
    await queryRunner.dropTable('mensagens_solicitacao_medicao', true);
  }
}
