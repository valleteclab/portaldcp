/**
 * Data/hora de assinatura para gravar no Postgres em coluna `timestamp`
 * (sem fuso). Precisa ir como TEXTO: passando um Date, o TypeORM converte para
 * UTC e a assinatura fica 3 horas adiantada — o mesmo problema que o padrão da
 * coluna já resolveu para assinaturas novas.
 */

const DOIS = (n: number) => String(n).padStart(2, '0');

/** Formata um instante no fuso de Brasília como 'YYYY-MM-DD HH:MM:SS'. */
function emBrasilia(data: Date): string {
  // sv-SE já sai como 'YYYY-MM-DD HH:MM:SS'
  return data.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

/**
 * Aceita o que a tela manda ('2026-09-11T10:08', com ou sem segundos) e
 * devolve o literal a gravar. Quando vier com fuso explícito (Z ou ±HH:MM),
 * converte para o horário de Brasília. Devolve null se a data for inválida.
 */
export function literalDataAssinatura(valor: string | Date): string | null {
  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : emBrasilia(valor);
  }
  const texto = String(valor ?? '').trim();
  if (!texto) return null;

  const temFuso = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(texto);
  if (!temFuso) {
    const m = texto.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/,
    );
    if (m) {
      const [, ano, mes, dia, hora, min, seg] = m;
      // valida o calendário (ex.: 31/02 não passa)
      const teste = new Date(
        Date.UTC(+ano, +mes - 1, +dia, +hora, +min, +(seg || 0)),
      );
      if (
        teste.getUTCFullYear() !== +ano ||
        teste.getUTCMonth() !== +mes - 1 ||
        teste.getUTCDate() !== +dia ||
        +hora > 23 ||
        +min > 59
      ) {
        return null;
      }
      return `${ano}-${mes}-${dia} ${hora}:${min}:${DOIS(+(seg || 0))}`;
    }
    // só a data, sem hora: meio-dia, para não virar o dia em nenhum fuso
    const somenteData = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (somenteData) return `${texto} 12:00:00`;
  }

  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? null : emBrasilia(data);
}
