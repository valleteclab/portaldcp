import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  Req,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UseGuards,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ModeloDocumentoService } from './modelo-documento.service';
import { TramitacaoService, TramitarDto } from './tramitacao.service';
import { AprovacaoService } from './aprovacao.service';
import { TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { ModeloDocumento } from './entities/modelo-documento.entity';
import { FluxoAprovacaoDocumento } from './entities/fluxo-aprovacao.entity';
import { ContextoUsuario } from './audit-log.service';
import { AtorAtual } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { DonoFaseInternaGuard, DonoPor } from './dono-fase-interna.guard';

/**
 * Processo eletrônico da fase interna (estilo SEI):
 * modelos de documento personalizáveis, tramitação entre setores
 * e fluxo de aprovação multi-etapa.
 *
 * AUTORIZAÇÃO (E1a): DonoFaseInternaGuard — toda rota exige órgão; com
 * `:licitacaoId`, tramitação, documento ou etapa por id exige o órgão DONO da
 * licitação. Modelos e fluxos: o órgão é o do token (orgaoId informado só vale
 * para o admin da plataforma); por id, só o órgão dono (modelo padrão do
 * sistema: leitura/duplicação livre, alteração só pelo admin). Caixas de
 * entrada/aprovação: só processos do órgão do token; setor/usuário consultados
 * precisam ser do órgão; servidor (USUARIO) só vê a própria caixa, salvo papel
 * ADMIN do órgão.
 */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard)
export class ProcessoEletronicoController {
  constructor(
    private readonly modelos: ModeloDocumentoService,
    private readonly tramitacao: TramitacaoService,
    private readonly aprovacao: AprovacaoService,
    private readonly dataSource: DataSource,
  ) {}

  /** Papéis do servidor que enxergam as caixas de todo o órgão. */
  private static readonly PAPEIS_CAIXA_DO_ORGAO = ['ADMIN'];

  /**
   * Modelo por id: órgão dono (ou admin). Modelo padrão do sistema (orgao_id
   * nulo): leitura livre para órgãos; escrita só admin. Leitura de fora → 404.
   */
  private async assertModelo(ator: Ator, id: string, modo: 'leitura' | 'escrita') {
    const r = ehUuid(id) ? await this.dataSource.query(`SELECT orgao_id FROM modelos_documento WHERE id = $1`, [id]) : [];
    if (!r[0]) throw new NotFoundException('Modelo de documento não encontrado');
    if (ator.admin) return;
    const orgaoId = r[0].orgao_id;
    if (!orgaoId) {
      if (modo === 'escrita') throw new ForbiddenException('Modelos padrão do sistema não podem ser alterados. Duplique para personalizar.');
      return;
    }
    if (orgaoId !== ator.orgaoId) {
      if (modo === 'leitura') throw new NotFoundException('Modelo de documento não encontrado');
      throw new ForbiddenException('Acesso negado: modelo pertence a outro órgão');
    }
  }

  /** Fluxo de aprovação por id: só o órgão dono (ou admin). */
  private async assertFluxo(ator: Ator, id: string) {
    const r = ehUuid(id) ? await this.dataSource.query(`SELECT orgao_id FROM fluxos_aprovacao_documento WHERE id = $1`, [id]) : [];
    if (!r[0]) throw new NotFoundException('Fluxo de aprovação não encontrado');
    if (!ator.admin && r[0].orgao_id !== ator.orgaoId) {
      throw new ForbiddenException('Acesso negado: fluxo pertence a outro órgão');
    }
  }

  /**
   * Destino de uma caixa (entrada/aprovação) validado contra o token:
   *  - setor: precisa ser do órgão do ator;
   *  - usuário: precisa ser do órgão (ou o próprio órgão, no login do órgão);
   *    servidor sem papel ADMIN só consulta a si mesmo (omitido → ele mesmo).
   * Devolve também o órgão para restringir a consulta. Admin: livre.
   */
  private async destinoDaCaixa(ator: Ator, setorId?: string, usuarioId?: string) {
    if (ator.admin) return { setorId: setorId || undefined, usuarioId: usuarioId || undefined, orgaoId: undefined };
    const orgaoId = ator.orgaoId!;
    setorId = setorId || undefined;
    usuarioId = usuarioId || undefined;

    if (ator.tipo === 'USUARIO' && !ProcessoEletronicoController.PAPEIS_CAIXA_DO_ORGAO.includes(ator.role || '')) {
      if (usuarioId && usuarioId !== ator.usuarioId) {
        throw new ForbiddenException('Acesso negado: só é possível consultar a própria caixa');
      }
      usuarioId = ator.usuarioId || undefined;
    }

    if (setorId) {
      const r = ehUuid(setorId) ? await this.dataSource.query(`SELECT orgao_id FROM setores WHERE id = $1`, [setorId]) : [];
      if (r[0]?.orgao_id !== orgaoId) throw new ForbiddenException('Acesso negado: setor não pertence ao órgão');
    }
    if (usuarioId && usuarioId !== orgaoId) {
      const r = ehUuid(usuarioId) ? await this.dataSource.query(`SELECT orgao_id FROM usuarios WHERE id = $1`, [usuarioId]) : [];
      if (r[0]?.orgao_id !== orgaoId) throw new ForbiddenException('Acesso negado: usuário não pertence ao órgão');
    }
    return { setorId, usuarioId, orgaoId };
  }

