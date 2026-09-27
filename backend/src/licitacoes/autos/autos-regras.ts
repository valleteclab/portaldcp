import { createHash } from 'crypto';

/**
 * ============================================================================
 * AUTOS DO PROCESSO EM PDF — regras puras (fase interna, Entrega 6)
 * ============================================================================
 *
 * Os autos reais (PA 139/2025 da Câmara de LEM, 184 folhas) são montados NO
 * FIM, na ORDEM LÓGICA das peças — não na ordem das datas (o ETP é de 14/11, o
 * DFD de 10/12 e vem antes). Cada folha leva o carimbo "Fl. 000123" no canto
 * superior direito, numeração contínua do termo de abertura ao termo de
 * encerramento. Peça anexada entra com as páginas reais do PDF; peça gerada,
 * com o PDF gerado/assinado. Versões substituídas não entram (o índice cita
 * "substitui a versão X").
 *
 * FOLHAS: o PDF dos autos é a FONTE da numeração. As folhas gravadas na peça
 * na juntada (Entrega 1 — sequência de finalização, provisória) são
 * reescritas com as do PDF a cada montagem (idempotente) — a peça, a tela e o
 * PDF passam a dizer a mesma folha.
 */

/** Versão do leiaute — entra na impressão (mudou o leiaute, o cache não vale). */
export const VERSAO_LEIAUTE_AUTOS = 'autos-v1';

/**
 * ORDEM LÓGICA dos autos (plano §2.1 e Entrega 6): abertura; planejamento;
 * preço; orçamento; decisão; instrução do agente e minutas; análise;
 * publicação; fase externa (atas, resultado, parecer nº 2, adjudicação e
 * homologação, contrato, extrato); encerramento. Chaves = tipo da peça da
 * fase interna ou do documento do processo.
 */
export const ORDEM_LOGICA_AUTOS: readonly string[] = [
  'CAPA',
  'TERMO_ABERTURA',
  'INDICE',
  // Planejamento
  'DFD',
  'ETP',
  'AR',
  'TR',
  'PB',
  'PE',
  // Pesquisa de preços (mapa e certidão)
  'PP',
  'PP_CERTIDAO',
  'MCP',
  // Reserva / informação orçamentária
  'DO',
  // Decisão
  'AA',
  'DP',
  'DEA',
  // Instrução do agente e minutas
  'RAG',
  'JC',
  'ME',
  'AE',
  'EA',
  'MC',
  // Análise
  'PT',
  'PJ',
  'MCI',
  'TERMO_JUSTIFICATIVAS',
  // Publicação
  'AVISO_PUBLICADO',
  'REGISTRO_PUBLICACOES',
  'PDO',
  // Fase externa
  'IMPUGNACAO_RESPOSTA',
  'ESCLARECIMENTO',
  'ATA_SESSAO',
  'RELATORIO_JULGAMENTO',
  'MAPA_COMPARATIVO',
  'PARECER_HABILITACAO',
  'RECURSO',
  'CONTRARRAZOES',
  'DECISAO_RECURSO',
  'PJE',
  'TERMO_ADJUDICACAO',
  'TERMO_HOMOLOGACAO',
  'ATA_REGISTRO_PRECO',
  'CONTRATO',
  'EXTRATO',
  'OUT',
  'OUTROS',
  'TERMO_ENCERRAMENTO',
];

const POSICAO = new Map(ORDEM_LOGICA_AUTOS.map((c, i) => [c, i]));
const POSICAO_DESCONHECIDA = ORDEM_LOGICA_AUTOS.indexOf('OUTROS');

export function posicaoNaOrdem(chave: string): number {
  return POSICAO.get(chave) ?? POSICAO_DESCONHECIDA;
}

/**
 * Ordena as peças na ordem lógica dos autos. Dentro da mesma chave (ex.: dois
 * contratos), vale `ordem` (número/data) e, por fim, a ordem de chegada.
 * NUNCA pela data do documento entre chaves diferentes.
 */
export function ordenarPecasDosAutos<T extends { chave: string; ordem?: string | number | null }>(pecas: T[]): T[] {
  return pecas
    .map((p, i) => ({ p, i }))
    .sort((a, b) => {
      const d = posicaoNaOrdem(a.p.chave) - posicaoNaOrdem(b.p.chave);
      if (d) return d;
      const oa = a.p.ordem ?? '';
      const ob = b.p.ordem ?? '';
      if (oa !== ob) return String(oa).localeCompare(String(ob), 'pt-BR', { numeric: true });
      return a.i - b.i;
    })
    .map((x) => x.p);
}

export interface FaixaDeFolhas {
  folha_inicial: number;
  folha_final: number;
}

/** Numeração CONTÍNUA: cada peça começa na folha seguinte à última da anterior. */
export function numerarFolhas(paginas: number[], inicio = 1): FaixaDeFolhas[] {
  let proxima = Math.max(1, Math.floor(inicio));
  return paginas.map((n) => {
    const qtd = Math.max(1, Math.floor(Number(n) || 1));
    const faixa = { folha_inicial: proxima, folha_final: proxima + qtd - 1 };
    proxima += qtd;
    return faixa;
  });
}

