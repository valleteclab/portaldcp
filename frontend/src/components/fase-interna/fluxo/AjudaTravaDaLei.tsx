"use client"

/**
 * "?" DA TRAVA DA LEI — explicação curta (plano §3): o que é uma trava, o ato
 * que cada uma segura e o que ela exige. `destaque` põe a trava em questão
 * em primeiro lugar.
 */
import { HelpCircle } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { TRAVAS_DA_LEI, type LetraTrava } from "@/lib/fase-interna/travas"

export function AjudaTravaDaLei({ destaque }: { destaque?: LetraTrava }) {
  const letras: LetraTrava[] = destaque ? [destaque, ...(["A", "B", "C"] as const).filter((l) => l !== destaque)] : ["A", "B", "C"]
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center align-middle text-slate-500 hover:text-blue-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-700 rounded-full"
          aria-label="O que é a trava da lei?"
        >
          <HelpCircle className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] text-xs space-y-2" align="start">
        <p className="font-semibold text-sm text-gray-900">Trava da lei</p>
        <p className="text-gray-700">
          Verificação obrigatória ligada a um ato: o sistema não deixa o ato acontecer enquanto a lei não estiver cumprida. As demais
          verificações da conformidade são <b>atenções</b> — para conferir ou justificar, sem travar.
        </p>
        <ul className="space-y-1.5">
          {letras.map((l) => (
            <li key={l} className={destaque === l ? "rounded bg-amber-50 border border-amber-200 px-1.5 py-1" : ""}>
              <b className="text-gray-900">Segura {TRAVAS_DA_LEI[l].ato}</b>
              <span className="text-gray-700">: {TRAVAS_DA_LEI[l].exige} ({TRAVAS_DA_LEI[l].base}).</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
