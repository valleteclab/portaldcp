import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ofício no processo eletrônico: a peça guarda o setor de quem assinou e o
 * número próprio do documento ("014/2026"). A numeração do ofício é por
 * setor e ano, e conta as peças já numeradas daquele setor. E o tipo de peça
 * OFICIO entra no enum dos modelos de documento (modelo de ofício do órgão).
 */
export class ProcessoPecaNumeroDocumento1761300008000 implements MigrationInterface {
  name = 'ProcessoPecaNumeroDocumento1761300008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "processo_pecas"
        ADD COLUMN IF NOT EXISTS "setor_autor_id" uuid,
        ADD COLUMN IF NOT EXISTS "numero_documento" character varying(30)
    `);
    for (const tipo of ['modelos_documento_tipo_enum', 'documentos_fase_interna_tipo_enum']) {
      await queryRunner.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type WHERE typname = '${tipo}') THEN ALTER TYPE "${tipo}" ADD VALUE IF NOT EXISTS 'OFICIO'; END IF; END $$`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "processo_pecas"
        DROP COLUMN IF EXISTS "numero_documento",
        DROP COLUMN IF EXISTS "setor_autor_id"
    `);
  }
}
