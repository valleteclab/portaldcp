/**
 * TELAS POR ETAPA DA FASE INTERNA (Entregas 3A e 3B) — rotas e utilidades comuns.
 * Cada etapa tem UMA tela, dentro do processo:
 *   /orgao/processos/[id]/fase-interna/{dfd,etp,tr,pesquisa,reserva,
 *     autorizacao,minutas,parecer,controle-interno,conformidade}
 * e abre pelo quadro "Fluxo da fase interna" ou pela tarefa da caixa.
 */

import { textoDaTrava } from "./travas"

export type TelaEtapa = "dfd" | "etp" | "tr" | "pesquisa" | "reserva" | "autorizacao" | "minutas" | "parecer" | "controle-interno" | "conformidade"

export interface EtapaDaBarra {
  /** Número da etapa da SPEC; a etapa 7 tem passos (7a, 7b, 7c) — nunca dois números iguais na barra. */
  numero: string
  titulo: string
  passo: string
  tela: TelaEtapa | null
  /** Tipos de peça da etapa (códigos do sistema). */
  tipos: string[]
  /** Só aparece quando o órgão ativou (controle interno). */
  opcional?: boolean
}

/**
 * As 8 etapas da SPEC, na ordem sugerida (a ordem não trava: valem as
 * dependências). A etapa 7 tem dois responsáveis (minutas do agente, parecer
 * da Procuradoria) e o controle interno opcional: 7a, 7b e 7c (homologação
 * 26/09/2026 — a barra mostrava três "7").
 */
export const ETAPAS_DA_BARRA: EtapaDaBarra[] = [
  { numero: "1", titulo: "Demanda", passo: "DFD", tela: "dfd", tipos: ["DFD"] },
  { numero: "2", titulo: "ETP", passo: "ETP", tela: "etp", tipos: ["ETP", "AR"] },
  { numero: "3", titulo: "TR", passo: "TR", tela: "tr", tipos: ["TR", "PB", "PE"] },
  { numero: "4", titulo: "Pesquisa", passo: "PESQUISA", tela: "pesquisa", tipos: ["PP", "MCP"] },
  { numero: "5", titulo: "Reserva", passo: "RESERVA", tela: "reserva", tipos: ["DO"] },
  { numero: "6", titulo: "Autorização", passo: "AUTORIZACAO", tela: "autorizacao", tipos: ["AA", "DP"] },
  { numero: "7a", titulo: "Minutas", passo: "MINUTAS", tela: "minutas", tipos: ["RAG", "ME", "MC"] },
  { numero: "7b", titulo: "Parecer", passo: "PARECER", tela: "parecer", tipos: ["PJ"] },
  { numero: "7c", titulo: "Controle interno", passo: "CONTROLE_INTERNO", tela: "controle-interno", tipos: ["MCI"], opcional: true },
  { numero: "8", titulo: "Conformidade e publicação", passo: "PUBLICACAO", tela: "conformidade", tipos: [] },
]

/**
 * ESTADO SEMPRE ATUAL (homologação E9: a reserva ficava "Pendente" até
 * recarregar; a barra de etapas mostrava ✔ numa tela e não em outra). Toda
 * ação que muda o estado da fase interna avisa por este evento; a barra de
 * etapas, o quadro da peça, o fluxo e a tela do processo recarregam. Também
 * recarregam ao voltar para a aba/janela.
 */
export const EVENTO_FASE_INTERNA = "fase-interna:atualizada"

export function avisarFaseInternaAtualizada(licitacaoId: string) {
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(EVENTO_FASE_INTERNA, { detail: { licitacaoId } }))
}

/** Assina o aviso de mudança (do processo) e a volta à aba; devolve a função que cancela. */
export function aoAtualizarFaseInterna(licitacaoId: string, recarregar: () => void): () => void {
  if (typeof window === "undefined") return () => undefined
  const noEvento = (e: Event) => {
    const id = (e as CustomEvent<{ licitacaoId?: string }>).detail?.licitacaoId
    if (!id || id === licitacaoId) recarregar()
  }
  const naVolta = () => {
    if (document.visibilityState === "visible") recarregar()
  }
  window.addEventListener(EVENTO_FASE_INTERNA, noEvento)
  window.addEventListener("focus", naVolta)
  document.addEventListener("visibilitychange", naVolta)
  return () => {
    window.removeEventListener(EVENTO_FASE_INTERNA, noEvento)
    window.removeEventListener("focus", naVolta)
    document.removeEventListener("visibilitychange", naVolta)
  }
}

/**
 * Carga "a última vence": respostas que chegam fora de ordem (uma leitura
 * lenta iniciada ANTES da ação) não sobrescrevem o estado novo.
 */
export function criarUltimaCarga() {
  let seq = 0
  return () => {
    const minha = ++seq
    return () => minha === seq
  }
}

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
    case "AA":
    case "DP":
      return "autorizacao"
    case "RAG":
    case "ME":
    case "MC":
      return "minutas"
    case "PJ":
    case "PJE":
      return "parecer"
    case "MCI":
      return "controle-interno"
    default:
      return null
  }
}

/** Tela da etapa de um passo da Entrega 2 (DFD … RESERVA, AUTORIZACAO, MINUTAS, PARECER, CONTROLE_INTERNO). */
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

/** Mensagem de erro da API (inclui a lista `pendencias`, quando houver). "Portão X" vira "Trava da lei — …". */
export async function erroDaApi(res: Response): Promise<string> {
  const j = await res.json().catch(() => null)
  if (Array.isArray(j?.pendencias) && j.pendencias.length) return textoDaTrava(j.pendencias.join(" "))
  return textoDaTrava((Array.isArray(j?.message) ? j.message.join(" ") : j?.message) || `HTTP ${res.status}`)
}

/** Texto puro de um HTML (contagem de preenchimento). */
export const textoPuro = (html?: string | null) => String(html || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim()

/**
 * VERSÃO VIGENTE × BASE EDITÁVEL da peça (homologação E5: as seções do TR v1
 * sumiam depois de anexar a v2). `lista` = GET /documentos/:tipo (versões,
 * mais nova primeiro). A vigente é a versão atual; a base do editor é ela
 * mesma quando feita no sistema, ou — com a vigente ANEXADA — a última versão
 * feita no sistema com conteúdo (continua como base para gerar de novo; não
 * conta como peça pronta).
 */
export function vigenteEBaseDoEditor(lista: any[] | null | undefined): { vigente: any | null; base: any | null; baseAnterior: boolean } {
  const versoes = Array.isArray(lista) ? lista : []
  const vigente = versoes.find((x) => x?.versao_atual) ?? versoes[0] ?? null
  if (!vigente) return { vigente: null, base: null, baseAnterior: false }
  if (vigente.origem === "INTERNO") return { vigente, base: vigente, baseAnterior: false }
  const temConteudo = (d: any) =>
    !!d &&
    typeof d === "object" &&
    Object.entries(d).some(([k, v]) => !k.startsWith("_") && k !== "nao_se_aplica" && k !== "justificativa_nao_se_aplica" && typeof v === "string" && v.replace(/<[^>]+>/g, "").trim().length > 0)
  const base = [...versoes]
    .sort((a, b) => (b.versao ?? 0) - (a.versao ?? 0))
    .find((x) => x.origem === "INTERNO" && !x.dados_estruturados?.nao_se_aplica && temConteudo(x.dados_estruturados))
  return base ? { vigente, base, baseAnterior: true } : { vigente, base: vigente, baseAnterior: false }
}
