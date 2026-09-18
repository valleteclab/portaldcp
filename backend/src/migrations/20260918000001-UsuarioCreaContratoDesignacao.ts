import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fiscal técnico contratado (engenheiro): registro profissional e o contrato
 * que o designou, para saírem no quadro de assinaturas do boletim.
 * Caso real: Ruslley Costa Sertão, contrato 014/2026 da Câmara de LEM,
 * assinando as medições do contrato de obra 006/2026 como fiscal.
 */
export class UsuarioCreaContratoDesignacao20260918000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usuarios"
        ADD COLUMN IF NOT EXISTS "crea" VARCHAR(40),
        ADD COLUMN IF NOT EXISTS "contrato_designacao" VARCHAR(60)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "usuarios"
        DROP COLUMN IF EXISTS "crea",
        DROP COLUMN IF EXISTS "contrato_designacao"
    `);
  }
}
