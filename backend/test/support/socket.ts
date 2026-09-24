/**
 * Cliente socket.io para os namespaces do app em teste (o criarApp faz
 * app.listen na porta 0, então há um servidor real em ctx.baseUrl).
 *
 *   const s = await conectarSocket(ctx, '/disputa-v2', { token: forn.token });
 *   s.emit('entrar_sala', { sessaoId, tipo: 'FORNECEDOR', usuarioId: forn.id, usuarioNome: 'X' });
 *   const estado = await aguardarEvento(s, 'estado_sessao');
 *   s.disconnect();
 *
 * O token vai em `auth.token` (handshake) e no header Authorization — os
 * gateways de hoje não validam token; o E2 passa a exigir.
 */
import { io, Socket } from 'socket.io-client';
import { AppE2E } from './app';

export interface OpcoesSocket {
  token?: string;
  /** Tempo máximo para conectar (ms). Padrão 5000. */
  timeout?: number;
  query?: Record<string, string>;
}

const abertos = new Set<Socket>();

export function conectarSocket(ctx: AppE2E, namespace: string, opts: OpcoesSocket = {}): Promise<Socket> {
  const ns = namespace.startsWith('/') ? namespace : `/${namespace}`;
  const socket = io(`${ctx.baseUrl}${ns}`, {
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
    timeout: opts.timeout ?? 5000,
    auth: opts.token ? { token: opts.token } : undefined,
    extraHeaders: opts.token ? { Authorization: `Bearer ${opts.token}` } : undefined,
    query: opts.query,
  });
  abertos.add(socket);
  socket.on('disconnect', () => abertos.delete(socket));

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`[socket] timeout conectando em ${ns}`));
    }, opts.timeout ?? 5000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      socket.close();
      reject(err);
    });
  });
}

/** Resolve com o payload do próximo `evento` (ou falha após `timeout` ms). */
export function aguardarEvento<T = any>(socket: Socket, evento: string, timeout = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(evento, handler);
      reject(new Error(`[socket] evento '${evento}' não chegou em ${timeout} ms`));
    }, timeout);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(evento, handler);
  });
}

/** Emite e espera o ack do handler (@SubscribeMessage que retorna valor). */
export function emitirComAck<T = any>(socket: Socket, evento: string, dados: any, timeout = 5000): Promise<T> {
  return socket.timeout(timeout).emitWithAck(evento, dados) as Promise<T>;
}

/** Fecha todos os sockets abertos pelo helper (use no afterAll antes do ctx.fechar()). */
export function fecharSockets(): void {
  for (const s of abertos) s.close();
  abertos.clear();
}
