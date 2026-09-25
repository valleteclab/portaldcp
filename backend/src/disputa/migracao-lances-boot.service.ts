import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { houveMudanca, migrarModeloLances, resumoMigracaoLances } from './migracao-lances';
import { garantirIndicesDisputaLote } from './migracao-lote';

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

  onApplicationBootstrap(): Promise<void> {
    // Fila única: as migrações de boot rodam uma de cada vez (ver common/migracao-boot.ts)
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  private async executarMigracao(): Promise<void> {
    if (process.env.LANCES_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarModeloLances(m));
      // Disputa por lote (E2 item 5): índice único parcial da proposta-lance do lote
      await garantirIndicesDisputaLote(this.dataSource);
      if (houveMudanca(r)) this.logger.log(`Migração do modelo de lance (E2): ${resumoMigracaoLances(r)}`);
      if (r.orfaosSemFornecedor > 0) {
        this.logger.warn(`Modelo de lance (E2): ${r.orfaosSemFornecedor} lance(s) legado(s) sem fornecedor identificável (fornecedor_id nulo)`);
      }
    } catch (e: any) {
      this.logger.error(`Migração do modelo de lance (E2) não executada: ${e?.message ?? e}`);
    }
  }
}
