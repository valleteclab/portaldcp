// Tipos compartilhados para o cadastro SICAF

export interface UploadedFileInfo {
  filename: string
  originalname: string
  url: string
  size?: number
}

export interface DadosCnpj {
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  natureza_juridica: string
  capital_social: number
  data_inicio_atividade: string
  porte: string
  tipo_estabelecimento: string
  telefone: string | null
  telefone_secundario: string | null
  email: string | null
  situacao: {
    nome: string
    data: string
    motivo: string
  }
  endereco: {
    tipo_logradouro: string
    logradouro: string
    numero: string
    complemento: string | null
    bairro: string
    cep: string
    uf: string
    cidade: string
  }
  simples: {
    optante: boolean
    data_opcao: string | null
    data_exclusao: string | null
  }
  mei: {
    optante: boolean
    data_opcao: string | null
    data_exclusao: string | null
  }
  socios: Array<{
    nome: string
    cpf_cnpj: string
    data_entrada: string
    qualificacao: string
  }>
  atividade_principal: {
    codigo: string
    descricao: string
  }
  atividades_secundarias: Array<{
    codigo: string
    descricao: string
  }>
}

export interface Representante {
  nome: string
  cpf: string
  cargo: string
  email: string
  telefone: string
}

export interface Procurador {
  nome: string
  cpf: string
  email: string
  telefone: string
}

export interface CertidaoFiscal {
  tipoComprovante: 'CERTIDAO' | 'DECISAO_JUDICIAL' | 'ISENCAO'
  codigoControle: string
  dataValidade: string
  arquivo?: File | null
  arquivoInfo?: UploadedFileInfo
}

export interface FiscalFederal {
  receitaFederal: CertidaoFiscal
  fgts: CertidaoFiscal
  tst: CertidaoFiscal
}

export interface FiscalEstadual {
  inscricaoEstadual: string
  inscricaoEstadualArquivo: File | null
  inscricaoEstadualArquivoInfo?: UploadedFileInfo
  inscricaoMunicipal: string
  inscricaoMunicipalArquivo: File | null
  inscricaoMunicipalArquivoInfo?: UploadedFileInfo
  certidaoEstadual: CertidaoFiscal
  certidaoMunicipal: CertidaoFiscal
}

export interface AtestadoTecnico {
  id: string
  emissor: string
  data: string
  descricao: string
  arquivo?: File | null
  arquivoInfo?: UploadedFileInfo
}

export interface BalancoPatrimonial {
  id: string
  ano: string
  tipo: string
  demonstracaoContabil: string
  exercicioFinanceiro: string
  validade: string
  arquivo?: File | null
  arquivoInfo?: UploadedFileInfo
}

export interface HabilitacaoJuridica {
  cnpjRegular: boolean
  contratoSocial: File | null
  contratoSocialInfo?: UploadedFileInfo
  documentoRepresentante: File | null
  documentoRepresentanteInfo?: UploadedFileInfo
  procuracaoArquivo: File | null
  procuracaoArquivoInfo?: UploadedFileInfo
  documentoProcurador: File | null
  documentoProcuradorInfo?: UploadedFileInfo
}

// Níveis do SICAF
export const NIVEIS_SICAF = [
  { id: 'credenciamento', label: 'Credenciamento', obrigatorio: true },
  { id: 'habilitacao', label: 'Hab. Jurídica', obrigatorio: false },
  { id: 'fiscal-federal', label: 'Reg. Fiscal Federal', obrigatorio: false },
  { id: 'fiscal-estadual', label: 'Reg. Fiscal Est/Mun', obrigatorio: false },
  { id: 'tecnica', label: 'Qual. Técnica', obrigatorio: false },
  { id: 'economica', label: 'Qual. Econômica', obrigatorio: false },
] as const

export type NivelSicaf = typeof NIVEIS_SICAF[number]['id']

// Funções utilitárias
export const formatarCnpj = (valor: string): string => {
  const numeros = valor.replace(/\D/g, '')
  if (numeros.length <= 14) {
    return numeros
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return valor
}

export const formatarCpf = (valor: string): string => {
  const numeros = valor.replace(/\D/g, '')
  if (numeros.length <= 11) {
    return numeros
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1-$2')
  }
  return valor
}

export const formatarMoeda = (valor: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor)
}
