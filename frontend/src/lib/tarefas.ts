/**
 * Tarefas da fase interna (Entrega 2) — tipos e rótulos compartilhados entre
 * a caixa de tarefas, o menu (badge) e a tela do processo.
 * Fonte: GET /api/tarefas, /api/tarefas/contagem, /api/fase-interna/:id/etapas.
 */
import { useSyncExternalStore } from "react"
import { API_URL, authFetch } from "@/lib/api"

export interface TarefaTela {
  id: string
  titulo: string
  descricao: string | null
  status: "ABERTA" | "CONCLUIDA" | "CANCELADA"
  tipo: string
  origem: string
  etapa: string | null
  etapa_titulo: string | null
  passo: string | null
  tipo_peca: string | null
  prazo: string | null
  prazo_dias_uteis: number | null
  dias_uteis_restantes: number | null
  atrasada: boolean
  processo: { id: string; numero_processo: string; objeto: string | null; modalidade: string; fase: string }
  responsavel: { usuario_id: string | null; nome: string | null; papel: string | null; setor_id: string | null; setor_nome: string | null; rotulo: string }
  destino: string
  pode_assumir: boolean
  pode_reatribuir: boolean
  concluida_por_nome: string | null
  concluida_em: string | null
  cancelada_em: string | null
  motivo_cancelamento: string | null
  created_at: string
}

export interface CaixaTarefas {
  aba: string
  tarefas: TarefaTela[]
  contagem: { para_mim: number; atrasadas: number; aguardando: number }
  prazos_semana: Array<{ data: string; titulo: string; licitacao_id: string; tarefa_id: string | null; atrasada: boolean }>
}

export const ROTULO_PAPEL: Record<string, string> = {
  REQUISITANTE: "Requisitante",
  COMPRAS: "Compras",
  CONTABILIDADE: "Contabilidade",
  JURIDICO: "Jurídico",
  CONTROLE_INTERNO: "Controle interno",
  AUTORIDADE: "Autoridade",
  AGENTE_CONTRATACAO: "Agente de contratação",
  PLANEJAMENTO: "Planejamento (monta o DFD)",
}

const fmt = (d: string | Date, opts: Intl.DateTimeFormatOptions) =>
  new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", ...opts })

export const fmtDia = (d?: string | null) => (d ? fmt(d, { day: "2-digit", month: "2-digit", year: "numeric" }) : "—")
export const fmtDiaCurto = (d?: string | null) => (d ? fmt(d, { day: "2-digit", month: "2-digit" }) : "—")

/** "Vence hoje", "Em 2 dias úteis", "Atrasada desde 25/09", "Sem prazo". */
export function rotuloPrazo(t: Pick<TarefaTela, "prazo" | "atrasada" | "dias_uteis_restantes" | "status">): string {
  if (t.status !== "ABERTA") return ""
  if (!t.prazo) return "Sem prazo"
  if (t.atrasada) return `Atrasada desde ${fmtDiaCurto(t.prazo)}`
  const n = t.dias_uteis_restantes ?? 0
  if (n <= 0) return "Vence hoje"
  return n === 1 ? "Em 1 dia útil" : `Em ${n} dias úteis`
}

/** Contagem para o badge do menu (evento "tarefas-atualizadas" recarrega). */
export async function carregarContagemTarefas(): Promise<{ para_mim: number; atrasadas: number } | null> {
  try {
    const r = await authFetch(`${API_URL}/api/tarefas/contagem`)
    return r.ok ? await r.json() : null
  } catch {
    return null
  }
}

export const avisarTarefasAtualizadas = () => {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("tarefas-atualizadas"))
}

// ─── Contagem ÚNICA (homologação 26/09/2026) ─────────────────────────────
// O menu principal e o menu da fase interna buscavam a contagem cada um na sua
// hora (24 × 25 na mesma tela). Agora há um valor só na página: os dois badges
// leem daqui, uma busca por vez, e a caixa de tarefas publica a contagem que
// acabou de receber — os três números são sempre o mesmo.

export type ContagemTarefas = { para_mim: number; atrasadas: number }

let contagemAtual: ContagemTarefas | null = null
let buscaEmCurso: Promise<void> | null = null
const ouvintes = new Set<() => void>()

function publicar(c: ContagemTarefas | null) {
  const mudou = c?.para_mim !== contagemAtual?.para_mim || c?.atrasadas !== contagemAtual?.atrasadas
  contagemAtual = c
  if (mudou) ouvintes.forEach((f) => f())
}

/** Publica a contagem recebida por outra leitura (ex.: a caixa de tarefas). */
export function publicarContagemTarefas(c: ContagemTarefas | null | undefined) {
  if (c) publicar({ para_mim: Number(c.para_mim) || 0, atrasadas: Number(c.atrasadas) || 0 })
}

/** Recarrega a contagem do servidor (chamadas simultâneas viram uma busca só). */
export function atualizarContagemTarefas(): Promise<void> {
  if (!buscaEmCurso) {
    buscaEmCurso = carregarContagemTarefas()
      .then((c) => {
        if (c) publicar(c)
      })
      .finally(() => {
        buscaEmCurso = null
      })
  }
  return buscaEmCurso
}

let ouvindoEvento = false
function assinar(f: () => void) {
  ouvintes.add(f)
  if (!ouvindoEvento && typeof window !== "undefined") {
    ouvindoEvento = true
    window.addEventListener("tarefas-atualizadas", () => void atualizarContagemTarefas())
  }
  return () => {
    ouvintes.delete(f)
  }
}

/** Badge de "Minhas tarefas": a mesma contagem em todos os menus da página. */
export function useContagemTarefas(): ContagemTarefas | null {
  return useSyncExternalStore(
    assinar,
    () => contagemAtual,
    () => null,
  )
}
