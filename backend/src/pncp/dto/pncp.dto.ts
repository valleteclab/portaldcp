// DTOs para integração com PNCP

// ============ PCA - Plano de Contratações Anual ============
export class PcaDto {
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

// ============ Compra/Contratação ============
export class OrgaoEntidadeDto {
  cnpj: string;
  razaoSocial: string;
}

export class UnidadeOrgaoDto {
  codigoUnidade: string;
  nomeUnidade: string;
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

// ============ Resultado do Item ============
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

// ============ Ata de Registro de Preços ============
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
