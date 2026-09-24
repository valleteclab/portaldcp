import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Namespace, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { WsAutenticador, atorDoSocket } from '../auth/acesso/ws-autenticador';
import { AcessoLicitacaoService, ehUuid } from '../auth/acesso/acesso-licitacao.service';

/**
 * Gateway LEVE da sala de lances/chat da DISPENSA ELETRÔNICA.
 * Push em tempo real de: novo menor valor por item ('painel_atualizado'),
 * mensagens de chat ('chat') e abertura/encerramento da janela ('janela').
 * Todos os dados emitidos são públicos/anônimos (o sigilo é tratado no service).
 * Independente do motor do pregão (/disputa-v2) de propósito.
 *
 * AUTORIZAÇÃO (E1a): handshake autenticado (WsAutenticador — token inválido
 * recusa a conexão). A sala é SOMENTE LEITURA (nenhuma escrita por socket):
 *  - anônimo: entra (painel público e anônimo);
 *  - órgão DONO, fornecedor COM proposta válida e admin: entram;
 *  - logado sem relação com a licitação (outro órgão, fornecedor sem proposta):
 *    recusado ('erro').
 */
@WebSocketGateway({
  namespace: '/dispensa',
  cors: { origin: '*', credentials: true },
})
export class DispensaGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Namespace;

  private readonly logger = new Logger(DispensaGateway.name);

  constructor(
    private readonly wsAuth: WsAutenticador,
    private readonly acesso: AcessoLicitacaoService,
  ) {}

  afterInit(server: Namespace) {
    this.wsAuth.instalar(server);
  }

  handleConnection(client: Socket) {
    this.logger.debug(`[Dispensa] cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`[Dispensa] cliente desconectado: ${client.id}`);
  }

  @SubscribeMessage('entrar_sala')
  async handleEntrarSala(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { licitacaoId: string },
  ) {
    const licitacaoId = data?.licitacaoId;
    if (!ehUuid(licitacaoId)) {
      client.emit('erro', { mensagem: 'Licitação inválida' });
      return;
    }
    const ator = atorDoSocket(client);
    if (ator) {
      const relacao = await this.acesso.relacaoComLicitacao(ator, licitacaoId);
      if (!relacao) {
        client.emit('erro', { mensagem: 'Acesso negado a esta sala' });
        return;
      }
    } else if (!(await this.acesso.orgaoDaLicitacao(licitacaoId))) {
      client.emit('erro', { mensagem: 'Licitação inválida' });
      return;
    }
    client.join(`licitacao:${licitacaoId}`);
    client.emit('sala_ok', { licitacaoId, server_time: new Date().toISOString() });
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
