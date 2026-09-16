import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Integração com plataformas de disputa (BLL Compras): campos do leiaute na
 * licitação, marca vencedora no item e histórico de arquivos trocados.
 */
export class IntegracaoBll20260913000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "licitacoes"
        ADD COLUMN IF NOT EXISTS "entrega_local" varchar(500),
        ADD COLUMN IF NOT EXISTS "entrega_prazo" varchar(255),
        ADD COLUMN IF NOT EXISTS "garantia_produto" text,
        ADD COLUMN IF NOT EXISTS "ata_vigencia_meses" integer
    `);
    await queryRunner.query(`ALTER TABLE "itens_licitacao" ADD COLUMN IF NOT EXISTS "marca_vencedora" varchar`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "licitacoes_integracao_plataforma" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "licitacao_id" uuid NOT NULL,
        "plataforma" varchar(30) NOT NULL DEFAULT 'BLL',
        "tipo" varchar(20) NOT NULL,
        "status" varchar(20) NOT NULL,
        "nome_arquivo" varchar NOT NULL,
        "caminho_arquivo" varchar NOT NULL,
        "resumo" jsonb,
        "usuario_nome" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_licitacoes_integracao_plataforma" PRIMARY KEY ("id"),
        CONSTRAINT "FK_lic_integracao_licitacao" FOREIGN KEY ("licitacao_id") REFERENCES "licitacoes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_lic_integracao_licitacao" ON "licitacoes_integracao_plataforma" ("licitacao_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "licitacoes_integracao_plataforma"`);
    await queryRunner.query(`ALTER TABLE "itens_licitacao" DROP COLUMN IF EXISTS "marca_vencedora"`);
    await queryRunner.query(`ALTER TABLE "licitacoes" DROP COLUMN IF EXISTS "ata_vigencia_meses", DROP COLUMN IF EXISTS "garantia_produto", DROP COLUMN IF EXISTS "entrega_prazo", DROP COLUMN IF EXISTS "entrega_local"`);
  }
}
