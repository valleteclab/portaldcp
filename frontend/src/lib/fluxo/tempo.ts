import { apiFluxo } from "./desenho"

/** Andamento › Tempo por etapa — formatos de `GET /workflows/tempo-etapas*`. */

export interface VersaoComTempo {
  id: string
  nome: string
  versao: number
  status: string
  ativo: boolean
  tipo_processo: string | null
  processos: number
}

export interface EtapaComTempo {
  acao_id: string
  nome: string
  responsavel: string | null
  prazo_dias_uteis: number | null
  media_dias_uteis: number | null
  concluidas: number
  no_prazo: number
  avaliadas: number
  abertas_agora: number
  atrasadas_agora: number
  refeita: number
  refeita_por: Array<{ etapa: string; vezes: number }>
  devolveu: number
}

export interface ResumoTempo {
  fluxo: { id: string; nome: string; versao: number; status: string; tipo_processo: string | null }
  periodo_dias: number
  resumo: {
    processos_concluidos: number
    tempo_total_medio_dias_uteis: number | null
    prazo_somado_dias_uteis: number
    pct_no_prazo: number | null
    pior_etapa: { acao_id: string; nome: string; excesso_dias_uteis: number } | null
  }
  etapas: EtapaComTempo[]
}

export interface DetalheTempo {
  fluxo: ResumoTempo["fluxo"]
  periodo_dias: number
  acao_id: string
  nome: string
  responsavel: string | null
  prazo_dias_uteis: number | null
  posicao: number
  total_etapas: number
  media_dias_uteis: number | null
  concluidas: number
  no_prazo: number
  avaliadas: number
  mais_rapida: number | null
  mais_lenta: number | null
  devolveu: number
  refeita: number
  refeita_por: Array<{ etapa: string; vezes: number }>
  meses: Array<{ mes: string; media_dias_uteis: number | null; concluidas: number }>
  espera: { espera_dias_uteis: number | null; analise_dias_uteis: number | null; processos: number } | null
  /** Só vem para o administrador do órgão. */
  por_pessoa: Array<{ nome: string; concluidas: number; media_dias_uteis: number | null }> | null
  processos: Array<{ processo_id: string | null; numero: string | null; objeto: string | null; quem: string | null; dias_uteis: number; rodadas: number; acima_do_prazo: boolean }>
}

export const PERIODOS_TEMPO: Array<{ dias: number; rotulo: string }> = [
  { dias: 30, rotulo: "Últimos 30 dias" },
  { dias: 90, rotulo: "Últimos 90 dias" },
  { dias: 180, rotulo: "Últimos 6 meses" },
  { dias: 365, rotulo: "Últimos 12 meses" },
]

export const versoesComTempo = () => apiFluxo<VersaoComTempo[]>("/tempo-etapas/opcoes")
export const resumoTempo = (fluxo: string, dias: number) => apiFluxo<ResumoTempo>(`/tempo-etapas?fluxo=${encodeURIComponent(fluxo)}&dias=${dias}`)
export const detalheTempo = (fluxo: string, etapa: string, dias: number) =>
  apiFluxo<DetalheTempo>(`/tempo-etapas/etapa?fluxo=${encodeURIComponent(fluxo)}&etapa=${encodeURIComponent(etapa)}&dias=${dias}`)

/** "8,2" — uma casa, vírgula. */
export function diasFmt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—"
  return v.toLocaleString("pt-BR", { minimumFractionDigits: Number.isInteger(v) ? 0 : 1, maximumFractionDigits: 1 })
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
/** "2026-09" → "set/26". */
export function rotuloMes(mes: string): string {
  const [a, m] = mes.split("-")
  return `${MESES[Number(m) - 1] ?? m}/${String(a).slice(2)}`
}
