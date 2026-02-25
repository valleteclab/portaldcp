import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRequisicaoEtapaOS1772000006000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "requisicao_etapas_os" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "requisicao_id" uuid NOT NULL,
        "etapa_id" uuid NOT NULL,
        "percentual_solicitado" decimal(5,2) NOT NULL DEFAULT 0,
        "valor_solicitado" decimal(15,2) NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY ("id"),
        CONSTRAINT "fk_requisicao_etapa_os_requisicao" FOREIGN KEY ("requisicao_id") REFERENCES "requisicoes"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_requisicao_etapa_os_etapa" FOREIGN KEY ("etapa_id") REFERENCES "etapas_cronograma"("id") ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "requisicao_etapas_os"`);
  }
}
