"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CheckCircle2, ChevronRight, CircleDashed, Clock } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { telaDoTipoDeEtapa } from "@/lib/fluxo/ponte"
import type { Andamento } from "@/lib/fluxo/andamento"

/**
 * Processo da licitação e o andamento dele, quando segue um fluxo desenhado.
 * Nulo enquanto carrega ou quando não há fluxo (a tela usa a barra de sempre).
 */
/**
 * Fluxo que conduz a licitação. `undefined` enquanto carrega (homologação
 * 07/11/2026: a barra antiga da fase interna, em outra ordem, aparecia até a
 * resposta chegar); `null` = processo sem fluxo desenhado.
 */
export function useFluxoDaLicitacao(licitacaoId: string, atualizacao?: unknown): { processoId: string; andamento: Andamento } | null | undefined {
  const [dados, setDados] = useState<{ processoId: string; andamento: Andamento } | null | undefined>(undefined)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      let achado: { processoId: string; andamento: Andamento } | null = null
      let falhou = false
      try {
        const rp = await authFetch(`${API_URL}/api/processos/referencia/LICITACAO/${licitacaoId}`)
        if (rp.status >= 500) falhou = true
        if (rp.ok) {
          const p = (await rp.json()) as { id?: string }
          if (p?.id) {
            const ra = await authFetch(`${API_URL}/api/processos/${p.id}/andamento`)
            if (!ra.ok) falhou = true
            if (ra.ok) {
              const a = (await ra.json()) as Andamento
              if (a?.modo === "FLUXO" && a.nos?.length) achado = { processoId: p.id, andamento: a }
            }
          }
        }
      } catch {
        falhou = true
      }
      // Falha passageira ao recarregar não troca a barra do fluxo pela antiga
      if (vivo) setDados((ant) => (achado ?? (falhou && ant ? ant : null)))
    })()
    return () => {
      vivo = false
    }
  }, [licitacaoId, atualizacao])
  return dados
}

/**
 * Barra das telas de documento quando o processo segue um fluxo: só as etapas
 * do desenho daquele processo, na ordem desenhada, com o responsável. Etapa sem
 * tela própria (Aprovação, Publicação) abre a tela do processo.
 */
export function BarraEtapasFluxo({ licitacaoId, processoId, andamento, telaAtual }: { licitacaoId: string; processoId: string; andamento: Andamento; telaAtual: string }) {
  return (
    <nav aria-label="Etapas do fluxo deste processo" className="relative overflow-x-auto -mx-1 px-1">
      <ol className="flex items-center gap-1 min-w-max text-xs">
        {andamento.nos.map((n, i) => {
          const tela = telaDoTipoDeEtapa(n.tipo)
          const atual = !!tela && tela === telaAtual
          const icone =
            n.situacao === "CONCLUIDA" ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-green-700" aria-hidden="true" />
            ) : n.situacao === "EM_ANDAMENTO" ? (
              <Clock className={`w-3.5 h-3.5 shrink-0 ${n.atrasada ? "text-orange-700" : "text-blue-700"}`} aria-hidden="true" />
            ) : (
              <CircleDashed className="w-3.5 h-3.5 shrink-0 text-slate-400" aria-hidden="true" />
            )
          const situacao = n.situacao === "CONCLUIDA" ? "concluída" : n.situacao === "EM_ANDAMENTO" ? (n.atrasada ? "em andamento, prazo vencido" : "em andamento") : "a realizar"
          const conteudo = (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                atual ? "border-blue-700 bg-blue-50 text-blue-900 font-semibold" : n.situacao === "EM_ANDAMENTO" ? "border-blue-300 bg-white text-slate-800" : "border-slate-200 bg-white text-slate-700"
              }`}
              title={`${n.titulo} — ${situacao}${n.responsavel ? ` · ${n.responsavel}` : ""}`}
            >
              {icone}
              <span className="font-mono text-[10px] text-slate-500">{i + 1}</span>
              {n.titulo}
              {n.responsavel ? <span className="text-[10px] text-slate-500">· {n.responsavel}</span> : null}
            </span>
          )
          return (
            <li key={n.chave} className="flex items-center gap-1">
              <Link href={tela ? `/orgao/processos/${licitacaoId}/fase-interna/${tela}` : `/orgao/processo/${processoId}`} aria-current={atual ? "page" : undefined}>
                {conteudo}
              </Link>
              {i < andamento.nos.length - 1 && <ChevronRight className="w-3 h-3 text-slate-400" aria-hidden="true" />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
