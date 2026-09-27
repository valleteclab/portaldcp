import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../../common/migracao-boot';
import { DfdConsolidadoService } from './dfd-consolidado.service';

/**
 * DFD consolidado — na fila única das migrações de boot: os processos já
 * criados de UMA demanda (`licitacoes.demanda_id`) ganham o vínculo na
 * tabela nova (DFD de 1 demanda, origem MIGRACAO, já com o processo). Nada
 * muda no processo; as contratações futuras antigas ficam como estão
 * (legíveis na tela do planejamento). Idempotente; falha só é logada.
 * Desligar: DFD_CONSOLIDADO_MIGRACAO_NO_BOOT=false.
 */
@Injectable()
export class MigracaoDfdBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoDfdBootService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dfds: DfdConsolidadoService,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  async executarMigracao(): Promise<void> {
    if (process.env.DFD_CONSOLIDADO_MIGRACAO_NO_BOOT === 'false') return;
    try {
      const n = await this.dfds.migrarProcessosDeUmaDemanda();
      if (n) this.logger.log(`DFD consolidado: ${n} processo(s) de 1 demanda com o vínculo gravado`);
    } catch (e: unknown) {
      this.logger.error(`DFD consolidado não migrado: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
