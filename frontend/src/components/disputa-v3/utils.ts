import { DisputaV3Contexto, DisputaV3Etapa, DisputaV3ItemBoard, DisputaV3Status } from './types'

export const ETAPAS_V3: Array<{ codigo: DisputaV3Etapa; label: string }> = [
  { codigo: 'ABERTURA', label: 'Abertura' },
  { codigo: 'ANALISE_PROPOSTAS', label: 'Analise' },
  { codigo: 'DISPUTA', label: 'Lances' },
  { codigo: 'NEGOCIACAO', label: 'Negociacao' },
  { codigo: 'HABILITACAO', label: 'Habilitacao' },
  // LC 123/2006, Art. 48 - beneficio ME/EPP deve ser etapa visivel no fluxo
  { codigo: 'BENEFICIO_MPE', label: 'Benef. ME/EPP' },
  { codigo: 'RECURSOS', label: 'Recursos' },
  { codigo: 'ADJUDICACAO', label: 'Adjudicacao' },
  { codigo: 'ENCERRAMENTO', label: 'Encerramento' },
]

export function formatarTempo(segundos: number): string {
  const min = Math.floor(segundos / 60)
  const seg = segundos % 60
  return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`
}

export function formatarMoeda(valor?: number | null): string {
  return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function getStatusBadgeClass(status: DisputaV3Status) {
  switch (status) {
    case 'EM_SESSAO':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    case 'SUSPENSA':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'ENCERRADA':
      return 'bg-slate-100 text-slate-800 border-slate-200'
    case 'CANCELADA':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'AGENDADA':
    default:
      return 'bg-blue-100 text-blue-800 border-blue-200'
  }
}

export function getStatusLabel(status: DisputaV3Status) {
  switch (status) {
    case 'EM_SESSAO':
      return 'Em sessao'
    case 'SUSPENSA':
      return 'Suspensa'
    case 'ENCERRADA':
      return 'Encerrada'
    case 'CANCELADA':
      return 'Cancelada'
    case 'AGENDADA':
    default:
      return 'Agendada'
  }
}

export function getEtapaAtualIndex(contexto?: DisputaV3Contexto | null) {
  if (!contexto) return 0
  return Math.max(0, ETAPAS_V3.findIndex((etapa) => etapa.codigo === contexto.etapa.codigo))
}

export function escolherItemInicial(board?: {
  colunas: {
    emDisputa: DisputaV3ItemBoard[]
    aguardando: DisputaV3ItemBoard[]
    encerrados: DisputaV3ItemBoard[]
  }
} | null): string | null {
  if (!board) return null
  return (
    board.colunas.emDisputa[0]?.id ||
    board.colunas.aguardando[0]?.id ||
    board.colunas.encerrados[0]?.id ||
    null
  )
}

export function getItemStatusLabel(item: DisputaV3ItemBoard) {
  if (item.status === 'ENCERRADO') return 'Encerrado'
  if (item.cronometro.fase === 'PRORROGACAO') return 'Prorrogacao'
  if (item.status === 'EM_DISPUTA') return 'Etapa aberta'
  return 'Aguardando'
}

export function getItemStatusClass(item: DisputaV3ItemBoard) {
  if (item.status === 'ENCERRADO') return 'bg-slate-100 text-slate-700 border-slate-200'
  if (item.cronometro.fase === 'PRORROGACAO') return 'bg-amber-100 text-amber-800 border-amber-200'
  if (item.status === 'EM_DISPUTA') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  return 'bg-blue-100 text-blue-800 border-blue-200'
}

export function calcularDiferencaParaLider(item?: DisputaV3ItemBoard | null) {
  if (!item?.melhorLance || !item?.meuMelhorLance) return null
  const diferenca = item.meuMelhorLance - item.melhorLance.valor
  return diferenca > 0 ? diferenca : 0
}

export function calcularLanceSugerido(item?: DisputaV3ItemBoard | null, diferencaMinimaLances?: number | null) {
  if (!item?.melhorLance) return null
  const referencia = item.meuMelhorLance && item.meuMelhorLance < item.melhorLance.valor
    ? item.meuMelhorLance
    : item.melhorLance.valor
  // Art. 56, §3º: respeitar decremento minimo configurado no edital
  const decremento = diferencaMinimaLances && diferencaMinimaLances > 0 ? diferencaMinimaLances : 0.01
  return Math.max(0, Number((referencia - decremento).toFixed(2)))
}
