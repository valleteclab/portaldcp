import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { houveMudancaCredenciamento, migrarCredenciamentosLegados, resumoMigracaoCredenciamento } from './migracao-credenciamento';

/**
 * Migração do modelo paralelo de credenciamento (E7b) no BOOT — produção roda
 * com `synchronize` e sem `migrationsRun`. Idempotente; falha é logada e NÃO
 * derruba o boot. Desligar: CREDENCIAMENTO_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoCredenciamentoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoCredenciamentoBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    // Fila única: as migrações de boot rodam uma de cada vez (ver common/migracao-boot.ts)
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  private async executarMigracao(): Promise<void> {
    if (process.env.CREDENCIAMENTO_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarCredenciamentosLegados(m));
      if (houveMudancaCredenciamento(r)) this.logger.log(`Migração do credenciamento (E7b): ${resumoMigracaoCredenciamento(r)}`);
    } catch (e: any) {
      this.logger.error(`Migração do credenciamento (E7b) não executada: ${e?.message ?? e}`);
    }
  }
}
