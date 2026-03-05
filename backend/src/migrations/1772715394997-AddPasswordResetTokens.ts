import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class AddPasswordResetTokens1772715394997 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(
            new Table({
                name: 'password_reset_tokens',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'fornecedor_id',
                        type: 'uuid',
                    },
                    {
                        name: 'token',
                        type: 'varchar',
                        length: '255',
                    },
                    {
                        name: 'expires_at',
                        type: 'timestamp',
                    },
                    {
                        name: 'used',
                        type: 'boolean',
                        default: false,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'now()',
                    },
                ],
            }),
            true,
        );

        await queryRunner.createForeignKey(
            'password_reset_tokens',
            new TableForeignKey({
                columnNames: ['fornecedor_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'fornecedores',
                onDelete: 'CASCADE',
            }),
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        const table = await queryRunner.getTable('password_reset_tokens');
        if (table) {
            const foreignKey = table.foreignKeys.find(fk => fk.columnNames.indexOf('fornecedor_id') !== -1);
            if (foreignKey) {
                await queryRunner.dropForeignKey('password_reset_tokens', foreignKey);
            }
        }
        await queryRunner.dropTable('password_reset_tokens');
    }

}
