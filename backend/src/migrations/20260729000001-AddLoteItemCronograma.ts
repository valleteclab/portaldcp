import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLoteItemCronograma20260729000001 implements MigrationInterface {
  name = 'AddLoteItemCronograma20260729000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "itens_cronograma"
      ADD COLUMN IF NOT EXISTS "lote_numero" integer NULL,
      ADD COLUMN IF NOT EXISTS "lote_descricao" character varying(255) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_itens_cronograma_contrato_lote"
      ON "itens_cronograma" ("contrato_id", "lote_numero")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "IDX_itens_cronograma_contrato_lote"`,
    );
    await queryRunner.query(`
      ALTER TABLE "itens_cronograma"
      DROP COLUMN IF EXISTS "lote_descricao",
      DROP COLUMN IF EXISTS "lote_numero"
    `);
  }
}
