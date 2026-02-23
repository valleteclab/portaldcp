import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStatusVencidoContrato1772000002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'VENCIDO' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'contratos_status_enum')) THEN
          ALTER TYPE contratos_status_enum ADD VALUE 'VENCIDO';
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL não permite remover valores de enum facilmente.
    // O valor VENCIDO permanecerá no enum.
  }
}
