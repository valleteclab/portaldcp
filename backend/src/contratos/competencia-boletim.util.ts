/**
 * Texto do campo "Período" do boletim quando o contrato está marcado para
 * exibir a competência (mês) em vez do intervalo de datas.
 *
 * O mês vem do período da medição, não do campo de competência digitado pelo
 * fornecedor: na Ata 001/2025 (APS BUFE) esse campo vinha com mês trocado
 * ("Julho 2026" num período de agosto) e em formatos diferentes a cada mês
 * ("março/2026", "abril-2026"). O período é o dado confiável.
 */

const MESES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

/** 'AAAA-MM-DD' (ou Date) → 'AGOSTO/2026'. Null quando não dá para ler a data. */
export function competenciaDoPeriodo(periodoInicio: Date | string | null | undefined): string | null {
  const texto =
    periodoInicio instanceof Date
      ? `${periodoInicio.getFullYear()}-${String(periodoInicio.getMonth() + 1).padStart(2, '0')}`
      : String(periodoInicio ?? '').slice(0, 7);
  const m = texto.match(/^(\d{4})-(\d{2})$/);
  if (!m) return null;
  const mes = Number(m[2]);
  if (mes < 1 || mes > 12) return null;
  return `${MESES[mes - 1]}/${m[1]}`;
}

/**
 * Texto final do campo Período. Com a opção ligada, usa o mês do período;
 * se a data não for legível, cai na competência digitada e, por último, nas datas.
 */
export function textoPeriodoBoletim(
  exibirCompetencia: boolean,
  periodoInicio: Date | string | null | undefined,
  periodoFim: Date | string | null | undefined,
  competenciaDigitada: string | null | undefined,
  formatarData: (d: Date | string | null | undefined) => string,
): string {
  if (exibirCompetencia) {
    const doPeriodo = competenciaDoPeriodo(periodoInicio);
    if (doPeriodo) return doPeriodo;
    if (competenciaDigitada && String(competenciaDigitada).trim()) {
      return String(competenciaDigitada).trim();
    }
  }
  return `${formatarData(periodoInicio)} a ${formatarData(periodoFim)}`;
}
