import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTipoItemContrato1772100001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "tipo_item_contrato_enum" AS ENUM ('CONSUMO', 'PERMANENTE')
    `);

    await queryRunner.query(`
      ALTER TABLE "itens_contrato"
      ADD COLUMN "tipo_item" "tipo_item_contrato_enum" NOT NULL DEFAULT 'CONSUMO'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "itens_contrato" DROP COLUMN IF EXISTS "tipo_item"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "tipo_item_contrato_enum"
    `);
  }
}
