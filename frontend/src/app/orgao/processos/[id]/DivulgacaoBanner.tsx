"use client"

import { useCallback, useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { fmtBrasilia } from "@/lib/publicacao"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle, Clock, Loader2, RefreshCw } from "lucide-react"
import type { ItemConferencia, SituacaoDivulgacao } from "./tipos"

/** Situação da divulgação oficial (GET /publicacao/licitacao/:id/divulgacao) — recarrega quando a fase muda. */
export function useDivulgacao(licitacaoId: string, fase: string | undefined) {
  const [s, setS] = useState<SituacaoDivulgacao | null>(null)
  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/divulgacao`)
      if (res.ok) setS(await res.json())
    } catch {
      /* sem banner */
    }
  }, [licitacaoId])
  useEffect(() => {
    if (fase) carregar()
  }, [carregar, fase])
  return { divulgacao: s, recarregarDivulgacao: carregar }
}

/** Dia informado (Brasília): hoje = agora; dia anterior = meio-dia daquele dia. */
const dataDaPublicacao = (dia: string) => {
  if (!dia) return undefined
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" })
  return dia === hoje ? new Date().toISOString() : new Date(`${dia}T12:00:00-03:00`).toISOString()
}

/**
 * DIVULGAÇÃO OFICIAL (Lei 14.133/2021 arts. 54 e 174): enquanto o PNCP não
 * confirma a compra, o prazo não começou. Mostra o retorno REAL da API do PNCP
 * (código HTTP, mensagem, tentativas, última tentativa), as pendências
 * detectadas (conferência de pré-publicação + pistas da mensagem do PNCP) e as
 * ações: ver detalhes (aba PNCP), corrigir pendências (checklist), reenviar e,
 * para órgão sem PNCP, registrar a publicação no diário oficial (art. 176,
 * parágrafo único). Só aparece com a licitação aguardando a divulgação.
 */
export function DivulgacaoBanner({
  licitacaoId,
  situacao,
  pendenciasChecklist,
  onVerDetalhes,
  onCorrigir,
  onAtualizado,
}: {
  licitacaoId: string
  situacao: SituacaoDivulgacao | null
  /** Linhas bloqueantes do checklist de pré-publicação. */
  pendenciasChecklist: ItemConferencia[]
  onVerDetalhes: () => void
  onCorrigir: () => void
  onAtualizado: () => void
}) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [data, setData] = useState("")
  const [referencia, setReferencia] = useState("")

  if (!situacao?.banner) return null
  const b = situacao.banner
  const compra = situacao.compra
  const vermelho = b.tipo === "ERRO" || pendenciasChecklist.length > 0

  const reenviar = async () => {
    if (!b.reenviar_id) return
    setEnviando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/pncp/fila/${b.reenviar_id}/reenviar`, { method: "POST" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErro(j?.message || `HTTP ${res.status}`)
      }
    } finally {
      setEnviando(false)
      onAtualizado()
    }
  }

  const registrarDiario = async () => {
    setEnviando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/divulgacao-oficial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data_divulgacao: dataDaPublicacao(data), referencia }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErro(j?.message || `HTTP ${res.status}`)
        return
      }
      onAtualizado()
    } finally {
      setEnviando(false)
    }
  }

  const pendencias = [
    ...pendenciasChecklist.map((p) => p.rotulo),
    ...b.pendencias.map((p) => p.texto),
  ]

  return (
    <div
      className={`rounded-lg border p-4 text-sm ${vermelho ? "border-red-300 bg-red-50 text-red-950" : "border-amber-300 bg-amber-50 text-amber-950"}`}
      role="alert"
    >
      <div className="flex items-start gap-3 flex-wrap">
        <span
          className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${vermelho ? "bg-red-700 text-white" : "bg-amber-600 text-white"}`}
          aria-hidden="true"
        >
          {vermelho ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
        </span>
        <div className="flex-1 min-w-[240px] space-y-1">
          <p className={`font-semibold ${vermelho ? "text-red-800" : "text-amber-900"}`}>{b.titulo}</p>
          <p className="whitespace-pre-line">{b.mensagem}</p>
          {compra && (
            <p className="text-xs">
              Envio da compra ao PNCP: {compra.status}
              {compra.erro_status_http ? ` · código HTTP ${compra.erro_status_http}` : ""} · {compra.tentativas}/{compra.max_tentativas} tentativas
              {" · "}última em {fmtBrasilia(compra.ultima_tentativa)}
              {compra.proximo_envio ? ` · próxima tentativa automática ${fmtBrasilia(compra.proximo_envio)}` : ""}
            </p>
          )}
          {pendencias.length > 0 && (
            <p className="text-xs">
              <span className="font-medium">Pendências detectadas:</span> <b>{pendencias.join(" · ")}</b>
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="bg-white" onClick={onVerDetalhes}>
            Ver detalhes
          </Button>
          {pendencias.length > 0 ? (
            <Button size="sm" className="bg-red-700 hover:bg-red-800 text-white" onClick={onCorrigir}>
              Corrigir pendências
            </Button>
          ) : (
            b.pode_reenviar && (
              <Button size="sm" variant="outline" className="bg-white" onClick={reenviar} disabled={enviando}>
                {enviando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" aria-hidden="true" />}
                Reenviar agora
              </Button>
            )
          )}
        </div>
      </div>
      {b.pode_registrar_diario_oficial && (
        <div className="flex flex-wrap gap-2 items-end mt-3">
          <div>
            <label htmlFor="data-diario" className="block text-xs">Data da publicação no diário oficial</label>
            <Input id="data-diario" type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-8 w-44 bg-white" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label htmlFor="ref-diario" className="block text-xs">Referência (edição, página ou link)</label>
            <Input id="ref-diario" value={referencia} onChange={(e) => setReferencia(e.target.value)} className="h-8 bg-white" />
          </div>
          <Button size="sm" onClick={registrarDiario} disabled={enviando || !data || referencia.trim().length < 5}>
            Registrar publicação oficial
          </Button>
        </div>
      )}
      {erro && <p className="text-red-800 mt-2">{erro}</p>}
    </div>
  )
}
