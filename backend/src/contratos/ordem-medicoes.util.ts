/**
 * Renumera as medições de um contrato pela competência.
 *
 * Quando o suporte lança medições retroativas (execução paga só com OS), elas
 * entram com o próximo número livre e a ordem do boletim deixa de seguir o
 * calendário: a 1ª medição passa a ser a mais recente. Isso confunde a leitura
 * e o acumulado, que é somado na ordem do número.
 */

export interface MedicaoParaOrdenar {
  id: string;
  numero_medicao: number;
  periodo_inicio?: string | Date | null;
  competencia?: string | null;
  created_at?: string | Date | null;
}

export interface NovaPosicao {
  id: string;
  numero_atual: number;
  numero_novo: number;
}

const MESES: Record<string, number> = {
  JANEIRO: 1, FEVEREIRO: 2, MARCO: 3, ABRIL: 4, MAIO: 5, JUNHO: 6,
  JULHO: 7, AGOSTO: 8, SETEMBRO: 9, OUTUBRO: 10, NOVEMBRO: 11, DEZEMBRO: 12,
};

const semAcento = (t: string) =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

/** Chave 'AAAAMM' da competência: período de início, senão o texto da competência. */
export function chaveCompetencia(m: MedicaoParaOrdenar): string {
  const inicio = m.periodo_inicio;
  if (inicio) {
    const texto = inicio instanceof Date ? inicio.toISOString() : String(inicio);
    const iso = texto.match(/^(\d{4})-(\d{2})/);
    if (iso) return `${iso[1]}${iso[2]}`;
  }
  const comp = semAcento(String(m.competencia || '').trim());
  const porNome = comp.match(/([A-Z]+)\s*\/\s*(\d{4})/);
  if (porNome && MESES[porNome[1]]) {
    return `${porNome[2]}${String(MESES[porNome[1]]).padStart(2, '0')}`;
  }
  const porNumero = comp.match(/(\d{1,2})\s*\/\s*(\d{4})/);
  if (porNumero) return `${porNumero[2]}${porNumero[1].padStart(2, '0')}`;
  const criado = m.created_at
    ? new Date(m.created_at as any)
    : null;
  if (criado && !Number.isNaN(criado.getTime())) {
    return `${criado.getUTCFullYear()}${String(criado.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return '999999';
}

/**
 * Numeração na ordem da competência (empate desfeito pelo número atual, para
 * a mudança ser a menor possível). Devolve só o que muda de número.
 */
export function renumerarPorCompetencia(medicoes: MedicaoParaOrdenar[]): NovaPosicao[] {
  const ordenadas = [...medicoes].sort((a, b) => {
    const ca = chaveCompetencia(a);
    const cb = chaveCompetencia(b);
    if (ca !== cb) return ca < cb ? -1 : 1;
    return Number(a.numero_medicao) - Number(b.numero_medicao);
  });
  return ordenadas
    .map((m, i) => ({
      id: m.id,
      numero_atual: Number(m.numero_medicao),
      numero_novo: i + 1,
    }))
    .filter((p) => p.numero_atual !== p.numero_novo);
}
