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
// Tabelas de domínio do PNCP (Manual de Integração 2.3.8, seção 5, e
// docs/Tabelas de Domínio e Regras de Conformid.md). Os mapeamentos a partir
// dos dados da licitação ficam em `../mapeamento-pncp.ts`.

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
  MANIFESTACAO_INTERESSE: 10,
  PRE_QUALIFICACAO: 11,
  CREDENCIAMENTO: 12,
  LEILAO_PRESENCIAL: 13,
} as const;

/** Situação da Contratação (5.5) — não existe "deserta"/"fracassada" na compra: são situações do ITEM. */
export const SITUACAO_COMPRA = {
  DIVULGADA: 1,
  REVOGADA: 2,
  ANULADA: 3,
  SUSPENSA: 4,
} as const;

/** Situação do Item da Contratação (5.6). */
export const SITUACAO_ITEM = {
  EM_ANDAMENTO: 1,
  HOMOLOGADO: 2,
  ANULADO_REVOGADO_CANCELADO: 3,
  DESERTO: 4,
  FRACASSADO: 5,
} as const;

/** Modo de Disputa (5.3). */
export const MODO_DISPUTA = {
  ABERTO: 1,
  FECHADO: 2,
  ABERTO_FECHADO: 3,
  DISPENSA_COM_DISPUTA: 4,
  NAO_SE_APLICA: 5,
  FECHADO_ABERTO: 6,
} as const;

/** Instrumento Convocatório. */
export const INSTRUMENTO_CONVOCATORIO = {
  EDITAL: 1,
  AVISO_CONTRATACAO_DIRETA: 2,
  ATO_AUTORIZA_CONTRATACAO_DIRETA: 3,
} as const;

/**
 * Critério de Julgamento. O código 3 ("melhor técnica ou conteúdo artístico")
 * foi desativado no portal e substituído por 8 (melhor técnica) e 9
 * (conteúdo artístico) — conferir na tabela vigente em pncp.gov.br/app/entidades-dominio.
 */
export const CRITERIO_JULGAMENTO = {
  MENOR_PRECO: 1,
  MAIOR_DESCONTO: 2,
  TECNICA_PRECO: 4,
  MAIOR_LANCE: 5,
  MAIOR_RETORNO_ECONOMICO: 6,
  NAO_SE_APLICA: 7,
  MELHOR_TECNICA: 8,
  CONTEUDO_ARTISTICO: 9,
} as const;

/** Tipo de Benefício (5.7). */
export const TIPO_BENEFICIO = {
  EXCLUSIVA_ME_EPP: 1,
  SUBCONTRATACAO_ME_EPP: 2,
  COTA_RESERVADA_ME_EPP: 3,
  SEM_BENEFICIO: 4,
  NAO_SE_APLICA: 5,
} as const;

/** Tipo de Documento (5.12): contratação 1–10, 16, 19, 20; ata 11; contrato 12–15. */
export const TIPO_DOCUMENTO = {
  AVISO_CONTRATACAO_DIRETA: 1,
  EDITAL: 2,
  MINUTA_CONTRATO: 3,
  TERMO_REFERENCIA: 4,
  ANTEPROJETO: 5,
  PROJETO_BASICO: 6,
  ETP: 7,
  PROJETO_EXECUTIVO: 8,
  MAPA_RISCOS: 9,
  DFD: 10,
  ATA_REGISTRO_PRECO: 11,
  CONTRATO: 12,
  TERMO_RESCISAO: 13,
  TERMO_ADITIVO: 14,
  TERMO_APOSTILAMENTO: 15,
  OUTROS: 16,
  MINUTA_ATA: 19,
  ATO_AUTORIZA_CONTRATACAO_DIRETA: 20,
} as const;

export const TIPO_CONTRATO = {
  CONTRATO: 1,
  COMODATO: 2,
  ARRENDAMENTO: 3,
  CONCESSAO: 4,
  TERMO_ADESAO: 5,
  EMPENHO: 7,
  OUTROS: 8,
  CARTA_CONTRATO: 12,
} as const;

/** Porte da Empresa (5.14). */
export const PORTE_FORNECEDOR = {
  ME: 1,
  EPP: 2,
  DEMAIS: 3,
  NAO_SE_APLICA: 4,
  NAO_INFORMADO: 5,
} as const;

