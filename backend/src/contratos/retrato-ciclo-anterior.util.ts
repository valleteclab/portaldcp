/**
 * Retrato congelado de medição de CICLO ANTERIOR (caso 050/2023 BRFIBRA, 09/10/2026).
 *
 * Toda aprovação refaz o retrato (execucao_financeira / execucao_fiscal) de
 * todas as medições aprovadas do contrato. Depois de uma renovação de ciclo,
 * esse recálculo trata a medição do ciclo antigo como se fosse do novo: usa a
 * vigência nova e não enxerga o consumo anterior ao sistema daquele ciclo (o
 * aditivo zera a base). A medição de março aparecia como "1 de 12 meses do
 * ciclo 2026/2027".
 *
 * Regra: medição cujo período começa antes da renovação de ciclo e que já tem
 * retrato fica com o retrato que tem — é passado, não muda com aprovações do
 * ciclo novo. Sem retrato ainda (primeira vez) o recálculo grava normalmente.
 */
export function retratoDeCicloAnteriorCongelado(
  periodoInicio: Date | string | null | undefined,
  dataRenovacaoCiclo: Date | string | null | undefined,
  temRetrato: boolean,
): boolean {
  if (!temRetrato) return false;
  const inicio = diaIso(periodoInicio);
  const corte = diaIso(dataRenovacaoCiclo);
  if (!inicio || !corte) return false;
  return inicio < corte;
}

/** "AAAA-MM-DD" sem passar por fuso (coluna date chega como texto; Date vira o dia UTC). */
function diaIso(v: Date | string | null | undefined): string | null {
  if (!v) return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10);
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}
