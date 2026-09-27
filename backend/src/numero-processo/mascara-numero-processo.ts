/**
 * NÚMERO DO PROCESSO ADMINISTRATIVO — máscara (formato) configurável por órgão.
 *
 * Um só gerador (NumeroProcessoService), sequencial por ÓRGÃO e ANO. O formato
 * do número gerado vem da configuração do órgão; sem configuração vale o
 * formato que o servidor já usava (`AAAA/NNNNN`, ex.: 2026/00033), para não
 * mudar o que os órgãos já veem.
 *
 * Marcadores:
 *  - `{ano}`   → ano com 4 dígitos (2026)
 *  - `{aa}`    → ano com 2 dígitos (26)
 *  - `{seq}`   → sequencial sem zeros à esquerda (33)
 *  - `{seq:N}` → sequencial com N dígitos, completando com zeros (N de 1 a 10)
 * O resto é texto fixo (ex.: `PA {seq:3}/{ano}` → "PA 033/2026").
 *
 * O `numero_edital` (nº da dispensa/licitação) é OUTRO campo — não passa por aqui.
 */

export const MASCARA_PADRAO_NUMERO_PROCESSO = '{ano}/{seq:5}';

/** Tamanho máximo do número do processo (digitado ou gerado). */
export const TAMANHO_MAXIMO_NUMERO_PROCESSO = 60;
const TAMANHO_MAXIMO_MASCARA = 40;

const MARCADOR = /\{([a-z]+)(?::(\d+))?\}/gi;

type Parte = { tipo: 'texto'; valor: string } | { tipo: 'ano' } | { tipo: 'aa' } | { tipo: 'seq'; digitos: number };

/** Quebra a máscara em partes (texto fixo e marcadores). Marcador desconhecido → erro. */
function partes(mascara: string): Parte[] {
  const r: Parte[] = [];
  let pos = 0;
  for (const m of mascara.matchAll(MARCADOR)) {
    const i = m.index ?? 0;
    if (i > pos) r.push({ tipo: 'texto', valor: mascara.slice(pos, i) });
    const nome = m[1].toLowerCase();
    if (nome === 'ano' && m[2] === undefined) r.push({ tipo: 'ano' });
    else if (nome === 'aa' && m[2] === undefined) r.push({ tipo: 'aa' });
    else if (nome === 'seq') {
      const digitos = m[2] === undefined ? 0 : Number(m[2]);
      if (m[2] !== undefined && !(digitos >= 1 && digitos <= 10)) throw new Error(`Em {seq:N}, N vai de 1 a 10 (recebido ${m[2]}).`);
      r.push({ tipo: 'seq', digitos });
    } else throw new Error(`Marcador desconhecido: ${m[0]}. Use {ano}, {aa}, {seq} ou {seq:N}.`);
    pos = i + m[0].length;
  }
  if (pos < mascara.length) r.push({ tipo: 'texto', valor: mascara.slice(pos) });
  return r;
}

/** Máscara efetiva: a informada (aparada) ou a padrão. */
export function mascaraEfetiva(mascara: string | null | undefined): string {
  const m = String(mascara ?? '').trim();
  return m || MASCARA_PADRAO_NUMERO_PROCESSO;
}

/**
 * Motivo de a máscara ser inválida (ou null). Exige exatamente um `{seq}` e
 * um marcador de ano — sem o ano, a sequência que recomeça a cada ano
 * repetiria números de anos anteriores.
 */
