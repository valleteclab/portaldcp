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

/** Mês atual no formato 'YYYY-MM' em horário de Brasília (America/Sao_Paulo) */
export function mesAtualBrasil(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}

/**
 * Primeiro e último dia de um mês 'YYYY-MM' como 'YYYY-MM-DD'.
 * Nunca usar "-31" fixo: setembro/abril/junho/novembro têm 30 dias e o
 * Postgres rejeita "2026-09-31" — a listagem de requisições ficava vazia.
 */
export function intervaloDoMes(mes: string): { inicio: string; fim: string } {
  const [anoStr, mesStr] = String(mes || '').split('-');
  const ano = parseInt(anoStr, 10);
  const m = parseInt(mesStr, 10);
  const ultimoDia = new Date(Date.UTC(ano, m, 0)).getUTCDate(); // dia 0 do mês seguinte
  const mm = String(m).padStart(2, '0');
  return { inicio: `${ano}-${mm}-01`, fim: `${ano}-${mm}-${String(ultimoDia).padStart(2, '0')}` };
}
