"use client"

import { useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { fmtBrasilia } from "@/lib/publicacao"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { rotuloFase } from "@/lib/licitacao-rotulos"

interface Transicao {
  id: string
  ato: string
  fase_de: string | null
  fase_para: string
  situacao_de: string | null
  situacao_para: string
  motivo: string | null
  ator_tipo: string
  created_at?: string
  // Legíveis (backend — historicoLegivel): rótulos e nome de quem praticou
  rotulo_ato?: string
  rotulo_fase_de?: string | null
  rotulo_fase_para?: string
  rotulo_situacao_de?: string | null
  rotulo_situacao_para?: string
  ator_nome?: string
  resumo?: string | null
}

interface Evento {
  id: string
  quando: string | null
  evento: string
  detalhe: string
  responsavel: string
  falha?: boolean
}

const ROTULO_ATOR: Record<string, string> = {
  ORGAO: "Órgão",
  FORNECEDOR: "Licitante",
  SISTEMA: "Sistema",
  ADMIN: "Administração",
}

const humanizar = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())
const ERROS = ["ERRO", "ERRO_TEMPORARIO", "ERRO_DEFINITIVO"]

function daTransicao(t: Transicao): Evento {
  const partes: string[] = []
  if (t.fase_de !== t.fase_para) {
    partes.push(`${t.fase_de ? `${t.rotulo_fase_de || rotuloFase(t.fase_de)} → ` : ""}${t.rotulo_fase_para || rotuloFase(t.fase_para)}`)
  }
  if (t.situacao_de && t.situacao_de !== t.situacao_para) {
    partes.push(`situação ${t.rotulo_situacao_de || t.situacao_de} → ${t.rotulo_situacao_para || t.situacao_para}`)
  }
  if (t.motivo) partes.push(`Motivo: ${t.motivo}`)
  if (t.resumo) partes.push(t.resumo)
  return {
    id: t.id,
    quando: t.created_at ?? null,
    evento: t.rotulo_ato || humanizar(t.ato),
    detalhe: partes.join(" · "),
    // nome de quem praticou (backend); "Servidor"/"Sistema" só como último recurso
    responsavel: t.ator_nome || ROTULO_ATOR[t.ator_tipo] || t.ator_tipo,
  }
}

/**
 * HISTÓRICO DO PROCESSO — cada ato da máquina de estados (E1) com rótulo
 * legível, detalhe e o NOME de quem praticou (GET /licitacoes/:id/transicoes,
 * órgão dono), mais as FALHAS DE INTEGRAÇÃO com o PNCP (retorno real da API,
 * da fila: GET /pncp/fila — a fila guarda a última falha de cada registro).
 */
export function HistoricoProcesso({ licitacaoId, atualizacao }: { licitacaoId: string; atualizacao?: unknown }) {
  const [eventos, setEventos] = useState<Evento[] | null>(null)
  const [todos, setTodos] = useState(false)

  useEffect(() => {
    let vivo = true
    const ler = async (url: string) => {
      try {
        const r = await authFetch(url)
        if (!r.ok) return []
        const j = await r.json()
        return Array.isArray(j) ? j : []
      } catch {
        return []
      }
    }
    Promise.all([ler(`${API_URL}/api/licitacoes/${licitacaoId}/transicoes`), ler(`${API_URL}/api/pncp/fila?licitacaoId=${licitacaoId}`)]).then(([ts, fila]) => {
      if (!vivo) return
      const falhas: Evento[] = (fila as any[])
        .filter((l) => ERROS.includes(l.status) && l.erro_mensagem)
        .map((l) => ({
          id: `pncp-${l.id}`,
          quando: l.ultima_tentativa || l.updated_at || null,
          evento: `Falha na publicação (PNCP) — ${l.rotulo || l.tipo}`,
          detalhe: `${l.erro_status_http ? `HTTP ${l.erro_status_http}: ` : ""}${l.erro_mensagem} · ${l.tentativas ?? 0}/${l.max_tentativas ?? "?"} tentativas`,
          responsavel: "Integração PNCP",
          falha: true,
        }))
      setEventos([...(ts as Transicao[]).map(daTransicao), ...falhas])
    })
    return () => { vivo = false }
  }, [licitacaoId, atualizacao])

  if (eventos === null) return <Loader2 className="w-4 h-4 animate-spin text-gray-500" aria-label="Carregando histórico" />
  // mais recente primeiro
  const ordenada = eventos.slice().sort((a, b) => new Date(b.quando || 0).getTime() - new Date(a.quando || 0).getTime())
  if (ordenada.length === 0) return <p className="text-sm text-gray-700">Nenhum ato registrado ainda.</p>
  const visiveis = todos ? ordenada : ordenada.slice(0, 12)

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Histórico do processo (horário de Brasília)</caption>
          <thead className="text-xs text-gray-700 border-b">
            <tr>
              <th scope="col" className="text-left py-2 pr-3 whitespace-nowrap">Data/hora</th>
              <th scope="col" className="text-left py-2 pr-3">Evento</th>
              <th scope="col" className="text-left py-2 pr-3">Detalhe</th>
              <th scope="col" className="text-left py-2">Responsável</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((e) => (
              <tr key={e.id} className="border-b last:border-0 align-top">
                <td className="py-2 pr-3 whitespace-nowrap">{fmtBrasilia(e.quando)}</td>
                <td className={`py-2 pr-3 font-medium ${e.falha ? "text-red-700" : ""}`}>{e.evento}</td>
                <td className="py-2 pr-3 text-gray-800 whitespace-pre-line">{e.detalhe || "—"}</td>
                <td className="py-2">{e.responsavel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ordenada.length > 12 && (
        <Button variant="link" size="sm" className="px-0" onClick={() => setTodos(!todos)}>
          {todos ? "Mostrar menos" : `Mostrar todos (${ordenada.length})`}
        </Button>
      )}
    </div>
  )
}
