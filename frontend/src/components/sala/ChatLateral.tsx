'use client'

/**
 * CHAT EM PAINEL LATERAL (dono, 09/11/2026 — como a BLL): botão no topo da sala
 * com o total de mensagens novas; abre o chat da sessão num painel à direita.
 * A tela fica inteira para os lotes.
 */
import { useState } from 'react'
import { MessageSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ChatSala } from './ChatSala'
import type { DisputaMensagem } from './types'

export function ChatLateral({
  mensagens,
  onEnviar,
  enviando,
  habilitado,
  descricao,
  placeholder,
}: {
  mensagens: DisputaMensagem[]
  onEnviar: (texto: string) => void
  enviando?: boolean
  habilitado?: boolean
  descricao?: string
  placeholder?: string
}) {
  const [aberto, setAberto] = useState(false)
  const [vistas, setVistas] = useState(0)
  const novas = aberto ? 0 : Math.max(0, mensagens.length - vistas)
  const abrir = () => {
    setVistas(mensagens.length)
    setAberto(true)
  }
  const fechar = () => {
    setVistas(mensagens.length)
    setAberto(false)
  }
  return (
    <>
      <Button variant="outline" onClick={aberto ? fechar : abrir} className="relative">
        <MessageSquare className="mr-2 h-4 w-4" /> Chat
        <span className={`ml-2 rounded-full px-2 text-xs font-semibold ${novas ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
          {novas || mensagens.length}
        </span>
      </Button>
      {aberto && (
        <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-white shadow-2xl" role="dialog" aria-label="Chat da sessão">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div className="font-semibold">Chat da sessão</div>
            <Button size="sm" variant="ghost" onClick={fechar} aria-label="Fechar o chat">
              <X className="h-4 w-4" />
            </Button>
          </div>
          {/* A lista de mensagens cede espaço ao campo e ao botão de envio: com 260 px de folga, numa tela
              de 800 px o botão "Enviar mensagem" ficava fora da tela (gravação do pregão 2026/00072) */}
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ChatSala mensagens={mensagens} onEnviar={onEnviar} enviando={enviando} habilitado={habilitado} descricao={descricao} placeholder={placeholder} altura="h-[max(160px,calc(100dvh-430px))]" />
          </div>
        </div>
      )}
    </>
  )
}
