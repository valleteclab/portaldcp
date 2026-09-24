import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { SessaoService } from './sessao.service';
import { DisputaService } from '../disputa-v2/disputa.service';
import { WsAutenticador, atorDoSocket } from '../auth/acesso/ws-autenticador';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { SigiloDisputaService, VisaoDisputa } from '../disputa-v2/sigilo-disputa.service';
import { licitacaoParaPublico } from '../licitacoes/licitacao-visao.util';
import { atorTransicaoDe } from '../licitacoes/transicoes/transicoes.tipos';

/**
 * Gateway WebSocket da sala /sessao (legado — será substituído pelo motor
 * único na E2).
 *
 * AUTORIZAÇÃO (E1a):
 *  - handshake autenticado (WsAutenticador): token inválido recusa a conexão;
 *    papel e identidade vêm SÓ do token (`tipo`, `participante`, `isPregoeiro`,
 *    `fornecedorId` do payload são ignorados);
 *  - entrar_sessao: órgão dono / admin (pregoeiro), fornecedor com proposta
 *    válida, ou ANÔNIMO em modo só leitura (feed público anonimizado); logado
 *    sem relação com a licitação é recusado ('erro');
 *  - atos do pregoeiro (iniciar, itens, encerrar, suspender, alterar fase,
 *    reiniciar, chat on/off) só para o órgão dono na sala — itens, encerrar e
 *    reiniciar delegam ao motor único (disputa-v2). O antigo repasse de
 *    cronômetro do cliente (`sync_cronometro`) foi removido na E2: o único
 *    relógio é o DisputaTimerService;
 *  - LANCE por esta sala (enviar_lance / enviar_lance_lote): DESATIVADO
 *    ('erro_lance') — duplicava o lance da disputa-v2;
 *  - chat: pregoeiro (dono) ou fornecedor participante; o remetente difundido
 *    é o código anônimo do fornecedor, sem id;
 *  - tudo o que é difundido aos não-donos passa pela anonimização dos
 *    licitantes (SigiloDisputaService). O órgão dono recebe na sala própria.
 */
interface ClienteSessao {
  sessaoId: string;
  licitacaoId: string;
  papel: 'PREGOEIRO' | 'FORNECEDOR' | 'PUBLICO';
  fornecedorId: string | null;
}

const salaOrgao = (sessaoId: string) => `${sessaoId}:orgao`;

