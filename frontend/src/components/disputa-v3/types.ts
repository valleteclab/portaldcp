export type DisputaV3Modo = 'ABERTO' | 'ABERTO_FECHADO' | 'FECHADO_ABERTO' | 'FECHADO'
export type DisputaV3Status = 'AGENDADA' | 'EM_SESSAO' | 'SUSPENSA' | 'ENCERRADA' | 'CANCELADA'
export type DisputaV3Etapa =
  | 'ABERTURA'
  | 'ANALISE_PROPOSTAS'
  | 'DISPUTA'
  | 'NEGOCIACAO'
  | 'HABILITACAO'
  | 'BENEFICIO_MPE'
  | 'RECURSOS'
  | 'ADJUDICACAO'
  | 'ENCERRAMENTO'

export interface DisputaV3Cronometria {
  modo: DisputaV3Modo
  baseLegal: string
  intervaloMinimoLancesMinutos: number
  etapaAbertaMinutos?: number
  janelaGatilhoProrrogacaoMinutos?: number
  duracaoProrrogacaoMinutos?: number
  fechamentoIminenteAleatorioMaxMinutos?: number
  lanceFinalFechadoMinutos?: number
  faixaClassificacaoPercentual?: number
  usaTempoAleatorioNoModoAberto: boolean
  requerFluxoEspecificoNaV3: boolean
  observacao?: string
}

export interface DisputaV3Contexto {
  id: string
  licitacaoId: string
  status: DisputaV3Status
  etapa: {
    codigo: DisputaV3Etapa
    origem: string
  }
  modo: DisputaV3Modo
  disputaPorItem: boolean
  pregoeiro: {
    id: string | null
    nome: string | null
  }
  operacao: {
    chatHabilitado: boolean
    anonimizacaoAtiva: boolean
    suspensa: boolean
    motivoSuspensao: string | null
  }
  cronometria: DisputaV3Cronometria
  licitacao: {
    id: string
    numero: string | null
    processo: string | null
    objeto: string
  } | null
}

export interface DisputaV3ItemBoard {
  id: string
  numero: number
  descricao: string
  quantidade: number
  unidade: string
  valorReferencia: number
  status: 'AGUARDANDO' | 'EM_DISPUTA' | 'ENCERRADO'
  cronometro: {
    tempoRestanteSegundos: number
    fase: 'ETAPA_ABERTA' | 'PRORROGACAO' | 'ENCERRADO'
  }
  melhorLance?: {
    valor: number
    fornecedorId: string
    fornecedorNome: string
  }
  totalPropostas: number
  totalLances: number
  meuMelhorLance?: number | null
  minhaPosicao?: number | null
  minhaPropostaInicial?: number | null
}

export interface DisputaV3SolicitacaoCancelamento {
  lanceId: string
  itemId: string
  itemNumero: number
  fornecedorId: string
  fornecedorNome: string
  valor: number
  motivo: string | null
  solicitadoEm: string
}

export interface DisputaV3LanceMeu {
  id: string
  valor: number
  criadoEm: string
  cancelado: boolean
  solicitacaoPendente: boolean
  podeCancelarDireto: boolean
  segundosRestantesCancelamentoDireto: number
}

export interface DisputaV3Board {
  visao: 'PREGOEIRO' | 'FORNECEDOR'
  contexto: DisputaV3Contexto
  colunas: {
    aguardando: DisputaV3ItemBoard[]
    emDisputa: DisputaV3ItemBoard[]
    encerrados: DisputaV3ItemBoard[]
  }
  metricas: {
    totalAguardando: number
    totalEmDisputa: number
    totalEncerrados: number
  }
  solicitacoesCancelamento?: DisputaV3SolicitacaoCancelamento[]
}

export interface DisputaMensagem {
  id?: string
  tipo: 'SISTEMA' | 'PREGOEIRO' | 'FORNECEDOR'
  remetente: string
  conteudo: string
  dataHora: string | Date
}
