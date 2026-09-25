import { MigrationInterface, QueryRunner } from 'typeorm';
import { migrarDispensaParaMotor, resumoMigracaoDispensa } from '../disputa/migracao-dispensa';

/**
 * E2 item 7 — Dispensa eletrônica no motor único: `dispensa_lances` → `lances`
 * (origem JANELA_DISPENSA, base UNITARIO) e `dispensa_mensagens` → chat da
 * sala (`eventos_sessao`). As tabelas legadas ficam (não são apagadas); o
 * sistema deixa de escrevê-las. Rotina de dados em `migracao-dispensa.ts`.
 *
 * IDEMPOTENTE: as linhas novas têm o MESMO id da linha legada.
 *
 * ---------------------------------------------------------------------------
 * COMO CHEGA À PRODUÇÃO (synchronize ligado, migrationsRun desligado)
 * ---------------------------------------------------------------------------
 * NÃO rode `migration:run` na VPS. Caminho:
 *   0. de preferência sem janela de lances de dispensa aberta no momento do
 *      deploy (conferir: SELECT id, numero_processo, dispensa_lances_fim FROM licitacoes
 *        WHERE modalidade = 'DISPENSA_ELETRONICA' AND dispensa_lances_fim > now();)
 *      — se houver, a rotina cria a sala em MODO_ABERTO e o relógio único
 *      encerra a janela no horário; os lances já dados são migrados.
 *   1. backup:  docker compose -f docker-compose.coolify.yml exec -T postgres \
 *                 pg_dump -U portaldcp -d portaldcp --clean --if-exists | gzip > /opt/backups/pre-e2-dispensa.sql.gz
 *   2. conferência ANTES (guardar a saída):
 *        SELECT COUNT(*) FROM dispensa_lances;
 *        SELECT COUNT(*) FROM dispensa_mensagens;
 *        SELECT licitacao_id, COUNT(*), MIN(valor_unitario) FROM dispensa_lances GROUP BY 1 ORDER BY 1;
 *   3. deploy normal (BRANCH=... bash deploy-vps.sh): o MigracaoDispensaBootService
 *      roda esta rotina e loga "Migração da dispensa para o motor único (E2): ..."
 *      com as contagens (legados × no motor × órfãos).
 *   4. conferência DEPOIS:
 *        docker compose -f docker-compose.coolify.yml logs backend | grep "dispensa para o motor"
 *        SELECT COUNT(*) FROM lances WHERE origem = 'JANELA_DISPENSA';            -- = dispensa_lances (menos órfãos)
 *        SELECT licitacao_id, COUNT(*), MIN(valor_unitario) FROM lances
 *         WHERE origem = 'JANELA_DISPENSA' GROUP BY 1 ORDER BY 1;                 -- igual ao passo 2
 *        SELECT COUNT(*) FROM dispensa_mensagens dm JOIN eventos_sessao e ON e.id = dm.id; -- = dispensa_mensagens
 *      e abrir a ata (GET /api/licitacoes/:id/dispensa/ata) de uma dispensa já julgada.
 *   5. Opcional: DISPENSA_MIGRAR_NO_BOOT=false depois de conferido.
 * Rollback de dados: `down()` (remove só as linhas copiadas; as legadas
 * continuam intactas) ou restaurar o backup do passo 1.
 */
export class DispensaMotorUnico20260926000001 implements MigrationInterface {
  name = 'DispensaMotorUnico20260926000001';

  public async up(q: QueryRunner): Promise<void> {
    const r = await migrarDispensaParaMotor(q);
    // eslint-disable-next-line no-console
    console.log(`[DispensaMotorUnico] ${resumoMigracaoDispensa(r)}`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM lances l USING dispensa_lances dl WHERE l.id::text = dl.id::text AND l.origem = 'JANELA_DISPENSA'`);
    await q.query(`DELETE FROM eventos_sessao e USING dispensa_mensagens dm WHERE e.id::text = dm.id::text`);
  }
}
