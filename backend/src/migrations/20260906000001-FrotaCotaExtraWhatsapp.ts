import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Frota: cota mensal bloqueante com liberação extra pelo gestor + avisos por WhatsApp.
 * - frota_credenciais: telefone do vereador e a liberação extra do mês (litros, mês,
 *   motivo, quem liberou, quando);
 * - orgaos: WhatsApp do gestor responsável pela frota (recebe os pedidos novos);
 * - log de acesso ganha a ação LIBERAR_COTA_EXTRA.
 * Idempotente: produção roda com synchronize, mas a migration documenta e garante.
 */
export class FrotaCotaExtraWhatsapp20260906000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "frota_credenciais"
        ADD COLUMN IF NOT EXISTS "telefone_whatsapp" varchar(20),
        ADD COLUMN IF NOT EXISTS "cota_extra_litros" numeric(10,3) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS "cota_extra_mes" varchar(7),
        ADD COLUMN IF NOT EXISTS "cota_extra_motivo" text,
        ADD COLUMN IF NOT EXISTS "cota_extra_liberada_por" varchar(255),
        ADD COLUMN IF NOT EXISTS "cota_extra_liberada_em" timestamptz
    `);
    await queryRunner.query(`
      ALTER TABLE "orgaos" ADD COLUMN IF NOT EXISTS "whatsapp_responsavel_frota" varchar(20)
    `);
    await queryRunner.query(`
      ALTER TYPE "frota_acessos_log_acao_enum" ADD VALUE IF NOT EXISTS 'LIBERAR_COTA_EXTRA'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "frota_credenciais"
        DROP COLUMN IF EXISTS "telefone_whatsapp",
        DROP COLUMN IF EXISTS "cota_extra_litros",
        DROP COLUMN IF EXISTS "cota_extra_mes",
        DROP COLUMN IF EXISTS "cota_extra_motivo",
        DROP COLUMN IF EXISTS "cota_extra_liberada_por",
        DROP COLUMN IF EXISTS "cota_extra_liberada_em"
    `);
    await queryRunner.query(`ALTER TABLE "orgaos" DROP COLUMN IF EXISTS "whatsapp_responsavel_frota"`);
    // Valores de enum não são removíveis sem recriar o tipo.
  }
}
