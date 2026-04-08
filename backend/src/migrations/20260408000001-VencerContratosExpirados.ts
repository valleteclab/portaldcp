import { MigrationInterface, QueryRunner } from 'typeorm';

export class VencerContratosExpirados20260408000001 implements MigrationInterface {
  name = 'VencerContratosExpirados20260408000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Atualiza status e captura os IDs afetados
    await queryRunner.query(`
      WITH vencidos AS (
        UPDATE contratos
        SET status = 'VENCIDO'
        WHERE status = 'VIGENTE'
          AND data_vigencia_fim IS NOT NULL
          AND data_vigencia_fim::date < CURRENT_DATE
        RETURNING id, data_vigencia_fim
      )
      INSERT INTO historico_contratos (
        id,
        contrato_id,
        tipo_acao,
        descricao,
        status_anterior,
        status_novo,
        usuario_nome,
        created_at
      )
      SELECT
        gen_random_uuid(),
        v.id,
        'STATUS_ALTERADO',
        'Contrato vencido automaticamente via migration — vigência encerrada em '
          || TO_CHAR(v.data_vigencia_fim, 'DD/MM/YYYY'),
        'VIGENTE',
        'VENCIDO',
        'Sistema (migration)',
        NOW()
      FROM vencidos v
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverte contratos marcados por esta migration
    await queryRunner.query(`
      UPDATE contratos
      SET status = 'VIGENTE'
      WHERE id IN (
        SELECT contrato_id FROM historico_contratos
        WHERE usuario_nome = 'Sistema (migration)'
          AND status_anterior = 'VIGENTE'
          AND status_novo = 'VENCIDO'
      )
    `);
  }
}
