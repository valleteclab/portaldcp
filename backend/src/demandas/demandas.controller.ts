import { Controller, Get, Post, Put, Delete, Body, Param, Query, Patch, Req, ForbiddenException } from '@nestjs/common';
import { DemandasService } from './demandas.service';
import { StatusDemanda, ItemDemanda } from './entities/demanda.entity';
import { RequireModule } from '../auth/require-module.decorator';
import { ModuloSistema } from '../orgaos/enums/modulos.enum';
import { JwtPayload, UserType } from '../auth/auth.service';

@Controller('demandas')
@RequireModule(ModuloSistema.DEMANDAS)
export class DemandasController {
  constructor(private readonly demandasService: DemandasService) {}

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
    return this.demandasService.criarContratacaoFutura(orgaoId, dados);
  }

  @Patch('contratacoes-futuras/:id/demandas')
  async vincularDemandasContratacaoFutura(
    @Req() request: { user: JwtPayload },
    @Param('id') id: string,
    @Body() body: { orgaoId?: string; demandaIds: string[] },
  ) {
    const orgaoId = this.getOrgaoId(request.user, body.orgaoId);
    return this.demandasService.vincularDemandasContratacaoFutura(orgaoId, id, body.demandaIds || []);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.demandasService.findOne(id);
  }

  /** Linha do tempo pós-aprovação: PCA → processo → contrato */
  @Get(':id/acompanhamento')
  async acompanhamento(@Param('id') id: string) {
    return this.demandasService.acompanhamento(id);
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
      descricao_sucinta_objeto?: string;
      data_desejada_contratacao?: string;
      renovacao_contrato?: boolean;
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

  /**
   * Aprovar/rejeitar exige permissão: login direto do ÓRGÃO e ADMIN sempre
   * podem; usuário do órgão precisa da flag pode_aprovar_demandas.
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
  ) {
    await this.exigirPermissaoAprovacao(request.user);
    return this.demandasService.aprovar(id, body.aprovadoPor);
  }

  @Patch(':id/rejeitar')
  async rejeitar(
    @Param('id') id: string,
    @Body() body: { motivo: string },
    @Req() request: { user: JwtPayload },
  ) {
    await this.exigirPermissaoAprovacao(request.user);
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
