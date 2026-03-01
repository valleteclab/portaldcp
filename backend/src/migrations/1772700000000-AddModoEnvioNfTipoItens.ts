import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddModoEnvioNfTipoItens1772700000000 implements MigrationInterface {
  name = 'AddModoEnvioNfTipoItens1772700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "ordens_fornecimento"
      ADD COLUMN IF NOT EXISTS "modo_envio_nf" varchar(20) NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "notas_fiscais_fornecedor"
      ADD COLUMN IF NOT EXISTS "tipo_itens" varchar(20) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_nf_ordem_tipo" ON "notas_fiscais_fornecedor" ("ordem_fornecimento_id", "tipo_itens")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_nf_ordem_tipo"`);
    await queryRunner.query(`ALTER TABLE "notas_fiscais_fornecedor" DROP COLUMN IF EXISTS "tipo_itens"`);
    await queryRunner.query(`ALTER TABLE "ordens_fornecimento" DROP COLUMN IF EXISTS "modo_envio_nf"`);
  }
}
