import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E2.4 — Modos de disputa como estratégias do motor único (Lei 14.133 art. 56;
 * IN SEGES 73/2022 arts. 23–25 e 27): estado da fase por item
 * (`disputa_estado_modo_item` — aberto-fechado, fechado-aberto, reinício para
 * as demais colocações), incluindo a duração SIGILOSA do tempo aleatório.
 *
 * Só DDL nova (nenhum dado existente é alterado). IDEMPOTENTE.
 * Em produção (synchronize ligado) o synchronize cria a tabela no deploy;
 * esta migration existe para quando o synchronize for desligado (E9).
 */
export class ModosDisputa20260928000001 implements MigrationInterface {
  name = 'ModosDisputa20260928000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS disputa_estado_modo_item (
        item_id uuid PRIMARY KEY,
        sessao_id uuid NOT NULL,
        modo varchar(20) NOT NULL,
        fase varchar(20) NOT NULL,
        participantes jsonb,
        faixa_percentual numeric(5,2),
        fase_iniciada_em timestamp,
        fase_termina_em timestamp,
        aleatorio_iniciado_em timestamp,
        aleatorio_sorteado_segundos int,
        primeiro_fornecedor_id varchar,
        primeiro_valor numeric(15,4),
        reinicios int NOT NULL DEFAULT 0,
        tipo_unidade varchar(10) NOT NULL DEFAULT 'ITEM',
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )
    `);
    await q.query(ModosDisputa20260928000001.COLUNA_UNIDADE);
  }

  // (tabela criada antes do lote já existir no ambiente)
  private static readonly COLUNA_UNIDADE = `ALTER TABLE disputa_estado_modo_item ADD COLUMN IF NOT EXISTS tipo_unidade varchar(10) NOT NULL DEFAULT 'ITEM'`;

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS disputa_estado_modo_item`);
  }
}
