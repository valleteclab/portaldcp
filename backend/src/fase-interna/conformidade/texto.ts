/**
 * CONFORMIDADE (Entrega 4) — leitura do TEXTO das peças. Funções puras.
 *
 * Única implementação das conferências de texto usadas pelo motor de
 * conformidade, pelo roteiro do parecer (E3B) e pela tela das minutas:
 *  - número do processo / da dispensa citado (VINC-01);
 *  - inciso do art. 75 citado (ENQ-01): "art. 75, inciso II", "art. 75, II",
 *    "inciso II do art. 75";
 *  - leis orçamentárias citadas (LEI-01): LDO, LOA e PPA;
 *  - ocorrências com a FOLHA e o TRECHO (evidências do achado).
 * `minutas-regras.ts` reexporta as antigas (`referenciasDivergentes`,
 * `incisosDoArt75Citados`, `normalizarNumero`, `textoPuro`) — sem duplicar.
 */

/** Texto puro de um HTML (tags, entidades e espaços repetidos removidos). */
export const textoPuro = (html: unknown) =>
  String(html ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Normaliza "139/2025", "0139/2025", "139 / 2025" → "139/2025". */
export function normalizarNumero(n: string | null | undefined): string | null {
  const m = String(n ?? '').match(/(\d{1,6})\s*\/\s*(\d{4})/);
  if (!m) return null;
  return `${Number(m[1])}/${m[2]}`;
}

const RE_REFERENCIA_PROCESSO = /(processo administrativo|\bPA\b|dispensa(?: de licita[çc][ãa]o)?(?: eletr[ôo]nica)?|inexigibilidade)\s*(?:n[º°o.]*\s*)?(\d{1,6}\s*\/\s*\d{4})/gi;

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
  const re = new RegExp(RE_REFERENCIA_PROCESSO.source, 'gi');
  const achados = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(puro))) {
    const num = normalizarNumero(m[2]);
    if (num && !validos.has(num)) achados.add(`${m[1].trim()} nº ${num}`);
  }
  return [...achados];
}

const ROMANOS = 'XVI|XV|XIV|XIII|XII|XI|X|IX|VIII|VII|VI|V|IV|III|II|I';
/** "art. 75, II", "art. 75, inciso II", "artigo 75 inciso II". */
const RE_ART75_INCISO = new RegExp(`art(?:igo)?\\.?\\s*75\\s*,?\\s*(?:inciso\\s*)?(${ROMANOS})\\b`, 'gi');
/** "inciso II do art. 75", "inciso II, do artigo 75". */
const RE_INCISO_DO_ART75 = new RegExp(`inciso\\s+(${ROMANOS})\\s*,?\\s*d[oa]\\s+art(?:igo)?\\.?\\s*75\\b`, 'gi');

/** Incisos do art. 75 citados no texto ("art. 75, II", "art. 75, inciso I", "inciso II do art. 75"). */
export function incisosDoArt75Citados(texto: string): string[] {
  const puro = textoPuro(texto);
  const r = new Set<string>();
  for (const re of [RE_ART75_INCISO, RE_INCISO_DO_ART75]) {
    const g = new RegExp(re.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = g.exec(puro))) r.add(m[1].toUpperCase());
  }
  return [...r];
}

/** Uma PÁGINA de texto da peça (anexada: uma por página do PDF; feita aqui: uma por seção). */
export interface PaginaDeTexto {
  /** Folha dos autos (anexada: folha inicial + página − 1; feita aqui: a folha inicial). */
  folha: number | null;
  /** Seção (peça feita no sistema) — ajuda a achar o trecho no editor. */
  secao?: string | null;
  texto: string;
}

export interface Ocorrencia {
  folha: number | null;
  secao: string | null;
  trecho: string;
  /** Grupos da expressão (m[1], m[2]…). */
  grupos: string[];
}

/** Trecho (até ~220 caracteres) em volta da posição, para mostrar/destacar. */
export function trechoEmVolta(texto: string, inicio: number, fim: number, margem = 90): string {
  const a = Math.max(0, inicio - margem);
  const b = Math.min(texto.length, fim + margem);
  return `${a > 0 ? '…' : ''}${texto.slice(a, b).trim()}${b < texto.length ? '…' : ''}`;
}

/** Todas as ocorrências da expressão nas páginas da peça, com a folha e o trecho. */
export function ocorrencias(paginas: PaginaDeTexto[], re: RegExp): Ocorrencia[] {
  const r: Ocorrencia[] = [];
  for (const p of paginas) {
    const puro = textoPuro(p.texto);
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = g.exec(puro))) {
      r.push({ folha: p.folha, secao: p.secao ?? null, trecho: trechoEmVolta(puro, m.index, m.index + m[0].length), grupos: m.slice(1).map((x) => x ?? '') });
      if (m[0].length === 0) g.lastIndex++;
    }
  }
  return r;
}

