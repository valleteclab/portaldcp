import { Controller, Get, Post, Put, Param, Body, Query, NotFoundException, BadRequestException } from '@nestjs/common';
import { DisputaService } from './disputa.service';
import { SigiloDisputaService } from './sigilo-disputa.service';
import { DisputaGateway } from './disputa.gateway';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import {
  AtorAtual,
  AutenticacaoOpcional,
  OrgaoOuFornecedor,
  SomenteFornecedor,
  SomenteOrgao,
} from '../auth/acesso/acesso.decorators';
import { ehFornecedor } from '../auth/acesso/ator';
import type { Ator } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';

/**
 * ============================================================================
 * DISPUTA CONTROLLER V2
 * ============================================================================
 *
 * Endpoints REST para a Sala de Disputa
 * Complementa o WebSocket Gateway para operações que não precisam de tempo real
 *
 * AUTORIZAÇÃO (E1a):
 *  - atos do pregoeiro (iniciar/encerrar item, suspender, retomar, reiniciar,
 *    configurações, mensagem) → só o órgão DONO da sessão (@SomenteOrgao +
 *    assertOrgaoDaSessao);
 *  - lance → só o fornecedor do TOKEN, com proposta válida na licitação; o
 *    `fornecedorId` do corpo, se vier, precisa ser o do token (403);
 *  - leituras: órgão dono vê tudo; demais (fornecedor participante, público)
 *    recebem as identidades dos outros licitantes anonimizadas enquanto o item
 *    está em disputa e sem o valor de referência quando o orçamento é sigiloso.
 * ============================================================================
 */

@Controller('disputa')
export class DisputaController {
  constructor(
    private readonly disputaService: DisputaService,
    private readonly acesso: AcessoLicitacaoService,
    private readonly sigilo: SigiloDisputaService,
    private readonly gateway: DisputaGateway,
  ) {}

  /** Licitação da sessão (404 se não existe). */
  private async licitacaoDaSessao(sessaoId: string): Promise<string> {
    const dono = await this.acesso.donoDaSessao(sessaoId);
    if (!dono) throw new NotFoundException('Sessão não encontrada');
    return dono.licitacaoId;
  }

  // ============================================================================
  // SESSÃO (dados públicos da sessão: status, etapa, pregoeiro, objeto)
  // ============================================================================

  @AutenticacaoOpcional()
  @Get('sessao/:sessaoId')
  async getSessao(@Param('sessaoId') sessaoId: string) {
    if (!ehUuid(sessaoId)) throw new NotFoundException('Sessão não encontrada');
    return this.disputaService.getSessao(sessaoId);
  }

  @AutenticacaoOpcional()
  @Get('sessao/licitacao/:licitacaoId')
  async getSessaoPorLicitacao(@Param('licitacaoId') licitacaoId: string) {
    if (!ehUuid(licitacaoId)) throw new NotFoundException('Sessão não encontrada para esta licitação');
    return this.disputaService.getSessaoPorLicitacao(licitacaoId);
  }

  // ============================================================================
  // ITENS
  // ============================================================================

  @AutenticacaoOpcional()
  @Get('sessao/:sessaoId/itens')
  async getItensPorStatus(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator | null) {
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    const visao = await this.sigilo.visaoDoAtor(ator, licitacaoId);
    const itens = await this.disputaService.getItensPorStatus(
      sessaoId,
      visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : undefined,
      { visaoOrgao: visao.tipo === 'ORGAO' },
    );
    return this.sigilo.aplicarVisao(itens, licitacaoId, visao, { sessaoId });
  }

