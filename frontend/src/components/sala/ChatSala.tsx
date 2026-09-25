'use client'

import { useState } from 'react'
import { MessageSquare, Send } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import type { DisputaMensagem } from './types'

/**
 * Chat oficial da sessão (canal único do motor — socket /disputa). Usado pelo
 * pregoeiro e pelo fornecedor; as mensagens ficam registradas no processo.
 */
export function ChatSala({
  mensagens,
  onEnviar,
  enviando,
  habilitado,
  titulo = 'Comunicação da sessão',
  descricao,
  placeholder = 'Escreva uma mensagem...',
  altura = 'h-[260px]',
}: {
  mensagens: DisputaMensagem[]
  onEnviar: (texto: string) => void
  enviando?: boolean
  habilitado?: boolean
  titulo?: string
  descricao?: string
  placeholder?: string
  altura?: string
}) {
  const [texto, setTexto] = useState('')

  const enviar = () => {
    if (!texto.trim()) return
    onEnviar(texto)
    setTexto('')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4" />
          {titulo}
        </CardTitle>
        {descricao && <CardDescription>{descricao}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className={`${altura} pr-3`}>
          <div className="space-y-3">
            {mensagens.length === 0 ? (
              <div className="rounded-lg border border-dashed px-3 py-5 text-sm text-slate-400">Nenhuma mensagem ainda.</div>
            ) : (
              mensagens.map((mensagem, index) => (
                <div key={`${mensagem.remetente}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <Badge variant="outline">{mensagem.tipo}</Badge>
                    <span className="text-xs text-slate-400">{new Date(mensagem.dataHora).toLocaleTimeString('pt-BR')}</span>
                  </div>
                  <div className="text-sm font-medium text-slate-800">{mensagem.remetente}</div>
                  <div className="mt-1 text-sm text-slate-600">{mensagem.conteudo}</div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <div className="space-y-2">
          <Textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={placeholder}
            rows={3}
            disabled={!habilitado}
          />
          <Button className="w-full" onClick={enviar} disabled={enviando || !habilitado || !texto.trim()}>
            <Send className="mr-2 h-4 w-4" />
            Enviar mensagem
          </Button>
          {!habilitado && <p className="text-xs text-slate-500">Chat fechado pelo pregoeiro nesta etapa.</p>}
        </div>
      </CardContent>
    </Card>
  )
}
