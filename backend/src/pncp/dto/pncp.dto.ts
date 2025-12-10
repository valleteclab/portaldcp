/**
 * DTOs para integração com PNCP - Portal Nacional de Contratações Públicas
 * 
 * Documentação: https://www.gov.br/pncp/pt-br/central-de-conteudo/manuais
 * Swagger: https://pncp.gov.br/api/pncp/swagger-ui/index.html
 * 
 * @version 2.0.0
 * @date 2025-12-01
 */

// ============ PCA - Plano de Contratações Anual ============

/**
 * Item do Plano de Contratação Anual
 */
export class ItemPcaDto {
  numero_item: number;
  categoria_item_pca: number;           // 1=Bens, 2=Serviços, 3=Obras
  descricao: string;
  unidade_fornecimento: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  valor_orcamento_exercicio: number;
  unidade_requisitante: string;
  data_desejada: string;                // YYYY-MM-DD
  classificacao_catalogo_id?: number;   // 1=CATMAT, 2=CATSER
  codigo_classe?: string;               // Código CATMAT/CATSER
  descricao_classe?: string;
}

/**
 * Plano de Contratação Anual
 */
export class PcaDto {
  ano_pca: number;
  itens: ItemPcaDto[];
}

/**
 * DTO legado para compatibilidade
 * @deprecated Use PcaDto e ItemPcaDto
 */
export class PcaLegacyDto {
  anoExercicio: number;
  categoriaItemPca: number; // 1=Material, 2=Serviço, 3=Obra
  codigoClassificacaoSuperior?: string;
  codigoItemCatalogo?: string;
  dataDesejada: string; // YYYY-MM-DD
  dataInclusao: string;
  descricao: string;
  justificativa?: string;
  orcamentoExercicio: number;
  quantidadeEstimada: number;
  unidadeMedida: string;
  unidadeRequisitante: string;
  valorEstimadoTotal: number;
  valorEstimadoUnitario: number;
}

// ============ COMPRA/EDITAL - DTOs de Entrada (Frontend -> Backend) ============

/**
 * Item da Compra para inclusão
 */
export class ItemCompraInputDto {
  numero_item: number;
  descricao: string;
  tipo: 'MATERIAL' | 'SERVICO';
  quantidade: number;
  unidade_medida: string;
  valor_unitario: number;
  valor_total: number;
  tipo_beneficio_id?: number;
  criterio_julgamento_id?: number;
  orcamento_sigiloso?: boolean;
  item_categoria_id?: number;
}

/**
 * Compra/Edital para inclusão
 */
export class CompraInputDto {
  codigo_unidade: string;
  ano_compra: number;
  numero_compra?: string;
  numero_processo: string;
  objeto: string;
  modalidade_id: number;              // 6=Pregão Eletrônico
  modo_disputa_id: number;            // 1=Aberto
  tipo_instrumento_id: number;        // 1=Edital
  amparo_legal_id: number;            // Lei 14.133/2021
  srp: boolean;
  data_abertura_proposta: string;     // ISO 8601
  data_encerramento_proposta: string;
  informacao_complementar?: string;
  titulo_documento: string;
  link_sistema_origem?: string;
  itens: ItemCompraInputDto[];
}

/**
 * Compra/Edital para retificação
 */
export class CompraRetificacaoDto {
  objeto?: string;
  informacao_complementar?: string;
  data_abertura_proposta?: string;
  data_encerramento_proposta?: string;
}

// ============ Compra/Contratação - DTOs de Resposta (PNCP) ============
export class OrgaoEntidadeDto {
  cnpj: string;
  razaoSocial: string;
}

export class UnidadeOrgaoDto {
  codigoUnidade: string;
  nomeUnidade: string;
}

export class ItemCompraEnvioDto {
  numeroItem: number;
  descricao: string;
  materialOuServico: 'M' | 'S';
  tipoBeneficioId: number;
  incentivoProdutivoBasico: boolean;
  quantidade: number;
  unidadeMedida: string;
  valorUnitarioEstimado: number;
  valorTotal: number;
  criterioJulgamentoId: number;
  orcamentoSigiloso: boolean;
  itemCategoriaId: number;
  aplicabilidadeMargemPreferenciaNormal: boolean;
  aplicabilidadeMargemPreferenciaAdicional: boolean;
}

