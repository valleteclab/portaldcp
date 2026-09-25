import { createHash } from 'crypto';

/**
 * ============================================================================
 * SORTEIO AUDITÁVEL (Lei 14.133/2021 art. 60; IN SEGES 73/2022 art. 28 §2º —
 * "persistindo o empate, ... sorteio em ato público")
 * ============================================================================
 *
 * Módulo PURO e compartilhado (desempate do art. 60 e desempate ME/EPP da
 * LC 123 usam a mesma função). Nada de `Math.random`: o resultado é função
 * DETERMINÍSTICA de uma entrada pública, então qualquer participante refaz a
 * conta e confere o resultado (auditável), e ninguém escolhe o resultado
 * depois de conhecer a entrada — a entrada inclui o instante do ATO, que o
 * servidor registra no momento em que o agente pratica o sorteio (o ato não
 * pode ser desfeito nem repetido).
 *
 * ALGORITMO (versão `SHA256-FY-v1`):
 *  1. entrada  = texto canônico (ver `entradaDoSorteio`): licitação, unidade,
 *                candidatos em ordem crescente e instante do ato (ISO-8601 UTC);
 *  2. semente  = SHA-256(entrada) em hexadecimal;
 *  3. fluxo    = blocos SHA-256(semente + ":" + k), k = 0, 1, 2… lidos em
 *                inteiros de 32 bits (big-endian);
 *  4. ordem    = Fisher–Yates sobre os candidatos em ordem crescente: para
 *                i = n−1 … 1, j = inteiro uniforme em [0, i] por AMOSTRAGEM
 *                COM REJEIÇÃO (descarta r ≥ ⌊2³²/(i+1)⌋·(i+1), sem viés de
 *                módulo) e troca as posições i e j.
 * O 1º da ordem é o vencedor do sorteio; a ordem inteira classifica o grupo.
 */

export const ALGORITMO_SORTEIO = 'SHA256-FY-v1';

export const DESCRICAO_ALGORITMO_SORTEIO =
  'semente = SHA-256(entrada); fluxo = SHA-256(semente + ":" + k) em inteiros de 32 bits; ' +
  'Fisher–Yates sobre os candidatos em ordem crescente com amostragem por rejeição (sem viés).';

export interface EntradaSorteio {
  licitacaoId: string;
  unidadeId: string;
  candidatos: string[];
  /** Instante do ato público (registrado ANTES do sorteio). */
  atoEm: Date | string;
  /** Contexto opcional (ex.: 'ART60', 'LC123'), entra na entrada canônica. */
  contexto?: string;
}

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

const candidatosCanonicos = (candidatos: string[]) => {
  const unicos = [...new Set(candidatos.map((c) => String(c)))];
  if (unicos.length !== candidatos.length) throw new Error('Candidato repetido no sorteio');
  return unicos.sort();
};

/** Texto canônico da entrada do sorteio (público — vai no evento e na ata). */
export function entradaDoSorteio(e: EntradaSorteio): string {
  const ato = new Date(e.atoEm);
  if (Number.isNaN(ato.getTime())) throw new Error('Instante do ato do sorteio inválido');
  return [
    ALGORITMO_SORTEIO,
    e.contexto ?? 'ART60',
    `licitacao=${e.licitacaoId}`,
    `unidade=${e.unidadeId}`,
    `candidatos=${candidatosCanonicos(e.candidatos).join(',')}`,
    `ato=${ato.toISOString()}`,
  ].join('|');
}

export function sementeDoSorteio(seedInput: string): string {
  return sha256(String(seedInput));
}

/** Gerador determinístico de inteiros de 32 bits a partir da semente. */
function fluxo(semente: string): () => number {
  let bloco = 0;
  let buf = Buffer.alloc(0);
  let pos = 0;
  return () => {
    if (pos + 4 > buf.length) {
      buf = createHash('sha256').update(`${semente}:${bloco++}`, 'utf8').digest();
      pos = 0;
    }
    const v = buf.readUInt32BE(pos);
    pos += 4;
    return v;
  };
}

const DOIS_32 = 2 ** 32;

/** Inteiro uniforme em [0, max] (amostragem com rejeição). */
function uniforme(prox: () => number, max: number): number {
  const faixa = max + 1;
  const limite = Math.floor(DOIS_32 / faixa) * faixa;
  let r = prox();
  while (r >= limite) r = prox();
  return r % faixa;
}

/**
 * SORTEIO — assinatura estável: `sortear(seedInput, candidatos) → ordem`.
 * `seedInput` é a entrada pública (texto; use `entradaDoSorteio`); a ordem
 * devolvida é a classificação sorteada (1º = vencedor). Mesma entrada e
 * mesmos candidatos → mesma ordem, independentemente da ordem de chegada.
 */
export function sortear(seedInput: string, candidatos: string[]): string[] {
  const base = candidatosCanonicos(candidatos);
  if (base.length <= 1) return base;
  const prox = fluxo(sementeDoSorteio(seedInput));
  const ordem = [...base];
  for (let i = ordem.length - 1; i > 0; i--) {
    const j = uniforme(prox, i);
    [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
  }
  return ordem;
}

export interface ResultadoSorteio {
  algoritmo: string;
  entrada: string;
  semente: string;
  candidatos: string[];
  ordem: string[];
}

/** Sorteio com o registro completo (entrada, semente, algoritmo) para a ata/evento. */
export function sorteioAuditavel(e: EntradaSorteio): ResultadoSorteio {
  const entrada = entradaDoSorteio(e);
  return {
    algoritmo: ALGORITMO_SORTEIO,
    entrada,
    semente: sementeDoSorteio(entrada),
    candidatos: candidatosCanonicos(e.candidatos),
    ordem: sortear(entrada, e.candidatos),
  };
}

/** Confere um sorteio registrado (qualquer participante pode refazer a conta). */
export function conferirSorteio(r: { entrada: string; semente: string; candidatos: string[]; ordem: string[] }): boolean {
  if (sementeDoSorteio(r.entrada) !== r.semente) return false;
  const refeita = sortear(r.entrada, r.candidatos);
  return refeita.length === r.ordem.length && refeita.every((c, i) => c === r.ordem[i]);
}
