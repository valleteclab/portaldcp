import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddItensAvulsosRequisicaoItemOS20260607000002 implements MigrationInterface {
  name = 'AddItensAvulsosRequisicaoItemOS20260607000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Tornar item_cronograma_id nullable
    await queryRunner.query(`
      ALTER TABLE "requisicao_itens_os"
      ALTER COLUMN "item_cronograma_id" DROP NOT NULL
    `);

    // Adicionar campos para itens avulsos
    await queryRunner.query(`
      ALTER TABLE "requisicao_itens_os"
      ADD COLUMN "descricao_avulso" text
    `);

    await queryRunner.query(`
      ALTER TABLE "requisicao_itens_os"
      ADD COLUMN "quantidade_avulso" numeric(15,4)
    `);

    await queryRunner.query(`
      ALTER TABLE "requisicao_itens_os"
      ADD COLUMN "valor_unitario_avulso" numeric(18,12)
    `);

    await queryRunner.query(`
      ALTER TABLE "requisicao_itens_os"
      ADD COLUMN "valor_total_avulso" numeric(15,2)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remover campos de itens avulsos
    await queryRunner.query(`
      ALTER TABLE "requisicao_itens_os"
      DROP COLUMN "valor_total_avulso"
    `);

    await queryRunner.query(`
      ALTER TABLE "requisicao_itens_os"
      DROP COLUMN "valor_unitario_avulso"
    `);

    await queryRunner.query(`
      ALTER TABLE "requisicao_itens_os"
      DROP COLUMN "quantidade_avulso"
    `);

    await queryRunner.query(`
      ALTER TABLE "requisicao_itens_os"
      DROP COLUMN "descricao_avulso"
    `);

    // Tornar item_cronograma_id not null novamente
    await queryRunner.query(`
      ALTER TABLE "requisicao_itens_os"
      ALTER COLUMN "item_cronograma_id" SET NOT NULL
    `);
  }
}