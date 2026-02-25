'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Send, MessageCircle, Phone, Plus, Search, CheckCheck, Check } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { authFetch, getAuthToken } from '@/lib/api'

interface Conversa {
  id: string
  phone: string
  nome_contato: string
  ultima_mensagem: string | null
  ultima_mensagem_em: string | null
  mensagens_nao_lidas: number
  status: string
}

interface Mensagem {
  id: string
  conversa_id: string
  direcao: 'ENVIADA' | 'RECEBIDA'
  conteudo: string
  status: string
  created_at: string
}

function formatHora(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function formatData(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  const hoje = new Date()
  if (d.toDateString() === hoje.toDateString()) return 'Hoje'
  const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1)
  if (d.toDateString() === ontem.toDateString()) return 'Ontem'
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'LIDA') return <CheckCheck className="h-3.5 w-3.5 text-blue-400" />
  if (status === 'ENTREGUE') return <CheckCheck className="h-3.5 w-3.5 text-gray-400" />
  if (status === 'ENVIADA') return <Check className="h-3.5 w-3.5 text-gray-400" />
  if (status === 'FALHA') return <span className="text-red-500 text-xs">!</span>
  return null
}

export default function WhatsappChatPage() {
  const [conversas, setConversas]     = useState<Conversa[]>([])
  const [ativa, setAtiva]             = useState<Conversa | null>(null)
  const [mensagens, setMensagens]     = useState<Mensagem[]>([])
  const [texto, setTexto]             = useState('')
  const [enviando, setEnviando]       = useState(false)
  const [busca, setBusca]             = useState('')
  const [novaConversa, setNovaConversa] = useState(false)
  const [novoPhone, setNovoPhone]     = useState('')
  const [novoNome, setNovoNome]       = useState('')
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  // ── Carregar conversas ─────────────────────────────────────────────────────
  const carregarConversas = useCallback(async () => {
    const res = await authFetch('/api/whatsapp/chat/conversas')
    if (res.ok) setConversas(await res.json())
  }, [])

  useEffect(() => { carregarConversas() }, [carregarConversas])

  // ── Carregar mensagens ao selecionar conversa ──────────────────────────────
  const abrirConversa = useCallback(async (c: Conversa) => {
    setAtiva(c)
    setMensagens([])
    const res = await authFetch(`/api/whatsapp/chat/conversas/${c.id}/mensagens`)
    if (res.ok) setMensagens(await res.json())
    await authFetch(`/api/whatsapp/chat/conversas/${c.id}/lida`, { method: 'PATCH' })
    setConversas(prev => prev.map(x => x.id === c.id ? { ...x, mensagens_nao_lidas: 0 } : x))
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  // ── Scroll automático ──────────────────────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  // ── Polling – mensagens em tempo real (fallback sem SSE) ─────────────────
  useEffect(() => {
    const interval = setInterval(async () => {
      await carregarConversas()
      if (ativa) {
        const res = await authFetch(`/api/whatsapp/chat/conversas/${ativa.id}/mensagens`)
        if (res.ok) {
          const novasMsgs: Mensagem[] = await res.json()
          setMensagens(prev => {
            if (novasMsgs.length !== prev.length) return novasMsgs
            return prev
          })
        }
      }
    }, 4000)
    return () => clearInterval(interval)
  }, [carregarConversas, ativa])

  // ── Enviar mensagem ────────────────────────────────────────────────────────
  const enviar = async () => {
    if (!texto.trim() || !ativa || enviando) return
    setEnviando(true)
    const conteudo = texto.trim()
    setTexto('')
    const res = await authFetch(`/api/whatsapp/chat/conversas/${ativa.id}/mensagens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conteudo }),
    })
    if (res.ok) {
      const nova: Mensagem = await res.json()
      setMensagens(prev => [...prev, nova])
      setConversas(prev => prev.map(c =>
        c.id === ativa.id ? { ...c, ultima_mensagem: conteudo, ultima_mensagem_em: nova.created_at } : c
      ))
    }
    setEnviando(false)
    inputRef.current?.focus()
  }

  // ── Iniciar nova conversa ──────────────────────────────────────────────────
  const iniciarConversa = async () => {
    if (!novoPhone.trim()) return
    const res = await authFetch('/api/whatsapp/chat/conversas/iniciar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: novoPhone, nomeContato: novoNome || undefined }),
    })
    if (res.ok) {
      const c: Conversa = await res.json()
      setConversas(prev => [c, ...prev.filter(x => x.id !== c.id)])
      setNovaConversa(false)
      setNovoPhone('')
      setNovoNome('')
      abrirConversa(c)
    }
  }

  const conversasFiltradas = conversas.filter(c =>
    c.nome_contato?.toLowerCase().includes(busca.toLowerCase()) ||
    c.phone.includes(busca)
  )

  // ── Agrupar mensagens por data ─────────────────────────────────────────────
  const mensagensComData: Array<Mensagem | { tipo: 'separador'; data: string }> = []
  let ultimaData = ''
  for (const m of mensagens) {
    const d = new Date(m.created_at).toDateString()
    if (d !== ultimaData) {
      mensagensComData.push({ tipo: 'separador', data: m.created_at })
      ultimaData = d
    }
    mensagensComData.push(m)
  }

  return (
    <div className="flex h-[calc(100vh-64px)] bg-[#f0f2f5]">

      {/* ── PAINEL ESQUERDO: lista de conversas ──────────────────────── */}
      <div className="w-[360px] flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[#075e54]">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-6 w-6 text-white" />
            <span className="text-white font-semibold text-lg">WhatsApp</span>
          </div>
          <Button
            variant="ghost" size="icon"
            className="text-white hover:bg-white/20"
            onClick={() => setNovaConversa(true)}
            title="Nova conversa"
          >
            <Plus className="h-5 w-5" />
          </Button>
        </div>

        {/* Busca */}
        <div className="px-3 py-2 bg-white">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Buscar ou começar nova conversa"
              className="pl-9 bg-[#f0f2f5] border-0 rounded-full text-sm h-9"
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto">
          {conversasFiltradas.length === 0 && (
            <div className="text-center text-gray-400 text-sm mt-12 px-6">
              <MessageCircle className="h-10 w-10 mx-auto mb-3 text-gray-300" />
              Nenhuma conversa encontrada
            </div>
          )}
          {conversasFiltradas.map(c => (
            <button
              key={c.id}
              onClick={() => abrirConversa(c)}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 border-b border-gray-100 hover:bg-[#f5f6f6] transition-colors ${ativa?.id === c.id ? 'bg-[#f0f2f5]' : ''}`}
            >
              <div className="w-12 h-12 rounded-full bg-[#128c7e] flex items-center justify-center flex-shrink-0">
                <span className="text-white font-semibold text-lg">
                  {(c.nome_contato || c.phone)[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-900 truncate">{c.nome_contato || c.phone}</span>
                  <span className="text-xs text-gray-400 ml-2 flex-shrink-0">{formatData(c.ultima_mensagem_em)}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-sm text-gray-500 truncate">{c.ultima_mensagem || ''}</span>
                  {c.mensagens_nao_lidas > 0 && (
                    <Badge className="ml-2 bg-[#25d366] text-white text-xs h-5 min-w-[20px] flex items-center justify-center rounded-full flex-shrink-0">
                      {c.mensagens_nao_lidas}
                    </Badge>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── PAINEL DIREITO: chat ──────────────────────────────────────── */}
      {ativa ? (
        <div className="flex-1 flex flex-col">

          {/* Header do chat */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#075e54] shadow-sm">
            <div className="w-10 h-10 rounded-full bg-[#128c7e] flex items-center justify-center flex-shrink-0">
              <span className="text-white font-semibold">
                {(ativa.nome_contato || ativa.phone)[0].toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-white font-semibold leading-tight">{ativa.nome_contato || ativa.phone}</p>
              <p className="text-green-200 text-xs flex items-center gap-1">
                <Phone className="h-3 w-3" /> {ativa.phone}
              </p>
            </div>
          </div>

          {/* Área de mensagens */}
          <div
            className="flex-1 overflow-y-auto px-4 py-3 space-y-1"
            style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400'%3E%3Crect width='400' height='400' fill='%23e5ddd5'/%3E%3C/svg%3E\")" }}
          >
            {mensagensComData.map((item, i) => {
              if ('tipo' in item) {
                return (
                  <div key={`sep-${i}`} className="flex justify-center my-2">
                    <span className="bg-white/80 text-gray-500 text-xs px-3 py-1 rounded-full shadow-sm">
                      {formatData(item.data)}
                    </span>
                  </div>
                )
              }
              const m = item as Mensagem
              const enviada = m.direcao === 'ENVIADA'
              return (
                <div key={m.id} className={`flex ${enviada ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[72%] px-3 py-2 rounded-lg shadow-sm relative ${
                      enviada
                        ? 'bg-[#d9fdd3] rounded-tr-none'
                        : 'bg-white rounded-tl-none'
                    }`}
                  >
                    <p className="text-gray-900 text-sm whitespace-pre-wrap break-words">{m.conteudo}</p>
                    <div className={`flex items-center gap-1 mt-0.5 ${enviada ? 'justify-end' : 'justify-end'}`}>
                      <span className="text-gray-400 text-[10px]">{formatHora(m.created_at)}</span>
                      {enviada && <StatusIcon status={m.status} />}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={bottomRef} />
          </div>

          {/* Input de envio */}
          <div className="flex items-center gap-2 px-4 py-3 bg-[#f0f2f5] border-t border-gray-200">
            <Input
              ref={inputRef}
              placeholder="Digite uma mensagem"
              className="flex-1 rounded-full bg-white border-0 px-4 h-10 text-sm focus-visible:ring-0"
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); enviar() } }}
              disabled={enviando}
            />
            <Button
              onClick={enviar}
              disabled={!texto.trim() || enviando}
              className="w-10 h-10 rounded-full bg-[#128c7e] hover:bg-[#075e54] flex-shrink-0 p-0"
            >
              <Send className="h-4 w-4 text-white" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-[#f0f2f5]">
          <MessageCircle className="h-16 w-16 text-gray-300 mb-4" />
          <h2 className="text-xl font-light text-gray-500">WhatsApp Portal DCP</h2>
          <p className="text-sm text-gray-400 mt-2">Selecione uma conversa para começar</p>
        </div>
      )}

      {/* ── Modal nova conversa ───────────────────────────────────────── */}
      <Dialog open={novaConversa} onOpenChange={setNovaConversa}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova Conversa</DialogTitle>
            <DialogDescription>Informe o número do WhatsApp</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Número (com DDD e país)</Label>
              <Input
                placeholder="Ex: 5511999999999"
                value={novoPhone}
                onChange={e => setNovoPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Nome do contato (opcional)</Label>
              <Input
                placeholder="Ex: João Silva"
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
              />
            </div>
            <Button
              className="w-full bg-[#128c7e] hover:bg-[#075e54]"
              onClick={iniciarConversa}
              disabled={!novoPhone.trim()}
            >
              Iniciar Conversa
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
