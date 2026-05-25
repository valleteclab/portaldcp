import { Controller, Get, Post, Put, Delete, Body, Param, Query, Req, ForbiddenException } from '@nestjs/common';
import { CatalogoProprioService } from './catalogo-proprio.service';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('catalogo-proprio')
export class CatalogoProprioController {
  constructor(private readonly catalogoProprioService: CatalogoProprioService) {}

  /**
   * Extrai orgaoId do JWT. Admin pode passar query param.
   * Retorna undefined se admin sem param (ver tudo).
   */
  private getOrgaoIdOptional(user: JwtPayload, orgaoIdParam?: string): string | undefined {
    if (user.type === UserType.ADMIN) return orgaoIdParam;
    if (user.type === UserType.ORGAO) return user.sub;
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    return orgaoId || orgaoIdParam;
  }

  // ==================== CLASSIFICAÇÕES ====================

  @Get('classificacoes')
  async buscarClassificacoes(
    @Req() request: { user: JwtPayload },
    @Query('termo') termo?: string,
    @Query('tipo') tipo?: 'MATERIAL' | 'SERVICO',
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('limite') limite?: string,
  ) {
    const orgaoId = this.getOrgaoIdOptional(request.user, orgaoIdParam);
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
    @Req() request: { user: JwtPayload },
    @Body() dados: {
      nome: string;
      tipo: 'MATERIAL' | 'SERVICO';
      descricao?: string;
      palavras_chave?: string[];
      orgaoId?: string;
    },
  ) {
    const orgaoId = dados.orgaoId || this.getOrgaoIdOptional(request.user);
    return this.catalogoProprioService.criarClassificacao({ ...dados, orgaoId });
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
    @Req() request: { user: JwtPayload },
    @Query('termo') termo?: string,
    @Query('tipo') tipo?: 'MATERIAL' | 'SERVICO',
    @Query('classificacaoId') classificacaoId?: string,
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('limite') limite?: string,
  ) {
    const orgaoId = this.getOrgaoIdOptional(request.user, orgaoIdParam);
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
    @Req() request: { user: JwtPayload },
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
    const orgaoId = dados.orgaoId || this.getOrgaoIdOptional(request.user);
    return this.catalogoProprioService.criarItem({ ...dados, orgaoId });
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
    @Req() request: { user: JwtPayload },
    @Query('termo') termo?: string,
    @Query('tipo') tipo?: 'MATERIAL' | 'SERVICO',
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('limite') limite?: string,
  ) {
    const orgaoId = this.getOrgaoIdOptional(request.user, orgaoIdParam);
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
