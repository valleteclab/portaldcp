import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { houveMudancaMeEpp, migrarMeEpp, resumoMigracaoMeEpp } from './migracao-me-epp';

/**
 * Migração de dados ME/EPP no BOOT (produção roda com `synchronize` e sem
 * `migrationsRun` — mesmo padrão da E1/E2/E3). Idempotente; falha é logada e
 * NÃO derruba o boot. Desligar: MEEPP_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoMeEppBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoMeEppBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.MEEPP_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarMeEpp(m));
      if (houveMudancaMeEpp(r)) this.logger.log(`Migração ME/EPP (E3): ${resumoMigracaoMeEpp(r)}`);
    } catch (e: any) {
      this.logger.error(`Migração ME/EPP (E3) não executada: ${e?.message ?? e}`);
    }
  }
}
