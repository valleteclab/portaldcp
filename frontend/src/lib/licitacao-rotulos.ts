/**
 * Rótulos da licitação para as telas do fornecedor e do portal público
 * (plano E8). Fase = etapa do processo; a situação (suspensa, revogada...) fica
 * em `licitacao-situacao.ts`.
 */

export const ROTULO_FASE: Record<string, string> = {
  PUBLICADO: 'Publicado',
  IMPUGNACAO: 'Impugnação',
  ACOLHIMENTO_PROPOSTAS: 'Recebendo propostas',
  ANALISE_PROPOSTAS: 'Análise de propostas',
  EM_DISPUTA: 'Em disputa',
  JULGAMENTO: 'Julgamento',
  HABILITACAO: 'Habilitação',
  RECURSO: 'Recurso',
  ADJUDICACAO: 'Adjudicação',
  HOMOLOGACAO: 'Homologada',
}

export const COR_FASE: Record<string, string> = {
  PUBLICADO: 'bg-blue-100 text-blue-800',
  IMPUGNACAO: 'bg-yellow-100 text-yellow-800',
  ACOLHIMENTO_PROPOSTAS: 'bg-green-100 text-green-800',
  ANALISE_PROPOSTAS: 'bg-purple-100 text-purple-800',
  EM_DISPUTA: 'bg-red-100 text-red-800',
  JULGAMENTO: 'bg-orange-100 text-orange-800',
  HABILITACAO: 'bg-indigo-100 text-indigo-800',
  RECURSO: 'bg-pink-100 text-pink-800',
  ADJUDICACAO: 'bg-teal-100 text-teal-800',
  HOMOLOGACAO: 'bg-emerald-100 text-emerald-800',
}

export const ROTULO_MODALIDADE: Record<string, string> = {
  PREGAO_ELETRONICO: 'Pregão Eletrônico',
  CONCORRENCIA: 'Concorrência',
  DISPENSA_ELETRONICA: 'Dispensa Eletrônica',
  INEXIGIBILIDADE: 'Inexigibilidade',
  CREDENCIAMENTO: 'Credenciamento',
  LEILAO: 'Leilão',
  CONCURSO: 'Concurso',
  DIALOGO_COMPETITIVO: 'Diálogo Competitivo',
}

export const ROTULO_STATUS_PROPOSTA: Record<string, string> = {
  RASCUNHO: 'Rascunho',
  ENVIADA: 'Enviada',
  RECEBIDA: 'Recebida',
  EM_ANALISE: 'Em análise',
  CLASSIFICADA: 'Classificada',
  DESCLASSIFICADA: 'Desclassificada',
  VENCEDORA: 'Vencedora',
  CANCELADA: 'Cancelada',
}

/** Data/hora no fuso de Brasília (convenção do projeto para telas e PDFs). */
export function dataHoraBR(valor?: string | Date | null): string {
  if (!valor) return '—'
  const d = new Date(valor)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export const moedaBR = (v?: number | null) =>
  v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
