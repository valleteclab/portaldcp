/**
 * TEXTO DAS PEÇAS ANEXADAS (PDF) para o motor de conformidade — com a
 * biblioteca que o projeto já usa (`pdf-parse`, a mesma da importação de
 * contratos e da IA), página a página. SEM OCR: PDF digitalizado sem camada
 * de texto volta vazio (a peça fica "sem texto" — a IA lendo os PDFs é a
 * Entrega 7). Cache em memória pela impressão do arquivo (SHA-256 gravado na
 * peça), para a revisão a cada gravação não reler o mesmo PDF.
 *
 * O `pdf-parse` 2.x carrega o worker do pdf.js por `import()` dinâmico; onde
 * isso não existe (Jest sem `--experimental-vm-modules`), a MESMA biblioteca
 * roda num processo Node filho (só nesse caso).
 */
import { execFile } from 'child_process';
import * as fs from 'fs';
import { Logger } from '@nestjs/common';

const logger = new Logger('ConformidadeTextoPdf');
const MAX_BYTES = 40 * 1024 * 1024;
const MAX_PAGINAS = 600;
const MAX_CACHE = 300;
const cache = new Map<string, string[] | null>();
let usarProcessoFilho = false;

function guardar(chave: string, valor: string[] | null) {
  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(chave, valor);
}

const normalizar = (paginas: string[]): string[] | null => (paginas.some((p) => p.trim()) ? paginas : null);

async function noProcesso(buffer: Buffer): Promise<string[] | null> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('pdf-parse');
  if (typeof mod?.PDFParse === 'function') {
    const parser = new mod.PDFParse({ data: new Uint8Array(buffer) });
    try {
      const r = await parser.getText({ first: MAX_PAGINAS });
      return normalizar(Array.isArray(r?.pages) ? r.pages.map((p: any) => String(p?.text ?? '')) : [String(r?.text ?? '')]);
    } finally {
      await Promise.resolve(parser.destroy?.()).catch(() => undefined);
    }
  }
  // pdf-parse 1.x (função): sem separação de páginas
  const fn = typeof mod === 'function' ? mod : mod?.default;
  if (typeof fn === 'function') {
    const r = await fn(buffer);
    return normalizar(String(r?.text ?? '').split('\f'));
  }
  return null;
}

function emProcessoFilho(buffer: Buffer): Promise<string[] | null> {
  const modulo = require.resolve('pdf-parse');
  const script = `
    const { PDFParse } = require(${JSON.stringify(modulo)});
    const partes = [];
    process.stdin.on('data', (c) => partes.push(c));
    process.stdin.on('end', async () => {
      try {
        const p = new PDFParse({ data: new Uint8Array(Buffer.concat(partes)) });
        const r = await p.getText({ first: ${MAX_PAGINAS} });
        process.stdout.write(JSON.stringify((r.pages || []).map((x) => x.text || '')));
        await p.destroy();
      } catch (e) { process.stdout.write('null'); }
    });`;
  return new Promise((resolve) => {
    const filho = execFile(process.execPath, ['-e', script], { timeout: 30_000, maxBuffer: 50 * 1024 * 1024 }, (erro, saida) => {
      if (erro) {
        logger.warn(`Texto do PDF não extraído (processo filho): ${erro.message}`);
        return resolve(null);
      }
      try {
        const lista = JSON.parse(String(saida || 'null'));
        resolve(Array.isArray(lista) ? normalizar(lista.map((x) => String(x ?? ''))) : null);
      } catch {
        resolve(null);
      }
    });
    filho.stdin?.end(buffer);
  });
}

/** Texto de cada página do PDF (índice 0 = página 1). null = sem texto legível. */
export async function paginasDoPdf(buffer: Buffer): Promise<string[] | null> {
  if (!buffer?.length || buffer.length > MAX_BYTES || !buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')) return null;
  if (!usarProcessoFilho) {
    try {
      return await noProcesso(buffer);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (!/dynamic import|experimental-vm-modules|fake worker/i.test(msg)) {
        logger.warn(`Texto do PDF não extraído: ${msg}`);
        return null;
      }
      usarProcessoFilho = true;
    }
  }
  return emProcessoFilho(buffer);
}

/** Texto do arquivo da peça (caminho físico), com cache pela impressão. */
export async function paginasDoArquivo(caminho: string | null, impressao: string | null): Promise<string[] | null> {
  const chave = impressao || caminho;
  if (!chave || !caminho) return null;
  if (cache.has(chave)) return cache.get(chave) ?? null;
  let buffer: Buffer;
  try {
    buffer = await fs.promises.readFile(caminho);
  } catch {
    return null;
  }
  const paginas = await paginasDoPdf(buffer);
  guardar(chave, paginas);
  return paginas;
}