/** Categoria do Processo (5.11). */
export const CATEGORIA_PROCESSO = {
  CESSAO: 1,
  COMPRAS: 2,
  INFORMATICA: 3,
  INTERNACIONAL: 4,
  LOCACAO_IMOVEIS: 5,
  MAO_DE_OBRA: 6,
  OBRAS: 7,
  SERVICOS: 8,
  SERVICOS_ENGENHARIA: 9,
  SERVICOS_SAUDE: 10,
  ALIENACAO: 11,
} as const;

/** Modalidades do sistema → PNCP (usado também na validação pré-envio). */
export const MODALIDADE_SISTEMA_PARA_PNCP: Record<string, number> = {
  'PREGAO_ELETRONICO': MODALIDADES_CONTRATACAO.PREGAO_ELETRONICO,
  'PREGAO_PRESENCIAL': MODALIDADES_CONTRATACAO.PREGAO_PRESENCIAL,
  'CONCORRENCIA': MODALIDADES_CONTRATACAO.CONCORRENCIA_ELETRONICA,
  'CONCORRENCIA_ELETRONICA': MODALIDADES_CONTRATACAO.CONCORRENCIA_ELETRONICA,
  'CONCORRENCIA_PRESENCIAL': MODALIDADES_CONTRATACAO.CONCORRENCIA_PRESENCIAL,
  'DISPENSA': MODALIDADES_CONTRATACAO.DISPENSA,
  'DISPENSA_ELETRONICA': MODALIDADES_CONTRATACAO.DISPENSA,
  'INEXIGIBILIDADE': MODALIDADES_CONTRATACAO.INEXIGIBILIDADE,
  'LEILAO': MODALIDADES_CONTRATACAO.LEILAO_ELETRONICO,
  'CONCURSO': MODALIDADES_CONTRATACAO.CONCURSO,
  'DIALOGO_COMPETITIVO': MODALIDADES_CONTRATACAO.DIALOGO_COMPETITIVO,
  'CREDENCIAMENTO': MODALIDADES_CONTRATACAO.CREDENCIAMENTO,
};

// ============ Payloads enviados ao PNCP (montados na hora do envio) ============

/** Item da contratação (6.3.1, item 18). */
export interface ItemCompraPncp {
  numeroItem: number;
  materialOuServico: 'M' | 'S';
  tipoBeneficioId: number;
  incentivoProdutivoBasico: boolean;
  descricao: string;
  quantidade: number;
  unidadeMedida: string;
  valorUnitarioEstimado: number;
  valorTotal: number;
  criterioJulgamentoId: number;
  orcamentoSigiloso: boolean;
  itemCategoriaId?: number;
  codigoItemCatalogo?: string;
  aplicabilidadeMargemPreferenciaNormal: boolean;
  aplicabilidadeMargemPreferenciaAdicional: boolean;
  percentualMargemPreferenciaNormal?: number | null;
  percentualMargemPreferenciaAdicional?: number | null;
  situacaoCompraItemId?: number;
  patrimonio?: string | null;
  justificativa?: string;
}

/** Contratação (6.3.1). */
export interface CompraPncp {
  codigoUnidadeCompradora: string;
  anoCompra: number;
  numeroCompra: string;
  numeroProcesso: string;
  objetoCompra: string;
  tipoInstrumentoConvocatorioId: number;
  modalidadeId: number;
  modoDisputaId: number;
  srp: boolean;
  dataAberturaProposta?: string;
  dataEncerramentoProposta?: string;
  informacaoComplementar: string;
  amparoLegalId: number;
  linkSistemaOrigem: string;
  itensCompra: ItemCompraPncp[];
}

/** Resultado do item (6.3.15). */
export interface ResultadoItemPncp {
  quantidadeHomologada: number;
  valorUnitarioHomologado: number;
  valorTotalHomologado: number;
  percentualDesconto: number;
  tipoPessoaId: 'PF' | 'PJ' | 'PE';
  niFornecedor: string;
  nomeRazaoSocialFornecedor: string;
  porteFornecedorId: number;
  codigoPais: string;
  indicadorSubcontratacao: boolean;
  ordemClassificacaoSrp: number;
  dataResultado: string;
  aplicacaoMargemPreferencia: boolean;
  aplicacaoBeneficioMeEpp: boolean;
  aplicacaoCriterioDesempate: boolean;
  amparoLegalCriterioDesempateId?: number;
  situacaoCompraItemResultadoId: number;
}
