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
  Res,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { ModeloDocumentoService } from './modelo-documento.service';
import { TramitacaoService } from './tramitacao.service';
import type { TramitarDto } from './tramitacao.service';
import { AprovacaoService } from './aprovacao.service';
import { TipoDocumentoFaseInterna } from './entities/documento-fase-interna.entity';
import { ModeloDocumento } from './entities/modelo-documento.entity';
import { ContextoUsuario } from './audit-log.service';
import { AtorAtual } from '../auth/acesso/acesso.decorators';
import type { Ator } from '../auth/acesso/ator';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { DonoFaseInternaGuard, DonoModo, DonoPor } from './dono-fase-interna.guard';
import { AprovacaoPecasService } from './aprovacao-pecas.service';
import { TarefasService } from './tarefas/tarefas.service';
import type { Response } from 'express';
import * as fs from 'fs';
import { TrabalhoNaEtapa, TrabalhoNaEtapaGuard } from './fluxo/trabalho-na-etapa.guard';

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
@UseGuards(DonoFaseInternaGuard, TrabalhoNaEtapaGuard)
export class ProcessoEletronicoController {
  constructor(
    private readonly modelos: ModeloDocumentoService,
    private readonly tramitacao: TramitacaoService,
    private readonly aprovacao: AprovacaoService,
    private readonly dataSource: DataSource,
    private readonly aprovacaoPecas: AprovacaoPecasService,
    private readonly tarefas: TarefasService,
  ) {}

  /** Administração do órgão: login do órgão, usuário com papel ADMIN ou admin da plataforma. */
  private exigirAdminDoOrgao(ator: Ator) {
    if (ator.admin || ator.tipo === 'ORGAO' || (ator.tipo === 'USUARIO' && ator.role === 'ADMIN')) return;
    throw new ForbiddenException('Só o administrador do órgão altera os fluxos de aprovação');
  }

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
  @TrabalhoNaEtapa({ tipoCorpo: 'tipo', acao: 'criar a peça a partir do modelo' })
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

  /**
   * Envia o processo (setor e/ou pessoa) com despacho — o despacho vira folha
   * nos autos e o destino é avisado (interno, e-mail, WhatsApp). Quem envia é
   * SEMPRE o usuário do token (usuário no corpo é ignorado). Corpo:
   * { para_setor_id?, para_usuario_id?, despacho, finalidade?, prazo_dias_uteis?, data_ocorrencia? }.
   */
  @Post(':licitacaoId/tramitar')
  @DonoModo('leitura')
  tramitar(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: TramitarDto,
    @AtorAtual() ator: Ator,
    @Req() req: any,
  ) {
    return this.tramitacao.tramitar(licitacaoId, body ?? {}, ator, this.contexto(req));
  }

  @Get(':licitacaoId/tramitacoes')
  listarTramitacoes(@Param('licitacaoId') licitacaoId: string) {
    return this.tramitacao.listarPorProcesso(licitacaoId);
  }

  @Get(':licitacaoId/tramitacoes/atual')
  tramitacaoAtual(@Param('licitacaoId') licitacaoId: string) {
    return this.tramitacao.tramitacaoAtual(licitacaoId);
  }

  /** Com quem está: setor, pessoa, desde, prazo e dias úteis restantes. */
  @Get(':licitacaoId/tramitacao/com-quem-esta')
  comQuemEsta(@Param('licitacaoId') licitacaoId: string) {
    return this.tramitacao.comQuemEsta(licitacaoId);
  }

  /** Linha do tempo: envios, recebimentos e devoluções, com despacho e link da folha. */
  @Get(':licitacaoId/tramitacao/linha-do-tempo')
  linhaDoTempo(@Param('licitacaoId') licitacaoId: string) {
    return this.tramitacao.linhaDoTempo(licitacaoId);
  }

