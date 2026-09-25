import { CalendarioDiasUteis, calendarioDoOrgao } from './calendario';

/**
 * ============================================================================
 * DIAS ÚTEIS — função ÚNICA de contagem de prazos processuais
 * ============================================================================
 *
 * Lei 14.133/2021, art. 183: os prazos contam-se EXCLUINDO o dia do começo e
 * INCLUINDO o do vencimento; nos prazos em dias úteis "serão computados
 * somente os dias em que ocorrer expediente administrativo no órgão ou
 * entidade competente" (inciso III); o vencimento em dia sem expediente
 * prorroga-se para o primeiro dia útil seguinte (§2º). O fim do prazo é o
 * último instante (23:59:59.999) do dia de vencimento no horário de Brasília
 * (UTC-3 fixo — sem horário de verão desde 2019).
 *
 * Dia útil = segunda a sexta que não é feriado do CALENDÁRIO DO ÓRGÃO
 * (`calendario.ts` — nacionais, estaduais da UF, municipais e pontos
 * facultativos adotados pelo órgão; plano E7a). Toda função recebe o
 * calendário (`calendarioDoOrgao(licitacao.orgao_id)`); sem ele, valem só os
 * feriados nacionais.
 */

/** Brasília é UTC-3 fixo. */
export const DESLOCAMENTO_BRASILIA_MS = 3 * 3_600_000;
export const DIA_MS = 86_400_000;

export type { CalendarioDiasUteis };
export { calendarioDoOrgao };

/**
 * O dia (meia-noite UTC de uma data já no "relógio de parede" de Brasília) é
 * dia útil? Segunda a sexta, fora dos feriados do calendário.
 */
export function ehDiaUtil(diaUtc: Date, cal: CalendarioDiasUteis = calendarioDoOrgao(null)): boolean {
  const dow = diaUtc.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !cal.feriado(diaUtc);
}

/** Meia-noite (em ms, relógio de Brasília nos campos UTC) do dia de `d` em Brasília. */
export function diaEmBrasilia(d: Date): number {
  const local = new Date(d.getTime() - DESLOCAMENTO_BRASILIA_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

/** Último instante (23:59:59.999 em Brasília) do dia (meia-noite UTC do relógio de Brasília). */
function fimDoDia(diaUtcMs: number): Date {
  return new Date(diaUtcMs + DIA_MS - 1 + DESLOCAMENTO_BRASILIA_MS);
}

/**
 * Fim do prazo de N dias úteis contado a partir de `inicio` (art. 183): exclui
 * o dia do começo, conta os N dias úteis seguintes e vence às 23:59:59.999
 * (Brasília) do N-ésimo. Ex.: intimação na sexta 25/09/2026, 3 dias úteis →
 * segunda 28 (1), terça 29 (2), quarta 30 (3) → vence 30/09/2026 23:59:59.
 * Com feriado no caminho (ex.: 12/10), o dia não conta.
 */
export function fimDoPrazoEmDiasUteis(
  inicio: Date,
  dias: number,
  cal: CalendarioDiasUteis = calendarioDoOrgao(null),
): Date {
  const n = Math.max(0, Math.floor(Number(dias) || 0));
  let cursor = diaEmBrasilia(inicio);
  let contados = 0;
  while (contados < n) {
    cursor += DIA_MS;
    if (ehDiaUtil(new Date(cursor), cal)) contados++;
  }
  return fimDoDia(cursor);
}

/**
 * Último instante (23:59:59.999, Brasília) do N-ésimo dia útil ANTERIOR ao dia
 * (em Brasília) de `referencia`. O dia de referência não conta (art. 164).
 */
export function limiteDiasUteisAntes(
  referencia: Date,
  dias: number,
  cal: CalendarioDiasUteis = calendarioDoOrgao(null),
): Date {
  let cursor = diaEmBrasilia(referencia);
  let contados = 0;
  while (contados < dias) {
    cursor -= DIA_MS;
    if (ehDiaUtil(new Date(cursor), cal)) contados++;
  }
  return fimDoDia(cursor);
}

/**
 * Art. 183 §2º: vencimento em dia sem expediente (fim de semana, feriado,
 * ponto facultativo adotado) prorroga-se até o primeiro dia útil seguinte —
 * mesmo horário do vencimento original. Vencimento em dia útil: inalterado.
 */
export function prorrogarParaDiaUtil(vencimento: Date, cal: CalendarioDiasUteis = calendarioDoOrgao(null)): Date {
  let dia = diaEmBrasilia(vencimento);
  let deslocamento = 0;
  let guarda = 0;
  while (!ehDiaUtil(new Date(dia), cal) && guarda++ < 60) {
    dia += DIA_MS;
    deslocamento += DIA_MS;
  }
  return deslocamento ? new Date(vencimento.getTime() + deslocamento) : vencimento;
}

/** Primeiro instante (00:00, Brasília) do dia de `d`. */
export function inicioDoDia(d: Date): Date {
  return new Date(diaEmBrasilia(d) + DESLOCAMENTO_BRASILIA_MS);
}

/** Primeiro instante (00:00, Brasília) do dia seguinte ao de `d`. */
export function inicioDoDiaSeguinte(d: Date): Date {
  return new Date(diaEmBrasilia(d) + DIA_MS + DESLOCAMENTO_BRASILIA_MS);
}

/** Dias úteis (inteiros) entre o dia de `de` (excluído) e o dia de `ate` (incluído). */
export function diasUteisEntre(de: Date, ate: Date, cal: CalendarioDiasUteis = calendarioDoOrgao(null)): number {
  let cursor = diaEmBrasilia(de);
  const fim = diaEmBrasilia(ate);
  let n = 0;
  while (cursor < fim) {
    cursor += DIA_MS;
    if (ehDiaUtil(new Date(cursor), cal)) n++;
  }
  return n;
}
