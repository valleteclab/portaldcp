/**
 * Tarefas da fase interna (Entrega 2) — tipos e rótulos compartilhados entre
 * a caixa de tarefas, o menu (badge) e a tela do processo.
 * Fonte: GET /api/tarefas, /api/tarefas/contagem, /api/fase-interna/:id/etapas.
 */
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