export class CompraDto {
  anoCompra: number;
  codigoModalidadeContratacao: number;
  codigoModoDisputa: number;
  codigoSituacaoCompra: number;
  codigoTipoInstrumentoConvocatorio?: number;
  dataAberturaProposta: string; // ISO 8601
  dataEncerramentoProposta?: string;
  dataInclusao: string;
  dataPublicacaoPncp?: string;
  informacaoComplementar?: string;
  linkSistemaOrigem?: string;
  modoDisputaDescricao?: string;
  modalidadeNome?: string;
  nomeResponsavel?: string;
  numeroCompra: string;
  numeroControlePNCP?: string;
  numeroProcesso: string;
  objetoCompra: string;
  orgaoEntidade: OrgaoEntidadeDto;
  srp: boolean;
  unidadeOrgao: UnidadeOrgaoDto;
  valorTotalEstimado: number;
  amparoLegalId?: number;
  justificativaPresencial?: string;
  linkEdital?: string;
  itensCompra?: ItemCompraEnvioDto[]; // Itens da compra para envio ao PNCP
}

// ============ Item da Compra ============
export class ItemCompraDto {
  numeroItem: number;
  materialOuServico: 'M' | 'S'; // M=Material, S=Serviço
  tipoBeneficioId?: number;
  incentivoProdutivoBasico: boolean;
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  valorUnitarioEstimado: number;
  valorTotal: number;
  situacaoCompraItemId: number;
  criterioJulgamentoId: number;
  codigoItemCatalogo?: string;
  itemCategoriaId?: number;
  patrimonio: boolean;
  orcamentoSigiloso?: boolean;
  temResultado?: boolean;
}

// ============ Documento/Arquivo ============
export class DocumentoCompraDto {
  tipoDocumentoId: number;
  titulo: string;
  arquivo: Buffer;
  nomeArquivo: string;
  mimeType: string;
}

// ============ RESULTADO DO ITEM - DTOs de Entrada ============

/**
 * Resultado do Item para inclusão
 */
export class ResultadoInputDto {
  data_resultado: string;             // YYYY-MM-DD
  cnpj_fornecedor: string;            // CNPJ ou CPF (será detectado automaticamente)
  nome_fornecedor: string;
  quantidade_homologada: number;
  valor_unitario_homologado: number;
  valor_total_homologado: number;
  percentual_desconto?: number;
  porte_fornecedor_id?: number;       // 1=ME, 2=EPP, 3=Demais
  codigo_pais?: string;               // ISO Alpha-3: BRA
  subcontratacao?: boolean;
  aplicacao_margem_preferencia?: boolean;
  aplicacao_beneficio_me_epp?: boolean;
  aplicacao_criterio_desempate?: boolean;
}

/**
 * Resultado do Item para retificação
 */
export class ResultadoRetificacaoDto extends ResultadoInputDto {
  situacao_id: number;                // Obrigatório para retificação
  sequencial_resultado?: number;      // Default: 1
}

// ============ Resultado do Item - DTO de Resposta (PNCP) ============
export class ResultadoItemDto {
  dataResultado: string;
  niFornecedor: string; // CPF ou CNPJ
  nomeRazaoSocialFornecedor: string;
  numeroControlePNCPCompra?: string;
  quantidadeHomologada: number;
  valorTotalHomologado: number;
  valorUnitarioHomologado: number;
  percentualDesconto?: number;
  indicadorSubcontratacao: boolean;
  tipoPessoa: 'PF' | 'PJ';
  porteFornecedor?: 'ME' | 'EPP' | 'DEMAIS';
  codigoPais?: number;
  ordemClassificacao?: number;
}

// ============ ATA DE REGISTRO DE PREÇO - DTOs de Entrada ============