  /** Visão do fornecedor: só ele mesmo (token) ou o órgão dono. */
  @OrgaoOuFornecedor()
  @Get('sessao/:sessaoId/itens/fornecedor/:fornecedorId')
  async getItensParaFornecedor(
    @Param('sessaoId') sessaoId: string,
    @Param('fornecedorId') fornecedorId: string,
    @AtorAtual() ator: Ator,
  ) {
    if (ehFornecedor(ator)) {
      const fid = this.acesso.fornecedorDoToken(ator, fornecedorId);
      const licitacaoId = await this.licitacaoDaSessao(sessaoId);
      await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
      const dados = await this.disputaService.getItensParaFornecedor(sessaoId, fid);
      return this.sigilo.aplicarVisao(dados, licitacaoId, { tipo: 'FORNECEDOR', fornecedorId: fid }, { sessaoId });
    }
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId, 'leitura');
    return this.disputaService.getItensParaFornecedor(sessaoId, fornecedorId);
  }

  // ============================================================================
  // LANCES
  // ============================================================================
  // Leituras por itemId resolvem sessão e aplicam anonimização como no WebSocket
  // (nomes reais só após ENCERRADO/NEGOCIACAO). A fase vem do servidor.

  private async leituraDoItem<T>(
    itemId: string,
    ator: Ator | null,
    ler: (visaoOrgao: boolean) => Promise<T>,
  ): Promise<T> {
    // Unidade de disputa: item ou lote (disputa por lote) — mesmo sigilo
    const dono = await this.acesso.donoDaUnidade(itemId);
    if (!dono) throw new NotFoundException('Item não encontrado');
    const visao = await this.sigilo.visaoDoAtor(ator, dono.licitacaoId);
    const dados = await ler(visao.tipo === 'ORGAO');
    // Identidades só depois do fim da etapa de lances da licitação inteira (E2)
    const reveladas = await this.sigilo.identidadesReveladasNoItem(itemId);
    return this.sigilo.aplicarVisao(dados, dono.licitacaoId, visao, { identidades: !reveladas });
  }

  @AutenticacaoOpcional()
  @Get('item/:itemId/propostas')
  async getPropostasIniciais(@Param('itemId') itemId: string, @AtorAtual() ator: Ator | null) {
    return this.leituraDoItem(itemId, ator, (visaoOrgao) =>
      this.disputaService.getPropostasIniciais(itemId, undefined, { visaoOrgao }),
    );
  }

  @AutenticacaoOpcional()
  @Get('item/:itemId/melhores')
  async getMelhoresValoresPorFornecedor(@Param('itemId') itemId: string, @AtorAtual() ator: Ator | null) {
    return this.leituraDoItem(itemId, ator, (visaoOrgao) =>
      this.disputaService.getMelhoresValoresPorFornecedor(itemId, undefined, { visaoOrgao }),
    );
  }

  @AutenticacaoOpcional()
  @Get('item/:itemId/lances')
  async getTodosLances(@Param('itemId') itemId: string, @AtorAtual() ator: Ator | null) {
    return this.leituraDoItem(itemId, ator, (visaoOrgao) =>
      this.disputaService.getTodosLances(itemId, undefined, { visaoOrgao }),
    );
  }

  // ============================================================================
  // MENSAGENS
  // ============================================================================

  @AutenticacaoOpcional()
  @Get('sessao/:sessaoId/mensagens')
  async getMensagens(
    @Param('sessaoId') sessaoId: string,
    @AtorAtual() ator: Ator | null,
    @Query('limite') limite?: number,
  ) {
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    const visao = await this.sigilo.visaoDoAtor(ator, licitacaoId);
    const mensagens = await this.disputaService.getMensagens(sessaoId, Math.min(Number(limite) || 50, 200));
    const reveladas = await this.sigilo.identidadesReveladas(sessaoId);
    return this.sigilo.aplicarVisao(mensagens, licitacaoId, visao, { sessaoId, identidades: !reveladas });
  }

  // ============================================================================
  // AÇÕES DO PREGOEIRO (alternativa ao WebSocket) — só o órgão dono
  // ============================================================================

  @SomenteOrgao()
  @Post('sessao/:sessaoId/iniciar-itens')
  async iniciarItens(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { itensIds: string[] },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    return this.disputaService.iniciarDisputa(
      sessaoId,
      Array.isArray(body?.itensIds) ? body.itensIds : [],
      atorTransicaoDe(ator),
    );
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/encerrar-item/:itemId')
  async encerrarItem(
    @Param('sessaoId') sessaoId: string,
    @Param('itemId') itemId: string,
    @AtorAtual() ator: Ator,
  ) {
    const dono = await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    const resultado = await this.disputaService.encerrarItem(sessaoId, itemId, atorTransicaoDe(ator));
    await this.gateway.difundirItemEncerrado(sessaoId, dono.licitacaoId, itemId, resultado).catch(() => undefined);
    return resultado;
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/suspender')
  async suspenderSessao(
    @Param('sessaoId') sessaoId: string,
    @Body()
    body: {
      motivo: 'ADMINISTRATIVO' | 'CAUTELAR' | 'JUDICIAL';
      justificativa: string;
      dataReabertura?: string;
    },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    await this.disputaService.suspenderSessao(
      sessaoId,
      body.motivo,
      body.justificativa,
      body.dataReabertura ? new Date(body.dataReabertura) : undefined,
    );
    return { success: true };
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/retomar')
  async retomarSessao(@Param('sessaoId') sessaoId: string, @AtorAtual() ator: Ator) {
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    await this.disputaService.retomarSessao(sessaoId);
    return { success: true };
  }

  @SomenteOrgao()
  @Post('sessao/:sessaoId/reiniciar')
  async reiniciarSessao(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { justificativa: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    const resultado = await this.disputaService.reiniciarSessao(sessaoId, body?.justificativa, atorTransicaoDe(ator));
    return { success: true, ...resultado };
  }

  /** Mensagem do pregoeiro na sala (o remetente é sempre o pregoeiro). */
  @SomenteOrgao()
  @Post('sessao/:sessaoId/mensagem')
  async enviarMensagem(
    @Param('sessaoId') sessaoId: string,
    @Body() body: { remetente?: string; conteudo: string },
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    if (!body?.conteudo?.trim()) throw new BadRequestException('conteudo é obrigatório');
    await this.disputaService.enviarMensagem(
      sessaoId,
      { tipo: 'PREGOEIRO', nome: body.remetente?.trim() || 'Pregoeiro', usuarioId: ator.id },
      body.conteudo,
    );
    return { success: true };
  }

  // ============================================================================
  // LANCE (fornecedor do token)
  // ============================================================================

  @SomenteFornecedor()
  @Post('sessao/:sessaoId/lance')
  async registrarLance(
    @Param('sessaoId') sessaoId: string,
    @Body()
    body: {
      /** Unidade de disputa: id do item (ou do lote, na disputa por lote). */
      itemId?: string;
      /** Disputa por lote: id do lote (alternativa a `itemId`). */
      loteId?: string;
      /** Legado: se vier, precisa ser o do token. */
      fornecedorId?: string;
      fornecedorNome?: string;
      valor: number;
    },
    @AtorAtual() ator: Ator,
  ) {
    const fornecedorId = this.acesso.fornecedorDoToken(ator, body?.fornecedorId);
    const licitacaoId = await this.licitacaoDaSessao(sessaoId);
    await this.acesso.assertFornecedorParticipa(ator, licitacaoId);
    const unidadeId = body?.loteId ?? body?.itemId;
    if (!ehUuid(unidadeId)) throw new BadRequestException('itemId (ou loteId) inválido');
    const lance = await this.disputaService.registrarLance({
      sessaoId,
      itemId: unidadeId,
      loteId: ehUuid(body?.loteId) ? body.loteId : undefined,
      fornecedorId,
      valor: Number(body.valor),
      ip: 'API',
    });
    // Difusão depois do registro; nunca transforma o lance gravado em erro
    await this.gateway.difundirNovoLance(sessaoId, licitacaoId, lance);
    return lance;
  }

  // ============================================================================
  // CONFIGURAÇÃO DA SESSÃO
  // ============================================================================

  @AutenticacaoOpcional()
  @Get('sessao/:sessaoId/configuracoes')
  async getConfiguracoes(@Param('sessaoId') sessaoId: string) {
    if (!ehUuid(sessaoId)) throw new NotFoundException('Sessão não encontrada');
    return this.disputaService.getConfiguracoesSessao(sessaoId);
  }

  @SomenteOrgao()
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
    @AtorAtual() ator: Ator,
  ) {
    await this.acesso.assertOrgaoDaSessao(ator, sessaoId);
    await this.disputaService.configurarSessao(sessaoId, body);
    return { success: true };
  }
}
