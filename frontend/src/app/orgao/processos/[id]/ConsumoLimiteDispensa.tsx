"use client"

import { useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { AlertTriangle } from "lucide-react"
import { fmtMoeda } from "./tipos"

interface RamoConsumo {
  ramo: { classe: string; unidade_gestora: string }
  total: number
  deste_processo: number
  outros_processos: number
  quantidade_processos: number
  percentual: number
  excede: boolean
}

interface ConsumoLimite {
  aplicavel: boolean
  motivo?: string
  fundamento_referencia: string | null
  exercicio: number
  inciso?: "I" | "II"
  limite?: { valor: number; ato_normativo: string; exercicio: number; provisorio: boolean } | null
  ramos: RamoConsumo[]
  maior: RamoConsumo | null
}

const pct = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** "SERVICO:0859" → "serviços, classe 0859"; "MATERIAL:COD:446820" → "bens, código 446820". */
function descreverRamo(r: RamoConsumo["ramo"]): string {
  const [tipo, ...resto] = r.classe.split(":")
  const t = tipo === "SERVICO" ? "serviços" : "bens"
  const sufixo = resto.join(":")
  const qual =
    sufixo === "SEM_CODIGO" ? "itens sem código CATMAT/CATSER" : sufixo.startsWith("COD:") ? `código ${sufixo.slice(4)}` : `classe ${sufixo}`
  return `${t}, ${qual}${r.unidade_gestora ? ` · unidade ${r.unidade_gestora}` : ""}`
}

/**
 * CONSUMO DO LIMITE DA DISPENSA (art. 75, §1º): quanto o órgão já contratou
 * por dispensa de valor no exercício, no mesmo ramo (classe CATMAT/CATSER) e
 * unidade gestora — ex.: "98,4% de R$ 62.725,59 — Dec. 12.343/2024".
 * Só leitura (o bloqueio é o Portão A, Entrega 4). GET /fase-interna/:id/consumo-limite.
 */
export function ConsumoLimiteDispensa({ licitacaoId, atualizacao }: { licitacaoId: string; atualizacao?: unknown }) {
  const [dados, setDados] = useState<ConsumoLimite | null>(null)

  useEffect(() => {
    authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/consumo-limite`)
      .then(async (r) => (r.ok ? setDados(await r.json()) : setDados(null)))
      .catch(() => setDados(null))
  }, [licitacaoId, atualizacao])

  if (!dados?.aplicavel || !dados.limite || !dados.maior) return null
  const m = dados.maior
  const nivel = m.excede ? "excede" : m.percentual >= 80 ? "atencao" : "ok"
  const cor =
    nivel === "excede" ? "border-red-300 bg-red-50 text-red-950" : nivel === "atencao" ? "border-amber-300 bg-amber-50 text-amber-950" : "border-slate-200 bg-white text-gray-800"
  const barra = nivel === "excede" ? "bg-red-600" : nivel === "atencao" ? "bg-amber-500" : "bg-emerald-600"

  return (
    <div className={`rounded-md border p-3 text-sm space-y-2 ${cor}`} role="status">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="font-medium">
          Limite da dispensa ({dados.fundamento_referencia}) — exercício {dados.exercicio}
        </span>
        <span className="font-semibold">
          {pct(m.percentual)}% de {fmtMoeda(dados.limite.valor)} — {dados.limite.ato_normativo}
        </span>
      </div>
      <div className="h-2 rounded bg-gray-200 overflow-hidden" aria-hidden="true">
        <div className={`h-2 ${barra}`} style={{ width: `${Math.min(100, m.percentual)}%` }} />
      </div>
      <p className="text-xs">
        {fmtMoeda(m.total)} no ramo ({descreverRamo(m.ramo)}): {fmtMoeda(m.deste_processo)} deste processo
        {m.quantidade_processos > 1 ? ` + ${fmtMoeda(m.outros_processos)} de ${m.quantidade_processos - 1} outra(s) dispensa(s) do órgão` : ""}.
        {dados.limite.provisorio && ` Decreto de ${dados.exercicio} ainda não cadastrado — valor do exercício ${dados.limite.exercicio}.`}
      </p>
      {nivel !== "ok" && (
        <p className="text-xs flex items-start gap-1">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          {nivel === "excede"
            ? "A soma passa do limite: a dispensa por valor não cabe (art. 75, §1º — vedado o fracionamento). Revise o enquadramento."
            : "Consumo acima de 80% do limite no exercício — atenção ao fracionamento (art. 75, §1º)."}
        </p>
      )}
      {dados.ramos.length > 1 && (
        <p className="text-[11px] opacity-80">Outros ramos deste processo: {dados.ramos.slice(1).map((r) => `${descreverRamo(r.ramo)} ${pct(r.percentual)}%`).join("; ")}</p>
      )}
    </div>
  )
}
