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
} from '@nestjs/common';

import { ModeloDocumentoService } from './modelo-documento.service';
import { TramitacaoService, TramitarDto } from './tramitacao.service';
import { AprovacaoService } from './aprovacao.service';
import { TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { ModeloDocumento } from './entities/modelo-documento.entity';
import { FluxoAprovacaoDocumento } from './entities/fluxo-aprovacao.entity';
import { ContextoUsuario } from './audit-log.service';

/**
 * Processo eletrônico da fase interna (estilo SEI):
 * modelos de documento personalizáveis, tramitação entre setores
 * e fluxo de aprovação multi-etapa.
 */
@Controller('fase-interna')
export class ProcessoEletronicoController {
  constructor(
    private readonly modelos: ModeloDocumentoService,
    private readonly tramitacao: TramitacaoService,
    private readonly aprovacao: AprovacaoService,
  ) {}

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
    @Query('orgaoId') orgaoId?: string,
    @Query('tipo') tipo?: TipoDocumentoFaseInterna,
  ) {
    return this.modelos.listar(orgaoId, tipo);
  }

  @Get('modelos/:id')
  obterModelo(@Param('id') id: string) {
    return this.modelos.obter(id);
  }

  @Post('modelos')
  criarModelo(@Body() body: Partial<ModeloDocumento>) {
    return this.modelos.criar(body);
  }

  @Post('modelos/:id/duplicar')
  duplicarModelo(
    @Param('id') id: string,
    @Body() body: { orgaoId: string; usuarioId?: string; usuarioNome?: string },
  ) {
    if (!body?.orgaoId) throw new BadRequestException('orgaoId é obrigatório');
    return this.modelos.duplicar(id, body.orgaoId, {
      id: body.usuarioId,
      nome: body.usuarioNome,
    });
  }

  @Put('modelos/:id')
  atualizarModelo(@Param('id') id: string, @Body() body: Partial<ModeloDocumento>) {
    return this.modelos.atualizar(id, body);
  }

  @Delete('modelos/:id')
  desativarModelo(@Param('id') id: string) {
    return this.modelos.desativar(id);
  }

  /** Cria documento da fase interna a partir do modelo efetivo (ou de um modelo específico) */
  @Post(':licitacaoId/documentos/do-modelo')
  criarDocumentoDeModelo(
    @Param('licitacaoId') licitacaoId: string,
    @Body()
    body: {
      tipo: TipoDocumentoFaseInterna;
      modeloId?: string;
      criadorId?: string;
      criadorNome?: string;
    },
  ) {
    if (!body?.tipo) throw new BadRequestException('tipo é obrigatório');
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
  caixaEntrada(
    @Query('setorId') setorId?: string,
    @Query('usuarioId') usuarioId?: string,
  ) {
    return this.tramitacao.caixaEntrada({ setorId, usuarioId });
  }

  @Put('tramitacoes/:id/receber')
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
  listarFluxos(@Query('orgaoId') orgaoId: string) {
    if (!orgaoId) throw new BadRequestException('orgaoId é obrigatório');
    return this.aprovacao.listarFluxos(orgaoId);
  }

  @Post('fluxos-aprovacao')
  criarFluxo(@Body() body: Partial<FluxoAprovacaoDocumento>) {
    return this.aprovacao.criarFluxo(body);
  }

  @Put('fluxos-aprovacao/:id')
  atualizarFluxo(@Param('id') id: string, @Body() body: Partial<FluxoAprovacaoDocumento>) {
    return this.aprovacao.atualizarFluxo(id, body);
  }

  @Delete('fluxos-aprovacao/:id')
  removerFluxo(@Param('id') id: string) {
    return this.aprovacao.removerFluxo(id);
  }

  // ==========================================================================
  // APROVAÇÃO MULTI-ETAPA (instância por documento)
  // ==========================================================================

  /** Submete o documento instanciando as etapas do fluxo configurado */
  @Put('documento/:id/submeter-fluxo')
  submeterFluxo(
    @Param('id') id: string,
    @Body() body: { usuarioId?: string; usuarioNome?: string },
    @Req() req: any,
  ) {
    return this.aprovacao.submeter(id, this.contexto(req, body));
  }

  @Get('documento/:id/etapas-aprovacao')
  listarEtapas(@Param('id') id: string) {
    return this.aprovacao.listarEtapasDocumento(id);
  }

  @Get('aprovacoes/caixa')
  caixaAprovacoes(
    @Query('usuarioId') usuarioId?: string,
    @Query('setorId') setorId?: string,
  ) {
    return this.aprovacao.caixaAprovacoes({ usuarioId, setorId });
  }

  @Put('aprovacoes/etapa/:etapaId/aprovar')
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
