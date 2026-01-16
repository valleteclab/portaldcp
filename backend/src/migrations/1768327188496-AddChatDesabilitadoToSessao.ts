import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChatDesabilitadoToSessao1768327188496 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE sessoes_disputa 
            ADD COLUMN IF NOT EXISTS chat_desabilitado BOOLEAN DEFAULT FALSE
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE sessoes_disputa 
            DROP COLUMN IF EXISTS chat_desabilitado
        `);
    }

}
