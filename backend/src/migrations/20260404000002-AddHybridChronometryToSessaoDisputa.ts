import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHybridChronometryToSessaoDisputa20260404000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Campos para cronometria configuravel dos modos hibridos
    // IN SEGES/ME 73/2022, arts. 24 (ABERTO_FECHADO) e 25 (FECHADO_ABERTO)
    await queryRunner.query(`
      ALTER TABLE sessoes_disputa
        ADD COLUMN IF NOT EXISTS etapa_aberta_minutos_hibrido INTEGER DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS lance_final_fechado_minutos INTEGER DEFAULT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE sessoes_disputa
        DROP COLUMN IF EXISTS etapa_aberta_minutos_hibrido,
        DROP COLUMN IF EXISTS lance_final_fechado_minutos
    `);
  }
}
