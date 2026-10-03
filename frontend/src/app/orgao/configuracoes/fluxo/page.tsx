"use client"

/**
 * DESENHAR O FLUXO DA FASE INTERNA — construtor de arrastar e soltar (PR 2 do
 * construtor; docs/licitacao/PLANO-CONSTRUTOR-FLUXO.md). Um desenho por tipo
 * de processo (Dispensa, Inexigibilidade, Licitação): caixas e setas, com
 * etapas criadas pelo órgão, perguntas que o sistema responde sozinho e
 * devolução para correção. O que se edita é o rascunho; "Ativar" confere pela
 * lei e publica a versão que os processos novos seguem.
 * Fonte: /api/fluxo-fase-interna/construtor/:tipo.
 */
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2 } from "lucide-react"
import { EditorFluxo } from "@/components/fase-interna/construtor/EditorFluxo"
import { PlanejamentoFluxoCard } from "@/components/fase-interna/fluxo/PlanejamentoFluxoCard"
import { TIPOS_PROCESSO, type TipoProcesso } from "@/lib/fluxo/tela-construtor"

function ehAdminDoOrgao(): boolean {
  try {
    const u = localStorage.getItem("usuario")
    if (!u) return true // login do próprio órgão
    return JSON.parse(u)?.role === "ADMIN"
  } catch {
    return false
  }
}

function tipoDaUrl(): TipoProcesso | null {
  try {
    const t = new URLSearchParams(window.location.search).get("tipo")?.toUpperCase()
    return TIPOS_PROCESSO.some((x) => x.tipo === t) ? (t as TipoProcesso) : null
  } catch {
    return null
  }
}

export default function DesenharFluxoPage() {
  const router = useRouter()
  const [tipo, setTipo] = useState<TipoProcesso>("DISPENSA")
  const [admin, setAdmin] = useState<boolean | null>(null)
  const [modoTecnico, setModoTecnico] = useState<boolean | null>(null)

  useEffect(() => {
    const tecnico = new URLSearchParams(window.location.search).get("tecnico") === "1"
    if (!tecnico) {
      router.replace("/orgao/configuracoes/fluxos")
      return
    }
    // Link direto para uma aba (ex.: ?tipo=LICITACAO) e quem pode editar (lidos no navegador)
    const t = tipoDaUrl()
    const a = ehAdminDoOrgao()
    queueMicrotask(() => {
      setModoTecnico(true)
      if (t) setTipo(t)
      setAdmin(a)
    })
  }, [router])

  if (modoTecnico !== true) {
    return <div className="flex justify-center py-20"><Loader2 className="h-7 w-7 animate-spin text-blue-700" aria-label="Abrindo o construtor simples" /></div>
  }

  const trocarTipo = (t: TipoProcesso) => {
    setTipo(t)
    try {
      const u = new URL(window.location.href)
      u.searchParams.set("tipo", t)
      window.history.replaceState(null, "", u.toString())
    } catch {
      /* só a aba muda */
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <div>
        <Link href="/orgao/configuracoes/fase-interna" className="inline-flex items-center gap-1 text-sm text-blue-800 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Fase interna e tarefas
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-slate-800">Desenhar o fluxo da fase interna</h1>
        <p className="text-sm text-slate-600">
          Monte o caminho do processo com caixas e setas. O sistema confere pela Lei 14.133 enquanto você desenha. Nada muda nos processos até você
          ativar.
        </p>
      </div>

      <div role="tablist" aria-label="Tipo de processo" className="flex flex-wrap gap-2">
        {TIPOS_PROCESSO.map((t) => (
          <button
            key={t.tipo}
            type="button"
            role="tab"
            aria-selected={tipo === t.tipo}
            className={`h-9 rounded-md border px-4 text-sm font-semibold ${tipo === t.tipo ? "border-blue-700 bg-blue-700 text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"}`}
            onClick={() => trocarTipo(t.tipo)}
          >
            {t.rotulo}
          </button>
        ))}
      </div>

      {admin !== null && <EditorFluxo key={tipo} tipo={tipo} admin={admin} />}

      <details className="rounded-xl border border-slate-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-800">Antes do processo: aprovação da demanda e DFD consolidado</summary>
        <div className="mt-3">{admin !== null && <PlanejamentoFluxoCard admin={admin} />}</div>
      </details>
    </div>
  )
}