@WebSocketGateway({
  cors: true,
  namespace: '/sessao'
})
export class SessaoGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Namespace;

  private clientes = new Map<string, ClienteSessao>();

  constructor(
    private readonly sessaoService: SessaoService,
    private readonly wsAuth: WsAutenticador,
    private readonly acesso: AcessoLicitacaoService,
    private readonly sigilo: SigiloDisputaService,
    private readonly disputa: DisputaService,
  ) {}

  afterInit(server: Namespace) {
    this.wsAuth.instalar(server);
  }

  handleConnection(client: Socket) {
    console.log(`[Sessao] Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[Sessao] Cliente desconectado: ${client.id}`);
    this.clientes.delete(client.id);
  }

  private visaoDe(info: ClienteSessao | undefined): VisaoDisputa {
    if (info?.papel === 'PREGOEIRO') return { tipo: 'ORGAO' };
    if (info?.papel === 'FORNECEDOR' && info.fornecedorId) return { tipo: 'FORNECEDOR', fornecedorId: info.fornecedorId };
    return { tipo: 'PUBLICO' };
  }

  /** Entidade da sessão sem dados não públicos (licitação na visão pública, sem melhor lance). */
  private sessaoPublica(sessao: any): any {
    if (!sessao || typeof sessao !== 'object') return sessao;
    const s: any = { ...sessao };
    if (s.licitacao) s.licitacao = licitacaoParaPublico(s.licitacao);
    if (s.item_atual) s.item_atual = { ...s.item_atual, melhor_lance_fornecedor_id: null };
    return s;
  }

  /**
   * Difunde na sala: o órgão dono recebe o payload completo (sala própria);
   * os demais, a versão pública anonimizada.
   */
  private async difundir(sessaoId: string, evento: string, payload: any) {
    const info = [...this.clientes.values()].find((c) => c.sessaoId === sessaoId);
    const licitacaoId = info?.licitacaoId || (await this.acesso.donoDaSessao(sessaoId))?.licitacaoId;
    if (!licitacaoId) return;
    this.server.to(salaOrgao(sessaoId)).emit(evento, payload);
    const publico = await this.sigilo.aplicarVisao(this.publicoDe(payload), licitacaoId, { tipo: 'PUBLICO' }, { sessaoId });
    this.server.to(sessaoId).except(salaOrgao(sessaoId)).emit(evento, publico);
  }

  /** Aplica `sessaoPublica` a qualquer `sessao` do payload (ou ao próprio payload, se for a sessão). */
  private publicoDe(payload: any): any {
    if (!payload || typeof payload !== 'object') return payload;
    if ('licitacao_id' in payload && 'etapa' in payload) return this.sessaoPublica(payload);
    if (payload.sessao) return { ...payload, sessao: this.sessaoPublica(payload.sessao) };
    return payload;
  }

  /** Pregoeiro (órgão dono) na sala desta sessão — senão 'erro'. */
  private exigirPregoeiro(client: Socket, sessaoId: string | undefined): ClienteSessao | null {
    const info = this.clientes.get(client.id);
    if (!info || info.papel !== 'PREGOEIRO' || !sessaoId || info.sessaoId !== sessaoId) {
      client.emit('erro', { mensagem: 'Apenas o pregoeiro da sessão pode executar esta ação' });
      return null;
    }
    return info;
  }

  /**
   * Fornecedor ou Pregoeiro entra na sala da sessao (papel pelo token).
   */
  @SubscribeMessage('entrar_sessao')
  async handleEntrarSessao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; participante?: string; tipo?: 'PREGOEIRO' | 'FORNECEDOR' }
  ) {
    const sessaoId = data?.sessaoId;
    const dono = ehUuid(sessaoId) ? await this.acesso.donoDaSessao(sessaoId) : null;
    if (!dono) {
      client.emit('erro', { mensagem: 'Sessão não encontrada' });
      return;
    }

    const ator = atorDoSocket(client);
    let papel: ClienteSessao['papel'] = 'PUBLICO';
    if (ator) {
      const relacao = await this.acesso.relacaoComLicitacao(ator, dono.licitacaoId);
      if (!relacao) {
        client.emit('erro', { mensagem: 'Acesso negado a esta sessão' });
        return;
      }
      papel = relacao === 'FORNECEDOR_PARTICIPANTE' ? 'FORNECEDOR' : 'PREGOEIRO';
    }

    const info: ClienteSessao = {
      sessaoId,
      licitacaoId: dono.licitacaoId,
      papel,
      fornecedorId: papel === 'FORNECEDOR' ? ator!.fornecedorId : null,
    };
    this.clientes.set(client.id, info);
    client.join(sessaoId);
    if (papel === 'PREGOEIRO') client.join(salaOrgao(sessaoId));
    console.log(`[Sessao] ${papel} entrou na sessao ${sessaoId}`);

    const visao = this.visaoDe(info);

    // Envia estado atual da sessao
    const sessao = await this.sessaoService.getSessao(sessaoId);
    client.emit(
      'estado_sessao',
      visao.tipo === 'ORGAO'
        ? sessao
        : await this.sigilo.aplicarVisao(this.sessaoPublica(sessao), dono.licitacaoId, visao, { sessaoId }),
    );

    // Envia historico de eventos
    const eventos = await this.sessaoService.getEventosSessao(sessaoId);
    const reveladas = await this.sigilo.identidadesReveladas(sessaoId);
    client.emit(
      'historico_eventos',
      await this.sigilo.aplicarVisao(eventos, dono.licitacaoId, visao, { sessaoId, identidades: !reveladas }),
    );

    // Notifica outros participantes — sem identidade
    client.to(sessaoId).emit('participante_entrou', {
      participante: papel === 'PREGOEIRO' ? 'Pregoeiro' : papel === 'FORNECEDOR' ? 'Licitante' : 'Visitante',
      tipo: papel === 'PREGOEIRO' ? 'PREGOEIRO' : 'FORNECEDOR',
      horario: new Date()
    });
  }

  /**
   * Pregoeiro inicia a sessao
   */
  @SubscribeMessage('iniciar_sessao')
  async handleIniciarSessao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string }
  ) {
    if (!this.exigirPregoeiro(client, data?.sessaoId)) return;
    try {
      const sessao = await this.sessaoService.iniciarSessao(data.sessaoId, atorTransicaoDe(atorDoSocket(client)));
      await this.difundir(data.sessaoId, 'sessao_iniciada', sessao);
      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'info',
        mensagem: 'Sessao publica iniciada pelo Pregoeiro'
      });
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  /**
   * Pregoeiro avanca para etapa de disputa
   */
  @SubscribeMessage('iniciar_disputa')
  async handleIniciarDisputa(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string }
  ) {
    if (!this.exigirPregoeiro(client, data?.sessaoId)) return;
    try {
      const sessao = await this.sessaoService.avancarParaDisputa(data.sessaoId, atorTransicaoDe(atorDoSocket(client)));
      await this.difundir(data.sessaoId, 'disputa_iniciada', sessao);
      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'alerta',
        mensagem: 'ETAPA DE LANCES INICIADA! Enviem seus lances.'
      });
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  /**
   * Pregoeiro inicia disputa de um item especifico
   */
  @SubscribeMessage('iniciar_item')
  async handleIniciarItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; itemId: string }
  ) {
    const info = this.exigirPregoeiro(client, data?.sessaoId);
    if (!info) return;
    try {
      const item = await this.acesso.donoDoItem(data.itemId);
      if (!item || item.licitacaoId !== info.licitacaoId) throw new Error('Item não pertence a esta sessão');
      const sessao = await this.sessaoService.iniciarDisputaItem(data.sessaoId, data.itemId, atorTransicaoDe(atorDoSocket(client)));
      await this.difundir(data.sessaoId, 'item_em_disputa', {
        sessao,
        itemId: data.itemId
      });
      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'alerta',
        mensagem: `Disputa do item iniciada. Enviem seus lances!`
      });
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  /**
   * Pregoeiro inicia disputa conforme configuração da licitação
   * - POR_ITEM: Cada item tem seu próprio cronômetro
   * - POR_LOTE: Cada lote tem seu próprio cronômetro
   */
  @SubscribeMessage('iniciar_todos_itens')
  async handleIniciarTodosItens(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string }
  ) {
    if (!this.exigirPregoeiro(client, data?.sessaoId)) return;
    try {
      const resultado = await this.sessaoService.iniciarDisputaTodosItens(data.sessaoId, atorTransicaoDe(atorDoSocket(client)));
      await this.difundir(data.sessaoId, 'disputa_iniciada', {
        sessao: resultado.sessao,
        itensIniciados: resultado.itensIniciados,
        lotesIniciados: resultado.lotesIniciados,
        tipoDisputa: resultado.tipoDisputa
      });

      const mensagem = resultado.tipoDisputa === 'POR_LOTE'
        ? `Disputa iniciada para ${resultado.lotesIniciados} lote(s) (${resultado.itensIniciados} itens). Enviem seus lances!`
        : `Disputa iniciada para ${resultado.itensIniciados} item(ns). Enviem seus lances!`;

      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'alerta',
        mensagem
      });
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  /**
   * Pregoeiro inicia itens selecionados
   */
  @SubscribeMessage('iniciar_itens_selecionados')
  async handleIniciarItensSelecionados(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; itensIds: string[] }
  ) {
    const info = this.exigirPregoeiro(client, data?.sessaoId);
    if (!info) return;
    try {
      const itensIds: string[] = [];
      for (const id of Array.isArray(data.itensIds) ? data.itensIds : []) {
        const item = await this.acesso.donoDoItem(id);
        if (item && item.licitacaoId === info.licitacaoId) itensIds.push(id);
      }
      const resultado = await this.sessaoService.iniciarItensSelecionados(data.sessaoId, itensIds, atorTransicaoDe(atorDoSocket(client)));
      this.server.to(data.sessaoId).emit('itens_selecionados_iniciados', {
        itensIniciados: resultado.itensIniciados,
        itensIds
      });

      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'alerta',
        mensagem: `Disputa iniciada para ${resultado.itensIniciados} item(ns) selecionados.`
      });
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  /**
   * Lance por esta sala — DESATIVADO (E1a). Duplicava o registro de lance da
   * disputa-v2 (sem trava e com o fornecedor vindo do payload). Use a sala de
   * disputa (/disputa-v2). O motor único vem na E2.
   */
  @SubscribeMessage('enviar_lance')
  handleEnviarLance(@ConnectedSocket() client: Socket) {
    client.emit('erro_lance', {
      mensagem: 'Lance por esta sala foi desativado. Use a sala de disputa (disputa-v2).',
    });
  }

  /** Lance por LOTE por esta sala — DESATIVADO (ver enviar_lance). */
  @SubscribeMessage('enviar_lance_lote')
  handleEnviarLanceLote(@ConnectedSocket() client: Socket) {
    client.emit('erro_lance', {
      mensagem: 'Lance por esta sala foi desativado. Use a sala de disputa (disputa-v2).',
    });
  }

  /**
   * Pregoeiro encerra disputa do item
   */
  @SubscribeMessage('encerrar_item')
  async handleEncerrarItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; itemId?: string }
  ) {
    const info = this.exigirPregoeiro(client, data?.sessaoId);
    if (!info) return;
    try {
      if (data.itemId) {
        const item = await this.acesso.donoDoItem(data.itemId);
        if (!item || item.licitacaoId !== info.licitacaoId) throw new Error('Item não pertence a esta sessão');
      }
      const resultado = await this.sessaoService.encerrarDisputaItemPorId(data.sessaoId, data.itemId, atorTransicaoDe(atorDoSocket(client)));
      await this.difundir(data.sessaoId, 'item_encerrado', resultado);
      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'info',
        mensagem: `Disputa do item ${resultado.itemNumero || ''} encerrada`
      });
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  /**
   * Pregoeiro suspende a sessao
   */
  @SubscribeMessage('suspender_sessao')
  async handleSuspenderSessao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; motivo: string }
  ) {
    if (!this.exigirPregoeiro(client, data?.sessaoId)) return;
    try {
      const sessao = await this.sessaoService.suspenderSessao(data.sessaoId, data.motivo);
      await this.difundir(data.sessaoId, 'sessao_suspensa', {
        sessao,
        motivo: data.motivo
      });
      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'alerta',
        mensagem: `Sessao SUSPENSA. Motivo: ${data.motivo}`
      });
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  /**
   * Pregoeiro altera a fase/etapa da sessão
   */
  @SubscribeMessage('alterar_fase')
  async handleAlterarFase(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; novaEtapa: string; novoStatus?: string; motivo?: string }
  ) {
    if (!this.exigirPregoeiro(client, data?.sessaoId)) return;
    try {
      const sessao = await this.sessaoService.alterarFaseSessao(
        data.sessaoId,
        data.novaEtapa as any,
        data.novoStatus as any,
        data.motivo
      );
      await this.difundir(data.sessaoId, 'fase_alterada', {
        sessao,
        novaEtapa: data.novaEtapa,
        novoStatus: sessao.status
      });
      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'info',
        mensagem: `Fase alterada para: ${data.novaEtapa}`
      });
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  /**
   * Pregoeiro reinicia a disputa (reseta todos os itens)
   */
  @SubscribeMessage('reiniciar_disputa')
  async handleReiniciarDisputa(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; motivo?: string }
  ) {
    if (!this.exigirPregoeiro(client, data?.sessaoId)) return;
    try {
      const sessao = await this.sessaoService.reiniciarDisputa(data.sessaoId, data.motivo, atorTransicaoDe(atorDoSocket(client)));
      await this.difundir(data.sessaoId, 'disputa_reiniciada', { sessao });
      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'alerta',
        mensagem: 'Disputa reiniciada pelo pregoeiro (lances cancelados, sem exclusão; retrato da sessão preservado). Todos os itens voltaram para aguardando.'
      });
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  /**
   * Mensagem no chat: pregoeiro (órgão dono) ou fornecedor participante.
   * Papel e identidade pelo token; o nome real fica registrado (ata) e a
   * difusão leva o código anônimo do fornecedor, sem id.
   */
  @SubscribeMessage('mensagem_chat')
  async handleMensagemChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessaoId: string;
      remetente?: string;
      mensagem: string;
      /** Ignorados (legado): papel e identidade vêm do token. */
      isPregoeiro?: boolean;
      fornecedorId?: string;
    }
  ) {
    const info = this.clientes.get(client.id);
    if (!info || info.sessaoId !== data?.sessaoId || info.papel === 'PUBLICO') {
      client.emit('erro', { mensagem: 'Entre na sessão com login para usar o chat' });
      return;
    }
    const texto = typeof data.mensagem === 'string' ? data.mensagem.trim() : '';
    if (!texto) return;

    const isPregoeiro = info.papel === 'PREGOEIRO';
    const sessao = await this.sessaoService.getSessao(data.sessaoId);
    const remetenteReal = isPregoeiro
      ? (typeof data.remetente === 'string' && data.remetente.trim().slice(0, 120)) || sessao.pregoeiro_nome || 'Pregoeiro'
      : (await this.sigilo.nomeDoFornecedor(info.fornecedorId!)) || 'Fornecedor';

    // Armazenamento ÚNICO do chat (eventos da sessão, pelo motor) — respeita chat_desabilitado
    try {
      await this.disputa.enviarMensagem(
        data.sessaoId,
        isPregoeiro
          ? { tipo: 'PREGOEIRO', nome: remetenteReal }
          : { tipo: 'FORNECEDOR', nome: remetenteReal, fornecedorId: info.fornecedorId! },
        texto,
      );
    } catch (error: any) {
      if (!isPregoeiro && sessao.chat_desabilitado) {
        client.emit('chat_bloqueado', { mensagem: 'O chat está temporariamente desabilitado pelo pregoeiro.' });
      } else {
        client.emit('erro', { mensagem: error.message });
      }
      return;
    }

    const remetenteExibicao = isPregoeiro
      ? 'PREGOEIRO'
      : await this.sigilo.codigoDe(data.sessaoId, info.fornecedorId!);

    // Emitir para todos os participantes — sem id do fornecedor
    this.server.to(data.sessaoId).emit('nova_mensagem', {
      remetente: remetenteExibicao,
      mensagem: texto,
      isPregoeiro,
      horario: new Date(),
    });
  }

  /**
   * Pregoeiro habilita/desabilita o chat
   */
  @SubscribeMessage('toggle_chat')
  async handleToggleChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; habilitado: boolean }
  ) {
    if (!this.exigirPregoeiro(client, data?.sessaoId)) return;
    try {
      await this.sessaoService.toggleChat(data.sessaoId, !!data.habilitado);
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
      return;
    }

    // Notificar todos os participantes
    this.server.to(data.sessaoId).emit('chat_status', {
      habilitado: !!data.habilitado,
      mensagem: data.habilitado ? 'Chat habilitado pelo pregoeiro' : 'Chat desabilitado pelo pregoeiro'
    });
  }
}
