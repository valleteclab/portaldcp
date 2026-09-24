import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { houveMudanca, migrarModeloLances, resumoMigracaoLances } from './migracao-lances';

/**
 * Executa no BOOT a migração de dados do modelo de lance (E2) — produção roda
 * com `synchronize` ligado e SEM `migrationsRun` (mesmo padrão da E1:
 * MigracaoSituacaoBootService). O synchronize já criou as colunas novas antes
 * deste hook; a rotina é idempotente (só toca linhas com `base_lance` nulo,
 * duplicatas e índices ausentes) — depois da 1ª execução custa alguns SELECT.
 * Falha é logada e NÃO derruba o boot. Desligar: LANCES_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoLancesBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoLancesBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.LANCES_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarModeloLances(m));
      if (houveMudanca(r)) this.logger.log(`Migração do modelo de lance (E2): ${resumoMigracaoLances(r)}`);
      if (r.orfaosSemFornecedor > 0) {
        this.logger.warn(`Modelo de lance (E2): ${r.orfaosSemFornecedor} lance(s) legado(s) sem fornecedor identificável (fornecedor_id nulo)`);
      }
    } catch (e: any) {
      this.logger.error(`Migração do modelo de lance (E2) não executada: ${e?.message ?? e}`);
    }
  }
}
