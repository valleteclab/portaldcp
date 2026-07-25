"use client"

/**
 * SALA DE LANCES DA DISPENSA ELETRÔNICA (fornecedor).
 * Fase de lances leve (modelo IN SEGES 67/2021): durante a janela aberta pelo
 * órgão, o fornecedor reduz o PRÓPRIO valor por item. O menor valor de cada
 * item é público e ANÔNIMO; ninguém vê quem deu o lance.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ArrowLeft, Gavel, Loader2, TimerReset, TrendingDown } from "lucide-react"

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
  const fornecedorRef = useRef<any>(null)

  const carregarPainel = useCallback(async () => {
    try {
      const fornecedor = fornecedorRef.current
      const res = await authFetch(
        `${API_URL}/api/licitacoes/${id}/dispensa/lances/painel${fornecedor?.id ? `?fornecedorId=${fornecedor.id}` : ""}`,
      )
      if (res.ok) setPainel(await res.json())
    } catch { /* mantém o painel anterior */ }
  }, [id])

  useEffect(() => {
    try { fornecedorRef.current = JSON.parse(localStorage.getItem("fornecedor") || "null") } catch { /* sem login */ }
    authFetch(`${API_URL}/api/licitacoes/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setLicitacao)
      .catch(() => null)
    carregarPainel()
    const pollPainel = setInterval(carregarPainel, 5000)
    const tick = setInterval(() => setAgora(Date.now()), 1000)
    return () => { clearInterval(pollPainel); clearInterval(tick) }
  }, [id, carregarPainel])

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

  const fim = painel?.dispensa_lances_fim ? new Date(painel.dispensa_lances_fim).getTime() : null
  const restanteMs = fim ? Math.max(0, fim - agora) : null
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
        {painel.aberta && restanteMs != null ? (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 text-base px-3 py-1 font-mono">
            <TimerReset className="w-4 h-4 mr-1" /> {fmtRestante(restanteMs)}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-gray-500">Fase de lances encerrada</Badge>
        )}
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
    </div>
  )
}
