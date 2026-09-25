export type DisputaV3Modo = 'ABERTO' | 'ABERTO_FECHADO' | 'FECHADO_ABERTO' | 'FECHADO'
export type DisputaV3Status = 'AGENDADA' | 'EM_SESSAO' | 'SUSPENSA' | 'ENCERRADA' | 'CANCELADA'
export type DisputaV3Etapa =
  | 'ABERTURA'
  | 'ANALISE_PROPOSTAS'
  | 'DISPUTA'
  | 'ACEITACAO'
  | 'NEGOCIACAO'
  | 'HABILITACAO'
  | 'BENEFICIO_MPE'
  | 'RECURSOS'
  | 'ADJUDICACAO'
  | 'HOMOLOGACAO'
  | 'ENCERRAMENTO'

export interface DisputaV3Cronometria {
  modo: DisputaV3Modo
  baseLegal: string
  intervaloMinimoLancesMinutos: number
  /** Art. 56, §3º - Decremento minimo entre lances conforme edital */
  diferencaMinimaLances?: number
  /** VALOR (R$ na base do lance) ou PERCENTUAL */
  tipoDiferencaMinimaLances?: 'VALOR' | 'PERCENTUAL'
  /** Unidade dos lances: UNITARIO | TOTAL_ITEM | TOTAL_LOTE */
  baseLance?: string
  etapaAbertaMinutos?: number
  janelaGatilhoProrrogacaoMinutos?: number
  duracaoProrrogacaoMinutos?: number
  fechamentoIminenteAleatorioMaxMinutos?: number
  lanceFinalFechadoMinutos?: number
  faixaClassificacaoPercentual?: number
  usaTempoAleatorioNoModoAberto: boolean
  requerFluxoEspecificoNaV3: boolean
  /** Fases do modo, na ordem (jornada mostrada na sala). */
  fases?: string[]
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
  criterioJulgamento?: string | null
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
  /** Na unidade da base do lance (comparável com os lances) */
  valorReferencia: number
  valorReferenciaUnitario?: number
  baseLance?: string
  status: 'AGUARDANDO' | 'EM_DISPUTA' | 'ENCERRADO'
  cronometro: {
    tempoRestanteSegundos: number
    fase: 'ETAPA_ABERTA' | 'PRORROGACAO' | 'TEMPO_ALEATORIO' | 'LANCE_FECHADO' | 'ENCERRADO'
    /** Tempo aleatório: o restante é sigiloso (IN 73 art. 24 §1º) — nunca mostrar contagem. */
    oculto?: boolean
  }
  /** Modo e fase do item no motor (E2.4). */
  modoDisputa?: DisputaV3Modo
  /** AGUARDANDO | ABERTA | ALEATORIO | FECHADA | REINICIO_DEMAIS | ENCERRADA */
  faseModo?: string
  /** Etapa fechada: fim do prazo do lance final (ISO). */
  fimFaseEm?: string | null
  /** A fase só admite lances dos classificados (fechado-aberto, lance fechado, reinício). */
  participacaoRestrita?: boolean
  classificadosFase?: number | null
  /** Visão do fornecedor: pode dar lance nesta fase. */
  possoDarLance?: boolean
  /** Visão do fornecedor: o próprio lance final fechado (sigiloso para os demais). */
  meuLanceFechado?: number | null
  /** Visão do órgão: quantos lances fechados chegaram (sem valores até o fim do prazo). */
  lancesFechadosRecebidos?: number | null
  /** Reinício para as demais colocações: valor da 1ª colocação (limite). */
  valorPrimeiraColocacao?: number | null
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
  /** Unidade de disputa: LOTE na disputa por lote (base TOTAL_LOTE); ausente = item. */
  tipoUnidade?: 'ITEM' | 'LOTE'
  /** LOTE: itens do lote (o valor global do lote vai em valorReferencia e nos lances). */
  itensDoLote?: Array<{
    id: string
    numero: number
    descricao: string
    quantidade: number
    unidade: string
    valorReferencia: number | null
    minhaProposta?: { valorUnitario: number | null; valorTotal: number | null }
  }>
  /** LOTE, visão do fornecedor: cotou todos os itens do lote (senão não disputa o lote). */
  elegivel?: boolean
  itensNaoCotados?: number[]
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