  /** Órgão do ator; admin da plataforma pode informar outro. */
  private orgaoDoAtor(ator: Ator, informado?: string): string | undefined {
    return ator.admin ? informado : ator.orgaoId!;
  }

  private contexto(req: any, body?: any): ContextoUsuario {
    return {
      usuario_id: body?.usuarioId || body?.usuario_id,
      usuario_nome: body?.usuarioNome || body?.usuario_nome,
      ip_origem: req?.ip,
      user_agent: req?.headers?.['user-agent'],
    };
  }

  // ==========================================================================
  // MODELOS DE DOCUMENTO
  // ==========================================================================

  @Get('modelos')
  listarModelos(
    @AtorAtual() ator: Ator,
    @Query('orgaoId') orgaoId?: string,
    @Query('tipo') tipo?: TipoDocumentoFaseInterna,
  ) {
    return this.modelos.listar(this.orgaoDoAtor(ator, orgaoId), tipo);
  }

  @Get('modelos/:id')
  async obterModelo(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.assertModelo(ator, id, 'leitura');
    return this.modelos.obter(id);
  }

  @Post('modelos')
  criarModelo(@Body() body: Partial<ModeloDocumento>, @AtorAtual() ator: Ator) {
    return this.modelos.criar({ ...body, orgao_id: this.orgaoDoAtor(ator, body?.orgao_id) as string });
  }

  @Post('modelos/:id/duplicar')
  async duplicarModelo(
    @Param('id') id: string,
    @Body() body: { orgaoId: string; usuarioId?: string; usuarioNome?: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.assertModelo(ator, id, 'leitura');
    const orgaoId = this.orgaoDoAtor(ator, body?.orgaoId);
    if (!orgaoId) throw new BadRequestException('orgaoId é obrigatório');
    return this.modelos.duplicar(id, orgaoId, {
      id: body.usuarioId,
      nome: body.usuarioNome,
    });
  }

  @Put('modelos/:id')
  async atualizarModelo(@Param('id') id: string, @Body() body: Partial<ModeloDocumento>, @AtorAtual() ator: Ator) {
    await this.assertModelo(ator, id, 'escrita');
    return this.modelos.atualizar(id, body);
  }

  @Delete('modelos/:id')
  async desativarModelo(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.assertModelo(ator, id, 'escrita');
    return this.modelos.desativar(id);
  }

  /** Cria documento da fase interna a partir do modelo efetivo (ou de um modelo específico) */
  @Post(':licitacaoId/documentos/do-modelo')
  async criarDocumentoDeModelo(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      tipo: TipoDocumentoFaseInterna;
      modeloId?: string;
      criadorId?: string;
      criadorNome?: string;
    },
    @AtorAtual() ator: Ator,
  ) {
    if (!body?.tipo) throw new BadRequestException('tipo é obrigatório');
    // Modelo específico: do próprio órgão ou padrão do sistema
    if (body.modeloId) await this.assertModelo(ator, body.modeloId, 'leitura');
    return this.modelos.criarDocumentoDeModelo(licitacaoId, body.tipo, body);
  }

  // ==========================================================================
  // TRAMITAÇÃO
  // ==========================================================================

  @Post(':licitacaoId/tramitar')
  tramitar(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: TramitarDto & { usuarioId?: string; usuarioNome?: string },
    @Req() req: any,
  ) {
    return this.tramitacao.tramitar(licitacaoId, body, this.contexto(req, body));
  }

  @Get(':licitacaoId/tramitacoes')
  listarTramitacoes(@Param('licitacaoId') licitacaoId: string) {
    return this.tramitacao.listarPorProcesso(licitacaoId);
  }

  @Get(':licitacaoId/tramitacoes/atual')
  tramitacaoAtual(@Param('licitacaoId') licitacaoId: string) {
    return this.tramitacao.tramitacaoAtual(licitacaoId);
  }

