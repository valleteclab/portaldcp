import * as jpeg from 'jpeg-js';
import { PNG } from 'pngjs';

/**
 * Brasão do órgão para etiquetas: decodifica PNG/JPEG, corta a margem branca
 * (o logo costuma vir com muita sobra e ficaria minúsculo numa etiqueta de
 * 50 mm) e converte para o gráfico monocromático da impressora Zebra (^GFA).
 */

export interface ImagemRgba {
  width: number;
  height: number;
  /** RGBA, 4 bytes por pixel. */
  data: Uint8Array;
}

export function decodificarImagem(buf: Buffer): ImagemRgba {
  if (buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    const png = PNG.sync.read(buf);
    return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
  }
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) {
    const img = jpeg.decode(buf, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
    return { width: img.width, height: img.height, data: img.data };
  }
  throw new Error('Formato de imagem não suportado (use PNG ou JPEG)');
}

/** Luminância 0–255 com transparência tratada como branco. */
function luminancia(img: ImagemRgba, i: number): number {
  const a = img.data[i + 3] / 255;
  const l = 0.299 * img.data[i] + 0.587 * img.data[i + 1] + 0.114 * img.data[i + 2];
  return l * a + 255 * (1 - a);
}

/** Corta a margem quase branca/transparente; devolve a própria imagem se estiver toda em branco. */
export function recortarMargem(img: ImagemRgba, limiar = 235): ImagemRgba {
  let x0 = img.width, y0 = img.height, x1 = -1, y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (luminancia(img, (y * img.width + x) * 4) < limiar) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return img;
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const ini = ((y + y0) * img.width + x0) * 4;
    data.set(img.data.subarray(ini, ini + width * 4), y * width * 4);
  }
  return { width, height, data };
}

/** PNG do brasão já recortado, para o PDF. */
export function paraPng(img: ImagemRgba): Buffer {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  return PNG.sync.write(png);
}

/** Tamanho em pontos que cabe na caixa mantendo a proporção. */
export function caberNaCaixa(w: number, h: number, caixaW: number, caixaH: number) {
  const esc = Math.min(caixaW / w, caixaH / h);
  return { width: Math.max(1, Math.round(w * esc)), height: Math.max(1, Math.round(h * esc)) };
}

/**
 * Tons de cinza reduzidos por média de área (sem serrilhado) e pontilhados
 * (Floyd–Steinberg) para 1 bit. Retorna matriz de preto (true) por linha.
 */
export function monocromatico(img: ImagemRgba, largura: number, altura: number): boolean[][] {
  const cinza = new Float32Array(largura * altura);
  const fx = img.width / largura;
  const fy = img.height / altura;
  for (let y = 0; y < altura; y++) {
    const sy0 = Math.floor(y * fy);
    const sy1 = Math.max(sy0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < largura; x++) {
      const sx0 = Math.floor(x * fx);
      const sx1 = Math.max(sx0 + 1, Math.floor((x + 1) * fx));
      let soma = 0;
      let n = 0;
      for (let yy = sy0; yy < Math.min(sy1, img.height); yy++) {
        for (let xx = sx0; xx < Math.min(sx1, img.width); xx++) {
          soma += luminancia(img, (yy * img.width + xx) * 4);
          n++;
        }
      }
      // sombras e cinzas claros do logo viram branco: na impressora térmica
      // eles só geram pontos soltos; o resto ganha um pouco de contraste
      const media = n ? soma / n : 255;
      cinza[y * largura + x] = media > 205 ? 255 : Math.max(0, media * 0.9);
    }
  }
  const preto: boolean[][] = [];
  for (let y = 0; y < altura; y++) {
    const linha: boolean[] = [];
    for (let x = 0; x < largura; x++) {
      const i = y * largura + x;
      const valor = cinza[i];
      const p = valor < 128;
      linha.push(p);
      const erro = valor - (p ? 0 : 255);
      if (x + 1 < largura) cinza[i + 1] += (erro * 7) / 16;
      if (y + 1 < altura) {
        if (x > 0) cinza[i + largura - 1] += (erro * 3) / 16;
        cinza[i + largura] += (erro * 5) / 16;
        if (x + 1 < largura) cinza[i + largura + 1] += erro / 16;
      }
    }
    preto.push(linha);
  }
  return preto;
}

/** Comando ZPL ^GFA (hex, sem compressão) de uma matriz monocromática. */
export function zplGrafico(preto: boolean[][]): string {
  const altura = preto.length;
  const largura = altura ? preto[0].length : 0;
  const bytesPorLinha = Math.ceil(largura / 8);
  let hex = '';
  for (const linha of preto) {
    for (let b = 0; b < bytesPorLinha; b++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = b * 8 + bit;
        if (x < largura && linha[x]) byte |= 0x80 >> bit;
      }
      hex += byte.toString(16).padStart(2, '0').toUpperCase();
    }
  }
  const total = bytesPorLinha * altura;
  return `^GFA,${total},${total},${bytesPorLinha},${hex}`;
}

/** Reduz a imagem (média de área, mantém transparência) — deixa o PDF leve. */
export function reduzir(img: ImagemRgba, larguraMax: number): ImagemRgba {
  if (img.width <= larguraMax) return img;
  const width = larguraMax;
  const height = Math.max(1, Math.round((img.height * larguraMax) / img.width));
  const data = new Uint8Array(width * height * 4);
  const fx = img.width / width;
  const fy = img.height / height;
  for (let y = 0; y < height; y++) {
    const sy0 = Math.floor(y * fy);
    const sy1 = Math.min(img.height, Math.max(sy0 + 1, Math.floor((y + 1) * fy)));
    for (let x = 0; x < width; x++) {
      const sx0 = Math.floor(x * fx);
      const sx1 = Math.min(img.width, Math.max(sx0 + 1, Math.floor((x + 1) * fx)));
      const soma = [0, 0, 0, 0];
      let n = 0;
      for (let yy = sy0; yy < sy1; yy++) {
        for (let xx = sx0; xx < sx1; xx++) {
          const i = (yy * img.width + xx) * 4;
          for (let c = 0; c < 4; c++) soma[c] += img.data[i + c];
          n++;
        }
      }
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) data[o + c] = Math.round(soma[c] / n);
    }
  }
  return { width, height, data };
}
