/**
 * MAPA DO FLUXO (aprovado em 12/10/2026, no estilo da imagem dos autos):
 * etapas numeradas em zigue-zague — a 1ª linha da esquerda para a direita,
 * a 2ª da direita para a esquerda, e assim por diante — com a cor do grupo
 * da etapa. Regras puras (sem React): testadas em mapa.test.mjs.
 */

export type GrupoMapa = "INSTRUCAO" | "DECISAO" | "PUBLICIDADE"
export type SetaMapa = "DIREITA" | "ESQUERDA" | "BAIXO" | "FIM"

const DECISAO = new Set(["AUTORIZACAO", "APROVACAO", "DECISAO"])
const PUBLICIDADE = new Set(["PARECER_JURIDICO", "CONTROLE_INTERNO", "PUBLICACAO"])
/** Etapas genéricas: hoje fazem o papel de uma etapa própria que ainda não existe no catálogo. */
const GENERICAS = new Set(["DOCUMENTO", "TAREFA", "APROVACAO", "FORMULARIO"])

export function grupoDaEtapa(tipo: string | null | undefined): GrupoMapa {
  const t = String(tipo ?? "").toUpperCase()
  if (DECISAO.has(t)) return "DECISAO"
  if (PUBLICIDADE.has(t)) return "PUBLICIDADE"
  return "INSTRUCAO"
}

export function etapaGenerica(tipo: string | null | undefined): boolean {
  return GENERICAS.has(String(tipo ?? "").toUpperCase())
}

/** Onde a etapa `i` (0-based) fica no mapa de `colunas` por linha, e para onde sai a seta dela. */
export function posicaoNoMapa(i: number, total: number, colunas = 4): { coluna: number; linha: number; seta: SetaMapa } {
  const linha = Math.floor(i / colunas)
  const pos = i % colunas
  const ida = linha % 2 === 0
  const coluna = ida ? pos + 1 : colunas - pos
  const fimDaLinha = pos === colunas - 1
  const seta: SetaMapa = i >= total - 1 ? "FIM" : fimDaLinha ? "BAIXO" : ida ? "DIREITA" : "ESQUERDA"
  return { coluna, linha: linha + 1, seta }
}
