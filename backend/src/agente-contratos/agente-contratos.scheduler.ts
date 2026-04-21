import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AgenteContratosService } from './agente-contratos.service';
import { ContratosService } from '../contratos/contratos.service';

@Injectable()
export class AgenteContratosScheduler {
  private readonly logger = new Logger(AgenteContratosScheduler.name);
  private isRunning = false;

  constructor(
    private readonly agenteService: AgenteContratosService,
    private readonly contratosService: ContratosService,
  ) {}

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Erro inesperado';
  }

  @Cron(CronExpression.EVERY_DAY_AT_6AM, {
    name: 'agente-contratos-diario',
    timeZone: 'America/Sao_Paulo',
  })
  async executarCicloDiario() {
    if (this.isRunning) {
      this.logger.warn('Ciclo do agente ja esta em execucao, pulando...');
      return;
    }

    this.isRunning = true;
    this.logger.log(
      'Iniciando execucao agendada do verificador de aditivos (06:00)',
    );

    try {
      const orgaoId = process.env.AGENTE_ORGAO_ID || 'default';
      const resultado = await this.agenteService.executarCicloDiario(orgaoId);

      this.logger.log('Execucao agendada finalizada');
      this.logger.log(
        `Resumo: ${resultado.contratos_analisados} contrato(s) analisado(s), ${resultado.contratos_com_pendencias} com pendencia(s)`,
      );
    } catch (error: unknown) {
      this.logger.error(
        `Erro na execucao agendada: ${this.getErrorMessage(error)}`,
      );
    } finally {
      this.isRunning = false;
    }
  }

  @Cron('30 0 * * *', {
    name: 'vencer-contratos-expirados',
    timeZone: 'America/Sao_Paulo',
  })
  async vencerContratosExpirados() {
    this.logger.log('Verificando contratos vigentes com vigencia expirada...');
    try {
      const resultado = await this.contratosService.vencerContratosExpirados();
      if (resultado.count > 0) {
        this.logger.warn(
          `${resultado.count} contrato(s) marcado(s) como VENCIDO automaticamente.`,
        );
      } else {
        this.logger.log('Nenhum contrato expirado encontrado.');
      }
    } catch (error: unknown) {
      this.logger.error(
        `Erro ao vencer contratos expirados: ${this.getErrorMessage(error)}`,
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR, {
    name: 'agente-contratos-monitoramento',
    timeZone: 'America/Sao_Paulo',
  })
  executarMonitoramento() {
    this.logger.log('Monitoramento horario desativado neste modulo.');
  }
}