/** Ocorrências dos incisos do art. 75 (ENQ-01), com o inciso citado. */
export function ocorrenciasDoArt75(paginas: PaginaDeTexto[]): Array<Ocorrencia & { inciso: string }> {
  return [...ocorrencias(paginas, RE_ART75_INCISO), ...ocorrencias(paginas, RE_INCISO_DO_ART75)].map((o) => ({ ...o, inciso: o.grupos[0].toUpperCase() }));
}

/** Ocorrências de número de processo/dispensa diferente do processo (VINC-01). */
export function ocorrenciasDeOutroProcesso(
  paginas: PaginaDeTexto[],
  proprios: { numero_processo?: string | null; numero_dispensa?: string | null },
): Array<Ocorrencia & { referencia: string }> {
  const validos = new Set([normalizarNumero(proprios.numero_processo), normalizarNumero(proprios.numero_dispensa)].filter(Boolean) as string[]);
  return ocorrencias(paginas, RE_REFERENCIA_PROCESSO)
    .map((o) => ({ ...o, numero: normalizarNumero(o.grupos[1]) }))
    .filter((o) => o.numero && !validos.has(o.numero))
    .map((o) => ({ ...o, referencia: `${o.grupos[0].trim()} nº ${o.numero}` }));
}

// ---------------------------------------------------------------------------
// Leis orçamentárias (LEI-01)
// ---------------------------------------------------------------------------

export type TipoLei = 'LDO' | 'LOA' | 'PPA';

/** Palavras que dizem de qual lei orçamentária se trata. */
const INDICIOS_LEI: Array<{ tipo: TipoLei; re: RegExp }> = [
  { tipo: 'LDO', re: /\bLDO\b|diretrizes\s+or[çc]ament[áa]rias/i },
  { tipo: 'LOA', re: /\bLOA\b|or[çc]ament[áa]ria\s+anual|or[çc]amento\s+anual|lei\s+do\s+or[çc]amento/i },
  { tipo: 'PPA', re: /\bPPA\b|plano\s+plurianual/i },
];

/** "Lei nº 1.141/2024", "Lei Municipal 1141/2024", "Lei Orçamentária Anual nº 1.151, de 2024". */
const RE_LEI = /\blei\b[\s\wÀ-ÿ]{0,40}?\s*(?:n[º°o.]*\s*)?(\d{1,2}(?:\.\d{3})+|\d{1,6})\s*(?:\/|,\s*de\s+(?:\d{1,2}\s+de\s+[a-zç]+\s+de\s+)?)\s*(\d{4})/gi;

/** Leis federais que não são LDO/LOA/PPA (nunca entram na comparação). */
const LEIS_GERAIS = new Set(['14133/2021', '4320/1964', '101/2000', '8666/1993', '10520/2002', '123/2006', '13709/2018', '12527/2011', '8429/1992', '9784/1999']);

export const normalizarNumeroLei = (numero: string, ano: string) => `${String(numero).replace(/\D/g, '').replace(/^0+/, '')}/${ano}`;

/**
 * Leis orçamentárias citadas no texto, classificadas (LDO, LOA ou PPA) pelas
 * palavras em volta (até 90 caracteres antes e 40 depois). Leis gerais
 * (14.133, 4.320, LC 101...) e as sem indício de tipo ficam de fora.
 */
export function leisOrcamentariasCitadas(paginas: PaginaDeTexto[]): Array<{ tipo: TipoLei; numero: string; folha: number | null; trecho: string }> {
  const r: Array<{ tipo: TipoLei; numero: string; folha: number | null; trecho: string }> = [];
  for (const p of paginas) {
    const puro = textoPuro(p.texto);
    const g = new RegExp(RE_LEI.source, 'gi');
    let m: RegExpExecArray | null;
    while ((m = g.exec(puro))) {
      const numero = normalizarNumeroLei(m[1], m[2]);
      if (LEIS_GERAIS.has(numero)) continue;
      // o que vem antes do número, incluindo o nome da lei ("Lei Orçamentária Anual nº …")
      const antes = puro.slice(Math.max(0, m.index - 90), m.index + m[0].length);
      const depois = puro.slice(m.index + m[0].length, m.index + m[0].length + 40);
      // O indício mais próximo ANTES do número decide; sem ele, o que vem logo depois
      let melhor: { tipo: TipoLei; pos: number } | null = null;
      for (const i of INDICIOS_LEI) {
        const re = new RegExp(i.re.source, 'gi');
        let x: RegExpExecArray | null;
        while ((x = re.exec(antes))) if (!melhor || x.index > melhor.pos) melhor = { tipo: i.tipo, pos: x.index };
      }
      if (!melhor) {
        const depoisTipo = INDICIOS_LEI.find((i) => i.re.test(depois));
        if (depoisTipo) melhor = { tipo: depoisTipo.tipo, pos: 0 };
      }
      if (!melhor) continue;
      r.push({ tipo: melhor.tipo, numero, folha: p.folha, trecho: trechoEmVolta(puro, m.index, m.index + m[0].length, 70) });
    }
  }
  return r;
}
