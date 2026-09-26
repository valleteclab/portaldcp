import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarDivulgacaoOficial } from '../licitacoes/transicoes/migracao-divulgacao';

/**
 * DIVULGAÇÃO OFICIAL CONFIRMADA (Lei 14.133/2021 arts. 54, 55, 174 e 176;
 * art. 75 §3º; IN SEGES 67/2021 arts. 6º e 7º):
 *  - fase nova `AGUARDANDO_DIVULGACAO` (ato de publicação praticado, PNCP ainda
 *    não confirmou — sem prazo, sem propostas, não pública);
 *  - `licitacoes.data_divulgacao_oficial` / `meio_divulgacao_oficial` /
 *    `referencia_divulgacao_oficial`;
 *  - `pncp_sync.erro_status_http` / `erro_resposta` (retorno real do PNCP);
 *  - dados: `migrarDivulgacaoOficial` (a mesma rotina do boot).
 *
 * IDEMPOTENTE. Produção com synchronize ligado: o synchronize cria o schema e
 * o boot (MigracaoDivulgacaoBootService) migra os dados — esta migration
 * existe para quando o synchronize for desligado (E9).
 */
export class DivulgacaoOficial20261010000040 implements MigrationInterface {
  name = 'DivulgacaoOficial20261010000040';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE licitacoes_fase_enum ADD VALUE IF NOT EXISTS 'AGUARDANDO_DIVULGACAO' BEFORE 'PUBLICADO'`);
    await q.query(`ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS data_divulgacao_oficial timestamp`);
    await q.query(`ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS meio_divulgacao_oficial varchar(30)`);
    await q.query(`ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS referencia_divulgacao_oficial varchar(500)`);
    await q.query(`ALTER TABLE pncp_sync ADD COLUMN IF NOT EXISTS erro_status_http int`);
    await q.query(`ALTER TABLE pncp_sync ADD COLUMN IF NOT EXISTS erro_resposta jsonb`);
    // ADD VALUE de enum só vale depois do commit: a migração dos dados vai em transação própria
    await q.commitTransaction().catch(() => undefined);
    await q.startTransaction().catch(() => undefined);
    await migrarDivulgacaoOficial(q.manager);
  }

  public async down(q: QueryRunner): Promise<void> {
    // Volta as linhas à fase do ato de publicação (o valor do enum fica — o Postgres não remove valor de enum).
    await q.query(`UPDATE licitacoes SET fase = 'PUBLICADO' WHERE fase::text = 'AGUARDANDO_DIVULGACAO'`);
    await q.query(`ALTER TABLE pncp_sync DROP COLUMN IF EXISTS erro_resposta`);
    await q.query(`ALTER TABLE pncp_sync DROP COLUMN IF EXISTS erro_status_http`);
    await q.query(`ALTER TABLE licitacoes DROP COLUMN IF EXISTS referencia_divulgacao_oficial`);
    await q.query(`ALTER TABLE licitacoes DROP COLUMN IF EXISTS meio_divulgacao_oficial`);
    await q.query(`ALTER TABLE licitacoes DROP COLUMN IF EXISTS data_divulgacao_oficial`);
  }
}
