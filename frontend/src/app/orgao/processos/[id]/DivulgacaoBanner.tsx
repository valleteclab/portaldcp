"use client"

import { useCallback, useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { AlertTriangle, Clock, Loader2, RefreshCw } from "lucide-react"

/** Resposta de GET /api/publicacao/licitacao/:id/divulgacao (o backend decide tudo). */
interface SituacaoDivulgacao {
  estado: "NAO_PUBLICADO" | "AGUARDANDO" | "CONFIRMADA" | "EXTERNA"
  integrado_pncp: boolean
  compra: {
    id: string
    status: string
    tentativas: number
    max_tentativas: number
    ultima_tentativa: string | null
    proximo_envio: string | null
    erro_mensagem: string | null
    erro_status_http: number | null
  } | null
  banner: {
    tipo: "ERRO" | "AGUARDANDO"
    titulo: string
    mensagem: string
    pendencias: Array<{ campo: string; texto: string }>
    pode_reenviar: boolean
    reenviar_id: string | null
    pode_registrar_diario_oficial: boolean
  } | null
}

/** Datas sempre no horário de Brasília (UTC-3), independentemente do navegador. */
const fmt = (d?: string | null) =>
  d
    ? new Date(d).toLocaleString("pt-BR", {
        timeZone: "America/Bahia",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

/** Dia informado (Brasília): hoje = agora; dia anterior = meio-dia daquele dia. */
const dataDaPublicacao = (dia: string) => {
  if (!dia) return undefined
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bahia" })
  return dia === hoje ? new Date().toISOString() : new Date(`${dia}T12:00:00-03:00`).toISOString()
}

/**
 * DIVULGAÇÃO OFICIAL (Lei 14.133/2021 arts. 54 e 174): enquanto o PNCP não
 * confirma a compra, o prazo não começou. Mostra o retorno REAL da API do PNCP
 * (código HTTP, mensagem, tentativas) e as ações: reenviar agora e, para órgão
 * sem PNCP, registrar a publicação no diário oficial (art. 176, parágrafo
 * único). Só aparece com a licitação aguardando a divulgação.
 */
export function DivulgacaoBanner({ licitacaoId, fase, onAtualizado }: { licitacaoId: string; fase: string; onAtualizado: () => void }) {
  const [s, setS] = useState<SituacaoDivulgacao | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [data, setData] = useState("")
  const [referencia, setReferencia] = useState("")

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/divulgacao`)
      if (res.ok) setS(await res.json())
    } catch {
      /* sem banner */
    }
  }, [licitacaoId])

  useEffect(() => {
    carregar()
  }, [carregar, fase])

  if (!s?.banner) return null
  const b = s.banner
  const vermelho = b.tipo === "ERRO"

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
      await carregar()
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
      await carregar()
      onAtualizado()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div
      className={`rounded-md border p-4 text-sm space-y-2 ${vermelho ? "border-red-300 bg-red-50 text-red-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
      role="alert"
    >
      <div className="flex items-center gap-2 font-semibold">
        {vermelho ? <AlertTriangle className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
        {b.titulo}
      </div>
      <p className="whitespace-pre-line">{b.mensagem}</p>
      {s.compra && (
        <p className="text-xs opacity-80">
          Envio da compra ao PNCP: {s.compra.status}
          {s.compra.erro_status_http ? ` · código HTTP ${s.compra.erro_status_http}` : ""} · tentativas {s.compra.tentativas}/{s.compra.max_tentativas}
          {" · "}última tentativa {fmt(s.compra.ultima_tentativa)}
          {s.compra.proximo_envio ? ` · próxima tentativa automática ${fmt(s.compra.proximo_envio)}` : ""}
        </p>
      )}
      {b.pendencias.length > 0 && (
        <div>
          <p className="font-medium">O que corrigir:</p>
          <ul className="list-disc ml-5">
            {b.pendencias.map((p) => (
              <li key={p.campo}>{p.texto}</li>
            ))}
          </ul>
          <p className="text-xs mt-1">
            Nada foi divulgado: para alterar itens ou datas, use &quot;Cancelar publicação&quot; (volta à fase interna), corrija e publique de novo.
          </p>
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-end">
        {b.pode_reenviar && (
          <Button size="sm" variant="outline" onClick={reenviar} disabled={enviando}>
            {enviando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
            Reenviar agora
          </Button>
        )}
        {b.pode_registrar_diario_oficial && (
          <>
            <div>
              <label className="block text-xs">Data da publicação no diário oficial</label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="h-8 w-44 bg-white" />
            </div>
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs">Referência (edição, página ou link)</label>
              <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} className="h-8 bg-white" />
            </div>
            <Button size="sm" onClick={registrarDiario} disabled={enviando || !data || referencia.trim().length < 5}>
              Registrar publicação oficial
            </Button>
          </>
        )}
      </div>
      {erro && <p className="text-red-700">{erro}</p>}
    </div>
  )
}