  @Get('tramitacoes/caixa-entrada')
  async caixaEntrada(
    @AtorAtual() ator: Ator,
    @Query('setorId') setorId?: string,
    @Query('usuarioId') usuarioId?: string,
  ) {
    return this.tramitacao.caixaEntrada(await this.destinoDaCaixa(ator, setorId, usuarioId));
  }

  @Put('tramitacoes/:id/receber')
  @DonoPor('tramitacao', 'id')
  receberTramitacao(
    @Param('id') id: string,
    @Body() body: { usuarioId?: string; usuarioNome?: string },
    @Req() req: any,
  ) {
    return this.tramitacao.receber(
      id,
      { id: body?.usuarioId, nome: body?.usuarioNome },
      this.contexto(req, body),
    );
  }

  @Put('tramitacoes/:id/devolver')
  @DonoPor('tramitacao', 'id')
  devolverTramitacao(
    @Param('id') id: string,
    @Body() body: { motivo: string; usuarioId?: string; usuarioNome?: string },
    @Req() req: any,
  ) {
    return this.tramitacao.devolver(
      id,
      body?.motivo,
      { id: body?.usuarioId, nome: body?.usuarioNome },
      this.contexto(req, body),
    );
  }

  // ==========================================================================
  // FLUXOS DE APROVAÇÃO (configuração por órgão)
  // ==========================================================================

  @Get('fluxos-aprovacao')
  listarFluxos(@Query('orgaoId') orgaoIdInformado: string, @AtorAtual() ator: Ator) {
    const orgaoId = this.orgaoDoAtor(ator, orgaoIdInformado);
    if (!orgaoId) throw new BadRequestException('orgaoId é obrigatório');
    return this.aprovacao.listarFluxos(orgaoId);
  }

  @Post('fluxos-aprovacao')
  criarFluxo(@Body() body: Partial<FluxoAprovacaoDocumento>, @AtorAtual() ator: Ator) {
    return this.aprovacao.criarFluxo({ ...body, orgao_id: this.orgaoDoAtor(ator, body?.orgao_id) as string });
  }

  @Put('fluxos-aprovacao/:id')
  async atualizarFluxo(@Param('id') id: string, @Body() body: Partial<FluxoAprovacaoDocumento>, @AtorAtual() ator: Ator) {
    await this.assertFluxo(ator, id);
    return this.aprovacao.atualizarFluxo(id, body);
  }

  @Delete('fluxos-aprovacao/:id')
  async removerFluxo(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.assertFluxo(ator, id);
    return this.aprovacao.removerFluxo(id);
  }

  // ==========================================================================
  // APROVAÇÃO MULTI-ETAPA (instância por documento)
  // ==========================================================================

  /** Submete o documento instanciando as etapas do fluxo configurado */
  @Put('documento/:id/submeter-fluxo')
  @DonoPor('documento', 'id')
  submeterFluxo(
    @Param('id') id: string,
    @Body() body: { usuarioId?: string; usuarioNome?: string },
    @Req() req: any,
  ) {
    return this.aprovacao.submeter(id, this.contexto(req, body));
  }

  @Get('documento/:id/etapas-aprovacao')
  @DonoPor('documento', 'id')
  listarEtapas(@Param('id') id: string) {
    return this.aprovacao.listarEtapasDocumento(id);
  }

  @Get('aprovacoes/caixa')
  async caixaAprovacoes(
    @AtorAtual() ator: Ator,
    @Query('usuarioId') usuarioId?: string,
    @Query('setorId') setorId?: string,
  ) {
    return this.aprovacao.caixaAprovacoes(await this.destinoDaCaixa(ator, setorId, usuarioId));
  }

  @Put('aprovacoes/etapa/:etapaId/aprovar')
  @DonoPor('etapa', 'etapaId')
  aprovarEtapa(
    @Param('etapaId') etapaId: string,
    @Body() body: { usuarioId?: string; usuarioNome?: string; justificativa?: string },
    @Req() req: any,
  ) {
    return this.aprovacao.aprovarEtapa(
      etapaId,
      { id: body?.usuarioId, nome: body?.usuarioNome },
      body?.justificativa,
      this.contexto(req, body),
    );
  }

  @Put('aprovacoes/etapa/:etapaId/reprovar')
  @DonoPor('etapa', 'etapaId')
  reprovarEtapa(
    @Param('etapaId') etapaId: string,
    @Body() body: { usuarioId?: string; usuarioNome?: string; justificativa: string },
    @Req() req: any,
  ) {
    return this.aprovacao.reprovarEtapa(
      etapaId,
      { id: body?.usuarioId, nome: body?.usuarioNome },
      body?.justificativa,
      this.contexto(req, body),
    );
  }
}
