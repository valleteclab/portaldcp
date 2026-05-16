import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { OrdemFinanceiroMonitorService } from './ordem-financeiro-monitor.service';

@Injectable()
export class OrdemFinanceiroMonitorScheduler {
  private readonly logger = new Logger(OrdemFinanceiroMonitorScheduler.name);

  constructor(private readonly monitorService: OrdemFinanceiroMonitorService) {}

  @Cron(CronExpression.EVERY_2_HOURS)
  async verificarOrdens(): Promise<void> {
    try {
      const resultados = await this.monitorService.verificarPendentes();
      const alteradas = resultados.filter((resultado) => resultado.alterou).length;
      this.logger.log(`Verificacao financeira de ordens concluida: ${resultados.length} verificadas, ${alteradas} alteradas`);
    } catch (error) {
      this.logger.error(`Erro na verificacao financeira de ordens: ${error.message}`, error.stack);
    }
  }
}
