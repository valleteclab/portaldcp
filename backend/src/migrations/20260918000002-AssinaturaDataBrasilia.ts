import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A hora da assinatura saía 3 horas adiantada no boletim: a sessão da
 * aplicação no Postgres responde em UTC, enquanto ateste e submissão da
 * medição são gravados no horário local. O padrão da coluna passa a converter
 * para America/Sao_Paulo, independente do fuso da sessão.
 *
 * Registros anteriores continuam em UTC — a correção deles é feita à parte,
 * com conferência do órgão.
 */
export class AssinaturaDataBrasilia20260918000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "assinaturas_digitais"
        ALTER COLUMN "data_assinatura" SET DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "assinaturas_digitais"
        ALTER COLUMN "data_assinatura" SET DEFAULT now()
    `);
  }
}
