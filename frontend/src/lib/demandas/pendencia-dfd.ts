/**
 * Pendência "Montar o DFD" (unidade de planejamento): demandas aprovadas
 * livres — sem DFD e sem processo — do órgão do token. O número só vem para
 * quem monta o DFD (Configurações › Fluxo); os demais recebem zero.
 * Fonte: GET /api/dfds-consolidados/pendencia (menu "DFD consolidado (N)").
 * Na caixa "Minhas tarefas" a mesma pendência vem em `pendencias` (GET /api/tarefas).
 */
import { API_URL, authFetch } from "@/lib/api"

export interface PendenciaDfdMenu {
  pode_montar: boolean
  demandas_livres: number
  por_ano: Array<{ ano: number; n: number }>
  destino: string | null
}

/** Pendência na caixa "Para mim" (fora dos processos). */
export interface PendenciaCaixa {
  chave: string
  titulo: string
  descricao: string
  quantidade: number
  por_ano: Array<{ ano: number; n: number }>
  destino: string
}

export async function carregarPendenciaDfd(): Promise<PendenciaDfdMenu | null> {
  try {
    const r = await authFetch(`${API_URL}/api/dfds-consolidados/pendencia`)
    return r.ok ? ((await r.json()) as PendenciaDfdMenu) : null
  } catch {
    return null
  }
}

/** Ano pedido no link (`?ano=`) — o aviso e a pendência levam ao exercício com demanda livre. */
export function anoDoLink(search: string): number | null {
  const n = Number(new URLSearchParams(search).get("ano"))
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null
}
