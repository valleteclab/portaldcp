import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { SessaoService } from './sessao.service';

/**
 * Gateway WebSocket para Sala de Disputa em Tempo Real
 * Implementa comunicacao bidirecional para pregao eletronico
 */
@WebSocketGateway({ 
  cors: true,
  namespace: '/sessao'
})
export class SessaoGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  constructor(private readonly sessaoService: SessaoService) {}

  handleConnection(client: Socket) {
    console.log(`[Sessao] Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[Sessao] Cliente desconectado: ${client.id}`);
  }

  /**
   * Fornecedor ou Pregoeiro entra na sala da sessao
   */
  @SubscribeMessage('entrar_sessao')
  async handleEntrarSessao(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; participante: string; tipo: 'PREGOEIRO' | 'FORNECEDOR' }
  ) {
    client.join(data.sessaoId);
    console.log(`[Sessao] ${data.tipo} ${data.participante} entrou na sessao ${data.sessaoId}`);

    // Envia estado atual da sessao
    const sessao = await this.sessaoService.getSessao(data.sessaoId);
    client.emit('estado_sessao', sessao);

    // Envia historico de eventos
    const eventos = await this.sessaoService.getEventosSessao(data.sessaoId);
    client.emit('historico_eventos', eventos);

    // Notifica outros participantes
    client.to(data.sessaoId).emit('participante_entrou', {
      participante: data.participante,
      tipo: data.tipo,
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
    try {
      const sessao = await this.sessaoService.iniciarSessao(data.sessaoId);
      this.server.to(data.sessaoId).emit('sessao_iniciada', sessao);
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
    try {
      const sessao = await this.sessaoService.avancarParaDisputa(data.sessaoId);
      this.server.to(data.sessaoId).emit('disputa_iniciada', sessao);
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
    try {
      const sessao = await this.sessaoService.iniciarDisputaItem(data.sessaoId, data.itemId);
      this.server.to(data.sessaoId).emit('item_em_disputa', {
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
    try {
      const resultado = await this.sessaoService.iniciarDisputaTodosItens(data.sessaoId);
      this.server.to(data.sessaoId).emit('disputa_iniciada', {
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
    try {
      const resultado = await this.sessaoService.iniciarItensSelecionados(data.sessaoId, data.itensIds);
      this.server.to(data.sessaoId).emit('itens_selecionados_iniciados', {
        itensIniciados: resultado.itensIniciados,
        itensIds: data.itensIds
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
   * Fornecedor envia lance
   */
  @SubscribeMessage('enviar_lance')
  async handleEnviarLance(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { 
      sessaoId: string; 
      itemId: string; 
      fornecedorId: string;
      fornecedorNome: string;
      valor: number 
    }
  ) {
    const ip = client.handshake.address;

    try {
      const lance = await this.sessaoService.registrarLance(
        data.sessaoId,
        data.itemId,
        data.fornecedorId,
        data.fornecedorNome,
        data.valor,
        ip
      );

      // Broadcast do novo lance para todos na sala
      this.server.to(data.sessaoId).emit('novo_lance', {
        lance,
        fornecedor: data.fornecedorNome.substring(0, 4) + '***', // Anonimiza
        valor: data.valor,
        horario: new Date()
      });

      // Atualiza cronometro (reset do tempo de inatividade)
      this.server.to(data.sessaoId).emit('cronometro_reset');

    } catch (error: any) {
      client.emit('erro_lance', { mensagem: error.message });
    }
  }

  /**
   * Fornecedor envia lance por LOTE (valor total)
   */
  @SubscribeMessage('enviar_lance_lote')
  async handleEnviarLanceLote(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { 
      sessaoId: string; 
      loteId: string; 
      fornecedorId: string;
      fornecedorNome: string;
      valorTotal: number 
    }
  ) {
    const ip = client.handshake.address;

    try {
      const resultado = await this.sessaoService.registrarLanceLote(
        data.sessaoId,
        data.loteId,
        data.fornecedorId,
        data.fornecedorNome,
        data.valorTotal,
        ip
      );

      // Broadcast do novo lance para todos na sala
      this.server.to(data.sessaoId).emit('novo_lance_lote', {
        loteId: data.loteId,
        fornecedor: data.fornecedorNome.substring(0, 4) + '***', // Anonimiza
        valorTotal: data.valorTotal,
        quantidadeItens: resultado.lances.length,
        horario: new Date()
      });

      // Atualiza cronometro (reset do tempo de inatividade)
      this.server.to(data.sessaoId).emit('cronometro_reset');

    } catch (error: any) {
      client.emit('erro_lance', { mensagem: error.message });
    }
  }

  /**
   * Pregoeiro encerra disputa do item
   */
  @SubscribeMessage('encerrar_item')
  async handleEncerrarItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; itemId?: string }
  ) {
    try {
      const resultado = await this.sessaoService.encerrarDisputaItemPorId(data.sessaoId, data.itemId);
      this.server.to(data.sessaoId).emit('item_encerrado', resultado);
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
    try {
      const sessao = await this.sessaoService.suspenderSessao(data.sessaoId, data.motivo);
      this.server.to(data.sessaoId).emit('sessao_suspensa', {
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
    try {
      const sessao = await this.sessaoService.alterarFaseSessao(
        data.sessaoId, 
        data.novaEtapa as any,
        data.novoStatus as any,
        data.motivo
      );
      this.server.to(data.sessaoId).emit('fase_alterada', {
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
    try {
      const sessao = await this.sessaoService.reiniciarDisputa(data.sessaoId, data.motivo);
      this.server.to(data.sessaoId).emit('disputa_reiniciada', { sessao });
      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'alerta',
        mensagem: 'Disputa reiniciada pelo pregoeiro. Todos os itens voltaram para aguardando.'
      });
    } catch (error: any) {
      client.emit('erro', { mensagem: error.message });
    }
  }

  /**
   * Pregoeiro envia mensagem no chat
   */
  @SubscribeMessage('mensagem_chat')
  async handleMensagemChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { 
      sessaoId: string; 
      remetente: string; 
      mensagem: string; 
      isPregoeiro: boolean;
      fornecedorId?: string;
    }
  ) {
    // Verificar se o chat está habilitado
    const sessao = await this.sessaoService.getSessao(data.sessaoId);
    if (!sessao) return;
    
    // Verificar se chat está desabilitado (apenas para fornecedores)
    if (!data.isPregoeiro && sessao.chat_desabilitado) {
      client.emit('chat_bloqueado', { mensagem: 'O chat está temporariamente desabilitado pelo pregoeiro.' });
      return;
    }

    // Salvar mensagem no banco de dados (com nome real para ATA)
    try {
      await this.sessaoService.salvarMensagemChat(
        data.sessaoId,
        data.remetente,
        data.mensagem,
        data.isPregoeiro,
        data.fornecedorId
      );
    } catch (error) {
      console.error('Erro ao salvar mensagem:', error);
    }

    // Anonimizar nome do fornecedor se não estiver na fase de habilitação
    let remetenteExibicao = data.remetente;
    if (!data.isPregoeiro && data.fornecedorId) {
      const etapasReveladas = ['CONVOCACAO_HABILITACAO', 'ANALISE_HABILITACAO', 'INTENCAO_RECURSO', 'PRAZO_RECURSAL', 'ANALISE_RECURSOS', 'ADJUDICACAO', 'ENCERRAMENTO'];
      if (!etapasReveladas.includes(sessao.etapa)) {
        // Gerar identificador anônimo baseado no fornecedor_id
        remetenteExibicao = `Fornecedor ${data.fornecedorId.substring(0, 4).toUpperCase()}`;
      }
    }

    // Emitir para todos os participantes
    this.server.to(data.sessaoId).emit('nova_mensagem', {
      remetente: data.isPregoeiro ? 'PREGOEIRO' : remetenteExibicao,
      mensagem: data.mensagem,
      isPregoeiro: data.isPregoeiro,
      horario: new Date(),
      fornecedorId: data.fornecedorId
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
    await this.sessaoService.toggleChat(data.sessaoId, data.habilitado);
    
    // Notificar todos os participantes
    this.server.to(data.sessaoId).emit('chat_status', {
      habilitado: data.habilitado,
      mensagem: data.habilitado ? 'Chat habilitado pelo pregoeiro' : 'Chat desabilitado pelo pregoeiro'
    });
  }

  /**
   * Atualiza cronometro para todos os participantes
   */
  @SubscribeMessage('sync_cronometro')
  async handleSyncCronometro(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string; tempoRestante: number }
  ) {
    this.server.to(data.sessaoId).emit('cronometro_update', {
      tempoRestante: data.tempoRestante
    });
  }

  /**
   * Notifica tempo aleatorio iniciado
   */
  emitirTempoAleatorioIniciado(sessaoId: string) {
    this.server.to(sessaoId).emit('tempo_aleatorio_iniciado', {
      mensagem: 'Tempo aleatorio para encerramento iniciado. Envie lances para prorrogar!'
    });
  }

  /**
   * Notifica encerramento automatico
   */
  emitirEncerramentoAutomatico(sessaoId: string, itemId: string) {
    this.server.to(sessaoId).emit('encerramento_automatico', {
      itemId,
      mensagem: 'Disputa encerrada automaticamente por tempo'
    });
  }
}
