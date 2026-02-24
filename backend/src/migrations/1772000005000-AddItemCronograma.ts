import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddItemCronograma1772000005000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "itens_cronograma" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contrato_id" uuid NOT NULL,
        "numero_item" integer NOT NULL,
        "descricao" text NOT NULL,
        "unidade_medida" varchar(20) NOT NULL,
        "quantidade" decimal(15,4) NOT NULL,
        "valor_unitario" decimal(15,2) NOT NULL,
        "valor_total" decimal(15,2) NOT NULL,
        "quantidade_medida" decimal(15,4) NOT NULL DEFAULT 0,
        "observacoes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY ("id"),
        CONSTRAINT "fk_item_cronograma_contrato" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "itens_medicao_item" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "medicao_id" uuid NOT NULL,
        "item_cronograma_id" uuid NOT NULL,
        "quantidade_medida" decimal(15,4) NOT NULL,
        "valor_medido" decimal(15,2) NOT NULL,
        "observacoes" text,
        "atestado" boolean NOT NULL DEFAULT false,
        "ateste_fiscal_nome" varchar,
        "ateste_data" TIMESTAMP,
        "ateste_observacoes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY ("id"),
        CONSTRAINT "fk_item_medicao_item_medicao" FOREIGN KEY ("medicao_id") REFERENCES "medicoes"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_item_medicao_item_cronograma" FOREIGN KEY ("item_cronograma_id") REFERENCES "itens_cronograma"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "itens_medicao_item"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "itens_cronograma"`);
  }
}
