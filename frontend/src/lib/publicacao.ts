/**
 * Publicação / prazos (E7) — utilitários das telas de edital, retificação,
 * revogação/anulação e fila do PNCP.
 *
 * Convenção de fuso: o backend devolve instantes em ISO (UTC) ou "relógio de
 * Brasília" sem fuso (`AAAA-MM-DDTHH:MM:SS`, já em UTC-3). A tela sempre exibe
 * em Brasília; os campos `datetime-local` estão no horário local do navegador
 * e são convertidos com `new Date(valor).toISOString()`.
 */

import { API_URL, authFetch } from "@/lib/api"

export const FUSO_BRASILIA = "America/Sao_Paulo"

/** Erro do backend: mensagem + pendências (400 dos atos/regras de prazo). */
export interface ErroBackend {
  mensagem: string
  pendencias: string[]
}

/** Lê `message` e `pendencias` do corpo de erro (sem lançar). */
export async function lerErro(res: Response, padrao = "Não foi possível concluir a operação"): Promise<ErroBackend> {
  const j = await res.json().catch(() => null)
  const msg = Array.isArray(j?.message) ? j.message.join("; ") : j?.message
  const pendencias: string[] = Array.isArray(j?.pendencias) ? j.pendencias.filter(Boolean).map(String) : []
  return { mensagem: msg || `${padrao} (HTTP ${res.status})`, pendencias }
}

/** Erro de rede/exceção como ErroBackend. */
export function erroDeExcecao(e: unknown, padrao = "Falha de comunicação com o servidor"): ErroBackend {
  return { mensagem: (e as any)?.message || padrao, pendencias: [] }
}

const RELOGIO_SEM_FUSO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/
const DATA_BR = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ ,]+(\d{2}):(\d{2}))?/

/**
 * Converte o que o backend manda em Date:
 * - ISO com fuso (`...Z`/`+00:00`) → como está;
 * - relógio de Brasília sem fuso (`AAAA-MM-DDTHH:MM[:SS]`) → UTC-3;
 * - `dd/mm/aaaa hh:mm` (Brasília) → UTC-3.
 */
export function paraData(v: string | Date | null | undefined): Date | null {
  if (!v) return null
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v
  const s = String(v).trim()
  let m = s.match(RELOGIO_SEM_FUSO)
  if (m) {
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4] + 3, +m[5], +(m[6] || 0)))
  }
  m = s.match(DATA_BR)
  if (m) {
    return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1], +(m[4] || 0) + 3, +(m[5] || 0)))
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

/** "dd/mm/aaaa hh:mm" em Brasília. */
export function fmtBrasilia(v: string | Date | null | undefined, comHora = true): string {
  const d = paraData(v)
  if (!d) return "—"
  return d.toLocaleString("pt-BR", {
    timeZone: FUSO_BRASILIA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    ...(comHora ? { hour: "2-digit", minute: "2-digit" } : {}),
  })
}

/** "hh:mm" em Brasília. */
export function fmtHoraBrasilia(v: string | Date | null | undefined): string {
  const d = paraData(v)
  if (!d) return "—"
  return d.toLocaleTimeString("pt-BR", { timeZone: FUSO_BRASILIA, hour: "2-digit", minute: "2-digit" })
}

/** Data (`AAAA-MM-DD`, sem hora) em dd/mm/aaaa, sem deslocar o dia. */
export function fmtDiaISO(v: string | null | undefined): string {
  if (!v) return "—"
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v)
}

