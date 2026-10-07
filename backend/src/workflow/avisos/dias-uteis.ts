/**
 * Dias úteis (seg-sex) para o aviso de véspera de prazo. Puro, sem fuso —
 * quem chama decide o "hoje" (normalmente `new Date()` no horário do
 * servidor, que já roda em America/Sao_Paulo).
 */

export function ehDiaUtil(data: Date): boolean {
  const dia = data.getDay();
  return dia !== 0 && dia !== 6;
}

/** Primeiro dia útil estritamente depois de `base` (não conta hoje). */
export function proximoDiaUtil(base: Date): Date {
  const data = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  do {
    data.setDate(data.getDate() + 1);
  } while (!ehDiaUtil(data));
  return data;
}

/** Mesma data de calendário (ignora hora), para comparar com `prazo_em`. */
export function mesmaData(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
