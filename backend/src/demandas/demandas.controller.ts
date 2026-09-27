import { Controller, Get, Post, Put, Delete, Body, Param, Query, Patch, Req, ForbiddenException } from '@nestjs/common';
import { DemandasService } from './demandas.service';
import { StatusDemanda, ItemDemanda } from './entities/demanda.entity';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';
import { AcessoLicitacaoService, Ator, AtorAtual, ModoAcesso, SomenteOrgao } from '../auth/acesso';

/**
 * Campos da demanda que o PUT não troca: dono, vínculos e ciclo
 * (enviar/aprovar/rejeitar/consolidar têm rota própria, com permissão).
 */
const CAMPOS_PROTEGIDOS_DEMANDA = [
  'id',
  'orgao_id',
  'orgaoId',
  'orgao',
  'status',
  'pca_id',
  'contratacao_futura_id',
  'data_envio',
  'data_aprovacao',
  'aprovado_por',
  'motivo_rejeicao',
  'itens',
  'created_at',
  'updated_at',
];

/** Campos do item que o cliente não troca: demanda dona e vínculo com o PCA (rota vincular-pca). */
const CAMPOS_PROTEGIDOS_ITEM = ['id', 'demanda_id', 'demanda', 'item_pca_id', 'created_at', 'updated_at'];

function semCampos<T extends object>(dados: T | undefined, campos: string[]): T {
  const copia: any = { ...(dados || {}) };
  for (const c of campos) delete copia[c];
  return copia;
}

/**
 * Demandas (DFD) e contratações futuras — só o órgão dono (ou o admin da
 * plataforma). O órgão vem do TOKEN: `orgaoId` do corpo de outro órgão é
 * recusado (403); nas listagens o `orgaoId` da consulta só vale para o admin.
 * Por id: leitura de demanda/item de outro órgão → 404; escrita → 403.
 * Fornecedor → 403; sem login → 401.
 */
