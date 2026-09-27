import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../../common/migracao-boot';
import { ModeloFluxoService } from './modelo-fluxo.service';

/**
 * F1 — modelo de fluxo em dados. Na fila única das migrações de boot:
 *  1. semeia o modelo do sistema ("Câmara — Portaria 089"), os requisitos
 *     mínimos da lei e as travas por ato (só o que falta);
 *  2. dá a cada órgão que já tinha `configuracoes_fase_interna` um modelo
 *     próprio equivalente (responsáveis, prazos, controle interno);
 *  3. grava o fluxo LEGADO dos processos que já existiam (snapshot do modelo
 *     do órgão e demanda aprovada — nada trava, nada muda).
 * Idempotente. Falha é logada e NÃO derruba o boot.
 * Desligar: FASE_INTERNA_FLUXO_NO_BOOT=false.
 */
@Injectable()
export class MigracaoModeloFluxoBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoModeloFluxoBootService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly modelos: ModeloFluxoService,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  async executarMigracao(): Promise<void> {
    if (process.env.FASE_INTERNA_FLUXO_NO_BOOT === 'false') {
      // Mesmo desligada, a semente é garantida na primeira leitura (idempotente)
      return;
    }
    try {
      const r = await this.modelos.migrar();
      if (r.orgaos || r.processos) this.logger.log(`Modelo de fluxo: ${r.orgaos} órgão(s) com modelo próprio; ${r.processos} processo(s) com fluxo gravado`);
    } catch (e: unknown) {
      this.logger.error(`Modelo de fluxo não migrado: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
