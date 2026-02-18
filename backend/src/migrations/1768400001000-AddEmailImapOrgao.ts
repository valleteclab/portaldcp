import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEmailImapOrgao1768400001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "email_imap_host" varchar`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "email_imap_port" integer`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "email_imap_user" varchar`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "email_imap_senha" varchar`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "email_imap_host"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "email_imap_port"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "email_imap_user"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "email_imap_senha"`);
  }
}
