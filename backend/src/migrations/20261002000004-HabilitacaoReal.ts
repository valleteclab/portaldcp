import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E4 — Habilitação real (Lei 14.133/2021 arts. 62–70; IN SEGES 73/2022 art. 39):
 *  - `exigencias_habilitacao` (exigências do edital por licitação, com o tipo
 *    de documento do registro cadastral que as atende — art. 70);
 *  - `habilitacoes_licitante` (convocação/inversão, prazo, pré-checagem do
 *    cadastro, decisão), `documentos_habilitacao` (arquivo no banco — nunca na
 *    pasta pública; análise por documento) e `diligencias_habilitacao` (art. 64);
 *  - `licitacoes.inversao_fases` (art. 17 §1º) e
 *    `parametros_licitacao.prazo_habilitacao_horas` (padrão 2 h).
 * IDEMPOTENTE. Produção (synchronize ligado) já cria tudo pelas entidades e o
 * boot (`MigracaoHabilitacaoBootService`) migra os dados; esta migration existe
 * para quando o synchronize for desligado (E9).
 */
export class HabilitacaoReal20261002000004 implements MigrationInterface {
  name = 'HabilitacaoReal20261002000004';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS inversao_fases boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE parametros_licitacao ADD COLUMN IF NOT EXISTS prazo_habilitacao_horas int NOT NULL DEFAULT 2`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS exigencias_habilitacao (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        ordem int NOT NULL DEFAULT 0,
        categoria varchar(30) NOT NULL,
        descricao text NOT NULL,
        base_legal varchar(200),
        obrigatorio boolean NOT NULL DEFAULT true,
        aceita_registro_cadastral boolean NOT NULL DEFAULT true,
        tipos_documento_cadastro jsonb NOT NULL DEFAULT '[]'::jsonb,
        exige_validade boolean NOT NULL DEFAULT false,
        modelo varchar(20),
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_exigencias_habilitacao_licitacao" ON exigencias_habilitacao (licitacao_id, ordem)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS habilitacoes_licitante (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        sessao_id uuid,
        fornecedor_id varchar NOT NULL,
        origem varchar(12) NOT NULL,
        status varchar(20) NOT NULL,
        convocada_em timestamp NOT NULL,
        prazo_horas numeric(8,2),
        prazo_ate timestamp,
        prorrogada_em timestamp,
        prorrogacao_motivo text,
        enviada_em timestamp,
        pre_checagem jsonb,
        decidida_em timestamp,
        decisao_motivo text,
        decidida_por_tipo varchar(20),
        decidida_por_id varchar,
        convocada_por_tipo varchar(20),
        convocada_por_id varchar,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_habilitacoes_licitacao_fornecedor" ON habilitacoes_licitante (licitacao_id, fornecedor_id)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS documentos_habilitacao (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        habilitacao_id uuid NOT NULL,
        licitacao_id uuid NOT NULL,
        fornecedor_id varchar NOT NULL,
        exigencia_id uuid NOT NULL,
        origem varchar(12) NOT NULL,
        diligencia_id uuid,
        fornecedor_documento_id uuid,
        cadastro jsonb,
        arquivo_nome varchar,
        arquivo_mime varchar(100),
        arquivo_tamanho int,
        arquivo_sha256 varchar(64),
        arquivo_conteudo bytea,
        validade date,
        observacao text,
        enviado_em timestamp NOT NULL,
        analise varchar(12) NOT NULL DEFAULT 'PENDENTE',
        analise_motivo text,
        analisado_em timestamp,
        analisado_por_tipo varchar(20),
        analisado_por_id varchar,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_documentos_habilitacao_hab" ON documentos_habilitacao (habilitacao_id, exigencia_id)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS diligencias_habilitacao (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        habilitacao_id uuid NOT NULL,
        licitacao_id uuid NOT NULL,
        motivo text NOT NULL,
        exigencia_ids jsonb NOT NULL,
        prazo_horas numeric(8,2) NOT NULL,
        aberta_em timestamp NOT NULL,
        prazo_ate timestamp NOT NULL,
        status varchar(12) NOT NULL,
        respondida_em timestamp,
        resposta text,
        aberta_por_tipo varchar(20),
        aberta_por_id varchar,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_diligencias_habilitacao_hab" ON diligencias_habilitacao (habilitacao_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS diligencias_habilitacao`);
    await q.query(`DROP TABLE IF EXISTS documentos_habilitacao`);
    await q.query(`DROP TABLE IF EXISTS habilitacoes_licitante`);
    await q.query(`DROP TABLE IF EXISTS exigencias_habilitacao`);
    await q.query(`ALTER TABLE parametros_licitacao DROP COLUMN IF EXISTS prazo_habilitacao_horas`);
    await q.query(`ALTER TABLE licitacoes DROP COLUMN IF EXISTS inversao_fases`);
  }
}
