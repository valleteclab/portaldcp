import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Logger,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { atorDaRequisicao, ehOrgao } from '../auth/acesso/ator';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  AgenteContratosService,
  CicloAgenteResult,
} from './agente-contratos.service';
import { AgenteLog } from './entities/agente-log.entity';

@ApiTags('Verificador de Aditivos')
@Controller('agente-contratos')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AgenteContratosController {
  private readonly logger = new Logger(AgenteContratosController.name);

  constructor(private readonly agenteService: AgenteContratosService) {}

  /** Órgão do TOKEN; só o admin da plataforma escolhe pelo parâmetro. */
  private orgaoDoToken(req: any, informado?: string): string {
    const ator = atorDaRequisicao(req);
    if (ator?.admin && informado) return informado;
    if (ehOrgao(ator)) return ator.orgaoId;
    throw new ForbiddenException('Ação exclusiva do órgão');
  }

  @Post('executar')
  @ApiOperation({
    summary: 'Executar verificacao de termos aditivos pendentes',
    description:
      'Analisa contratos vencidos ou encerrados do orgao e verifica se ha termos aditivos no Portal de Transparencia ainda nao cadastrados no sistema',
  })
  async executarCiclo(
    @Body('orgao_id') orgaoIdInformado: string,
    @Req() req: any,
  ): Promise<CicloAgenteResult> {
    const orgaoId = this.orgaoDoToken(req, orgaoIdInformado);
    this.logger.log(
      `Executando verificacao manual de aditivos para o orgao: ${orgaoId}`,
    );
    return this.agenteService.executarCicloDiario(orgaoId);
  }

  @Get('logs')
  @ApiOperation({
    summary: 'Logs recentes do verificador',
    description:
      'Retorna os logs das ultimas verificacoes de termos aditivos pendentes',
  })
  @ApiQuery({ name: 'orgao_id', required: true, description: 'ID do orgao' })
  @ApiQuery({
    name: 'limite',
    required: false,
    description: 'Quantidade de logs (padrao: 50)',
  })
  async obterLogs(
    @Query('orgao_id') orgaoIdInformado: string,
    @Query('limite') limite: string,
    @Req() req?: any,
  ): Promise<AgenteLog[]> {
    const orgaoId = this.orgaoDoToken(req, orgaoIdInformado);
    const limiteNum = parseInt(limite, 10) || 50;
    return this.agenteService.obterLogsRecentes(orgaoId, limiteNum);
  }

  @Get('estatisticas')
  @ApiOperation({
    summary: 'Estatisticas do verificador',
    description:
      'Retorna estatisticas de execucao do verificador nos ultimos 7 dias',
  })
  @ApiQuery({ name: 'orgao_id', required: true, description: 'ID do orgao' })
  async obterEstatisticas(@Query('orgao_id') orgaoIdInformado: string, @Req() req?: any): Promise<{
    total_acoes: number;
    sucessos: number;
    avisos: number;
    erros: number;
    contratos_com_pendencias_7dias: number;
    ultima_execucao?: Date;
  }> {
    return this.agenteService.obterEstatisticas(this.orgaoDoToken(req, orgaoIdInformado));
  }
}
