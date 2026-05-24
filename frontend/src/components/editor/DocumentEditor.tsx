"use client"

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
// Note: extension-collaboration-cursor foi renomeado para -caret no Tiptap v3
import CollaborationCaret from '@tiptap/extension-collaboration-caret'
import CharacterCount from '@tiptap/extension-character-count'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableCell } from '@tiptap/extension-table-cell'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import * as Y from 'yjs'
import { Awareness } from 'y-protocols/awareness'
import { encodeAwarenessUpdate, applyAwarenessUpdate } from 'y-protocols/awareness'
import { useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import { EditorToolbar } from './EditorToolbar'
import { AiAssistantPanel } from './AiAssistantPanel'
import { API_URL, authFetch } from '@/lib/api'

// ─── Types ────────────────────────────────────────────────────────────────────

interface UsuarioOnline {
  nome: string
  cor: string
  iniciais: string
}

export interface DocumentEditorProps {
  documentoId: string
  licitacaoId: string
  tipo: string
  tituloDocumento?: string
  initialHtml?: string
  readOnly?: boolean
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CORES_USUARIO = [
  '#1351b4', '#2e7d32', '#e65100', '#6a1b9a',
  '#00838f', '#c62828', '#f57f17', '#283593',
]

function getCorAleatoria() {
  return CORES_USUARIO[Math.floor(Math.random() * CORES_USUARIO.length)]
}

function getUsuarioAtual(): UsuarioOnline {
  if (typeof window === 'undefined') {
    return { nome: 'Usuário', cor: '#1351b4', iniciais: 'US' }
  }
  try {
    const u = JSON.parse(localStorage.getItem('usuario') || '{}')
    const nome: string = u.nome || u.name || u.email?.split('@')[0] || 'Usuário'
    const cor = getCorAleatoria()
    const iniciais = nome
      .split(/\s+/)
      .slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase() ?? '')
      .join('')
    return { nome, cor, iniciais }
  } catch {
    return { nome: 'Usuário', cor: '#1351b4', iniciais: 'US' }
  }
}

function getWsUrl(): string {
  if (typeof window === 'undefined') return 'http://localhost:3000'
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL.replace(/\/$/, '')
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  return 'http://localhost:3000'
}

// ─── Main Component ───────────────────────────────────────────────────────────

/**
 * DocumentEditor — editor colaborativo Tiptap + Yjs + Socket.io
 *
 * Layout:
 *   ┌──────────────────────── Toolbar ────────────────────────────┐
 *   │  [editor ProseMirror, flex-1]  │  [AiAssistantPanel, 380px] │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * O componente gerencia:
 * - Conexão WebSocket ao backend (/colaboracao namespace)
 * - Sincronização Yjs (y-update, y-state, y-awareness)
 * - Lista de presença
 * - Auto-save debounced (2s) via PATCH /api/fase-interna/:id/documentos/:tipo/conteudo
 */
export function DocumentEditor({
  documentoId,
  licitacaoId,
  tipo,
  tituloDocumento,
  initialHtml,
  readOnly = false,
}: DocumentEditorProps) {
  "use no memo" // Desativa React Compiler para este componente (conflito com Tiptap/Yjs)

  // ─── Yjs: cria Y.Doc + Awareness + provider atomicamente, uma única vez ───
  // useState com inicializador lazy garante chamada única e referência estável
  const [yState] = useState(() => {
    const ydoc = new Y.Doc()
    // Garante que o XmlFragment 'default' existe e está vinculado ao ydoc
    // ANTES do Tiptap criar o editor (evita "Cannot read properties of undefined")
    ydoc.getXmlFragment('default')
    const awareness = new Awareness(ydoc)
    const provider = { awareness }
    const usuario = getUsuarioAtual()
    return { ydoc, awareness, provider, usuario }
  })
  const { ydoc, awareness, provider, usuario } = yState

  // ─── Estado ────────────────────────────────────────────────────────────────
  const [presentes, setPresentes] = useState<UsuarioOnline[]>([])
  const [salvo, setSalvo] = useState<boolean | undefined>(undefined)
  // Sinaliza que recebemos o estado inicial do Y.Doc do servidor.
  // Apenas depois disso é seguro inicializar conteúdo a partir do initialHtml
  // (evita duplicação quando o servidor já tem conteúdo de sessões anteriores).
  const [yStateReceived, setYStateReceived] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentInitializedRef = useRef(false)
  // Mantém o initialHtml mais recente acessível dentro de handlers do socket
  // sem precisar reconectar o socket toda vez que initialHtml mudar.
  const initialHtmlRef = useRef(initialHtml)
  useEffect(() => {
    initialHtmlRef.current = initialHtml
  }, [initialHtml])

  // ─── Auto-save ─────────────────────────────────────────────────────────────
  const salvar = useCallback(
    async (html: string) => {
      try {
        await authFetch(
          `${API_URL}/api/fase-interna/${licitacaoId}/documentos/${tipo}/conteudo`,
          {
            method: 'PATCH',
            body: JSON.stringify({ html }),
          },
        )
        setSalvo(true)
      } catch (e) {
        console.error('[DocumentEditor] Erro ao salvar:', e)
        setSalvo(undefined)
      }
    },
    [licitacaoId, tipo],
  )

  // ─── Tiptap Editor ─────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ undoRedo: false }), // Collaboration gerencia undo/redo via Yjs
      Collaboration.configure({ document: ydoc }),
      CollaborationCaret.configure({
        provider,
        user: { name: usuario.nome, color: usuario.cor },
      }),
      CharacterCount,
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: 'Comece a escrever o documento ou use o Procura+ AI à direita…',
      }),
      Typography,
      Underline,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false }),
    ],
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      setSalvo(false)
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        salvar(editor.getHTML())
      }, 2000)
    },
  })

  // ─── Socket.io + Yjs ───────────────────────────────────────────────────────
  useEffect(() => {
    const wsUrl = getWsUrl()
    const socket = io(`${wsUrl}/colaboracao`, {
      transports: ['websocket', 'polling'],
      withCredentials: true,
    })

    // 1. Ao conectar: entra na room do documento
    socket.on('connect', () => {
      socket.emit('entrar-documento', {
        documentoId,
        nome: usuario.nome,
        cor: usuario.cor,
        iniciais: usuario.iniciais,
      })
    })

    // 2. Estado inicial do Y.Doc (enviado pelo servidor na entrada)
    // Aplica updates do servidor e marca yStateReceived=true para liberar o init
    // do conteúdo a partir do initialHtml (no useEffect abaixo).
    socket.on('y-state', ({ estado }: { estado: number[] }) => {
      Y.applyUpdate(ydoc, new Uint8Array(estado))
      setYStateReceived(true)
    })

    // 3. Atualizações remotas do documento
    socket.on('y-update', ({ update }: { update: number[] }) => {
      Y.applyUpdate(ydoc, new Uint8Array(update), 'remote')
    })

    // 4. Awareness remoto (cursores dos outros usuários)
    socket.on('y-awareness', ({ awareness: awarenessData }: { awareness: number[] }) => {
      applyAwarenessUpdate(awareness, new Uint8Array(awarenessData), 'remote')
    })

    // 5. Lista de presença
    socket.on('presentes', ({ usuarios }: { usuarios: UsuarioOnline[] }) => {
      setPresentes(usuarios)
    })

    // Envia atualizações locais do documento
    const onYDocUpdate = (update: Uint8Array, origin: unknown) => {
      if (origin !== 'remote') {
        socket.emit('y-update', { documentoId, update: Array.from(update) })
      }
    }
    ydoc.on('update', onYDocUpdate)

    // Envia awareness local
    const onAwarenessUpdate = ({
      added,
      updated,
      removed,
    }: {
      added: number[]
      updated: number[]
      removed: number[]
    }) => {
      const changedClients = [...added, ...updated, ...removed]
      const update = encodeAwarenessUpdate(awareness, changedClients)
      socket.emit('y-awareness', { documentoId, awareness: Array.from(update) })
    }
    awareness.on('update', onAwarenessUpdate)

    // Define usuário local no awareness
    awareness.setLocalStateField('user', { name: usuario.nome, color: usuario.cor })

    return () => {
      awareness.setLocalState(null)
      socket.emit('sair-documento', { documentoId })
      ydoc.off('update', onYDocUpdate)
      awareness.off('update', onAwarenessUpdate)
      socket.disconnect()
    }
    // `editor` e `initialHtml` intencionalmente excluídos das deps — o socket
    // deve conectar apenas uma vez por documentoId. O init do conteúdo é
    // tratado no useEffect separado abaixo, que aguarda yStateReceived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentoId, ydoc, awareness, usuario])

  // ─── Inicialização do conteúdo (após confirmar estado do servidor) ─────────
  // Só inicializa o conteúdo a partir do initialHtml DEPOIS que o servidor
  // enviou seu y-state. Se o servidor já tem conteúdo, esse conteúdo prevalece
  // (xmlFragment.length > 0 → não inicializa). Isso evita duplicação quando
  // setContent dispararia antes do y-state do servidor chegar.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    if (!yStateReceived) return
    if (contentInitializedRef.current) return
    const html = initialHtmlRef.current
    if (!html?.trim()) return

    const xmlFragment = ydoc.getXmlFragment('default')
    if (xmlFragment.length === 0) {
      contentInitializedRef.current = true
      editor.commands.setContent(html)
    } else {
      // Servidor já tinha conteúdo; marca como inicializado para não tentar de novo
      contentInitializedRef.current = true
    }
  }, [editor, yStateReceived, ydoc])

  // ─── Cleanup ───────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      awareness.destroy()
    }
  }, [awareness])

  // ─── Word count ────────────────────────────────────────────────────────────
  const wordCount: number = (editor?.storage.characterCount?.words?.() as number) ?? 0

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Estilos do editor e cursores colaborativos */}
      <style>{`
        .collaboration-carets__caret {
          border-left: 2px solid;
          border-right: none;
          margin-left: -1px;
          margin-right: -1px;
          pointer-events: none;
          position: relative;
          word-break: normal;
        }
        .collaboration-carets__label {
          border-radius: 3px 3px 3px 0;
          color: #fff;
          font-size: 10px;
          font-style: normal;
          font-weight: 600;
          left: -1px;
          line-height: normal;
          padding: 0.1rem 0.3rem;
          position: absolute;
          top: -1.4em;
          user-select: none;
          white-space: nowrap;
        }
        .ProseMirror {
          outline: none;
          min-height: 100%;
          padding: 2rem 2.5rem;
          font-size: 0.9375rem;
          line-height: 1.8;
          color: #1a202c;
        }
        .ProseMirror h1 {
          font-size: 1.4rem;
          font-weight: 700;
          margin-top: 2rem;
          margin-bottom: 0.75rem;
          color: #0c326f;
          border-bottom: 2px solid #e2eaf8;
          padding-bottom: 0.3rem;
        }
        .ProseMirror h2 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 1.75rem;
          margin-bottom: 0.5rem;
          color: #1351b4;
        }
        .ProseMirror h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 1.25rem;
          margin-bottom: 0.4rem;
          color: #2d4a8a;
        }
        .ProseMirror p {
          margin-bottom: 0.7rem;
          text-align: justify;
        }
        .ProseMirror ul, .ProseMirror ol {
          padding-left: 1.75rem;
          margin-bottom: 0.75rem;
        }
        .ProseMirror li { margin-bottom: 0.25rem; }
        .ProseMirror table {
          border-collapse: collapse;
          width: 100%;
          margin: 1rem 0;
        }
        .ProseMirror th, .ProseMirror td {
          border: 1px solid #d1d5db;
          padding: 0.5rem 0.75rem;
          text-align: left;
        }
        .ProseMirror th {
          background-color: #eef2fb;
          font-weight: 600;
          color: #1351b4;
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
        .ProseMirror a {
          color: #1351b4;
          text-decoration: underline;
        }
        .ProseMirror blockquote {
          border-left: 3px solid #1351b4;
          padding-left: 1rem;
          color: #4a5568;
          margin: 1rem 0;
          font-style: italic;
        }
      `}</style>

      <div className="flex h-full overflow-hidden bg-gray-50">
        {/* Left: Editor */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white border border-gray-200 rounded-xl m-3 shadow-sm">
          {/* Presence bar */}
          {presentes.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-1.5 bg-[#f0f4fb] border-b border-[#d8e4f5] shrink-0">
              <span className="text-[10px] text-gray-500 font-medium">Online:</span>
              <div className="flex items-center">
                {presentes.slice(0, 8).map((u, i) => (
                  <div
                    key={i}
                    title={u.nome}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-white -ml-1 first:ml-0 shadow-sm"
                    style={{ backgroundColor: u.cor }}
                  >
                    {u.iniciais}
                  </div>
                ))}
                {presentes.length > 8 && (
                  <span className="text-[10px] text-gray-400 ml-2">+{presentes.length - 8}</span>
                )}
              </div>
            </div>
          )}

          {/* Toolbar */}
          <EditorToolbar editor={editor} salvo={salvo} wordCount={wordCount} />

          {/* ProseMirror content */}
          <div className="flex-1 overflow-y-auto">
            <EditorContent editor={editor} className="h-full" />
          </div>
        </div>

        {/* Right: AI Assistant Panel — 380px */}
        <div className="w-[380px] shrink-0 flex flex-col overflow-hidden">
          <AiAssistantPanel
            editor={editor}
            tipoDocumento={tipo}
            contexto={tituloDocumento}
          />
        </div>
      </div>
    </>
  )
}
