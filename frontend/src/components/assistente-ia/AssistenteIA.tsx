'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Bot,
  User,
  X,
  Send,
  Loader2,
  ChevronDown,
  Sparkles,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface Mensagem {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools_usadas?: string[]
  timestamp: Date
}

interface UsuarioLocal {
  id?: string
  nome?: string
  role?: string
  pode_gerenciar_os?: boolean
  pode_aprovar_requisicoes?: boolean
}

const SUGESTOES_BASE = ['Ver minhas requisições', 'Quais OS estão abertas?']

const SUGESTOES_APROVACAO = ['Ver aprovações pendentes']
const SUGESTOES_OS = ['Criar uma Ordem de Serviço']
const SUGESTOES_RELATORIO = [
  'Relatório de contratos',
  'Relatório de almoxarifado',
]

function buildSugestoes(usuario: UsuarioLocal): string[] {
  const sugestoes = [...SUGESTOES_BASE]
  if (usuario.pode_aprovar_requisicoes || usuario.role === 'ADMIN') {
    sugestoes.push(...SUGESTOES_APROVACAO)
  }
  if (usuario.pode_gerenciar_os || usuario.role === 'ADMIN') {
    sugestoes.push(...SUGESTOES_OS)
  }
  if (usuario.role === 'ADMIN' || usuario.role === 'PREGOEIRO') {
    sugestoes.push(...SUGESTOES_RELATORIO)
  }
  return sugestoes
}

function formatarMensagem(content: string): string {
  return content
}

