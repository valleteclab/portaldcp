import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * E3 — Desempate (Lei 14.133 art. 60; IN SEGES 73/2022 art. 28) e julgamento
 * técnico (arts. 35–37) / maior retorno econômico (art. 39):
 *  - `desempates` (grupo empatado, disputa final com prazo, trilha dos
 *    critérios, sorteio auditável: instante do ato, entrada, semente, algoritmo)
 *    e `desempate_ofertas` (nova proposta selada da disputa final);
 *  - `julgamento_tecnico` (peso da técnica ≤ 70%, nota mínima, publicação e
 *    resultado congelado), `quesitos_tecnicos`, `comissao_julgamento`,
 *    `notas_tecnicas` (por membro), `documentos_tecnicos` (arquivo no banco);
 *  - `propostas_retorno_economico` (economia estimada + percentual).
 * Lance de origem DISPUTA_FINAL: `lances.origem` é varchar — sem ALTER TYPE.
 * IDEMPOTENTE. Produção (synchronize ligado) já cria tudo pelas entidades;
 * esta migration existe para quando o synchronize for desligado (E9).
 */
export class JulgamentoTecnicoDesempate20260930000005 implements MigrationInterface {
  name = 'JulgamentoTecnicoDesempate20260930000005';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS desempates (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        sessao_id uuid,
        tipo_unidade varchar(10) NOT NULL,
        unidade_id uuid NOT NULL,
        status varchar(30) NOT NULL,
        fornecedores jsonb NOT NULL,
        valor_empatado numeric(18,6) NOT NULL,
        chave varchar(12) NOT NULL DEFAULT 'VALOR',
        disputa_final_convocada_em timestamp,
        disputa_final_prazo_minutos int,
        disputa_final_prazo_ate timestamp,
        disputa_final_encerrada_em timestamp,
        disputa_final_nao_aplicada text,
        blocos jsonb,
        trilha jsonb,
        ordem_final jsonb,
        criterio_decisivo varchar(40),
        sorteio_ato_em timestamp,
        sorteio_algoritmo varchar(30),
        sorteio jsonb,
        resolvido_em timestamp,
        ator_tipo varchar(20),
        ator_id varchar,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_desempates_unidade" ON desempates (unidade_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_desempates_licitacao" ON desempates (licitacao_id)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS desempate_ofertas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        desempate_id uuid NOT NULL,
        fornecedor_id varchar NOT NULL,
        valor numeric(15,2) NOT NULL,
        enviada_em timestamp NOT NULL,
        lance_id uuid,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_desempate_ofertas" ON desempate_ofertas (desempate_id, fornecedor_id)`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS julgamento_tecnico (
        licitacao_id uuid PRIMARY KEY,
        peso_tecnica numeric(5,2),
        nota_minima numeric(7,4),
        publicado_em timestamp,
        publicado_por_tipo varchar(20),
        publicado_por_id varchar,
        resultado jsonb,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS quesitos_tecnicos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        ordem int NOT NULL,
        descricao text NOT NULL,
        criterio_avaliacao text,
        peso numeric(9,4) NOT NULL,
        nota_maxima numeric(9,4) NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_quesitos_tecnicos_licitacao" ON quesitos_tecnicos (licitacao_id)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS comissao_julgamento (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        usuario_id uuid NOT NULL,
        papel varchar(20) NOT NULL DEFAULT 'MEMBRO',
        designado_por_tipo varchar(20),
        designado_por_id varchar,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_comissao_julgamento" ON comissao_julgamento (licitacao_id, usuario_id)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS notas_tecnicas (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        quesito_id uuid NOT NULL,
        fornecedor_id varchar NOT NULL,
        membro_id uuid NOT NULL,
        nota numeric(9,4) NOT NULL,
        justificativa text,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_notas_tecnicas" ON notas_tecnicas (quesito_id, fornecedor_id, membro_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_notas_tecnicas_licitacao" ON notas_tecnicas (licitacao_id)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS documentos_tecnicos (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        fornecedor_id varchar NOT NULL,
        nome varchar(255) NOT NULL,
        descricao text,
        mime varchar(100) NOT NULL,
        tamanho int NOT NULL,
        sha256 varchar(64) NOT NULL,
        conteudo bytea NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_documentos_tecnicos_licitacao" ON documentos_tecnicos (licitacao_id, fornecedor_id)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS propostas_retorno_economico (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        licitacao_id uuid NOT NULL,
        unidade_id uuid NOT NULL,
        fornecedor_id varchar NOT NULL,
        economia_estimada numeric(15,2) NOT NULL,
        descricao_economia text,
        percentual_remuneracao numeric(7,4) NOT NULL,
        created_at timestamp NOT NULL DEFAULT now(),
        updated_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_propostas_retorno" ON propostas_retorno_economico (unidade_id, fornecedor_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const t of [
      'propostas_retorno_economico',
      'documentos_tecnicos',
      'notas_tecnicas',
      'comissao_julgamento',
      'quesitos_tecnicos',
      'julgamento_tecnico',
      'desempate_ofertas',
      'desempates',
    ]) {
      await q.query(`DROP TABLE IF EXISTS ${t}`);
    }
  }
}
