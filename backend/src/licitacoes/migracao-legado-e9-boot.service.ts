import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { migrarPregoeiroDaLicitacao } from './migracao-legado-e9';

/**
 * E9 — vínculo do pregoeiro (texto livre → usuário do órgão) no BOOT.
 * Produção roda com `synchronize` e sem `migrationsRun` (mesmo padrão das
 * etapas anteriores). Idempotente; falha é logada e NÃO derruba o boot.
 * Desligar: LICITACAO_LEGADO_E9_MIGRAR_NO_BOOT=false.
 */
@Injectable()
export class MigracaoLegadoE9BootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoLegadoE9BootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  onApplicationBootstrap(): Promise<void> {
    // Fila única: as migrações de boot rodam uma de cada vez (ver common/migracao-boot.ts)
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  private async executarMigracao(): Promise<void> {
    if (process.env.LICITACAO_LEGADO_E9_MIGRAR_NO_BOOT === 'false') return;
    try {
      const r = await this.dataSource.transaction((m) => migrarPregoeiroDaLicitacao(m));
      if (r.vinculadas) this.logger.log(`Migração E9: ${r.vinculadas} licitação(ões) com o pregoeiro vinculado ao usuário do órgão`);
    } catch (e: unknown) {
      this.logger.error(`Migração E9 (pregoeiro da licitação) não executada: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
