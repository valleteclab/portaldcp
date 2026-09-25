import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarModeloLances, resumoMigracaoLances } from '../disputa/migracao-lances';

/**
 * E2 — Motor de disputa único: modelo de lance (valor_unitario/valor_total
 * explícitos, origem, base_lance, cancelamento lógico com motivo), base do
 * lance e tipo de diferença mínima na licitação, overrides de disputa da
 * licitação anuláveis (herdam do órgão), % de reinício no parâmetro,
 * retrato congelado da sessão (`sessao_atas_snapshots`) e unicidade da
 * anonimização — + migração dos dados existentes (migracao-lances.ts).
 *
 * IDEMPOTENTE: DDL com IF NOT EXISTS; dados só em linhas não migradas.
 *
 * ---------------------------------------------------------------------------
 * COMO CHEGA À PRODUÇÃO (synchronize ligado, migrationsRun desligado)
 * ---------------------------------------------------------------------------
 * NÃO rode `migration:run` na VPS. Caminho:
 *   1. backup:  docker compose -f docker-compose.coolify.yml exec -T postgres \
 *                 pg_dump -U portaldcp -d portaldcp --clean --if-exists | gzip > /opt/backups/pre-e2-lances.sql.gz
 *   2. conferência ANTES (guardar a saída):
 *        SELECT COUNT(*) total, COUNT(fornecedor_id) com_fornecedor, COUNT(item_id) com_item,
 *               SUM(CASE WHEN ip_origem='SISTEMA' THEN 1 ELSE 0 END) propostas FROM lances;
 *        SELECT sessao_id, indice, COUNT(*) FROM mapeamento_anonimo GROUP BY 1,2 HAVING COUNT(*)>1;
 *   3. deploy normal (BRANCH=... bash deploy-vps.sh): o synchronize cria as
 *      colunas/tabela novas; o MigracaoLancesBootService roda ESTA rotina de
 *      dados e loga "Migração do modelo de lance (E2): ..." com as contagens.
 *   4. conferência DEPOIS:
 *        docker compose -f docker-compose.coolify.yml logs backend | grep "modelo de lance"
 *        SELECT base_lance, origem, COUNT(*) FROM lances GROUP BY 1,2;
 *        SELECT COUNT(*) FROM lances WHERE item_id IS NOT NULL AND (valor_total IS NULL OR valor_unitario IS NULL); -- 0
 *        SELECT indexname FROM pg_indexes WHERE indexname IN ('UQ_lances_proposta_ativa','UQ_mapeamento_anonimo_sessao_indice');
 * Rollback de dados: `down()` (volta intervalo do sistema a 3 e desfaz os
 * cancelamentos da migração) ou restaurar o backup do passo 1.
 */
export class ModeloLanceE220260925000001 implements MigrationInterface {
  name = 'ModeloLanceE220260925000001';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE lances ADD COLUMN IF NOT EXISTS valor_unitario numeric(15,4)`);
    await q.query(`ALTER TABLE lances ADD COLUMN IF NOT EXISTS valor_total numeric(15,2)`);
    await q.query(`ALTER TABLE lances ADD COLUMN IF NOT EXISTS base_lance varchar(20)`);
    await q.query(`ALTER TABLE lances ADD COLUMN IF NOT EXISTS origem varchar(20) NOT NULL DEFAULT 'LANCE'`);
    await q.query(`ALTER TABLE lances ADD COLUMN IF NOT EXISTS cancelado_em timestamp`);
    await q.query(`ALTER TABLE lances ADD COLUMN IF NOT EXISTS cancelado_por varchar(20)`);
    await q.query(`ALTER TABLE lances ADD COLUMN IF NOT EXISTS cancelado_motivo text`);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_lances_item_ativo" ON lances (item_id, cancelado)`);

    await q.query(`ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS base_lance varchar(20) NOT NULL DEFAULT 'TOTAL_ITEM'`);
    await q.query(`ALTER TABLE licitacoes ADD COLUMN IF NOT EXISTS tipo_diferenca_minima_lances varchar(12) NOT NULL DEFAULT 'VALOR'`);
    for (const c of ['tempo_inatividade', 'intervalo_minimo_lances', 'tempo_prorrogacao']) {
      await q.query(`ALTER TABLE licitacoes ALTER COLUMN ${c} DROP NOT NULL`);
      await q.query(`ALTER TABLE licitacoes ALTER COLUMN ${c} DROP DEFAULT`);
    }

    await q.query(`ALTER TABLE parametros_licitacao ADD COLUMN IF NOT EXISTS percentual_reinicio_disputa numeric(5,2) NOT NULL DEFAULT 5`);
    await q.query(`ALTER TABLE parametros_licitacao ALTER COLUMN intervalo_minimo_lances_minutos SET DEFAULT 0`);
    await q.query(`ALTER TABLE sessoes_disputa ALTER COLUMN intervalo_minimo_lances_minutos SET DEFAULT 0`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS sessao_atas_snapshots (
        id uuid NOT NULL DEFAULT uuid_generate_v4(),
        sessao_id uuid NOT NULL,
        licitacao_id uuid NOT NULL,
        motivo_ato varchar(40) NOT NULL,
        justificativa text,
        conteudo jsonb NOT NULL,
        hash_sha256 varchar(64) NOT NULL,
        ator_tipo varchar(20) NOT NULL,
        ator_id varchar(100),
        created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_sessao_atas_snapshots_id" PRIMARY KEY (id)
      )
    `);
    await q.query(`CREATE INDEX IF NOT EXISTS "IDX_sessao_atas_snapshots_sessao" ON sessao_atas_snapshots (sessao_id, created_at)`);

    const r = await migrarModeloLances(q);
    // eslint-disable-next-line no-console
    console.log(`[ModeloLanceE2] ${resumoMigracaoLances(r)}`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `UPDATE lances SET cancelado = false, cancelado_em = NULL, cancelado_por = NULL, cancelado_motivo = NULL
        WHERE cancelado_por = 'MIGRACAO'`,
    );
    await q.query(`UPDATE parametros_licitacao SET intervalo_minimo_lances_minutos = 3 WHERE orgao_id IS NULL AND intervalo_minimo_lances_minutos = 0`);
    await q.query(`DROP INDEX IF EXISTS "UQ_lances_proposta_ativa"`);
    await q.query(`DROP INDEX IF EXISTS "UQ_mapeamento_anonimo_sessao_indice"`);
  }
}
