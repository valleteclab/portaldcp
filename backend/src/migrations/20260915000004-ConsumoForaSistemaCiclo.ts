import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Consumo de saldo por OS "atendida fora do sistema" em contrato com ciclo renovado.
 *
 * Problema: `atenderForaDoSistema` incrementava apenas `itens_cronograma.quantidade_medida`.
 * Em contrato COM renovação de ciclo o saldo é calculado por
 * `MedicaoService.calcularQuantidadeAprovadaPorItem`, que soma `itens_medicao_item`
 * das medições APROVADAS do ciclo e ignora o acumulado do cronograma. Resultado: a OS
 * saía de "comprometida" (status vira ATENDIDA) sem entrar como "consumida" — o saldo
 * era LIBERADO em vez de consumido.
 *
 * Correção: marcar a requisição com a data em que foi atendida fora do sistema para que
 * o cálculo do ciclo consiga somar as quantidades dessas OS.
 */
export class ConsumoForaSistemaCiclo20260915000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "requisicoes"
        ADD COLUMN IF NOT EXISTS "consumo_fora_sistema_em" TIMESTAMP
    `);
    // Retroativo: OS já marcadas como atendidas fora do sistema (rastro no histórico)
    // passam a contar no ciclo a partir da data em que o registro foi feito.
    await queryRunner.query(`
      UPDATE "requisicoes" r
         SET "consumo_fora_sistema_em" = h."created_at"
        FROM (
          SELECT DISTINCT ON (requisicao_id) requisicao_id, created_at
            FROM "historico_requisicoes"
           WHERE tipo_acao = 'ATENDIDA_FORA_SISTEMA'
           ORDER BY requisicao_id, created_at ASC
        ) h
       WHERE h.requisicao_id = r.id
         AND r."consumo_fora_sistema_em" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "requisicoes" DROP COLUMN IF EXISTS "consumo_fora_sistema_em"
    `);
  }
}
