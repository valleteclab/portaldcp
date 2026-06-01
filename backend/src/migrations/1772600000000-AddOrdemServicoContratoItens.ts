import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrdemServicoContratoItens1772600000000 implements MigrationInterface {
  name = 'AddOrdemServicoContratoItens1772600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ordens_servico_contrato"
      ADD COLUMN IF NOT EXISTS "tipo_escopo" varchar(20) NOT NULL DEFAULT 'GLOBAL'
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ordens_servico_contrato_itens" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "ordem_servico_id" uuid NOT NULL,
        "item_cronograma_id" uuid NOT NULL,
        "quantidade_referencia" numeric(15,4),
        "observacoes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ordens_servico_contrato_itens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_os_contrato_itens_os" FOREIGN KEY ("ordem_servico_id") REFERENCES "ordens_servico_contrato"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_os_contrato_itens_item" FOREIGN KEY ("item_cronograma_id") REFERENCES "itens_cronograma"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_os_contrato_itens_os"
      ON "ordens_servico_contrato_itens" ("ordem_servico_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_os_contrato_itens_item"
      ON "ordens_servico_contrato_itens" ("item_cronograma_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_os_contrato_itens_item"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_os_contrato_itens_os"');
    await queryRunner.query('DROP TABLE IF EXISTS "ordens_servico_contrato_itens"');
    await queryRunner.query('ALTER TABLE "ordens_servico_contrato" DROP COLUMN IF EXISTS "tipo_escopo"');
  }
}
