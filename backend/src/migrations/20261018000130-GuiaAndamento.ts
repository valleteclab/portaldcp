import { MigrationInterface, QueryRunner } from 'typeorm';

/** Guia de primeiros passos: o roteiro em andamento no órgão (começo e demanda de teste). */
export class GuiaAndamento1761300013000 implements MigrationInterface {
  name = 'GuiaAndamento1761300013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "guia_andamentos" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "orgao_id" uuid NOT NULL,
        "roteiro" varchar(30) NOT NULL,
        "demanda_id" uuid,
        "iniciado_por_id" varchar(100),
        "iniciado_em" timestamptz NOT NULL DEFAULT now(),
        "encerrado_em" timestamptz,
        CONSTRAINT "PK_guia_andamentos" PRIMARY KEY ("id")
      )`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_guia_andamentos_orgao" ON "guia_andamentos" ("orgao_id", "roteiro")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "guia_andamentos"`);
  }
}
