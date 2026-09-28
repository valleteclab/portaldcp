import { Body, Controller, Get, Headers, Ip, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AtorAtual } from '../../auth/acesso/acesso.decorators';
import type { Ator } from '../../auth/acesso/ator';
import { DonoFaseInternaGuard } from '../dono-fase-interna.guard';
import { TarefasService } from '../tarefas/tarefas.service';
import { AutorizacaoTelaService } from './autorizacao-tela.service';
import { ControleInternoTelaService } from './controle-interno-tela.service';
import { MinutasTelaService } from './minutas-tela.service';
import { MinutasSubscriber } from './minutas.subscriber';
import { ParecerTelaService } from './parecer-tela.service';

/**
 * TELAS DA ETAPA 6 E 7 (Entrega 3B): autorização (também no celular),
 * minutas e relatório do agente, parecer com diligências e controle interno.
 * DonoFaseInternaGuard na classe: anônimo 401, fornecedor 403; `:licitacaoId`
 * exige o órgão DONO (leitura de outro órgão 404; escrita 403). Autor sempre
 * do JWT. Papéis: só o signatário designado assina/devolve a autorização; só
 * o papel JURÍDICO abre diligência e emite o parecer; só o papel CONTROLE
 * INTERNO se manifesta (403 para os demais).
 */
@Controller('fase-interna')
@UseGuards(DonoFaseInternaGuard)
export class TelasAnaliseDecisaoController {
  constructor(
    private readonly autorizacao: AutorizacaoTelaService,
    private readonly minutas: MinutasTelaService,
    private readonly parecer: ParecerTelaService,
    private readonly controleInterno: ControleInternoTelaService,
    private readonly subscriber: MinutasSubscriber,
    private readonly tarefas: TarefasService,
  ) {}

  private autor(ator: Ator) {
    return this.tarefas.autor(ator);
  }

  // === AUTORIZAÇÃO (etapa 6) ===

  @Get(':licitacaoId/autorizacao')
  async obterAutorizacao(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    await this.subscriber.aguardarPendentes();
    return this.autorizacao.obter(id, ator);
  }

  /**
   * Gera (ou regera) o despacho pelo modelo. Depois de autorizado: 409, salvo
   * `{ nova_autorizacao: true, motivo }` (versão nova, de novo à autoridade).
   */
  @Post(':licitacaoId/autorizacao/gerar')
  async gerarAutorizacao(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.autorizacao.gerar(id, ator, await this.autor(ator), body ?? {});
  }

  /** Envia à autoridade: { signatarios?: [{ usuario_id, papel }] } — sem lista, os da configuração. */
  @Post(':licitacaoId/autorizacao/enviar')
  async enviarAutorizacao(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.autorizacao.enviar(id, body ?? {}, ator, await this.autor(ator));
  }

  /** "Autorizar e assinar" — só o signatário designado, com o próprio login. */
  @Post(':licitacaoId/autorizacao/assinar')
  assinarAutorizacao(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator, @Ip() ip: string, @Headers('user-agent') ua: string) {
    return this.autorizacao.assinar(id, ator, { ip, userAgent: ua });
  }

  /** "Devolver com observação": { motivo } → tarefa do agente. */
  @Post(':licitacaoId/autorizacao/devolver')
  async devolverAutorizacao(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.autorizacao.devolver(id, body ?? {}, ator, await this.autor(ator));
  }

  // === MINUTAS E RELATÓRIO DO AGENTE (etapa 7, agente) ===

  @Get(':licitacaoId/minutas')
  async obterMinutas(@Param('licitacaoId') id: string) {
    await this.subscriber.aguardarPendentes();
    return this.minutas.obter(id);
  }

  /** :tipo = RAG | ME | MC | TODAS. */
  @Post(':licitacaoId/minutas/:tipo/gerar')
  async gerarMinuta(@Param('licitacaoId') id: string, @Param('tipo') tipo: string, @AtorAtual() ator: Ator) {
    return this.minutas.gerar(id, tipo, await this.autor(ator));
  }

  /** Sigilo do orçamento (art. 24): { sigiloso, justificativa }. */
  @Put(':licitacaoId/minutas/sigilo')
  async sigilo(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.minutas.salvarSigilo(id, body ?? {}, await this.autor(ator));
  }

