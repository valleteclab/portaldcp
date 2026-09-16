import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Novo tipo de notificação para o alerta diário de conciliação com a
 * contabilidade: pagamento liquidado no portal da transparência sem medição
 * correspondente no sistema (caso TOYOLEM 001/2026 — NF paga com a OS ainda
 * "autorizada" aguardando medição).
 */
export class AddPagamentoSemMedicaoNotificacao20260903000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "notificacoes_tipo_enum" ADD VALUE IF NOT EXISTS 'PAGAMENTO_SEM_MEDICAO'
    `);
  }

  public async down(): Promise<void> {
    // Valores de enum não são removíveis sem recriar o tipo; sem down.
  }
}
