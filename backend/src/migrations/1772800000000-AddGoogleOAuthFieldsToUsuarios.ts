import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddGoogleOAuthFieldsToUsuarios1772800000000 implements MigrationInterface {
  name = 'AddGoogleOAuthFieldsToUsuarios1772800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Adicionar google_id
    await queryRunner.addColumn(
      'usuarios',
      new TableColumn({
        name: 'google_id',
        type: 'varchar',
        length: '255',
        isNullable: true,
      }),
    );

    // Adicionar status com enum
    await queryRunner.addColumn(
      'usuarios',
      new TableColumn({
        name: 'status',
        type: 'enum',
        enum: ['PENDENTE', 'ATIVO', 'BLOQUEADO', 'INATIVO'],
        default: "'PENDENTE'",
      }),
    );

    // Adicionar data_solicitacao
    await queryRunner.addColumn(
      'usuarios',
      new TableColumn({
        name: 'data_solicitacao',
        type: 'timestamp',
        isNullable: true,
        default: 'CURRENT_TIMESTAMP',
      }),
    );

    // Adicionar data_aprovacao
    await queryRunner.addColumn(
      'usuarios',
      new TableColumn({
        name: 'data_aprovacao',
        type: 'timestamp',
        isNullable: true,
      }),
    );

    // Adicionar aprovado_por
    await queryRunner.addColumn(
      'usuarios',
      new TableColumn({
        name: 'aprovado_por',
        type: 'uuid',
        isNullable: true,
      }),
    );

    // Adicionar google_login flag
    await queryRunner.addColumn(
      'usuarios',
      new TableColumn({
        name: 'google_login',
        type: 'boolean',
        default: false,
      }),
    );

    // Criar índice para google_id (único) usando SQL raw
    await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_USUARIOS_GOOGLE_ID" ON "usuarios" ("google_id") 
      WHERE "google_id" IS NOT NULL
    `);

    // Criar índice para status (para consultas rápidas de filtragem)
    await queryRunner.query(`
      CREATE INDEX "IDX_USUARIOS_STATUS" ON "usuarios" ("status")
    `);

    // Atualizar usuários existentes para status ATIVO (se já existirem)
    await queryRunner.query(`
      UPDATE usuarios 
      SET status = 'ATIVO', 
          data_solicitacao = created_at,
          data_aprovacao = created_at
      WHERE status IS NULL OR status = 'PENDENTE'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover índices
    await queryRunner.dropIndex('usuarios', 'IDX_USUARIOS_STATUS');
    await queryRunner.dropIndex('usuarios', 'IDX_USUARIOS_GOOGLE_ID');

    // Remover colunas
    await queryRunner.dropColumn('usuarios', 'google_login');
    await queryRunner.dropColumn('usuarios', 'aprovado_por');
    await queryRunner.dropColumn('usuarios', 'data_aprovacao');
    await queryRunner.dropColumn('usuarios', 'data_solicitacao');
    await queryRunner.dropColumn('usuarios', 'status');
    await queryRunner.dropColumn('usuarios', 'google_id');
  }
}
