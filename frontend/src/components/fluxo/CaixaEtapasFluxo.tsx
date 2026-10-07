"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { CheckCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { haQuantoTempo } from "@/lib/fluxo/andamento"

interface EtapaMinha {
  tarefa_id: string
  instancia_id: string
  etapa: string
  tipo: string
  prazo_em: string | null
  desde: string
  processo: { id: string; numero: string; objeto: string } | null
}

/**
 * CENTRAL DE APROVAÇÕES · ETAPAS DE PROCESSO: as aprovações dos fluxos
 * desenhados que dependem de quem está logado (pelo setor, pela pessoa ou por
 * ter aberto o processo). Aprovar daqui; devolver ou indeferir (com motivo)
 * na tela do processo.
 */
export function CaixaEtapasFluxo({ onContagem }: { onContagem?: (n: number) => void }) {
  const [itens, setItens] = useState<EtapaMinha[] | null>(null)
  const [aprovando, setAprovando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/workflows/minhas-etapas?tipo=APROVACAO`)
      const lista: EtapaMinha[] = r.ok ? await r.json() : []
      setItens(lista)
      onContagem?.(lista.length)
    } catch {
      setItens([])
      onContagem?.(0)
    }
  }, [onContagem])

  useEffect(() => {
    carregar()
  }, [carregar])

  async function aprovar(e: EtapaMinha) {
    setAprovando(e.tarefa_id)
    try {
      const r = await authFetch(`${API_URL}/api/workflows/execucoes/${e.instancia_id}/tarefas/${e.tarefa_id}/concluir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resposta: { decisao: "APROVADO" } }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(Array.isArray(j?.pendencias) && j.pendencias.length ? j.pendencias.join(" ") : typeof j?.message === "string" ? j.message : "Não foi possível aprovar.")
      toast.success(`${e.etapa} aprovada${e.processo ? ` — processo ${e.processo.numero}` : ""}.`)
      await carregar()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível aprovar.")
    } finally {
      setAprovando(null)
    }
  }

  if (itens === null)
    return (
      <p className="flex items-center gap-2 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Carregando…
      </p>
    )
  if (!itens.length)
    return (
      <div className="rounded-xl border bg-white py-12 text-center">
        <CheckCircle className="mx-auto h-10 w-10 text-green-500" aria-hidden="true" />
        <p className="mt-3 font-semibold">Nada pendente para você</p>
        <p className="text-sm text-slate-600">As aprovações dos fluxos de processo aparecem aqui quando dependem de você ou do seu setor.</p>
      </div>
    )

  return (
    <ul className="flex flex-col gap-3">
      {itens.map((e) => {
        const vencido = !!e.prazo_em && new Date(e.prazo_em).getTime() < Date.now()
        return (
          <li key={e.tarefa_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-sky-800">{e.processo ? `Processo nº ${e.processo.numero}` : "Fluxo sem processo"}</p>
              <p className="font-semibold">{e.etapa}</p>
              {e.processo ? <p className="truncate text-sm text-slate-600" title={e.processo.objeto}>{e.processo.objeto}</p> : null}
              <p className={`text-xs ${vencido ? "font-semibold text-red-700" : "text-slate-500"}`}>
                Chegou {haQuantoTempo(e.desde)}
                {e.prazo_em ? ` · ${vencido ? "prazo vencido em" : "prazo até"} ${new Date(e.prazo_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}
              </p>
            </div>
            <div className="flex gap-2">
              {e.processo ? (
                <Link href={`/orgao/processo/${e.processo.id}`} className="rounded-lg border px-3 py-2 text-sm">
                  Abrir processo
                </Link>
              ) : null}
              <button type="button" onClick={() => aprovar(e)} disabled={aprovando !== null} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60">
                {aprovando === e.tarefa_id ? "Aprovando…" : "Aprovar"}
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
