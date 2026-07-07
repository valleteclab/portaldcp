import { Controller, Get, Post, Put, Param, Body, Query, Req } from '@nestjs/common';
import { SessaoService } from './sessao.service';
import { RecursosService } from './recursos.service';
import { Public } from '../auth/public.decorator';

@Controller('sessao')
export class SessaoController {
  constructor(
    private readonly sessaoService: SessaoService,
    private readonly recursosService: RecursosService,
  ) {}

  // ========================================
  // ENDPOINTS PARA SALA DE DISPUTA DO FORNECEDOR
  // Públicos para transparência - qualquer pessoa pode acompanhar
  // ========================================

  @Public()
  @Get('fornecedor/:fornecedorId/licitacoes-ativas')
  async getLicitacoesAtivasFornecedor(@Param('fornecedorId') fornecedorId: string) {
    return this.sessaoService.getLicitacoesAtivasFornecedor(fornecedorId);
  }

  @Public()
  @Get(':sessaoId/itens/fornecedor/:fornecedorId')
  async getItensSessaoFornecedor(
    @Param('sessaoId') sessaoId: string,
    @Param('fornecedorId') fornecedorId: string
  ) {
    return this.sessaoService.getItensSessaoFornecedor(sessaoId, fornecedorId);
  }

  @Public()
  @Get('item/:itemId/lances/fornecedor/:fornecedorId')
  async getLancesItem(
    @Param('itemId') itemId: string,
    @Param('fornecedorId') fornecedorId: string
  ) {
    return this.sessaoService.getLancesItem(itemId, fornecedorId);
  }

  @Public()
  @Get(':sessaoId/mensagens')
  async getMensagensSessao(@Param('sessaoId') sessaoId: string) {
    return this.sessaoService.getMensagensSessao(sessaoId);
  }

  // ========================================
  // ENDPOINTS PARA SALA DE DISPUTA DO PREGOEIRO
  // ========================================

  @Get('pregoeiro/:pregoeiroId/sessoes-ativas')
  async getSessoesAtivasPregoeiro(@Param('pregoeiroId') pregoeiroId: string) {
    return this.sessaoService.getSessoesAtivasPregoeiro(pregoeiroId);
  }

  @Get(':sessaoId/itens/pregoeiro')
  async getItensSessaoPregoeiro(@Param('sessaoId') sessaoId: string) {
    return this.sessaoService.getItensSessaoPregoeiro(sessaoId);
  }

  @Get('item/:itemId/lances/pregoeiro')
  async getLancesItemPregoeiro(@Param('itemId') itemId: string) {
    return this.sessaoService.getLancesItemPregoeiro(itemId);
  }

  // ========================================
  // ENDPOINTS GERAIS
  // ========================================

  @Post(':licitacaoId')
  async criarSessao(
    @Param('licitacaoId') licitacaoId: string,
    @Body() body: { pregoeiroId: string; pregoeiroNome: string }
  ) {
    return this.sessaoService.criarSessao(licitacaoId, body.pregoeiroId, body.pregoeiroNome);
  }

  // Rota mais específica primeiro para evitar conflito
  @Public()
  @Get('licitacao/:licitacaoId/preparar')
  async prepararDadosSessao(@Param('licitacaoId') licitacaoId: string) {
    try {
      console.log(`[SessaoController] Preparando dados da sessão para licitação: ${licitacaoId}`);
      const resultado = await this.sessaoService.prepararDadosSessao(licitacaoId);
      console.log(`[SessaoController] Dados preparados com sucesso`);
      return resultado;
    } catch (error: any) {
      console.error(`[SessaoController] Erro ao preparar dados da sessão:`, error.message, error.stack);
      throw error;
    }
  }

  @Public()
  @Get('licitacao/:licitacaoId')
  async getSessaoPorLicitacao(@Param('licitacaoId') licitacaoId: string) {
    return this.sessaoService.getSessaoPorLicitacao(licitacaoId);
  }

  @Put(':id/iniciar')
  async iniciarSessao(@Param('id') id: string) {
    return this.sessaoService.iniciarSessao(id);
  }

  @Put(':id/reabrir')
  async reabrirSessao(@Param('id') id: string) {
    return this.sessaoService.reabrirSessao(id);
  }

