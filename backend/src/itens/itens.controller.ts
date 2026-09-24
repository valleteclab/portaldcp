import { Controller, Get, Post, Put, Delete, Body, Param, Query, ValidationPipe, NotFoundException, ForbiddenException } from '@nestjs/common';
import { ItensService, LicitacaoVisaoItem } from './itens.service';
import { CreateItemDto, UpdateItemDto, AdjudicarItemDto, ImportarItensPcaDto } from './dto/create-item.dto';
import { ItemLicitacao } from './entities/item-licitacao.entity';
import { AcessoLicitacaoService } from '../auth/acesso/acesso-licitacao.service';
import { AtorAtual, AutenticacaoOpcional, SomenteOrgao } from '../auth/acesso/acesso.decorators';
import { ehOrgao } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { licitacaoEhPublica, orcamentoSigiloso } from '../licitacoes/licitacao-visao.util';
import { itemParaOrgao, itemParaPublico, itensParaPublico } from './item-visao.util';

/**
 * ITENS DA LICITAÇÃO — regras de acesso (E1a):
 *  - criar/alterar/excluir, cancelar, deserto, fracassado, adjudicar,
 *    homologar e PCA: só o órgão DONO da licitação (@SomenteOrgao + dono);
 *  - leituras (lista, item, resumo): rotas públicas com login opcional —
 *    órgão dono/admin vê tudo; os demais só itens de licitação já divulgada,
 *    sem a identidade do melhor lance e, com orçamento SIGILOSO, sem os
 *    valores estimados.
 */
@Controller('itens')
export class ItensController {
  constructor(
    private readonly itensService: ItensService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /**
   * Visão da leitura: 'ORGAO' (dono/admin, completa) ou 'PUBLICO'.
   * Licitação inexistente ou ainda não divulgada, para quem não é dono → 404.
   */
  private async visaoDaLicitacao(
    ator: Ator | null,
    licitacaoId: string,
  ): Promise<{ visao: 'ORGAO' | 'PUBLICO'; lic: LicitacaoVisaoItem }> {
    const lic = await this.itensService.licitacaoParaVisao(licitacaoId);
    if (!lic) throw new NotFoundException(`Licitação com ID ${licitacaoId} não encontrada`);
    if (ator?.admin || (ehOrgao(ator) && ator.orgaoId === lic.orgao_id)) return { visao: 'ORGAO', lic };
    if (!licitacaoEhPublica(lic)) throw new NotFoundException(`Licitação com ID ${licitacaoId} não encontrada`);
    return { visao: 'PUBLICO', lic };
  }

  @Post()
  @SomenteOrgao()
  async create(
    @Body(new ValidationPipe()) createDto: CreateItemDto,
    @AtorAtual() ator: Ator,
  ): Promise<ItemLicitacao> {
    await this.acesso.assertOrgaoDaLicitacao(ator, createDto.licitacao_id, 'escrita');
    return await this.itensService.create(createDto);
  }

  @Post('licitacao/:licitacaoId/batch')
  @SomenteOrgao()
  async createBatch(
    @Param('licitacaoId') licitacaoId: string,
    @Body() itens: CreateItemDto[],
    @AtorAtual() ator: Ator,
  ): Promise<ItemLicitacao[]> {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'escrita');
    return await this.itensService.createBatch(licitacaoId, itens);
  }

  @AutenticacaoOpcional()
  @Get('licitacao/:licitacaoId')
  async findByLicitacao(
    @Param('licitacaoId') licitacaoId: string,
    @AtorAtual() ator: Ator | null,
  ): Promise<ItemLicitacao[]> {
    const { visao, lic } = await this.visaoDaLicitacao(ator, licitacaoId);
    const itens = await this.itensService.findByLicitacao(licitacaoId);
    return visao === 'ORGAO' ? itens : itensParaPublico(itens, lic);
  }

  @AutenticacaoOpcional()
  @Get('licitacao/:licitacaoId/resumo')
  async getResumo(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator | null) {
    const { visao, lic } = await this.visaoDaLicitacao(ator, licitacaoId);
    const resumo = await this.itensService.getResumoLicitacao(licitacaoId);
    if (visao === 'ORGAO' || !orcamentoSigiloso(lic)) return resumo;
    // Orçamento sigiloso (art. 24): nada derivado do valor estimado
    return { ...resumo, valorEstimado: null, economia: null, percentualEconomia: null };
  }

  @AutenticacaoOpcional()
  @Get(':id')
  async findOne(@Param('id') id: string, @AtorAtual() ator: Ator | null): Promise<ItemLicitacao> {
    const dono = await this.acesso.donoDoItem(id);
    if (!dono) throw new NotFoundException(`Item com ID ${id} não encontrado`);
    const { visao, lic } = await this.visaoDaLicitacao(ator, dono.licitacaoId);
    const item = await this.itensService.findOne(id);
    return visao === 'ORGAO' ? itemParaOrgao(item) : itemParaPublico(item, lic);
  }

