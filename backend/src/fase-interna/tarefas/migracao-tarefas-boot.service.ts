import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { executarMigracaoDeBoot } from '../../common/migracao-boot';
import { TarefasService } from './tarefas.service';

/**
 * Fase interna — Entrega 2: cria as tarefas ABERTAS dos processos que já
 * estão na fase interna (e acerta as de quem saiu dela). Idempotente (índice
 * único parcial + plano de sincronização): rodar de novo não cria nada. Sem
 * notificação. Falha é logada e NÃO derruba o boot.
 * Desligar: FASE_INTERNA_TAREFAS_NO_BOOT=false (ou FASE_INTERNA_TAREFAS=false).
 */
@Injectable()
export class MigracaoTarefasBootService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigracaoTarefasBootService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tarefas: TarefasService,
  ) {}

  onApplicationBootstrap(): Promise<void> {
    return executarMigracaoDeBoot(this.dataSource, () => this.executarMigracao());
  }

  async executarMigracao(): Promise<void> {
    if (process.env.FASE_INTERNA_TAREFAS_NO_BOOT === 'false' || !this.tarefas.ativo()) return;
    try {
      const r = await this.tarefas.migrarProcessosExistentes();
      if (r.criadas) this.logger.log(`Fase interna: ${r.criadas} tarefa(s) criada(s) em ${r.processos} processo(s)`);
    } catch (e: unknown) {
      this.logger.error(`Tarefas da fase interna não migradas: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
