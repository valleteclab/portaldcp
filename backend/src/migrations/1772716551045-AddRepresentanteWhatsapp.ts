import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddRepresentanteWhatsapp1772716551045 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.addColumn('fornecedores', new TableColumn({
            name: 'representante_whatsapp',
            type: 'varchar',
            length: '20',
            isNullable: true,
        }));
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.dropColumn('fornecedores', 'representante_whatsapp');
    }

}
