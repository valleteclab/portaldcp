import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddResendEmailConfig1772600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn('orgaos', new TableColumn({
      name: 'email_resend_api_key',
      type: 'varchar',
      length: '255',
      isNullable: true,
    }));

    await queryRunner.addColumn('orgaos', new TableColumn({
      name: 'email_resend_from',
      type: 'varchar',
      length: '255',
      isNullable: true,
    }));

    await queryRunner.addColumn('orgaos', new TableColumn({
      name: 'email_metodo',
      type: 'enum',
      enum: ['SMTP', 'RESEND'],
      default: "'SMTP'",
      isNullable: true,
    }));
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('orgaos', 'email_metodo');
    await queryRunner.dropColumn('orgaos', 'email_resend_from');
    await queryRunner.dropColumn('orgaos', 'email_resend_api_key');
  }
}
