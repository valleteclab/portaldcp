"use client"

/**
 * SALA DE LANCES DA DISPENSA ELETRÔNICA (fornecedor).
 * Fase de lances leve (modelo IN SEGES 67/2021): durante a janela aberta pelo
 * órgão, o fornecedor reduz o PRÓPRIO valor por item. O menor valor de cada
 * item é público e ANÔNIMO; ninguém vê quem deu o lance.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { io, type Socket } from "socket.io-client"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Gavel, Loader2, TimerReset, TrendingDown, MessageSquare, Wifi, WifiOff } from "lucide-react"

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

const fmtMoeda = (v?: number | null) =>
  v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export default function SalaLancesDispensaPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [painel, setPainel] = useState<Painel | null>(null)
  const [licitacao, setLicitacao] = useState<any>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())
  const [wsOk, setWsOk] = useState(false)
  const [mensagens, setMensagens] = useState<any[]>([])
  const [novaMensagem, setNovaMensagem] = useState("")
  const [enviandoMsg, setEnviandoMsg] = useState(false)
  const fornecedorRef = useRef<any>(null)
  const socketRef = useRef<Socket | null>(null)
  /** Offset relógio-servidor: countdown imune a relógio errado no PC do fornecedor */
  const offsetRef = useRef(0)
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  const carregarPainel = useCallback(async () => {
    try {
      const fornecedor = fornecedorRef.current
      const res = await authFetch(
        `${API_URL}/api/licitacoes/${id}/dispensa/lances/painel${fornecedor?.id ? `?fornecedorId=${fornecedor.id}` : ""}`,
      )
      if (res.ok) {
        const j = await res.json()
        if (j.server_time) offsetRef.current = new Date(j.server_time).getTime() - Date.now()
        setPainel(j)
      }
    } catch { /* mantém o painel anterior */ }
  }, [id])

  const carregarMensagens = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/dispensa/mensagens`)
      if (res.ok) setMensagens(await res.json())
    } catch { /* mantém */ }
  }, [id])

  useEffect(() => {
    try { fornecedorRef.current = JSON.parse(localStorage.getItem("fornecedor") || "null") } catch { /* sem login */ }
    authFetch(`${API_URL}/api/licitacoes/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setLicitacao)
      .catch(() => null)
    carregarPainel()
    carregarMensagens()

    // ── Tempo real: WebSocket (push instantâneo); polling fica como retaguarda ──
    const wsUrl = API_URL.replace("/api", "").replace("http", "ws")
    const socket = io(`${wsUrl}/dispensa`, { transports: ["websocket", "polling"] })
    socketRef.current = socket
    socket.on("connect", () => { setWsOk(true); socket.emit("entrar_sala", { licitacaoId: id }) })
    socket.on("disconnect", () => setWsOk(false))
    socket.on("sala_ok", (d: any) => { if (d?.server_time) offsetRef.current = new Date(d.server_time).getTime() - Date.now() })
    socket.on("painel_atualizado", (d: any) => {
      if (d?.server_time) offsetRef.current = new Date(d.server_time).getTime() - Date.now()
      setPainel((p) => p ? {
        ...p,
        itens: p.itens.map((it) => it.item_licitacao_id === d.item_licitacao_id
          ? { ...it, menor_valor: d.menor_valor, total_lances: d.total_lances }
          : it),
      } : p)
    })
    socket.on("chat", (m: any) => setMensagens((prev) => [...prev, m]))
    socket.on("janela", (d: any) => {
      if (d?.server_time) offsetRef.current = new Date(d.server_time).getTime() - Date.now()
      setPainel((p) => p ? { ...p, aberta: true, dispensa_lances_inicio: d.dispensa_lances_inicio, dispensa_lances_fim: d.dispensa_lances_fim } : p)
    })

    // Retaguarda: se o socket cair, o polling de 10s mantém tudo atualizado
    const pollPainel = setInterval(carregarPainel, 10000)
    const tick = setInterval(() => setAgora(Date.now()), 1000)
    return () => { socket.disconnect(); clearInterval(pollPainel); clearInterval(tick) }
  }, [id, carregarPainel, carregarMensagens])

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }) }, [mensagens])

  const enviarMensagem = async () => {
    const fornecedor = fornecedorRef.current
    const texto = novaMensagem.trim()
    if (!texto || !fornecedor?.id) return
    setEnviandoMsg(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/dispensa/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autor_tipo: "FORNECEDOR", fornecedor_id: fornecedor.id, mensagem: texto }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      setNovaMensagem("")
      // a própria mensagem chega pelo socket; fallback:
      if (!wsOk) await carregarMensagens()
    } catch (e: any) {
      alert(`Mensagem não enviada: ${e.message}`)
    } finally {
      setEnviandoMsg(false)
    }
  }

  const enviarLance = async (item: ItemPainel) => {
    const fornecedor = fornecedorRef.current
    if (!fornecedor?.id) {
      alert("Faça login como fornecedor para dar lances.")
      return
    }
    const bruto = valores[item.item_licitacao_id]
    const valor = Number(String(bruto || "").replace(/\./g, "").replace(",", "."))
    if (!(valor > 0)) { alert("Informe um valor válido."); return }
    if (item.meu_valor != null && valor >= item.meu_valor) {
      alert(`O lance deve ser MENOR que o seu valor atual (${fmtMoeda(item.meu_valor)}).`)
      return
    }
    setEnviando(item.item_licitacao_id)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/dispensa/lances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_licitacao_id: item.item_licitacao_id,
          fornecedor_id: fornecedor.id,
          valor_unitario: valor,
        }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      setValores((p) => ({ ...p, [item.item_licitacao_id]: "" }))
      await carregarPainel()
    } catch (e: any) {
      alert(`Lance não registrado: ${e.message}`)
    } finally {
      setEnviando(null)
    }
  }

  // Countdown pelo relógio do SERVIDOR (agora local + offset)
  const fim = painel?.dispensa_lances_fim ? new Date(painel.dispensa_lances_fim).getTime() : null
  const restanteMs = fim ? Math.max(0, fim - (agora + offsetRef.current)) : null
  const fmtRestante = (ms: number) => {
    const s = Math.floor(ms / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const ss = s % 60
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
  }

  if (!painel) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Gavel className="w-5 h-5 text-green-700" />
            Sala de lances — Dispensa Eletrônica
          </h1>
          <p className="text-sm text-gray-500 truncate">{licitacao?.numero_processo} · {licitacao?.objeto}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className={wsOk ? "border-green-300 text-green-700" : "border-amber-300 text-amber-700"} title={wsOk ? "Atualização instantânea via conexão em tempo real" : "Reconectando — atualizando a cada 10s"}>
            {wsOk ? <Wifi className="w-3.5 h-3.5 mr-1" /> : <WifiOff className="w-3.5 h-3.5 mr-1" />}
            {wsOk ? "AO VIVO" : "reconectando"}
          </Badge>
          {painel.aberta && restanteMs != null ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-base px-3 py-1 font-mono" title="Cronômetro sincronizado com o relógio do servidor">
              <TimerReset className="w-4 h-4 mr-1" /> {fmtRestante(restanteMs)}
            </Badge>
          ) : (
            <Badge variant="outline" className="text-gray-500">Fase de lances encerrada</Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-gray-600 font-normal">
            O menor valor exibido é <b>anônimo</b>. Seu lance precisa ser <b>menor que o seu próprio valor atual</b> — você não é obrigado a cobrir o menor valor global. Ao final, vence o menor valor por item.
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {painel.itens.map((it) => {
            const souMenor = it.meu_valor != null && it.menor_valor != null && it.meu_valor <= it.menor_valor
            return (
              <div key={it.item_licitacao_id} className="border rounded-md p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-medium text-sm">Item {it.numero_item} — {it.descricao?.slice(0, 80)}</div>
                    <div className="text-xs text-gray-400">Qtd: {Number(it.quantidade || 0).toLocaleString("pt-BR")} · {it.total_lances} lance(s) no item</div>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <div className="text-right">
                      <div className="text-[11px] text-gray-400 uppercase">Menor valor</div>
                      <div className="font-semibold text-green-700 flex items-center gap-1">
                        <TrendingDown className="w-3.5 h-3.5" />{fmtMoeda(it.menor_valor)}
                      </div>
                    </div>
                    {it.meu_valor != null && (
                      <div className="text-right">
                        <div className="text-[11px] text-gray-400 uppercase">Seu valor</div>
                        <div className={`font-semibold ${souMenor ? "text-green-700" : "text-amber-600"}`}>
                          {fmtMoeda(it.meu_valor)} {souMenor ? "🏆" : ""}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {painel.aberta && it.meu_valor != null && (
                  <div className="flex items-center gap-2 mt-3">
                    <Input
                      inputMode="decimal"
                      placeholder="Novo valor unitário (menor que o seu)"
                      value={valores[it.item_licitacao_id] || ""}
                      onChange={(e) => setValores((p) => ({ ...p, [it.item_licitacao_id]: e.target.value }))}
                      className="max-w-[240px] text-right"
                    />
                    <Button size="sm" onClick={() => enviarLance(it)} disabled={enviando === it.item_licitacao_id}>
                      {enviando === it.item_licitacao_id ? <Loader2 className="w-4 h-4 animate-spin" /> : "Dar lance"}
                    </Button>
                  </div>
                )}
                {painel.aberta && it.meu_valor == null && (
                  <p className="text-xs text-gray-400 mt-2">Você não tem proposta válida para este item — não é possível dar lances.</p>
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
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Chat da sessão
            <span className="text-xs font-normal text-gray-400">— mensagens registradas no processo; durante os lances a identidade dos fornecedores fica anônima</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md bg-slate-50 p-3 h-56 overflow-y-auto space-y-2">
            {mensagens.length === 0 && <p className="text-xs text-gray-400">Nenhuma mensagem ainda.</p>}
            {mensagens.map((m) => (
              <div key={m.id} className={`text-sm max-w-[85%] ${m.autor_tipo === "ORGAO" ? "" : "ml-auto text-right"}`}>
                <div className={`inline-block px-3 py-1.5 rounded-md ${m.autor_tipo === "ORGAO" ? "bg-blue-50 border border-blue-100" : "bg-white border"}`}>
                  <span className="block text-[10px] uppercase tracking-wide text-gray-400">
                    {m.autor_tipo === "ORGAO" ? `🏛️ ${m.autor_nome}` : m.autor_nome}
                    {" · "}{m.created_at ? new Date(m.created_at).toLocaleTimeString("pt-BR") : ""}
                  </span>
                  {m.mensagem}
                </div>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <Input
              placeholder="Mensagem ao órgão (fica registrada no processo)…"
              value={novaMensagem}
              onChange={(e) => setNovaMensagem(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") enviarMensagem() }}
              maxLength={1000}
            />
            <Button size="sm" onClick={enviarMensagem} disabled={enviandoMsg || !novaMensagem.trim()}>
              {enviandoMsg ? <Loader2 className="w-4 h-4 animate-spin" /> : "Enviar"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
