import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEhFiscalContrato1739923200000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Verifica se a coluna já existe antes de adicionar
    const hasColumn = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'eh_fiscal_contrato'`,
    );
    if (!hasColumn || hasColumn.length === 0) {
      await queryRunner.query(
        `ALTER TABLE "usuarios" ADD COLUMN "eh_fiscal_contrato" boolean NOT NULL DEFAULT false`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "eh_fiscal_contrato"`);
  }
}
