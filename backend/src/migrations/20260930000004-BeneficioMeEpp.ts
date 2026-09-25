import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarMeEpp } from '../julgamento/me-epp/migracao-me-epp';

/**
 * E3 — BENEFÍCIO ME/EPP (LC 123/2006 arts. 44–48; Lei 14.133 art. 4º):
 *  - `desempates_mpe` (apuração do empate ficto por unidade) e
 *    `convocacoes_desempate_mpe` (ME/EPP convocadas, prazo, resposta);
 *  - `propostas.porte_fornecedor` / `enquadramento_mpe` (retrato do porte do
 *    cadastro na criação da proposta);
 *  - `itens_licitacao.item_cota_origem_id` / `lotes_licitacao.lote_cota_origem_id`
 *    (unidade-COTA reservada, art. 48 III);
 *  - `parametros_licitacao.prazo_desempate_mpe_minutos` (5 min — art. 45 §3º);
 *  - dados: legado `exclusivo_mpe`/`cota_reservada` → `tipo_beneficio_mpe` e
 *    retrato do porte (`migracao-me-epp.ts`, também no boot). O limite legal
 *    `MPE_EXCLUSIVO_ITEM` (R$ 80.000, art. 48 I) é semeado pelo
 *    ParametrosLicitacaoService no boot.
 * IDEMPOTENTE. Produção com synchronize ligado: o synchronize cria o esquema.
 */
export class BeneficioMeEpp20260930000004 implements MigrationInterface {
  name = 'BeneficioMeEpp20260930000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE propostas ADD COLUMN IF NOT EXISTS porte_fornecedor varchar(10)`);
    await q.query(`ALTER TABLE propostas ADD COLUMN IF NOT EXISTS enquadramento_mpe boolean`);
    await q.query(`ALTER TABLE itens_licitacao ADD COLUMN IF NOT EXISTS item_cota_origem_id uuid`);
    await q.query(`ALTER TABLE lotes_licitacao ADD COLUMN IF NOT EXISTS lote_cota_origem_id uuid`);
    await q.query(`ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS justificativa_nao_exclusividade_mpe text`);
    await q.query(`ALTER TABLE parametros_licitacao ADD COLUMN IF NOT EXISTS prazo_desempate_mpe_minutos int NOT NULL DEFAULT 5`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS desempates_mpe (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        sessao_id uuid,
        tipo_unidade varchar(10) NOT NULL,
        unidade_id uuid NOT NULL,
        status varchar(20) NOT NULL,
        motivo text,
        percentual numeric(5,2),
        melhor_fornecedor_id varchar,
        melhor_valor numeric(15,4),
        limite_valor numeric(15,4),
        candidatos jsonb,
        sorteio jsonb,
        prazo_minutos int,
        vencedor_fornecedor_id varchar,
        valor_vencedor numeric(15,4),
        concluido_em timestamp,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_desempates_mpe_unidade" ON desempates_mpe (unidade_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_desempates_mpe_licitacao" ON desempates_mpe (licitacao_id, status)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS convocacoes_desempate_mpe (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        desempate_id uuid NOT NULL,
        licitacao_id uuid NOT NULL,
        sessao_id uuid,
        tipo_unidade varchar(10) NOT NULL,
        unidade_id uuid NOT NULL,
        fornecedor_id varchar NOT NULL,
        ordem int NOT NULL,
        status varchar(20) NOT NULL,
        valor_a_cobrir numeric(15,4) NOT NULL,
        valor_proprio numeric(15,4),
        convocada_em timestamp NOT NULL,
        prazo_minutos int NOT NULL,
        prazo_ate timestamp NOT NULL,
        respondida_em timestamp,
        valor_ofertado numeric(15,4),
        lance_id uuid,
        motivo text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_conv_desempate_mpe_desempate" ON convocacoes_desempate_mpe (desempate_id, ordem)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_conv_desempate_mpe_status" ON convocacoes_desempate_mpe (status, prazo_ate)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_conv_desempate_mpe_fornecedor" ON convocacoes_desempate_mpe (sessao_id, fornecedor_id)`);
    await migrarMeEpp(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS convocacoes_desempate_mpe`);
    await q.query(`DROP TABLE IF EXISTS desempates_mpe`);
    await q.query(`ALTER TABLE parametros_licitacao DROP COLUMN IF EXISTS prazo_desempate_mpe_minutos`);
    await q.query(`ALTER TABLE lotes_licitacao DROP COLUMN IF EXISTS lote_cota_origem_id`);
    await q.query(`ALTER TABLE licitacoes DROP COLUMN IF EXISTS justificativa_nao_exclusividade_mpe`);
    await q.query(`ALTER TABLE itens_licitacao DROP COLUMN IF EXISTS item_cota_origem_id`);
    await q.query(`ALTER TABLE propostas DROP COLUMN IF EXISTS enquadramento_mpe`);
    await q.query(`ALTER TABLE propostas DROP COLUMN IF EXISTS porte_fornecedor`);
  }
}
