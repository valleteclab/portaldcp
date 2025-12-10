import { Controller, Get, Query, Param, Post, Body } from '@nestjs/common';
import { CatalogoService, BuscaCatalogoDto } from './catalogo.service';
import { CatalogoImportService } from './catalogo-import.service';
import * as path from 'path';

@Controller('catalogo')
export class CatalogoController {
  constructor(
    private readonly catalogoService: CatalogoService,
    private readonly catalogoImportService: CatalogoImportService,
  ) {}

  // ============ CLASSES ============

  @Get('classes')
  async listarClasses(@Query('tipo') tipo?: 'MATERIAL' | 'SERVICO') {
    return this.catalogoService.listarClasses(tipo);
  }

  @Get('classes/:codigo')
  async buscarClasse(@Param('codigo') codigo: string) {
    return this.catalogoService.buscarClassePorCodigo(codigo);
  }

  // ============ ITENS ============

  @Get('itens')
  async buscarItens(
    @Query('termo') termo?: string,
    @Query('tipo') tipo?: 'MATERIAL' | 'SERVICO',
    @Query('classe_id') classe_id?: string,
    @Query('codigo_classe') codigo_classe?: string,
    @Query('pagina') pagina?: string,
    @Query('limite') limite?: string,
  ) {
    const filtros: BuscaCatalogoDto = {
      termo,
      tipo,
      classe_id,
      codigo_classe,
      pagina: pagina ? parseInt(pagina) : 1,
      limite: limite ? parseInt(limite) : 20,
    };
    return this.catalogoService.buscarItens(filtros);
  }

  @Get('itens/:codigo')
  async buscarItem(@Param('codigo') codigo: string) {
    return this.catalogoService.buscarItemPorCodigo(codigo);
  }

  // ============ UNIDADES ============

  @Get('unidades')
  async listarUnidades() {
    return this.catalogoService.listarUnidades();
  }

  // ============ ESTATÍSTICAS ============

  @Get('estatisticas')
  async obterEstatisticas() {
    return this.catalogoService.obterEstatisticas();
  }

  // ============ SINCRONIZAÇÃO MANUAL ============

  @Post('sincronizar')
  async sincronizarManual() {
    await this.catalogoService.sincronizarCatalogo();
    return { mensagem: 'Sincronização iniciada' };
  }

  // ============ SEED (POPULAR DADOS INICIAIS) ============

  @Post('seed')
  async popularDadosIniciais() {
    await this.catalogoService.popularDadosIniciais();
    return { mensagem: 'Dados iniciais populados com sucesso' };
  }

  // ============ IMPORTAR ITEM DO CATÁLOGO COMPRAS.GOV.BR ============

  @Post('importar-item')
  async importarItem(@Body() itemData: {
    codigo: string;
    descricao: string;
    tipo: 'MATERIAL' | 'SERVICO';
    unidade_padrao?: string;
    codigo_classe?: string;
    origem?: string;
  }) {
    return this.catalogoService.importarItem(itemData);
  }

  // ============ IMPORTAR CSV DO COMPRASGOV ============

  @Post('importar-csv')
  async importarCSV(@Body() body: { tipo: 'MATERIAL' | 'SERVICO'; caminho?: string }) {
    // Caminho do arquivo CSV - pode ser passado ou usar padrão
    const csvPath = body.caminho || path.resolve(
      process.cwd(),
      'docs',
      body.tipo === 'MATERIAL' 
        ? 'Catálogo de Materiais - 21112025.CSV'
        : 'Catálogo de Serviços.CSV'
    );
    return this.catalogoImportService.importarCSV(csvPath, body.tipo);
  }

  // ============ BUSCA AVANÇADA DE ITENS ============

  @Get('buscar')
  async buscarItensAvancado(
    @Query('termo') termo?: string,
    @Query('tipo') tipo?: 'MATERIAL' | 'SERVICO',
    @Query('codigo_grupo') codigoGrupo?: string,
    @Query('codigo_classe') codigoClasse?: string,
    @Query('limite') limite?: string,
    @Query('offset') offset?: string,
  ) {
    return this.catalogoImportService.buscarItens({
      termo,
      tipo,
      codigoGrupo,
      codigoClasse,
      limite: limite ? parseInt(limite) : 50,
      offset: offset ? parseInt(offset) : 0,
    });
  }

  // ============ ESTATÍSTICAS DO CATÁLOGO IMPORTADO ============

  @Get('estatisticas-importacao')
  async estatisticasImportacao() {
    return this.catalogoImportService.getEstatisticas();
  }
}
