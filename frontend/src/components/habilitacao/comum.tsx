'use client'

import { API_URL, authFetch } from '@/lib/api'

/**
 * Tipos e utilitários comuns das telas de HABILITAÇÃO (plano E4 — Lei
 * 14.133/2021 arts. 62–70; IN SEGES 73/2022 art. 39). O backend
 * (/api/habilitacao) é dono das regras: a tela só pede o ato e mostra o
 * resultado (prazo, cobertura do cadastro, análise, pendências).
 */

export type Categoria = 'JURIDICA' | 'FISCAL' | 'SOCIAL_TRABALHISTA' | 'ECONOMICO_FINANCEIRA' | 'TECNICA'

export interface Exigencia {
  id: string
  categoria: Categoria | string
  descricao: string
  base_legal?: string | null
  obrigatorio: boolean
  aceita_registro_cadastral: boolean
  tipos_documento_cadastro: string[]
  exige_validade: boolean
  ordem: number
  modelo?: string | null
}

export interface DocumentoHab {
  id: string
  exigenciaId: string
  origem: 'CADASTRO' | 'ENVIO' | 'COMPLEMENTO'
  diligenciaId?: string | null
  arquivo: { nome: string; mime: string; tamanho: number; sha256: string } | null
  cadastro: { tipo: string; numero?: string | null; emissao?: string | null; validade?: string | null; nomeArquivo?: string | null; caminhoArquivo?: string | null } | null
  validade?: string | null
  observacao?: string | null
  enviadoEm: string
  analise: 'PENDENTE' | 'ATENDE' | 'NAO_ATENDE' | 'DILIGENCIA'
  analiseMotivo?: string | null
  analisadoEm?: string | null
  podeRemover: boolean
}

export interface ExigenciaHab extends Exigencia {
  situacao: 'ATENDIDA' | 'NAO_ATENDIDA' | 'EM_ANALISE' | 'SEM_DOCUMENTO'
  cobertaPeloCadastro: boolean
  motivoCadastro?: string | null
  documentos: DocumentoHab[]
  podeEnviar: boolean
  envioComo?: 'ENVIO' | 'COMPLEMENTO' | null
}

export interface DiligenciaHab {
  id: string
  motivo: string
  exigenciaIds: string[]
  prazoHoras: number
  abertaEm: string
  prazoAte: string
  status: 'ABERTA' | 'RESPONDIDA' | 'EXPIRADA'
  respondidaEm?: string | null
  resposta?: string | null
}

export interface Habilitacao {
  id: string
  licitacaoId: string
  fornecedorId: string
  razaoSocial?: string | null
  cpfCnpj?: string | null
  origem: 'CONVOCACAO' | 'INVERSAO' | 'MIGRACAO'
  status: 'AGUARDANDO_ENVIO' | 'ENVIADA' | 'EM_DILIGENCIA' | 'HABILITADO' | 'INABILITADO' | 'CANCELADA'
  convocadaEm: string
  prazoHoras: number | null
  prazoAte: string | null
  prazoEncerrado: boolean
  prorrogadaEm?: string | null
  prorrogacaoMotivo?: string | null
  podeProrrogar: boolean
  enviadaEm?: string | null
  decididaEm?: string | null
  decisaoMotivo?: string | null
  podeConcluirEnvio: boolean
  podeAnalisar: boolean
  podeHabilitar: boolean
  podeInabilitar: boolean
  pendencias: string[]
  exigencias: ExigenciaHab[]
  diligencias: DiligenciaHab[]
  diligenciaVigenteId: string | null
  podeResponderDiligencia: boolean
}

export const ROTULO_CATEGORIA: Record<string, string> = {
  JURIDICA: 'Habilitação jurídica (art. 66)',
  FISCAL: 'Regularidade fiscal (art. 68)',
  SOCIAL_TRABALHISTA: 'Regularidade social e trabalhista (art. 68)',
  ECONOMICO_FINANCEIRA: 'Qualificação econômico-financeira (art. 69)',
  TECNICA: 'Qualificação técnica (art. 67)',
}

export const ORDEM_CATEGORIAS = ['JURIDICA', 'FISCAL', 'SOCIAL_TRABALHISTA', 'ECONOMICO_FINANCEIRA', 'TECNICA']

