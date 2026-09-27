"use client"

/**
 * DESENHO DO FLUXO (F1) — diagrama leve, em CSS: uma coluna por NÍVEL de
 * dependência (nível 1 = não depende de ninguém; etapas da mesma coluna podem
 * correr em paralelo). Cada caixa diz de quem depende. As etapas desligadas
 * (opcionais) aparecem apagadas no fim. A edição é pela lista; isto só mostra.
 */
import { ArrowRight } from "lucide-react"

export interface EtapaDoDesenho {
  codigo: string
  titulo: string
  ligada: boolean
  obrigatoria: boolean
  conclusao: string
  depende_de: string[]
  prazo_dias_uteis: number | null
  responsavel_rotulo?: string
}

export function DesenhoFluxo({ niveis, etapas }: { niveis: Array<{ nivel: number; etapas: string[] }>; etapas: EtapaDoDesenho[] }) {
  const porCodigo = new Map(etapas.map((e) => [e.codigo, e]))
  const titulo = (c: string) => porCodigo.get(c)?.titulo ?? c
  const desligadas = etapas.filter((e) => !e.ligada)
  return (
    <figure aria-label="Desenho do fluxo da fase interna" className="space-y-3">
      <div className="overflow-x-auto pb-2">
        <ol className="flex items-stretch gap-2 min-w-max" aria-label="Colunas por nível de dependência">
          {niveis.map((n, i) => (
            <li key={n.nivel} className="flex items-center gap-2">
              <div className="flex flex-col gap-2 w-44">
                <span className="text-[11px] uppercase tracking-wide text-slate-500">
                  {i === 0 ? "Início" : `Passo ${n.nivel}`}
                  {n.etapas.length > 1 ? " · em paralelo" : ""}
                </span>
                {n.etapas.map((c) => {
                  const e = porCodigo.get(c)
                  const deps = (e?.depende_de ?? []).filter((d) => porCodigo.get(d)?.ligada)
                  return (
                    <div
                      key={c}
                      className={`rounded-md border px-2 py-1.5 text-xs bg-white shadow-sm ${e?.obrigatoria ? "border-slate-400" : "border-dashed border-blue-400"}`}
                    >
                      <div className="font-medium text-slate-900 leading-snug">{titulo(c)}</div>
                      <div className="text-[11px] text-slate-600">
                        {e?.obrigatoria ? "obrigatória" : "opcional"}
                        {e?.conclusao === "REGISTRO" ? " · despacho" : ""}
                        {e?.prazo_dias_uteis ? ` · ${e.prazo_dias_uteis} d.u.` : ""}
                      </div>
                      {e?.responsavel_rotulo && <div className="text-[11px] text-slate-600 truncate">{e.responsavel_rotulo}</div>}
                      {deps.length > 0 && <div className="text-[11px] text-slate-500 mt-0.5">depois de: {deps.map(titulo).join(", ")}</div>}
                    </div>
                  )
                })}
              </div>
              {i < niveis.length - 1 && <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      </div>
      {desligadas.length > 0 && (
        <figcaption className="text-xs text-slate-600">
          Desligadas (opcionais, fora do caminho): {desligadas.map((e) => e.titulo).join(" · ")}
        </figcaption>
      )}
    </figure>
  )
}
