import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Namespace, Socket } from 'socket.io';
import { DisputaService, ResultadoEncerramento } from './disputa.service';
import { Lance } from './entities/lance.entity';
import { SigiloDisputaService, VisaoDisputa } from './sigilo-disputa.service';
import { WsAutenticador, atorDoSocket } from '../auth/acesso/ws-autenticador';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { ehFornecedor } from '../auth/acesso/ator';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';
import { idAnonimo } from './sigilo-disputa.service';
import { DesconexaoPregoeiroService } from './desconexao-pregoeiro.service';
import { OrigemLance } from './modelo-lance';
import { ModoDisputaService } from './modo-disputa.service';

/**
 * ============================================================================
 * DISPUTA GATEWAY V2
 * ============================================================================
 *
 * WebSocket Gateway para comunicação em tempo real da Sala de Disputa
 * Baseado no modelo do Comprasnet
 *
 * CANAL ÚNICO (plano E2 item 8): absorveu os gateways `/dispensa` (feed da
 * licitação: `entrar_licitacao`, `painel_atualizado`, `chat`, `janela`) e
 * `/sessao` (chat on/off: `definir_chat`; os demais atos já eram do motor).
 * O namespace continua `/disputa-v2` para não quebrar clientes (renomear é E8).
 *
 * AUTORIZAÇÃO (E1a):
 *  - handshake autenticado (WsAutenticador): token inválido recusa a conexão;
 *  - identidade e papel vêm SÓ do token — `tipo`, `usuarioId` e `usuarioNome`
 *    do payload são ignorados (um `usuarioId` diferente do fornecedor do token
 *    é recusado com 'acesso_negado');
 *  - entrar na sala exige relação com a licitação: órgão dono / admin
 *    (PREGOEIRO) ou fornecedor com proposta válida (FORNECEDOR). Anônimo e
 *    logado sem relação: 'acesso_negado' (as telas da sala exigem login);
 *  - cada ação vale só para a sessão em que o cliente entrou;
 *  - broadcasts sem id/razão social/CNPJ de outros licitantes durante a
 *    disputa (código anônimo). Alertas do pregoeiro só para a sala do órgão.
 * ============================================================================
 */

interface ClienteConectado {
  socketId: string;
  sessaoId: string;
  licitacaoId: string;
  tipo: 'PREGOEIRO' | 'FORNECEDOR';
  /** Fornecedor: id do token. Pregoeiro: `sub` do token. */
  usuarioId: string;
  /** Nome real (para registro/ata) — NUNCA difundido aos outros durante a disputa. */
  usuarioNome: string;
}

/** Sala só do órgão dono (eventos com dados que não são públicos). */
export const salaOrgao = (sessaoId: string) => `sessao:${sessaoId}:orgao`;

/**
 * Sala PÚBLICA da licitação (feed anônimo — hoje: painel da janela de lances
 * da dispensa). Entram anônimo, órgão dono/admin e fornecedor com proposta
 * válida; logado sem relação é recusado. Só recebe dados públicos.
 */
export const salaLicitacao = (licitacaoId: string) => `licitacao:${licitacaoId}`;
/** Sala do órgão dono dentro do feed da licitação. */
export const salaLicitacaoOrgao = (licitacaoId: string) => `licitacao:${licitacaoId}:orgao`;
/**
 * Sala PRIVADA de um licitante na sessão (plano E3): só o socket do próprio
 * fornecedor (token) entra; o órgão dono recebe pela `salaOrgao`.
 */
export const salaFornecedor = (sessaoId: string, fornecedorId: string) => `sessao:${sessaoId}:fornecedor:${fornecedorId}`;

