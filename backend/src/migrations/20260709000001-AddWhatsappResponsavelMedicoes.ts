import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * WhatsApp do responsável por receber medições (recebe alertas de medição
 * aprovada e não liquidada — processo de pagamento possivelmente não
 * encaminhado à contabilidade).
 */
export class AddWhatsappResponsavelMedicoes20260709000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "orgaos"
      ADD COLUMN IF NOT EXISTS "whatsapp_responsavel_medicoes" varchar(20)
    `);
    await queryRunner.query(`
      ALTER TYPE "notificacoes_tipo_enum" ADD VALUE IF NOT EXISTS 'MEDICAO_NAO_LIQUIDADA'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "whatsapp_responsavel_medicoes"`,
    );
  }
}
