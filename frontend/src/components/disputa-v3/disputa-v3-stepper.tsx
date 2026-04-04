'use client'

import { ETAPAS_V3, getEtapaAtualIndex } from './utils'
import { DisputaV3Contexto } from './types'

interface Props {
  contexto?: DisputaV3Contexto | null
}

export function DisputaV3Stepper({ contexto }: Props) {
  const etapaAtual = getEtapaAtualIndex(contexto)

  return (
    <div className="grid grid-cols-5 gap-2 lg:grid-cols-10">
      {ETAPAS_V3.map((etapa, index) => {
        const ativa = contexto?.etapa.codigo === etapa.codigo
        const concluida = index < etapaAtual

        return (
          <div
            key={etapa.codigo}
            className={`rounded-xl border px-3 py-2 text-center text-xs font-medium transition-colors ${
              ativa
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : concluida
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-slate-200 bg-white text-slate-500'
            }`}
          >
            <div className="mb-1 text-[11px] uppercase tracking-wide">
              {String(index + 1).padStart(2, '0')}
            </div>
            <div>{etapa.label}</div>
          </div>
        )
      })}
    </div>
  )
}
