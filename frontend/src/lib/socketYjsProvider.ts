/**
 * SocketYjsProvider
 *
 * Provider Yjs customizado que usa Socket.io para sincronização em tempo real.
 * Implementa a interface mínima necessária para @tiptap/extension-collaboration-cursor:
 * - `awareness`: instância de y-protocols Awareness
 *
 * Uso:
 *   const provider = new SocketYjsProvider(ydoc, documentoId, usuario, wsUrl, { onPresentes, onSyncComplete })
 *   // Passar provider para CollaborationCursor.configure({ provider })
 */

import * as Y from 'yjs'
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'
import { io, Socket } from 'socket.io-client'

export interface UsuarioColaboracao {
  nome: string
  cor: string
  iniciais: string
}

interface SocketYjsProviderOptions {
  onPresentes?: (usuarios: UsuarioColaboracao[]) => void
  onSyncComplete?: (ydocEmpty: boolean) => void
}

/**
 * Retorna a URL base para conexão WebSocket.
 * Usa NEXT_PUBLIC_WS_URL se definido, senão NEXT_PUBLIC_API_URL, senão fallback para localhost.
 */
function getWsUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3000'
  if (process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, '')
  }
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  }
  // Em desenvolvimento, o backend roda na porta 3000
  return 'http://localhost:3000'
}

export class SocketYjsProvider {
  public ydoc: Y.Doc
  public awareness: Awareness
  public socket: Socket

  private documentoId: string
  private _options: SocketYjsProviderOptions

  constructor(
    ydoc: Y.Doc,
    documentoId: string,
    usuario: UsuarioColaboracao,
    options: SocketYjsProviderOptions = {},
  ) {
    this.ydoc = ydoc
    this.documentoId = documentoId
    this._options = options

    // Cria awareness usando o Y.Doc
    this.awareness = new Awareness(ydoc)

    // Conecta ao namespace /colaboracao do Socket.io
    const wsUrl = getWsUrl()
    this.socket = io(`${wsUrl}/colaboracao`, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    })

    // Ao conectar: entra na room do documento
    this.socket.on('connect', () => {
      this.socket.emit('entrar-documento', {
        documentoId,
        nome: usuario.nome,
        cor: usuario.cor,
        iniciais: usuario.iniciais,
      })
    })

    // Recebe estado inicial do Y.Doc do servidor
    this.socket.on('y-state', ({ estado }: { estado: number[] }) => {
      const update = new Uint8Array(estado)
      Y.applyUpdate(ydoc, update)
      // Informa se o doc estava vazio (novo documento)
      const xmlFragment = ydoc.getXmlFragment('default')
      const empty = xmlFragment.length === 0
      this._options.onSyncComplete?.(empty)
    })

    // Recebe atualizações remotas do documento
    this.socket.on('y-update', ({ update }: { update: number[] }) => {
      Y.applyUpdate(ydoc, new Uint8Array(update), 'remote')
    })

    // Recebe atualizações de awareness (cursores remotos)
    this.socket.on('y-awareness', ({ awareness }: { awareness: number[] }) => {
      applyAwarenessUpdate(this.awareness, new Uint8Array(awareness), 'remote')
    })

    // Recebe lista de usuários presentes
    this.socket.on('presentes', ({ usuarios }: { usuarios: UsuarioColaboracao[] }) => {
      this._options.onPresentes?.(usuarios)
    })

    // Envia atualizações locais do documento para o servidor
    ydoc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin !== 'remote') {
        this.socket.emit('y-update', {
          documentoId,
          update: Array.from(update),
        })
      }
    })

    // Envia atualizações de awareness local para o servidor
    this.awareness.on(
      'update',
      ({
        added,
        updated,
        removed,
      }: {
        added: number[]
        updated: number[]
        removed: number[]
      }) => {
        const changedClients = [...added, ...updated, ...removed]
        const update = encodeAwarenessUpdate(this.awareness, changedClients)
        this.socket.emit('y-awareness', {
          documentoId,
          awareness: Array.from(update),
        })
      },
    )

    // Define informações do usuário local no awareness
    this.awareness.setLocalStateField('user', {
      name: usuario.nome,
      color: usuario.cor,
    })
  }

  destroy() {
    this.awareness.setLocalState(null)
    this.socket.emit('sair-documento', { documentoId: this.documentoId })
    this.socket.disconnect()
    this.awareness.destroy()
  }
}
