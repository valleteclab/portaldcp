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

interface ClienteInfo {
  licitacaoId: string;
  participanteId: string;
  nome: string;
  tipo: 'PREGOEIRO' | 'FORNECEDOR';
}

@WebSocketGateway({ 
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  }
})
export class LancesGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  
  // Mapa de clientes conectados
  private clientes: Map<string, ClienteInfo> = new Map();
  
  // Timers ativos por licitação
  private timers: Map<string, NodeJS.Timeout> = new Map();

  constructor(private readonly lancesService: LancesService) {}

  afterInit() {
    console.log('WebSocket Gateway inicializado');
  }

  handleConnection(client: Socket) {
    console.log(`Cliente conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Cliente desconectado: ${client.id}`);
    
    // Remove participante da sessão
    const info = this.clientes.get(client.id);
    if (info) {
      this.lancesService.removerParticipante(info.licitacaoId, client.id);
      this.clientes.delete(client.id);
      
      // Notifica outros participantes
      this.broadcastEstadoSessao(info.licitacaoId);
    }
  }

  /**
   * Participante entra na sala de disputa
   */
  @SubscribeMessage('entrar_sala')
  async handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { 
      licitacaoId: string; 
      participanteId: string; 
      nome: string; 
      tipo: 'PREGOEIRO' | 'FORNECEDOR' 
    },
  ) {
    const { licitacaoId, participanteId, nome, tipo } = data;
    
    // Entra na room do Socket.IO
    client.join(licitacaoId);
    console.log(`${tipo} ${nome} entrou na sala ${licitacaoId}`);
    
    // Registra cliente
    this.clientes.set(client.id, { licitacaoId, participanteId, nome, tipo });
    
    // Adiciona participante à sessão
    await this.lancesService.adicionarParticipante(licitacaoId, participanteId, nome, tipo, client.id);
    
    // Inicia timer se não existir
    this.iniciarTimerSessao(licitacaoId);
    
    // Envia estado completo da sessão para o cliente
    const estado = await this.lancesService.getEstadoSessao(licitacaoId);
    client.emit('estado_sessao', estado);
    
    // Notifica outros participantes sobre novo participante
    this.broadcastEstadoSessao(licitacaoId);
  }

  /**
   * Inicia o timer centralizado da sessão
   */
  private iniciarTimerSessao(licitacaoId: string) {
    // Se já existe timer, não cria outro
    if (this.timers.has(licitacaoId)) {
      return;
    }

    console.log(`Iniciando timer para sessão ${licitacaoId}`);

    const timer = setInterval(async () => {
      try {
        // Processa tick no service
        const resultado = await this.lancesService.processarTick(licitacaoId);
        
        // Envia tempo atualizado para todos
        const estado = await this.lancesService.getEstadoSessao(licitacaoId);
        this.server.to(licitacaoId).emit('tick', {
          tempoRestante: estado.tempoRestante,
          emTempoAleatorio: estado.emTempoAleatorio,
        });

        // Se houve mudança de estado, envia estado completo
        if (resultado.mudouEstado) {
          this.server.to(licitacaoId).emit('estado_sessao', estado);
        }

        // Se sessão encerrou, para o timer
        if (estado.status === 'ENCERRADA') {
          this.pararTimerSessao(licitacaoId);
        }
      } catch (error) {
        console.error(`Erro no timer da sessão ${licitacaoId}:`, error);
      }
    }, 1000); // Tick a cada segundo

    this.timers.set(licitacaoId, timer);
  }

  /**
   * Para o timer da sessão
   */
  private pararTimerSessao(licitacaoId: string) {
    const timer = this.timers.get(licitacaoId);
    if (timer) {
      clearInterval(timer);
      this.timers.delete(licitacaoId);
      console.log(`Timer parado para sessão ${licitacaoId}`);
    }
  }

  /**
   * Envia estado atualizado para todos na sala
   */
  private async broadcastEstadoSessao(licitacaoId: string) {
    const estado = await this.lancesService.getEstadoSessao(licitacaoId);
    this.server.to(licitacaoId).emit('estado_sessao', estado);
  }

  /**
   * Fornecedor envia um lance
   */
  @SubscribeMessage('enviar_lance')
  async handleBid(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { licitacaoId: string; valor: number; fornecedorId: string },
  ) {
    const ip = client.handshake.address;

    try {
      // Registra o lance
      const lanceSalvo = await this.lancesService.registrarLance(
        data.licitacaoId,
        data.fornecedorId,
        data.valor,
        ip
      );

      // Reseta o timer (novo lance = reinicia contagem)
      await this.lancesService.resetarTimer(data.licitacaoId);

      // Envia estado atualizado para TODOS os participantes
      await this.broadcastEstadoSessao(data.licitacaoId);
      
      // Confirma para o cliente que enviou
      client.emit('lance_confirmado', { success: true, lance: lanceSalvo });
      
    } catch (error: any) {
      client.emit('erro_lance', { message: error.message });
    }
  }

  /**
   * Pregoeiro cancela um lance
   */
  @SubscribeMessage('cancelar_lance')
  async handleCancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { lanceId: string; licitacaoId: string; justificativa: string },
  ) {
    try {
      await this.lancesService.cancelarLance(data.lanceId);

      // Envia mensagem de sistema
      await this.lancesService.enviarMensagemSistema(
        data.licitacaoId,
        `⚠️ Lance cancelado pelo Pregoeiro. Motivo: ${data.justificativa}`
      );

      // Atualiza estado para todos
      await this.broadcastEstadoSessao(data.licitacaoId);

    } catch (error: any) {
      client.emit('erro', { message: error.message });
    }
  }

  /**
   * Participante envia mensagem no chat
   */
  @SubscribeMessage('enviar_mensagem')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { licitacaoId: string; conteudo: string; remetente: string; isPregoeiro: boolean },
  ) {
    const msg = await this.lancesService.enviarMensagem(
      data.licitacaoId,
      data.remetente,
      data.conteudo,
      data.isPregoeiro
    );

    // Envia mensagem para todos na sala
    this.server.to(data.licitacaoId).emit('nova_mensagem', {
      id: msg.id,
      remetente: msg.remetente,
      mensagem: msg.conteudo,
      horario: new Date(msg.created_at).toLocaleTimeString('pt-BR'),
      tipo: msg.is_pregoeiro ? 'PREGOEIRO' : 'FORNECEDOR',
    });
  }

  /**
   * Pregoeiro encerra item atual
   */
  @SubscribeMessage('encerrar_item')
  async handleEncerrarItem(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { licitacaoId: string },
  ) {
    try {
      await this.lancesService.encerrarItemAtual(data.licitacaoId);
      await this.broadcastEstadoSessao(data.licitacaoId);
    } catch (error: any) {
      client.emit('erro', { message: error.message });
    }
  }
}
