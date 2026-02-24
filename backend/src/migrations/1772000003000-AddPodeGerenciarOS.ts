import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPodeGerenciarOS1772000003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    const hasColumn = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'pode_gerenciar_os'`,
    );
    if (!hasColumn || (Array.isArray(hasColumn) && hasColumn.length === 0)) {
      await queryRunner.query(
        `ALTER TABLE "usuarios" ADD COLUMN "pode_gerenciar_os" boolean NOT NULL DEFAULT false`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "usuarios" DROP COLUMN IF EXISTS "pode_gerenciar_os"`);
  }
}
