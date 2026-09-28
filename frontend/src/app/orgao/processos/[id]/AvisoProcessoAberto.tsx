"use client"

/**
 * AVISO "PROCESSO ABERTO" — aparece uma vez quando a tela do processo é aberta
 * logo depois de "Abrir processo" no DFD consolidado (`?aberto=dfd&dfd=…`):
 * "Processo nº X aberto a partir do DFD nº N/AAAA — está com <setor>.
 * Próximo passo: <etapa em curso> (<quem>)". Usa o que a API já devolve:
 * GET …/tramitacao/com-quem-esta e as etapas da fase interna (já carregadas
 * pela tela). Fecha no X; o parâmetro sai da barra de endereço.
 */
import { useEffect, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, X } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { comQuemEstaTexto, proximoPassoDoProcesso, type EtapasDoProcesso, type PosseDoProcesso } from "@/lib/demandas/proxima-acao-dfd"

export function AvisoProcessoAberto({
  licitacaoId,
  numeroProcesso,
  etapas,
}: {
  licitacaoId: string
  numeroProcesso: string | null | undefined
  etapas: EtapasDoProcesso | null
}) {
  const busca = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  // Lê o pedido uma vez (estado inicial) e limpa a URL: recarregar a página não repete o aviso
  const [aviso, setAviso] = useState<{ dfd: string | null } | null>(() => (busca.get("aberto") === "dfd" ? { dfd: busca.get("dfd") } : null))
  const [posse, setPosse] = useState<PosseDoProcesso | null>(null)

  useEffect(() => {
    if (busca.get("aberto") === "dfd") router.replace(pathname, { scroll: false })
  }, [busca, pathname, router])

  useEffect(() => {
    if (!aviso) return
    let vivo = true
    authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/tramitacao/com-quem-esta`, { cache: "no-store" })
      .then(async (r) => {
        if (r.ok && vivo) setPosse(await r.json())
      })
      .catch(() => { /* o aviso sai sem "está com" */ })
    return () => {
      vivo = false
    }
  }, [aviso, licitacaoId])

  if (!aviso) return null
  const comQuem = comQuemEstaTexto(posse)
  const proximo = proximoPassoDoProcesso(etapas)
  return (
    <div role="status" className="rounded-lg border border-green-300 bg-green-50 p-3 sm:p-4 text-sm text-green-950 flex items-start gap-3">
      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-700 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="font-semibold">
          Processo{numeroProcesso ? ` nº ${numeroProcesso}` : ""} aberto{aviso.dfd ? ` a partir do ${aviso.dfd}` : ""}
          {comQuem ? ` — está com ${comQuem}` : ""}.
        </p>
        {proximo ? (
          <p>
            Próximo passo: <b>{proximo.titulo}</b>
            {proximo.quem ? ` (${proximo.quem})` : ""}.
          </p>
        ) : (
          <p>Siga pela etapa atual, abaixo.</p>
        )}
      </div>
      <button type="button" onClick={() => setAviso(null)} aria-label="Fechar aviso" className="shrink-0 rounded p-0.5 hover:bg-green-100">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  )
}