  // === PARECER JURÍDICO COM DILIGÊNCIAS (etapa 7, Procuradoria) ===

  /** ?fase=PREVIA (padrão) | EXTERNA. */
  @Get(':licitacaoId/parecer')
  async obterParecer(@Param('licitacaoId') id: string, @Query('fase') fase: string, @AtorAtual() ator: Ator) {
    await this.subscriber.aguardarPendentes();
    return this.parecer.obter(id, fase, ator);
  }

  /** Rascunho: { fase, roteiro: { ITEM: { situacao, observacao } }, conclusao, fundamentacao, ressalvas }. */
  @Put(':licitacaoId/parecer')
  async salvarParecer(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.parecer.salvar(id, body ?? {}, ator, await this.autor(ator));
  }

  /**
   * Diligências da peça (tela da etapa): ?tipo=TR — abertas (e as últimas
   * sanadas), quem abriu, versão nova pronta e se o usuário pode sanar.
   */
  @Get(':licitacaoId/diligencias')
  diligenciasDaPeca(@Param('licitacaoId') id: string, @Query('tipo') tipo: string, @AtorAtual() ator: Ator) {
    return this.parecer.diligenciasDaPeca(id, tipo, ator);
  }

  /** { fase, tipo_alvo, descricao, item_roteiro?, folha?, trecho? }. */
  @Post(':licitacaoId/parecer/diligencias')
  async abrirDiligencia(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.parecer.abrirDiligencia(id, body ?? {}, ator, await this.autor(ator));
  }

  /** { resposta, sem_alteracao? } — pelo responsável da peça (ou agente/admin). */
  @Post(':licitacaoId/parecer/diligencias/:diligenciaId/sanar')
  async sanar(@Param('licitacaoId') id: string, @Param('diligenciaId') dil: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.parecer.sanar(id, dil, body ?? {}, ator, await this.autor(ator));
  }

  @Post(':licitacaoId/parecer/diligencias/:diligenciaId/reabrir')
  async reabrir(@Param('licitacaoId') id: string, @Param('diligenciaId') dil: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.parecer.reabrir(id, dil, body ?? {}, ator, await this.autor(ator));
  }

  @Post(':licitacaoId/parecer/diligencias/:diligenciaId/cancelar')
  async cancelar(@Param('licitacaoId') id: string, @Param('diligenciaId') dil: string, @Body() body: any, @AtorAtual() ator: Ator) {
    return this.parecer.cancelar(id, dil, body ?? {}, ator, await this.autor(ator));
  }

  /** { fase, conclusao: FAVORAVEL | FAVORAVEL_COM_RESSALVAS | DESFAVORAVEL, fundamentacao?, ressalvas? } — emite e assina. */
  @Post(':licitacaoId/parecer/emitir')
  async emitirParecer(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator, @Ip() ip: string, @Headers('user-agent') ua: string) {
    return this.parecer.emitir(id, body ?? {}, ator, await this.autor(ator), { ip, userAgent: ua });
  }

  /** Pede o parecer da fase externa (depois da sessão, antes da adjudicação) — tarefa da Procuradoria. */
  @Post(':licitacaoId/parecer/fase-externa/solicitar')
  async solicitarFaseExterna(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    return this.parecer.solicitarFaseExterna(id, await this.autor(ator));
  }

  // === CONTROLE INTERNO (opcional por órgão) ===

  @Get(':licitacaoId/controle-interno')
  obterControleInterno(@Param('licitacaoId') id: string, @AtorAtual() ator: Ator) {
    return this.controleInterno.obter(id, ator);
  }

  /** { conclusao: FAVORAVEL | COM_APONTAMENTOS, texto?, apontamentos? } — gera e assina. */
  @Post(':licitacaoId/controle-interno/manifestar')
  async manifestar(@Param('licitacaoId') id: string, @Body() body: any, @AtorAtual() ator: Ator, @Ip() ip: string, @Headers('user-agent') ua: string) {
    return this.controleInterno.manifestar(id, body ?? {}, ator, await this.autor(ator), { ip, userAgent: ua });
  }
}
