import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailSmtpOrgao1768400000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "email_smtp_host" varchar`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "email_smtp_port" integer`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "email_smtp_secure" boolean DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "email_smtp_user" varchar`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "email_smtp_senha" varchar`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "email_from" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "email_smtp_host"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "email_smtp_port"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "email_smtp_secure"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "email_smtp_user"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "email_smtp_senha"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "email_from"`);
  }
}
