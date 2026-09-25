import { createHmac, timingSafeEqual } from 'crypto';
import { existsSync } from 'fs';
import { isAbsolute, join, relative, resolve, sep } from 'path';

/**
 * ARQUIVOS ENVIADOS (uploads) — classificação por sensibilidade, resolução de
 * caminho físico e URL assinada.
 *
 * O "caminho lógico" de um arquivo é `tipo/[subpastas/]nome` (ex.:
 * `documentos/1700000000000-123.pdf`, `medicoes/<medicaoId>/foto.jpg`). É o
 * que aparece nas URLs gravadas no banco (`/api/uploads/<lógico>`,
 * `/uploads/<lógico>` ou só `<lógico>`), e continua valendo: a URL é um
 * IDENTIFICADOR, o lugar físico é decidido aqui.
 *
 *  - PÚBLICO (lista explícita): servido sem login (logos, fotos de patrimônio,
 *    anexos do edital enviados no cadastro da licitação).
 *  - SENSÍVEL (todo o resto — negar por padrão): só com login + checagem de
 *    dono (AcessoArquivosService) ou com URL ASSINADA de curta duração, que a
 *    API entrega a quem já pôde ver o registro (ArquivosUrlInterceptor).
 *
 * Diretórios:
 *  - público/legado: UPLOAD_DIR (padrão <cwd>/uploads) — onde tudo foi gravado
 *    até aqui e onde os módulos ainda gravam as pastas sensíveis antigas;
 *  - privado: UPLOAD_PRIVATE_DIR; sem ela, `<UPLOAD_DIR>/.privado` quando
 *    UPLOAD_DIR está definida (fica no MESMO volume persistente do Docker e
 *    nunca é servida — pasta com ponto não é tipo válido) ou
 *    `<cwd>/uploads-privado` em desenvolvimento.
 * A leitura procura primeiro no privado e cai para o legado (transição).
 */

// ---------------------------------------------------------------------------
// Diretórios
// ---------------------------------------------------------------------------

export function diretorioUploads(): string {
  return resolve(process.env.UPLOAD_DIR || join(process.cwd(), 'uploads'));
}

export function diretorioPrivado(): string {
  if (process.env.UPLOAD_PRIVATE_DIR) return resolve(process.env.UPLOAD_PRIVATE_DIR);
  if (process.env.UPLOAD_DIR) return resolve(process.env.UPLOAD_DIR, '.privado');
  return resolve(process.cwd(), 'uploads-privado');
}

/** Bases de leitura, na ordem: privado, `.privado` do volume (se diferente), legado. */
export function basesDeLeitura(): string[] {
  const bases = [diretorioPrivado(), resolve(diretorioUploads(), '.privado'), diretorioUploads()];
  return bases.filter((b, i) => bases.indexOf(b) === i);
}

// ---------------------------------------------------------------------------
// Classificação
// ---------------------------------------------------------------------------

/** Pastas servidas SEM login (estático e GET). Qualquer outra é sensível. */
export const TIPOS_PUBLICOS: readonly string[] = [
  'logos', // logo do órgão (cabeçalhos, páginas públicas)
  'patrimonio', // fotos de bens públicos (páginas /p/:id, inventário por token)
  'licitacao', // anexos do edital enviados na aba Documentos do cadastro da licitação
  'leilao-bens', // fotos dos bens leiloados (públicas por natureza — art. 31 §2º; plano E7c)
];

/**
 * Pastas SENSÍVEIS conhecidas (dados pessoais/fiscais, atos internos). Usada
 * para reconhecer caminhos RELATIVOS sem prefixo (`contratos/x/termo.pdf`) nas
 * respostas da API; a regra de acesso vale para QUALQUER pasta fora de
 * TIPOS_PUBLICOS.
 */
