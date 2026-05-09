"use client"

import { Check, AlertCircle, Clock, Lock } from "lucide-react"

export interface EtapaTimeline {
  id: string
  sigla: string
  nome: string
  art: string
  status: "concluida" | "em_andamento" | "pendente" | "bloqueada"
  conformidade?: number
}

export const ETAPAS_FASE_INTERNA: EtapaTimeline[] = [
  { id: "dfd", sigla: "DFD", nome: "Formalização da Demanda", art: "Art. 18, I", status: "pendente" },
  { id: "etp", sigla: "ETP", nome: "Estudo Técnico Preliminar", art: "Art. 18, §1º", status: "pendente" },
  { id: "mr", sigla: "MR", nome: "Mapa de Riscos", art: "Art. 18, X", status: "pendente" },
  { id: "pp", sigla: "PP", nome: "Pesquisa de Preços", art: "Art. 23", status: "pendente" },
  { id: "tr", sigla: "TR", nome: "Termo de Referência", art: "Art. 6º, XXIII", status: "pendente" },
  { id: "aut", sigla: "AUT", nome: "Autorização da Autoridade", art: "Art. 18, II", status: "pendente" },
  { id: "ed", sigla: "ED", nome: "Minuta do Edital", art: "Art. 25", status: "pendente" },
  { id: "pj", sigla: "PJ", nome: "Parecer Jurídico", art: "Art. 53", status: "pendente" },
]

interface ProcessoTimelineProps {
  etapas?: EtapaTimeline[]
  onEtapaClick?: (etapa: EtapaTimeline) => void
}

export function ProcessoTimeline({ etapas = ETAPAS_FASE_INTERNA, onEtapaClick }: ProcessoTimelineProps) {
  return (
    <div className="relative">
      {/* Linha conectora */}
      <div className="absolute top-8 left-8 right-8 h-0.5 bg-gray-100" />

      <div className="grid grid-cols-8 gap-2 relative">
        {etapas.map((etapa, idx) => {
          const isLast = idx === etapas.length - 1
          return (
            <button
              key={etapa.id}
              onClick={() => onEtapaClick?.(etapa)}
              className={`flex flex-col items-center gap-2 p-3 rounded-xl transition-all group ${
                onEtapaClick ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
              }`}
            >
              {/* Ícone */}
              <div
                className={`w-12 h-12 rounded-full flex items-center justify-center relative z-10 border-2 transition-all ${
                  etapa.status === "concluida"
                    ? "bg-[#168821] border-[#168821] text-white"
                    : etapa.status === "em_andamento"
                    ? "bg-[#1351b4] border-[#1351b4] text-white shadow-lg shadow-blue-200"
                    : etapa.status === "bloqueada"
                    ? "bg-gray-100 border-gray-200 text-gray-400"
                    : "bg-white border-gray-200 text-gray-500 group-hover:border-[#1351b4] group-hover:text-[#1351b4]"
                }`}
              >
                {etapa.status === "concluida" ? (
                  <Check className="w-5 h-5" />
                ) : etapa.status === "em_andamento" ? (
                  <Clock className="w-5 h-5" />
                ) : etapa.status === "bloqueada" ? (
                  <Lock className="w-4 h-4" />
                ) : (
                  <span className="text-xs font-bold">{etapa.sigla}</span>
                )}

                {etapa.status === "em_andamento" && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#ffcd07] rounded-full border-2 border-white" />
                )}
              </div>

              {/* Info */}
              <div className="text-center">
                <div
                  className={`text-[10px] font-bold uppercase tracking-wide mb-0.5 ${
                    etapa.status === "em_andamento"
                      ? "text-[#1351b4]"
                      : etapa.status === "concluida"
                      ? "text-[#168821]"
                      : "text-gray-600"
                  }`}
                >
                  {etapa.sigla}
                </div>
                <div className="text-[11px] text-gray-700 font-medium leading-tight">{etapa.nome}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{etapa.art}</div>
                {etapa.conformidade !== undefined && (
                  <div
                    className={`text-[10px] font-bold mt-1 ${
                      etapa.conformidade >= 90 ? "text-green-600" : etapa.conformidade >= 70 ? "text-yellow-600" : "text-red-500"
                    }`}
                  >
                    {etapa.conformidade}%
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
