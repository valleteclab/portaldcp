import { MigrationInterface, QueryRunner } from 'typeorm';

export class AumentaPrecisaoQuantidadeOS20260730000003
  implements MigrationInterface
{
  name = 'AumentaPrecisaoQuantidadeOS20260730000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "requisicao_itens_os" ALTER COLUMN "quantidade_solicitada" TYPE numeric(18,12)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "requisicao_itens_os" ALTER COLUMN "quantidade_solicitada" TYPE numeric(15,6)`,
    );
  }
}
