import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { migrarEstadoCompraPncp } from './estado-compra-pncp';

/**
 * E9 — estado da compra no PNCP: as licitações com a compra gravada só nas
 * colunas antigas (`enviado_pncp`, `ano/sequencial_compra_pncp`,
 * `numero_controle_pncp`) ganham a linha ENVIADA em `pncp_sync` (fonte única).
 * Produção roda com `synchronize` e sem `migrationsRun` — mesmo padrão das
 * etapas anteriores. Idempotente; falha é logada e NÃO derruba o boot.
 * Desligar: PNCP_ESTADO_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoEstadoPncpBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoEstadoPncpBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.PNCP_ESTADO_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarEstadoCompraPncp(m));
      if (r.migradas) this.logger.log(`Migração do estado PNCP das licitações (E9): ${r.migradas} compra(s) registradas em pncp_sync`);
    } catch (e: unknown) {
      this.logger.error(`Migração do estado PNCP das licitações (E9) não executada: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