export const TIPOS_SENSIVEIS_CONHECIDOS: readonly string[] = [
  'documentos', // registro cadastral do fornecedor (upload genérico) + docs de licitação
  'fiscal-estadual', // registro cadastral do fornecedor
  'geral',
  'notas-fiscais',
  'medicoes',
  'medicao-chat',
  'boletins',
  'contratos',
  'documentos_assinados',
  'documentos_assinatura_avulsos',
  'ordens',
  'dossie_temp',
  'dossie_anexos',
  'migracao',
  'fase-interna',
  'pesquisa-precos',
  'impugnacoes',
  'esclarecimentos',
  'desclassificacoes',
  'licitacoes',
  'atas', // termo da ARP (órgão gerenciador + fornecedor da ata)
  'resultados', // termo de adjudicação/homologação (órgão da licitação; público depois da homologação)
  'leilao', // termo de arrematação (órgão da licitação + arrematante) — E7c
  'concurso', // termo de premiação e cessão de direitos (órgão + vencedor) — E7c
  'dialogo-competitivo', // atas, gravações e soluções do diálogo (sigilo entre licitantes — art. 32 §1º IV) — E7c
];

/** Pastas do REGISTRO CADASTRAL do fornecedor (upload genérico da tela de cadastro). */
export const TIPOS_REGISTRO_FORNECEDOR: readonly string[] = ['documentos', 'fiscal-estadual'];

/** Segmento de caminho: sem barra, barra invertida, byte nulo/controle; não começa com ponto. */
const RE_SEGMENTO = /^[^./\\\u0000-\u001f][^/\\\u0000-\u001f]{0,254}$/;

/** Tipo (pasta de 1º nível) válido: letras, números, `_` e `-`; nunca começa com ponto. */
export function tipoValido(tipo: string | null | undefined): tipo is string {
  return !!tipo && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(tipo);
}

/** Sanitiza o `tipo` enviado no upload genérico (mesma regra histórica do Multer). */
export function sanitizarTipo(tipo: string | null | undefined): string {
  const t = String(tipo || 'geral').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
  return tipoValido(t) ? t : 'geral';
}

export function tipoPublico(tipo: string): boolean {
  return TIPOS_PUBLICOS.includes(tipo);
}

export type Sensibilidade = 'PUBLICO' | 'SENSIVEL';

export function classificarTipo(tipo: string): Sensibilidade {
  return tipoPublico(tipo) ? 'PUBLICO' : 'SENSIVEL';
}

// ---------------------------------------------------------------------------
// Caminho lógico
// ---------------------------------------------------------------------------

export interface CaminhoLogico {
  /** `tipo/sub/nome` normalizado */
  rel: string;
  tipo: string;
  /** subpastas entre o tipo e o nome (pode ser vazio) */
  subpastas: string[];
  nome: string;
}

/**
 * Valida e normaliza um caminho lógico a partir de segmentos (rota) ou de uma
 * string `a/b/c`. Recusa (null) `..`, `.`, segmentos vazios, barra invertida,
 * byte nulo, segmento começando com ponto e profundidade > 4.
 */
export function caminhoLogico(entrada: string | string[]): CaminhoLogico | null {
  const partes = Array.isArray(entrada) ? entrada : String(entrada ?? '').split('/');
  if (partes.length < 2 || partes.length > 4) return null;
  for (const p of partes) {
    if (typeof p !== 'string' || !RE_SEGMENTO.test(p)) return null;
  }
  const [tipo, ...resto] = partes;
  if (!tipoValido(tipo)) return null;
  const nome = resto[resto.length - 1];
  return { rel: partes.join('/'), tipo, subpastas: resto.slice(0, -1), nome };
}

