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

  /**
   * Escrita no catálogo: só órgão ou admin, e só no que é do próprio órgão
   * (registro global, sem órgão, é do admin). Fornecedor nunca escreve.
   */
  private exigirDono(user: JwtPayload, orgaoDoRegistro: string | null | undefined): void {
    if (user?.type === UserType.ADMIN) return;
    const meu = user?.type === UserType.ORGAO ? user.sub : user?.orgaoId || (user as any)?.orgao_id;
    if (user?.type === UserType.FORNECEDOR || !meu || !orgaoDoRegistro || orgaoDoRegistro !== meu) {
      throw new ForbiddenException('Este registro do catálogo não é do seu órgão');
    }
  }

  /** Órgão em que se cria: o do token; só o admin escolhe (ou cria global). */
  private orgaoParaCriar(user: JwtPayload, informado?: string): string | undefined {
    if (user?.type === UserType.ADMIN) return informado;
    const meu = user?.type === UserType.ORGAO ? user.sub : user?.orgaoId || (user as any)?.orgao_id;
    if (user?.type === UserType.FORNECEDOR || !meu) throw new ForbiddenException('Ação exclusiva do órgão');
    return meu;
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
    const orgaoId = this.orgaoParaCriar(request.user, dados.orgaoId);
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
    @Req() request: { user: JwtPayload },
  ) {
    this.exigirDono(request.user, (await this.catalogoProprioService.findClassificacaoById(id)).orgao_id);
    return this.catalogoProprioService.atualizarClassificacao(id, dados);
  }

  @Delete('classificacoes/:id')
  async excluirClassificacao(@Param('id') id: string, @Req() request: { user: JwtPayload }) {
    this.exigirDono(request.user, (await this.catalogoProprioService.findClassificacaoById(id)).orgao_id);
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
    const orgaoId = this.orgaoParaCriar(request.user, dados.orgaoId);
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
    @Req() request: { user: JwtPayload },
  ) {
    this.exigirDono(request.user, (await this.catalogoProprioService.findItemById(id)).orgao_id);
    return this.catalogoProprioService.atualizarItem(id, dados);
  }

  @Delete('itens/:id')
  async excluirItem(@Param('id') id: string, @Req() request: { user: JwtPayload }) {
    this.exigirDono(request.user, (await this.catalogoProprioService.findItemById(id)).orgao_id);
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
  async seed(@Req() request: { user: JwtPayload }) {
    if (request.user?.type !== UserType.ADMIN) throw new ForbiddenException('Ação exclusiva da administração da plataforma');
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