export function AssistenteIA() {
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [usuario, setUsuario] = useState<UsuarioLocal>({})
  const [sugestoes, setSugestoes] = useState<string[]>(SUGESTOES_BASE)
  const [mostrarSugestoes, setMostrarSugestoes] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('usuario') || '{}') as UsuarioLocal
      setUsuario(u)
      setSugestoes(buildSugestoes(u))
    } catch {
      // sem usuário salvo
    }
  }, [])

  useEffect(() => {
    if (aberto && mensagens.length === 0 && usuario.nome) {
      const boas_vindas: Mensagem = {
        id: 'boas-vindas',
        role: 'assistant',
        content: `Olá, **${usuario.nome}**! Sou o Assistente IA do Portal DCP.\n\nPosso te ajudar a:\n${buildSugestoes(usuario).map((s) => `• ${s}`).join('\n')}\n\nComo posso te ajudar hoje?`,
        timestamp: new Date(),
      }
      setMensagens([boas_vindas])
    }
  }, [aberto, usuario])

  useEffect(() => {
    // Rola só o container do chat (scrollIntoView rolaria a página inteira)
    if (!aberto || mensagens.length === 0) return
    const cont = messagesEndRef.current?.closest('.overflow-y-auto') as HTMLElement | null
    if (cont) cont.scrollTop = cont.scrollHeight
  }, [mensagens, aberto])

  const enviarMensagem = useCallback(
    async (texto: string) => {
      if (!texto.trim() || carregando) return

      const novaMensagemUser: Mensagem = {
        id: Date.now().toString(),
        role: 'user',
        content: texto.trim(),
        timestamp: new Date(),
      }

      setMensagens((prev) => [...prev, novaMensagemUser])
      setInput('')
      setCarregando(true)
      setMostrarSugestoes(false)

      // Monta histórico (sem a mensagem de boas-vindas automática e sem a mensagem atual)
      const historico = mensagens
        .filter((m) => m.id !== 'boas-vindas')
        .map((m) => ({ role: m.role, content: m.content }))

      try {
        const res = await authFetch(`${API_URL}/api/agente-tarefas/chat`, {
          method: 'POST',
          body: JSON.stringify({
            mensagem: texto.trim(),
            historico,
          }),
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ message: 'Erro desconhecido' }))
          throw new Error(err.message || `Erro ${res.status}`)
        }

        const data = await res.json()

        const novaMensagemAssistente: Mensagem = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.resposta,
          tools_usadas: data.tools_usadas,
          timestamp: new Date(),
        }

        setMensagens((prev) => [...prev, novaMensagemAssistente])
      } catch (err: any) {
        const mensagemErro: Mensagem = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Desculpe, ocorreu um erro: ${err.message || 'Tente novamente.'}`,
          timestamp: new Date(),
        }
        setMensagens((prev) => [...prev, mensagemErro])
      } finally {
        setCarregando(false)
      }
    },
    [mensagens, carregando],
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      enviarMensagem(input)
    }
  }

  const limparConversa = () => {
    setMensagens([])
    setMostrarSugestoes(true)
    // Reexibe boas-vindas
    if (usuario.nome) {
      const boas_vindas: Mensagem = {
        id: 'boas-vindas',
        role: 'assistant',
        content: `Olá, **${usuario.nome}**! Como posso te ajudar?`,
        timestamp: new Date(),
      }
      setMensagens([boas_vindas])
    }
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        onClick={() => setAberto((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-all duration-200 hover:scale-105"
        title="Assistente IA"
        aria-label="Abrir Assistente IA"
      >
        {aberto ? (
          <ChevronDown className="h-6 w-6" />
        ) : (
          <Bot className="h-6 w-6" />
        )}
      </button>

      {/* Painel de chat */}
      {aberto && (
        <div className="fixed bottom-24 right-6 z-50 flex w-96 flex-col rounded-xl border border-slate-200 bg-white shadow-2xl max-h-[600px]">
          {/* Header */}
          <div className="flex items-center justify-between rounded-t-xl bg-blue-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              <div>
                <p className="text-sm font-semibold">Assistente IA</p>
                <p className="text-xs text-blue-200">Portal DCP</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={limparConversa}
                className="rounded p-1 text-blue-200 hover:text-white hover:bg-blue-700 transition-colors"
                title="Limpar conversa"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  fill="currentColor"
                  viewBox="0 0 16 16"
                >
                  <path d="M2.5 1a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1H3v9a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V4h.5a1 1 0 0 0 1-1V2a1 1 0 0 0-1-1H10a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1H2.5zm3 4a.5.5 0 0 1 1 0v7a.5.5 0 0 1-1 0V5zm3 0a.5.5 0 0 1 1 0v7a.5.5 0 0 1-1 0V5z" />
                </svg>
              </button>
              <button
                onClick={() => setAberto(false)}
                className="rounded p-1 text-blue-200 hover:text-white hover:bg-blue-700 transition-colors"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0" style={{ maxHeight: '380px' }}>
            {mensagens.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
              >
                {/* Avatar */}
                <div
                  className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-white ${
                    msg.role === 'user' ? 'bg-slate-500' : 'bg-blue-600'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4" />
                  )}
                </div>

                {/* Bolha de mensagem */}
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-sm'
                      : 'bg-slate-100 text-slate-800 rounded-tl-sm'
                  }`}
                >
                  <div className="whitespace-pre-wrap leading-relaxed">
                    {msg.content.split('**').map((part, i) =>
                      i % 2 === 1 ? (
                        <strong key={i}>{part}</strong>
                      ) : (
                        <span key={i}>{part}</span>
                      ),
                    )}
                  </div>
                  {msg.tools_usadas && msg.tools_usadas.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {msg.tools_usadas.map((tool) => (
                        <Badge
                          key={tool}
                          variant="secondary"
                          className="text-xs px-1 py-0 h-4 bg-blue-100 text-blue-700"
                        >
                          {tool.replace(/_/g, ' ')}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {carregando && (
              <div className="flex gap-2">
                <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-600 text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="rounded-xl rounded-tl-sm bg-slate-100 px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Sugestões rápidas */}
          {mostrarSugestoes && mensagens.length <= 1 && (
            <div className="border-t border-slate-100 px-3 py-2">
              <p className="mb-1.5 text-xs text-slate-400">Sugestões:</p>
              <div className="flex flex-wrap gap-1">
                {sugestoes.slice(0, 4).map((s) => (
                  <button
                    key={s}
                    onClick={() => enviarMensagem(s)}
                    disabled={carregando}
                    className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="flex items-end gap-2 border-t border-slate-100 p-3">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite uma mensagem... (Enter para enviar)"
              className="min-h-[40px] max-h-24 resize-none rounded-xl border-slate-200 text-sm focus:border-blue-400"
              rows={1}
              disabled={carregando}
            />
            <Button
              onClick={() => enviarMensagem(input)}
              disabled={!input.trim() || carregando}
              size="sm"
              className="h-10 w-10 flex-shrink-0 rounded-xl bg-blue-600 p-0 hover:bg-blue-700"
            >
              {carregando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
