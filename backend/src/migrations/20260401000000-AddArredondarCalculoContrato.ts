import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddArredondarCalculoContrato20260401000000 implements MigrationInterface {
  async up(qr: QueryRunner): Promise<void> {
    await qr.query(`
      ALTER TABLE contratos
        ADD COLUMN IF NOT EXISTS arredondar_calculo BOOLEAN NOT NULL DEFAULT TRUE
    `);
  }

  async down(qr: QueryRunner): Promise<void> {
    await qr.query(`ALTER TABLE contratos DROP COLUMN IF EXISTS arredondar_calculo`);
  }
}
