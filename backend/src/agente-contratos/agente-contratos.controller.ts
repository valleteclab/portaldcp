import { Controller, Get, Post, Body, Query, UseGuards, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AgenteContratosService, CicloAgenteResult } from './agente-contratos.service';
import { AgenteLog } from './entities/agente-log.entity';

@ApiTags('Agente Autônomo - Contratos')
@Controller('agente-contratos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgenteContratosController {
  private readonly logger = new Logger(AgenteContratosController.name);

  constructor(private readonly agenteService: AgenteContratosService) {}

  /**
   * Executa manualmente o ciclo do agente autônomo
   */
  @Post('executar')
  @ApiOperation({
    summary: 'Executar ciclo do agente autônomo',
    description: 'Busca contratos no Portal da Transparência e importa com itens extraídos do PDF'
  })
  async executarCiclo(
    @Body('orgao_id') orgaoId: string
  ): Promise<CicloAgenteResult> {
    this.logger.log(`Executando ciclo manual para órgão: ${orgaoId}`);
    return this.agenteService.executarCicloDiario(orgaoId);
  }

  /**
   * Retorna os logs recentes do agente
   */
  @Get('logs')
  @ApiOperation({
    summary: 'Logs recentes do agente',
    description: 'Retorna os logs das últimas ações do agente autônomo'
  })
  @ApiQuery({ name: 'orgao_id', required: true, description: 'ID do órgão' })
  @ApiQuery({ name: 'limite', required: false, description: 'Quantidade de logs (padrão: 50)' })
  async obterLogs(
    @Query('orgao_id') orgaoId: string,
    @Query('limite') limite: string
  ): Promise<AgenteLog[]> {
    const limiteNum = parseInt(limite, 10) || 50;
    return this.agenteService.obterLogsRecentes(orgaoId, limiteNum);
  }

  /**
   * Retorna estatísticas do agente
   */
  @Get('estatisticas')
  @ApiOperation({
    summary: 'Estatísticas do agente',
    description: 'Retorna estatísticas de execução do agente nos últimos 7 dias'
  })
  @ApiQuery({ name: 'orgao_id', required: true, description: 'ID do órgão' })
  async obterEstatisticas(
    @Query('orgao_id') orgaoId: string
  ): Promise<{
    total_acoes: number;
    sucessos: number;
    erros: number;
    contratos_importados_7dias: number;
    ultima_execucao?: Date;
  }> {
    return this.agenteService.obterEstatisticas(orgaoId);
  }
}
