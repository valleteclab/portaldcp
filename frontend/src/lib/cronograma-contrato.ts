/**
 * Helpers para alinhar itens do cronograma físico-financeiro à cláusula de preço
 * (metragem × R$/m² × número de execuções por periodicidade na vigência).
 */

export type FrequenciaExecucaoContrato =
  | 'UNICA'
  | 'MENSAL'
  | 'BIMESTRAL'
  | 'TRIMESTRAL'
  | 'SEMESTRAL'
  | 'ANUAL'

export const VALORES_FREQUENCIA_CRONOGRAMA: FrequenciaExecucaoContrato[] = [
  'UNICA',
  'MENSAL',
  'BIMESTRAL',
  'TRIMESTRAL',
  'SEMESTRAL',
  'ANUAL',
]

/** Restaura frequência persistida no item (API) para o select do modal. */
export function parseFrequenciaSalva(
  v: string | null | undefined,
): FrequenciaExecucaoContrato | null {
  if (!v) return null
  return VALORES_FREQUENCIA_CRONOGRAMA.includes(v as FrequenciaExecucaoContrato)
    ? (v as FrequenciaExecucaoContrato)
    : null
}

export const FREQUENCIAS_CRONOGRAMA_CONTRATO: {
  value: FrequenciaExecucaoContrato
  label: string
}[] = [
  { value: 'UNICA', label: 'Única' },
  { value: 'MENSAL', label: 'Mensal' },
  { value: 'BIMESTRAL', label: 'Bimestral' },
  { value: 'TRIMESTRAL', label: 'Trimestral' },
  { value: 'SEMESTRAL', label: 'Semestral' },
  { value: 'ANUAL', label: 'Anual' },
]

const MESES_POR_FREQUENCIA: Record<
  Exclude<FrequenciaExecucaoContrato, 'UNICA' | 'MENSAL'>,
  number
> = {
  BIMESTRAL: 2,
  TRIMESTRAL: 3,
  SEMESTRAL: 6,
  ANUAL: 12,
}

/**
 * Meses de vigência inclusivos (aproximação calendário: início e fim contam no mês).
 * Se datas inválidas ou ausentes, retorna 12 como padrão conservador.
 */
export function mesesVigenciaContrato(
  dataInicio?: string | null,
  dataFim?: string | null,
): number {
  if (!dataInicio || !dataFim) return 12
  const ini = new Date(dataInicio.slice(0, 10) + 'T12:00:00')
  const fim = new Date(dataFim.slice(0, 10) + 'T12:00:00')
  if (Number.isNaN(ini.getTime()) || Number.isNaN(fim.getTime()) || fim < ini) {
    return 12
  }
  let m =
    (fim.getFullYear() - ini.getFullYear()) * 12 +
    (fim.getMonth() - ini.getMonth())
  if (fim.getDate() >= ini.getDate()) m += 1
  return Math.max(1, m)
}

/**
 * Número sugerido de execuções no período de vigência.
 * - Única: 1 (payload deve omitir multiplicador no backend).
 * - Mensal: um pagamento por mês de vigência.
 * - Demais: ceil(mesesVigencia / mesesDoPeríodo), mínimo 1.
 */
export function execucoesSugeridasPorFrequencia(
  mesesVigencia: number,
  freq: FrequenciaExecucaoContrato,
): number {
  const mv = Math.max(1, Math.floor(mesesVigencia) || 1)
  if (freq === 'UNICA') return 1
  if (freq === 'MENSAL') return mv
  const periodo = MESES_POR_FREQUENCIA[freq]
  return Math.max(1, Math.ceil(mv / periodo))
}

/** Para API: UNICA → null (uma execução); demais → número de execuções. */
export function quantidadeMesesParaPayload(
  freq: FrequenciaExecucaoContrato,
  numExecucoes: number,
): number | null {
  if (freq === 'UNICA') return null
  const n = Math.max(1, Math.floor(numExecucoes) || 1)
  return n
}