export const ROTULO_TIPO_DOC: Record<string, string> = {
  CARTAO_CNPJ: 'Cartão CNPJ',
  CONTRATO_SOCIAL: 'Contrato social',
  ESTATUTO_SOCIAL: 'Estatuto social',
  ATA_ELEICAO: 'Ata de eleição',
  DOCUMENTO_IDENTIDADE_REPRESENTANTE: 'Identidade do representante',
  PROCURACAO: 'Procuração',
  DOCUMENTO_IDENTIDADE_PROCURADOR: 'Identidade do procurador',
  CND_RECEITA_FEDERAL_PGFN: 'CND federal (RFB/PGFN)',
  CRF_FGTS: 'CRF do FGTS',
  CNDT_TST: 'CNDT',
  INSCRICAO_ESTADUAL_ARQUIVO: 'Inscrição estadual',
  INSCRICAO_MUNICIPAL_ARQUIVO: 'Inscrição municipal',
  CND_ESTADUAL: 'CND estadual',
  CND_MUNICIPAL: 'CND municipal',
  ATESTADO_CAPACIDADE_TECNICA: 'Atestado de capacidade técnica',
  REGISTRO_CONSELHO_CLASSE: 'Registro no conselho (CREA/CAU)',
  CERTIFICACAO_TECNICA: 'Certificação técnica',
  BALANCO_PATRIMONIAL: 'Balanço patrimonial',
  DRE: 'DRE',
  DEMONSTRACOES_CONTABEIS: 'Demonstrações contábeis',
  CERTIDAO_FALENCIA_RECUPERACAO: 'Certidão de falência/recuperação',
}

export const ROTULO_STATUS_HAB: Record<string, { label: string; cls: string }> = {
  AGUARDANDO_ENVIO: { label: 'Aguardando envio', cls: 'bg-blue-100 text-blue-800' },
  ENVIADA: { label: 'Em análise', cls: 'bg-amber-100 text-amber-800' },
  EM_DILIGENCIA: { label: 'Em diligência', cls: 'bg-violet-100 text-violet-800' },
  HABILITADO: { label: 'Habilitado', cls: 'bg-emerald-600 text-white' },
  INABILITADO: { label: 'Inabilitado', cls: 'bg-red-100 text-red-700' },
  CANCELADA: { label: 'Cancelada', cls: 'bg-slate-100 text-slate-600' },
}

export const ROTULO_ANALISE: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: 'Pendente', cls: 'bg-slate-100 text-slate-700' },
  ATENDE: { label: 'Atende', cls: 'bg-emerald-100 text-emerald-800' },
  NAO_ATENDE: { label: 'Não atende', cls: 'bg-red-100 text-red-700' },
  DILIGENCIA: { label: 'Diligência', cls: 'bg-violet-100 text-violet-800' },
}

export const ROTULO_SITUACAO_EXIGENCIA: Record<string, { label: string; cls: string }> = {
  ATENDIDA: { label: 'Atendida', cls: 'bg-emerald-100 text-emerald-800' },
  NAO_ATENDIDA: { label: 'Não atendida', cls: 'bg-red-100 text-red-700' },
  EM_ANALISE: { label: 'Em análise', cls: 'bg-amber-100 text-amber-800' },
  SEM_DOCUMENTO: { label: 'Sem documento', cls: 'bg-slate-100 text-slate-600' },
}

export const ROTULO_ORIGEM_DOC: Record<string, string> = {
  CADASTRO: 'Registro cadastral',
  ENVIO: 'Enviado',
  COMPLEMENTO: 'Complemento (diligência)',
}

export function dataHora(v?: string | null) {
  if (!v) return '-'
  return new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** 'AAAA-MM-DD' → 'DD/MM/AAAA' (validade é por data — sem conversão de fuso). */
export function data(v?: string | null) {
  if (!v) return '-'
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function contagem(prazoAte: string | null, agora: number) {
  if (!prazoAte) return '--:--:--'
  const s = Math.max(0, Math.floor((new Date(prazoAte).getTime() - agora) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}`
}

/** Agrupa exigências por categoria, na ordem do art. 62. */
export function porCategoria<T extends { categoria: string }>(lista: T[]): Array<{ categoria: string; itens: T[] }> {
  const cats = [...new Set([...ORDEM_CATEGORIAS, ...lista.map((e) => e.categoria)])]
  return cats.map((categoria) => ({ categoria, itens: lista.filter((e) => e.categoria === categoria) })).filter((g) => g.itens.length > 0)
}

/** Abre o arquivo do documento (autenticado — nunca link público). */
export async function abrirDocumento(documentoId: string) {
  const res = await authFetch(`${API_URL}/api/habilitacao/documentos/${documentoId}/arquivo`)
  if (!res.ok) throw new Error('Não foi possível abrir o documento')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  window.open(url, '_blank', 'noopener')
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/** URL do arquivo do registro cadastral (servido pelo módulo de fornecedores). */
export function urlCadastro(caminho?: string | null) {
  if (!caminho) return null
  return caminho.startsWith('http') ? caminho : `${API_URL}${caminho.startsWith('/') ? '' : '/'}${caminho}`
}

/** Mensagem de erro do backend (string ou lista de pendências). */
export async function mensagemDeErro(res: Response, padrao: string) {
  const e = await res.json().catch(() => null)
  if (!e) return padrao
  if (Array.isArray(e.pendencias) && e.pendencias.length) return `${e.message ?? padrao}`
  return (Array.isArray(e.message) ? e.message.join(' | ') : e.message) || padrao
}
