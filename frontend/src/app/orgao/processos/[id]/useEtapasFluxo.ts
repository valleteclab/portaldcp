"use client"

import { useCallback, useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { avisarTarefasAtualizadas } from "@/lib/tarefas"
import { criarUltimaCarga } from "@/lib/fase-interna/telas"
import type { EtapasFluxoResposta } from "@/lib/fase-interna/visao-fluxo"

/**
 * ETAPAS DA FASE INTERNA (GET /api/fase-interna/:id/etapas) — uma leitura só
 * para a tela do processo: o topo "Está com…" (peças para anexar, prazos do
 * destino) e a visão da fase interna usam os mesmos dados. Recarrega sempre
 * que o processo muda (`atualizacao`); a última leitura vence (resposta velha
 * não sobrescreve a nova). As ações do fluxo devolvem as etapas atualizadas:
 * `definir` as aplica na hora.
 */
export function useEtapasFluxo(licitacaoId: string, ativo: boolean, atualizacao: unknown) {
  const [dados, setDados] = useState<EtapasFluxoResposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [ultima] = useState(criarUltimaCarga)

  const recarregar = useCallback(async () => {
    if (!ativo || !licitacaoId) return
    const vale = ultima()
    // Estado só muda depois da resposta (nunca no mesmo tique do efeito)
    await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/etapas`)
      .then(async (r) => {
        if (!vale()) return
        if (!r.ok) {
          const j = await r.json().catch(() => null)
          setErro((Array.isArray(j?.message) ? j.message.join(" ") : j?.message) || `HTTP ${r.status}`)
          return
        }
        const j = (await r.json()) as EtapasFluxoResposta
        if (!vale()) return
        setErro(null)
        setDados(j)
        avisarTarefasAtualizadas() // a leitura sincroniza as tarefas: atualiza o badge do menu
      })
      .catch((e) => {
        if (vale()) setErro(e instanceof Error ? e.message : String(e))
      })
  }, [licitacaoId, ativo, ultima])

  useEffect(() => { recarregar() }, [recarregar, atualizacao])

  const definir = useCallback(
    (d: EtapasFluxoResposta) => {
      ultima() // invalida leituras em voo, anteriores à ação
      setDados(d)
      avisarTarefasAtualizadas()
    },
    [ultima],
  )

  return { dados: ativo ? dados : null, erro, recarregar, definir }
}

export type EtapasFluxo = ReturnType<typeof useEtapasFluxo>