/**
 * Item da Ata para inclusão
 */
export class ItemAtaInputDto {
  numero_item: number;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
}

/**
 * Ata de Registro de Preço para inclusão
 */
export class AtaInputDto {
  numero_ata: string;
  ano_ata: number;
  data_assinatura: string;            // YYYY-MM-DD
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
  cnpj_fornecedor: string;
  nome_fornecedor: string;
  itens: ItemAtaInputDto[];
}

/**
 * Ata de Registro de Preço para retificação
 */
export class AtaRetificacaoDto {
  numero_ata: string;
  ano_ata: number;
  data_assinatura: string;
  data_vigencia_inicio: string;
  data_vigencia_fim: string;
  justificativa: string;              // Obrigatório para retificação
  situacao_id?: number;
}

// ============ Ata de Registro de Preços - DTO de Resposta (PNCP) ============
export class AtaRegistroPrecoDto {
  numeroAtaRegistroPreco: string;
  dataAssinatura: string;
  dataVigenciaInicio: string;
  dataVigenciaFim: string;
  niFornecedor: string;
  nomeRazaoSocialFornecedor: string;
  situacaoAtaId: number;
  valorTotalAta: number;
  numeroControlePNCPCompra?: string;
}

// ============ Contrato ============
export class ContratoDto {
  anoContrato: number;
  numeroContratoEmpenho: string;
  tipoContratoId: number;
  objetoContrato: string;
  niFornecedor: string;
  nomeRazaoSocialFornecedor: string;
  dataAssinatura: string;
  dataVigenciaInicio: string;
  dataVigenciaFim: string;
  valorInicial: number;
  valorGlobal: number;
  numeroControlePNCPCompra?: string;
  categoriaProcessoId?: number;
  urlCipi?: string;
  receita?: boolean;
  tipoPessoa?: 'PF' | 'PJ';
  informacaoComplementar?: string;
}

// ============ Termo Aditivo/Apostilamento ============
export class TermoContratoDto {
  tipoTermoId: number; // 1=Rescisão, 2=Aditivo, 3=Apostilamento
  numeroTermo: string;
  dataAssinatura: string;
  dataVigenciaInicio?: string;
  dataVigenciaFim?: string;
  valorAcrescimo?: number;
  valorSupressao?: number;
  justificativa?: string;
  objetoTermo?: string;
}

// ============ Respostas da API ============
export class PncpResponseDto {
  sucesso: boolean;
  numeroControlePNCP?: string;
  ano?: number;
  sequencial?: number;
  mensagem?: string;
  erros?: string[];
  dataHora?: string;
  dados?: any; // Dados adicionais retornados pela API
  link?: string; // Link para visualização no PNCP
}

// ============ Códigos de Domínio ============
export const MODALIDADES_CONTRATACAO = {
  LEILAO_ELETRONICO: 1,
  DIALOGO_COMPETITIVO: 2,
  CONCURSO: 3,
  CONCORRENCIA_ELETRONICA: 4,
  CONCORRENCIA_PRESENCIAL: 5,
  PREGAO_ELETRONICO: 6,
  PREGAO_PRESENCIAL: 7,
  DISPENSA: 8,
  INEXIGIBILIDADE: 9,
  LEILAO_PRESENCIAL: 10,
  CREDENCIAMENTO: 12,
  PRE_QUALIFICACAO: 13,
  MANIFESTACAO_INTERESSE: 14
};

export const SITUACAO_COMPRA = {
  DIVULGADA: 1,
  REVOGADA: 2,
  ANULADA: 3,
  SUSPENSA: 4,
  DESERTA: 5,
  FRACASSADA: 6
};

export const MODO_DISPUTA = {
  ABERTO: 1,
  FECHADO: 2,
  ABERTO_FECHADO: 3,
  FECHADO_ABERTO: 4,
  NAO_SE_APLICA: 5
};

export const TIPO_DOCUMENTO = {
  EDITAL: 1,
  TERMO_REFERENCIA: 2,
  ETP: 3,
  MINUTA_CONTRATO: 4,
  ATA_REGISTRO_PRECO: 5,
  OUTROS: 6
};

