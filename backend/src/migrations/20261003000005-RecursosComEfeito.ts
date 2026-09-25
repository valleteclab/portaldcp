import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarRecursos } from '../sessao/migracao-recursos';

/**
 * E5 — RECURSOS COM EFEITO (Lei 14.133/2021 arts. 165 e 168; IN SEGES 73/2022 art. 40):
 *  - `janelas_intencao_recurso` (janela ≥ 10 min aberta pelo agente; preclusão);
 *  - `recursos_contrarrazoes` (uma por licitante, com arquivo no banco);
 *  - colunas novas em `recursos_administrativos` (ato recorrido, alvo, janela,
 *    admissibilidade, arquivo das razões, reconsideração, autoridade superior,
 *    efeitos do provimento, origem);
 *  - enum do status: AGUARDANDO_AUTORIDADE;
 *  - dados (`migrarRecursos`): intenções por evento → recurso; janelas do fluxo
 *    antigo; contrarrazões JSON → tabela.
 *
 * IDEMPOTENTE. Sem transação (ALTER TYPE ... ADD VALUE). Produção com
 * synchronize ligado: o synchronize cria tabelas/colunas/enum e o boot
 * (MigracaoRecursosBootService) migra os dados — esta migration existe para
 * quando o synchronize for desligado (E9).
 */
export class RecursosComEfeito20261003000005 implements MigrationInterface {
  name = 'RecursosComEfeito20261003000005';
  transaction = false as const;

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE recursos_administrativos_status_enum ADD VALUE IF NOT EXISTS 'AGUARDANDO_AUTORIDADE'`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS janelas_intencao_recurso (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sessao_id uuid NOT NULL,
        licitacao_id uuid NOT NULL,
        aberta_em timestamp NOT NULL,
        fecha_em timestamp NOT NULL,
        minutos int NOT NULL,
        aberta_por_tipo varchar(20),
        aberta_por_id varchar,
        aberta_por_nome varchar,
        superada_em timestamp,
        superada_motivo text,
        origem varchar(20) NOT NULL DEFAULT 'SALA',
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_janelas_intencao_sessao" ON janelas_intencao_recurso (sessao_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_janelas_intencao_licitacao" ON janelas_intencao_recurso (licitacao_id)`);
    await q.query(`
      CREATE TABLE IF NOT EXISTS recursos_contrarrazoes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        recurso_id uuid NOT NULL,
        licitacao_id uuid NOT NULL,
        fornecedor_id varchar NOT NULL,
        fornecedor_nome varchar,
        texto text NOT NULL,
        arquivo_nome varchar(200),
        arquivo_mime varchar(80),
        arquivo_tamanho int,
        arquivo_sha256 varchar(64),
        arquivo_conteudo bytea,
        origem varchar(20) NOT NULL DEFAULT 'SALA',
        apresentada_em timestamp NOT NULL,
        created_at timestamp NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "UQ_recursos_contrarrazoes" ON recursos_contrarrazoes (recurso_id, fornecedor_id)`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_recursos_contrarrazoes_licitacao" ON recursos_contrarrazoes (licitacao_id)`);
    const colunas: Array<[string, string]> = [
      ['ato_recorrido', 'varchar(30)'],
      ['fornecedor_alvo_id', 'varchar'],
      ['tipo_unidade', 'varchar(10)'],
      ['janela_id', 'uuid'],
      ['intencao_decidida_em', 'timestamp'],
      ['intencao_decidida_por_tipo', 'varchar(20)'],
      ['intencao_decidida_por_id', 'varchar'],
      ['pressuposto_ausente', 'varchar(20)'],
      ['motivo_nao_conhecimento', 'text'],
      ['razoes_arquivo_nome', 'varchar(200)'],
      ['razoes_arquivo_mime', 'varchar(80)'],
      ['razoes_arquivo_tamanho', 'int'],
      ['razoes_arquivo_sha256', 'varchar(64)'],
      ['razoes_arquivo_conteudo', 'bytea'],
      ['prazo_reconsideracao', 'timestamp'],
      ['reconsideracao', 'varchar(15)'],
      ['reconsideracao_fundamentacao', 'text'],
      ['reconsideracao_em', 'timestamp'],
      ['reconsideracao_por_tipo', 'varchar(20)'],
      ['reconsideracao_por_id', 'varchar'],
      ['reconsideracao_por_nome', 'varchar'],
      ['encaminhado_em', 'timestamp'],
      ['prazo_decisao_autoridade', 'timestamp'],
      ['instancia_decisao', 'varchar(15)'],
      ['decidido_por_tipo', 'varchar(20)'],
      ['decidido_por_id', 'varchar'],
      ['efeitos', 'jsonb'],
      ['origem', 'varchar(20)'],
    ];
    for (const [nome, tipo] of colunas) {
      await q.query(`ALTER TABLE recursos_administrativos ADD COLUMN IF NOT EXISTS ${nome} ${tipo}`);
    }
    await migrarRecursos(q);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS recursos_contrarrazoes`);
    await q.query(`DROP TABLE IF EXISTS janelas_intencao_recurso`);
    // colunas novas e valores de enum ficam (Postgres não suporta DROP VALUE; colunas são nulas)
  }
}
