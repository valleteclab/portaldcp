/**
 * Converte string numérica de CSV em número.
 * - Formato BR: 1.210,00 ou 4,90 (ponto = milhar, vírgula = decimal)
 * - Formato simples/ISO: 1210.0 ou 4.9 (só ponto como decimal, sem vírgula)
 *
 * Evita parseFloat('1.210,00'.replace(',','.')) === 1.21
 */
export function parseDecimalCsvBrOuIso(raw: string | number | undefined | null): number {
  if (raw === undefined || raw === null || raw === '') return NaN;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  let s = String(raw).trim();
  if (!s) return NaN;
  s = s.replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}
