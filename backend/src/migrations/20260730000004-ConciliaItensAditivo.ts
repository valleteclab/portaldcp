import { MigrationInterface, QueryRunner } from 'typeorm';

export class ConciliaItensAditivo20260730000004 implements MigrationInterface {
  name = 'ConciliaItensAditivo20260730000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "termos_aditivos" ADD COLUMN IF NOT EXISTS "ajuste_itens_status" varchar(30) NOT NULL DEFAULT 'NAO_APLICAVEL'`,
    );
    await queryRunner.query(
      `ALTER TABLE "termos_aditivos" ADD COLUMN IF NOT EXISTS "ajuste_itens_modo" varchar(30)`,
    );
    await queryRunner.query(
      `ALTER TABLE "termos_aditivos" ADD COLUMN IF NOT EXISTS "ajuste_itens_detalhes" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `UPDATE "termos_aditivos"
       SET "ajuste_itens_status" = 'PENDENTE'
       WHERE status <> 'CANCELADO'
         AND (COALESCE(valor_acrescimo, 0) <> 0 OR COALESCE(valor_supressao, 0) <> 0)
         AND (
           EXISTS (SELECT 1 FROM itens_contrato i WHERE i.contrato_id = termos_aditivos.contrato_id)
           OR EXISTS (SELECT 1 FROM itens_cronograma i WHERE i.contrato_id = termos_aditivos.contrato_id)
         )
         AND "ajuste_itens_status" = 'NAO_APLICAVEL'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "termos_aditivos" DROP COLUMN IF EXISTS "ajuste_itens_detalhes"`);
    await queryRunner.query(`ALTER TABLE "termos_aditivos" DROP COLUMN IF EXISTS "ajuste_itens_modo"`);
    await queryRunner.query(`ALTER TABLE "termos_aditivos" DROP COLUMN IF EXISTS "ajuste_itens_status"`);
  }
}
