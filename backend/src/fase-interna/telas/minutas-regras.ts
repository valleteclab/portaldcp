/**
 * MINUTAS GERADAS POR MODELO (Entrega 3B) — regras puras.
 *
 *  - Toda peça gerada pelo modelo guarda a "impressão" do texto gerado
 *    (`dados_estruturados._gerado.hash`). Se o texto atual das seções ainda é
 *    o gerado, a peça NÃO foi editada à mão e pode ser REGERADA quando o
 *    processo muda (fundamento legal, número, sigilo) — critério de aceite da
 *    SPEC: "mudar `fundamento_legal` atualiza as minutas geradas por modelo".
 *  - Editada à mão, assinada ou em assinatura: não se mexe no texto; a peça
 *    ganha o aviso "desatualizada — regerar?".
 *  - Conferência de vinculação (VINC-01 da SPEC, só leitura aqui): número de
 *    PA/dispensa citado na minuta diferente do processo (o erro real do PA
 *    139/2025, cujo contrato citava o "PA 115/2025").
 *  - Enquadramento citado nas peças (ENQ-01, leitura): "art. 75, inciso II".
 */
import { createHash } from 'crypto';

/** Peças geradas pelo modelo que acompanham os dados do processo. */
export const TIPOS_REGERAVEIS = ['AA', 'RAG', 'ME', 'MC'] as const;
export type TipoRegeravel = (typeof TIPOS_REGERAVEIS)[number];

/** Seções (texto) de uma peça — ignora as chaves internas (`_…`) e as não-texto. */
export function secoesDaPeca(dados: unknown): Record<string, string> {
  if (!dados || typeof dados !== 'object') return {};
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(dados as Record<string, unknown>)) {
    if (k.startsWith('_') || typeof v !== 'string') continue;
    if (['nao_se_aplica', 'justificativa_nao_se_aplica'].includes(k)) continue;
    r[k] = v;
  }
  return r;
}

/** Impressão estável do texto das seções (ordem das chaves não importa). */
export function hashSecoes(secoes: Record<string, string>): string {
  const ordenado = Object.keys(secoes)
    .sort()
    .map((k) => [k, String(secoes[k] ?? '').trim()]);
  return createHash('sha256').update(JSON.stringify(ordenado)).digest('hex');
}

export interface PecaParaRegerar {
  id: string;
  tipo: string;
  status: string;
  origem: string;
  dados_estruturados: any;
}

export type DecisaoRegeracao =
  | { acao: 'REGERAR' }
  | { acao: 'MARCAR_DESATUALIZADA'; motivo: 'EDITADA' | 'ASSINADA' | 'EM_ASSINATURA' | 'APROVADA' }
  | { acao: 'IGNORAR'; motivo: 'NAO_GERADA' | 'ANEXADA' | 'NAO_SE_APLICA' | 'SUBSTITUIDA' };

/** A peça foi editada à mão depois de gerada? */
export function pecaEditadaAMao(doc: Pick<PecaParaRegerar, 'dados_estruturados'>): boolean {
  const g = doc.dados_estruturados?._gerado;
  if (!g?.hash) return false;
  return hashSecoes(secoesDaPeca(doc.dados_estruturados)) !== g.hash;
}

/**
 * O que fazer com a peça quando o processo muda (fundamento, número, sigilo):
 *  - não gerada pelo modelo, anexada (feita fora), "não se aplica" ou versão
 *    antiga → nada;
 *  - assinada ou aguardando assinatura → aviso (não se reescreve peça assinada);
 *  - editada à mão → aviso "desatualizada, regerar?";
 *  - gerada e intocada → regerar.
 */
export function decidirRegeracao(doc: PecaParaRegerar): DecisaoRegeracao {
  const dados = doc.dados_estruturados || {};
  if (doc.status === 'SUBSTITUIDO') return { acao: 'IGNORAR', motivo: 'SUBSTITUIDA' };
  if (dados.nao_se_aplica) return { acao: 'IGNORAR', motivo: 'NAO_SE_APLICA' };
  if (doc.origem !== 'INTERNO') return { acao: 'IGNORAR', motivo: 'ANEXADA' };
  if (!dados._gerado?.hash) return { acao: 'IGNORAR', motivo: 'NAO_GERADA' };
  if (doc.status === 'ASSINADO') return { acao: 'MARCAR_DESATUALIZADA', motivo: 'ASSINADA' };
  if (doc.status === 'AGUARDANDO_ASSINATURA') return { acao: 'MARCAR_DESATUALIZADA', motivo: 'EM_ASSINATURA' };
  if (doc.status === 'APROVADO') return { acao: 'MARCAR_DESATUALIZADA', motivo: 'APROVADA' };
  if (pecaEditadaAMao(doc)) return { acao: 'MARCAR_DESATUALIZADA', motivo: 'EDITADA' };
  return { acao: 'REGERAR' };
}

// ---------------------------------------------------------------------------
// Conferências de texto (leitura — as regras que BLOQUEIAM vêm na Entrega 4)
// ---------------------------------------------------------------------------

export const textoPuro = (html: unknown) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Normaliza "139/2025", "0139/2025", "139 / 2025" → "139/2025". */
export function normalizarNumero(n: string | null | undefined): string | null {
  const m = String(n ?? '').match(/(\d{1,6})\s*\/\s*(\d{4})/);
  if (!m) return null;
  return `${Number(m[1])}/${m[2]}`;
}

/**
 * Números de PROCESSO ou de DISPENSA citados no texto que NÃO são os do
 * processo (VINC-01): procura "nº 115/2025" perto de "Processo
 * Administrativo", "PA", "Dispensa" ou "Inexigibilidade".
 */
export function referenciasDivergentes(
  texto: string,
  proprios: { numero_processo?: string | null; numero_dispensa?: string | null },
): string[] {
  const puro = textoPuro(texto);
  const validos = new Set([normalizarNumero(proprios.numero_processo), normalizarNumero(proprios.numero_dispensa)].filter(Boolean) as string[]);
  const re = /(processo administrativo|\bPA\b|dispensa(?: de licita[çc][ãa]o)?(?: eletr[ôo]nica)?|inexigibilidade)\s*(?:n[º°o.]*\s*)?(\d{1,6}\s*\/\s*\d{4})/gi;
  const achados = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(puro))) {
    const num = normalizarNumero(m[2]);
    if (num && !validos.has(num)) achados.add(`${m[1].trim()} nº ${num}`);
  }
  return [...achados];
}

const ROMANOS = 'XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I';

/** Incisos do art. 75 citados no texto ("art. 75, II", "art. 75, inciso I"). */
export function incisosDoArt75Citados(texto: string): string[] {
  const puro = textoPuro(texto);
  const re = new RegExp(`art(?:igo)?\\.?\\s*75\\s*,?\\s*(?:inciso\\s*)?(${ROMANOS})\\b`, 'gi');
  const r = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(puro))) r.add(m[1].toUpperCase());
  return [...r];
}
