import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRegraEquipeContrato20260730000002
  implements MigrationInterface
{
  name = 'AddRegraEquipeContrato20260730000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contratos"
      ADD COLUMN IF NOT EXISTS "exige_relacao_funcionarios" boolean NOT NULL DEFAULT false
    `);
    await queryRunner.query(`
      ALTER TABLE "contratos"
      ADD COLUMN IF NOT EXISTS "lote_relacao_funcionarios" integer
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "contratos" DROP COLUMN IF EXISTS "lote_relacao_funcionarios"`,
    );
    await queryRunner.query(
      `ALTER TABLE "contratos" DROP COLUMN IF EXISTS "exige_relacao_funcionarios"`,
    );
  }
}