  /**
   * Caixa de entrada da tramitação. Servidor (sem papel ADMIN): SEMPRE a
   * própria — setor de lotação + envios diretos a ele (filtros de outro
   * setor/pessoa → 403). Órgão/ADMIN: setor ou pessoa do órgão; sem filtro,
   * todas do órgão. `?recebidas=1` inclui as já recebidas.
   */
  @Get('tramitacoes/caixa-entrada')
  async caixaEntrada(
    @AtorAtual() ator: Ator,
    @Query('setorId') setorId?: string,
    @Query('usuarioId') usuarioId?: string,
    @Query('recebidas') recebidas?: string,
  ) {
    const incluirRecebidas = recebidas === '1' || recebidas === 'true';
    if (!ator.admin && ator.tipo === 'USUARIO' && !ProcessoEletronicoController.PAPEIS_CAIXA_DO_ORGAO.includes(ator.role || '')) {
      const [eu] = ator.usuarioId && ehUuid(ator.usuarioId)
        ? await this.dataSource.query(`SELECT setor_id::text AS setor_id FROM usuarios WHERE id::text = $1`, [ator.usuarioId])
        : [];
      const meuSetor: string | null = eu?.setor_id ?? null;
      if (usuarioId && usuarioId !== ator.usuarioId) throw new ForbiddenException('Acesso negado: só é possível consultar a própria caixa');
      if (setorId && setorId !== meuSetor) throw new ForbiddenException('Acesso negado: só é possível consultar a caixa do próprio setor');
      return this.tramitacao.caixaEntrada({ setorId: meuSetor, usuarioId: ator.usuarioId, orgaoId: ator.orgaoId!, incluirRecebidas });
    }
    if (!setorId && !usuarioId && ator.tipo === 'USUARIO' && ator.usuarioId) {
      // ADMIN do órgão sem filtro: a própria caixa (setor + pessoa)
      const [eu] = await this.dataSource.query(`SELECT setor_id::text AS setor_id FROM usuarios WHERE id::text = $1`, [ator.usuarioId]);
      return this.tramitacao.caixaEntrada({ setorId: eu?.setor_id ?? null, usuarioId: ator.usuarioId, orgaoId: ator.orgaoId!, incluirRecebidas });
    }
    const destino = await this.destinoDaCaixa(ator, setorId, usuarioId);
    return this.tramitacao.caixaEntrada({ ...destino, incluirRecebidas });
  }

  /** Confirma o recebimento (setor/pessoa de destino, chefe do setor ou ADMIN). Corpo: { data_ocorrencia? }. */
  @Put('tramitacoes/:id/receber')
  @DonoPor('tramitacao', 'id')
  @DonoModo('leitura')
  receberTramitacao(
    @Param('id') id: string,
    @Body() body: { data_ocorrencia?: string },
    @AtorAtual() ator: Ator,
    @Req() req: any,
  ) {
    return this.tramitacao.receber(id, ator, { data_ocorrencia: body?.data_ocorrencia ?? null }, this.contexto(req));
  }

  /** Devolve a quem enviou, com motivo obrigatório. Corpo: { motivo, data_ocorrencia? }. */
  @Put('tramitacoes/:id/devolver')
  @DonoPor('tramitacao', 'id')
  @DonoModo('leitura')
  devolverTramitacao(
    @Param('id') id: string,
    @Body() body: { motivo: string; data_ocorrencia?: string },
    @AtorAtual() ator: Ator,
    @Req() req: any,
  ) {
    return this.tramitacao.devolver(id, body?.motivo, ator, { data_ocorrencia: body?.data_ocorrencia ?? null }, this.contexto(req));
  }

