/**
 * CONSTRUTOR DE FLUXO — a resposta da API (GET /api/fluxo-fase-interna/construtor/:tipo)
 * e as regras PURAS da tela: o que está em edição (rascunho × versão ativa), o
 * corpo do "Salvar rascunho" e os textos de situação. Sem imports em tempo de
 * execução (testado com `node --test`, ver tela-construtor.test.mjs).
 */
import type { Conferencia, EtapaDoCatalogo, GrafoFluxo } from "./grafo-editor"

export type TipoProcesso = "DISPENSA" | "INEXIGIBILIDADE" | "LICITACAO"

export const TIPOS_PROCESSO: Array<{ tipo: TipoProcesso; rotulo: string }> = [
  { tipo: "DISPENSA", rotulo: "Dispensa" },
  { tipo: "INEXIGIBILIDADE", rotulo: "Inexigibilidade" },
  { tipo: "LICITACAO", rotulo: "Licitação" },
]

export interface AprovacaoDemandaModelo {
  exigida: boolean
  etapa?: string
  aprovador: { tipo: "PERMISSAO" | "PAPEL" | "SETOR" | "USUARIO"; valor: string | null }
  aceita_peca_externa: boolean
}

export interface RequisitoLegal {
  codigo: string
  tipo: "ETAPA_OBRIGATORIA" | "DEPENDENCIA" | "SEGREGACAO"
  etapa: string
  outra_etapa: string | null
  permite_dispensa_por_ato: boolean
  fundamento: string
  mensagem: string
}

export interface CampoCondicaoApi {
  campo: string
  rotulo: string
  operadores: readonly string[]
  valor: "numero" | "opcao" | "texto" | null
  opcoes?: readonly string[]
}

export interface ModeloProntoApi {
  codigo: string
  nome: string
  descricao: string | null
  tipos: string[]
}

export interface TelaConstrutor {
  tipo: TipoProcesso
  rotulo_tipo: string
  sistema: boolean
  proprio: boolean
  ativo: {
    versao: number
    nome: string
    descricao: string | null
    aprovacao_demanda: AprovacaoDemandaModelo
    exigir_posse_pecas: boolean
    grafo: GrafoFluxo
    ativado_em: string | null
    ativado_por_nome: string | null
  }
  rascunho: {
    nome: string
    descricao: string | null
    aprovacao_demanda: AprovacaoDemandaModelo
    exigir_posse_pecas: boolean
    grafo: GrafoFluxo
    base_versao: number | null
    desatualizado: boolean
    origem: string | null
    atualizado_em: string | null
    atualizado_por_nome: string | null
  } | null
  conferencia: Conferencia
  catalogo: { etapas: EtapaDoCatalogo[]; campos_condicao: CampoCondicaoApi[] }
  requisitos: RequisitoLegal[]
  papeis: Array<{ codigo: string; rotulo: string }>
  setores: Array<{ id: string; nome: string }>
  usuarios: Array<{ id: string; nome: string }>
  modelos_prontos: ModeloProntoApi[]
  processos_em_andamento: number
  ia_disponivel: boolean
  ajustes?: Array<{ no: string | null; mensagem: string }>
  ativado?: { versao: number }
  ia?: { modelo: string; ajustes: Array<{ no: string | null; mensagem: string }>; grafo: GrafoFluxo; conferencia: Conferencia; salvo_no_rascunho: boolean }
}

export interface VersaoFluxo {
  versao: number
  nome: string
  origem: string
  ativado_por_nome: string | null
  ativado_em: string | null
  ativa: boolean
}

/** O que a tela edita: o rascunho, ou (sem rascunho) a versão ativa. */
export interface ModeloEmEdicao {
  nome: string
  grafo: GrafoFluxo
  aprovacao_demanda: AprovacaoDemandaModelo
  exigir_posse_pecas: boolean
}

export function modeloEmEdicao(t: Pick<TelaConstrutor, "ativo" | "rascunho">): ModeloEmEdicao {
  const r = t.rascunho
  const base = r ?? t.ativo
  return {
    nome: base.nome,
    grafo: { formato: 1, nos: base.grafo?.nos ?? [], arestas: base.grafo?.arestas ?? [] },
    aprovacao_demanda: base.aprovacao_demanda,
    exigir_posse_pecas: base.exigir_posse_pecas !== false,
  }
}

