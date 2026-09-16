/**
 * Geometria da plaqueta patrimonial com QR code (em mm), separada do desenho
 * para poder testar sem gerar PDF. Layout: brasão à esquerda, textos no meio
 * (PATRIMÔNIO PÚBLICO, tombo em destaque, EPC opcional) e QR à direita.
 */

export const TAMANHOS_PLAQUETA = ['50x20', '50x25', '100x25'] as const;
export type TamanhoPlaqueta = (typeof TAMANHOS_PLAQUETA)[number];

export function dimensoesPlaqueta(tamanho?: string | null): { w: number; h: number; tamanho: TamanhoPlaqueta } {
  const t = (TAMANHOS_PLAQUETA as readonly string[]).includes(String(tamanho)) ? (tamanho as TamanhoPlaqueta) : '50x25';
  const [w, h] = t.split('x').map(Number);
  return { w, h, tamanho: t };
}

export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutPlaqueta {
  margem: number;
  logo: Caixa | null;
  /** x da linha divisória entre brasão e textos (null sem brasão). */
  divisoria: number | null;
  texto: Caixa;
  qr: Caixa;
  /** Etiqueta larga o bastante para a descrição do bem. */
  cabeDescricao: boolean;
  /** EPC em uma linha (larga) ou quebrado em duas (estreita). */
  epcUmaLinha: boolean;
}

export function layoutPlaqueta(w: number, h: number, temLogo: boolean): LayoutPlaqueta {
  const margem = h <= 20 ? 1.6 : 2;
  const larga = w >= 80;
  const ladoQr = Math.min(h - 2 * margem, w * (larga ? 0.22 : 0.34));
  const qr: Caixa = { x: w - margem - ladoQr, y: (h - ladoQr) / 2, w: ladoQr, h: ladoQr };

  let logo: Caixa | null = null;
  let divisoria: number | null = null;
  let xTexto = margem;
  if (temLogo) {
    const logoW = larga ? 28 : Math.min(12.5, w * 0.26);
    logo = { x: margem * 0.6, y: margem, w: logoW, h: h - 2 * margem };
    divisoria = logo.x + logoW + 0.9;
    xTexto = divisoria + 0.9;
  }
  const texto: Caixa = { x: xTexto, y: margem, w: qr.x - 1.2 - xTexto, h: h - 2 * margem };
  return { margem, logo, divisoria, texto, qr, cabeDescricao: larga, epcUmaLinha: texto.w >= 26 };
}

/** Grade de etiquetas numa folha A4 (210 × 297 mm), com margem e espaçamento. */
export function gradeA4(w: number, h: number, margem = 4, espaco = 2) {
  const colunas = Math.max(1, Math.floor((210 - 2 * margem + espaco) / (w + espaco)));
  const linhas = Math.max(1, Math.floor((297 - 2 * margem + espaco) / (h + espaco)));
  const largura = colunas * w + (colunas - 1) * espaco;
  const altura = linhas * h + (linhas - 1) * espaco;
  return { colunas, linhas, porPagina: colunas * linhas, x0: (210 - largura) / 2, y0: (297 - altura) / 2, espaco };
}

/** Tombo como sai impresso: numérico curto ganha zeros até 6 dígitos (87 → 000087). */
export function tomboImpresso(plaqueta?: string | null): string {
  const p = String(plaqueta ?? '').trim();
  if (!p) return '—';
  return /^\d{1,5}$/.test(p) ? p.padStart(6, '0') : p;
}
