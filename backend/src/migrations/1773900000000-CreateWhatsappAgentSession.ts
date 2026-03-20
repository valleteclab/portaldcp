import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateWhatsappAgentSession1773900000000 implements MigrationInterface {
  name = 'CreateWhatsappAgentSession1773900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "whatsapp_agent_sessions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "phone" character varying(30) NOT NULL,
        "estado" character varying(50) NOT NULL DEFAULT 'INICIO',
        "dados" jsonb,
        "historico_ia" jsonb,
        "fornecedor_id" uuid,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP,
        CONSTRAINT "UQ_whatsapp_agent_phone" UNIQUE ("phone"),
        CONSTRAINT "PK_whatsapp_agent_sessions" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_whatsapp_agent_phone"
      ON "whatsapp_agent_sessions" ("phone")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_whatsapp_agent_phone"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "whatsapp_agent_sessions"`);
  }
}
