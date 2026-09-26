"use client"

import { useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { History, Loader2 } from "lucide-react"
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
  ator_id: string | null
  created_at?: string
  dados?: Record<string, any> | null
  // Legíveis (backend — historicoLegivel): rótulos e nome de quem praticou
  rotulo_ato?: string
  rotulo_fase_de?: string | null
  rotulo_fase_para?: string
  rotulo_situacao_de?: string | null
  rotulo_situacao_para?: string
  ator_nome?: string
  resumo?: string | null
}

const ROTULO_ATOR: Record<string, string> = {
  ORGAO: "Órgão",
  USUARIO: "Servidor",
  FORNECEDOR: "Licitante",
  SISTEMA: "Sistema",
  ADMIN: "Administração",
}

const humanizar = (s: string) => s.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())

/**
 * HISTÓRICO DO PROCESSO — cada ato da máquina de estados (E1): quem, quando,
 * de/para e motivo. Fonte: GET /api/licitacoes/:id/transicoes (órgão dono).
 */
export function HistoricoProcesso({ licitacaoId, atualizacao }: { licitacaoId: string; atualizacao?: unknown }) {
  const [lista, setLista] = useState<Transicao[] | null>(null)
  const [todos, setTodos] = useState(false)

  useEffect(() => {
    let vivo = true
    authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/transicoes`)
      .then(async (r) => (r.ok ? r.json() : []))
      .then((j) => { if (vivo) setLista(Array.isArray(j) ? j : []) })
      .catch(() => { if (vivo) setLista([]) })
    return () => { vivo = false }
  }, [licitacaoId, atualizacao])

  // mais recente primeiro
  const ordenada = (lista || []).slice().sort((a, b) =>
    new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  )
  const visiveis = todos ? ordenada : ordenada.slice(0, 8)

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="w-4 h-4" /> Histórico do processo
        </CardTitle>
      </CardHeader>
      <CardContent>
        {lista === null ? (
          <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
        ) : ordenada.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum ato registrado ainda.</p>
        ) : (
          <ol className="space-y-2">
            {visiveis.map((t) => (
              <li key={t.id} className="flex gap-3 text-sm">
                <span className="w-2 h-2 mt-1.5 rounded-full bg-slate-400 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">
                    {t.rotulo_ato || humanizar(t.ato)}
                    {t.fase_de !== t.fase_para && (
                      <span className="font-normal text-gray-500">
                        {" · "}
                        {t.fase_de ? `${t.rotulo_fase_de || rotuloFase(t.fase_de)} → ` : ""}
                        {t.rotulo_fase_para || rotuloFase(t.fase_para)}
                      </span>
                    )}
                    {t.situacao_de && t.situacao_de !== t.situacao_para && (
                      <span className="font-normal text-gray-500">
                        {" · situação "}{t.rotulo_situacao_de || t.situacao_de} → {t.rotulo_situacao_para || t.situacao_para}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500">
                    {/* horário de Brasília (UTC-3) fixo */}
                    {t.created_at ? new Date(t.created_at).toLocaleString("pt-BR", { timeZone: "America/Bahia" }) : ""}
                    {" · "}{t.ator_nome || ROTULO_ATOR[t.ator_tipo] || t.ator_tipo}
                  </p>
                  {t.motivo && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line">Motivo: {t.motivo}</p>}
                  {t.resumo && <p className="text-xs text-gray-600 mt-0.5 whitespace-pre-line">{t.resumo}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
        {ordenada.length > 8 && (
          <Button variant="link" size="sm" className="px-0" onClick={() => setTodos(!todos)}>
            {todos ? "Mostrar menos" : `Mostrar todos (${ordenada.length})`}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
