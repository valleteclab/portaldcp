import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Param,
  Body,
  Query
} from '@nestjs/common';
import { ContratosService } from './contratos.service';
import { Contrato, StatusContrato, TipoContrato } from './entities/contrato.entity';
import { TermoAditivo } from './entities/termo-aditivo.entity';

@Controller('contratos')
export class ContratosController {
  constructor(private readonly contratosService: ContratosService) {}

  // ============ CRUD CONTRATOS ============

  @Post()
  async criar(@Body() dados: Partial<Contrato>) {
    return this.contratosService.criar(dados);
  }

  @Post('licitacao/:licitacaoId')
  async criarAPartirDaLicitacao(
    @Param('licitacaoId') licitacaoId: string,
    @Body() dados: Partial<Contrato>
  ) {
    return this.contratosService.criarAPartirDaLicitacao(licitacaoId, dados);
  }

  @Get()
  async findAll(
    @Query('orgaoId') orgaoId?: string,
    @Query('fornecedorId') fornecedorId?: string,
    @Query('status') status?: StatusContrato,
    @Query('tipo') tipo?: TipoContrato,
    @Query('ano') ano?: string,
    @Query('vigentes') vigentes?: string
  ) {
    return this.contratosService.findAll({
      orgaoId,
      fornecedorId,
      status,
      tipo,
      ano: ano ? parseInt(ano) : undefined,
      vigentes: vigentes === 'true'
    });
  }

  @Get('estatisticas/status')
  async estatisticasPorStatus(@Query('orgaoId') orgaoId: string) {
    return this.contratosService.contarPorStatus(orgaoId);
  }

  @Get('estatisticas/a-vencer')
  async contratosAVencer(
    @Query('orgaoId') orgaoId: string,
    @Query('dias') dias?: string
  ) {
    return this.contratosService.contratosAVencer(orgaoId, dias ? parseInt(dias) : 30);
  }

  @Get('estatisticas/valor-total')
  async valorTotal(
    @Query('orgaoId') orgaoId: string,
    @Query('ano') ano?: string
  ) {
    const valor = await this.contratosService.valorTotalContratado(
      orgaoId,
      ano ? parseInt(ano) : undefined
    );
    return { valor_total: valor };
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.contratosService.findOne(id);
  }

  @Get('numero/:numero')
  async findByNumero(
    @Param('numero') numero: string,
    @Query('orgaoId') orgaoId: string
  ) {
    return this.contratosService.findByNumero(numero, orgaoId);
  }

  @Put(':id')
  async atualizar(@Param('id') id: string, @Body() dados: Partial<Contrato>) {
    return this.contratosService.atualizar(id, dados);
  }

  @Patch(':id/status')
  async alterarStatus(
    @Param('id') id: string,
    @Body('status') status: StatusContrato
  ) {
    return this.contratosService.alterarStatus(id, status);
  }

  // ============ TERMOS ADITIVOS ============

  @Post(':contratoId/termos')
  async criarTermoAditivo(
    @Param('contratoId') contratoId: string,
    @Body() dados: Partial<TermoAditivo>
  ) {
    return this.contratosService.criarTermoAditivo(contratoId, dados);
  }

  @Get(':contratoId/termos')
  async findTermosAditivos(@Param('contratoId') contratoId: string) {
    return this.contratosService.findTermosAditivos(contratoId);
  }

  @Get('termos/:id')
  async findTermoAditivo(@Param('id') id: string) {
    return this.contratosService.findTermoAditivo(id);
  }

  // ============ ENDPOINTS PÚBLICOS ============

  @Get('publicos/lista')
  async listarPublicos(
    @Query('orgaoId') orgaoId?: string,
    @Query('fornecedorCnpj') fornecedorCnpj?: string,
    @Query('ano') ano?: string,
    @Query('vigentes') vigentes?: string
  ) {
    return this.contratosService.findPublicos({
      orgaoId,
      fornecedorCnpj,
      ano: ano ? parseInt(ano) : undefined,
      vigentes: vigentes === 'true'
    });
  }

  @Get('publicos/:id')
  async findPublicoById(@Param('id') id: string) {
    return this.contratosService.findPublicoById(id);
  }
}
