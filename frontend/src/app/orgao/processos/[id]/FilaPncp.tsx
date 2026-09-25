"use client"

/**
 * FILA DO PNCP (E7) — cada operação da licitação no PNCP (aviso, itens,
 * documentos, resultado, ata, contrato...) com status, tentativas, próximo
 * envio e a mensagem devolvida pelo PNCP; "Reenviar agora" para erros e
 * pendentes. Fonte: GET /api/pncp/fila?licitacaoId=:id
 */

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw, ExternalLink } from "lucide-react"
import { fmtBrasilia, fmtHoraBrasilia, lerErro } from "@/lib/publicacao"

export interface LinhaFilaPncp {
  id: string
  tipo: string
  rotulo?: string
  status: "PENDENTE" | "ENVIANDO" | "ENVIADO" | "ERRO_TEMPORARIO" | "ERRO_DEFINITIVO" | "ERRO" | "EXCLUIDO" | string
  tentativas?: number
  max_tentativas?: number
  proximo_envio?: string | null
  erro_mensagem?: string | null
  numero_controle_pncp?: string | null
  enviado_em?: string | null
  updated_at?: string | null
}

const REENVIAVEIS = ["ERRO_TEMPORARIO", "ERRO_DEFINITIVO", "ERRO", "PENDENTE"]

function estilo(l: LinhaFilaPncp): { cls: string; icone: string; texto: string } {
  const n = `${l.tentativas ?? 0}/${l.max_tentativas ?? "?"}`
  switch (l.status) {
    case "ENVIADO":
      return { cls: "text-green-700 bg-green-50 border-green-200", icone: "✓", texto: l.enviado_em ? `enviado ${fmtBrasilia(l.enviado_em)}` : "enviado" }
    case "ENVIANDO":
      return { cls: "text-blue-700 bg-blue-50 border-blue-200", icone: "↻", texto: "enviando…" }
    case "PENDENTE":
      return {
        cls: "text-gray-600 bg-gray-50 border-gray-200",
        icone: "…",
        texto: l.proximo_envio ? `na fila — envio às ${fmtHoraBrasilia(l.proximo_envio)}` : "na fila",
      }
    case "ERRO_TEMPORARIO":
      return {
        cls: "text-amber-800 bg-amber-50 border-amber-300",
        icone: "⚠",
        texto: l.proximo_envio ? `nova tentativa às ${fmtHoraBrasilia(l.proximo_envio)} (${n})` : `erro temporário (${n})`,
      }
    case "ERRO_DEFINITIVO":
    case "ERRO":
      return { cls: "text-red-700 bg-red-50 border-red-200", icone: "✗", texto: l.status === "ERRO" ? "erro" : "erro definitivo — corrija e reenvie" }
    case "EXCLUIDO":
      return { cls: "text-gray-400 bg-gray-50 border-gray-200 line-through", icone: "–", texto: "excluído" }
    default:
      return { cls: "text-gray-600 bg-gray-50 border-gray-200", icone: "?", texto: l.status }
  }
}

export function FilaPncp({
  licitacaoId,
  linkPncp,
  atualizacao,
  semItens,
}: {
  licitacaoId: string
  linkPncp?: string | null
  /** Muda quando o cockpit recarrega — força nova leitura da fila. */
  atualizacao?: unknown
  /** O que mostrar quando a fila está vazia (null = nada). */
  semItens?: ReactNode
}) {
  const [linhas, setLinhas] = useState<LinhaFilaPncp[] | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [reenviando, setReenviando] = useState<string | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/pncp/fila?licitacaoId=${licitacaoId}`)
      if (res.ok) {
        const j = await res.json()
        setLinhas(Array.isArray(j) ? j : [])
      } else {
        setLinhas([])
      }
    } catch {
      setLinhas([])
    }
  }, [licitacaoId])

  useEffect(() => { carregar() }, [carregar, atualizacao])

  // Enquanto houver envio em andamento ou retentativa agendada, atualiza sozinho
  const emAndamento = (linhas || []).some((l) => ["PENDENTE", "ENVIANDO", "ERRO_TEMPORARIO"].includes(l.status))
  useEffect(() => {
    if (!emAndamento) return
    const t = setInterval(carregar, 30_000)
    return () => clearInterval(t)
  }, [emAndamento, carregar])

  const reenviar = async (l: LinhaFilaPncp) => {
    setReenviando(l.id)
    setErros((e) => ({ ...e, [l.id]: "" }))
    try {
      const res = await authFetch(`${API_URL}/api/pncp/fila/${l.id}/reenviar`, { method: "POST" })
      if (!res.ok) {
        const er = await lerErro(res, "Erro ao reenviar")
        setErros((e) => ({ ...e, [l.id]: er.mensagem }))
      }
      await carregar()
    } catch (e: any) {
      setErros((x) => ({ ...x, [l.id]: e.message || "Erro ao reenviar" }))
    } finally {
      setReenviando(null)
    }
  }

  if (linhas === null) return <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
  if (linhas.length === 0) return <>{semItens ?? null}</>

  const detalhe = linhas.find((l) => l.id === aberta)

  return (
    <div className="space-y-1.5 w-full">
      <div className="flex items-center gap-1.5 flex-wrap text-xs">
        {linhas.map((l) => {
          const e = estilo(l)
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => setAberta(aberta === l.id ? null : l.id)}
              title={l.erro_mensagem || e.texto}
              className={`rounded px-1.5 py-0.5 border ${e.cls} ${aberta === l.id ? "ring-1 ring-offset-1 ring-gray-300" : ""}`}
            >
              {l.rotulo || l.tipo} {e.icone}
              {l.status === "ERRO_TEMPORARIO" && l.proximo_envio ? ` ${fmtHoraBrasilia(l.proximo_envio)}` : ""}
            </button>
          )
        })}
        <button type="button" className="text-gray-400 hover:text-gray-600" title="Atualizar" onClick={carregar}>
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      {detalhe && (() => {
        const e = estilo(detalhe)
        return (
          <div className={`text-xs border rounded p-2 space-y-1 ${e.cls.replace("line-through", "")}`}>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-medium">{detalhe.rotulo || detalhe.tipo} — {e.texto}</span>
              <div className="flex items-center gap-2">
                {detalhe.status === "ENVIADO" && linkPncp && (
                  <a href={linkPncp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                    abrir no PNCP <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                {REENVIAVEIS.includes(detalhe.status) && (
                  <Button size="sm" variant="outline" className="h-6 text-[11px] bg-white" disabled={reenviando === detalhe.id} onClick={() => reenviar(detalhe)}>
                    {reenviando === detalhe.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                    Reenviar agora
                  </Button>
                )}
              </div>
            </div>
            {detalhe.numero_controle_pncp && <p>Nº de controle PNCP: <span className="font-mono">{detalhe.numero_controle_pncp}</span></p>}
            {detalhe.erro_mensagem && (
              <p className="whitespace-pre-line"><span className="font-medium">Mensagem do PNCP:</span> {detalhe.erro_mensagem}</p>
            )}
            <p className="text-[10px] opacity-75">
              Tentativas: {detalhe.tentativas ?? 0}/{detalhe.max_tentativas ?? "?"}
              {detalhe.updated_at ? ` · atualizado ${fmtBrasilia(detalhe.updated_at)}` : ""}
            </p>
            {erros[detalhe.id] && <p className="text-red-700">{erros[detalhe.id]}</p>}
          </div>
        )
      })()}
    </div>
  )
}
