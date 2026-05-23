import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as Y from 'yjs';

/**
 * ============================================================================
 * COLABORACAO GATEWAY
 * ============================================================================
 *
 * WebSocket Gateway para edição colaborativa de documentos da fase interna.
 * Usa Yjs (CRDT) para sincronizar o estado do editor Tiptap em tempo real.
 *
 * Cada documento tem uma "room" isolada: doc:{documentoId}
 * Usuários conectados numa room veem cursores e edições uns dos outros.
 * ============================================================================
 */

interface UsuarioPresente {
  socketId: string;
  documentoId: string;
  nome: string;
  cor: string;
  iniciais: string;
}

@WebSocketGateway({
  namespace: '/colaboracao',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class ColaboracaoGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  /** Yjs docs em memória por documentoId */
  private ydocs: Map<string, Y.Doc> = new Map();

  /** Usuários presentes por documentoId */
  private presentes: Map<string, UsuarioPresente[]> = new Map();

  // ============================================================================
  // CONEXÃO / DESCONEXÃO
  // ============================================================================

  handleConnection(client: Socket) {
    console.log(`[Colaboração] Conectado: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`[Colaboração] Desconectado: ${client.id}`);
    this.removerUsuario(client);
  }

  // ============================================================================
  // ENTRAR NO DOCUMENTO
  // ============================================================================

  @SubscribeMessage('entrar-documento')
  handleEntrarDocumento(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: {
      documentoId: string;
      nome: string;
      cor: string;
      iniciais?: string;
    },
  ) {
    const { documentoId, nome, cor, iniciais } = data;
    const room = `doc:${documentoId}`;

    // Entrar na room do Socket.io
    client.join(room);

    // Registrar presença
    const usuario: UsuarioPresente = {
      socketId: client.id,
      documentoId,
      nome,
      cor,
      iniciais: iniciais || nome.slice(0, 2).toUpperCase(),
    };

    const lista = this.presentes.get(documentoId) || [];
    lista.push(usuario);
    this.presentes.set(documentoId, lista);

    // Enviar estado Yjs atual para o novo usuário
    const ydoc = this.getYdoc(documentoId);
    const estado = Y.encodeStateAsUpdate(ydoc);
    client.emit('y-state', { estado: Array.from(estado) });

    // Notificar lista de presentes para toda a room
    this.broadcastPresentes(documentoId);

    console.log(`[Colaboração] ${nome} entrou no documento ${documentoId}`);
  }

  // ============================================================================
  // SINCRONIZAÇÃO YJS (updates do documento)
  // ============================================================================

  @SubscribeMessage('y-update')
  handleYUpdate(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { documentoId: string; update: number[] },
  ) {
    const { documentoId, update } = data;
    const ydoc = this.getYdoc(documentoId);

    // Aplicar update ao documento Yjs local (em memória)
    const updateBytes = new Uint8Array(update);
    Y.applyUpdate(ydoc, updateBytes);

    // Broadcast para os outros usuários na room (exceto quem enviou)
    client.to(`doc:${documentoId}`).emit('y-update', { update });
  }

  // ============================================================================
  // AWARENESS (cursores e presença)
  // ============================================================================

  @SubscribeMessage('y-awareness')
  handleAwareness(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { documentoId: string; awareness: number[] },
  ) {
    // Repassar awareness para outros na room
    client
      .to(`doc:${data.documentoId}`)
      .emit('y-awareness', { awareness: data.awareness, socketId: client.id });
  }

  // ============================================================================
  // SAIR DO DOCUMENTO
  // ============================================================================

  @SubscribeMessage('sair-documento')
  handleSairDocumento(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { documentoId: string },
  ) {
    client.leave(`doc:${data.documentoId}`);
    this.removerUsuario(client);
  }

  // ============================================================================
  // HELPERS PRIVADOS
  // ============================================================================

  private getYdoc(documentoId: string): Y.Doc {
    if (!this.ydocs.has(documentoId)) {
      this.ydocs.set(documentoId, new Y.Doc());
    }
    return this.ydocs.get(documentoId)!;
  }

  private removerUsuario(client: Socket) {
    for (const [docId, lista] of this.presentes.entries()) {
      const idx = lista.findIndex((u) => u.socketId === client.id);
      if (idx !== -1) {
        lista.splice(idx, 1);
        this.presentes.set(docId, lista);
        this.broadcastPresentes(docId);
        break;
      }
    }
  }

  private broadcastPresentes(documentoId: string) {
    const lista = this.presentes.get(documentoId) || [];
    this.server.to(`doc:${documentoId}`).emit('presentes', {
      usuarios: lista.map((u) => ({
        nome: u.nome,
        cor: u.cor,
        iniciais: u.iniciais,
      })),
    });
  }
}
