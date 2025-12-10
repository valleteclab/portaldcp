// Tipos para o cadastro de licitação

export type StatusAba = 'pendente' | 'incompleto' | 'completo'

export interface ItemLicitacao {
  id?: string
  numero: number
  descricao: string
  quantidade: number
  unidade: string
  valor_unitario: number
  // Dados do Catálogo de Compras (compras.gov.br)
  codigo_catalogo?: string // Código do item no catálogo
  classe_catalogo?: string // Classe/categoria do catálogo
  codigo_catmat?: string // Código CATMAT (materiais)
  codigo_catser?: string // Código CATSER (serviços)
  codigo_pdm?: string // Código do PDM (Padrão Descritivo de Materiais)
  nome_pdm?: string // Nome do PDM
  codigo_grupo?: string // Código do grupo
  nome_grupo?: string // Nome do grupo
  // Vinculação com Lote (Lei 14.133/2021, Art. 40, §3º)
  lote_id?: string
  lote_numero?: number
  // Vinculação com PCA (Lei 14.133/2021, Art. 12, VII)
  item_pca_id?: string
  item_pca_descricao?: string // Para exibição
  item_pca_ano?: number // Ano do PCA
  item_pca_categoria?: string // Categoria (MATERIAL, SERVICO, etc)
  sem_pca?: boolean
  justificativa_sem_pca?: string
  // Benefício ME/EPP (LC 123/2006) - quando modo = POR_ITEM
  tipo_beneficio_mpe?: TipoBeneficioMPE // NENHUM, EXCLUSIVO, COTA_RESERVADA
  tipo_participacao?: 'AMPLA' | 'EXCLUSIVO_MPE' | 'COTA_RESERVADA' // Campo do backend
}

/**
 * Lote de Licitação
 * 
 * Lei 14.133/2021, Art. 40, §3º:
 * "O parcelamento será adotado quando técnica e economicamente viável, 
 * e deverá ser justificado quando não for adotado."
 */
export interface LoteLicitacao {
  id?: string
  numero: number
  descricao: string
  licitacao_id?: string
  // Vinculação com PCA
  item_pca_id?: string
  item_pca?: ItemPCA
  sem_pca?: boolean
  justificativa_sem_pca?: string
  // Valores
  valor_total_estimado?: number
  valor_total_homologado?: number
  quantidade_itens?: number
  // Benefício ME/EPP (LC 123/2006, Art. 48) - quando modo = POR_LOTE
  tipo_beneficio_mpe?: TipoBeneficioMPE // NENHUM, EXCLUSIVO, COTA_RESERVADA
  exclusivo_mpe?: boolean // Mantido para compatibilidade
  percentual_cota_reservada?: number
  criterio_julgamento?: string
  // Status
  status?: 'RASCUNHO' | 'ATIVO' | 'DESERTO' | 'FRACASSADO' | 'CANCELADO' | 'HOMOLOGADO'
  observacoes?: string
  // Itens do lote
  itens?: ItemLicitacao[]
}

/**
 * Modos de Vinculação ao PCA
 * 
 * Lei 14.133/2021, Art. 12, VII:
 * Vinculação obrigatória ao Plano de Contratações Anual
 */
export type ModoVinculacaoPCA = 'POR_LICITACAO' | 'POR_LOTE' | 'POR_ITEM'

export const MODOS_VINCULACAO_PCA = [
  { 
    value: 'POR_LICITACAO', 
    label: 'Por Licitação', 
    descricao: 'Todos os itens vinculam à mesma Classe do PCA (objeto homogêneo)',
    exemplo: 'Ex: Aquisição de Equipamentos de TI'
  },
  { 
    value: 'POR_LOTE', 
    label: 'Por Lote', 
    descricao: 'Cada lote vincula a uma Classe do PCA diferente (objeto parcelado)',
    exemplo: 'Ex: Computadores (Lote 1) + Alimentos (Lote 2)'
  },
  { 
    value: 'POR_ITEM', 
    label: 'Por Item', 
    descricao: 'Cada item vincula individualmente a uma Classe do PCA',
    exemplo: 'Ex: Itens avulsos ou contratações emergenciais'
  },
]

/**
 * Modos de Aplicação do Benefício ME/EPP
 * 
 * Lei Complementar 123/2006, Art. 48:
 * Tratamento diferenciado e favorecido para ME/EPP
 */
export type ModoAplicacaoBeneficioMPE = 'GERAL' | 'POR_LOTE' | 'POR_ITEM'

