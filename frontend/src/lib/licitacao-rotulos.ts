/**
 * Rótulos da licitação — módulo ÚNICO para todas as telas (órgão, fornecedor e
 * portal público; E8/E9). Fase = etapa do processo; a situação (suspensa,
 * revogada...) fica em `licitacao-situacao.ts`.
 */

export const ROTULO_FASE: Record<string, string> = {
  PLANEJAMENTO: 'Planejamento',
  TERMO_REFERENCIA: 'Termo de Referência',
  PESQUISA_PRECOS: 'Pesquisa de Preços',
  ANALISE_JURIDICA: 'Análise Jurídica',
  APROVACAO_INTERNA: 'Aprovação Interna',
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
  // Legado (E1): a situação vive em `licitacao.situacao`; linhas antigas ainda podem trazer estes valores
  CONCLUIDO: 'Concluído',
  FRACASSADO: 'Fracassado',
  DESERTO: 'Deserto',
  REVOGADO: 'Revogado',
  ANULADO: 'Anulado',
  SUSPENSO: 'Suspenso',
}

/** Fases da etapa preparatória (fase interna). */
export const FASES_INTERNAS = ['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA']

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
  CONCLUIDO: 'bg-green-100 text-green-800',
  FRACASSADO: 'bg-red-100 text-red-700',
  DESERTO: 'bg-gray-100 text-gray-700',
  REVOGADO: 'bg-gray-100 text-gray-700',
  ANULADO: 'bg-gray-100 text-gray-700',
  SUSPENSO: 'bg-red-100 text-red-700',
}

export const rotuloFase = (fase?: string | null) => (fase ? ROTULO_FASE[fase] ?? fase : '—')
export const corFase = (fase?: string | null) =>
  fase ? COR_FASE[fase] ?? (FASES_INTERNAS.includes(fase) ? 'bg-gray-100 text-gray-800' : 'bg-gray-100 text-gray-700') : 'bg-gray-100 text-gray-700'

export const ROTULO_MODALIDADE: Record<string, string> = {
  PREGAO_ELETRONICO: 'Pregão Eletrônico',
  CONCORRENCIA: 'Concorrência',
  DISPENSA_ELETRONICA: 'Dispensa Eletrônica',
  INEXIGIBILIDADE: 'Inexigibilidade',
  CREDENCIAMENTO: 'Credenciamento',
  LEILAO: 'Leilão',
  CONCURSO: 'Concurso',
  DIALOGO_COMPETITIVO: 'Diálogo Competitivo',
  // Legado (Lei 8.666 / cadastros antigos)
  PREGAO_PRESENCIAL: 'Pregão Presencial',
  CONCORRENCIA_PUBLICA: 'Concorrência Pública',
  TOMADA_PRECOS: 'Tomada de Preços',
  CONVITE: 'Convite',
  DISPENSA: 'Dispensa',
}

export const rotuloModalidade = (modalidade?: string | null) =>
  modalidade ? ROTULO_MODALIDADE[modalidade] ?? modalidade.replace(/_/g, ' ') : '—'

export const ROTULO_CRITERIO: Record<string, string> = {
  MENOR_PRECO: 'Menor Preço',
  MAIOR_DESCONTO: 'Maior Desconto',
  MELHOR_TECNICA: 'Melhor Técnica',
  TECNICA_E_PRECO: 'Técnica e Preço',
  TECNICA_PRECO: 'Técnica e Preço',
  MAIOR_LANCE: 'Maior Lance',
  MAIOR_RETORNO_ECONOMICO: 'Maior Retorno Econômico',
}

export const ROTULO_MODO_DISPUTA: Record<string, string> = {
  ABERTO: 'Aberto',
  FECHADO: 'Fechado',
  ABERTO_FECHADO: 'Aberto e Fechado',
  FECHADO_ABERTO: 'Fechado e Aberto',
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
