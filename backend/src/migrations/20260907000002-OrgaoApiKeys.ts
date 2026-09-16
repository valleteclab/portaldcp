import { MigrationInterface, QueryRunner } from 'typeorm';

/** Chaves de integração do órgão (MCP somente leitura). Idempotente — produção roda com synchronize. */
export class OrgaoApiKeys20260907000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "orgao_api_keys" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "orgao_id" uuid NOT NULL REFERENCES "orgaos"("id") ON DELETE CASCADE,
        "nome" varchar(120) NOT NULL,
        "key_hash" varchar(64) NOT NULL,
        "prefixo" varchar(12) NOT NULL,
        "criado_por" varchar(255),
        "ultimo_uso" timestamptz,
        "revogada_em" timestamptz,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_orgao_api_keys_hash" ON "orgao_api_keys" ("key_hash")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_orgao_api_keys_orgao" ON "orgao_api_keys" ("orgao_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "orgao_api_keys"`);
  }
}
