import { TipoAquisicaoBem } from './entities/enums';

/** Campos do bem usados no cálculo (subconjunto de BemPatrimonial). */
export interface BemParaDepreciacao {
  valor_aquisicao?: number | string | null;
  data_aquisicao?: Date | string | null;
  vida_util_anos?: number | null;
  valor_residual_pct?: number | string | null;
  conta_contabil?: string | null;
}

/** Campos da categoria usados no cálculo (subconjunto de CategoriaBem). */
export interface CategoriaParaDepreciacao {
  vida_util_anos?: number | null;
  valor_residual_pct?: number | string | null;
  conta_contabil?: string | null;
}

export interface DepreciacaoBem {
  vida_util_anos: number;
  valor_residual_pct: number;
  conta_contabil: string | null;
  /** Taxa anual = 100 / vida útil (não é campo: sempre calculada). */
  taxa_anual_pct: number;
  meses_depreciados: number;
  depreciacao_mensal: number;
  depreciacao_acumulada: number;
  valor_atual: number;
  totalmente_depreciado: boolean;
  /** De onde vieram vida útil/residual: do próprio bem ou da categoria. */
  origem_parametros: 'BEM' | 'CATEGORIA';
}

/** Parâmetros efetivos: os do bem prevalecem; se nulos, valem os da categoria. */
export function parametrosEfetivos(bem: BemParaDepreciacao, categoria?: CategoriaParaDepreciacao | null) {
  const vidaBem = bem.vida_util_anos != null ? Number(bem.vida_util_anos) : null;
  const vida = vidaBem || (categoria?.vida_util_anos ? Number(categoria.vida_util_anos) : null);
  const residualBruto = bem.valor_residual_pct ?? categoria?.valor_residual_pct ?? 10;
  const residual = Number.isFinite(Number(residualBruto)) ? Number(residualBruto) : 10;
  const conta = bem.conta_contabil || categoria?.conta_contabil || null;
  const origem: 'BEM' | 'CATEGORIA' = vidaBem || bem.valor_residual_pct != null ? 'BEM' : 'CATEGORIA';
  return { vida_util_anos: vida, valor_residual_pct: residual, conta_contabil: conta, origem_parametros: origem };
}

/** O que falta para o bem entrar na depreciação (lista "sem parâmetros"). */
export function faltasDepreciacao(bem: BemParaDepreciacao, categoria?: CategoriaParaDepreciacao | null): string[] {
  const p = parametrosEfetivos(bem, categoria);
  return [
    (bem.valor_aquisicao == null || bem.valor_aquisicao === '') && 'valor',
    !bem.data_aquisicao && 'data de aquisição',
    !p.vida_util_anos && 'vida útil (do bem ou da categoria)',
  ].filter(Boolean) as string[];
}

const dataLocal = (d: Date | string): Date => {
  const iso = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return new Date(iso + 'T12:00:00');
};

/**
 * Depreciação linear por mês (NBC TSP 07): meses contados a partir do mês
 * seguinte ao da aquisição; depreciável = valor × (1 − residual%);
 * acumulada limitada ao depreciável. Retorna null quando faltar valor,
 * data de aquisição ou vida útil (do bem ou da categoria).
 */
export function calcularDepreciacao(
  bem: BemParaDepreciacao,
  categoria?: CategoriaParaDepreciacao | null,
  dataRef: Date = new Date(),
): DepreciacaoBem | null {
  const valor = bem.valor_aquisicao != null && bem.valor_aquisicao !== '' ? Number(bem.valor_aquisicao) : null;
  const p = parametrosEfetivos(bem, categoria);
  if (valor == null || !Number.isFinite(valor) || !bem.data_aquisicao || !p.vida_util_anos) return null;

  const vida = p.vida_util_anos;
  const residualPct = p.valor_residual_pct;
  const depreciavel = valor * (1 - residualPct / 100);
  const mensal = depreciavel / (vida * 12);
  const aq = dataLocal(bem.data_aquisicao);
  const mesesBrutos = (dataRef.getFullYear() - aq.getFullYear()) * 12 + (dataRef.getMonth() - aq.getMonth());
  const meses = Math.min(Math.max(0, mesesBrutos), vida * 12); // mês da aquisição não deprecia
  const acumulada = Math.min(depreciavel, mensal * meses);
  const atual = valor - acumulada;

  return {
    vida_util_anos: vida,
    valor_residual_pct: +residualPct.toFixed(2),
    conta_contabil: p.conta_contabil,
    taxa_anual_pct: +(100 / vida).toFixed(2),
    meses_depreciados: meses,
    depreciacao_mensal: +mensal.toFixed(2),
    depreciacao_acumulada: +acumulada.toFixed(2),
    valor_atual: +atual.toFixed(2),
    totalmente_depreciado: acumulada >= depreciavel - 0.005,
    origem_parametros: p.origem_parametros,
  };
}

/** Texto livre da planilha/legado → TipoAquisicaoBem (vazio → undefined; desconhecido → OUTRO). */
export function parseTipoAquisicao(v: any): TipoAquisicaoBem | undefined {
  const s = String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
  if (!s) return undefined;
  if (s.startsWith('compra') || s.startsWith('aquis')) return TipoAquisicaoBem.COMPRA;
  if (s.startsWith('doac')) return TipoAquisicaoBem.DOACAO;
  if (s.startsWith('cess')) return TipoAquisicaoBem.CESSAO;
  if (s.startsWith('comod')) return TipoAquisicaoBem.COMODATO;
  if (s.startsWith('permut')) return TipoAquisicaoBem.PERMUTA;
  if (s.includes('produc') || s.includes('fabric')) return TipoAquisicaoBem.PRODUCAO_PROPRIA;
  return TipoAquisicaoBem.OUTRO;
}
