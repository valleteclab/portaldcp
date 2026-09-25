import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { houveMudancaResultado, migrarResultado, resumoMigracaoResultado } from './migracao-resultado';

/**
 * Executa no BOOT a migração de dados do resultado (E6) — produção roda com
 * `synchronize` ligado e SEM `migrationsRun` (mesmo padrão da E1–E5). O
 * synchronize já criou as colunas/valores de enum novos antes deste hook; a
 * rotina é idempotente. Falha é logada e NÃO derruba o boot.
 * Desligar: RESULTADO_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoResultadoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoResultadoBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    // Fila única: as migrações de boot rodam uma de cada vez (ver common/migracao-boot.ts)
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  private async executarMigracao(): Promise<void> {
    if (process.env.RESULTADO_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarResultado(m));
      if (houveMudancaResultado(r)) this.logger.log(`Migração do resultado (E6): ${resumoMigracaoResultado(r)}`);
    } catch (e: any) {
      this.logger.error(`Migração do resultado (E6) não executada: ${e?.message ?? e}`);
    }
  }
}
