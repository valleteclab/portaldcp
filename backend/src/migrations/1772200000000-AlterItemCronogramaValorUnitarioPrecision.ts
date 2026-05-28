import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterItemCronogramaValorUnitarioPrecision1772200000000 implements MigrationInterface {
  name = 'AlterItemCronogramaValorUnitarioPrecision1772200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "itens_cronograma"
      ALTER COLUMN "valor_unitario" TYPE numeric(18,12)
      USING "valor_unitario"::numeric(18,12)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "itens_cronograma"
      ALTER COLUMN "valor_unitario" TYPE numeric(15,2)
      USING round("valor_unitario"::numeric, 2)
    `);
  }
}
