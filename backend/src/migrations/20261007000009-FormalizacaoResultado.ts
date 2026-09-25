import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E6 — FORMALIZAÇÃO DO RESULTADO (Lei 14.133/2021 art. 71 IV; decisão do
 * usuário 25/09/2026): o agente de contratação registra, a autoridade pratica
 * o ato.
 *  - `orgaos.modo_formalizacao_resultado` (REGISTRO_DIRETO padrão |
 *    ASSINATURA_ELETRONICA | TERMO_EXTERNO);
 *  - `autoridades_orgao` (autoridades competentes do órgão, uma padrão);
 *  - `formalizacoes_resultado` (operador × autoridade, modo, termo, documento
 *    de assinatura, termo externo).
 * Sem dados a migrar (atos antigos seguem com `homologacao_autoridade_*`).
 *
 * IDEMPOTENTE. Produção com synchronize ligado: o synchronize cria o schema —
 * esta migration existe para quando o synchronize for desligado (E9).
 */
export class FormalizacaoResultado20261007000009 implements MigrationInterface {
  name = 'FormalizacaoResultado20261007000009';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE orgaos ADD COLUMN IF NOT EXISTS modo_formalizacao_resultado varchar(30) NOT NULL DEFAULT 'REGISTRO_DIRETO'`);
    await q.query(`CREATE TABLE IF NOT EXISTS autoridades_orgao (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      orgao_id uuid NOT NULL,
      nome varchar(200) NOT NULL, cargo varchar(200) NOT NULL,
      cpf varchar(14), email varchar(200),
      ato_delegacao_numero varchar(120), ato_delegacao_data date,
      padrao boolean NOT NULL DEFAULT false, ativo boolean NOT NULL DEFAULT true,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_autoridades_orgao_orgao" ON autoridades_orgao (orgao_id)`);
    await q.query(`CREATE TABLE IF NOT EXISTS formalizacoes_resultado (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      licitacao_id uuid NOT NULL, orgao_id varchar(64) NOT NULL,
      tipo varchar(20) NOT NULL, modo varchar(30) NOT NULL, status varchar(30) NOT NULL,
      autoridade_id uuid, autoridade_nome varchar(200) NOT NULL, autoridade_cargo varchar(200) NOT NULL,
      autoridade_cpf varchar(14), autoridade_email varchar(200),
      autoridade_ato_delegacao_numero varchar(120), autoridade_ato_delegacao_data date,
      operador_tipo varchar(20) NOT NULL, operador_id varchar(64), operador_nome varchar(200) NOT NULL,
      motivo text, valor_total numeric(15,2), dados jsonb,
      arquivo_termo varchar(500), arquivo_assinado varchar(500), documento_assinatura_id uuid,
      erro text, efetivado_em timestamptz,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_formalizacoes_resultado_licitacao" ON formalizacoes_resultado (licitacao_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_formalizacoes_resultado_documento" ON formalizacoes_resultado (documento_assinatura_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS formalizacoes_resultado`);
    await q.query(`DROP TABLE IF EXISTS autoridades_orgao`);
    await q.query(`ALTER TABLE orgaos DROP COLUMN IF EXISTS modo_formalizacao_resultado`);
  }
}
