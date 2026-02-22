import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDocumentosContrato1771800000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "documentos_contrato_tipo_enum" AS ENUM (
        'CONTRATO', 'TERMO_ADITIVO', 'APOSTILAMENTO', 'ANEXO', 'ATA', 'OUTROS'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "documentos_contrato" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "contrato_id" uuid NOT NULL,
        "tipo" "documentos_contrato_tipo_enum" NOT NULL DEFAULT 'OUTROS',
        "titulo" varchar NOT NULL,
        "descricao" text,
        "nome_arquivo" varchar NOT NULL,
        "nome_original" varchar NOT NULL,
        "caminho_arquivo" varchar NOT NULL,
        "mime_type" varchar NOT NULL DEFAULT 'application/pdf',
        "tamanho_bytes" bigint NOT NULL DEFAULT 0,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_documentos_contrato" PRIMARY KEY ("id"),
        CONSTRAINT "FK_documentos_contrato_contrato" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_documentos_contrato_contrato_id" ON "documentos_contrato" ("contrato_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "documentos_contrato"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "documentos_contrato_tipo_enum"`);
  }
}
