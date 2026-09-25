'use client'

/**
 * SALA DA DISPENSA ELETRÔNICA (fornecedor) — dentro da sala única
 * /fornecedor/licitacoes/[id]/sessao (plano E8 item 6; ex-/lances).
 * Fase de lances leve (IN SEGES 67/2021): durante a janela aberta pelo órgão,
 * o fornecedor reduz o PRÓPRIO valor por item. O menor valor de cada item é
 * público e ANÔNIMO. Tempo real pelo canal único (socket /disputa).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { io, type Socket } from 'socket.io-client'
import { Loader2, MessageSquare, TimerReset, TrendingDown, Trophy, Wifi, WifiOff } from 'lucide-react'
import { API_URL, authFetch, getAuthToken, hasValidSession } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { lerValorMonetario } from './PainelLancesFornecedor'

interface ItemPainel {
  item_licitacao_id: string
  numero_item: number
  descricao?: string
  quantidade?: number
  menor_valor: number | null
  total_lances: number
  meu_valor?: number
}

interface Painel {
  aberta: boolean
  dispensa_lances_inicio?: string | null
  dispensa_lances_fim?: string | null
  itens: ItemPainel[]
}

interface Mensagem {
  id: string
  autor_tipo: string
  autor_nome: string
  mensagem: string
  created_at?: string
}

const fmtMoeda = (v?: number | null) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))

function fmtRestante(ms: number) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function SalaDispensaFornecedor({ licitacaoId }: { licitacaoId: string }) {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [erros, setErros] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())
  const [wsOk, setWsOk] = useState(false)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [novaMensagem, setNovaMensagem] = useState('')
  const [enviandoMsg, setEnviandoMsg] = useState(false)
  const [erroMsg, setErroMsg] = useState<string | null>(null)
  const logado = useRef(false)
  /** Offset relógio-servidor: countdown imune a relógio errado no PC do fornecedor */
  const offsetRef = useRef(0)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const carregarPainel = useCallback(async () => {
    try {
      // O backend identifica o fornecedor pelo TOKEN (meu_valor só do logado)
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/lances/painel`)
      if (res.ok) {
        const j = await res.json()
        if (j.server_time) offsetRef.current = new Date(j.server_time).getTime() - Date.now()
        setPainel(j)
      }
    } catch {
      /* mantém o painel anterior */
    }
  }, [licitacaoId])

  const carregarMensagens = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/mensagens`)
      if (res.ok) setMensagens(await res.json())
    } catch {
      /* mantém */
    }
  }, [licitacaoId])

  useEffect(() => {
    logado.current = typeof window !== 'undefined' && !!localStorage.getItem('fornecedor')
    void carregarPainel()
    void carregarMensagens()

    const wsUrl = API_URL.replace('/api', '').replace('http', 'ws')
    // Canal ÚNICO de tempo real (/disputa). Handshake autenticado (sem token = anônimo)
    const token = hasValidSession() ? getAuthToken() : null
    const socket: Socket = io(`${wsUrl}/disputa`, { transports: ['websocket', 'polling'], auth: token ? { token } : undefined })
    socket.on('connect', () => {
      setWsOk(true)
      socket.emit('entrar_licitacao', { licitacaoId })
    })
    socket.on('disconnect', () => setWsOk(false))
    socket.on('sala_ok', (d: { server_time?: string }) => {
      if (d?.server_time) offsetRef.current = new Date(d.server_time).getTime() - Date.now()
    })
    socket.on('painel_atualizado', (d: { server_time?: string; item_licitacao_id: string; menor_valor: number | null; total_lances: number }) => {
      if (d?.server_time) offsetRef.current = new Date(d.server_time).getTime() - Date.now()
      setPainel((p) =>
        p
          ? {
              ...p,
              itens: p.itens.map((it) =>
                it.item_licitacao_id === d.item_licitacao_id ? { ...it, menor_valor: d.menor_valor, total_lances: d.total_lances } : it,
              ),
            }
          : p,
      )
    })
    socket.on('chat', (m: Mensagem) => setMensagens((prev) => [...prev, m]))
    socket.on('janela', (d: { server_time?: string; aberta?: boolean; dispensa_lances_inicio?: string; dispensa_lances_fim?: string }) => {
      if (d?.server_time) offsetRef.current = new Date(d.server_time).getTime() - Date.now()
      setPainel((p) =>
        p ? { ...p, aberta: d.aberta ?? true, dispensa_lances_inicio: d.dispensa_lances_inicio, dispensa_lances_fim: d.dispensa_lances_fim } : p,
      )
    })

    // Retaguarda: se o socket cair, o polling de 10s mantém tudo atualizado
    const poll = setInterval(carregarPainel, 10000)
    const tick = setInterval(() => setAgora(Date.now()), 1000)
    return () => {
      socket.disconnect()
      clearInterval(poll)
      clearInterval(tick)
    }
  }, [licitacaoId, carregarPainel, carregarMensagens])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  const enviarMensagem = async () => {
    const texto = novaMensagem.trim()
    if (!texto) return
    setEnviandoMsg(true)
    setErroMsg(null)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/mensagens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Autoria vem do token (fornecedor logado)
        body: JSON.stringify({ mensagem: texto }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      setNovaMensagem('')
      if (!wsOk) await carregarMensagens()
    } catch (e) {
      setErroMsg(`Mensagem não enviada: ${e instanceof Error ? e.message : 'erro'}`)
    } finally {
      setEnviandoMsg(false)
    }
  }

  const enviarLance = async (item: ItemPainel) => {
    const id = item.item_licitacao_id
    const erro = (m: string) => setErros((p) => ({ ...p, [id]: m }))
    if (!logado.current) return erro('Entre como fornecedor para dar lances.')
    const valor = lerValorMonetario(valores[id] || '')
    if (!(valor > 0)) return erro('Informe um valor válido.')
    if (item.meu_valor != null && valor >= item.meu_valor) {
      return erro(`O lance deve ser MENOR que o seu valor atual (${fmtMoeda(item.meu_valor)}).`)
    }
    setErros((p) => ({ ...p, [id]: '' }))
    setEnviando(id)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/lances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Fornecedor identificado pelo token
        body: JSON.stringify({ item_licitacao_id: id, valor_unitario: valor }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      setValores((p) => ({ ...p, [id]: '' }))
      await carregarPainel()
    } catch (e) {
      erro(`Lance não registrado: ${e instanceof Error ? e.message : 'erro'}`)
    } finally {
      setEnviando(null)
    }
  }

  if (!painel) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const fim = painel.dispensa_lances_fim ? new Date(painel.dispensa_lances_fim).getTime() : null
  const restanteMs = fim ? Math.max(0, fim - (agora + offsetRef.current)) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Badge
          variant="outline"
          className={wsOk ? 'border-green-300 text-green-700' : 'border-amber-300 text-amber-700'}
          title={wsOk ? 'Atualização instantânea' : 'Reconectando — atualizando a cada 10s'}
        >
          {wsOk ? <Wifi className="mr-1 h-3.5 w-3.5" /> : <WifiOff className="mr-1 h-3.5 w-3.5" />}
          {wsOk ? 'AO VIVO' : 'reconectando'}
        </Badge>
        {painel.aberta && restanteMs != null ? (
          <Badge className="bg-green-100 px-3 py-1 font-mono text-base text-green-800 hover:bg-green-100" title="Cronômetro sincronizado com o relógio do servidor">
            <TimerReset className="mr-1 h-4 w-4" /> {fmtRestante(restanteMs)}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-gray-500">
            {painel.dispensa_lances_inicio ? 'Fase de lances encerrada' : 'Fase de lances ainda não aberta'}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-normal text-gray-600">
            O menor valor exibido é <b>anônimo</b>. Seu lance precisa ser <b>menor que o seu próprio valor atual</b> — você não é obrigado a
            cobrir o menor valor global. Ao final, vence o menor valor por item.
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {painel.itens.map((it) => {
            const souMenor = it.meu_valor != null && it.menor_valor != null && it.meu_valor <= it.menor_valor
            return (
              <div key={it.item_licitacao_id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      Item {it.numero_item} — {it.descricao?.slice(0, 80)}
                    </div>
                    <div className="text-xs text-gray-400">
                      Qtd: {Number(it.quantidade || 0).toLocaleString('pt-BR')} · {it.total_lances} lance(s) no item
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <div className="text-[11px] uppercase text-gray-400">Menor valor</div>
                      <div className="flex items-center gap-1 font-semibold text-green-700">
                        <TrendingDown className="h-3.5 w-3.5" />
                        {fmtMoeda(it.menor_valor)}
                      </div>
                    </div>
                    {it.meu_valor != null && (
                      <div className="text-right">
                        <div className="text-[11px] uppercase text-gray-400">Seu valor</div>
                        <div className={`flex items-center gap-1 font-semibold ${souMenor ? 'text-green-700' : 'text-amber-600'}`}>
                          {fmtMoeda(it.meu_valor)} {souMenor && <Trophy className="h-3.5 w-3.5" />}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {painel.aberta && it.meu_valor != null && (
                  <div className="mt-3 flex items-center gap-2">
                    <Input
                      inputMode="decimal"
                      placeholder="Novo valor unitário (menor que o seu)"
                      value={valores[it.item_licitacao_id] || ''}
                      onChange={(e) => setValores((p) => ({ ...p, [it.item_licitacao_id]: e.target.value }))}
                      className="max-w-[240px] text-right"
                    />
                    <Button size="sm" onClick={() => enviarLance(it)} disabled={enviando === it.item_licitacao_id}>
                      {enviando === it.item_licitacao_id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Dar lance'}
                    </Button>
                  </div>
                )}
                {erros[it.item_licitacao_id] && <p className="mt-2 text-xs text-red-700">{erros[it.item_licitacao_id]}</p>}
                {painel.aberta && it.meu_valor == null && (
                  <p className="mt-2 text-xs text-gray-400">Você não tem proposta válida para este item — não é possível dar lances.</p>
                )}
              </div>
            )
          })}
          {painel.itens.length === 0 && <p className="text-sm text-gray-500">Nenhum item encontrado.</p>}
        </CardContent>
      </Card>

      {/* Chat da sessão — registrado nos autos; autoria anônima durante os lances */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" /> Chat da sessão
            <span className="text-xs font-normal text-gray-400">
              — mensagens registradas no processo; durante os lances a identidade dos fornecedores fica anônima
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56 space-y-2 overflow-y-auto rounded-md border bg-slate-50 p-3">
            {mensagens.length === 0 && <p className="text-xs text-gray-400">Nenhuma mensagem ainda.</p>}
            {mensagens.map((m) => (
              <div key={m.id} className={`max-w-[85%] text-sm ${m.autor_tipo === 'ORGAO' ? '' : 'ml-auto text-right'}`}>
                <div className={`inline-block rounded-md px-3 py-1.5 ${m.autor_tipo === 'ORGAO' ? 'border border-blue-100 bg-blue-50' : 'border bg-white'}`}>
                  <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                    {m.autor_tipo === 'ORGAO' ? `Órgão · ${m.autor_nome}` : m.autor_nome}
                    {' · '}
                    {m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-BR') : ''}
                  </span>
                  {m.mensagem}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <Input
              placeholder="Mensagem ao órgão (fica registrada no processo)…"
              value={novaMensagem}
              onChange={(e) => setNovaMensagem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void enviarMensagem()
              }}
              maxLength={1000}
            />
            <Button size="sm" onClick={enviarMensagem} disabled={enviandoMsg || !novaMensagem.trim()}>
              {enviandoMsg ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
            </Button>
          </div>
          {erroMsg && <p className="mt-2 text-xs text-red-700">{erroMsg}</p>}
        </CardContent>
      </Card>
    </div>
  )
}