/** Date → valor de `<input type="datetime-local">` (horário local do navegador). */
export function paraInputLocal(d: Date | null | undefined): string {
  if (!d || isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Valor de `datetime-local` → ISO (UTC); vazio → undefined. */
export function inputLocalParaISO(v: string | null | undefined): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** ISO/relógio do backend → valor de `datetime-local`. */
export function isoParaInputLocal(v: string | null | undefined): string {
  return paraInputLocal(paraData(v))
}

/** Resposta de GET /publicacao/licitacao/:id/prazos. */
export interface PrazosPublicacao {
  modalidade: string
  dias_uteis: number | null
  fundamento: string | null
  descricao: string | null
  hipoteses: Array<{ dias: number; fundamento: string; descricao: string }>
  natureza_objeto: string | null
  exige_natureza_objeto: boolean
  divulgacao: string | null
  vencimento_prazo: string | null
  data_minima_abertura: string | null
  pendencias: string[]
  feriados_no_periodo: Array<{ data: string; descricao: string }>
  contagem: string
  calendario_orgao?: boolean
}

/** Consulta o prazo mínimo (art. 55) para o cronograma informado. */
export async function consultarPrazos(
  licitacaoId: string,
  params: Record<string, string | null | undefined>,
): Promise<PrazosPublicacao> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v)
  const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/prazos?${qs.toString()}`)
  if (!res.ok) throw new Error((await lerErro(res, "Erro ao calcular os prazos")).mensagem)
  return res.json()
}

/**
 * Sugestão para o campo de abertura: o dia mínimo do backend (00:00 do
 * N-ésimo dia útil — já conta os feriados do órgão; art. 183 inclui o dia do
 * vencimento) no horário de agora + 1 h (limitado às 23:00), no formato do
 * `datetime-local`.
 */
export function sugestaoAPartirDoMinimo(dataMinima: string | null | undefined): string {
  const d = paraData(dataMinima)
  if (!d) return ""
  const HORA = 60 * 60 * 1000
  const agoraBrasilia = new Date(Date.now() - 3 * HORA)
  const minutosDoDia = agoraBrasilia.getUTCHours() * 60 + agoraBrasilia.getUTCMinutes()
  const deslocamento = Math.min(minutosDoDia * 60 * 1000 + HORA, 23 * HORA)
  return paraInputLocal(new Date(d.getTime() + deslocamento))
}

/** Versão do edital (documentos EDITAL / EDITAL_RETIFICADO). */
export interface VersaoEdital {
  id: string
  tipo: string
  versao: number
  titulo?: string | null
  nome_original?: string | null
  hash?: string | null
  status: string
  tamanho_bytes?: number | null
  data_publicacao?: string | null
  created_at?: string | null
}

export interface RetificacaoEdital {
  id: string
  numero: number
  motivo: string
  alteracoes: string
  afeta_propostas: boolean
  justificativa_nao_afeta?: string | null
  documento_id?: string | null
  versao_edital?: number | null
  data_divulgacao: string
  propostas_notificadas?: number | null
}

export interface EditalDaLicitacao {
  vigente: {
    documento_id: string
    origem: string
    tipo: string
    versao: number
    hash: string | null
    nome: string | null
    status: string
  } | null
  versoes: VersaoEdital[]
  retificacoes: RetificacaoEdital[]
}

/** Abre o PDF de uma versão do edital (autenticado, via blob) em nova aba. */
export async function abrirArquivoEdital(licitacaoId: string, documentoId: string): Promise<void> {
  // Abre a aba já no clique (evita bloqueio de pop-up) e carrega o blob depois
  const aba = typeof window !== "undefined" ? window.open("", "_blank") : null
  const res = await authFetch(`${API_URL}/api/publicacao/licitacao/${licitacaoId}/edital/${documentoId}/arquivo`)
  if (!res.ok) {
    aba?.close()
    throw new Error((await lerErro(res, "Não foi possível abrir o edital")).mensagem)
  }
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  if (aba) aba.location.href = url
  else window.open(url, "_blank")
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** Intenção de revogar/anular (art. 71 §3º). */
export interface IntencaoExtincao {
  id: string
  tipo: "REVOGAR" | "ANULAR"
  status: "ABERTA" | "CONCLUIDA" | "CANCELADA"
  motivo: string
  prazo_dias_uteis: number
  aberta_em: string
  prazo_fim: string
  prazo_aberto: boolean
  pode_praticar_ato: boolean
  licitantes_notificados?: number | null
  concluida_em?: string | null
  motivo_cancelamento?: string | null
  manifestacoes?: Array<{ id?: string; fornecedor_nome?: string | null; texto: string; created_at: string; updated_at?: string }>
  total_manifestacoes?: number
}