/** Corpo do PUT …/rascunho (só o que a tela edita). */
export function corpoDoRascunho(m: ModeloEmEdicao) {
  return {
    nome: m.nome,
    grafo: { formato: 1, nos: m.grafo.nos, arestas: m.grafo.arestas.map(({ id, de, para, rotulo }) => ({ id, de, para, rotulo })) },
    aprovacao_demanda: { exigida: m.aprovacao_demanda.exigida, aceita_peca_externa: m.aprovacao_demanda.aceita_peca_externa, aprovador: m.aprovacao_demanda.aprovador },
    exigir_posse_pecas: m.exigir_posse_pecas,
  }
}

/** Assinatura para saber se há o que salvar (inclui a posição das caixas). */
export const assinatura = (m: ModeloEmEdicao): string => JSON.stringify(corpoDoRascunho(m))

/**
 * Assinatura do que a CONFERÊNCIA olha (sem a posição das caixas): arrastar
 * uma caixa não pede conferência nova.
 */
export function assinaturaDaConferencia(m: ModeloEmEdicao): string {
  const c = corpoDoRascunho(m)
  const semPosicao = c.grafo.nos.map((n) => {
    const r: Record<string, unknown> = { ...n }
    delete r.x
    delete r.y
    return r
  })
  return JSON.stringify({ ...c, grafo: { ...c.grafo, nos: semPosicao } })
}

const hora = (d: Date | string) => new Date(d).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })

/**
 * RASCUNHO × VERSÃO ATIVA, em uma frase (topo da tela):
 * "Você está editando o rascunho; a versão ativa é a 3." ou
 * "Você está vendo a versão ativa 3. Mudou algo? Vira rascunho — os processos só mudam quando você ativar."
 */
export function situacaoDaEdicao(
  t: Pick<TelaConstrutor, "ativo" | "rascunho">,
  s: { temRascunho: boolean; salvoEm: Date | string | null; salvando: boolean; alterado: boolean; erroAoSalvar: string | null },
): { titulo: string; detalhe: string } {
  const v = t.ativo.versao
  if (!s.temRascunho && !s.alterado) {
    return { titulo: `Você está vendo a versão ativa ${v}.`, detalhe: "Qualquer mudança vira um rascunho. Os processos só mudam quando você ativar." }
  }
  const titulo = `Você está editando o rascunho; a versão ativa é a ${v}.`
  if (s.erroAoSalvar) return { titulo, detalhe: `Não foi salvo: ${s.erroAoSalvar}` }
  if (s.salvando) return { titulo, detalhe: "Salvando o rascunho…" }
  if (s.alterado) return { titulo, detalhe: "Alterações ainda não salvas (salva sozinho em instantes)." }
  if (s.salvoEm) return { titulo, detalhe: `Rascunho salvo às ${hora(s.salvoEm)}.` }
  return { titulo, detalhe: "Rascunho salvo." }
}

export const mensagemAtivado = (versao: number): string =>
  `Versão ${versao} ativa — processos novos seguem este fluxo; os em andamento continuam no fluxo em que começaram.`

/** Etapas que a lei exige (selo "lei" na caixa). */
export const exigidasPelaLei = (requisitos: RequisitoLegal[]): Set<string> =>
  new Set(requisitos.filter((r) => r.tipo === "ETAPA_OBRIGATORIA").map((r) => r.etapa))

/** Etapas cujo parecer a lei deixa dispensar por ato (art. 53, §5º). */
export const dispensaveisPorAto = (requisitos: RequisitoLegal[]): Set<string> =>
  new Set(requisitos.filter((r) => r.tipo === "ETAPA_OBRIGATORIA" && r.permite_dispensa_por_ato).map((r) => r.etapa))

const ORIGENS: Record<string, string> = {
  CONSTRUTOR: "desenho",
  TELA_ANTIGA: "tela antiga",
  RESTAURAR: "modelo padrão",
  CONFIGURACAO: "configuração da fase interna",
  MIGRACAO: "conversão automática",
}

export const rotuloDaOrigem = (o: string | null | undefined): string => (o ? ORIGENS[o] ?? o.toLowerCase() : "—")

/** Mensagem de erro da API do construtor, com a lista de erros da conferência (400 do "Ativar"). */
export function erroDoCorpo(j: unknown, status: number): { texto: string; erros: Conferencia["erros"]; avisos: Conferencia["avisos"]; lei: Conferencia["lei"] } {
  const o = (j && typeof j === "object" ? j : {}) as Record<string, unknown>
  const msg = Array.isArray(o.message) ? o.message.join(" ") : typeof o.message === "string" ? o.message : `HTTP ${status}`
  const lista = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : [])
  return { texto: msg, erros: lista(o.erros), avisos: lista(o.avisos), lei: lista(o.lei) }
}
