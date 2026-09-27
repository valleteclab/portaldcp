import { UNIDADES, type ItemLicitacao } from "@/components/cadastro-licitacao/types"

/**
 * CRIAÇÃO DO PROCESSO — o que o assistente guiado e a entrada "fase interna
 * feita fora do sistema" compartilham (docs/licitacao/PLANO-FASE-INTERNA.md).
 */

// ─── Como a fase interna foi feita (pergunta inicial) ─────────────────
export type ModoFaseInterna = "GUIADO" | "FORA"

const CHAVE_MODO = "portaldcp.fase-interna.modo-criacao"

/** Última escolha do usuário neste navegador — só SUGESTÃO (a pergunta sempre aparece). */
export function ultimaEscolhaModo(): ModoFaseInterna | null {
  if (typeof window === "undefined") return null
  try {
    const v = window.localStorage.getItem(CHAVE_MODO)
    return v === "GUIADO" || v === "FORA" ? v : null
  } catch {
    return null
  }
}

export function lembrarEscolhaModo(modo: ModoFaseInterna) {
  try {
    window.localStorage.setItem(CHAVE_MODO, modo)
  } catch {
    /* sem armazenamento: só não lembra */
  }
}

/** Rota do fluxo curto "fase interna feita fora" (modalidade e origem — DFD consolidado ou demanda — opcionais). */
export function rotaFaseInternaFeitaFora(opts: { modalidade?: string | null; demandaId?: string | null; dfdId?: string | null } = {}) {
  const q = new URLSearchParams()
  if (opts.modalidade) q.set("modalidade", opts.modalidade)
  if (opts.dfdId) q.set("dfd_id", opts.dfdId)
  else if (opts.demandaId) q.set("demanda_id", opts.demandaId)
  const s = q.toString()
  return `/orgao/fase-interna/processos/novo/externa${s ? `?${s}` : ""}`
}

// ─── Itens ───────────────────────────────────────────────────────────
/** Unidade do item no enum do backend (catálogo/CSV/demanda podem trazer "UN", "KG"...). */
export function normalizarUnidade(u?: string): string {
  const v = String(u || "").trim().toUpperCase()
  if (UNIDADES.some((x) => x.value === v)) return v
  const mapa: Record<string, string> = {
    UN: "UNIDADE", UND: "UNIDADE", UNID: "UNIDADE", PC: "PECA", PCT: "PACOTE", CX: "CAIXA",
    KG: "QUILOGRAMA", T: "TONELADA", L: "LITRO", LT: "LITRO", M: "METRO", M2: "METRO_QUADRADO",
    M3: "METRO_CUBICO", H: "HORA", DIA: "DIARIA", RESMA: "PACOTE", SV: "SERVICO",
    MESES: "MES", "MÊS": "MES", ANOS: "ANO",
  }
  return mapa[v] || "UNIDADE"
}

/** Item pronto para gravar (tem descrição e quantidade). */
export const itemPreenchido = (i: ItemLicitacao) => (i.descricao || "").trim().length > 0 && Number(i.quantidade) > 0

export const valorDosItens = (itens: ItemLicitacao[]) =>
  itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.valor_unitario) || 0), 0)

// ─── Critério × modalidade (códigos do backend) ───────────────────────
/** Critérios de julgamento admitidos por modalidade (o backend confere na criação). */
export const CRITERIOS_POR_MODALIDADE: Record<string, string[]> = {
  PREGAO_ELETRONICO: ["MENOR_PRECO", "MAIOR_DESCONTO"],
  CONCORRENCIA: ["MENOR_PRECO", "MAIOR_DESCONTO", "MELHOR_TECNICA", "TECNICA_E_PRECO", "MAIOR_RETORNO_ECONOMICO"],
  CONCURSO: ["MELHOR_TECNICA"],
  LEILAO: ["MAIOR_LANCE"],
  DIALOGO_COMPETITIVO: ["MENOR_PRECO", "MAIOR_DESCONTO", "MELHOR_TECNICA", "TECNICA_E_PRECO"],
}

export const MODALIDADES_CONTRATACAO_DIRETA = ["DISPENSA_ELETRONICA", "INEXIGIBILIDADE"]

// ─── Gancho da Entrega 7 (IA lendo os PDFs) ──────────────────────────
/**
 * Sugestão de qual peça é o PDF (DFD, ETP, parecer...). A leitura por IA é a
 * ENTREGA 7 (segunda etapa, decisão 4 do dono) — por enquanto não sugere nada
 * e o usuário escolhe. Quando existir, a tela já mostra "sugerido" ao lado do
 * select e o usuário confirma.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function sugerirPecaDoArquivo(arquivo: File): Promise<string | null> {
  return null
}
