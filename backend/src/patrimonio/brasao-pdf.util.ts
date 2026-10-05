import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { decodificarImagem, paraPng, recortarMargem, reduzir } from './brasao-imagem.util';

/**
 * Brasão do órgão pronto para entrar num PDF.
 *
 * Mesmo tratamento das plaquetas: recorta a margem branca (os arquivos vêm com
 * muita sobra e o brasão ficaria minúsculo) e reduz, para o PDF não carregar
 * uma imagem de vários MB num documento de uma página.
 *
 * Nunca lança: documento oficial sem brasão é feio, documento que não gera é
 * um problema. Se o arquivo faltar ou estiver corrompido, devolve null e o
 * cabeçalho segue sem a imagem.
 */

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
const cache = new Map<string, BrasaoPdf | null>();

export interface BrasaoPdf {
  /** PNG em base64 com o prefixo data:, como o jsPDF.addImage espera. */
  dataUrl: string;
  largura: number;
  altura: number;
  /** largura / altura, para encaixar numa altura fixa sem distorcer. */
  proporcao: number;
}

export function brasaoParaPdf(logoUrl?: string | null): BrasaoPdf | null {
  if (!logoUrl) return null;
  const caminho = join(UPLOAD_DIR, String(logoUrl).replace(/^\/api\/uploads\//, ''));
  if (cache.has(caminho)) return cache.get(caminho)!;
  let valor: BrasaoPdf | null = null;
  try {
    if (existsSync(caminho)) {
      const img = reduzir(recortarMargem(decodificarImagem(readFileSync(caminho))), 600);
      valor = {
        dataUrl: `data:image/png;base64,${paraPng(img).toString('base64')}`,
        largura: img.width,
        altura: img.height,
        proporcao: img.height ? img.width / img.height : 1,
      };
    }
  } catch {
    valor = null;
  }
  cache.set(caminho, valor);
  return valor;
}

/**
 * Largura que o brasão deve ocupar para caber numa altura, respeitando a
 * proporção e sem passar de `larguraMax` (brasão deitado não pode empurrar o
 * nome do órgão para fora da margem).
 */
export function medidaBrasao(b: BrasaoPdf, altura: number, larguraMax: number): { largura: number; altura: number } {
  const largura = altura * b.proporcao;
  if (largura <= larguraMax) return { largura, altura };
  return { largura: larguraMax, altura: larguraMax / b.proporcao };
}
