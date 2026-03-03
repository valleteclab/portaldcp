import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAgenteLogs1773000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "agente_logs" (
        "id"                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
        "tipo_acao"         varchar(50)  NOT NULL,
        "orgao_id"          varchar(50),
        "contrato_numero"   varchar(100),
        "contrato_id"       uuid,
        "fornecedor_id"     uuid,
        "cnpj_fornecedor"   varchar(20),
        "status"            varchar(50)  NOT NULL,
        "mensagem"          text,
        "detalhes"          jsonb,
        "created_at"        timestamptz  NOT NULL DEFAULT now(),
        "updated_at"        timestamptz  NOT NULL DEFAULT now()
      )
    `);

    // Criar índices para consultas comuns
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agente_logs_created_at" ON "agente_logs"("created_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agente_logs_tipo_acao" ON "agente_logs"("tipo_acao")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agente_logs_status" ON "agente_logs"("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agente_logs_orgao" ON "agente_logs"("orgao_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_agente_logs_contrato" ON "agente_logs"("contrato_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "agente_logs"`);
  }
}
