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
   * Pregoeiro encerra disputa do item
   */
  @SubscribeMessage('encerrar_item')
  async handleEncerrarItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessaoId: string }
  ) {
    try {
      const sessao = await this.sessaoService.encerrarDisputaItem(data.sessaoId);
      this.server.to(data.sessaoId).emit('item_encerrado', sessao);
      this.server.to(data.sessaoId).emit('notificacao', {
        tipo: 'info',
        mensagem: 'Disputa do item encerrada'
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
   * Pregoeiro envia mensagem no chat
   */
  @SubscribeMessage('mensagem_chat')
  async handleMensagemChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { 
      sessaoId: string; 
      remetente: string; 
      mensagem: string; 
      isPregoeiro: boolean 
    }
  ) {
    this.server.to(data.sessaoId).emit('nova_mensagem', {
      remetente: data.isPregoeiro ? 'PREGOEIRO' : data.remetente,
      mensagem: data.mensagem,
      isPregoeiro: data.isPregoeiro,
      horario: new Date()
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
