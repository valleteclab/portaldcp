"use client"

/**
 * VISOR DOS AUTOS (Entrega 3B — tela do parecer; reaproveitado na Entrega 4 —
 * tela da conformidade): abas com as peças na ordem das folhas; a peça
 * anexada abre o PDF NA FOLHA; a feita no sistema mostra o texto das seções
 * e destaca o trecho (achado, diligência).
 */
import { useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"

export interface PecaDosAutos {
  documento_id: string
  tipo: string
  titulo: string
  versao: number
  anexada: boolean
  folha_inicial: number | null
  folha_final: number | null
  tem_arquivo: boolean
  secoes: Record<string, string>
}

export interface PecaAberta {
  /** documento_id quando há duas peças do mesmo tipo (ex.: relatório juntado duas vezes). */
  documento_id?: string | null
  tipo: string
  folha: number | null
  trecho: string | null
}

/** PDF autenticado em blob para o visor dos autos (abre na folha). */
export function useBlobPdf(documentoId: string | null) {
  // O blob fica amarrado ao documento: trocar de peça não mostra o PDF da anterior
  const [carregado, setCarregado] = useState<{ id: string; url: string } | null>(null)
  useEffect(() => {
    let vivo = true
    let criado: string | null = null
    if (!documentoId) return
    authFetch(`${API_URL}/api/fase-interna/documento/${documentoId}/arquivo`)
      .then(async (r) => {
        if (!r.ok || !vivo) return
        criado = URL.createObjectURL(await r.blob())
        setCarregado({ id: documentoId, url: criado })
      })
      .catch(() => null)
    return () => {
      vivo = false
      if (criado) URL.revokeObjectURL(criado)
    }
  }, [documentoId])
  return documentoId && carregado?.id === documentoId ? carregado.url : null
}

const normalizar = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/…/g, "").replace(/\s+/g, " ").trim().toLowerCase()

export function VisorDosAutos({
  autos,
  aberta,
  onAbrir,
  altura = "min-h-[560px]",
}: {
  autos: PecaDosAutos[]
  aberta: PecaAberta | null
  onAbrir: (p: PecaAberta) => void
  altura?: string
}) {
  const pecaAberta =
    (aberta?.documento_id ? autos.find((p) => p.documento_id === aberta.documento_id) : null) ?? autos.find((p) => p.tipo === aberta?.tipo) ?? null
  const pdf = useBlobPdf(pecaAberta && (pecaAberta.anexada || !Object.keys(pecaAberta.secoes).length) && pecaAberta.tem_arquivo ? pecaAberta.documento_id : null)
  const pagina = pecaAberta && aberta?.folha && pecaAberta.folha_inicial ? Math.max(1, aberta.folha - pecaAberta.folha_inicial + 1) : 1
  const trecho = aberta?.trecho ? normalizar(aberta.trecho).slice(0, 80) : null

  return (
    <section aria-label="Autos" className={`rounded-lg border bg-[#EAE6DC] overflow-hidden flex flex-col ${altura}`}>
      <div role="tablist" aria-label="Peça dos autos" className="flex gap-1 overflow-x-auto bg-white border-b px-2 pt-2">
        {autos.map((p) => {
          const ativa = pecaAberta?.documento_id === p.documento_id
          return (
            <button
              key={p.documento_id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => onAbrir({ documento_id: p.documento_id, tipo: p.tipo, folha: p.folha_inicial, trecho: null })}
              className={`h-10 px-3 text-xs whitespace-nowrap -mb-px border-b-[3px] ${ativa ? "border-[#1F4E79] font-semibold text-gray-900" : "border-transparent text-gray-600"}`}
              title={p.titulo}
            >
              {p.tipo}
              {p.folha_inicial != null && <span className="ml-1 font-mono text-[10px] text-gray-500">fl. {p.folha_inicial}</span>}
            </button>
          )
        })}
        {!autos.length && <span className="text-sm text-gray-600 p-2">Nenhuma peça nos autos ainda.</span>}
      </div>
      <div className="p-4 flex-1 min-h-0">
        {pecaAberta ? (
          pdf ? (
            <div className="h-full flex flex-col gap-2">
              {aberta?.trecho && (
                <p className="text-xs bg-[#FBEBDD] text-[#9A4308] rounded px-2 py-1">
                  Fl. {aberta.folha ?? pecaAberta.folha_inicial ?? "—"} — trecho: “{aberta.trecho}”
                </p>
              )}
              <iframe
                key={`${pdf}-${pagina}`}
                title={`${pecaAberta.titulo} (fl. ${aberta?.folha ?? pecaAberta.folha_inicial ?? "—"})`}
                src={`${pdf}#page=${pagina}`}
                className="w-full flex-1 min-h-[520px] bg-white rounded"
              />
            </div>
          ) : (
            <article className="bg-white shadow-sm px-8 py-8 font-serif text-[15px] leading-relaxed space-y-3 h-full overflow-y-auto">
              <div className="font-mono text-[11px] text-gray-600 text-right">
                {pecaAberta.titulo} · v{pecaAberta.versao}
                {pecaAberta.folha_inicial != null &&
                  ` · fl. ${pecaAberta.folha_inicial}${pecaAberta.folha_final && pecaAberta.folha_final !== pecaAberta.folha_inicial ? `–${pecaAberta.folha_final}` : ""}`}
              </div>
              {Object.entries(pecaAberta.secoes).map(([k, html]) => {
                const destacar = !!trecho && (normalizar(html).includes(trecho) || trecho.split(" ").filter((w) => w.length > 4).every((w) => normalizar(html).includes(w)))
                return <div key={k} className={destacar ? "bg-[#FBEBDD] outline outline-2 outline-[#C2651A] rounded px-1.5" : ""} dangerouslySetInnerHTML={{ __html: html }} />
              })}
              {!Object.keys(pecaAberta.secoes).length && (
                <p className="text-sm text-gray-600 font-sans">{pecaAberta.tem_arquivo ? "Carregando o PDF…" : "Peça sem texto nem arquivo."}</p>
              )}
            </article>
          )
        ) : null}
      </div>
    </section>
  )
}
