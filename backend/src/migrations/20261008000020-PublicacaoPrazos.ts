import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E7a — PUBLICAÇÃO E PRAZOS (Lei 14.133/2021 arts. 55, 71 §3º, 164 e 183):
 *  - `feriados` / `feriados_adotados` (calendário por órgão; a semente dos
 *    nacionais roda no boot — FeriadosService, idempotente);
 *  - `licitacoes.natureza_objeto` (COMUM/ESPECIAL — art. 55 II);
 *  - `retificacoes_edital` (art. 55 §1º) e colunas de confirmação em
 *    `propostas`; `impugnacoes.retificacao_id`;
 *  - `extincoes_licitacao` / `manifestacoes_extincao` (art. 71 §3º) e o
 *    parâmetro `prazo_manifestacao_extincao_dias_uteis`.
 * Sem dados a migrar.
 *
 * IDEMPOTENTE. Produção com synchronize ligado: o synchronize cria o schema —
 * esta migration existe para quando o synchronize for desligado (E9).
 */
export class PublicacaoPrazos20261008000020 implements MigrationInterface {
  name = 'PublicacaoPrazos20261008000020';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE IF NOT EXISTS feriados (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      descricao varchar(150) NOT NULL, data date, movel varchar(30), recorrente boolean NOT NULL DEFAULT false,
      abrangencia varchar(12) NOT NULL DEFAULT 'MUNICIPAL', uf varchar(2), orgao_id uuid, codigo_ibge varchar(7),
      ponto_facultativo boolean NOT NULL DEFAULT false, base_legal varchar(200), chave_sistema varchar(40) UNIQUE,
      ativo boolean NOT NULL DEFAULT true, criado_por varchar(120),
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_feriados_orgao" ON feriados (orgao_id)`);
    await q.query(`CREATE TABLE IF NOT EXISTS feriados_adotados (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), orgao_id uuid NOT NULL, feriado_id uuid NOT NULL,
      created_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_feriados_adotados_orgao_feriado" ON feriados_adotados (orgao_id, feriado_id)`);

    await q.query(`ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS natureza_objeto varchar(10)`);
    await q.query(`ALTER TABLE impugnacoes ADD COLUMN IF NOT EXISTS retificacao_id uuid`);
    await q.query(`ALTER TABLE propostas ADD COLUMN IF NOT EXISTS requer_confirmacao boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE propostas ADD COLUMN IF NOT EXISTS retificacao_pendente_id uuid`);
    await q.query(`ALTER TABLE propostas ADD COLUMN IF NOT EXISTS confirmada_em timestamp`);
    await q.query(
      `ALTER TABLE parametros_licitacao ADD COLUMN IF NOT EXISTS prazo_manifestacao_extincao_dias_uteis int NOT NULL DEFAULT 3`,
    );

    await q.query(`CREATE TABLE IF NOT EXISTS retificacoes_edital (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), licitacao_id uuid NOT NULL, numero int NOT NULL,
      motivo text NOT NULL, alteracoes text NOT NULL, afeta_propostas boolean NOT NULL, justificativa_nao_afeta text,
      documento_id uuid, documento_anterior_id uuid, versao_edital int, hash_edital varchar(64),
      data_divulgacao timestamp NOT NULL, cronograma_anterior jsonb, cronograma_novo jsonb, campos_alterados jsonb,
      impugnacao_ids jsonb, propostas_notificadas int NOT NULL DEFAULT 0,
      ator_tipo varchar(20) NOT NULL, ator_id varchar(120), created_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_retificacoes_edital_licitacao" ON retificacoes_edital (licitacao_id)`);

    await q.query(`CREATE TABLE IF NOT EXISTS extincoes_licitacao (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), licitacao_id uuid NOT NULL, tipo varchar(10) NOT NULL,
      status varchar(12) NOT NULL DEFAULT 'ABERTA', motivo text NOT NULL, prazo_dias_uteis int NOT NULL,
      aberta_em timestamp NOT NULL, prazo_fim timestamp NOT NULL, licitantes_notificados int NOT NULL DEFAULT 0,
      concluida_em timestamp, motivo_cancelamento text, ator_tipo varchar(20) NOT NULL, ator_id varchar(120),
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_extincoes_licitacao_status" ON extincoes_licitacao (licitacao_id, status)`);
    await q.query(`CREATE TABLE IF NOT EXISTS manifestacoes_extincao (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), extincao_id uuid NOT NULL, licitacao_id uuid NOT NULL,
      fornecedor_id uuid NOT NULL, fornecedor_nome varchar(200), texto text NOT NULL,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "IDX_manifestacoes_extincao_forn" ON manifestacoes_extincao (extincao_id, fornecedor_id)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS manifestacoes_extincao`);
    await q.query(`DROP TABLE IF EXISTS extincoes_licitacao`);
    await q.query(`DROP TABLE IF EXISTS retificacoes_edital`);
    await q.query(`ALTER TABLE parametros_licitacao DROP COLUMN IF EXISTS prazo_manifestacao_extincao_dias_uteis`);
    await q.query(`ALTER TABLE propostas DROP COLUMN IF EXISTS confirmada_em`);
    await q.query(`ALTER TABLE propostas DROP COLUMN IF EXISTS retificacao_pendente_id`);
    await q.query(`ALTER TABLE propostas DROP COLUMN IF EXISTS requer_confirmacao`);
    await q.query(`ALTER TABLE impugnacoes DROP COLUMN IF EXISTS retificacao_id`);
    await q.query(`ALTER TABLE licitacoes DROP COLUMN IF EXISTS natureza_objeto`);
    await q.query(`DROP TABLE IF EXISTS feriados_adotados`);
    await q.query(`DROP TABLE IF EXISTS feriados`);
  }
}
