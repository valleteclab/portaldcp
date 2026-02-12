import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLiberacaoContratos1739318400000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Adicionar novos valores ao enum StatusContrato
    // PostgreSQL não permite ALTER TYPE ... ADD VALUE dentro de transação,
    // então precisamos fazer fora de transação ou usar workaround
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'RASCUNHO' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'contratos_status_enum')) THEN
          ALTER TYPE contratos_status_enum ADD VALUE 'RASCUNHO';
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'AGUARDANDO_LIBERACAO' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'contratos_status_enum')) THEN
          ALTER TYPE contratos_status_enum ADD VALUE 'AGUARDANDO_LIBERACAO';
        END IF;
      END
      $$;
    `);

    // 2. Adicionar colunas de liberação na tabela contratos
    await queryRunner.query(`
      ALTER TABLE contratos
      ADD COLUMN IF NOT EXISTS liberado_por_id VARCHAR,
      ADD COLUMN IF NOT EXISTS liberado_por_nome VARCHAR,
      ADD COLUMN IF NOT EXISTS liberado_em TIMESTAMP;
    `);

    // 3. Adicionar coluna pode_liberar_contratos na tabela usuarios
    await queryRunner.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS pode_liberar_contratos BOOLEAN DEFAULT false;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover colunas de liberação
    await queryRunner.query(`
      ALTER TABLE contratos
      DROP COLUMN IF EXISTS liberado_por_id,
      DROP COLUMN IF EXISTS liberado_por_nome,
      DROP COLUMN IF EXISTS liberado_em;
    `);

    await queryRunner.query(`
      ALTER TABLE usuarios
      DROP COLUMN IF EXISTS pode_liberar_contratos;
    `);

    // Nota: Remover valores de enum no PostgreSQL é complexo e não recomendado.
    // Os valores RASCUNHO e AGUARDANDO_LIBERACAO permanecerão no enum.
  }
}
