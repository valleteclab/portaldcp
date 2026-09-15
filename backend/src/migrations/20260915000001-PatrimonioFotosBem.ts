import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Patrimônio: galeria de fotos por bem (várias fotos ao longo do tempo).
 * `bens_patrimoniais.foto_url` segue como a capa; as fotos já existentes
 * viram a primeira linha da galeria (origem CADASTRO).
 */
export class PatrimonioFotosBem20260915000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "patrimonio_fotos_bem" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "bem_id" uuid NOT NULL,
        "orgao_id" uuid NOT NULL,
        "url" varchar NOT NULL,
        "origem" varchar(20) NOT NULL DEFAULT 'CADASTRO',
        "legenda" text,
        "inventario_leitura_id" uuid,
        "tirada_por" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_patrimonio_fotos_bem" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pat_fotos_bem" FOREIGN KEY ("bem_id") REFERENCES "bens_patrimoniais"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_pat_fotos_bem" ON "patrimonio_fotos_bem" ("bem_id")`);
    // Backfill: a foto atual de cada bem entra na galeria como capa de origem CADASTRO
    await queryRunner.query(`
      INSERT INTO "patrimonio_fotos_bem" ("bem_id", "orgao_id", "url", "origem", "created_at")
      SELECT b."id", b."orgao_id", b."foto_url", 'CADASTRO', b."created_at"
      FROM "bens_patrimoniais" b
      WHERE b."foto_url" IS NOT NULL AND b."foto_url" <> ''
        AND NOT EXISTS (
          SELECT 1 FROM "patrimonio_fotos_bem" f WHERE f."bem_id" = b."id" AND f."url" = b."foto_url"
        )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "patrimonio_fotos_bem"`);
  }
}