/** Carimbo de folha, como nos autos reais: "Fl. 000123". */
export function carimboDeFolha(folha: number): string {
  return `Fl. ${String(Math.max(0, Math.floor(folha))).padStart(6, '0')}`;
}

export function rotuloFaixa(f: FaixaDeFolhas): string {
  return f.folha_final > f.folha_inicial ? `${f.folha_inicial}–${f.folha_final}` : String(f.folha_inicial);
}

/** Linhas do índice por página (A4, corpo 8,5 pt, com cabeçalho). */
export const LINHAS_INDICE_POR_PAGINA = 26;

/** Quantas folhas o índice ocupa (sabido ANTES de numerar — as folhas das peças dependem dele). */
export function paginasDoIndice(entradas: number): number {
  return Math.max(1, Math.ceil(Math.max(0, entradas) / LINHAS_INDICE_POR_PAGINA));
}

/**
 * Impressão (SHA-256) do que compõe os autos: se nada mudou nas peças (id,
 * versão, arquivo/conteúdo, status), nas justificativas e nas publicações, o
 * PDF já gerado é servido do cache — sem regenerar.
 */
export function impressaoDosAutos(partes: unknown): string {
  return createHash('sha256').update(JSON.stringify([VERSAO_LEIAUTE_AUTOS, partes])).digest('hex');
}

/**
 * Posição do carimbo no CANTO SUPERIOR DIREITO VISÍVEL da página, respeitando
 * a rotação (/Rotate) e a caixa da página. Devolve o ponto no espaço do
 * usuário e o ângulo do texto (graus, anti-horário — pdf-lib).
 */
export function posicaoDoCarimbo(
  caixa: { x: number; y: number; width: number; height: number },
  rotacao: number,
  larguraTexto: number,
  tamanho: number,
  margem = 18,
): { x: number; y: number; angulo: number } {
  const r = (((Math.round(rotacao / 90) * 90) % 360) + 360) % 360;
  const { x, y, width: w, height: h } = caixa;
  switch (r) {
    case 90:
      return { x: x + margem + tamanho, y: y + h - margem - larguraTexto, angulo: 90 };
    case 180:
      return { x: x + margem + larguraTexto, y: y + margem + tamanho, angulo: 180 };
    case 270:
      return { x: x + w - margem - tamanho, y: y + margem + larguraTexto, angulo: 270 };
    default:
      return { x: x + w - margem - larguraTexto, y: y + h - margem - tamanho, angulo: 0 };
  }
}

/** Caracteres que as fontes padrão do PDF (WinAnsi) não desenham viram equivalentes. */
const EXTRAS_WINANSI = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ');
export function textoSeguroPdf(texto: unknown): string {
  return String(texto ?? '')
    .replace(/[‐-‒]/g, '-')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/[\r\t]/g, ' ')
    .replace(/\n+/g, ' ')
    .split('')
    .filter((c) => {
      const code = c.charCodeAt(0);
      return (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRAS_WINANSI.has(c);
    })
    .join('');
}

/** Quebra o texto em linhas que cabem em `largura` (medida pela função da fonte). */
export function quebrarLinhas(texto: string, largura: number, medir: (s: string) => number): string[] {
  const palavras = textoSeguroPdf(texto).split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (medir(tentativa) <= largura || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  return linhas;
}

/** Data por extenso (termos de abertura e encerramento), no fuso de Brasília. */
export function dataPorExtenso(d: Date): string {
  const meses = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const b = new Date(d.getTime() - 3 * 3_600_000);
  return `${b.getUTCDate()} de ${meses[b.getUTCMonth()]} de ${b.getUTCFullYear()}`;
}

/**
 * DESPACHOS DE TRAMITAÇÃO nos autos (espinha da tramitação): as peças seguem
 * a ORDEM LÓGICA; cada despacho entra logo depois da última peça (na ordem
 * lógica) que já existia quando ele foi dado — como no papel, o despacho de
 * envio vem depois da peça que o setor juntou. Entre si, os despachos ficam
 * em ordem cronológica (nunca um despacho antes do anterior). Peça sem
 * momento conhecido não prende o despacho.
 */
export function intercalarDespachos<T extends { momento?: Date | null }>(pecasOrdenadas: T[], despachos: T[]): T[] {
  const ds = despachos
    .map((d, i) => ({ d, i, t: d.momento ? new Date(d.momento).getTime() : Number.POSITIVE_INFINITY }))
    .sort((a, b) => a.t - b.t || a.i - b.i);
  // índice da peça depois da qual o despacho entra (-1 = antes de todas)
  const apos = new Map<number, T[]>();
  let piso = -1;
  for (const { d, t } of ds) {
    let pos = -1;
    pecasOrdenadas.forEach((p, idx) => {
      if (p.momento && new Date(p.momento).getTime() <= t) pos = idx;
    });
    pos = Math.max(pos, piso);
    piso = pos;
    const l = apos.get(pos) ?? [];
    l.push(d);
    apos.set(pos, l);
  }
  const saida: T[] = [...(apos.get(-1) ?? [])];
  pecasOrdenadas.forEach((p, idx) => {
    saida.push(p, ...(apos.get(idx) ?? []));
  });
  return saida;
}
