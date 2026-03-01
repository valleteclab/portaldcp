import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Tabela historico_requisicoes para timeline de OS
 */
export class AddHistoricoRequisicao1772500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "historico_requisicoes" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "requisicao_id" uuid NOT NULL,
        "tipo_acao" varchar(50) NOT NULL,
        "descricao" text NOT NULL,
        "detalhes" text,
        "usuario_id" varchar,
        "usuario_nome" varchar,
        "data_evento" timestamp,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_historico_requisicoes" PRIMARY KEY ("id"),
        CONSTRAINT "FK_historico_requisicoes_requisicao" FOREIGN KEY ("requisicao_id") 
          REFERENCES "requisicoes"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "historico_requisicoes"`);
  }
}