  @Put(':id')
  @SomenteOrgao()
  async update(
    @Param('id') id: string,
    @Body(new ValidationPipe({ skipMissingProperties: true })) updateDto: UpdateItemDto,
    @AtorAtual() ator: Ator,
  ): Promise<ItemLicitacao> {
    await this.acesso.assertOrgaoDoItem(ator, id, 'escrita');
    return await this.itensService.update(id, updateDto);
  }

  @Put(':id/cancelar')
  @SomenteOrgao()
  async cancelar(
    @Param('id') id: string,
    @Body() body: { motivo: string },
    @AtorAtual() ator: Ator,
  ): Promise<ItemLicitacao> {
    await this.acesso.assertOrgaoDoItem(ator, id, 'escrita');
    return await this.itensService.cancelar(id, body.motivo);
  }

  @Put(':id/deserto')
  @SomenteOrgao()
  async marcarDeserto(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<ItemLicitacao> {
    await this.acesso.assertOrgaoDoItem(ator, id, 'escrita');
    return await this.itensService.marcarDeserto(id);
  }

  @Put(':id/fracassado')
  @SomenteOrgao()
  async marcarFracassado(
    @Param('id') id: string,
    @Body() body: { motivo: string },
    @AtorAtual() ator: Ator,
  ): Promise<ItemLicitacao> {
    await this.acesso.assertOrgaoDoItem(ator, id, 'escrita');
    return await this.itensService.marcarFracassado(id, body.motivo);
  }

  @Put(':id/adjudicar')
  @SomenteOrgao()
  async adjudicar(
    @Param('id') id: string,
    @Body(new ValidationPipe()) dados: AdjudicarItemDto,
    @AtorAtual() ator: Ator,
  ): Promise<ItemLicitacao> {
    await this.acesso.assertOrgaoDoItem(ator, id, 'escrita');
    return await this.itensService.adjudicar(id, dados);
  }

  @Put(':id/homologar')
  @SomenteOrgao()
  async homologar(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<ItemLicitacao> {
    await this.acesso.assertOrgaoDoItem(ator, id, 'escrita');
    return await this.itensService.homologar(id);
  }

  @Delete(':id')
  @SomenteOrgao()
  async delete(@Param('id') id: string, @AtorAtual() ator: Ator): Promise<{ message: string }> {
    await this.acesso.assertOrgaoDoItem(ator, id, 'escrita');
    await this.itensService.delete(id);
    return { message: 'Item excluído com sucesso' };
  }

  // ============ INTEGRAÇÃO COM PCA ============

  // Buscar itens do PCA disponíveis para importação
  // Apenas PCAs enviados ao PNCP
  @Get('pca/disponiveis/:orgaoId')
  @SomenteOrgao()
  async buscarItensPcaDisponiveis(
    @Param('orgaoId') orgaoId: string,
    @AtorAtual() ator: Ator,
    @Query('ano') ano?: string,
    @Query('categoria') categoria?: string,
    @Query('busca') busca?: string
  ) {
    this.acesso.assertProprioOrgao(ator, orgaoId, 'leitura');
    return await this.itensService.buscarItensPcaDisponiveis(
      orgaoId,
      ano ? parseInt(ano) : undefined,
      categoria,
      busca
    );
  }

  // Verificar saldo de um item do PCA
  @Get('pca/:itemPcaId/saldo')
  @SomenteOrgao()
  async verificarSaldoPca(@Param('itemPcaId') itemPcaId: string, @AtorAtual() ator: Ator) {
    const orgaoId = await this.itensService.orgaoDoItemPca(itemPcaId);
    this.acesso.assertMesmoOrgao(ator, orgaoId, 'leitura', 'Item do PCA');
    return await this.itensService.verificarSaldoPca(itemPcaId);
  }

  // Importar itens do PCA para licitação
  @Post('importar-pca')
  @SomenteOrgao()
  async importarDoPca(@Body() dto: ImportarItensPcaDto, @AtorAtual() ator: Ator) {
    const dono = await this.acesso.assertOrgaoDaLicitacao(ator, dto?.licitacao_id, 'escrita');
    const orgaoDoPca = await this.itensService.orgaoDoItemPca(dto?.item_pca_id);
    if (!orgaoDoPca) throw new NotFoundException('Item do PCA não encontrado');
    if (orgaoDoPca !== dono.orgaoId) {
      throw new ForbiddenException('O item do PCA pertence a outro órgão');
    }
    return await this.itensService.importarDoPca(dto);
  }

  // Criar item sem PCA (com justificativa)
  @Post('sem-pca')
  @SomenteOrgao()
  async createSemPca(@Body(new ValidationPipe()) dto: CreateItemDto, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, dto.licitacao_id, 'escrita');
    return await this.itensService.createSemPca(dto);
  }

  // Estatísticas de vinculação com PCA
  @Get('licitacao/:licitacaoId/estatisticas-pca')
  @SomenteOrgao()
  async getEstatisticasPca(@Param('licitacaoId') licitacaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaLicitacao(ator, licitacaoId, 'leitura');
    return await this.itensService.getEstatisticasPca(licitacaoId);
  }
}
