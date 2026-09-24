import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Namespace, Server, Socket } from 'socket.io';
import { AuthService, JwtPayload } from '../auth.service';
import { Ator, atorDoPayload } from './ator';

/**
 * AUTENTICAÇÃO NO HANDSHAKE DOS SOCKETS — reutilizável por qualquer gateway.
 *
 * Token lido de `handshake.auth.token` ou do header `Authorization: Bearer`
 * (nunca do payload das mensagens). Mesma validação do REST (JwtService.verify
 * + AuthService.validateToken: órgão ativo, fornecedor existente, tipo válido).
 *
 *  - token válido       → `client.data.ator` = Ator
 *  - sem token          → `client.data.ator` = null (anônimo) — o gateway só deve
 *                         deixá-lo em salas PÚBLICAS e somente leitura;
 *                         com `{ exigirLogin: true }` a conexão é recusada
 *  - token inválido     → conexão recusada (connect_error "Token inválido ou expirado")
 *
 * Uso no gateway:
 *
 *   export class XGateway implements OnGatewayInit {
 *     constructor(private readonly wsAuth: WsAutenticador) {}
 *     afterInit(server: Namespace) {
 *       this.wsAuth.instalar(server);                 // ou instalar(server, { exigirLogin: true })
 *     }
 *     @SubscribeMessage('acao')
 *     acao(@ConnectedSocket() client: Socket) {
 *       const ator = atorDoSocket(client);            // Ator | null — única identidade válida
 *     }
 *   }
 */
@Injectable()
export class WsAutenticador {
  private readonly logger = new Logger(WsAutenticador.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {}

  /** Extrai o token do handshake (auth.token ou Authorization: Bearer). */
  static tokenDoHandshake(client: Pick<Socket, 'handshake'>): string | null {
    const hs: any = client?.handshake || {};
    const doAuth = typeof hs.auth?.token === 'string' ? hs.auth.token.trim() : '';
    if (doAuth) return doAuth.replace(/^Bearer\s+/i, '');
    const header = hs.headers?.authorization || hs.headers?.Authorization;
    if (typeof header === 'string') {
      const m = header.match(/^Bearer\s+(\S+)/i);
      if (m) return m[1];
    }
    return null;
  }

  /** Valida o token e devolve o Ator (lança se inválido/expirado/tipo desconhecido). */
  async atorDoToken(token: string): Promise<Ator> {
    const payload = this.jwtService.verify<JwtPayload>(token);
    const validado = await this.authService.validateToken(payload);
    const ator = atorDoPayload(validado);
    if (!ator) throw new Error('Token não válido para esta área');
    return ator;
  }

  /**
   * Autentica um socket (uso direto em handleConnection, se preferir).
   * Devolve o Ator, null (anônimo) ou lança (token inválido / login exigido).
   */
  async autenticar(client: Socket, opts: { exigirLogin?: boolean } = {}): Promise<Ator | null> {
    const token = WsAutenticador.tokenDoHandshake(client);
    if (!token) {
      if (opts.exigirLogin) throw new Error('Autenticação necessária');
      client.data.ator = null;
      return null;
    }
    let ator: Ator;
    try {
      ator = await this.atorDoToken(token);
    } catch {
      throw new Error('Token inválido ou expirado');
    }
    client.data.ator = ator;
    return ator;
  }

  /** Instala o middleware de handshake no namespace/servidor do gateway. */
  instalar(server: Namespace | Server, opts: { exigirLogin?: boolean } = {}): void {
    if (!server || typeof (server as any).use !== 'function') return;
    (server as any).use((socket: Socket, next: (err?: Error) => void) => {
      this.autenticar(socket, opts)
        .then(() => next())
        .catch((e: Error) => {
          this.logger.debug(`Handshake recusado (${socket.nsp?.name}): ${e.message}`);
          next(e);
        });
    });
  }
}

/** Ator do socket (preenchido no handshake). null = anônimo. */
export function atorDoSocket(client: Pick<Socket, 'data'> | null | undefined): Ator | null {
  return (client?.data?.ator as Ator | null | undefined) ?? null;
}
