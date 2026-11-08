import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';

/** Schema onde ficam guardadas, intactas, as tabelas do motor antigo que saíram de uso. */
export const SCHEMA_BACKUP_MOTOR_ANTIGO = 'backup_motor_antigo';

/**
 * Tabelas aposentadas em 11/2026 ("um motor só", passo 3):
 *  - rascunhos_modelo_fluxo: rascunhos do construtor de fluxo antigo;
 *  - fluxos_aprovacao_documento, aprovacoes_documento, modelos_fluxo_aprovacao:
 *    fluxos de aprovação das peças (a aprovação virou etapa do fluxo do processo).
 */
export const TABELAS_APOSENTADAS = ['rascunhos_modelo_fluxo', 'fluxos_aprovacao_documento', 'aprovacoes_documento', 'modelos_fluxo_aprovacao'] as const;

/**
 * ARQUIVO DO MOTOR ANTIGO — backup antes de remover (decisão do dono, 08/11/2026:
 * "sempre fazendo um backup, porque caso precise restaurar, a gente já tem de
 * onde começar").
 *
 * Nada é apagado: cada tabela aposentada é MOVIDA, com todos os dados, para o
 * schema `backup_motor_antigo` do mesmo banco. As chaves estrangeiras dela são
 * retiradas (o backup não pode impedir nem sofrer a exclusão de um processo).
 * Antes, as peças paradas "aguardando aprovação" no fluxo antigo voltam para
 * "em elaboração" — senão ficariam presas, sem ninguém para decidir.
 *
 * Idempotente: roda a cada boot e só age se a tabela ainda está no schema
 * público. Restaurar uma tabela:
 *   ALTER TABLE backup_motor_antigo.<tabela> SET SCHEMA public;
 * (o código que a usava está no histórico do git — ver docs/backup-motor-antigo.md).
 */
@Injectable()
export class ArquivoMotorAntigoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ArquivoMotorAntigoBootService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    if (process.env.ARQUIVAR_MOTOR_ANTIGO === 'false') return Promise.resolve();
    return executarMigracaoDeBoot(this.ds, () => this.executar())
      .then(() => undefined)
      .catch((e) => this.logger.error(`Arquivo do motor antigo não concluído: ${e instanceof Error ? e.message : e}`));
  }

  private async existe(schema: string, tabela: string): Promise<boolean> {
    const [r] = await this.ds.query(`SELECT to_regclass($1) IS NOT NULL AS ok`, [`${schema}.${tabela}`]);
    return !!r?.ok;
  }

  async executar(): Promise<{ movidas: string[]; pecas_devolvidas: number }> {
    const pendentes: string[] = [];
    for (const t of TABELAS_APOSENTADAS) if (await this.existe('public', t)) pendentes.push(t);
    if (!pendentes.length) return { movidas: [], pecas_devolvidas: 0 };

    return this.ds.transaction(async (m) => {
      // Peças presas no fluxo de aprovação antigo voltam para "em elaboração" (a etapa do fluxo decide se contam)
      const devolvidas: any[] = await m.query(
        `UPDATE documentos_fase_interna SET status = 'EM_ELABORACAO', updated_at = now()
          WHERE status = 'AGUARDANDO_APROVACAO' RETURNING id`,
      );
      await m.query(`CREATE SCHEMA IF NOT EXISTS ${SCHEMA_BACKUP_MOTOR_ANTIGO}`);
      const movidas: string[] = [];
      for (const t of pendentes) {
        if (await this.existe(SCHEMA_BACKUP_MOTOR_ANTIGO, t)) {
          this.logger.warn(`Arquivo do motor antigo: ${t} já existe em ${SCHEMA_BACKUP_MOTOR_ANTIGO} — a do schema público fica onde está.`);
          continue;
        }
        const [{ n }] = await m.query(`SELECT count(*)::int AS n FROM public.${t}`);
        // Chaves estrangeiras que saem desta tabela ou chegam a ela
        const fks: Array<{ tabela: string; nome: string }> = await m.query(
          `SELECT c.conrelid::regclass::text AS tabela, c.conname AS nome
             FROM pg_constraint c
            WHERE c.contype = 'f' AND (c.conrelid = $1::regclass OR c.confrelid = $1::regclass)`,
          [`public.${t}`],
        );
        for (const fk of fks) await m.query(`ALTER TABLE ${fk.tabela} DROP CONSTRAINT IF EXISTS "${fk.nome.replace(/"/g, '""')}"`);
        await m.query(`ALTER TABLE public.${t} SET SCHEMA ${SCHEMA_BACKUP_MOTOR_ANTIGO}`);
        movidas.push(`${t} (${n} linha(s))`);
      }
      this.logger.warn(
        `Arquivo do motor antigo: ${movidas.length ? movidas.join(', ') : 'nada'} movido(s) para ${SCHEMA_BACKUP_MOTOR_ANTIGO}; ` +
          `${devolvidas.length} peça(s) "aguardando aprovação" voltaram para "em elaboração".`,
      );
      return { movidas, pecas_devolvidas: devolvidas.length };
    });
  }
}
