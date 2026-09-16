import { MigrationInterface, QueryRunner } from 'typeorm';

/** Log de acesso da frota: novas ações do vereador (cancelar pedido, pedir cota extra). */
export class FrotaAcoesVereador20260907000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "frota_acessos_log_acao_enum" ADD VALUE IF NOT EXISTS 'CANCELAR_REQUISICAO'`);
    await queryRunner.query(`ALTER TYPE "frota_acessos_log_acao_enum" ADD VALUE IF NOT EXISTS 'SOLICITAR_COTA_EXTRA'`);
  }

  public async down(): Promise<void> {
    // Valores de enum não são removíveis sem recriar o tipo.
  }
}
