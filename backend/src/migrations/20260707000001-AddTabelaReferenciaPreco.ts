import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catálogo de tabelas de referência de preços por órgão (ex.: SINAPRO),
 * usado em contratos de agência de publicidade (Lei 12.232/2010).
 */
export class AddTabelaReferenciaPreco20260707000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "tabelas_referencia_preco" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orgao_id" uuid NOT NULL,
        "nome" varchar NOT NULL,
        "fonte" varchar,
        "uf" varchar(2),
        "edicao" varchar,
        "vigencia_inicio" date,
        "vigencia_fim" date,
        "ativa" boolean NOT NULL DEFAULT true,
        "observacoes" text,
        "usuario_cadastro_id" varchar,
        "usuario_cadastro_nome" varchar,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_tabelas_referencia_preco" PRIMARY KEY ("id"),
        CONSTRAINT "FK_tabelas_referencia_preco_orgao" FOREIGN KEY ("orgao_id")
          REFERENCES "orgaos"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "itens_tabela_referencia" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "tabela_id" uuid NOT NULL,
        "categoria_codigo" varchar,
        "categoria_nome" varchar,
        "codigo" varchar,
        "descricao" text NOT NULL,
        "valor_criacao" decimal(15,2),
        "valor_finalizacao" decimal(15,2),
        "valor_total" decimal(15,2),
        "valor_reformulacao" decimal(15,2),
        "unidade" varchar,
        "sob_orcamento" boolean NOT NULL DEFAULT false,
        "observacoes" text,
        "ordem" integer NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_itens_tabela_referencia" PRIMARY KEY ("id"),
        CONSTRAINT "FK_itens_tabela_referencia_tabela" FOREIGN KEY ("tabela_id")
          REFERENCES "tabelas_referencia_preco"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_tabelas_referencia_preco_orgao" ON "tabelas_referencia_preco" ("orgao_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_itens_tabela_referencia_tabela" ON "itens_tabela_referencia" ("tabela_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_itens_tabela_referencia_tabela"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_tabelas_referencia_preco_orgao"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "itens_tabela_referencia"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tabelas_referencia_preco"`);
  }
}
