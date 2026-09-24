import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarSituacaoLegada } from '../licitacoes/transicoes/migracao-situacao';

/**
 * E1 — Máquina de estados da licitação: `situacao` separada da `fase`,
 * `fase_anterior` e histórico `licitacao_transicoes`, + migração dos dados
 * legados (fase = SUSPENSO/REVOGADO/ANULADO/DESERTO/FRACASSADO/CONCLUIDO).
 *
 * IDEMPOTENTE (pode rodar 2×): DDL com IF NOT EXISTS e a migração de dados só
 * toca linhas cuja fase ainda é um valor legado. Regra de inferência da fase:
 * backend/src/licitacoes/transicoes/migracao-situacao.ts.
 *
 * ---------------------------------------------------------------------------
 * COMO ISTO CHEGA À PRODUÇÃO (synchronize ligado, migrationsRun desligado)
 * ---------------------------------------------------------------------------
 * NÃO é preciso rodar `migration:run` na VPS (e NÃO rode: a tabela
 * `migrations` de produção não tem as migrations antigas registradas — o
 * TypeORM tentaria aplicar todas). O caminho de produção é:
 *   1. backup:  docker compose -f docker-compose.coolify.yml exec -T postgres \
 *                 pg_dump -U portaldcp -d portaldcp --clean --if-exists | gzip > /opt/backups/pre-e1-situacao.sql.gz
 *   2. deploy normal: BRANCH=main bash deploy-vps.sh
 *      - o synchronize cria licitacoes.situacao (default ATIVA), fase_anterior
 *        e a tabela licitacao_transicoes;
 *      - o MigracaoSituacaoBootService roda ESTA MESMA rotina de dados no boot
 *        (idempotente) e loga "Migração da situação (E1): N licitação(ões)...".
 *   3. conferir: docker compose -f docker-compose.coolify.yml logs backend | grep "Migração da situação"
 *      e   SELECT fase, situacao, COUNT(*) FROM licitacoes GROUP BY 1,2;
 *      (nenhuma linha com fase IN ('SUSPENSO','REVOGADO','ANULADO','DESERTO','FRACASSADO','CONCLUIDO')).
 * Rollback de dados: `down()` abaixo (ou restaurar o backup do passo 1).
 *
 * Com DB_SYNCHRONIZE=false + DB_MIGRATIONS_RUN=true (futuro), esta migration
 * cria o schema e migra os dados sozinha.
 */
export class SituacaoLicitacao20260924000001 implements MigrationInterface {
  name = 'SituacaoLicitacao20260924000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "licitacoes_situacao_enum" AS ENUM
          ('ATIVA','SUSPENSA','REVOGADA','ANULADA','DESERTA','FRACASSADA','CONCLUIDA');
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);
    await queryRunner.query(`
      ALTER TABLE "licitacoes"
        ADD COLUMN IF NOT EXISTS "situacao" "licitacoes_situacao_enum" NOT NULL DEFAULT 'ATIVA'
    `);
    await queryRunner.query(`ALTER TABLE "licitacoes" ADD COLUMN IF NOT EXISTS "fase_anterior" varchar(40)`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "licitacao_transicoes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "licitacao_id" uuid NOT NULL,
        "fase_de" varchar(40),
        "fase_para" varchar(40) NOT NULL,
        "situacao_de" varchar(20),
        "situacao_para" varchar(20) NOT NULL,
        "ato" varchar(60) NOT NULL,
        "motivo" text,
        "ator_tipo" varchar(20) NOT NULL,
        "ator_id" varchar(100),
        "dados" jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_licitacao_transicoes_id" PRIMARY KEY ("id"),
        CONSTRAINT "FK_licitacao_transicoes_licitacao" FOREIGN KEY ("licitacao_id")
          REFERENCES "licitacoes"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_licitacao_transicoes_licitacao_criado"
        ON "licitacao_transicoes" ("licitacao_id", "created_at")
    `);

    const r = await migrarSituacaoLegada(queryRunner);
    // eslint-disable-next-line no-console
    console.log(`[SituacaoLicitacao] ${r.migradas}/${r.encontradas} licitação(ões) legada(s) migrada(s)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Devolve a situação para a fase legada (só das linhas migradas por aqui ou
    // pelo boot) — o esquema novo fica (o synchronize o recriaria de todo modo).
    await queryRunner.query(`
      UPDATE licitacoes l
         SET fase = (t.dados->>'fase_legada')::licitacoes_fase_enum,
             situacao = 'ATIVA'
        FROM licitacao_transicoes t
       WHERE t.licitacao_id = l.id
         AND t.ato = 'MIGRACAO_SITUACAO'
         AND l.fase::text = t.fase_para
         AND l.situacao::text = t.situacao_para
    `);
    await queryRunner.query(`DELETE FROM licitacao_transicoes WHERE ato = 'MIGRACAO_SITUACAO'`);
  }
}
