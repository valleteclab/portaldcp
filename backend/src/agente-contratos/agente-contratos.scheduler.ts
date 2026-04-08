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

  /**
   * Executa diariamente às 06:00 da manhã
   * Busca novos contratos no Portal da Transparência
   */
  @Cron(CronExpression.EVERY_DAY_AT_6AM, {
    name: 'agente-contratos-diario',
    timeZone: 'America/Sao_Paulo',
  })
  async executarCicloDiario() {
    if (this.isRunning) {
      this.logger.warn('⏭️ Ciclo do agente já está em execução, pulando...');
      return;
    }

    this.isRunning = true;
    this.logger.log('⏰ Iniciando execução agendada do Agente Autônomo (06:00)');

    try {
      // TODO: Obter orgao_id do contexto ou configuração
      const orgaoId = process.env.AGENTE_ORGAO_ID || 'default';

      const resultado = await this.agenteService.executarCicloDiario(orgaoId);

      this.logger.log('✅ Execução agendada finalizada');
      this.logger.log(`📊 Resumo: ${resultado.contratos_importados} contratos, ${resultado.itens_extraidos} itens`);
    } catch (error) {
      this.logger.error(`❌ Erro na execução agendada: ${error.message}`);
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Executa diariamente às 00:30 para vencer contratos com vigência expirada
   */
  @Cron('30 0 * * *', {
    name: 'vencer-contratos-expirados',
    timeZone: 'America/Sao_Paulo',
  })
  async vencerContratosExpirados() {
    this.logger.log('⏰ Verificando contratos VIGENTES com vigência expirada...');
    try {
      const resultado = await this.contratosService.vencerContratosExpirados();
      if (resultado.count > 0) {
        this.logger.warn(`⚠️ ${resultado.count} contrato(s) marcado(s) como VENCIDO automaticamente.`);
      } else {
        this.logger.log('✅ Nenhum contrato expirado encontrado.');
      }
    } catch (error) {
      this.logger.error(`❌ Erro ao vencer contratos expirados: ${error.message}`);
    }
  }

  /**
   * Executa a cada hora para verificação de pendências
   * (Monitoramento, cobranças, etc. - Fase futura)
   */
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'agente-contratos-monitoramento',
    timeZone: 'America/Sao_Paulo',
  })
  async executarMonitoramento() {
    this.logger.log('⏰ Executando monitoramento horário (placeholder)');
    // TODO: Implementar na Fase 3 (monitoramento de NFs, medições)
  }
}
