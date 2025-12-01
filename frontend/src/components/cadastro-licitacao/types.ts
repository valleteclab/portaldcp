// Tipos para o cadastro de licitação

export type StatusAba = 'pendente' | 'incompleto' | 'completo'

export interface ItemLicitacao {
  numero: number
  descricao: string
  quantidade: number
  unidade: string
  valor_unitario: number
  codigo_catmat?: string
  codigo_catser?: string
}

export interface DocumentoLicitacao {
  tipo: string
  nome: string
  url: string
  data_upload?: string
}

export interface DadosBasicos {
  numero_processo: string
  objeto: string
  objeto_detalhado: string
  justificativa: string
}

export interface Classificacao {
  modalidade: string
  tipo_contratacao: string
  criterio_julgamento: string
  modo_disputa: string
  exclusivo_mpe: boolean
  tratamento_diferenciado_mpe: boolean
  cota_reservada: boolean
  percentual_cota_reservada: number
}

export interface Cronograma {
  data_publicacao_edital: string
  data_limite_impugnacao: string
  data_inicio_acolhimento: string
  data_fim_acolhimento: string
  data_abertura_sessao: string
}

export interface Configuracoes {
  intervalo_minimo_lances: number
  tempo_prorrogacao: number
  diferenca_minima_lances: number
  permite_lances_intermediarios: boolean
  pregoeiro_nome: string
  equipe_apoio: string
  // Sigilo de valores conforme Lei 14.133/2021
  sigilo_orcamento: 'PUBLICO' | 'SIGILOSO'
  justificativa_sigilo?: string
}

export interface LicitacaoFormData {
  dadosBasicos: DadosBasicos
  classificacao: Classificacao
  itens: ItemLicitacao[]
  documentos: DocumentoLicitacao[]
  cronograma: Cronograma
  configuracoes: Configuracoes
  sistema_origem?: string
  codigo_externo?: string
}

export const MODALIDADES = [
  { value: 'PREGAO_ELETRONICO', label: 'Pregão Eletrônico' },
  { value: 'CONCORRENCIA', label: 'Concorrência' },
  { value: 'DISPENSA_ELETRONICA', label: 'Dispensa Eletrônica' },
  { value: 'CONCURSO', label: 'Concurso' },
  { value: 'LEILAO', label: 'Leilão' },
  { value: 'DIALOGO_COMPETITIVO', label: 'Diálogo Competitivo' },
  { value: 'INEXIGIBILIDADE', label: 'Inexigibilidade' },
]

export const TIPOS_CONTRATACAO = [
  { value: 'COMPRA', label: 'Compra' },
  { value: 'SERVICO', label: 'Serviço' },
  { value: 'OBRA', label: 'Obra' },
  { value: 'SERVICO_ENGENHARIA', label: 'Serviço de Engenharia' },
  { value: 'LOCACAO', label: 'Locação' },
  { value: 'ALIENACAO', label: 'Alienação' },
]

export const CRITERIOS_JULGAMENTO = [
  { value: 'MENOR_PRECO', label: 'Menor Preço' },
  { value: 'MAIOR_DESCONTO', label: 'Maior Desconto' },
  { value: 'MELHOR_TECNICA', label: 'Melhor Técnica' },
  { value: 'TECNICA_E_PRECO', label: 'Técnica e Preço' },
  { value: 'MAIOR_LANCE', label: 'Maior Lance' },
  { value: 'MAIOR_RETORNO_ECONOMICO', label: 'Maior Retorno Econômico' },
]

export const MODOS_DISPUTA = [
  { value: 'ABERTO', label: 'Aberto' },
  { value: 'ABERTO_FECHADO', label: 'Aberto e Fechado' },
  { value: 'FECHADO_ABERTO', label: 'Fechado e Aberto' },
  { value: 'FECHADO', label: 'Fechado' },
]

export const UNIDADES = [
  { value: 'UNIDADE', label: 'Unidade' },
  { value: 'CAIXA', label: 'Caixa' },
  { value: 'PACOTE', label: 'Pacote' },
  { value: 'RESMA', label: 'Resma' },
  { value: 'LITRO', label: 'Litro' },
  { value: 'KG', label: 'Quilograma' },
  { value: 'METRO', label: 'Metro' },
  { value: 'M2', label: 'Metro Quadrado' },
  { value: 'M3', label: 'Metro Cúbico' },
  { value: 'HORA', label: 'Hora' },
  { value: 'DIA', label: 'Dia' },
  { value: 'MES', label: 'Mês' },
  { value: 'ANO', label: 'Ano' },
  { value: 'SERVICO', label: 'Serviço' },
]
