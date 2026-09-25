import { DisputaV3Contexto, DisputaV3Etapa, DisputaV3ItemBoard, DisputaV3Status } from './types'

export const ETAPAS_V3: Array<{ codigo: DisputaV3Etapa; label: string }> = [
  { codigo: 'ABERTURA', label: 'Abertura' },
  { codigo: 'ANALISE_PROPOSTAS', label: 'Analise' },
  { codigo: 'DISPUTA', label: 'Lances' },
  // LC 123/2006, Arts. 44-45 - desempate ME/EPP logo apos os lances, antes da aceitacao
  { codigo: 'BENEFICIO_MPE', label: 'Benef. ME/EPP' },
  // IN SEGES 73/2022, Art. 29 - proposta adequada ao ultimo lance, aceite/recusa
  { codigo: 'ACEITACAO', label: 'Aceitacao' },
  { codigo: 'NEGOCIACAO', label: 'Negociacao' },
  { codigo: 'HABILITACAO', label: 'Habilitacao' },
  { codigo: 'RECURSOS', label: 'Recursos' },
  { codigo: 'ADJUDICACAO', label: 'Adjudicacao' },
  // Lei 14.133/2021, Art. 71 - homologacao obrigatoria antes do encerramento
  { codigo: 'HOMOLOGACAO', label: 'Homologacao' },
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
  if (item.faseModo === 'ALEATORIO') return 'Fechamento iminente'
  if (item.faseModo === 'FECHADA') return 'Lance final fechado'
  if (item.faseModo === 'REINICIO_DEMAIS') return 'Reinicio (demais colocacoes)'
  if (item.cronometro.fase === 'PRORROGACAO') return 'Prorrogacao'
  if (item.status === 'EM_DISPUTA') return 'Etapa aberta'
  return 'Aguardando'
}

export function getItemStatusClass(item: DisputaV3ItemBoard) {
  if (item.status === 'ENCERRADO') return 'bg-slate-100 text-slate-700 border-slate-200'
  if (item.faseModo === 'ALEATORIO') return 'bg-orange-100 text-orange-800 border-orange-200'
  if (item.faseModo === 'FECHADA') return 'bg-violet-100 text-violet-800 border-violet-200'
  if (item.faseModo === 'REINICIO_DEMAIS') return 'bg-sky-100 text-sky-800 border-sky-200'
  if (item.cronometro.fase === 'PRORROGACAO') return 'bg-amber-100 text-amber-800 border-amber-200'
  if (item.status === 'EM_DISPUTA') return 'bg-emerald-100 text-emerald-800 border-emerald-200'
  return 'bg-blue-100 text-blue-800 border-blue-200'
}

/** Texto do cronômetro: no tempo aleatório não há contagem (sigiloso — IN 73 art. 24 §1º). */
export function textoCronometro(item: DisputaV3ItemBoard): string {
  if (item.status !== 'EM_DISPUTA') return '--:--'
  if (item.cronometro.oculto || item.faseModo === 'ALEATORIO') return 'Aleatório'
  return formatarTempo(item.cronometro.tempoRestanteSegundos)
}

/** Explicação da fase do item para a sala (fornecedor e pregoeiro). */
export function descricaoFaseItem(item: DisputaV3ItemBoard): string | null {
  switch (item.faseModo) {
    case 'ALEATORIO':
      return 'Aviso de fechamento iminente: a recepção de lances será encerrada em até 10 minutos, em momento aleatório definido pelo sistema (IN SEGES 73/2022, art. 24 §1º). Os lances continuam sendo aceitos.'
    case 'FECHADA':
      return `Etapa de lance final fechado: ${item.classificadosFase ?? ''} licitante(s) convocado(s) podem enviar UM lance, sigiloso até o fim do prazo (art. 24 §§2º a 4º). Quem não enviar mantém o último lance da etapa aberta.`
    case 'REINICIO_DEMAIS':
      return 'Disputa reiniciada para a definição das demais colocações (Lei 14.133/2021, art. 56 §4º): a 1ª colocação está mantida e nenhum lance pode alcançá-la.'
    case 'ABERTA':
      if (item.participacaoRestrita) {
        return `Etapa aberta só para as ${item.classificadosFase ?? ''} propostas classificadas (melhor e até 10% — IN SEGES 73/2022, art. 25).`
      }
      return null
    default:
      return null
  }
}

/** Rótulo do modo de disputa. */
export function rotuloModo(modo?: string | null): string {
  switch (modo) {
    case 'ABERTO_FECHADO':
      return 'Aberto e fechado'
    case 'FECHADO_ABERTO':
      return 'Fechado e aberto'
    case 'FECHADO':
      return 'Fechado'
    default:
      return 'Aberto'
  }
}

export function calcularDiferencaParaLider(item?: DisputaV3ItemBoard | null) {
  if (!item?.melhorLance || !item?.meuMelhorLance) return null
  const diferenca = item.meuMelhorLance - item.melhorLance.valor
  return diferenca > 0 ? diferenca : 0
}

export function calcularLanceSugerido(
  item?: DisputaV3ItemBoard | null,
  diferencaMinimaLances?: number | null,
  tipoDiferenca: 'VALOR' | 'PERCENTUAL' = 'VALOR',
) {
  if (!item?.melhorLance) return null
  const referencia = item.meuMelhorLance && item.meuMelhorLance < item.melhorLance.valor
    ? item.meuMelhorLance
    : item.melhorLance.valor
  // Art. 56, §3º / IN 73 art. 22 §1º: respeitar a diferença mínima do edital (o backend valida)
  const minima = diferencaMinimaLances && diferencaMinimaLances > 0
    ? (tipoDiferenca === 'PERCENTUAL' ? (referencia * diferencaMinimaLances) / 100 : diferencaMinimaLances)
    : 0
  const decremento = Math.max(0.01, Math.ceil(minima * 100) / 100)
  return Math.max(0, Number((referencia - decremento).toFixed(2)))
}
