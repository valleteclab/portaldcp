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
import { PcaService } from './pca.service';
import { PlanoContratacaoAnual, ItemPCA, StatusPCA, StatusItemPCA, CategoriaItemPCA } from './entities/pca.entity';

@Controller('pca')
export class PcaController {
  constructor(private readonly pcaService: PcaService) {}

  // ============ CRUD PCA ============

  @Post()
  async criar(@Body() dados: Partial<PlanoContratacaoAnual>) {
    return this.pcaService.criar(dados);
  }

  @Get()
  async findAll(
    @Query('orgaoId') orgaoId?: string,
    @Query('ano') ano?: string,
    @Query('status') status?: StatusPCA
  ) {
    return this.pcaService.findAll({
      orgaoId,
      ano: ano ? parseInt(ano) : undefined,
      status
    });
  }

  @Get('estatisticas/:id')
  async getEstatisticas(@Param('id') id: string) {
    return this.pcaService.getEstatisticas(id);
  }

  @Get('pendentes')
  async getItensPendentes(@Query('orgaoId') orgaoId: string) {
    return this.pcaService.getItensPendentes(orgaoId);
  }

  // Buscar itens do PCA por órgão e ano (para vinculação em licitações)
  @Get('itens')
  async buscarItensPca(
    @Query('orgao_id') orgaoId: string,
    @Query('ano') ano?: string
  ) {
    return this.pcaService.buscarItensPorOrgao(orgaoId, ano ? parseInt(ano) : undefined);
  }

  @Get('ano/:ano')
  async findByAno(
    @Param('ano') ano: string,
    @Query('orgaoId') orgaoId: string
  ) {
    return this.pcaService.findByAno(orgaoId, parseInt(ano));
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.pcaService.findOne(id);
  }

  @Put(':id')
  async atualizar(@Param('id') id: string, @Body() dados: Partial<PlanoContratacaoAnual>) {
    return this.pcaService.atualizar(id, dados);
  }

  @Delete(':id')
  async excluir(@Param('id') id: string) {
    return this.pcaService.excluir(id);
  }

  @Patch(':id/aprovar')
  async aprovar(
    @Param('id') id: string,
    @Body() responsavel: { id: string; nome: string; cargo: string }
  ) {
    return this.pcaService.aprovar(id, responsavel);
  }

  @Patch(':id/publicar')
  async publicar(@Param('id') id: string) {
    return this.pcaService.publicar(id);
  }

  @Patch(':id/marcar-enviado-pncp')
  async marcarEnviadoPNCP(
    @Param('id') id: string,
    @Body() body: { numeroControle: string; sequencial: number }
  ) {
    return this.pcaService.marcarEnviadoPNCP(id, body.numeroControle, body.sequencial);
  }

  @Patch(':id/desmarcar-enviado-pncp')
  async desmarcarEnviadoPNCP(@Param('id') id: string) {
    return this.pcaService.desmarcarEnviadoPNCP(id);
  }

  @Post(':id/duplicar')
  async duplicarParaProximoAno(@Param('id') id: string) {
    return this.pcaService.duplicarParaProximoAno(id);
  }

  @Post(':id/consolidar-demandas')
  async consolidarDemandas(
    @Param('id') pcaId: string,
    @Body() body: { demandaIds: string[] }
  ) {
    return this.pcaService.consolidarDemandas(pcaId, body.demandaIds);
  }

  // ============ ITENS DO PCA ============

  @Post(':pcaId/itens')
  async adicionarItem(
    @Param('pcaId') pcaId: string,
    @Body() dados: Partial<ItemPCA>
  ) {
    return this.pcaService.adicionarItem(pcaId, dados);
  }

  @Post(':pcaId/importar-itens')
  async importarItens(
    @Param('pcaId') pcaId: string,
    @Body() body: { itens: Partial<ItemPCA>[] }
  ) {
    return this.pcaService.importarItens(pcaId, body.itens);
  }

  @Get(':pcaId/itens')
  async findItens(
    @Param('pcaId') pcaId: string,
    @Query('categoria') categoria?: CategoriaItemPCA,
    @Query('status') status?: StatusItemPCA,
    @Query('trimestre') trimestre?: string
  ) {
    return this.pcaService.findItens(pcaId, {
      categoria,
      status,
      trimestre: trimestre ? parseInt(trimestre) : undefined
    });
  }

  @Get('itens/:itemId')
  async findItem(@Param('itemId') itemId: string) {
    return this.pcaService.findItem(itemId);
  }

  @Put('itens/:itemId')
  async atualizarItem(
    @Param('itemId') itemId: string,
    @Body() dados: Partial<ItemPCA>
  ) {
    return this.pcaService.atualizarItem(itemId, dados);
  }

  @Patch('itens/:itemId/status')
  async alterarStatusItem(
    @Param('itemId') itemId: string,
    @Body() body: { status: StatusItemPCA; licitacaoId?: string }
  ) {
    return this.pcaService.alterarStatusItem(itemId, body.status, body.licitacaoId);
  }

  @Delete('itens/:itemId')
  async removerItem(@Param('itemId') itemId: string) {
    await this.pcaService.removerItem(itemId);
    return { message: 'Item removido com sucesso' };
  }

  @Delete(':pcaId/limpar-itens')
  async limparItens(@Param('pcaId') pcaId: string) {
    return this.pcaService.limparItens(pcaId);
  }
}
