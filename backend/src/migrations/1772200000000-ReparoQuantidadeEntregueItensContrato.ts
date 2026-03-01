import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Reparo de consistência quantidade_entregue em itens_contrato
 *
 * Corrige inconsistência quando recebimentos foram excluídos/removidos sem passar
 * pelo fluxo de estorno (ex: exclusão direta, CASCADE, etc.), deixando
 * quantidade_entregue desatualizada em itens_contrato.
 *
 * Recalcula quantidade_entregue a partir dos recebimentos existentes (ACEITO ou
 * ACEITO_PARCIAL com baixa_realizada). Se não há recebimentos, zera.
 */
export class ReparoQuantidadeEntregueItensContrato1772200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Recalcula quantidade_entregue a partir dos recebimentos
    // Para itens sem recebimentos, expected = 0
    await queryRunner.query(`
      WITH recebido_por_item AS (
        SELECT
          (elem->>'item_contrato_id')::uuid AS item_contrato_id,
          SUM((elem->>'quantidade_aceita')::numeric) AS soma
        FROM recebimentos r,
        jsonb_array_elements(COALESCE(r.itens, '[]'::jsonb)) AS elem
        WHERE r.status IN ('ACEITO', 'ACEITO_PARCIAL')
          AND r.baixa_realizada = true
          AND (elem->>'item_contrato_id') IS NOT NULL
          AND (elem->>'item_contrato_id') != ''
        GROUP BY (elem->>'item_contrato_id')::uuid
      ),
      itens_a_corrigir AS (
        SELECT
          ic.id,
          ic.quantidade_contratada,
          ic.quantidade_empenhada,
          ic.quantidade_entregue AS atual,
          COALESCE(rpi.soma, 0) AS esperado
        FROM itens_contrato ic
        LEFT JOIN recebido_por_item rpi ON rpi.item_contrato_id = ic.id
        WHERE ic.quantidade_entregue != COALESCE(rpi.soma, 0)
      )
      UPDATE itens_contrato ic
      SET
        quantidade_entregue = iac.esperado,
        saldo_disponivel = iac.quantidade_contratada - iac.quantidade_empenhada - iac.esperado
      FROM itens_a_corrigir iac
      WHERE ic.id = iac.id
    `);
  }

  public async down(): Promise<void> {
    // Não reversível - seria necessário backup prévio para restaurar
  }
}
