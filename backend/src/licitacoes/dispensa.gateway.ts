import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

/**
 * Gateway LEVE da sala de lances/chat da DISPENSA ELETRÔNICA.
 * Push em tempo real de: novo menor valor por item ('painel_atualizado'),
 * mensagens de chat ('chat') e abertura/encerramento da janela ('janela').
 * Todos os dados emitidos são públicos/anônimos (o sigilo é tratado no service).
 * Independente do motor do pregão (/disputa-v2) de propósito.
 */
@WebSocketGateway({
  namespace: '/dispensa',
  cors: { origin: '*', credentials: true },
})
export class DispensaGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(DispensaGateway.name);

  handleConnection(client: Socket) {
    this.logger.debug(`[Dispensa] cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`[Dispensa] cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('entrar_sala')
  handleEntrarSala(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { licitacaoId: string },
  ) {
    if (!data?.licitacaoId) return;
    client.join(`licitacao:${data.licitacaoId}`);
    client.emit('sala_ok', { licitacaoId: data.licitacaoId, server_time: new Date().toISOString() });
  }

  /** Novo lance aceito → menor valor do item atualizado */
  emitirPainelItem(licitacaoId: string, item: { item_licitacao_id: string; menor_valor: number | null; total_lances: number }) {
    this.server?.to(`licitacao:${licitacaoId}`).emit('painel_atualizado', {
      ...item,
      server_time: new Date().toISOString(),
    });
  }

  /** Mensagem de chat registrada (já mascarada pelo service quando aplicável) */
  emitirMensagem(licitacaoId: string, mensagem: any) {
    this.server?.to(`licitacao:${licitacaoId}`).emit('chat', mensagem);
  }

  /** Janela de lances aberta/encerrada */
  emitirJanela(licitacaoId: string, janela: { dispensa_lances_inicio: Date | null; dispensa_lances_fim: Date | null }) {
    this.server?.to(`licitacao:${licitacaoId}`).emit('janela', {
      ...janela,
      server_time: new Date().toISOString(),
    });
  }
}
