import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSetores1772100003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "setores" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "orgao_id" uuid NOT NULL,
        "codigo" varchar(50) NOT NULL,
        "nome" varchar NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_setores" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_setores_orgao_codigo" UNIQUE ("orgao_id", "codigo"),
        CONSTRAINT "FK_setores_orgao" FOREIGN KEY ("orgao_id") REFERENCES "orgaos"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_setores_orgao_id" ON "setores" ("orgao_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "setores"`);
  }
}
