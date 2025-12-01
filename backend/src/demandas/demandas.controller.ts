import { Controller, Get, Post, Put, Delete, Body, Param, Query, Patch } from '@nestjs/common';
import { DemandasService } from './demandas.service';
import { StatusDemanda, ItemDemanda } from './entities/demanda.entity';

@Controller('demandas')
export class DemandasController {
  constructor(private readonly demandasService: DemandasService) {}

  // ==================== DEMANDAS ====================

  @Get()
  async findAll(
    @Query('orgaoId') orgaoId: string,
    @Query('ano') ano?: string,
    @Query('status') status?: StatusDemanda,
    @Query('unidadeRequisitante') unidadeRequisitante?: string,
  ) {
    return this.demandasService.findAll({
      orgaoId,
      ano: ano ? parseInt(ano) : undefined,
      status,
      unidadeRequisitante,
    });
  }

  @Get('estatisticas')
  async getEstatisticas(
    @Query('orgaoId') orgaoId: string,
    @Query('ano') ano: string,
  ) {
    return this.demandasService.getEstatisticas(orgaoId, parseInt(ano));
  }

  @Get('unidades')
  async getUnidadesRequisitantes(@Query('orgaoId') orgaoId: string) {
    return this.demandasService.getUnidadesRequisitantes(orgaoId);
  }

  @Get('para-consolidar')
  async getDemandasParaConsolidar(
    @Query('orgaoId') orgaoId: string,
    @Query('ano') ano: string,
  ) {
    return this.demandasService.getDemandasParaConsolidar(orgaoId, parseInt(ano));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.demandasService.findOne(id);
  }

  @Post()
  async create(
    @Body() dados: {
      orgaoId: string;
      ano_referencia: number;
      unidade_requisitante: string;
      responsavel_nome?: string;
      responsavel_email?: string;
      responsavel_telefone?: string;
      observacoes?: string;
    },
  ) {
    return this.demandasService.create(dados);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dados: any,
  ) {
    return this.demandasService.update(id, dados);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    await this.demandasService.delete(id);
    return { message: 'Demanda excluída com sucesso' };
  }

  // ==================== FLUXO DE STATUS ====================

  @Patch(':id/enviar')
  async enviarParaAprovacao(@Param('id') id: string) {
    return this.demandasService.enviarParaAprovacao(id);
  }

  @Patch(':id/analisar')
  async iniciarAnalise(@Param('id') id: string) {
    return this.demandasService.iniciarAnalise(id);
  }

  @Patch(':id/aprovar')
  async aprovar(
    @Param('id') id: string,
    @Body() body: { aprovadoPor: string },
  ) {
    return this.demandasService.aprovar(id, body.aprovadoPor);
  }

  @Patch(':id/rejeitar')
  async rejeitar(
    @Param('id') id: string,
    @Body() body: { motivo: string },
  ) {
    return this.demandasService.rejeitar(id, body.motivo);
  }

  @Patch(':id/voltar-rascunho')
  async voltarParaRascunho(@Param('id') id: string) {
    return this.demandasService.voltarParaRascunho(id);
  }

  @Patch(':id/consolidar')
  async marcarComoConsolidada(
    @Param('id') id: string,
    @Body() body: { pcaId: string },
  ) {
    return this.demandasService.marcarComoConsolidada(id, body.pcaId);
  }

  // ==================== ITENS DA DEMANDA ====================

  @Post(':id/itens')
  async adicionarItem(
    @Param('id') demandaId: string,
    @Body() dados: Partial<ItemDemanda>,
  ) {
    return this.demandasService.adicionarItem(demandaId, dados);
  }

  @Put('itens/:itemId')
  async atualizarItem(
    @Param('itemId') itemId: string,
    @Body() dados: Partial<ItemDemanda>,
  ) {
    return this.demandasService.atualizarItem(itemId, dados);
  }

  @Delete('itens/:itemId')
  async removerItem(@Param('itemId') itemId: string) {
    await this.demandasService.removerItem(itemId);
    return { message: 'Item removido com sucesso' };
  }

  @Patch('itens/:itemId/vincular-pca')
  async vincularItemAoPCA(
    @Param('itemId') itemId: string,
    @Body() body: { itemPcaId: string },
  ) {
    return this.demandasService.vincularItemAoPCA(itemId, body.itemPcaId);
  }
}
