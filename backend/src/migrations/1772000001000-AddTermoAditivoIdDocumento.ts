import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTermoAditivoIdDocumento1772000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "documentos_contrato"
      ADD COLUMN "termo_aditivo_id" uuid NULL,
      ADD CONSTRAINT "FK_documentos_contrato_termo_aditivo"
        FOREIGN KEY ("termo_aditivo_id") REFERENCES "termos_aditivos"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_documentos_contrato_termo_aditivo_id" ON "documentos_contrato" ("termo_aditivo_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "documentos_contrato" DROP CONSTRAINT IF EXISTS "FK_documentos_contrato_termo_aditivo"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_documentos_contrato_termo_aditivo_id"`);
    await queryRunner.query(`ALTER TABLE "documentos_contrato" DROP COLUMN IF EXISTS "termo_aditivo_id"`);
  }
}