const RE_URL_UPLOAD = /^(?:https?:\/\/[^/?#]+)?(?:\/api)?\/uploads\/([^?#]+)(?:\?[^#]*)?$/;

/**
 * Extrai o caminho lógico de uma URL/caminho gravado no banco:
 * `/api/uploads/x/y.pdf`, `/uploads/x/y.pdf`, `http://host/api/uploads/...`,
 * `x/y.pdf` (relativo) ou caminho absoluto em disco dentro de uma das bases.
 * Parâmetros de query (URL assinada) são ignorados.
 */
export function caminhoLogicoDeUrl(url: string | null | undefined): CaminhoLogico | null {
  if (!url || typeof url !== 'string') return null;
  const s = url.trim();
  const m = s.match(RE_URL_UPLOAD);
  if (m) return caminhoLogico(decodificar(m[1]));
  // caminho absoluto em disco (ex.: notas fiscais gravam o caminho completo)
  if (isAbsolute(s) || /^[A-Za-z]:[\\/]/.test(s)) {
    const abs = resolve(s);
    for (const base of basesDeLeitura()) {
      const r = relative(base, abs);
      if (r && !r.startsWith('..') && !isAbsolute(r)) return caminhoLogico(r.split(sep).join('/'));
    }
    return null;
  }
  const semQuery = s.split(/[?#]/)[0].replace(/^\.?\/+/, '').replace(/^uploads\//, '');
  return caminhoLogico(semQuery);
}

function decodificar(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * CONTENÇÃO: junta `base` + `rel` e garante que o resultado continua DENTRO de
 * `base` (nunca sai por `..`, link absoluto ou letra de unidade). Null se sair.
 */
export function caminhoContido(base: string, rel: string): string | null {
  const b = resolve(base);
  const alvo = resolve(b, rel);
  const r = relative(b, alvo);
  if (!r || r.startsWith('..') || isAbsolute(r)) return null;
  return alvo;
}

/** Caminho físico onde um arquivo NOVO deve ser gravado (privado para sensível). */
export function diretorioDeGravacao(tipo: string): string {
  const t = sanitizarTipo(tipo);
  const base = tipoPublico(t) ? diretorioUploads() : diretorioPrivado();
  return caminhoContido(base, t) ?? join(base, 'geral');
}

/**
 * Caminho físico de um arquivo existente: privado primeiro, depois o legado
 * (pasta pública antiga) — período de transição. Arquivo PÚBLICO só é
 * procurado no diretório público. Null se não existe ou se o caminho é inválido.
 */
export function resolverArquivo(c: CaminhoLogico | null): string | null {
  if (!c) return null;
  const bases = tipoPublico(c.tipo) ? [diretorioUploads()] : basesDeLeitura();
  const rels = [c.rel];
  // Legado: o upload genérico gravava em `geral/` quando o campo `tipo` chegava
  // depois do arquivo no multipart — a URL dizia `documentos/x`, o disco `geral/x`.
  // Só entre pastas SENSÍVEIS (nunca expõe `geral/` por uma pasta pública).
  if (!tipoPublico(c.tipo) && c.subpastas.length === 0 && c.tipo !== 'geral') rels.push(`geral/${c.nome}`);
  for (const rel of rels) {
    for (const base of bases) {
      const p = caminhoContido(base, rel);
      if (p && existsSync(p)) return p;
    }
  }
  return null;
}

/** Atalho: URL/caminho gravado no banco → caminho físico (ou null). */
export function resolverArquivoDeUrl(url: string | null | undefined): string | null {
  return resolverArquivo(caminhoLogicoDeUrl(url));
}

// ---------------------------------------------------------------------------
// URL assinada (curta duração)
// ---------------------------------------------------------------------------

/** Janela de validade: a assinatura vale do início da janela atual até +2 janelas (4h–8h). */
const JANELA_MS = 4 * 60 * 60 * 1000;

function segredo(): string | null {
  return process.env.ARQUIVOS_URL_SECRET || process.env.JWT_SECRET || null;
}

function hmac(rel: string, expira: number, chave: string): string {
  return createHmac('sha256', chave).update(`arquivo:v1:${rel}:${expira}`).digest('base64url').slice(0, 43);
}

/** Expiração estável dentro da janela (mesma URL em re-renderizações → cache do navegador funciona). */
export function expiracaoPadrao(agora = Date.now()): number {
  return Math.floor((Math.floor(agora / JANELA_MS) + 2) * JANELA_MS / 1000);
}

export function assinarCaminho(rel: string, agora = Date.now()): { expira: number; assinatura: string } | null {
  const chave = segredo();
  if (!chave) return null;
  const expira = expiracaoPadrao(agora);
  return { expira, assinatura: hmac(rel, expira, chave) };
}

export function verificarAssinatura(
  rel: string,
  expira: string | number | undefined | null,
  assinatura: string | undefined | null,
  agora = Date.now(),
): boolean {
  const chave = segredo();
  if (!chave || !assinatura || expira === undefined || expira === null) return false;
  const exp = Number(expira);
  if (!Number.isInteger(exp) || exp * 1000 < agora) return false;
  // não aceita expiração além do que o servidor emitiria (assinatura forjada com prazo longo)
  if (exp > expiracaoPadrao(agora)) return false;
  const esperado = Buffer.from(hmac(rel, exp, chave));
  const recebido = Buffer.from(String(assinatura));
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

const RE_PARAMS_ASSINATURA = /([?&])(?:expira|assinatura)=[^&#]*/g;

/** Remove `expira`/`assinatura` de uma URL (mantém os demais parâmetros). */
export function removerAssinatura(url: string): string {
  if (!url.includes('assinatura=') && !url.includes('expira=')) return url;
  const [semHash, hash] = url.split('#');
  let out = semHash.replace(RE_PARAMS_ASSINATURA, '$1').replace(/[?&]+$/, '').replace(/\?&+/, '?').replace(/&{2,}/g, '&');
  if (out.endsWith('?')) out = out.slice(0, -1);
  return hash !== undefined ? `${out}#${hash}` : out;
}

const RE_RELATIVO_SENSIVEL = new RegExp(
  `^(?:${TIPOS_SENSIVEIS_CONHECIDOS.map((t) => t.replace(/[-]/g, '\\-')).join('|')})\\/[^\\s?#]+\\.[A-Za-z0-9]{2,5}(?:\\?[^#\\s]*)?$`,
);

/** A string é uma referência a arquivo SENSÍVEL que deve sair assinada? Devolve o lógico. */
export function referenciaSensivel(valor: string): CaminhoLogico | null {
  if (valor.length < 5 || valor.length > 600 || valor.indexOf('/') < 0) return null;
  const temPrefixo = RE_URL_UPLOAD.test(valor);
  if (!temPrefixo && !RE_RELATIVO_SENSIVEL.test(valor)) return null;
  const c = caminhoLogicoDeUrl(valor);
  if (!c || tipoPublico(c.tipo)) return null;
  return c;
}

/** Assina UMA string, se for referência sensível (senão devolve igual). */
export function assinarReferencia(valor: string, agora = Date.now()): string {
  const c = referenciaSensivel(valor);
  if (!c) return valor;
  const a = assinarCaminho(c.rel, agora);
  if (!a) return valor;
  const base = removerAssinatura(valor);
  return `${base}${base.includes('?') ? '&' : '?'}expira=${a.expira}&assinatura=${a.assinatura}`;
}

/** Tira a assinatura de UMA string que referencia upload (entrada da API). */
export function limparReferencia(valor: string): string {
  if (valor.length > 600 || !valor.includes('assinatura=')) return valor;
  if (!RE_URL_UPLOAD.test(valor) && !RE_RELATIVO_SENSIVEL.test(valor)) return valor;
  return removerAssinatura(valor);
}

/**
 * Percorre um valor de resposta/entrada aplicando `f` às strings — SEM mutar o
 * original (copia só o caminho que mudou; objetos intactos voltam por
 * referência). Não desce em Buffer, Date, streams ou objetos com toJSON.
 */
export function transformarStrings(valor: unknown, f: (s: string) => string, profundidade = 0, vistos = new WeakSet<object>()): unknown {
  if (typeof valor === 'string') return f(valor);
  if (!valor || typeof valor !== 'object' || profundidade > 15) return valor;
  if (vistos.has(valor as object)) return valor;
  if (Buffer.isBuffer(valor) || valor instanceof Date || ArrayBuffer.isView(valor)) return valor;
  if (typeof (valor as any).pipe === 'function' || typeof (valor as any).getStream === 'function') return valor;
  if (typeof (valor as any).toJSON === 'function') return valor;
  vistos.add(valor as object);
  if (Array.isArray(valor)) {
    let copia: unknown[] | null = null;
    for (let i = 0; i < valor.length; i++) {
      const novo = transformarStrings(valor[i], f, profundidade + 1, vistos);
      if (novo !== valor[i]) {
        copia = copia ?? valor.slice();
        copia[i] = novo;
      }
    }
    return copia ?? valor;
  }
  let copia: Record<string, unknown> | null = null;
  for (const k of Object.keys(valor as object)) {
    const atual = (valor as any)[k];
    const novo = transformarStrings(atual, f, profundidade + 1, vistos);
    if (novo !== atual) {
      copia = copia ?? { ...(valor as Record<string, unknown>) };
      copia[k] = novo;
    }
  }
  return copia ?? valor;
}