export const TIPO_CONTRATO = {
  CONTRATO: 1,
  NOTA_EMPENHO: 2,
  ORDEM_SERVICO: 3,
  ORDEM_FORNECIMENTO: 4,
  CARTA_CONTRATO: 5,
  TERMO_ADESAO: 6
};

export const SITUACAO_ITEM = {
  ATIVO: 1,
  CANCELADO: 2,
  DESERTO: 3,
  FRACASSADO: 4
};

export const CRITERIO_JULGAMENTO = {
  MENOR_PRECO: 1,
  MAIOR_DESCONTO: 2,
  MELHOR_TECNICA: 3,
  TECNICA_PRECO: 4,
  MAIOR_LANCE: 5,
  MAIOR_RETORNO_ECONOMICO: 6
};

// Mapeamento de modalidades do sistema para PNCP
export const MODALIDADE_SISTEMA_PARA_PNCP: Record<string, number> = {
  'PREGAO_ELETRONICO': MODALIDADES_CONTRATACAO.PREGAO_ELETRONICO,
  'PREGAO_PRESENCIAL': MODALIDADES_CONTRATACAO.PREGAO_PRESENCIAL,
  'CONCORRENCIA': MODALIDADES_CONTRATACAO.CONCORRENCIA_ELETRONICA,
  'CONCORRENCIA_ELETRONICA': MODALIDADES_CONTRATACAO.CONCORRENCIA_ELETRONICA,
  'CONCORRENCIA_PRESENCIAL': MODALIDADES_CONTRATACAO.CONCORRENCIA_PRESENCIAL,
  'TOMADA_PRECOS': MODALIDADES_CONTRATACAO.CONCORRENCIA_PRESENCIAL,
  'CONVITE': MODALIDADES_CONTRATACAO.DISPENSA,
  'DISPENSA': MODALIDADES_CONTRATACAO.DISPENSA,
  'INEXIGIBILIDADE': MODALIDADES_CONTRATACAO.INEXIGIBILIDADE,
  'LEILAO': MODALIDADES_CONTRATACAO.LEILAO_ELETRONICO,
  'CONCURSO': MODALIDADES_CONTRATACAO.CONCURSO,
  'DIALOGO_COMPETITIVO': MODALIDADES_CONTRATACAO.DIALOGO_COMPETITIVO,
  'CREDENCIAMENTO': MODALIDADES_CONTRATACAO.CREDENCIAMENTO
};

// Mapeamento de fases do sistema para situação PNCP
export const FASE_SISTEMA_PARA_PNCP: Record<string, number> = {
  'PUBLICADO': SITUACAO_COMPRA.DIVULGADA,
  'IMPUGNACAO': SITUACAO_COMPRA.DIVULGADA,
  'ACOLHIMENTO_PROPOSTAS': SITUACAO_COMPRA.DIVULGADA,
  'ANALISE_PROPOSTAS': SITUACAO_COMPRA.DIVULGADA,
  'EM_DISPUTA': SITUACAO_COMPRA.DIVULGADA,
  'JULGAMENTO': SITUACAO_COMPRA.DIVULGADA,
  'HABILITACAO': SITUACAO_COMPRA.DIVULGADA,
  'RECURSO': SITUACAO_COMPRA.DIVULGADA,
  'ADJUDICACAO': SITUACAO_COMPRA.DIVULGADA,
  'HOMOLOGACAO': SITUACAO_COMPRA.DIVULGADA,
  'CONCLUIDA': SITUACAO_COMPRA.DIVULGADA,
  'REVOGADA': SITUACAO_COMPRA.REVOGADA,
  'ANULADA': SITUACAO_COMPRA.ANULADA,
  'SUSPENSA': SITUACAO_COMPRA.SUSPENSA,
  'DESERTA': SITUACAO_COMPRA.DESERTA,
  'FRACASSADA': SITUACAO_COMPRA.FRACASSADA
};
