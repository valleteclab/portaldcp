"use client"

/**
 * ENVIOS AO PNCP (fila — E7): cada operação da licitação no PNCP (compra,
 * itens, documentos, resultado, ata, contrato...) com a situação, o retorno
 * REAL da API (código HTTP + mensagem), as tentativas, a última tentativa e o
 * "Reenviar agora" para erros e pendentes. Fonte: GET /api/pncp/fila?licitacaoId=:id
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
  status: string
  tentativas?: number
  max_tentativas?: number
  proximo_envio?: string | null
  erro_mensagem?: string | null
  erro_status_http?: number | null
  ultima_tentativa?: string | null
  numero_controle_pncp?: string | null
  enviado_em?: string | null
  updated_at?: string | null
}

const REENVIAVEIS = ["ERRO_TEMPORARIO", "ERRO_DEFINITIVO", "ERRO", "PENDENTE"]

function situacao(l: LinhaFilaPncp): { cls: string; texto: string } {
  switch (l.status) {
    case "ENVIADO":
      return { cls: "text-green-800", texto: "✓ Publicado" }
    case "ENVIANDO":
      return { cls: "text-blue-800", texto: "↻ Enviando" }
    case "PENDENTE":
      return { cls: "text-gray-700", texto: l.proximo_envio ? `Na fila (envio às ${fmtHoraBrasilia(l.proximo_envio)})` : "Na fila" }
    case "ERRO_TEMPORARIO":
      return { cls: "text-amber-800", texto: l.proximo_envio ? `⚠ Nova tentativa às ${fmtHoraBrasilia(l.proximo_envio)}` : "⚠ Erro temporário" }
    case "ERRO_DEFINITIVO":
    case "ERRO":
      return { cls: "text-red-700", texto: "✗ Rejeitado" }
    case "EXCLUIDO":
      return { cls: "text-gray-600 line-through", texto: "Excluído" }
    default:
      return { cls: "text-gray-700", texto: l.status }
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
  /** Muda quando a tela recarrega — força nova leitura da fila. */
  atualizacao?: unknown
  /** O que mostrar quando a fila está vazia. */
  semItens?: ReactNode
}) {
  const [linhas, setLinhas] = useState<LinhaFilaPncp[] | null>(null)
  const [reenviando, setReenviando] = useState<string | null>(null)
  const [erros, setErros] = useState<Record<string, string>>({})

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/pncp/fila?licitacaoId=${licitacaoId}`)
      const j = res.ok ? await res.json() : []
      setLinhas(Array.isArray(j) ? j : [])
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

  if (linhas === null) return <Loader2 className="w-4 h-4 animate-spin text-gray-500" aria-label="Carregando envios ao PNCP" />
  if (linhas.length === 0) return <>{semItens ?? <p className="text-sm text-gray-600">Nenhum envio ao PNCP ainda.</p>}</>

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border rounded-md">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700 text-xs">
            <tr>
              <th scope="col" className="text-left px-3 py-2">Registro</th>
              <th scope="col" className="text-left px-3 py-2">Situação</th>
              <th scope="col" className="text-left px-3 py-2">Retorno</th>
              <th scope="col" className="text-right px-3 py-2">Tentativas</th>
              <th scope="col" className="px-3 py-2"><span className="sr-only">Ações</span></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const s = situacao(l)
              return (
                <tr key={l.id} className="border-t align-top">
                  <td className="px-3 py-2">{l.rotulo || l.tipo}</td>
                  <td className={`px-3 py-2 whitespace-nowrap font-medium ${s.cls}`}>{s.texto}</td>
                  <td className="px-3 py-2 text-xs">
                    {l.status === "ENVIADO" ? (
                      <span className="text-gray-700">
                        {l.numero_controle_pncp ? <>Nº <span className="font-mono">{l.numero_controle_pncp}</span></> : "Aceito"}
                        {l.enviado_em ? ` · ${fmtBrasilia(l.enviado_em)}` : ""}
                      </span>
                    ) : l.erro_mensagem ? (
                      <span className="font-mono whitespace-pre-line text-red-800">
                        {l.erro_status_http ? `HTTP ${l.erro_status_http} — ` : ""}{l.erro_mensagem}
                      </span>
                    ) : (
                      <span className="text-gray-600">—</span>
                    )}
                    {(l.ultima_tentativa || l.updated_at) && l.status !== "ENVIADO" && (
                      <span className="block text-gray-600">última tentativa {fmtBrasilia(l.ultima_tentativa || l.updated_at)}</span>
                    )}
                    {erros[l.id] && <span className="block text-red-700">{erros[l.id]}</span>}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{l.tentativas ?? 0}/{l.max_tentativas ?? "?"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {REENVIAVEIS.includes(l.status) && (
                      <Button size="sm" variant="outline" className="h-7 text-xs" disabled={reenviando === l.id} onClick={() => reenviar(l)}>
                        {reenviando === l.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                        Reenviar agora
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <button type="button" className="inline-flex items-center gap-1 text-gray-700 hover:underline" onClick={carregar}>
          <RefreshCw className="w-3 h-3" aria-hidden="true" /> Atualizar
        </button>
        {linkPncp && (
          <a href={linkPncp} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue-700 hover:underline">
            Abrir no PNCP <ExternalLink className="w-3 h-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  )
}
