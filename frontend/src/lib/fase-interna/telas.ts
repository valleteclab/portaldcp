/**
 * TELAS POR ETAPA DA FASE INTERNA (Entrega 3A) — rotas e utilidades comuns.
 * Cada etapa tem UMA tela, dentro do processo:
 *   /orgao/processos/[id]/fase-interna/{dfd,etp,tr,pesquisa,reserva}
 * e abre pelo quadro "Fluxo da fase interna" ou pela tarefa da caixa.
 */

export type TelaEtapa = "dfd" | "etp" | "tr" | "pesquisa" | "reserva"

export interface EtapaDaBarra {
  numero: number
  titulo: string
  passo: string
  tela: TelaEtapa | null
  /** Tipos de peça da etapa (códigos do sistema). */
  tipos: string[]
}

/** As 8 etapas da SPEC, na ordem sugerida (a ordem não trava: valem as dependências). */
export const ETAPAS_DA_BARRA: EtapaDaBarra[] = [
  { numero: 1, titulo: "Demanda", passo: "DFD", tela: "dfd", tipos: ["DFD"] },
  { numero: 2, titulo: "ETP", passo: "ETP", tela: "etp", tipos: ["ETP", "AR"] },
  { numero: 3, titulo: "TR", passo: "TR", tela: "tr", tipos: ["TR", "PB", "PE"] },
  { numero: 4, titulo: "Pesquisa", passo: "PESQUISA", tela: "pesquisa", tipos: ["PP", "MCP"] },
  { numero: 5, titulo: "Reserva", passo: "RESERVA", tela: "reserva", tipos: ["DO"] },
  { numero: 6, titulo: "Autorização", passo: "AUTORIZACAO", tela: null, tipos: ["AA", "DP"] },
  { numero: 7, titulo: "Parecer", passo: "PARECER", tela: null, tipos: ["PJ", "RAG", "ME", "MC"] },
  { numero: 8, titulo: "Publicação", passo: "PUBLICACAO", tela: null, tipos: [] },
]

export const rotaDaTela = (licitacaoId: string, tela: TelaEtapa) => `/orgao/processos/${licitacaoId}/fase-interna/${tela}`

/** Tela da etapa de um tipo de peça (null = não tem tela própria; usa o quadro do processo/editor). */
export function telaDoTipo(tipo: string | null | undefined): TelaEtapa | null {
  switch (String(tipo || "").toUpperCase()) {
    case "DFD":
      return "dfd"
    case "ETP":
    case "AR":
      return "etp"
    case "TR":
    case "PB":
    case "PE":
      return "tr"
    case "PP":
    case "MCP":
      return "pesquisa"
    case "DO":
      return "reserva"
    default:
      return null
  }
}

/** Tela da etapa de um passo da Entrega 2 (DFD, ETP, TR, PESQUISA, RESERVA). */
export function telaDoPasso(passo: string | null | undefined): TelaEtapa | null {
  return ETAPAS_DA_BARRA.find((e) => e.passo === passo)?.tela ?? null
}

/** Onde "Fazer aqui" leva: a tela da etapa ou, nas demais peças, o editor de seções. */
export function rotaFazerAqui(licitacaoId: string, tipo: string): string {
  const tela = telaDoTipo(tipo)
  return tela ? rotaDaTela(licitacaoId, tela) : `/orgao/fase-interna/processos/${licitacaoId}/editor?tipo=${tipo}`
}

export const fmtMoeda = (v: number | string | null | undefined) =>
  v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export const fmtDia = (d?: string | null) => {
  if (!d) return "—"
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return `${m[3]}/${m[2]}/${m[1]}`
  return new Date(d).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
}

/** Hoje em Brasília (AAAA-MM-DD). */
export const hojeBrasilia = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)

/** Mensagem de erro da API (inclui a lista `pendencias`, quando houver). */
export async function erroDaApi(res: Response): Promise<string> {
  const j = await res.json().catch(() => null)
  if (Array.isArray(j?.pendencias) && j.pendencias.length) return j.pendencias.join(" ")
  return (Array.isArray(j?.message) ? j.message.join(" ") : j?.message) || `HTTP ${res.status}`
}

/** Texto puro de um HTML (contagem de preenchimento). */
export const textoPuro = (html?: string | null) => String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()