@WebSocketGateway({
  namespace: '/disputa',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class DisputaGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  private clientes: Map<string, ClienteConectado> = new Map();
  private readonly logger = new Logger(DisputaGateway.name);

  constructor(
    private readonly disputaService: DisputaService,
    private readonly wsAuth: WsAutenticador,
    private readonly acesso: AcessoLicitacaoService,
    private readonly sigilo: SigiloDisputaService,
    private readonly desconexao: DesconexaoPregoeiroService,
    private readonly modos: ModoDisputaService,
  ) {}

  afterInit(server: Namespace) {
    this.wsAuth.instalar(server);
    // Desconexão do agente (IN 73 art. 27): o verificador difunde a suspensão pela sala
    this.desconexao.definirEmissor((sala, evento, payload) => this.server?.to(sala).emit(evento, payload));
  }

  // ============================================================================
  // CONEXÃO / DESCONEXÃO
  // ============================================================================

  handleConnection(client: Socket) {
    console.log(`[Disputa-v2] Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[Disputa-v2] Cliente desconectado: ${client.id}`);
    const info = this.clientes.get(client.id);
    // Pregoeiro sem socket na sala: começa a contar a desconexão (IN 73 art. 27)
    if (info?.tipo === 'PREGOEIRO') this.desconexao.pregoeiroSaiu(info.sessaoId, client.id);
    this.clientes.delete(client.id);
  }

  /** Visão do cliente para os dados que ele recebe. */
  private visaoDe(info: ClienteConectado | undefined): VisaoDisputa {
    if (info?.tipo === 'PREGOEIRO') return { tipo: 'ORGAO' };
    if (info?.tipo === 'FORNECEDOR') return { tipo: 'FORNECEDOR', fornecedorId: info.usuarioId };
    return { tipo: 'PUBLICO' };
  }

  /** Cliente na sala desta sessão (qualquer papel) — senão emite 'erro'. */
  private clienteDaSessao(client: Socket, sessaoId: string | undefined): ClienteConectado | null {
    const info = this.clientes.get(client.id);
    if (!info || !sessaoId || info.sessaoId !== sessaoId) {
      client.emit('erro', { mensagem: 'Entre na sala desta sessão antes de agir' });
      return null;
    }
    return info;
  }

  /** Pregoeiro (órgão dono) na sala desta sessão — senão emite 'erro'. */
  private pregoeiroDaSessao(client: Socket, sessaoId: string | undefined, acao: string): ClienteConectado | null {
    const info = this.clientes.get(client.id);
    if (!info || info.tipo !== 'PREGOEIRO' || !sessaoId || info.sessaoId !== sessaoId) {
      client.emit('erro', { mensagem: `Apenas o pregoeiro pode ${acao}` });
      return null;
    }
    return info;
  }

  /**
   * Emite para cada cliente da sala os itens na visão dele. `extra` NÃO pode
   * levar identidade de licitante (vai igual a todos) — o item encerrado usa
   * `difundirItemEncerrado`.
   */
  async emitirItensPorVisao(sessaoId: string, licitacaoId: string | null, evento: string, extra: Record<string, any>) {
    const licId = licitacaoId || (await this.acesso.donoDaSessao(sessaoId))?.licitacaoId;
    if (!licId) return;
    const aplicar = await this.sigilo.aplicador(licId, sessaoId);
    const sockets = await this.server.in(`sessao:${sessaoId}`).fetchSockets();
    for (const s of sockets) {
      const visao = this.visaoDe(this.clientes.get(s.id));
      const itens = await this.disputaService.getItensPorStatus(
        sessaoId,
        visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : undefined,
        { visaoOrgao: visao.tipo === 'ORGAO' },
      );
      s.emit(evento, { ...extra, itens: aplicar(itens, visao) });
    }
  }

  /**
   * `item_encerrado` (plano E2 item 5): o vencedor só é identificado a quem não
   * é o órgão dono quando a etapa de lances da licitação INTEIRA terminou;
   * antes disso vai o código anônimo ("Fornecedor B"). O órgão dono recebe a
   * identidade sempre e, se houver, o aviso de reinício possível (art. 56 §4º).
   * Usado pelo socket, pelo relógio e pelo encerramento forçado do admin.
   */
  async difundirItemEncerrado(
    sessaoId: string,
    licitacaoId: string | null,
    itemId: string,
    resultado: ResultadoEncerramento,
    extra: Record<string, any> = {},
  ) {
    const licId = licitacaoId || (await this.acesso.donoDaSessao(sessaoId))?.licitacaoId || null;
    let vencedorPublico = resultado.vencedor;
    if (resultado.vencedor && !(licId && (await this.sigilo.etapaDeLancesEncerrada(licId)))) {
      const codigo = await this.disputaService.codigoAnonimoSeguro(sessaoId, resultado.vencedor.fornecedorId);
      vencedorPublico = { fornecedorId: idAnonimo(codigo), fornecedorNome: codigo, valor: resultado.vencedor.valor };
    }
    const aplicar = licId ? await this.sigilo.aplicador(licId, sessaoId) : null;
    const sockets = await this.server.in(`sessao:${sessaoId}`).fetchSockets();
    for (const s of sockets) {
      const visao = this.visaoDe(this.clientes.get(s.id));
      const itens = await this.disputaService.getItensPorStatus(
        sessaoId,
        visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : undefined,
        { visaoOrgao: visao.tipo === 'ORGAO' },
      );
      s.emit('item_encerrado', {
        ...extra,
        itemId,
        etapaDeLancesEncerrada: resultado.etapaDeLancesEncerrada,
        vencedor: visao.tipo === 'ORGAO' ? resultado.vencedor : vencedorPublico,
        itens: aplicar ? aplicar(itens, visao) : itens,
      });
    }
    if (resultado.alertaReinicio) {
      const a = resultado.alertaReinicio;
      this.server.to(salaOrgao(sessaoId)).emit('alerta_diferenca_5_porcento', {
        ...a,
        mensagem:
          `Item ${a.itemNumero}: a diferença entre o 1º e o 2º colocado é de ${a.diferencaPercentual.toFixed(2)}% ` +
          `(≥ ${a.percentualMinimo}%). A Administração poderá admitir o reinício da disputa aberta para as demais ` +
          `colocações (Lei 14.133/2021, art. 56 §4º).`,
      });
    }
  }

  /**
   * Difunde um lance JÁ GRAVADO. Nunca lança: falha aqui é registrada no log e
   * não pode transformar um lance válido em "erro" para o fornecedor (7b).
   */
  async difundirNovoLance(sessaoId: string, licitacaoId: string, lance: Lance): Promise<void> {
    // Lance final fechado (IN 73 art. 24 §2º): sigiloso até o fim do prazo — ninguém recebe
    // o valor; o órgão dono recebe só a CONTAGEM (o autor já recebeu 'lance_confirmado').
    if (lance.origem === OrigemLance.LANCE_FECHADO) {
      try {
        const unidade = lance.lote_id ?? lance.item_id;
        const total = await this.modos.contarLancesFechados(unidade);
        this.server?.to(salaOrgao(sessaoId)).emit('lance_fechado_recebido', { itemId: unidade, total });
      } catch (e: any) {
        this.logger.warn(`Contagem de lances fechados não difundida: ${e?.message ?? e}`);
      }
      return;
    }
    // Unidade de disputa: o lance do LOTE tem `item_id` nulo e `lote_id` (unidade-disputa.ts)
    const unidadeId = lance.lote_id ?? lance.item_id;
    try {
      const codigo = await this.disputaService.codigoAnonimoSeguro(sessaoId, lance.fornecedor_id);
      const aplicar = await this.sigilo.aplicador(licitacaoId, sessaoId);
      const lancesPublicos = await this.disputaService.getTodosLances(unidadeId, sessaoId);
      const clientesNaSala = await this.server.in(`sessao:${sessaoId}`).fetchSockets();
      for (const socketCliente of clientesNaSala) {
        try {
          const visao = this.visaoDe(this.clientes.get(socketCliente.id));
          const orgao = visao.tipo === 'ORGAO';
          const itensCliente = await this.disputaService.getItensPorStatus(
            sessaoId,
            visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : undefined,
            { visaoOrgao: orgao },
          );
          const lances = orgao
            ? await this.disputaService.getTodosLances(unidadeId, sessaoId, { visaoOrgao: true })
            : lancesPublicos;
          socketCliente.emit(
            'novo_lance',
            aplicar(
              {
                itemId: unidadeId,
                lance: {
                  id: lance.id,
                  valor: Number(lance.valor),
                  valorUnitario: lance.valor_unitario != null ? Number(lance.valor_unitario) : null,
                  valorTotal: lance.valor_total != null ? Number(lance.valor_total) : null,
                  origem: lance.origem,
                  fornecedorNome: codigo,
                  dataHora: lance.created_at,
                },
                lances,
                itens: itensCliente,
              },
              visao,
            ),
          );
        } catch (e: any) {
          this.logger.warn(`novo_lance não entregue a ${socketCliente.id}: ${e?.message ?? e}`);
        }
      }
    } catch (e: any) {
      this.logger.error(`Difusão do lance ${lance.id} falhou (o lance está gravado): ${e?.message ?? e}`);
    }
  }

  // ============================================================================
  // ENTRAR NA SALA
  // ============================================================================

  @SubscribeMessage('entrar_sala')
  async handleEntrarSala(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessaoId: string;
      /** Ignorados (legado): identidade e papel vêm do token. */
      tipo?: 'PREGOEIRO' | 'FORNECEDOR';
      usuarioId?: string;
      usuarioNome?: string;
    },
  ) {
    const sessaoId = data?.sessaoId;

    try {
      const ator = atorDoSocket(client);
      const negar = (mensagem: string, codigo: string) => {
        client.emit('acesso_negado', { mensagem, codigo });
        client.disconnect();
      };
      if (!ator) return negar('Faça login para entrar na sala de disputa.', 'NAO_AUTENTICADO');
      const dono = ehUuid(sessaoId) ? await this.acesso.donoDaSessao(sessaoId) : null;
      if (!dono) return negar('Sessão não encontrada.', 'SESSAO_INEXISTENTE');

      const relacao = await this.acesso.relacaoComLicitacao(ator, dono.licitacaoId);
      if (!relacao) return negar('Você não participa desta licitação.', 'SEM_RELACAO');

      let tipo: 'PREGOEIRO' | 'FORNECEDOR';
      let usuarioId: string;
      let usuarioNome: string;
      if (relacao === 'FORNECEDOR_PARTICIPANTE' && ehFornecedor(ator)) {
        // Um usuarioId declarado diferente do token é tentativa de agir por outro
        if (data?.usuarioId && data.usuarioId !== ator.fornecedorId) {
          console.log(`[Disputa-v2] ACESSO NEGADO: token de ${ator.fornecedorId} declarou usuarioId ${data.usuarioId}`);
          return negar('O fornecedor informado não confere com o usuário autenticado.', 'IDENTIDADE_DIVERGENTE');
        }
        // VALIDAÇÃO: Fornecedor deve ter proposta classificada
        const elegibilidade = await this.disputaService.verificarElegibilidadeFornecedor(sessaoId, ator.fornecedorId);
        if (!elegibilidade.elegivel) {
          return negar(elegibilidade.motivo || 'Sem proposta classificada.', 'SEM_PROPOSTA_CLASSIFICADA');
        }
        tipo = 'FORNECEDOR';
        usuarioId = ator.fornecedorId;
        usuarioNome = await this.disputaService.nomeDoFornecedor(ator.fornecedorId);
      } else {
        tipo = 'PREGOEIRO';
        usuarioId = ator.id;
        usuarioNome = (data?.usuarioNome && String(data.usuarioNome).slice(0, 120)) || 'Pregoeiro';
      }

      // Troca de sala: sai da anterior
      const anterior = this.clientes.get(client.id);
      if (anterior && anterior.sessaoId !== sessaoId) {
        client.leave(`sessao:${anterior.sessaoId}`);
        client.leave(salaOrgao(anterior.sessaoId));
        if (anterior.tipo === 'FORNECEDOR') client.leave(salaFornecedor(anterior.sessaoId, anterior.usuarioId));
      }

      this.clientes.set(client.id, {
        socketId: client.id,
        sessaoId,
        licitacaoId: dono.licitacaoId,
        tipo,
        usuarioId,
        usuarioNome,
      });

      client.join(`sessao:${sessaoId}`);
      if (tipo === 'PREGOEIRO') client.join(salaOrgao(sessaoId));
      if (tipo === 'FORNECEDOR') client.join(salaFornecedor(sessaoId, usuarioId));
      if (anterior?.tipo === 'PREGOEIRO' && anterior.sessaoId !== sessaoId) this.desconexao.pregoeiroSaiu(anterior.sessaoId, client.id);
      if (tipo === 'PREGOEIRO') this.desconexao.pregoeiroEntrou(sessaoId, client.id);

      console.log(`[Disputa-v2] ${tipo} entrou na sessão ${sessaoId}`);

      // Dados iniciais na visão do cliente
      const visao = this.visaoDe(this.clientes.get(client.id));
      const sessao = await this.disputaService.getSessao(sessaoId);
      const itens = await this.disputaService.getItensPorStatus(
        sessaoId,
        visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : undefined,
      );
      client.emit('dados_iniciais', await this.sigilo.aplicarVisao({ sessao, itens }, dono.licitacaoId, visao, { sessaoId }));

      // Notificar os outros — sem identidade do licitante
      client.to(`sessao:${sessaoId}`).emit('participante_entrou', {
        tipo,
        nome: tipo === 'PREGOEIRO' ? 'Pregoeiro' : 'Licitante',
      });
    } catch (error) {
      console.error(`[Disputa-v2] Erro ao entrar na sala:`, error.message);
      client.emit('erro', { mensagem: error.message });
    }
  }

  // ============================================================================
  // FEED PÚBLICO DA LICITAÇÃO (dispensa — absorve o antigo gateway /dispensa)
  // ============================================================================

  /**
   * Entra no feed da licitação (somente leitura). Regras (E1a): anônimo entra
   * (o painel da dispensa é público e anônimo); logado precisa ter relação
   * com a licitação (órgão dono/admin ou fornecedor com proposta válida) —
   * senão 'erro'. O órgão dono entra também na sala própria.
   */
  @SubscribeMessage('entrar_licitacao')
  async handleEntrarLicitacao(@ConnectedSocket() client: Socket, @MessageBody() data: { licitacaoId: string }) {
    const licitacaoId = data?.licitacaoId;
    if (!ehUuid(licitacaoId)) {
      client.emit('erro', { mensagem: 'Licitação inválida' });
      return;
    }
    const ator = atorDoSocket(client);
    let relacao: string | null = null;
    if (ator) {
      relacao = await this.acesso.relacaoComLicitacao(ator, licitacaoId);
      if (!relacao) {
        client.emit('erro', { mensagem: 'Acesso negado a esta sala' });
        return;
      }
    } else if (!(await this.acesso.orgaoDaLicitacao(licitacaoId))) {
      client.emit('erro', { mensagem: 'Licitação inválida' });
      return;
    }
    client.join(salaLicitacao(licitacaoId));
    if (relacao === 'ORGAO_DONO' || relacao === 'ADMIN') client.join(salaLicitacaoOrgao(licitacaoId));
    client.emit('sala_ok', { licitacaoId, server_time: new Date().toISOString() });
  }

  /** Dispensa: novo lance aceito → menor valor do item (anônimo). */
  emitirPainelDispensa(licitacaoId: string, item: { item_licitacao_id: string; menor_valor: number | null; total_lances: number }) {
    this.server?.to(salaLicitacao(licitacaoId)).emit('painel_atualizado', { ...item, server_time: new Date().toISOString() });
  }

  /** Dispensa: mensagem de chat (já na forma pública — anônima durante a janela). */
  emitirChatDispensa(licitacaoId: string, mensagem: Record<string, any>) {
    this.server?.to(salaLicitacao(licitacaoId)).emit('chat', mensagem);
  }

  /** Dispensa: janela aberta / prorrogada / encerrada. */
  emitirJanelaDispensa(
    licitacaoId: string,
    janela: { dispensa_lances_inicio: Date | null; dispensa_lances_fim: Date | null; aberta: boolean },
  ) {
    this.server?.to(salaLicitacao(licitacaoId)).emit('janela', { ...janela, server_time: new Date().toISOString() });
  }

  // ============================================================================
  // AÇÕES DO PREGOEIRO
  // ============================================================================

  /** Liga/desliga o chat dos licitantes (antigo `toggle_chat` da sala /sessao). */
  @SubscribeMessage('definir_chat')
  async handleDefinirChat(@ConnectedSocket() client: Socket, @MessageBody() data: { sessaoId: string; habilitado: boolean }) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'habilitar/desabilitar o chat');
    if (!info) return;
    try {
      await this.disputaService.definirChat(data.sessaoId, !!data.habilitado);
      this.server.to(`sessao:${data.sessaoId}`).emit('chat_status', {
        habilitado: !!data.habilitado,
        mensagem: data.habilitado ? 'Chat habilitado pelo pregoeiro' : 'Chat desabilitado pelo pregoeiro',
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('iniciar_itens')
  async handleIniciarItens(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; itensIds: string[] },
  ) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'iniciar itens');
    if (!info) return;

    try {
      const resultado = await this.disputaService.iniciarDisputa(
        data.sessaoId,
        Array.isArray(data.itensIds) ? data.itensIds : [],
        atorTransicaoDe(atorDoSocket(client)),
      );
      await this.emitirItensPorVisao(data.sessaoId, info.licitacaoId, 'itens_iniciados', {
        itensIniciados: resultado.itensIniciados,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('encerrar_item')
  async handleEncerrarItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; itemId: string },
  ) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'encerrar itens');
    if (!info) return;

    try {
      const resultado = await this.disputaService.encerrarItem(data.sessaoId, data.itemId, atorTransicaoDe(atorDoSocket(client)));
      await this.difundirItemEncerrado(data.sessaoId, info.licitacaoId, data.itemId, resultado);
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('suspender_sessao')
  async handleSuspenderSessao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessaoId: string;
      motivo: 'ADMINISTRATIVO' | 'CAUTELAR' | 'JUDICIAL';
      justificativa: string;
      dataReabertura?: string;
    },
  ) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'suspender a sessão');
    if (!info) return;

    try {
      await this.disputaService.suspenderSessao(
        data.sessaoId,
        data.motivo,
        data.justificativa,
        data.dataReabertura ? new Date(data.dataReabertura) : undefined,
      );

      const sessao = await this.disputaService.getSessao(data.sessaoId);

      this.server.to(`sessao:${data.sessaoId}`).emit('sessao_suspensa', {
        sessao,
        motivo: data.motivo,
        justificativa: data.justificativa,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('retomar_sessao')
  async handleRetomarSessao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string },
  ) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'retomar a sessão');
    if (!info) return;

    try {
      await this.disputaService.retomarSessao(data.sessaoId);

      const sessao = await this.disputaService.getSessao(data.sessaoId);

      this.server.to(`sessao:${data.sessaoId}`).emit('sessao_retomada', {
        sessao,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('reiniciar_sessao')
  async handleReiniciarSessao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; justificativa: string },
  ) {
    const info = this.pregoeiroDaSessao(client, data?.sessaoId, 'reiniciar a sessão');
    if (!info) return;

    try {
      const resultado = await this.disputaService.reiniciarSessao(
        data.sessaoId,
        data.justificativa,
        atorTransicaoDe(atorDoSocket(client)),
      );

      const sessao = await this.disputaService.getSessao(data.sessaoId);
      await this.emitirItensPorVisao(data.sessaoId, info.licitacaoId, 'sessao_reiniciada', {
        sessao,
        lancesCancelados: resultado.lancesCancelados,
        itensReiniciados: resultado.itensReiniciados,
        snapshotId: resultado.snapshotId,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('enviar_mensagem')
  async handleEnviarMensagem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; conteudo: string },
  ) {
    const info = this.clienteDaSessao(client, data?.sessaoId);
    if (!info) return;
    const conteudo = typeof data.conteudo === 'string' ? data.conteudo.trim() : '';
    if (!conteudo) {
      client.emit('erro', { mensagem: 'Mensagem vazia' });
      return;
    }

    try {
      // Registro com o nome real (ata) no único armazenamento (eventos da sessão);
      // difusão com o código anônimo do fornecedor. Chat desabilitado → 'erro'.
      const evento = await this.disputaService.enviarMensagem(
        data.sessaoId,
        info.tipo === 'FORNECEDOR'
          ? { tipo: 'FORNECEDOR', nome: info.usuarioNome, fornecedorId: info.usuarioId }
          : { tipo: 'PREGOEIRO', nome: info.usuarioNome, usuarioId: info.usuarioId },
        conteudo,
      );

      let remetente = info.usuarioNome;
      if (info.tipo === 'FORNECEDOR') {
        remetente = await this.disputaService.codigoAnonimoSeguro(data.sessaoId, info.usuarioId);
      }

      this.server.to(`sessao:${data.sessaoId}`).emit('nova_mensagem', {
        id: evento.id,
        tipo: info.tipo === 'PREGOEIRO' ? 'PREGOEIRO' : 'FORNECEDOR',
        remetente,
        conteudo,
        dataHora: evento.created_at,
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  // ============================================================================
  // AÇÕES DO FORNECEDOR
  // ============================================================================

  @SubscribeMessage('enviar_lance')
  async handleEnviarLance(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessaoId: string;
      /** Id da unidade de disputa: item, ou lote na disputa por lote. */
      itemId: string;
      loteId?: string;
      valor: number;
    },
  ) {
    const info = this.clientes.get(client.id);
    if (!info || info.tipo !== 'FORNECEDOR') {
      client.emit('erro', { mensagem: 'Apenas fornecedores podem enviar lances' });
      return;
    }
    if (data?.sessaoId !== info.sessaoId) {
      client.emit('erro', { mensagem: 'Entre na sala desta sessão antes de dar lance' });
      return;
    }

    let lance: Lance;
    try {
      lance = await this.disputaService.registrarLance({
        sessaoId: data.sessaoId,
        itemId: data.loteId ?? data.itemId,
        loteId: data.loteId,
        fornecedorId: info.usuarioId,
        valor: Number(data.valor),
        ip: client.handshake.address,
      });
    } catch (error) {
      // Recusa do motor: o lance NÃO foi gravado
      client.emit('erro', { mensagem: error.message });
      return;
    }

    // Gravado: confirma ANTES de difundir — nada depois disto vira "erro" (simulador 7b)
    client.emit('lance_confirmado', { itemId: data.loteId ?? data.itemId, lanceId: lance.id, valor: Number(lance.valor) });
    await this.difundirNovoLance(data.sessaoId, info.licitacaoId, lance);
  }

  // ============================================================================
  // BUSCAR DADOS
  // ============================================================================

  /**
   * Lances de um item da sessão em que o cliente está. A fase do item (e,
   * portanto, se as identidades podem aparecer) vem do servidor — o antigo
   * `itemEncerrado` do payload é ignorado.
   */
  @SubscribeMessage('buscar_lances_item')
  async handleBuscarLancesItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { itemId: string; tipo: 'propostas' | 'melhores' | 'todos' },
  ) {
    const info = this.clientes.get(client.id);
    if (!info) {
      client.emit('erro', { mensagem: 'Entre na sala antes de consultar lances' });
      return;
    }

    try {
      const dono = await this.acesso.donoDaUnidade(data?.itemId);
      if (!dono || dono.licitacaoId !== info.licitacaoId) {
        client.emit('erro', { mensagem: 'Item não pertence a esta sessão' });
        return;
      }
      const visao = this.visaoDe(info);
      const opts = { visaoOrgao: visao.tipo === 'ORGAO' };
      let resultado;

      switch (data.tipo) {
        case 'propostas':
          resultado = await this.disputaService.getPropostasIniciais(data.itemId, info.sessaoId, opts);
          break;
        case 'melhores':
          resultado = await this.disputaService.getMelhoresValoresPorFornecedor(data.itemId, info.sessaoId, opts);
          break;
        case 'todos':
        default:
          resultado = await this.disputaService.getTodosLances(data.itemId, info.sessaoId, opts);
      }

      const reveladas = await this.sigilo.identidadesReveladasNoItem(data.itemId);
      client.emit('lances_item', {
        itemId: data.itemId,
        tipo: data.tipo,
        dados: await this.sigilo.aplicarVisao(resultado, info.licitacaoId, visao, {
          sessaoId: info.sessaoId,
          identidades: !reveladas,
        }),
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  @SubscribeMessage('buscar_mensagens')
  async handleBuscarMensagens(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string },
  ) {
    const info = this.clienteDaSessao(client, data?.sessaoId);
    if (!info) return;
    try {
      const mensagens = await this.disputaService.getMensagens(data.sessaoId);
      const reveladas = await this.sigilo.identidadesReveladas(data.sessaoId);

      client.emit('mensagens', {
        mensagens: await this.sigilo.aplicarVisao(mensagens, info.licitacaoId, this.visaoDe(info), {
          sessaoId: data.sessaoId,
          identidades: !reveladas,
        }),
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  // ============================================================================
  // ATUALIZAÇÃO PERIÓDICA (TIMER)
  // ============================================================================

  @SubscribeMessage('solicitar_atualizacao')
  async handleSolicitarAtualizacao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string },
  ) {
    const info = this.clienteDaSessao(client, data?.sessaoId);
    if (!info) return;
    try {
      const visao = this.visaoDe(info);
      const itens = await this.disputaService.getItensPorStatus(
        data.sessaoId,
        visao.tipo === 'FORNECEDOR' ? visao.fornecedorId : undefined,
      );

      client.emit('atualizacao_itens', {
        itens: await this.sigilo.aplicarVisao(itens, info.licitacaoId, visao, { sessaoId: data.sessaoId }),
      });
    } catch (error) {
      client.emit('erro', { mensagem: error.message });
    }
  }
}
