/**
 * Arquivos de importação do SIGA (TCM-BA) — leiaute "Arquivos de Importação",
 * versão 113 (ago/2026). O SIGA não tem API: o órgão sobe o arquivo no SIGA
 * Captura. Aqui ficam só as regras comuns a todos os arquivos (tipos de campo,
 * header, trailler e limite de linhas); cada módulo monta o seu detalhe.
 *
 * Convenções do leiaute:
 * - N  (numérico): à direita, brancos à esquerda; vazio = só brancos.
 * - AN (alfanumérico): à esquerda, brancos à direita; proíbe ' ; e as
 *   sequências -- select insert update delete drop xp_.
 * - V  (valor): à direita, zeros à esquerda, sem separador, 2 casas (ou as
 *   casas que o campo pedir); negativo leva o sinal antes.
 * - D  (data): ddmmaaaa, ano >= 2000; vazio = brancos.
 */

export const SIGA_MAX_LINHAS = 5000;
const FIM_DE_LINHA = '\r\n';

const PROIBIDOS = /(--|select|insert|update|delete|drop|xp_)/gi;

export class ErroCampoSiga extends Error {}

/** Texto limpo para campo AN: sem caracteres proibidos nem quebras de linha. */
export function textoSiga(valor: unknown): string {
  return String(valor ?? '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/['’;]/g, ' ')
    .replace(PROIBIDOS, (m) => (m === '--' ? '-' : m.split('').join(' ')))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Alfanumérico: à esquerda, brancos à direita, cortado no tamanho. */
export function campoAN(valor: unknown, tamanho: number): string {
  return textoSiga(valor).slice(0, tamanho).padEnd(tamanho, ' ');
}

/** Numérico: à direita, brancos à esquerda. Vazio vira só brancos. */
export function campoN(valor: unknown, tamanho: number): string {
  if (valor === null || valor === undefined || valor === '') return ' '.repeat(tamanho);
  const texto = String(valor).trim();
  if (!/^-?\d+$/.test(texto)) throw new ErroCampoSiga(`Valor numérico inválido: "${texto}"`);
  if (texto.length > tamanho) throw new ErroCampoSiga(`"${texto}" excede ${tamanho} dígitos`);
  return texto.padStart(tamanho, ' ');
}

/**
 * Valor: zeros à esquerda, sem separador, com `casas` decimais (2 por padrão;
 * litros de combustível usam 3). Negativo leva o sinal na frente.
 */
export function campoV(valor: unknown, tamanho: number, casas = 2): string {
  const numero = valor === null || valor === undefined || valor === '' ? 0 : Number(valor);
  if (!Number.isFinite(numero)) throw new ErroCampoSiga(`Valor inválido: "${valor}"`);
  const inteiro = Math.round(Math.abs(numero) * 10 ** casas);
  const digitos = String(inteiro);
  const largura = numero < 0 ? tamanho - 1 : tamanho;
  if (digitos.length > largura) throw new ErroCampoSiga(`Valor ${numero} excede ${tamanho} posições`);
  return (numero < 0 ? '-' : '') + digitos.padStart(largura, '0');
}

/** Data ddmmaaaa. Aceita Date, 'YYYY-MM-DD' ou 'YYYY-MM-DDTHH:mm...'. Vazio vira brancos. */
export function campoD(valor: Date | string | null | undefined): string {
  if (!valor) return ' '.repeat(8);
  const iso =
    valor instanceof Date
      ? `${valor.getFullYear()}-${String(valor.getMonth() + 1).padStart(2, '0')}-${String(valor.getDate()).padStart(2, '0')}`
      : String(valor).slice(0, 10);
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) throw new ErroCampoSiga(`Data inválida: "${valor}"`);
  if (Number(m[1]) < 2000) throw new ErroCampoSiga(`Data anterior a 2000 não é aceita pelo SIGA: ${m[3]}/${m[2]}/${m[1]}`);
  return `${m[3]}${m[2]}${m[1]}`;
}

/** Só os dígitos do nº de empenho, sem zeros à esquerda (o SIGA rejeita). "0577/2025" → "577". */
export function numeroEmpenhoSiga(referencia: string | null | undefined): string {
  const primeiro = String(referencia ?? '').trim().split(/[\/\-\s]/)[0] ?? '';
  const digitos = primeiro.replace(/\D/g, '').replace(/^0+/, '');
  return digitos;
}

export interface CabecalhoSiga {
  /** Identificação do arquivo, ex.: "Patrimonio", "Frota", "Combustivel". */
  identificacao: string;
  /** cd_Unidade: código do jurisdicionado no TCM (até 4 dígitos). */
  codigoUnidade: string;
  /** nm_Unidade. */
  nomeUnidade: string;
  /** Momento da geração (horário de Brasília). */
  geradoEm?: Date;
}

/** Data/hora de Brasília (UTC-3), independente do fuso do servidor. */
function agoraBrasilia(base = new Date()) {
  const b = new Date(base.getTime() - 3 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return {
    data: `${p(b.getUTCDate())}/${p(b.getUTCMonth() + 1)}/${b.getUTCFullYear()}`,
    hora: `${p(b.getUTCHours())}:${p(b.getUTCMinutes())}:${p(b.getUTCSeconds())}`,
  };
}

/** Header (162 posições). Sequencial é sempre 1. */
export function headerSiga(c: CabecalhoSiga): string {
  const { data, hora } = agoraBrasilia(c.geradoEm);
  return (
    '0' +
    campoAN(c.identificacao, 15) +
    campoAN(data, 10) +
    campoAN(hora, 8) +
    campoN(1, 4) +
    campoAN('SIGA', 10) +
    campoN(c.codigoUnidade, 4) +
    campoAN(c.nomeUnidade, 100) +
    campoN(1, 10)
  );
}

/** Trailler (11 posições). */
export function traillerSiga(sequencial: number): string {
  return '9' + campoN(sequencial, 10);
}

export interface ArquivoSiga {
  nome: string;
  conteudo: string;
  /** Bytes em Latin-1, prontos para download. */
  buffer: Buffer;
  registros: number;
}

/**
 * Monta um ou mais arquivos (o SIGA aceita até 5.000 linhas por arquivo,
 * contando header e trailler). `detalhe(seq)` recebe o sequencial da linha
 * e devolve o registro já com o nu_SequencialRegistro no fim.
 */
export function montarArquivosSiga<T>(
  cabecalho: CabecalhoSiga,
  itens: T[],
  detalhe: (item: T, sequencial: number) => string,
  nomeBase = cabecalho.identificacao,
): ArquivoSiga[] {
  const porArquivo = SIGA_MAX_LINHAS - 2;
  const partes: T[][] = [];
  for (let i = 0; i < itens.length; i += porArquivo) partes.push(itens.slice(i, i + porArquivo));
  if (!partes.length) partes.push([]);
  return partes.map((parte, indice) => {
    const linhas = [headerSiga(cabecalho)];
    parte.forEach((item, i) => linhas.push(detalhe(item, i + 2)));
    linhas.push(traillerSiga(parte.length + 2));
    const conteudo = linhas.join(FIM_DE_LINHA) + FIM_DE_LINHA;
    const sufixo = partes.length > 1 ? `_parte${indice + 1}` : '';
    return {
      nome: `${nomeBase}${sufixo}.txt`,
      conteudo,
      buffer: Buffer.from(conteudo, 'latin1'),
      registros: parte.length,
    };
  });
}
