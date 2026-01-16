import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAnonimizacaoFields1736879000000 implements MigrationInterface {
    name = 'AddAnonimizacaoFields1736879000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Adicionar campo anonimizacao_disputa na tabela orgaos
        await queryRunner.query(`
            ALTER TABLE "orgaos" 
            ADD COLUMN IF NOT EXISTS "anonimizacao_disputa" boolean DEFAULT true
        `);

        // Adicionar campo anonimizacao_ativa na tabela sessoes_disputa
        await queryRunner.query(`
            ALTER TABLE "sessoes_disputa" 
            ADD COLUMN IF NOT EXISTS "anonimizacao_ativa" boolean DEFAULT true
        `);

        // Criar tabela de mapeamento anônimo
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "mapeamento_anonimo" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "sessao_id" uuid NOT NULL,
                "fornecedor_id" uuid NOT NULL,
                "codigo_anonimo" varchar(50) NOT NULL,
                "indice" integer NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "PK_mapeamento_anonimo" PRIMARY KEY ("id"),
                CONSTRAINT "UQ_mapeamento_sessao_fornecedor" UNIQUE ("sessao_id", "fornecedor_id"),
                CONSTRAINT "FK_mapeamento_sessao" FOREIGN KEY ("sessao_id") 
                    REFERENCES "sessoes_disputa"("id") ON DELETE CASCADE
            )
        `);

        // Criar índice para busca rápida
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_mapeamento_sessao" 
            ON "mapeamento_anonimo" ("sessao_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remover tabela de mapeamento
        await queryRunner.query(`DROP TABLE IF EXISTS "mapeamento_anonimo"`);

        // Remover campos
        await queryRunner.query(`
            ALTER TABLE "sessoes_disputa" 
            DROP COLUMN IF EXISTS "anonimizacao_ativa"
        `);

        await queryRunner.query(`
            ALTER TABLE "orgaos" 
            DROP COLUMN IF EXISTS "anonimizacao_disputa"
        `);
    }
}
