import { MigrationInterface, QueryRunner } from 'typeorm';

export class TermoAditivoJustificativaNullable1772000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "termos_aditivos" ALTER COLUMN "justificativa" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "termos_aditivos" ALTER COLUMN "justificativa" SET NOT NULL`);
  }
}
