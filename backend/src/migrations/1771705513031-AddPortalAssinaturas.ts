import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";

export class AddPortalAssinaturas1771705513031 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Criar tabela documentos_assinatura
        await queryRunner.createTable(
            new Table({
                name: 'documentos_assinatura',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'orgao_id',
                        type: 'uuid',
                    },
                    {
                        name: 'titulo',
                        type: 'varchar',
                        length: '255',
                    },
                    {
                        name: 'descricao',
                        type: 'text',
                        isNullable: true,
                    },
                    {
                        name: 'arquivo_original_url',
                        type: 'varchar',
                        length: '500',
                    },
                    {
                        name: 'arquivo_assinado_url',
                        type: 'varchar',
                        length: '500',
                        isNullable: true,
                    },
                    {
                        name: 'status',
                        type: 'enum',
                        enum: ['RASCUNHO', 'AGUARDANDO_ASSINATURAS', 'CONCLUIDO', 'CANCELADO'],
                        default: "'RASCUNHO'",
                    },
                    {
                        name: 'criado_por_id',
                        type: 'uuid',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'now()',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamp',
                        default: 'now()',
                    }
                ]
            }),
            true
        );

        // Foreign Key para orgao_id em documentos_assinatura
        await queryRunner.createForeignKey(
            'documentos_assinatura',
            new TableForeignKey({
                columnNames: ['orgao_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'orgaos',
                onDelete: 'CASCADE',
            })
        );

        // Criar tabela signatarios_documento
        await queryRunner.createTable(
            new Table({
                name: 'signatarios_documento',
                columns: [
                    {
                        name: 'id',
                        type: 'uuid',
                        isPrimary: true,
                        generationStrategy: 'uuid',
                        default: 'uuid_generate_v4()',
                    },
                    {
                        name: 'documento_id',
                        type: 'uuid',
                    },
                    {
                        name: 'nome',
                        type: 'varchar',
                        length: '255',
                    },
                    {
                        name: 'cpf_cnpj',
                        type: 'varchar',
                        length: '20',
                    },
                    {
                        name: 'email',
                        type: 'varchar',
                        length: '255',
                        isNullable: true,
                    },
                    {
                        name: 'telefone',
                        type: 'varchar',
                        length: '20',
                        isNullable: true,
                    },
                    {
                        name: 'status',
                        type: 'enum',
                        enum: ['PENDENTE', 'ASSINADO', 'REJEITADO'],
                        default: "'PENDENTE'",
                    },
                    {
                        name: 'token_acesso',
                        type: 'varchar',
                        length: '64',
                        isUnique: true,
                    },
                    {
                        name: 'codigo_validacao',
                        type: 'varchar',
                        length: '16',
                        isNullable: true,
                    },
                    {
                        name: 'data_assinatura',
                        type: 'timestamp',
                        isNullable: true,
                    },
                    {
                        name: 'ip_address',
                        type: 'varchar',
                        length: '45',
                        isNullable: true,
                    },
                    {
                        name: 'user_agent',
                        type: 'varchar',
                        length: '500',
                        isNullable: true,
                    },
                    {
                        name: 'created_at',
                        type: 'timestamp',
                        default: 'now()',
                    },
                    {
                        name: 'updated_at',
                        type: 'timestamp',
                        default: 'now()',
                    }
                ]
            }),
            true
        );

        // Foreign Key para documento_id em signatarios_documento
        await queryRunner.createForeignKey(
            'signatarios_documento',
            new TableForeignKey({
                columnNames: ['documento_id'],
                referencedColumnNames: ['id'],
                referencedTableName: 'documentos_assinatura',
                onDelete: 'CASCADE',
            })
        );
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop signatarios_documento
        const tableSignatarios = await queryRunner.getTable('signatarios_documento');
        if (tableSignatarios) {
            const foreignKeySignatarios = tableSignatarios.foreignKeys.find(fk => fk.columnNames.indexOf('documento_id') !== -1);
            if (foreignKeySignatarios) {
                await queryRunner.dropForeignKey('signatarios_documento', foreignKeySignatarios);
            }
        }
        await queryRunner.dropTable('signatarios_documento');

        // Drop documentos_assinatura
        const tableDocs = await queryRunner.getTable('documentos_assinatura');
        if (tableDocs) {
            const foreignKeyDocs = tableDocs.foreignKeys.find(fk => fk.columnNames.indexOf('orgao_id') !== -1);
            if (foreignKeyDocs) {
                await queryRunner.dropForeignKey('documentos_assinatura', foreignKeyDocs);
            }
        }
        await queryRunner.dropTable('documentos_assinatura');
    }
}
