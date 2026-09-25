import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { houveMudancaRecursos, migrarRecursos, resumoMigracaoRecursos } from './migracao-recursos';

/**
 * Executa no BOOT a migração de dados dos recursos (E5) — produção roda com
 * `synchronize` ligado e SEM `migrationsRun` (mesmo padrão da E1–E3). O
 * synchronize já criou as tabelas/colunas antes deste hook; a rotina é
 * idempotente. Falha é logada e NÃO derruba o boot.
 * Desligar: RECURSOS_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoRecursosBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoRecursosBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.RECURSOS_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarRecursos(m));
      if (houveMudancaRecursos(r)) this.logger.log(`Migração dos recursos (E5): ${resumoMigracaoRecursos(r)}`);
    } catch (e: any) {
      this.logger.error(`Migração dos recursos (E5) não executada: ${e?.message ?? e}`);
    }
  }
}
