/**
 * SALVAMENTOS PENDENTES dos editores de peça (homologação 07/11/2026).
  * "Gerar" lia a peça antes de o último trecho digitado chegar ao servidor: o
  * salvamento atrasado chegava depois e devolvia a peça gerada a "em elaboração".
  * Cada editor registra aqui o que falta salvar; a tela espera antes de gerar.
 */

type Pendencia = { timers: Map<string, { t: ReturnType<typeof setTimeout>; salvar: () => Promise<void> }>; emCurso: Set<Promise<void>> }
const PENDENTES = new Map<string, Pendencia>()
const chavePendencia = (licitacaoId: string, tipo: string) => `${licitacaoId}:${tipo}`
export function pendenciaDe(licitacaoId: string, tipo: string): Pendencia {
  const k = chavePendencia(licitacaoId, tipo)
  let p = PENDENTES.get(k)
  if (!p) PENDENTES.set(k, (p = { timers: new Map(), emCurso: new Set() }))
  return p
}

/** Salva já o que está esperando o debounce e aguarda os salvamentos em curso da peça. */
export async function aguardarSalvamentosDaPeca(licitacaoId: string, tipo: string): Promise<void> {
  const p = PENDENTES.get(chavePendencia(licitacaoId, tipo))
  if (!p) return
  const agora = [...p.timers.values()]
  p.timers.clear()
  for (const { t, salvar } of agora) {
    clearTimeout(t)
    void salvar()
  }
  while (p.emCurso.size) await Promise.allSettled([...p.emCurso])
}
