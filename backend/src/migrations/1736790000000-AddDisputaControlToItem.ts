import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adiciona campos de controle de disputa por item
 * 
 * Fundamentação: Lei 14.133/2021, Art. 56
 * Na disputa por item, cada item tem seu próprio cronômetro e tempo aleatório
 */
export class AddDisputaControlToItem1736790000000 implements MigrationInterface {
    name = 'AddDisputaControlToItem1736790000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Status da disputa do item
        await queryRunner.query(`
            CREATE TYPE "item_status_disputa_enum" AS ENUM (
                'AGUARDANDO',
                'EM_DISPUTA', 
                'TEMPO_ALEATORIO',
                'ENCERRADO',
                'NEGOCIACAO'
            )
        `);

        // Adicionar campos de controle de disputa ao item
        await queryRunner.query(`
            ALTER TABLE "itens_licitacao" 
            ADD COLUMN "status_disputa" "item_status_disputa_enum" DEFAULT 'AGUARDANDO'
        `);

        await queryRunner.query(`
            ALTER TABLE "itens_licitacao" 
            ADD COLUMN "disputa_iniciada_em" TIMESTAMP
        `);

        await queryRunner.query(`
            ALTER TABLE "itens_licitacao" 
            ADD COLUMN "ultimo_lance_em" TIMESTAMP
        `);

        await queryRunner.query(`
            ALTER TABLE "itens_licitacao" 
            ADD COLUMN "inicio_tempo_aleatorio" TIMESTAMP
        `);

        await queryRunner.query(`
            ALTER TABLE "itens_licitacao" 
            ADD COLUMN "tempo_aleatorio_sorteado" INTEGER
        `);

        await queryRunner.query(`
            ALTER TABLE "itens_licitacao" 
            ADD COLUMN "disputa_encerrada_em" TIMESTAMP
        `);

        await queryRunner.query(`
            ALTER TABLE "itens_licitacao" 
            ADD COLUMN "melhor_lance_valor" DECIMAL(15,2)
        `);

        await queryRunner.query(`
            ALTER TABLE "itens_licitacao" 
            ADD COLUMN "melhor_lance_fornecedor_id" UUID
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "itens_licitacao" DROP COLUMN "melhor_lance_fornecedor_id"`);
        await queryRunner.query(`ALTER TABLE "itens_licitacao" DROP COLUMN "melhor_lance_valor"`);
        await queryRunner.query(`ALTER TABLE "itens_licitacao" DROP COLUMN "disputa_encerrada_em"`);
        await queryRunner.query(`ALTER TABLE "itens_licitacao" DROP COLUMN "tempo_aleatorio_sorteado"`);
        await queryRunner.query(`ALTER TABLE "itens_licitacao" DROP COLUMN "inicio_tempo_aleatorio"`);
        await queryRunner.query(`ALTER TABLE "itens_licitacao" DROP COLUMN "ultimo_lance_em"`);
        await queryRunner.query(`ALTER TABLE "itens_licitacao" DROP COLUMN "disputa_iniciada_em"`);
        await queryRunner.query(`ALTER TABLE "itens_licitacao" DROP COLUMN "status_disputa"`);
        await queryRunner.query(`DROP TYPE "item_status_disputa_enum"`);
    }
}
