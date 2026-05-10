"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ChevronRight, Home, Check, Eye, X, Filter, History,
  AlertCircle, Loader2,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { API_URL, authFetch } from "@/lib/api"

// ─── Types ────────────────────────────────────────────────────────────────────

type StepStatus = "aprovado" | "andamento" | "pendente" | "devolvido"

interface FluxoStep {
  papel: string
  nome: string
  status: StepStatus
  data: string | null
}

interface Aprovacao {
  id: string
  tipo: string
  proc: string
  objeto: string
  status: "andamento" | "devolvido" | "aprovado"
  etapaAtual: string
  fluxo: FluxoStep[]
  prazo: string
  minha: boolean
  motivo?: string
  documentoId: string | null
  licitacaoId: string | null
}

interface MeInfo {
  id: string
  nome?: string
  email?: string
  orgao?: { id: string }
  orgaoId?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapBackendToAprovacao(doc: any): Aprovacao {
  const fluxo: FluxoStep[] = (doc.fluxo || []).map((f: any) => ({
    papel: f.papel,
    nome: f.nome,
    status:
      f.status === "APROVADO" ? "aprovado" :
      f.status === "REPROVADO" ? "devolvido" :
      f.status === "AGUARDANDO_APROVACAO" ? "andamento" : "pendente",
    data: f.data || null,
  }))

  return {
    id: doc.id,
    tipo: doc.titulo || doc.tipo || "Documento",
    proc: doc.licitacao?.numero_processo || doc.licitacaoId || "—",
    objeto: doc.licitacao?.objeto || "—",
    status:
      doc.status === "REPROVADO" ? "devolvido" :
      doc.status === "APROVADO" ? "aprovado" : "andamento",
    etapaAtual: doc.etapaAtual || "—",
    fluxo,
    prazo: doc.prazoAprovacao
      ? new Date(doc.prazoAprovacao).toLocaleDateString("pt-BR")
      : "—",
    minha: !!doc.minha,
    motivo: doc.motivo || doc.observacaoAprovacao,
    documentoId: doc.id,
    licitacaoId: doc.licitacaoId || null,
  }
}

// ─── Step circle ──────────────────────────────────────────────────────────────

const STATUS_CIRCLE: Record<StepStatus, { bg: string; border: string; text: string }> = {
  aprovado:  { bg: "bg-[#e3f5e8]", border: "border-[#168821]", text: "text-[#168821]" },
  andamento: { bg: "bg-[#ecf3fc]", border: "border-[#1351b4]", text: "text-[#1351b4]" },
  pendente:  { bg: "bg-gray-100",  border: "border-gray-300",  text: "text-gray-400"  },
  devolvido: { bg: "bg-red-50",    border: "border-red-500",   text: "text-red-600"   },
}

function StepCircle({ step, index }: { step: FluxoStep; index: number }) {
  const s = STATUS_CIRCLE[step.status]
  return (
    <div
      className={`w-7 h-7 rounded-full flex items-center justify-center border-2 shrink-0 text-xs font-bold ${s.bg} ${s.border} ${s.text}`}
    >
      {step.status === "aprovado"  && <Check className="w-3.5 h-3.5" />}
      {step.status === "devolvido" && <X className="w-3.5 h-3.5" />}
      {(step.status === "andamento" || step.status === "pendente") && <span>{index + 1}</span>}
    </div>
  )
}

function FluxoFlow({ fluxo }: { fluxo: FluxoStep[] }) {
  return (
    <div className="flex items-start gap-0 mt-3">
      {fluxo.map((step, idx) => {
        const isLast = idx === fluxo.length - 1
        const lineGreen = !isLast && step.status === "aprovado"
        return (
          <div key={idx} className="flex items-start flex-1">
            <div className="flex flex-col items-center flex-1">
              <StepCircle step={step} index={idx} />
              <div className="text-center mt-1.5">
                <div className="text-[10px] font-semibold text-gray-700 leading-tight">{step.papel}</div>
                <div className="text-[10px] text-gray-400 leading-tight truncate max-w-[72px]">{step.nome}</div>
                {step.data && (
                  <div className="text-[9px] text-gray-400 leading-tight">{step.data}</div>
                )}
              </div>
            </div>
            {!isLast && (
              <div
                className={`h-0.5 w-6 mt-3 shrink-0 ${lineGreen ? "bg-[#168821]" : "bg-gray-200"}`}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Approval card ────────────────────────────────────────────────────────────

function AprovacaoCard({
  item,
  me,
  onAprovar,
  onDevolver,
  loading,
}: {
  item: Aprovacao
  me: MeInfo | null
  onAprovar: (item: Aprovacao) => void
  onDevolver: (item: Aprovacao) => void
  loading: boolean
}) {
  return (
    <Card
      className={`border-0 shadow-sm overflow-hidden ${
        item.minha ? "border-l-4 border-l-[#1351b4]" : ""
      }`}
    >
      <CardContent className="p-0">
        <div className="grid grid-cols-[1fr_380px] gap-6 p-5">
          {/* Left */}
          <div className="min-w-0">
            {/* Header chips */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
              <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded bg-[#ecf3fc] text-[#1351b4] border border-[#1351b4]/20">
                {item.tipo}
              </span>
              <span className="text-xs text-gray-500 font-mono">{item.proc}</span>
              {item.minha && item.status !== "devolvido" && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-[#1351b4]">
                  Aguardando você
                </span>
              )}
              {item.status === "devolvido" && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                  Devolvido
                </span>
              )}
            </div>

            <h3 className="text-sm font-semibold text-gray-900 mb-2 leading-snug">{item.objeto}</h3>

            <div className="flex items-center gap-4 text-xs text-gray-500">
              <span>Prazo: <strong className="text-gray-700">{item.prazo}</strong></span>
              <span>Em: <strong className="text-gray-700">{item.etapaAtual}</strong></span>
            </div>

            <FluxoFlow fluxo={item.fluxo} />
          </div>

          {/* Right */}
          <div className="flex flex-col gap-2 justify-start pt-1">
            {item.minha && item.status === "devolvido" ? (
              <>
                <Button
                  size="sm"
                  className="bg-[#1351b4] hover:bg-[#0c326f] text-white w-full"
                >
                  Revisar e reenviar
                </Button>
                <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    <strong>Devolvido pelo pregoeiro:</strong> {item.motivo}
                  </span>
                </div>
              </>
            ) : item.minha ? (
              <>
                <Button
                  size="sm"
                  className="bg-[#1351b4] hover:bg-[#0c326f] text-white w-full"
                >
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  Abrir para revisão
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => onAprovar(item)}
                  className="w-full border-[#168821] text-[#168821] hover:bg-green-50"
                >
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                  ) : (
                    <Check className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  Aprovar e assinar
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={loading}
                  onClick={() => onDevolver(item)}
                  className="w-full text-xs text-gray-500 h-7"
                >
                  Devolver à origem
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="w-full"
              >
                <Eye className="w-3.5 h-3.5 mr-1.5" />
                Acompanhar
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AprovacoesPage() {
  const [itens, setItens] = useState<Aprovacao[]>([])
  const [me, setMe] = useState<MeInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const meRes = await authFetch(`${API_URL}/api/auth/me`)
      let meData: MeInfo | null = null
      if (meRes.ok) {
        meData = await meRes.json()
        setMe(meData)
      }

      const orgaoId = meData?.orgao?.id || meData?.orgaoId
      if (!orgaoId) {
        setItens([])
        return
      }

      const res = await authFetch(`${API_URL}/api/fase-interna/aprovacoes?orgao_id=${orgaoId}`)
      if (res.ok) {
        const data = await res.json()
        const lista: Aprovacao[] = Array.isArray(data) ? data.map(mapBackendToAprovacao) : []
        setItens(lista)
      } else {
        setItens([])
      }
    } catch (e) {
      console.error(e)
      setItens([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const handleAprovar = async (item: Aprovacao) => {
    if (!item.documentoId || !me) return
    setActionLoading(item.id)
    try {
      await authFetch(`${API_URL}/api/fase-interna/documento/${item.documentoId}/aprovar`, {
        method: "PUT",
        body: JSON.stringify({
          aprovadorId: me.id,
          aprovadorNome: me.nome || me.email,
          observacao: "Aprovado via Portal DCP",
        }),
      })
      setItens((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, status: "aprovado", minha: false } : i)
      )
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDevolver = async (item: Aprovacao) => {
    if (!item.documentoId || !me) return
    setActionLoading(item.id)
    try {
      await authFetch(`${API_URL}/api/fase-interna/documento/${item.documentoId}/reprovar`, {
        method: "PUT",
        body: JSON.stringify({
          aprovadorId: me.id,
          aprovadorNome: me.nome || me.email,
          observacao: "Devolvido via Portal DCP",
        }),
      })
      setItens((prev) =>
        prev.map((i) => i.id === item.id ? { ...i, status: "devolvido" } : i)
      )
    } catch (e) {
      console.error(e)
    } finally {
      setActionLoading(null)
    }
  }

  const aguardando = itens.filter((i) => i.minha && i.status === "andamento").length

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-500 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando aprovações…
      </div>
    )
  }

  return (
    <div className="p-6 pb-12 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Home className="w-3.5 h-3.5" />
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#1351b4] font-medium">Aprovações</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Aprovações e assinaturas</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Workflow de tramitação interna · {aguardando} {aguardando === 1 ? "item aguardando" : "itens aguardando"} você
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5">
            <Filter className="w-3.5 h-3.5" /> Filtrar
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5">
            <History className="w-3.5 h-3.5" /> Histórico
          </Button>
        </div>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-3.5">
        {itens.map((item) => (
          <AprovacaoCard
            key={item.id}
            item={item}
            me={me}
            onAprovar={handleAprovar}
            onDevolver={handleDevolver}
            loading={actionLoading === item.id}
          />
        ))}
      </div>

      {itens.length === 0 && (
        <div className="py-20 text-center text-gray-400 text-sm">
          Nenhum item de aprovação encontrado.
        </div>
      )}
    </div>
  )
}
