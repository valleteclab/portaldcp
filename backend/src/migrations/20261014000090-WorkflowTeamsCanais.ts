import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Canais do Microsoft Teams por órgão para os avisos do motor de fluxo
 * (etapa e nó "Notificar"). Cada canal é um webhook do app "Workflows" do
 * Teams, criado pelo próprio órgão; a URL é segredo e fica cifrada (mesmo
 * padrão de `whatsapp_token`/senha SMTP — ver `common/crypto.util.ts`).
 */
export class WorkflowTeamsCanais1760436008000 implements MigrationInterface {
  name = 'WorkflowTeamsCanais1760436008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_teams_canais" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "orgao_id" uuid NOT NULL,
        "nome" character varying(160) NOT NULL,
        "webhook_url" text NOT NULL,
        "criado_por_id" character varying(100),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_workflow_teams_canal_orgao" ON "workflow_teams_canais" ("orgao_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_teams_canais"`);
  }
}
