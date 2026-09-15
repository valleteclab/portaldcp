import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Contratos: nº do processo licitatório como ele aparece no Portal da
 * Transparência (ex: "006-2025-PE"). Campo opcional, usado apenas para
 * confirmar empenhos quando o portal não informa o "Nº Contrato" no dialog —
 * caso típico das atas de registro de preços.
 */
export class ContratoProcessoLicitatorioPortal20260915000003
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contratos"
        ADD COLUMN IF NOT EXISTS "processo_licitatorio_portal" varchar(60)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contratos"
        DROP COLUMN IF EXISTS "processo_licitatorio_portal"
    `);
  }
}
