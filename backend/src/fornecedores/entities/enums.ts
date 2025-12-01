// Enums compartilhados entre entidades

export enum TipoPessoa {
  FISICA = 'FISICA',
  JURIDICA = 'JURIDICA',
}

export enum PorteEmpresa {
  MEI = 'MEI', // Microempreendedor Individual
  ME = 'ME', // Microempresa
  EPP = 'EPP', // Empresa de Pequeno Porte
  MEDIO = 'MEDIO',
  GRANDE = 'GRANDE',
}

export enum NivelCadastro {
  NIVEL_I = 'NIVEL_I', // Credenciamento
  NIVEL_II = 'NIVEL_II', // Habilitação Jurídica
  NIVEL_III = 'NIVEL_III', // Regularidade Fiscal Federal
  NIVEL_IV = 'NIVEL_IV', // Regularidade Fiscal Estadual/Municipal
  NIVEL_V = 'NIVEL_V', // Qualificação Técnica
  NIVEL_VI = 'NIVEL_VI', // Qualificação Econômico-Financeira
}

export enum StatusCadastro {
  PENDENTE = 'PENDENTE',
  EM_ANALISE = 'EM_ANALISE',
  APROVADO = 'APROVADO',
  REJEITADO = 'REJEITADO',
  SUSPENSO = 'SUSPENSO',
}

export enum TipoDocumento {
  // Nível II - Habilitação Jurídica
  CARTAO_CNPJ = 'CARTAO_CNPJ',
  CONTRATO_SOCIAL = 'CONTRATO_SOCIAL',
  ESTATUTO_SOCIAL = 'ESTATUTO_SOCIAL',
  ATA_ELEICAO = 'ATA_ELEICAO',
  DOCUMENTO_IDENTIDADE_REPRESENTANTE = 'DOCUMENTO_IDENTIDADE_REPRESENTANTE',
  PROCURACAO = 'PROCURACAO',
  DOCUMENTO_IDENTIDADE_PROCURADOR = 'DOCUMENTO_IDENTIDADE_PROCURADOR',

  // Nível III - Regularidade Fiscal e Trabalhista Federal
  CND_RECEITA_FEDERAL_PGFN = 'CND_RECEITA_FEDERAL_PGFN',
  CRF_FGTS = 'CRF_FGTS',
  CNDT_TST = 'CNDT_TST',

  // Nível IV - Regularidade Fiscal Estadual/Distrital e Municipal
  INSCRICAO_ESTADUAL_ARQUIVO = 'INSCRICAO_ESTADUAL_ARQUIVO',
  INSCRICAO_MUNICIPAL_ARQUIVO = 'INSCRICAO_MUNICIPAL_ARQUIVO',
  CND_ESTADUAL = 'CND_ESTADUAL',
  CND_MUNICIPAL = 'CND_MUNICIPAL',

  // Nível V - Qualificação Técnica
  ATESTADO_CAPACIDADE_TECNICA = 'ATESTADO_CAPACIDADE_TECNICA',
  REGISTRO_CONSELHO_CLASSE = 'REGISTRO_CONSELHO_CLASSE',
  CERTIFICACAO_TECNICA = 'CERTIFICACAO_TECNICA',

  // Nível VI - Qualificação Econômico-Financeira
  BALANCO_PATRIMONIAL = 'BALANCO_PATRIMONIAL',
  DRE = 'DRE',
  DEMONSTRACOES_CONTABEIS = 'DEMONSTRACOES_CONTABEIS',
  CERTIDAO_FALENCIA_RECUPERACAO = 'CERTIDAO_FALENCIA_RECUPERACAO',

  // Outros
  OUTROS = 'OUTROS',
}

export enum TipoComprovante {
  CERTIDAO = 'CERTIDAO',
  DECISAO_JUDICIAL = 'DECISAO_JUDICIAL',
  ISENCAO = 'ISENCAO',
}

export enum StatusDocumento {
  PENDENTE = 'PENDENTE',
  EM_ANALISE = 'EM_ANALISE',
  APROVADO = 'APROVADO',
  REJEITADO = 'REJEITADO',
  VENCIDO = 'VENCIDO',
}
