/**
 * PAINEL PARA TV — tipos do JSON (`GET /api/painel-tv/:token`) e a paginação
 * da tela (funções puras). O servidor já entrega tudo calculado; aqui só se
 * decide o que cabe em cada página da rotação.
 */

export type CorPrazo = "VERDE" | "AMARELO" | "VERMELHO"

export interface CartaoProcessoTv {
  chave: string
  numero: string
  objeto: string
  modalidade: string
  etapa: string
  com_quem: { nome: string; tipo: "PESSOA" | "SETOR" | "AGENTE" } | null
  dias_na_etapa: number | null
  prazo: string | null
  cor_prazo: CorPrazo | null
  atrasado: boolean
  bloqueios: number
  suspenso: boolean
  evento: { tipo: "SESSAO" | "FIM_PROPOSTAS"; data: string } | null
}

export interface CartaoContratoTv {
  chave: string
  numero: string
  contratado: string
  objeto: string
  fim_vigencia: string
  dias_restantes: number
  faixa: "VERMELHO" | "AMARELO" | "NEUTRO"
  responsavel: { papel: "Gestor" | "Fiscal"; nome: string } | null
  prorrogacao: "CONTINUO_ART107" | "NAO_PRORROGAVEL" | null
  prorrogacao_rotulo: string | null
  aditivo_prazo_em_andamento: boolean
  valor: number | null
}

export interface ColunaTv {
  chave: string
  titulo: string
  total: number
  processos: CartaoProcessoTv[]
}

export interface PainelTvDados {
  orgao: { nome: string; logo_url: string | null }
  gerado_em: string
  fuso: string
  janela_contratos_dias: number
  numeros: {
    em_andamento: number
    atrasados: number
    publicados_7_dias: number
    eventos_hoje: number
    eventos_7_dias: number
    contratos_30: number
    contratos_60: number
    contratos_90: number
  }
  colunas: ColunaTv[]
  contratos: CartaoContratoTv[]
  rodape: {
    proximos_eventos: Array<{ numero: string; modalidade: string; objeto: string; tipo: "SESSAO" | "FIM_PROPOSTAS"; data: string }>
    publicacoes_24h: Array<{ numero: string; modalidade: string; objeto: string; data: string }>
    contratos_7_dias: Array<{ numero: string; contratado: string; fim_vigencia: string; dias_restantes: number }>
  }
}

export interface SegmentoColuna {
  chave: string
  titulo: string
  total: number
  parte: number
  partes: number
  processos: CartaoProcessoTv[]
}

export type PaginaTv =
  | { tipo: "QUADRO"; segmentos: SegmentoColuna[] }
  | { tipo: "CONTRATOS"; contratos: CartaoContratoTv[]; parte: number; partes: number }

function fatiar<T>(lista: T[], tamanho: number): T[][] {
  const n = Math.max(1, Math.floor(tamanho))
  const saida: T[][] = []
  for (let i = 0; i < lista.length; i += n) saida.push(lista.slice(i, i + n))
  return saida
}

/**
 * Páginas da rotação: o quadro de processos (só as colunas com processo; cada
 * coluna "rola por página" em fatias de `cartoesPorColuna`; `colunasPorPagina`
 * fatias lado a lado) e as páginas dos contratos vencendo.
 */
export function paginarPainel(
  dados: Pick<PainelTvDados, "colunas" | "contratos">,
  opcoes: { cartoesPorColuna?: number; colunasPorPagina?: number; contratosPorPagina?: number } = {},
): PaginaTv[] {
  const k = opcoes.cartoesPorColuna ?? 4
  const porPagina = opcoes.colunasPorPagina ?? 4
  const segmentos: SegmentoColuna[] = dados.colunas
    .filter((c) => c.processos.length > 0)
    .flatMap((c) => {
      const fatias = fatiar(c.processos, k)
      return fatias.map((processos, i) => ({ chave: c.chave, titulo: c.titulo, total: c.total, parte: i + 1, partes: fatias.length, processos }))
    })
  const paginas: PaginaTv[] = segmentos.length
    ? fatiar(segmentos, porPagina).map((segs) => ({ tipo: "QUADRO" as const, segmentos: segs }))
    : [{ tipo: "QUADRO", segmentos: [] }]
  const fatiasContratos = fatiar(dados.contratos, opcoes.contratosPorPagina ?? 9)
  if (fatiasContratos.length) {
    fatiasContratos.forEach((contratos, i) => paginas.push({ tipo: "CONTRATOS", contratos, parte: i + 1, partes: fatiasContratos.length }))
  } else {
    paginas.push({ tipo: "CONTRATOS", contratos: [], parte: 1, partes: 1 })
  }
  return paginas
}

// Formatadores criados UMA vez (a TV fica ligada por dias)
const FUSO = "America/Bahia"
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" })
const fmtDiaHora = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
const fmtDataLonga = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, weekday: "long", day: "2-digit", month: "long", year: "numeric" })
const fmtHoraNum = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", hourCycle: "h23" })

export const horaTv = (d: Date | string) => fmtHora.format(new Date(d))
export const diaHoraTv = (d: Date | string) => fmtDiaHora.format(new Date(d)).replace(",", "")
export const dataLongaTv = (d: Date) => fmtDataLonga.format(d).replace(/^./, (c) => c.toUpperCase())
export const horaDoDiaTv = (d: Date) => Number(fmtHoraNum.format(d))

/** Data pura (YYYY-MM-DD) → DD/MM/AAAA sem passar por Date (evita o "-1 dia"). */
export function dataPuraTv(iso: string): string {
  const [a, m, d] = String(iso).slice(0, 10).split("-")
  return a && m && d ? `${d}/${m}/${a}` : iso
}

export const moedaTv = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
