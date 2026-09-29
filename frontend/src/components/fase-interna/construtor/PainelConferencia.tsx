"use client"

/**
 * CONFERÊNCIA ao vivo do desenho (POST …/conferir): o que falta na estrutura,
 * os requisitos da lei com ✓/✗ e o artigo, os avisos (não impedem ativar) e
 * o que o sistema ajustou ao salvar. Clicar num erro seleciona a caixa.
 */
import { Loader2 } from "lucide-react"
import type { Conferencia, ErroConferencia } from "@/lib/fluxo/grafo-editor"

export function PainelConferencia({
  conferencia,
  conferindo,
  ajustes,
  onIrParaErro,
}: {
  conferencia: Conferencia | null
  conferindo: boolean
  ajustes: Array<{ no: string | null; mensagem: string }>
  onIrParaErro?: (e: ErroConferencia) => void
}) {
  if (!conferencia) return null
  const { erros, avisos, lei } = conferencia
  const leiOk = lei.every((x) => x.ok)
  return (
    <section aria-labelledby="titulo-conferencia" className="space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <h2 id="titulo-conferencia" className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Conferência
        </h2>
        {conferindo && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" aria-label="Conferindo" />}
      </div>
      {erros.length > 0 ? (
        <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-800">
          {erros.length === 1 ? "Falta 1 ajuste no desenho" : `Faltam ${erros.length} ajustes no desenho`}
        </div>
      ) : (
        <div className="rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm font-bold text-green-800">
          {leiOk ? "Fluxo válido e conforme a lei" : "Fluxo válido"}
        </div>
      )}
      {erros.length > 0 && (
        <ul className="space-y-1.5 text-sm">
          {erros.map((e, i) => (
            <li key={`${e.codigo}-${i}`} className="grid grid-cols-[16px_1fr] gap-1.5">
              <span className="font-bold text-red-700" aria-hidden="true">
                !
              </span>
              {onIrParaErro ? (
                <button type="button" className="text-left text-slate-800 hover:underline" onClick={() => onIrParaErro(e)}>
                  {e.mensagem}
                  {e.fundamento && !e.mensagem.includes(e.fundamento) ? ` (${e.fundamento})` : ""}
                </button>
              ) : (
                <span className="text-slate-800">{e.mensagem}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {lei.length > 0 && (
        <>
          <h3 className="pt-1 text-xs font-bold text-slate-700">Requisitos da lei</h3>
          <ul className="space-y-1.5 text-sm">
            {lei.map((x) => (
              <li key={x.codigo} className="grid grid-cols-[16px_1fr] gap-1.5">
                <span className={`font-bold ${x.ok ? "text-green-700" : "text-red-700"}`} aria-label={x.ok ? "cumprido" : "não cumprido"}>
                  {x.ok ? "✓" : "✗"}
                </span>
                <span className="text-slate-800">
                  {x.texto} <span className="text-slate-500">({x.fundamento})</span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {avisos.length > 0 && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-950">
          <p className="font-semibold">Atenção (não impede ativar):</p>
          <ul className="ml-4 list-disc space-y-0.5">
            {avisos.map((a, i) => (
              <li key={`${a.codigo}-${i}`}>{a.mensagem}</li>
            ))}
          </ul>
        </div>
      )}
      {ajustes.length > 0 && (
        <div className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-800">
          <p className="font-semibold">O sistema ajustou ao salvar:</p>
          <ul className="ml-4 list-disc space-y-0.5">
            {ajustes.map((a, i) => (
              <li key={i}>{a.mensagem}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
