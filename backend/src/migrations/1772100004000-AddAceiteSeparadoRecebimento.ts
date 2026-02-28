import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Aceite separado Almoxarifado / Patrimônio
 * Adiciona colunas para rastrear aceite por grupo (CONSUMO vs PERMANENTE)
 * e novos status PENDENTE_ALMOXARIFADO e PENDENTE_PATRIMONIO.
 */
export class AddAceiteSeparadoRecebimento1772100004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Adicionar novos valores ao enum de status (se existir)
    const [enumRow] = await queryRunner.query(
      `SELECT typname FROM pg_type WHERE typname = 'recebimentos_status_enum'`
    ) as { typname: string }[];
    if (enumRow) {
      await queryRunner.query(
        `ALTER TYPE "recebimentos_status_enum" ADD VALUE IF NOT EXISTS 'PENDENTE_ALMOXARIFADO'`
      );
      await queryRunner.query(
        `ALTER TYPE "recebimentos_status_enum" ADD VALUE IF NOT EXISTS 'PENDENTE_PATRIMONIO'`
      );
    }

    // 2. Colunas de aceite almoxarifado (itens CONSUMO)
    await queryRunner.query(`
      ALTER TABLE "recebimentos"
      ADD COLUMN IF NOT EXISTS "aceite_almoxarifado_data" timestamp NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "recebimentos"
      ADD COLUMN IF NOT EXISTS "aceite_almoxarifado_usuario_id" varchar NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "recebimentos"
      ADD COLUMN IF NOT EXISTS "aceite_almoxarifado_usuario_nome" varchar NULL
    `);

    // 3. Colunas de aceite patrimônio (itens PERMANENTE)
    await queryRunner.query(`
      ALTER TABLE "recebimentos"
      ADD COLUMN IF NOT EXISTS "aceite_patrimonio_data" timestamp NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "recebimentos"
      ADD COLUMN IF NOT EXISTS "aceite_patrimonio_usuario_id" varchar NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "recebimentos"
      ADD COLUMN IF NOT EXISTS "aceite_patrimonio_usuario_nome" varchar NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "recebimentos" DROP COLUMN IF EXISTS "aceite_almoxarifado_data"`);
    await queryRunner.query(`ALTER TABLE "recebimentos" DROP COLUMN IF EXISTS "aceite_almoxarifado_usuario_id"`);
    await queryRunner.query(`ALTER TABLE "recebimentos" DROP COLUMN IF EXISTS "aceite_almoxarifado_usuario_nome"`);
    await queryRunner.query(`ALTER TABLE "recebimentos" DROP COLUMN IF EXISTS "aceite_patrimonio_data"`);
    await queryRunner.query(`ALTER TABLE "recebimentos" DROP COLUMN IF EXISTS "aceite_patrimonio_usuario_id"`);
    await queryRunner.query(`ALTER TABLE "recebimentos" DROP COLUMN IF EXISTS "aceite_patrimonio_usuario_nome"`);
    // Nota: Não é possível remover valores de enum no PostgreSQL sem recriar o tipo
  }
}
