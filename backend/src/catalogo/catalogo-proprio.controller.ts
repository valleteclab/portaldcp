import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { CatalogoProprioService } from './catalogo-proprio.service';

@Controller('catalogo-proprio')
export class CatalogoProprioController {
  constructor(private readonly catalogoProprioService: CatalogoProprioService) {}

  // ==================== CLASSIFICAÇÕES ====================

  @Get('classificacoes')
  async buscarClassificacoes(
    @Query('termo') termo?: string,
    @Query('tipo') tipo?: 'MATERIAL' | 'SERVICO',
    @Query('orgaoId') orgaoId?: string,
    @Query('limite') limite?: string,
  ) {
    return this.catalogoProprioService.buscarClassificacoes({
      termo,
      tipo,
      orgaoId,
      limite: limite ? parseInt(limite) : 20,
    });
  }

  @Get('classificacoes/:id')
  async getClassificacao(@Param('id') id: string) {
    return this.catalogoProprioService.findClassificacaoById(id);
  }

  @Get('classificacoes/codigo/:codigo')
  async getClassificacaoByCodigo(@Param('codigo') codigo: string) {
    return this.catalogoProprioService.findClassificacaoByCodigo(codigo);
  }

  @Post('classificacoes')
  async criarClassificacao(
    @Body() dados: {
      nome: string;
      tipo: 'MATERIAL' | 'SERVICO';
      descricao?: string;
      palavras_chave?: string[];
      orgaoId?: string;
    },
  ) {
    return this.catalogoProprioService.criarClassificacao(dados);
  }

  @Put('classificacoes/:id')
  async atualizarClassificacao(
    @Param('id') id: string,
    @Body() dados: {
      nome?: string;
      descricao?: string;
      palavras_chave?: string[];
      ativo?: boolean;
    },
  ) {
    return this.catalogoProprioService.atualizarClassificacao(id, dados);
  }

  @Delete('classificacoes/:id')
  async excluirClassificacao(@Param('id') id: string) {
    return this.catalogoProprioService.excluirClassificacao(id);
  }

  // ==================== ITENS ====================

  @Get('itens')
  async buscarItens(
    @Query('termo') termo?: string,
    @Query('tipo') tipo?: 'MATERIAL' | 'SERVICO',
    @Query('classificacaoId') classificacaoId?: string,
    @Query('orgaoId') orgaoId?: string,
    @Query('limite') limite?: string,
  ) {
    return this.catalogoProprioService.buscarItens({
      termo,
      tipo,
      classificacaoId,
      orgaoId,
      limite: limite ? parseInt(limite) : 20,
    });
  }

  @Get('itens/:id')
  async getItem(@Param('id') id: string) {
    return this.catalogoProprioService.findItemById(id);
  }

  @Get('itens/codigo/:codigo')
  async getItemByCodigo(@Param('codigo') codigo: string) {
    return this.catalogoProprioService.findItemByCodigo(codigo);
  }

  @Post('itens')
  async criarItem(
    @Body() dados: {
      descricao: string;
      tipo: 'MATERIAL' | 'SERVICO';
      classificacaoId: string;
      descricao_detalhada?: string;
      unidade_padrao?: string;
      valor_referencia?: number;
      orgaoId?: string;
    },
  ) {
    return this.catalogoProprioService.criarItem(dados);
  }

  @Put('itens/:id')
  async atualizarItem(
    @Param('id') id: string,
    @Body() dados: {
      descricao?: string;
      descricao_detalhada?: string;
      unidade_padrao?: string;
      valor_referencia?: number;
      classificacaoId?: string;
      ativo?: boolean;
    },
  ) {
    return this.catalogoProprioService.atualizarItem(id, dados);
  }

  @Delete('itens/:id')
  async excluirItem(@Param('id') id: string) {
    return this.catalogoProprioService.excluirItem(id);
  }

  // ==================== BUSCA UNIFICADA (Catálogo + PCA) ====================

  @Get('buscar-itens-pca')
  async buscarItensPCA(
    @Query('termo') termo?: string,
    @Query('tipo') tipo?: 'MATERIAL' | 'SERVICO',
    @Query('orgaoId') orgaoId?: string,
    @Query('limite') limite?: string,
  ) {
    return this.catalogoProprioService.buscarItensDoPCA({
      termo,
      tipo,
      orgaoId,
      limite: limite ? parseInt(limite) : 15,
    });
  }

  // ==================== SEED E ESTATÍSTICAS ====================

  @Post('seed')
  async seed() {
    return this.catalogoProprioService.seedClassificacoesIniciais();
  }

  @Get('estatisticas')
  async getEstatisticas() {
    return this.catalogoProprioService.getEstatisticas();
  }

  // ==================== MIGRAÇÃO ====================

  @Post('migrar-itens-pca')
  async migrarItensPCA() {
    return this.catalogoProprioService.migrarItensPCAParaCatalogo();
  }
}
