import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsAppOrgao1768400002000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "whatsapp_provider" varchar(20)`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "whatsapp_instance_id" varchar(100)`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "whatsapp_token" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "whatsapp_client_token" varchar(500)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "whatsapp_provider"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "whatsapp_instance_id"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "whatsapp_token"`);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "whatsapp_client_token"`);
  }
}