  /** PDF do despacho (folha dos autos). */
  @Get('tramitacoes/:id/despacho')
  @DonoPor('tramitacao', 'id')
  async despachoPdf(@Param('id') id: string, @Res() res: Response) {
    const arq = await this.tramitacao.arquivoDoDespacho(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${arq.nome}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(fs.readFileSync(arq.caminho));
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

  /** Catálogo de modelos prontos (dados). `?todos=1` inclui os desativados (admin da plataforma). */
  @Get('fluxos-aprovacao/modelos-prontos')
  modelosProntos(@AtorAtual() ator: Ator, @Query('todos') todos?: string) {
    return this.aprovacaoPecas.modelosProntos(ator.admin && (todos === '1' || todos === 'true'));
  }

  /** Novo modelo pronto — só o admin da plataforma. */
  @Post('fluxos-aprovacao/modelos-prontos')
  criarModeloPronto(@Body() body: any, @AtorAtual() ator: Ator) {
    return this.aprovacaoPecas.criarModeloPronto(ator, body ?? {});
  }

  /** Altera (ou desativa, `ativo: false`) um modelo pronto — só o admin da plataforma. */
  @Put('fluxos-aprovacao/modelos-prontos/:id')
  atualizarModeloPronto(@Param('id') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.aprovacaoPecas.atualizarModeloPronto(ator, id, body ?? {});
  }

  /**
   * Onde o fluxo vale: etapas do modelo de fluxo do órgão com "aprovação
   * interna" ligada (por tipo de processo) e o fluxo usado para cada peça.
   */
  @Get('fluxos-aprovacao/cobertura')
  cobertura(@Query('orgaoId') orgaoIdInformado: string, @AtorAtual() ator: Ator) {
    const orgaoId = this.orgaoDoAtor(ator, orgaoIdInformado);
    if (!orgaoId) throw new BadRequestException('orgaoId é obrigatório');
    return this.aprovacaoPecas.cobertura(orgaoId);
  }

  @Post('fluxos-aprovacao')
  async criarFluxo(@Body() body: any, @AtorAtual() ator: Ator) {
    this.exigirAdminDoOrgao(ator);
    const orgaoId = this.orgaoDoAtor(ator, body?.orgao_id);
    if (!orgaoId) throw new BadRequestException('orgao_id é obrigatório');
    return this.aprovacao.criarFluxo(orgaoId, body ?? {}, await this.tarefas.autor(ator));
  }

  @Put('fluxos-aprovacao/:id')
  async atualizarFluxo(@Param('id') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    await this.assertFluxo(ator, id);
    this.exigirAdminDoOrgao(ator);
    return this.aprovacao.atualizarFluxo(id, body ?? {});
  }

  @Delete('fluxos-aprovacao/:id')
  async removerFluxo(@Param('id') id: string, @AtorAtual() ator: Ator) {
    await this.assertFluxo(ator, id);
    this.exigirAdminDoOrgao(ator);
    return this.aprovacao.removerFluxo(id);
  }

  // ==========================================================================
  // APROVAÇÃO MULTI-ETAPA (instância por documento)
  // ==========================================================================

  /** Submete o documento instanciando as etapas do fluxo configurado (quem envia: o usuário do token). */
  @TrabalhoNaEtapa({ documentoParam: 'id', acao: 'enviar para aprovação' })
  @Put('documento/:id/submeter-fluxo')
  @DonoPor('documento', 'id')
  async submeterFluxo(@Param('id') id: string, @AtorAtual() ator: Ator, @Req() req: any) {
    const autor = await this.tarefas.autor(ator);
    return this.aprovacao.submeter(
      id,
      { usuario_id: autor.id ?? undefined, usuario_nome: autor.nome ?? undefined, ip_origem: req?.ip, user_agent: req?.headers?.['user-agent'] },
      { por: autor },
    );
  }

  @Get('documento/:id/etapas-aprovacao')
  @DonoPor('documento', 'id')
  listarEtapas(@Param('id') id: string) {
    return this.aprovacao.listarEtapasDocumento(id);
  }

  /**
   * Caixa de aprovações. Sem filtro: a do usuário do token (Central de
   * Aprovações — só as etapas que são dele). Com `setorId`/`usuarioId`: o
   * login do órgão/ADMIN consulta um setor ou uma pessoa do órgão.
   */
  @Get('aprovacoes/caixa')
  async caixaAprovacoes(
    @AtorAtual() ator: Ator,
    @Query('usuarioId') usuarioId?: string,
    @Query('setorId') setorId?: string,
  ) {
    // A peça emitida agora vai para o fluxo depois do commit: espera a fila
    await this.tarefas.aguardarPendentes();
    const servidorComum = ator.tipo === 'USUARIO' && !ProcessoEletronicoController.PAPEIS_CAIXA_DO_ORGAO.includes(ator.role || '');
    if (!ator.admin && (!(setorId || usuarioId) || servidorComum)) {
      // Servidor comum: sempre a própria caixa (filtro de outra pessoa/órgão → 403)
      if (setorId || usuarioId) await this.destinoDaCaixa(ator, setorId, usuarioId);
      return this.aprovacaoPecas.caixa(ator);
    }
    return this.aprovacao.caixaAprovacoes(await this.destinoDaCaixa(ator, setorId, usuarioId));
  }

  /** Aprova a etapa — só quem é o responsável por ela (usuário do token); 403 se não é sua. */
  @Put('aprovacoes/etapa/:etapaId/aprovar')
  @DonoPor('etapa', 'etapaId')
  @DonoModo('leitura')
  aprovarEtapa(
    @Param('etapaId') etapaId: string,
    @Body() body: { justificativa?: string; papel?: string },
    @AtorAtual() ator: Ator,
    @Req() req: any,
  ) {
    return this.aprovacaoPecas.decidir(etapaId, ator, 'aprovar', body ?? {}, { ip: req?.ip, userAgent: req?.headers?.['user-agent'] });
  }

  /** Reprova a etapa (motivo obrigatório): a peça volta para quem a fez. */
  @Put('aprovacoes/etapa/:etapaId/reprovar')
  @DonoPor('etapa', 'etapaId')
  @DonoModo('leitura')
  reprovarEtapa(
    @Param('etapaId') etapaId: string,
    @Body() body: { justificativa?: string },
    @AtorAtual() ator: Ator,
    @Req() req: any,
  ) {
    return this.aprovacaoPecas.decidir(etapaId, ator, 'reprovar', body ?? {}, { ip: req?.ip, userAgent: req?.headers?.['user-agent'] });
  }
}
