import { CategoriaExigencia as C, ExigenciaEntrada } from './regras-habilitacao';

/**
 * ============================================================================
 * MODELOS PADRÃO DE EXIGÊNCIAS DE HABILITAÇÃO (plano E4 item 1)
 * ============================================================================
 *
 * Versionados no código (não há tabela de modelos): o edital parte do modelo
 * do OBJETO (bens, serviços, obras/serviços de engenharia) e o órgão ajusta na
 * edição da licitação. Dispensa eletrônica usa o modelo reduzido (Lei 14.133
 * art. 70 III — documentação dispensável nas contratações de pequeno valor; a
 * regularidade com a Seguridade Social e o FGTS permanece — CF art. 195 §3º).
 *
 * `tipos_documento_cadastro` = tipos do registro cadastral que ATENDEM a
 * exigência (art. 70: documentos substituídos pelo registro cadastral).
 */

export type ChaveModelo = 'BENS' | 'SERVICOS' | 'OBRAS' | 'DISPENSA';

export const ROTULO_MODELO: Record<ChaveModelo, string> = {
  BENS: 'Aquisição de bens',
  SERVICOS: 'Serviços (comuns e especiais)',
  OBRAS: 'Obras e serviços de engenharia',
  DISPENSA: 'Dispensa eletrônica (documentação reduzida)',
};

const juridica: ExigenciaEntrada[] = [
  {
    categoria: C.JURIDICA,
    descricao: 'Ato constitutivo, estatuto ou contrato social em vigor (com alterações), ou inscrição do empresário',
    base_legal: 'Lei 14.133/2021, art. 66',
    tipos_documento_cadastro: ['CONTRATO_SOCIAL', 'ESTATUTO_SOCIAL'],
  },
  {
    categoria: C.JURIDICA,
    descricao: 'Documento de identificação do representante legal (e procuração, quando for o caso)',
    base_legal: 'Lei 14.133/2021, art. 66',
    tipos_documento_cadastro: ['DOCUMENTO_IDENTIDADE_REPRESENTANTE', 'DOCUMENTO_IDENTIDADE_PROCURADOR'],
  },
];

const fiscalFederal: ExigenciaEntrada[] = [
  {
    categoria: C.FISCAL,
    descricao: 'Inscrição no Cadastro Nacional da Pessoa Jurídica (CNPJ)',
    base_legal: 'Lei 14.133/2021, art. 68, I',
    tipos_documento_cadastro: ['CARTAO_CNPJ'],
  },
  {
    categoria: C.FISCAL,
    descricao: 'Certidão conjunta de débitos relativos a tributos federais e à Dívida Ativa da União (RFB/PGFN)',
    base_legal: 'Lei 14.133/2021, art. 68, III',
    tipos_documento_cadastro: ['CND_RECEITA_FEDERAL_PGFN'],
    exige_validade: true,
  },
  {
    categoria: C.FISCAL,
    descricao: 'Certificado de Regularidade do FGTS (CRF)',
    base_legal: 'Lei 14.133/2021, art. 68, IV',
    tipos_documento_cadastro: ['CRF_FGTS'],
    exige_validade: true,
  },
];

const fiscalLocal: ExigenciaEntrada[] = [
  {
    categoria: C.FISCAL,
    descricao: 'Inscrição no cadastro de contribuintes estadual e/ou municipal, pertinente ao objeto',
    base_legal: 'Lei 14.133/2021, art. 68, II',
    tipos_documento_cadastro: ['INSCRICAO_ESTADUAL_ARQUIVO', 'INSCRICAO_MUNICIPAL_ARQUIVO'],
  },
  {
    categoria: C.FISCAL,
    descricao: 'Prova de regularidade com a Fazenda Estadual/Distrital',
    base_legal: 'Lei 14.133/2021, art. 68, III',
    tipos_documento_cadastro: ['CND_ESTADUAL'],
    exige_validade: true,
  },
  {
    categoria: C.FISCAL,
    descricao: 'Prova de regularidade com a Fazenda Municipal do domicílio ou sede',
    base_legal: 'Lei 14.133/2021, art. 68, III',
    tipos_documento_cadastro: ['CND_MUNICIPAL'],
    exige_validade: true,
  },
];

const trabalhista: ExigenciaEntrada[] = [
  {
    categoria: C.SOCIAL_TRABALHISTA,
    descricao: 'Certidão Negativa de Débitos Trabalhistas (CNDT)',
    base_legal: 'Lei 14.133/2021, art. 68, V',
    tipos_documento_cadastro: ['CNDT_TST'],
    exige_validade: true,
  },
  {
    categoria: C.SOCIAL_TRABALHISTA,
    descricao: 'Declaração de cumprimento do art. 7º, XXXIII, da Constituição (trabalho do menor)',
    base_legal: 'Lei 14.133/2021, art. 68, VI',
    aceita_registro_cadastral: false,
  },
];

