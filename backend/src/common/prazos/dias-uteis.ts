/**
 * ============================================================================
 * DIAS ÚTEIS — função ÚNICA de contagem de prazos processuais
 * ============================================================================
 *
 * Lei 14.133/2021, art. 183: os prazos contam-se em dias úteis quando assim
 * fixados, EXCLUINDO o dia do começo e INCLUINDO o do vencimento; o prazo só
 * começa e vence em dia útil. O fim do prazo é o último instante (23:59:59.999)
 * do dia de vencimento no horário de Brasília (UTC-3 fixo — sem horário de
 * verão desde 2019).
 *
 * Dia útil = segunda a sexta. FERIADOS ainda não são considerados — o
 * calendário (nacionais + municipais por órgão) é a E7 item 2; quando existir,
 * basta trocar `ehDiaUtil` AQUI e todos os prazos (impugnação art. 164,
 * recursos art. 165, …) passam a considerá-los.
 */

/** Brasília é UTC-3 fixo. */
export const DESLOCAMENTO_BRASILIA_MS = 3 * 3_600_000;
export const DIA_MS = 86_400_000;

/**
 * O dia (meia-noite UTC de uma data já no "relógio de parede" de Brasília) é
 * dia útil? Segunda a sexta. Feriados: E7 item 2 (calendário).
 */
export function ehDiaUtil(diaUtc: Date): boolean {
  const dow = diaUtc.getUTCDay();
  return dow !== 0 && dow !== 6;
}

/** Meia-noite (em ms, relógio de Brasília nos campos UTC) do dia de `d` em Brasília. */
function diaEmBrasilia(d: Date): number {
  const local = new Date(d.getTime() - DESLOCAMENTO_BRASILIA_MS);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

/**
 * Fim do prazo de N dias úteis contado a partir de `inicio` (art. 183): exclui
 * o dia do começo, conta os N dias úteis seguintes e vence às 23:59:59.999
 * (Brasília) do N-ésimo. Ex.: intimação na sexta 25/09/2026, 3 dias úteis →
 * segunda 28 (1), terça 29 (2), quarta 30 (3) → vence 30/09/2026 23:59:59.
 */
export function fimDoPrazoEmDiasUteis(inicio: Date, dias: number): Date {
  const n = Math.max(0, Math.floor(Number(dias) || 0));
  let cursor = diaEmBrasilia(inicio);
  let contados = 0;
  while (contados < n) {
    cursor += DIA_MS;
    if (ehDiaUtil(new Date(cursor))) contados++;
  }
  return new Date(cursor + DIA_MS - 1 + DESLOCAMENTO_BRASILIA_MS);
}

/**
 * Último instante (23:59:59.999, Brasília) do N-ésimo dia útil ANTERIOR ao dia
 * (em Brasília) de `referencia`. O dia de referência não conta (art. 164).
 */
export function limiteDiasUteisAntes(referencia: Date, dias: number): Date {
  let cursor = diaEmBrasilia(referencia);
  let contados = 0;
  while (contados < dias) {
    cursor -= DIA_MS;
    if (ehDiaUtil(new Date(cursor))) contados++;
  }
  return new Date(cursor + DIA_MS - 1 + DESLOCAMENTO_BRASILIA_MS);
}
