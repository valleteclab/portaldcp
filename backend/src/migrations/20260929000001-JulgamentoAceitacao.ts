import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarJulgamento } from '../julgamento/migracao-julgamento';

/**
 * E3 — Julgamento: licitante na unidade, ranking único e ACEITAÇÃO da proposta
 * (IN SEGES 73/2022 art. 29; Lei 14.133 art. 59):
 *  - `licitantes_unidade` (situação do licitante por item/lote — CLASSIFICADO,
 *    CONVOCADO_ACEITACAO, ACEITO, RECUSADO, DESCLASSIFICADO, HABILITADO,
 *    INABILITADO, VENCEDOR...), único por unidade + fornecedor;
 *  - `aceitacoes_proposta` (convocação, prazo ≥ 2 h e prorrogação única,
 *    proposta adequada com arquivo no banco e valores por item, decisão);
 *  - parâmetro do órgão `prazo_proposta_adequada_horas` (padrão 2);
 *  - enums: etapa ACEITACAO_PROPOSTA e os eventos da aceitação;
 *  - dados (`migrarJulgamento`): backfill das sessões pós-disputa.
 *
 * IDEMPOTENTE. Sem transação (ALTER TYPE ... ADD VALUE não pode ser usado na
 * mesma transação). Produção (synchronize ligado, sem migrationsRun): o
 * synchronize cria tabelas/colunas/enums e o boot (MigracaoJulgamentoBootService)
 * faz o backfill — esta migration existe para quando o synchronize for desligado (E9).
 */
export class JulgamentoAceitacao20260929000001 implements MigrationInterface {
  name = 'JulgamentoAceitacao20260929000001';
  transaction = false as const;

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE sessoes_disputa_etapa_enum ADD VALUE IF NOT EXISTS 'ACEITACAO_PROPOSTA'`);
    for (const v of [
      'ACEITACAO_CONVOCADA',
      'ACEITACAO_PRORROGACAO_SOLICITADA',
      'ACEITACAO_PRAZO_PRORROGADO',
      'PROPOSTA_ADEQUADA_ENVIADA',
      'PROPOSTA_ACEITA',
      'UNIDADE_FRACASSADA',
    ]) {
      await q.query(`ALTER TYPE eventos_sessao_tipo_enum ADD VALUE IF NOT EXISTS '${v}'`);
    }

    await q.query(`
      CREATE TABLE IF NOT EXISTS licitantes_unidade (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        tipo_unidade varchar(10) NOT NULL,
        unidade_id uuid NOT NULL,
        fornecedor_id varchar NOT NULL,
        situacao varchar(30) NOT NULL,
        motivo text,
        posicao_final int,
        valor_final numeric(15,4),
        ator_tipo varchar(20),
        ator_id varchar,
        situacao_em timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_licitantes_unidade" ON licitantes_unidade (unidade_id, fornecedor_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_licitantes_unidade_licitacao" ON licitantes_unidade (licitacao_id)`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS aceitacoes_proposta (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        sessao_id uuid NOT NULL,
        tipo_unidade varchar(10) NOT NULL,
        unidade_id uuid NOT NULL,
        fornecedor_id varchar NOT NULL,
        status varchar(20) NOT NULL,
        convocada_em timestamp NOT NULL,
        prazo_horas numeric(8,2) NOT NULL,
        prazo_ate timestamp NOT NULL,
        prorrogada_em timestamp,
        prorrogacao_origem varchar(12),
        prorrogacao_motivo text,
        pedido_prorrogacao_em timestamp,
        pedido_prorrogacao_motivo text,
        limites jsonb NOT NULL,
        enviada_em timestamp,
        valores_itens jsonb,
        valor_total_readequado numeric(15,2),
        observacao_fornecedor text,
        arquivo_nome varchar,
        arquivo_mime varchar(100),
        arquivo_tamanho int,
        arquivo_sha256 varchar(64),
        arquivo_conteudo bytea,
        alerta_exequibilidade jsonb,
        justificativa_exequibilidade text,
        decidida_em timestamp,
        decisao_motivo text,
        decidida_por_tipo varchar(20),
        decidida_por_id varchar,
        convocada_por_tipo varchar(20),
        convocada_por_id varchar,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_aceitacoes_unidade" ON aceitacoes_proposta (unidade_id, status)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_aceitacoes_licitacao" ON aceitacoes_proposta (licitacao_id)`);

    await q.query(
      `ALTER TABLE parametros_licitacao ADD COLUMN IF NOT EXISTS prazo_proposta_adequada_horas int NOT NULL DEFAULT 2`,
    );

    await migrarJulgamento(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE parametros_licitacao DROP COLUMN IF EXISTS prazo_proposta_adequada_horas`);
    await q.query(`DROP TABLE IF EXISTS aceitacoes_proposta`);
    await q.query(`DROP TABLE IF EXISTS licitantes_unidade`);
    // Valores de enum não são removidos (Postgres não tem DROP VALUE); a etapa volta a NEGOCIACAO
    await q.query(`UPDATE sessoes_disputa SET etapa = 'NEGOCIACAO' WHERE etapa::text = 'ACEITACAO_PROPOSTA'`);
  }
}