const reservaPcd: ExigenciaEntrada = {
  categoria: C.SOCIAL_TRABALHISTA,
  descricao: 'Declaração de cumprimento da reserva de cargos para pessoa com deficiência e reabilitado da Previdência',
  base_legal: 'Lei 14.133/2021, art. 63, IV',
  aceita_registro_cadastral: false,
};

const economica = (obrigatorioBalanco: boolean): ExigenciaEntrada[] => [
  {
    categoria: C.ECONOMICO_FINANCEIRA,
    descricao: 'Balanço patrimonial e demonstrações contábeis dos 2 últimos exercícios sociais',
    base_legal: 'Lei 14.133/2021, art. 69, I',
    tipos_documento_cadastro: ['BALANCO_PATRIMONIAL', 'DEMONSTRACOES_CONTABEIS', 'DRE'],
    obrigatorio: obrigatorioBalanco,
  },
  {
    categoria: C.ECONOMICO_FINANCEIRA,
    descricao: 'Certidão negativa de falência expedida pelo distribuidor da sede do licitante',
    base_legal: 'Lei 14.133/2021, art. 69, II',
    tipos_documento_cadastro: ['CERTIDAO_FALENCIA_RECUPERACAO'],
    exige_validade: true,
  },
];

const atestado = (obrigatorio: boolean): ExigenciaEntrada => ({
  categoria: C.TECNICA,
  descricao: 'Atestado(s) de capacidade técnica compatível(is) com o objeto (parcelas de maior relevância)',
  base_legal: 'Lei 14.133/2021, art. 67, II',
  tipos_documento_cadastro: ['ATESTADO_CAPACIDADE_TECNICA'],
  obrigatorio,
});

export const MODELOS_EXIGENCIAS: Record<ChaveModelo, ExigenciaEntrada[]> = {
  BENS: [...juridica, ...fiscalFederal, ...fiscalLocal, ...trabalhista, reservaPcd, ...economica(false), atestado(false)],
  SERVICOS: [...juridica, ...fiscalFederal, ...fiscalLocal, ...trabalhista, reservaPcd, ...economica(true), atestado(true)],
  OBRAS: [
    ...juridica,
    ...fiscalFederal,
    ...fiscalLocal,
    ...trabalhista,
    reservaPcd,
    ...economica(true),
    atestado(true),
    {
      categoria: C.TECNICA,
      descricao: 'Registro ou inscrição na entidade profissional competente (CREA/CAU) da empresa e do responsável técnico',
      base_legal: 'Lei 14.133/2021, art. 67, V',
      tipos_documento_cadastro: ['REGISTRO_CONSELHO_CLASSE'],
      exige_validade: true,
    },
    {
      categoria: C.TECNICA,
      descricao: 'Declaração de vistoria ou de pleno conhecimento das condições do local da obra',
      base_legal: 'Lei 14.133/2021, art. 63, §§ 2º a 4º',
      aceita_registro_cadastral: false,
    },
  ],
  DISPENSA: [juridica[0], ...fiscalFederal, trabalhista[0], trabalhista[1]],
};

/** Modelo padrão da licitação pelo objeto e pela modalidade. */
export function chaveModeloPadrao(modalidade: string | null | undefined, tipoContratacao: string | null | undefined): ChaveModelo {
  if (modalidade === 'DISPENSA_ELETRONICA' || modalidade === 'INEXIGIBILIDADE') return 'DISPENSA';
  if (tipoContratacao === 'OBRA' || tipoContratacao === 'SERVICO_ENGENHARIA') return 'OBRAS';
  if (tipoContratacao === 'SERVICO') return 'SERVICOS';
  return 'BENS';
}

export function modeloExigencias(chave: ChaveModelo): ExigenciaEntrada[] {
  return (MODELOS_EXIGENCIAS[chave] ?? MODELOS_EXIGENCIAS.BENS).map((e, i) => ({
    obrigatorio: true,
    aceita_registro_cadastral: true,
    exige_validade: false,
    tipos_documento_cadastro: [],
    ...e,
    ordem: i + 1,
  }));
}

export function ehChaveModelo(v: unknown): v is ChaveModelo {
  return typeof v === 'string' && v in MODELOS_EXIGENCIAS;
}
