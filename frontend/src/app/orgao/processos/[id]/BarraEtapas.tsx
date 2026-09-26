import type { Etapa, EstadoEtapa } from "./etapas"

const ESTILO: Record<EstadoEtapa, { barra: string; titulo: string; detalhe: string; sr: string }> = {
  ok: { barra: "bg-green-600", titulo: "text-gray-900", detalhe: "text-green-800", sr: "concluída" },
  alerta: { barra: "bg-amber-500", titulo: "text-gray-900", detalhe: "text-amber-800", sr: "com alerta" },
  erro: { barra: "bg-red-600", titulo: "text-red-800", detalhe: "text-red-700", sr: "com erro" },
  atual: { barra: "bg-blue-600", titulo: "text-blue-800", detalhe: "text-blue-800", sr: "etapa atual" },
  futura: { barra: "bg-gray-200", titulo: "text-gray-600", detalhe: "text-gray-600", sr: "futura" },
}

/**
 * BARRA DE ETAPAS horizontal (substitui a linha do tempo vertical). Rola na
 * horizontal no celular; cada etapa diz o estado também em texto (leitor de
 * tela), não só pela cor.
 */
export function BarraEtapas({ etapas }: { etapas: Etapa[] }) {
  return (
    <nav aria-label="Etapas do processo" className="rounded-lg border bg-white p-3 overflow-x-auto">
      <ol className="flex gap-3 min-w-max">
        {etapas.map((e, i) => {
          const s = ESTILO[e.estado]
          const atual = e.estado === "atual" || (e.estado === "erro" && e.detalhe.startsWith("Etapa atual"))
          return (
            <li key={e.chave} className="w-36 shrink-0" aria-current={atual ? "step" : undefined}>
              <div className={`h-1 rounded-full ${s.barra}`} aria-hidden="true" />
              <p className={`mt-2 text-sm font-semibold ${s.titulo}`}>
                {i + 1} · {e.titulo}
                <span className="sr-only"> ({s.sr})</span>
              </p>
              {e.detalhe && <p className={`text-xs ${s.detalhe}`}>{e.detalhe}</p>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