export function motivoMascaraInvalida(mascara: string | null | undefined): string | null {
  const m = String(mascara ?? '').trim();
  if (!m) return null; // vazio = padrão
  if (m.length > TAMANHO_MAXIMO_MASCARA) return `A máscara do número do processo tem no máximo ${TAMANHO_MAXIMO_MASCARA} caracteres.`;
  let ps: Parte[];
  try {
    ps = partes(m);
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
  if (ps.some((p) => p.tipo === 'texto' && /[{}]/.test(p.valor))) return 'Chave "{" ou "}" solta na máscara — os marcadores são {ano}, {aa}, {seq} e {seq:N}.';
  if (ps.some((p) => p.tipo === 'texto' && /[\u0000-\u001f]/.test(p.valor))) return 'A máscara não pode ter quebra de linha nem caracteres de controle.';
  const seqs = ps.filter((p) => p.tipo === 'seq').length;
  if (seqs !== 1) return 'A máscara precisa ter exatamente um sequencial: {seq} ou {seq:N} (ex.: {seq:5}).';
  if (!ps.some((p) => p.tipo === 'ano' || p.tipo === 'aa')) return 'A máscara precisa ter o ano ({ano} ou {aa}) — a sequência recomeça a cada ano.';
  // Sequencial colado ao ano (ex.: "{ano}{seq}") fica ambíguo na leitura
  for (let i = 0; i + 1 < ps.length; i++) {
    const a = ps[i].tipo;
    const b = ps[i + 1].tipo;
    const numerico = (t: string) => t === 'seq' || t === 'ano' || t === 'aa';
    if (numerico(a) && numerico(b)) return 'Separe o sequencial do ano com algum texto (ex.: "/", "-" ou ".").';
  }
  return null;
}

/** Número formatado pela máscara (máscara vazia = padrão). Máscara inválida → erro. */
export function formatarNumeroProcesso(mascara: string | null | undefined, ano: number, seq: number): string {
  const m = mascaraEfetiva(mascara);
  const motivo = motivoMascaraInvalida(m);
  if (motivo) throw new Error(motivo);
  return partes(m)
    .map((p) => {
      switch (p.tipo) {
        case 'texto':
          return p.valor;
        case 'ano':
          return String(ano).padStart(4, '0');
        case 'aa':
          return String(ano % 100).padStart(2, '0');
        case 'seq':
          return p.digitos ? String(seq).padStart(p.digitos, '0') : String(seq);
      }
    })
    .join('');
}

const escaparRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Lê o sequencial de um número no formato da máscara, para o ANO dado (outro
 * ano ou outro formato → null). Usado para começar a sequência depois do
 * maior número já existente do órgão/ano — números aleatórios antigos do
 * assistente ("202609.91299") não casam com o formato e ficam de fora.
 */
export function sequencialDoNumero(mascara: string | null | undefined, ano: number, numero: string | null | undefined): number | null {
  const m = mascaraEfetiva(mascara);
  if (motivoMascaraInvalida(m) || !numero) return null;
  const re = new RegExp(
    '^' +
      partes(m)
        .map((p) => {
          switch (p.tipo) {
            case 'texto':
              return escaparRegex(p.valor);
            case 'ano':
              return escaparRegex(String(ano).padStart(4, '0'));
            case 'aa':
              return escaparRegex(String(ano % 100).padStart(2, '0'));
            case 'seq':
              return '(\\d{1,12})';
          }
        })
        .join('') +
      '$',
  );
  const r = re.exec(String(numero).trim());
  if (!r) return null;
  const n = Number(r[1]);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * Número digitado pelo órgão: aparado, espaços internos únicos. Vazio → null
 * (o sistema gera). Longo demais / com caracteres de controle → erro.
 */
export function normalizarNumeroDigitado(valor: unknown): string | null {
  if (valor === undefined || valor === null) return null;
  const s = String(valor).replace(/\s+/g, ' ').trim();
  if (!s) return null;
  if (s.length > TAMANHO_MAXIMO_NUMERO_PROCESSO) throw new Error(`O nº do processo administrativo tem no máximo ${TAMANHO_MAXIMO_NUMERO_PROCESSO} caracteres.`);
  if (/[\u0000-\u001f]/.test(s)) throw new Error('O nº do processo administrativo tem caracteres inválidos.');
  return s;
}

/** Ano corrente no horário de Brasília (UTC-3): entre 21h e meia-noite de 31/12 o UTC já virou o ano, Brasília não. */
export function anoBrasilia(agora: Date = new Date()): number {
  return new Date(agora.getTime() - 3 * 3_600_000).getUTCFullYear();
}
