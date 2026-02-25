import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddQuantidadeMesesItemCronograma1772000007000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "itens_cronograma"
        ADD COLUMN IF NOT EXISTS "quantidade_meses" integer DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS "valor_mensal" decimal(15,2) NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      UPDATE "itens_cronograma"
        SET "valor_mensal" = "valor_total"
        WHERE "quantidade_meses" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "itens_cronograma"
        DROP COLUMN IF EXISTS "quantidade_meses",
        DROP COLUMN IF EXISTS "valor_mensal"
    `);
  }
}
