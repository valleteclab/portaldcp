import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../common/migracao-boot';
import { migrarDivulgacaoOficial } from '../licitacoes/transicoes/migracao-divulgacao';
import { migrarEstadoCompraPncp } from './estado-compra-pncp';

/**
 * Divulgação oficial confirmada (AGUARDANDO_DIVULGACAO — ver
 * `licitacoes/transicoes/migracao-divulgacao.ts`). Roda na fila única das
 * migrações de boot (`common/migracao-boot.ts`) e, antes, garante o estado da
 * compra em `pncp_sync` (E9 — idempotente), para que uma compra gravada só nas
 * colunas antigas conte como enviada. Idempotente; falha é logada e não
 * derruba o boot. Desligar: LICITACAO_MIGRAR_DIVULGACAO_NO_BOOT=false.
 */
@Injectable()
export class MigracaoDivulgacaoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoDivulgacaoBootService.name);

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onApplicationBootstrap(): Promise<void> {
    await executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  async executarMigracao(): Promise<{ confirmadas: number; aguardando: number } | null> {
    if (process.env.LICITACAO_MIGRAR_DIVULGACAO_NO_BOOT === 'false') return null;
    try {
      const r = await this.dataSource.transaction(async (m) => {
        await migrarEstadoCompraPncp(m);
        return migrarDivulgacaoOficial(m);
      });
      if (r.confirmadas || r.aguardando) {
        this.logger.log(
          `Divulgação oficial (PNCP): ${r.confirmadas} licitação(ões) com a divulgação confirmada pela compra enviada; ${r.aguardando} voltaram a aguardar a publicação no PNCP`,
        );
      }
      return r;
    } catch (e: unknown) {
      this.logger.error(`Migração da divulgação oficial não executada: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    }
  }
}
