import { MigrationInterface, QueryRunner } from "typeorm";

export class AddLanceItemAndFornecedor1734562800000 implements MigrationInterface {
    name = 'AddLanceItemAndFornecedor1734562800000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Adicionar coluna item_id na tabela lances
        await queryRunner.query(`
            ALTER TABLE "lances" 
            ADD COLUMN IF NOT EXISTS "item_id" uuid REFERENCES "itens_licitacao"("id") ON DELETE SET NULL
        `);

        // Adicionar coluna fornecedor_id na tabela lances
        await queryRunner.query(`
            ALTER TABLE "lances" 
            ADD COLUMN IF NOT EXISTS "fornecedor_id" uuid
        `);

        // Adicionar coluna fornecedor_nome na tabela lances
        await queryRunner.query(`
            ALTER TABLE "lances" 
            ADD COLUMN IF NOT EXISTS "fornecedor_nome" varchar(255)
        `);

        // Criar índice para melhorar performance de consultas por item
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_lances_item_id" ON "lances" ("item_id")
        `);

        // Criar índice para melhorar performance de consultas por fornecedor
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_lances_fornecedor_id" ON "lances" ("fornecedor_id")
        `);

        // Criar índice composto para consultas por item e fornecedor
        await queryRunner.query(`
            CREATE INDEX IF NOT EXISTS "IDX_lances_item_fornecedor" ON "lances" ("item_id", "fornecedor_id")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Remover índices
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lances_item_fornecedor"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lances_fornecedor_id"`);
        await queryRunner.query(`DROP INDEX IF EXISTS "IDX_lances_item_id"`);

        // Remover colunas
        await queryRunner.query(`ALTER TABLE "lances" DROP COLUMN IF EXISTS "fornecedor_nome"`);
        await queryRunner.query(`ALTER TABLE "lances" DROP COLUMN IF EXISTS "fornecedor_id"`);
        await queryRunner.query(`ALTER TABLE "lances" DROP COLUMN IF EXISTS "item_id"`);
    }
}
