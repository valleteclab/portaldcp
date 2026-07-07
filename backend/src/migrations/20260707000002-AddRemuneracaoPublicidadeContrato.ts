import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Configuração de remuneração para contratos de agência de publicidade
 * (Lei 12.232/2010): percentuais de desconto sobre tabela SINAPRO e
 * honorários, além do vínculo com a tabela de referência do órgão.
 */
export class AddRemuneracaoPublicidadeContrato20260707000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contratos"
      ADD COLUMN IF NOT EXISTS "tabela_referencia_id" uuid,
      ADD COLUMN IF NOT EXISTS "remuneracao_publicidade" jsonb
    `);
    await queryRunner.query(`
      ALTER TABLE "contratos"
      ADD CONSTRAINT "FK_contratos_tabela_referencia" FOREIGN KEY ("tabela_referencia_id")
        REFERENCES "tabelas_referencia_preco"("id") ON DELETE SET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contratos" DROP CONSTRAINT IF EXISTS "FK_contratos_tabela_referencia"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contratos" DROP COLUMN IF EXISTS "remuneracao_publicidade"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contratos" DROP COLUMN IF EXISTS "tabela_referencia_id"`,
    );
  }
}
