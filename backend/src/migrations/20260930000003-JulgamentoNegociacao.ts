import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E3 — NEGOCIAÇÃO (Lei 14.133/2021 art. 61; IN SEGES 73/2022 art. 30):
 *  - `negociacoes_unidade`: negociação do agente com o licitante na vez de
 *    cada unidade (contraproposta, resposta, resultado, lance NEGOCIACAO);
 *  - enum de eventos: NEGOCIACAO_MENSAGEM (mensagem PRIVADA agente ↔ licitante).
 *
 * IDEMPOTENTE. Sem transação (ALTER TYPE ... ADD VALUE). Produção com
 * synchronize ligado: o synchronize cria a tabela/enum — esta migration existe
 * para quando o synchronize for desligado (E9).
 */
export class JulgamentoNegociacao20260930000003 implements MigrationInterface {
  name = 'JulgamentoNegociacao20260930000003';
  transaction = false as const;

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE eventos_sessao_tipo_enum ADD VALUE IF NOT EXISTS 'NEGOCIACAO_MENSAGEM'`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS negociacoes_unidade (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        sessao_id uuid NOT NULL,
        tipo_unidade varchar(10) NOT NULL,
        unidade_id uuid NOT NULL,
        fornecedor_id varchar NOT NULL,
        posicao int,
        status varchar(20) NOT NULL,
        resultado varchar(20),
        base_lance varchar(12) NOT NULL,
        quantidade numeric(15,4) NOT NULL DEFAULT 1,
        valor_inicial numeric(15,4) NOT NULL,
        valor_inicial_total numeric(15,2) NOT NULL,
        valor_final numeric(15,4),
        valor_final_total numeric(15,2),
        preco_maximo_total numeric(15,2),
        obrigatoria boolean NOT NULL DEFAULT false,
        contraproposta_valor numeric(15,4),
        contraproposta_em timestamp,
        contraproposta_status varchar(12),
        rodadas jsonb NOT NULL DEFAULT '[]'::jsonb,
        lance_id varchar,
        aberta_em timestamp NOT NULL,
        aberta_por_tipo varchar(20),
        aberta_por_id varchar,
        origem varchar(12) NOT NULL DEFAULT 'MANUAL',
        encerrada_em timestamp,
        encerrada_motivo text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_negociacoes_unidade" ON negociacoes_unidade (unidade_id, status)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_negociacoes_licitacao" ON negociacoes_unidade (licitacao_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS negociacoes_unidade`);
    // valores de enum não são removidos (Postgres não suporta DROP VALUE)
  }
}
