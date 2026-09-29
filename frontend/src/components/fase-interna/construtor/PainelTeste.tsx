"use client"

/**
 * TESTAR o fluxo (POST …/simular — a MESMA regra do processo real; nada é
 * gravado): um exemplo com valor e tipo de contratação, os cartões de quem
 * está com o processo agora ("Está com Compras — Concluir / Aprovar /
 * Devolver / Sim / Não") e o que aconteceu, passo a passo.
 */
import { useId } from "react"
import { Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ROTULO_TIPO_CONTRATACAO } from "@/lib/fluxo/grafo-editor"

export interface AtivoNoTeste {
  id: string
  nome: string
  tipo: string
  quem: string | null
  pecas: string[]
  pergunta: boolean
  pode_devolver: boolean
}

export interface EstadoDoTeste {
  estado: unknown
  log: string[]
  ativos: AtivoNoTeste[]
  fim: boolean
  erro: string | null
  /** Erros de estrutura que impedem testar. */
  bloqueio: string[]
}

export type AcaoDoTeste = { tipo: "concluir"; no: string } | { tipo: "responder"; no: string; resposta: "sim" | "nao" } | { tipo: "devolver"; no: string }

export function PainelTeste({
  teste,
  ocupado,
  valor,
  tipoContratacao,
  onValor,
  onTipoContratacao,
  onRecomecar,
  onAcao,
}: {
  teste: EstadoDoTeste | null
  ocupado: boolean
  valor: string
  tipoContratacao: string
  onValor: (v: string) => void
  onTipoContratacao: (v: string) => void
  onRecomecar: () => void
  onAcao: (a: AcaoDoTeste) => void
}) {
  const id = useId()
  return (
    <section className="space-y-3" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`} className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
        Testar com um exemplo
      </h2>
      <p className="text-xs text-slate-600">O teste usa a mesma regra do processo de verdade e não grava nada.</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label htmlFor={`${id}-valor`} className="text-xs font-bold text-slate-700">
            Valor estimado (R$)
          </label>
          <Input id={`${id}-valor`} inputMode="decimal" placeholder="60.000,00" value={valor} onChange={(e) => onValor(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label htmlFor={`${id}-tipo`} className="text-xs font-bold text-slate-700">
            Tipo
          </label>
          <select id={`${id}-tipo`} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm" value={tipoContratacao} onChange={(e) => onTipoContratacao(e.target.value)}>
            <option value="">—</option>
            {Object.entries(ROTULO_TIPO_CONTRATACAO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRecomecar} disabled={ocupado}>
        {ocupado ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}
        {teste ? "Recomeçar o teste" : "Começar o teste"}
      </Button>

      {teste && teste.bloqueio.length > 0 && (
        <div className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
          <p className="font-bold">Ajuste o desenho antes de testar:</p>
          <ul className="ml-4 list-disc">
            {teste.bloqueio.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {teste?.erro && teste.bloqueio.length === 0 && (
        <p role="alert" className="rounded-md bg-red-50 px-2.5 py-2 text-sm text-red-800">
          {teste.erro}
        </p>
      )}
      {teste?.fim && <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-bold text-green-800">Chegou ao fim do fluxo.</div>}

      {teste && !teste.fim && teste.ativos.length > 0 && (
        <p className="text-xs text-slate-600">
          {teste.ativos.length > 1 ? "Estas etapas andam ao mesmo tempo. Faça cada uma como a pessoa indicada." : "Faça a etapa como a pessoa indicada."}
        </p>
      )}
      {teste?.ativos.map((a) => (
        <div key={a.id} className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
          <p className="text-sm font-bold text-slate-900">{a.nome}</p>
          <p className="text-xs text-slate-700">
            {a.pergunta ? "Pergunta para quem conduz" : `Está com ${a.quem ?? "quem conduz"}`}
            {a.pecas.length ? ` · faz: ${a.pecas.join(", ")}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            {a.pergunta ? (
              <>
                <Button type="button" size="sm" disabled={ocupado} onClick={() => onAcao({ tipo: "responder", no: a.id, resposta: "sim" })}>
                  Sim
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => onAcao({ tipo: "responder", no: a.id, resposta: "nao" })}>
                  Não
                </Button>
              </>
            ) : (
              <>
                <Button type="button" size="sm" disabled={ocupado} onClick={() => onAcao({ tipo: "concluir", no: a.id })}>
                  {a.tipo === "aprovacao" ? "Aprovar" : "Concluir"}
                </Button>
                {a.pode_devolver && (
                  <Button type="button" size="sm" variant="outline" disabled={ocupado} onClick={() => onAcao({ tipo: "devolver", no: a.id })}>
                    Devolver
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      ))}

      {teste && teste.log.length > 0 && (
        <>
          <h3 className="pt-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">O que aconteceu</h3>
          <ol className="space-y-1.5 text-sm text-slate-700">
            {[...teste.log].reverse().map((t, i) => (
              <li key={teste.log.length - i}>{t}</li>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
