/** Retorna o último instante do mês atual em horário de Brasília (America/Sao_Paulo) */
export function fimDoMesBrasil(): Date {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const y = parseInt(parts.year!, 10);
  const m = parseInt(parts.month!, 10); // 1..12
  // 31/03 23:59:59.999 BRT = 01/04 02:59:59.999 UTC
  return new Date(Date.UTC(y, m, 1, 2, 59, 59, 999));
}
