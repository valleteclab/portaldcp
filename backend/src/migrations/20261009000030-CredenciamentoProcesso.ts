import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarCredenciamentosLegados } from '../credenciamento/migracao-credenciamento';

/**
 * E7b — CREDENCIAMENTO COMO PROCESSO (Lei 14.133/2021 arts. 78 I, 79, 74 IV):
 *  - `licitacoes.modalidade` ganha CREDENCIAMENTO (procedimento auxiliar);
 *  - tabelas `credenciamento_configuracoes`, `credenciamento_inscricoes` e
 *    `credenciamento_contratacoes`;
 *  - dados (`migrarCredenciamentosLegados`): linhas de `credenciamentos` /
 *    `credenciados` viram processo + inscrições (mesmos ids). As tabelas
 *    antigas ficam como histórico (pré-qualificação continua nelas).
 *
 * IDEMPOTENTE. Sem transação (ALTER TYPE ... ADD VALUE). Produção com
 * synchronize ligado: o synchronize cria o schema e o boot
 * (MigracaoCredenciamentoBootService) migra os dados — esta migration existe
 * para quando o synchronize for desligado (E9).
 */
export class CredenciamentoProcesso20261009000030 implements MigrationInterface {
  name = 'CredenciamentoProcesso20261009000030';
  transaction = false as const;

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE licitacoes_modalidade_enum ADD VALUE IF NOT EXISTS 'CREDENCIAMENTO'`);
    await q.query(`CREATE TABLE IF NOT EXISTS credenciamento_configuracoes (
      licitacao_id uuid PRIMARY KEY,
      hipotese varchar(30) NOT NULL, regra_distribuicao varchar(30) NOT NULL,
      vigencia_inicio timestamp, vigencia_fim timestamp, validade_credenciado_meses int,
      condicoes_padronizadas text, regras_distribuicao_texto text, prazo_denuncia_dias int, origem varchar(20),
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE TABLE IF NOT EXISTS credenciamento_inscricoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      licitacao_id uuid NOT NULL, fornecedor_id varchar NOT NULL, fornecedor_cnpj varchar(20), fornecedor_razao_social varchar(255),
      status varchar(20) NOT NULL, habilitacao_id uuid, inscrita_em timestamp NOT NULL,
      decidida_em timestamp, decisao_motivo text, decidida_por_tipo varchar(20), decidida_por_id varchar,
      credenciado_em timestamp, validade_ate timestamp, ordem_rodizio int,
      recurso_prazo_ate timestamp, recurso_status varchar(25), recurso_razoes text, recurso_interposto_em timestamp,
      recurso_decisao text, recurso_decidido_em timestamp,
      descredenciamento_iniciativa varchar(30), descredenciamento_motivo text, descredenciamento_pedido_em timestamp, descredenciamento_efeitos_em timestamp,
      origem varchar(20), legado jsonb,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_credenciamento_inscricoes_lic_forn" ON credenciamento_inscricoes (licitacao_id, fornecedor_id)`);
    // Recurso em duas instâncias (art. 165 §2º): arquivo das razões, reconsideração e autoridade
    for (const c of [
      `recurso_arquivo_nome varchar(255)`,
      `recurso_arquivo_mime varchar(100)`,
      `recurso_arquivo_sha256 varchar(64)`,
      `recurso_arquivo_conteudo bytea`,
      `recurso_prazo_reconsideracao timestamp`,
      `recurso_reconsiderado_em timestamp`,
      `recurso_reconsideracao text`,
      `recurso_reconsideracao_por_tipo varchar(20)`,
      `recurso_reconsideracao_por_id varchar`,
      `recurso_prazo_autoridade timestamp`,
      `recurso_instancia varchar(12)`,
      `recurso_autoridade_nome varchar(200)`,
      `recurso_autoridade_cargo varchar(200)`,
      `recurso_decidido_por_tipo varchar(20)`,
      `recurso_decidido_por_id varchar`,
    ]) {
      await q.query(`ALTER TABLE credenciamento_inscricoes ADD COLUMN IF NOT EXISTS ${c}`);
    }
    await q.query(`ALTER TABLE credenciamento_inscricoes ALTER COLUMN recurso_status TYPE varchar(25)`);
    await q.query(`CREATE TABLE IF NOT EXISTS credenciamento_contratacoes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      licitacao_id uuid NOT NULL, numero int NOT NULL, descricao text NOT NULL, regra varchar(30) NOT NULL,
      inscricao_id uuid NOT NULL, fornecedor_id varchar NOT NULL, itens jsonb NOT NULL, valor_total numeric(15,2) NOT NULL,
      registro jsonb NOT NULL, ordem_rodizio int, prazo_execucao_dias int, contrato_id uuid, status varchar(20) NOT NULL, erro text,
      ato_em timestamp NOT NULL, ator_tipo varchar(20), ator_id varchar,
      created_at timestamp NOT NULL DEFAULT now(), updated_at timestamp NOT NULL DEFAULT now())`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_credenciamento_contratacoes_lic" ON credenciamento_contratacoes (licitacao_id, numero)`);
    await migrarCredenciamentosLegados(q.manager);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Os processos migrados continuam sendo licitações; o valor do enum não é removido (Postgres).
    await q.query(`DROP TABLE IF EXISTS credenciamento_contratacoes`);
    await q.query(`DROP TABLE IF EXISTS credenciamento_inscricoes`);
    await q.query(`DROP TABLE IF EXISTS credenciamento_configuracoes`);
  }
}