  @Put(':id/avancar-disputa')
  async avancarParaDisputa(@Param('id') id: string) {
    return this.sessaoService.avancarParaDisputa(id);
  }

  @Put(':id/iniciar-item/:itemId')
  async iniciarDisputaItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string
  ) {
    return this.sessaoService.iniciarDisputaItem(id, itemId);
  }

  /**
   * Inicia disputa de TODOS os itens simultaneamente
   * Cada item terá seu próprio cronômetro
   */
  @Put(':id/iniciar-todos-itens')
  async iniciarDisputaTodosItens(@Param('id') id: string) {
    return this.sessaoService.iniciarDisputaTodosItens(id);
  }

  /**
   * Registra lance por LOTE (valor total)
   * Na disputa por lote, o fornecedor dá lance sobre o valor total do lote
   */
  @Post(':id/lance-lote')
  async registrarLanceLote(
    @Param('id') id: string,
    @Body() body: { 
      loteId: string; 
      fornecedorId: string; 
      fornecedorNome: string; 
      valorTotal: number 
    },
    @Req() req: any
  ) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    return this.sessaoService.registrarLanceLote(
      id, 
      body.loteId, 
      body.fornecedorId, 
      body.fornecedorNome, 
      body.valorTotal, 
      ip
    );
  }

  @Put(':id/encerrar-item')
  async encerrarDisputaItem(@Param('id') id: string) {
    return this.sessaoService.encerrarDisputaItem(id);
  }

  /** Estado atual da habilitação: convocado, ranking completo e etapa */
  @Get(':id/habilitacao')
  async getHabilitacaoStatus(@Param('id') id: string) {
    return this.sessaoService.getHabilitacaoStatus(id);
  }

  @Get(':id/negociacao')
  async getNegociacaoStatus(@Param('id') id: string) {
    return this.sessaoService.getNegociacaoStatus(id);
  }

  @Put(':id/negociacao/:fornecedorId')
  async iniciarNegociacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string
  ) {
    return this.sessaoService.iniciarNegociacao(id, fornecedorId);
  }

  @Put(':id/negociacao/encerrar')
  async encerrarNegociacao(
    @Param('id') id: string,
    @Body() body: { valorFinal?: number }
  ) {
    return this.sessaoService.encerrarNegociacao(id, body.valorFinal);
  }

  @Put(':id/habilitacao/convocar/:fornecedorId')
  async convocarHabilitacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string
  ) {
    return this.sessaoService.convocarParaHabilitacao(id, fornecedorId);
  }

  @Put(':id/habilitacao/aprovar/:fornecedorId')
  async aprovarHabilitacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string
  ) {
    return this.sessaoService.aprovarHabilitacao(id, fornecedorId);
  }

  @Put(':id/habilitacao/reprovar/:fornecedorId')
  async reprovarHabilitacao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { motivo: string }
  ) {
    return this.sessaoService.reprovarHabilitacao(id, fornecedorId, body.motivo);
  }

  @Put(':id/recursos/abrir-prazo')
  async abrirPrazoRecurso(@Param('id') id: string) {
    return this.sessaoService.abrirPrazoIntencaoRecurso(id);
  }

  @Get(':id/recursos/intencoes')
  async getIntencaoRecursoStatus(@Param('id') id: string) {
    return this.sessaoService.getIntencaoRecursoStatus(id);
  }

  @Post(':id/recursos/intencao')
  async registrarIntencaoRecurso(
    @Param('id') id: string,
    @Body() body: { fornecedorId: string; motivacao: string }
  ) {
    return this.sessaoService.registrarIntencaoRecurso(id, body.fornecedorId, body.motivacao);
  }

  @Put(':id/recursos/encerrar-prazo')
  async encerrarPrazoIntencaoRecurso(@Param('id') id: string) {
    return this.sessaoService.encerrarPrazoIntencaoRecurso(id);
  }

  // === BENEFÍCIO ME/EPP (LC 123, art. 44/45) ===

  @Put(':id/mpe/convocar/:fornecedorId')
  async convocarMPE(@Param('id') id: string, @Param('fornecedorId') fornecedorId: string) {
    return this.sessaoService.convocarMPEParaLance(id, fornecedorId);
  }

  @Put(':id/mpe/aceitar/:fornecedorId')
  async aceitarLanceMPE(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { itemId: string; valor: number },
  ) {
    return this.sessaoService.aceitarLanceMPE(id, fornecedorId, body.itemId, body.valor);
  }

  @Put(':id/mpe/recusar/:fornecedorId')
  async recusarLanceMPE(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { itemId: string },
  ) {
    return this.sessaoService.recusarLanceMPE(id, fornecedorId, body.itemId);
  }

  // === RECURSOS FORMAIS (Art. 165) ===

  @Get(':id/recursos')
  async listarRecursos(@Param('id') id: string) {
    return this.recursosService.listarPorSessao(id);
  }

  @Post(':id/recursos/:fornecedorId/admitir')
  async admitirIntencao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { fornecedorNome?: string; itemId?: string; motivacao?: string },
  ) {
    return this.recursosService.admitirIntencao(id, fornecedorId, body);
  }

  @Post(':id/recursos/:fornecedorId/recusar')
  async recusarIntencao(
    @Param('id') id: string,
    @Param('fornecedorId') fornecedorId: string,
    @Body() body: { motivo: string; fornecedorNome?: string; itemId?: string },
  ) {
    return this.recursosService.recusarIntencao(id, fornecedorId, body.motivo, body);
  }

  @Put('recursos/:recursoId/razoes')
  async apresentarRazoes(
    @Param('recursoId') recursoId: string,
    @Body() body: { razoes: string },
  ) {
    return this.recursosService.apresentarRazoes(recursoId, body.razoes);
  }

  @Put('recursos/:recursoId/contrarrazoes')
  async apresentarContrarrazoes(
    @Param('recursoId') recursoId: string,
    @Body() body: { fornecedorId: string; fornecedorNome?: string; texto: string },
  ) {
    return this.recursosService.apresentarContrarrazoes(recursoId, body);
  }

  @Put('recursos/:recursoId/decidir')
  async decidirRecurso(
    @Param('recursoId') recursoId: string,
    @Body()
    body: { provido: boolean; decisao: string; decididoPor?: string; decididoPorCargo?: string },
  ) {
    return this.recursosService.decidir(recursoId, body);
  }

  // === HOMOLOGAÇÃO (Art. 71) ===

  @Put(':id/homologar')
  async homologar(
    @Param('id') id: string,
    @Body() body: { nome?: string; cargo?: string },
  ) {
    return this.sessaoService.homologar(id, body);
  }

  @Get(':id/adjudicacao')
  async getAdjudicacaoStatus(@Param('id') id: string) {
    return this.sessaoService.getAdjudicacaoStatus(id);
  }

  @Put(':id/adjudicar/:itemId')
  async adjudicarItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: { fornecedorId: string; valor: number }
  ) {
    return this.sessaoService.adjudicarItem(id, itemId, body.fornecedorId, body.valor);
  }

  @Put(':id/adjudicar-todos')
  async adjudicarTodos(@Param('id') id: string) {
    return this.sessaoService.adjudicarTodos(id);
  }

  @Put(':id/encerrar')
  async encerrarSessao(@Param('id') id: string) {
    return this.sessaoService.encerrarSessao(id);
  }

  @Put(':id/suspender')
  async suspenderSessao(
    @Param('id') id: string,
    @Body() body: { motivo: string }
  ) {
    return this.sessaoService.suspenderSessao(id, body.motivo);
  }

  /**
   * Gera a ATA completa da sessão de disputa
   * Conforme Art. 17, §2º da Lei 14.133/2021
   */
  @Public()
  @Get(':id/ata')
  async gerarAtaSessao(@Param('id') id: string) {
    return this.sessaoService.gerarAtaSessao(id);
  }

  // ROTAS GENÉRICAS - DEVEM FICAR POR ÚLTIMO para não conflitar com rotas específicas
  @Public()
  @Get(':id/eventos')
  async getEventos(@Param('id') id: string) {
    return this.sessaoService.getEventosSessao(id);
  }

  @Public()
  @Get(':id')
  async getSessao(@Param('id') id: string) {
    return this.sessaoService.getSessao(id);
  }
}
