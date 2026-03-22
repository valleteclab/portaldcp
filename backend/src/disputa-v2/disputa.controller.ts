import { Controller, Get, Post, Put, Param, Body, Query } from '@nestjs/common';
import { DisputaService } from './disputa.service';
import { Public } from '../auth/public.decorator';

/**
 * ============================================================================
 * DISPUTA CONTROLLER V2
 * ============================================================================
 *
 * Endpoints REST para a Sala de Disputa
 * Complementa o WebSocket Gateway para operações que não precisam de tempo real
 * ============================================================================
 */

@Controller('disputa-v2')
export class DisputaController {
  constructor(private readonly disputaService: DisputaService) {}

  // ============================================================================
  // SESSÃO
  // ============================================================================

  @Public()
  @Get('sessao/:sessaoId')
  async getSessao(@Param('sessaoId') sessaoId: string) {
    return this.disputaService.getSessao(sessaoId);
  }

  @Public()
  @Get('sessao/licitacao/:licitacaoId')
  async getSessaoPorLicitacao(@Param('licitacaoId') licitacaoId: string) {
    return this.disputaService.getSessaoPorLicitacao(licitacaoId);
  }

  // ============================================================================
  // ITENS
  // ============================================================================

  @Public()
  @Get('sessao/:sessaoId/itens')
  async getItensPorStatus(@Param('sessaoId') sessaoId: string) {
    return this.disputaService.getItensPorStatus(sessaoId);
  }

  @Public()
  @Get('sessao/:sessaoId/itens/fornecedor/:fornecedorId')
  async getItensParaFornecedor(
    @Param('sessaoId') sessaoId: string,
    @Param('fornecedorId') fornecedorId: string,
  ) {
    return this.disputaService.getItensParaFornecedor(sessaoId, fornecedorId);
  }

  // ============================================================================
  // LANCES
  // ============================================================================
  // Leituras por itemId resolvem sessão e aplicam anonimização como no WebSocket
  // (nomes reais só após ENCERRADO/NEGOCIACAO quando a sessão exige sigilo).
  // Cancelamento de lance pelo fornecedor: não há endpoint nesta API; no legado
  // (gateway de lances) apenas o pregoeiro pode cancelar lance registrado.

  @Public()
  @Get('item/:itemId/propostas')
  async getPropostasIniciais(@Param('itemId') itemId: string) {
    return this.disputaService.getPropostasIniciais(itemId);
  }

  @Public()
  @Get('item/:itemId/melhores')
  async getMelhoresValoresPorFornecedor(@Param('itemId') itemId: string) {
    return this.disputaService.getMelhoresValoresPorFornecedor(itemId);
  }

  @Public()
  @Get('item/:itemId/lances')
  async getTodosLances(@Param('itemId') itemId: string) {
    return this.disputaService.getTodosLances(itemId);
  }

  // ============================================================================
  // MENSAGENS
  // ============================================================================

  @Public()
  @Get('sessao/:sessaoId/mensagens')
  async getMensagens(
    @Param('sessaoId') sessaoId: string,
    @Query('limite') limite?: number,
  ) {
    return this.disputaService.getMensagens(sessaoId, limite || 50);
  }

  // ============================================================================
  // AÇÕES (alternativa ao WebSocket)
  // ============================================================================

  @Public()
  @Post('sessao/:sessaoId/iniciar-itens')
  async iniciarItens(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { itensIds: string[] },
  ) {
    return this.disputaService.iniciarDisputa(sessaoId, body.itensIds);
  }

  @Public()
  @Post('sessao/:sessaoId/encerrar-item/:itemId')
  async encerrarItem(
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
  ) {
    return this.disputaService.encerrarItem(sessaoId, itemId);
  }

  @Public()
  @Post('sessao/:sessaoId/suspender')
  async suspenderSessao(
    @Param('sessaoId') sessaoId: string,
    @Body()
    body: {
      motivo: 'ADMINISTRATIVO' | 'CAUTELAR' | 'JUDICIAL';
      justificativa: string;
      dataReabertura?: string;
    },
  ) {
    await this.disputaService.suspenderSessao(
      sessaoId,
      body.motivo,
      body.justificativa,
      body.dataReabertura ? new Date(body.dataReabertura) : undefined,
    );
    return { success: true };
  }

  @Public()
  @Post('sessao/:sessaoId/retomar')
  async retomarSessao(@Param('sessaoId') sessaoId: string) {
    await this.disputaService.retomarSessao(sessaoId);
    return { success: true };
  }

  @Public()
  @Post('sessao/:sessaoId/reiniciar')
  async reiniciarSessao(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { justificativa: string },
  ) {
    const resultado = await this.disputaService.reiniciarSessao(
      sessaoId,
      body.justificativa,
    );
    return { success: true, ...resultado };
  }

  @Public()
  @Post('sessao/:sessaoId/lance')
  async registrarLance(
    @Param('sessaoId') sessaoId: string,
    @Body()
    body: {
      itemId: string;
      fornecedorId: string;
      fornecedorNome: string;
      valor: number;
    },
  ) {
    return this.disputaService.registrarLance(
      sessaoId,
      body.itemId,
      body.fornecedorId,
      body.fornecedorNome,
      body.valor,
      'API',
    );
  }

  @Public()
  @Post('sessao/:sessaoId/mensagem')
  async enviarMensagem(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { remetente: string; conteudo: string },
  ) {
    await this.disputaService.enviarMensagem(
      sessaoId,
      body.remetente,
      body.conteudo,
    );
    return { success: true };
  }

  // ============================================================================
  // CONFIGURAÇÃO DA SESSÃO
  // ============================================================================

  @Public()
  @Get('sessao/:sessaoId/configuracoes')
  async getConfiguracoes(@Param('sessaoId') sessaoId: string) {
    return this.disputaService.getConfiguracoesSessao(sessaoId);
  }

  @Public()
  @Put('sessao/:sessaoId/configuracoes')
  async configurarSessao(
    @Param('sessaoId') sessaoId: string,
    @Body()
    body: {
      tempo_inatividade_minutos?: number;
      tempo_prorrogacao_minutos?: number;
      intervalo_minimo_lances_minutos?: number;
      tempo_aleatorio_min_minutos?: number;
      tempo_aleatorio_max_minutos?: number;
      chat_desabilitado?: boolean;
    },
  ) {
    await this.disputaService.configurarSessao(sessaoId, body);
    return { success: true };
  }
}