@Controller('demandas')
@RequireModule(ModuloSistema.DEMANDAS)
@SomenteOrgao()
export class DemandasController {
  constructor(
    private readonly demandasService: DemandasService,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  /**
   * Extrai o orgaoId do JWT de forma segura.
   * Admin pode usar query param como fallback.
   */
  private getOrgaoId(user: JwtPayload, orgaoIdParam?: string): string {
    if (user.type === UserType.ORGAO) return user.sub;
    if (user.type === UserType.ADMIN && orgaoIdParam) return orgaoIdParam;
    const orgaoId = user.orgaoId || (user as any).orgao_id;
    if (orgaoId) return orgaoId;
    throw new ForbiddenException('Não foi possível identificar o órgão do usuário');
  }

  /** A demanda é do órgão do token (leitura de outro órgão → 404; escrita → 403). */
  private async exigirDemanda(ator: Ator | null, demandaId: string, modo: ModoAcesso = 'escrita'): Promise<void> {
    const orgaoId = await this.demandasService.orgaoDaDemanda(demandaId);
    this.acesso.assertMesmoOrgao(ator, orgaoId, modo, 'Demanda');
  }

  /** O item é de demanda do órgão do token. */
  private async exigirItemDemanda(ator: Ator | null, itemId: string, modo: ModoAcesso = 'escrita'): Promise<void> {
    const orgaoId = await this.demandasService.orgaoDoItemDemanda(itemId);
    this.acesso.assertMesmoOrgao(ator, orgaoId, modo, 'Item');
  }

  /** Lista de DFDs do corpo: todas do órgão do token (outro órgão → 403; inexistente → 404). */
  private async exigirDemandasDoCorpo(ator: Ator | null, ids: unknown): Promise<string[]> {
    const lista = (Array.isArray(ids) ? ids : []).map(String);
    for (const id of lista) {
      await this.exigirDemanda(ator, id);
    }
    return lista;
  }

  // ==================== DEMANDAS ====================

  @Get()
  async findAll(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
    @Query('ano') ano?: string,
    @Query('status') status?: StatusDemanda,
    @Query('unidadeRequisitante') unidadeRequisitante?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.demandasService.findAll({
      orgaoId,
      ano: ano ? parseInt(ano) : undefined,
      status,
      unidadeRequisitante,
    });
  }

  @Get('estatisticas')
  async getEstatisticas(
    @Req() request: { user: JwtPayload },
    @Query('ano') ano: string,
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.demandasService.getEstatisticas(orgaoId, parseInt(ano));
  }

  @Get('unidades')
  async getUnidadesRequisitantes(
    @Req() request: { user: JwtPayload },
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.demandasService.getUnidadesRequisitantes(orgaoId);
  }

  @Get('para-consolidar')
  async getDemandasParaConsolidar(
    @Req() request: { user: JwtPayload },
    @Query('ano') ano: string,
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.demandasService.getDemandasParaConsolidar(orgaoId, parseInt(ano));
  }

  @Get('contratacoes-futuras')
  async listarContratacoesFuturas(
    @Req() request: { user: JwtPayload },
    @Query('ano') ano: string,
    @Query('orgaoId') orgaoIdParam?: string,
  ) {
    const orgaoId = this.getOrgaoId(request.user, orgaoIdParam);
    return this.demandasService.listarContratacoesFuturas(orgaoId, parseInt(ano));
  }

  @Post('contratacoes-futuras')
  async criarContratacaoFutura(
    @Req() request: { user: JwtPayload },
    @AtorAtual() ator: Ator | null,
    @Body() dados: {
      orgaoId?: string;
      ano_referencia: number;
      titulo: string;
      categoria: 'MATERIAL' | 'SERVICO' | 'OBRA' | 'OUTROS';
      descricao?: string;
      data_inicio_processo?: string;
      data_conclusao_processo?: string;
      prazo_estimado_dias?: number;
      demandaIds?: string[];
      codigo_unidade?: string;
    },
  ) {
    const orgaoId = this.getOrgaoId(request.user, dados.orgaoId);
    const demandaIds = await this.exigirDemandasDoCorpo(ator, dados?.demandaIds);
    return this.demandasService.criarContratacaoFutura(orgaoId, { ...dados, demandaIds });
  }

  @Patch('contratacoes-futuras/:id/demandas')
  async vincularDemandasContratacaoFutura(
    @Req() request: { user: JwtPayload },
    @Param('id') id: string,
    @Body() body: { orgaoId?: string; demandaIds: string[] },
    @AtorAtual() ator: Ator | null,
  ) {
    const orgaoId = this.getOrgaoId(request.user, body?.orgaoId);
    const demandaIds = await this.exigirDemandasDoCorpo(ator, body?.demandaIds);
    return this.demandasService.vincularDemandasContratacaoFutura(orgaoId, id, demandaIds);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    await this.exigirDemanda(ator, id, 'leitura');
    return this.demandasService.findOne(id);
  }

  /** Linha do tempo pós-aprovação: PCA → processo → contrato */
  @Get(':id/acompanhamento')
  async acompanhamento(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    await this.exigirDemanda(ator, id, 'leitura');
    return this.demandasService.acompanhamento(id);
  }

  @Post()
  async create(
    @Body() dados: {
      orgaoId?: string;
      orgao_id?: string;
      ano_referencia: number;
      unidade_requisitante: string;
      responsavel_nome?: string;
      responsavel_email?: string;
      responsavel_telefone?: string;
      observacoes?: string;
      descricao_sucinta_objeto?: string;
      data_desejada_contratacao?: string;
      renovacao_contrato?: boolean;
    },
    @AtorAtual() ator: Ator | null,
  ) {
    // Órgão SEMPRE do token (o admin da plataforma informa); outro órgão no corpo → 403
    const orgaoId = this.acesso.orgaoParaCriacao(ator, dados?.orgaoId || dados?.orgao_id);
    return this.demandasService.create({ ...dados, orgaoId });
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() dados: any,
    @AtorAtual() ator: Ator | null,
  ) {
    await this.exigirDemanda(ator, id);
    return this.demandasService.update(id, semCampos(dados, CAMPOS_PROTEGIDOS_DEMANDA));
  }

  @Delete(':id')
  async delete(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    await this.exigirDemanda(ator, id);
    await this.demandasService.delete(id);
    return { message: 'Demanda excluída com sucesso' };
  }

  // ==================== FLUXO DE STATUS ====================

  @Patch(':id/enviar')
  async enviarParaAprovacao(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    await this.exigirDemanda(ator, id);
    return this.demandasService.enviarParaAprovacao(id);
  }

  @Patch(':id/analisar')
  async iniciarAnalise(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    await this.exigirDemanda(ator, id);
    return this.demandasService.iniciarAnalise(id);
  }

  /**
   * Aprovar/rejeitar exige permissão: login direto do ÓRGÃO e ADMIN sempre
   * podem; usuário do órgão precisa da flag pode_aprovar_demandas.
   * O usuário é o do TOKEN (nunca do corpo).
   */
  private async exigirPermissaoAprovacao(user: JwtPayload): Promise<void> {
    if (user.type === UserType.ORGAO || user.type === UserType.ADMIN) return;
    const pode = await this.demandasService.usuarioPodeAprovarDemandas(user.sub);
    if (!pode) {
      throw new ForbiddenException('Você não tem permissão para aprovar demandas');
    }
  }

  @Patch(':id/aprovar')
  async aprovar(
    @Param('id') id: string,
    @Body() body: { aprovadoPor: string },
    @Req() request: { user: JwtPayload },
    @AtorAtual() ator: Ator | null,
  ) {
    await this.exigirDemanda(ator, id);
    await this.exigirPermissaoAprovacao(request.user);
    return this.demandasService.aprovar(id, body.aprovadoPor);
  }

  @Patch(':id/rejeitar')
  async rejeitar(
    @Param('id') id: string,
    @Body() body: { motivo: string },
    @Req() request: { user: JwtPayload },
    @AtorAtual() ator: Ator | null,
  ) {
    await this.exigirDemanda(ator, id);
    await this.exigirPermissaoAprovacao(request.user);
    return this.demandasService.rejeitar(id, body.motivo);
  }

  @Patch(':id/voltar-rascunho')
  async voltarParaRascunho(@Param('id') id: string, @AtorAtual() ator: Ator | null) {
    await this.exigirDemanda(ator, id);
    return this.demandasService.voltarParaRascunho(id);
  }

  @Patch(':id/consolidar')
  async marcarComoConsolidada(
    @Param('id') id: string,
    @Body() body: { pcaId: string },
    @AtorAtual() ator: Ator | null,
  ) {
    await this.exigirDemanda(ator, id);
    // o PCA informado também precisa ser do órgão do token
    const orgaoDoPca = await this.demandasService.orgaoDoPca(body?.pcaId);
    this.acesso.assertMesmoOrgao(ator, orgaoDoPca, 'escrita', 'PCA');
    return this.demandasService.marcarComoConsolidada(id, body.pcaId);
  }

  // ==================== ITENS DA DEMANDA ====================

  @Post(':id/itens')
  async adicionarItem(
    @Param('id') demandaId: string,
    @Body() dados: Partial<ItemDemanda>,
    @AtorAtual() ator: Ator | null,
  ) {
    await this.exigirDemanda(ator, demandaId);
    return this.demandasService.adicionarItem(demandaId, semCampos(dados, CAMPOS_PROTEGIDOS_ITEM));
  }

  @Put('itens/:itemId')
  async atualizarItem(
    @Param('itemId') itemId: string,
    @Body() dados: Partial<ItemDemanda>,
    @AtorAtual() ator: Ator | null,
  ) {
    await this.exigirItemDemanda(ator, itemId);
    return this.demandasService.atualizarItem(itemId, semCampos(dados, CAMPOS_PROTEGIDOS_ITEM));
  }

  @Delete('itens/:itemId')
  async removerItem(@Param('itemId') itemId: string, @AtorAtual() ator: Ator | null) {
    await this.exigirItemDemanda(ator, itemId);
    await this.demandasService.removerItem(itemId);
    return { message: 'Item removido com sucesso' };
  }

  @Patch('itens/:itemId/vincular-pca')
  async vincularItemAoPCA(
    @Param('itemId') itemId: string,
    @Body() body: { itemPcaId: string },
    @AtorAtual() ator: Ator | null,
  ) {
    await this.exigirItemDemanda(ator, itemId);
    // o item do PCA também precisa ser do órgão do token
    const orgaoDoItemPca = await this.demandasService.orgaoDoItemPca(body?.itemPcaId);
    this.acesso.assertMesmoOrgao(ator, orgaoDoItemPca, 'escrita', 'Item do PCA');
    return this.demandasService.vincularItemAoPCA(itemId, body.itemPcaId);
  }
}
