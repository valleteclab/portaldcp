"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Inbox } from "lucide-react"
import { chamarProcessos, dataHora, rotuloDoTipo } from "@/lib/processo/processo"

interface ProcessoComigo {
  id: string
  numero: string
  objeto: string
  tipo: string
  esta_com: string
  despacho: string
  desde: string
  recebida: boolean
}

interface Resposta {
  aguardando_recebimento: ProcessoComigo[]
  com_voce: ProcessoComigo[]
}

/**
 * "Processos com você" na caixa de tarefas: aditivos, renovações e avulsos
 * cuja posse é o seu setor ou você — primeiro os que aguardam recebimento.
 */
export function ProcessosComigo() {
  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    chamarProcessos<Resposta>("/comigo", { padrao: "Não foi possível carregar os processos com você." })
      .then((r) => vivo && setDados(r))
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Não foi possível carregar os processos com você."))
    return () => {
      vivo = false
    }
  }, [])

  if (erro) return null
  if (!dados) return null
  const total = dados.aguardando_recebimento.length + dados.com_voce.length
  if (!total) return null

  const linha = (p: ProcessoComigo) => (
    <li key={p.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-sm">
          <span className="font-semibold text-slate-900">{p.numero}</span>
          <span className="text-xs font-semibold uppercase tracking-wide text-[#173b9c]">{rotuloDoTipo(p.tipo)}</span>
          {!p.recebida ? <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-800">Aguardando recebimento</span> : null}
        </div>
        <div className="truncate text-sm text-slate-700">{p.objeto}</div>
        <div className="truncate text-xs text-slate-500">
          {p.despacho ? `“${p.despacho}” · ` : ""}
          {p.recebida ? "Com você desde" : "Enviado em"} {dataHora(p.desde)}
        </div>
      </div>
      <Link href={`/orgao/processo/${p.id}`} className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[#1351b4] hover:underline">
        {p.recebida ? "Abrir" : "Receber"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </li>
  )

  return (
    <section aria-label="Processos com você" className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Inbox className="h-4 w-4 text-[#1351b4]" aria-hidden="true" />
        Processos com você ({total})
        <Link href="/orgao/processo" className="ml-auto text-xs font-semibold text-[#1351b4] hover:underline">
          Todos os processos
        </Link>
      </h2>
      <ul className="flex flex-col gap-2">
        {dados.aguardando_recebimento.map(linha)}
        {dados.com_voce.map(linha)}
      </ul>
    </section>
  )
}