export type TipoBeneficioMPE = 'NENHUM' | 'EXCLUSIVO' | 'COTA_RESERVADA'

export const MODOS_APLICACAO_BENEFICIO_MPE = [
  { 
    value: 'GERAL', 
    label: 'Geral (Licitação)', 
    descricao: 'O mesmo benefício se aplica a todos os itens/lotes',
    exemplo: 'Ex: Toda a licitação é exclusiva para ME/EPP'
  },
  { 
    value: 'POR_LOTE', 
    label: 'Por Lote', 
    descricao: 'Cada lote pode ter um benefício diferente',
    exemplo: 'Ex: Lote 1 exclusivo ME/EPP, Lote 2 ampla participação'
  },
  { 
    value: 'POR_ITEM', 
    label: 'Por Item', 
    descricao: 'Cada item pode ter um benefício diferente',
    exemplo: 'Ex: Item 1 exclusivo ME/EPP, Item 2 cota reservada'
  },
]

export const TIPOS_BENEFICIO_MPE = [
  { 
    value: 'NENHUM', 
    label: 'Sem Benefício', 
    descricao: 'Ampla participação',
    tipoBeneficioIdPncp: 4
  },
  { 
    value: 'EXCLUSIVO', 
    label: 'Exclusivo ME/EPP', 
    descricao: 'Participação exclusiva para ME/EPP (até R$ 80.000)',
    tipoBeneficioIdPncp: 1
  },
  { 
    value: 'COTA_RESERVADA', 
    label: 'Cota Reservada', 
    descricao: 'Reservar cota de até 25% para ME/EPP',
    tipoBeneficioIdPncp: 2
  },
]

/**
 * Classe/Categoria do PCA (Plano de Contratações Anual)
 * 
 * IMPORTANTE: No PCA, o "item" representa uma CLASSE ou CATEGORIA de contratação,
 * não um item específico. Por exemplo: "Equipamentos de TI", "Serviços de Limpeza".
 * 
 * Os itens específicos (ex: "Notebook Dell Latitude 5520") são definidos na LICITAÇÃO,
 * vinculados a esta classe do PCA.
 * 
 * Nomenclatura PNCP: "Item do PCA" (mantemos para compatibilidade com a API)
 * Nomenclatura interna: "Classe PCA" ou "Categoria de Contratação"
 */
export interface ItemPCA {
  id: string
  numero_item: number // Número sequencial no PCA (PNCP: numero_item)
  descricao_objeto: string // Descrição da classe/categoria (ex: "Aquisição de Equipamentos de TI")
  categoria: string // MATERIAL, SERVICO, OBRA, SOLUCAO_TIC
  valor_estimado: number // Valor total estimado para esta classe
  valor_utilizado: number // Valor já utilizado em licitações
  unidade_medida?: string
  codigo_classe?: string // Código CATMAT/CATSER da classe
  nome_classe?: string // Nome da classe no catálogo
  pca?: {
    id: string
    ano_exercicio: number
    numero_pca?: string
  }
}

// Alias para clareza na UI (internamente é o mesmo tipo)
export type ClassePCA = ItemPCA
export type CategoriaContratacaoPCA = ItemPCA

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
  // Unidade Compradora (PNCP)
  codigo_unidade_compradora?: string
  nome_unidade_compradora?: string
}

export interface Classificacao {
  modalidade: string
  tipo_contratacao: string
  criterio_julgamento: string
  modo_disputa: string
  // Benefício ME/EPP (LC 123/2006)
  tratamento_diferenciado_mpe: boolean
  modo_beneficio_mpe: ModoAplicacaoBeneficioMPE // GERAL, POR_LOTE, POR_ITEM
  tipo_beneficio_mpe: TipoBeneficioMPE // NENHUM, EXCLUSIVO, COTA_RESERVADA (quando GERAL)
  exclusivo_mpe: boolean // Mantido para compatibilidade
  cota_reservada: boolean // Mantido para compatibilidade
  percentual_cota_reservada: number
  // Vinculação com PCA (Lei 14.133/2021, Art. 12, VII)
  modo_vinculacao_pca: ModoVinculacaoPCA
  item_pca_id?: string // Quando modo = POR_LICITACAO
  item_pca?: ItemPCA
  sem_pca?: boolean
  justificativa_sem_pca?: string
  // Lotes (Lei 14.133/2021, Art. 40, §3º)
  usa_lotes: boolean
  justificativa_nao_parcelamento?: string
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
  lotes: LoteLicitacao[]
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
