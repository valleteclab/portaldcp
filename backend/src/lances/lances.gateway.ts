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
import { Server, Socket } from 'socket.io';
import { LancesService } from './lances.service';
import { WsAutenticador } from '../auth/acesso/ws-autenticador';
import { ehUuid } from '../auth/acesso/acesso-licitacao.service';
import { SigiloDisputaService } from '../disputa-v2/sigilo-disputa.service';

/**
 * Gateway LEGADO da sala de lances no namespace padrão "/".
 *
 * E1a: SOMENTE LEITURA. Todas as escritas (lance, cancelamento, chat,
 * encerramento) são recusadas — este gateway confiava no fornecedor/papel
 * enviados pelo cliente e será removido na E2 (motor único /disputa-v2).
 * `entrar_sala` devolve o estado da sessão com as identidades dos licitantes
 * anonimizadas; não registra participante nem liga o relógio legado (o
 * relógio da disputa é o da disputa-v2).
 */
@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  }
})
export class LancesGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;

  /** Mantido vazio (compatibilidade com o helper de teste que para os timers). */
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    private readonly lancesService: LancesService,
    private readonly wsAuth: WsAutenticador,
    private readonly sigilo: SigiloDisputaService,
  ) {}

  afterInit(server: Server) {
    this.wsAuth.instalar(server);
  }

  handleConnection(client: Socket) {
    console.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Cliente desconectado: ${client.id}`);
  }

  private recusar(client: Socket, evento: 'erro' | 'erro_lance') {
    const message = 'Sala legada somente leitura. Use a sala de disputa (disputa-v2).';
    client.emit(evento, { message, mensagem: message });
  }

  /**
   * Entra na sala (somente leitura): estado com identidades anonimizadas.
   */
  @SubscribeMessage('entrar_sala')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { licitacaoId: string },
  ) {
    const licitacaoId = data?.licitacaoId;
    if (!ehUuid(licitacaoId)) {
      client.emit('erro', { message: 'Licitação inválida', mensagem: 'Licitação inválida' });
      return;
    }
    client.join(licitacaoId);
    const estado = await this.lancesService.getEstadoSessao(licitacaoId);
    client.emit('estado_sessao', await this.sigilo.aplicarVisao(estado, licitacaoId, { tipo: 'PUBLICO' }));
  }

  /** Lance — RECUSADO (sala legada somente leitura). */
  @SubscribeMessage('enviar_lance')
  handleBid(@ConnectedSocket() client: Socket) {
    this.recusar(client, 'erro_lance');
  }

  /** Cancelamento de lance — RECUSADO. */
  @SubscribeMessage('cancelar_lance')
  handleCancel(@ConnectedSocket() client: Socket) {
    this.recusar(client, 'erro');
  }

  /** Chat — RECUSADO. */
  @SubscribeMessage('enviar_mensagem')
  handleMessage(@ConnectedSocket() client: Socket) {
    this.recusar(client, 'erro');
  }

  /** Encerrar item — RECUSADO. */
  @SubscribeMessage('encerrar_item')
  handleEncerrarItem(@ConnectedSocket() client: Socket) {
    this.recusar(client, 'erro');
  }
}
