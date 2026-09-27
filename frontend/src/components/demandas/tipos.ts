/**
 * Tipos, rótulos e formatação comuns da tela da Demanda (pedido do setor).
 */
import type { ComponentType } from 'react'
import { CheckCircle, Clock, FileText, Send, XCircle } from 'lucide-react'

export interface ItemDemanda {
  id: string
  categoria: 'MATERIAL' | 'SERVICO'
  codigo_classe?: string
  nome_classe?: string
  codigo_item_catalogo?: string
  descricao_objeto: string
  justificativa?: string
  quantidade_estimada: number
  unidade_medida: string
  valor_unitario_estimado?: number
  valor_total_estimado?: number
  trimestre_previsto?: number
  data_desejada_contratacao?: string
  renovacao_contrato: boolean
  prioridade: number
  catalogo_utilizado: string
}

export type StatusDemanda =
  | 'RASCUNHO' | 'ENVIADA' | 'EM_ANALISE' | 'APROVADA' | 'REJEITADA' | 'CONSOLIDADA' | 'EM_CONTRATACAO' | 'CONTRATADA'

export interface Demanda {
  id: string
  orgao_id: string
  ano_referencia: number
  unidade_requisitante: string
  responsavel_nome?: string
  responsavel_email?: string
  responsavel_telefone?: string
  status: StatusDemanda
  observacoes?: string
  descricao_sucinta_objeto?: string
  data_desejada_contratacao?: string
  renovacao_contrato?: boolean
  motivo_rejeicao?: string
  created_at: string
  itens: ItemDemanda[]
  /** DFD consolidado (unidade de planejamento) em que a demanda entrou — travada enquanto estiver nele. */
  dfd?: { id: string; numero: number; ano: number; status: string; licitacao_id: string | null } | null
}

/** GET /api/demandas/:id/acompanhamento — o pedido andando (aprovação › DFD › PCA › processo › contrato). */
export interface AcompanhamentoDaDemanda {
  demanda: { data_aprovacao?: string | null }
  dfd?: { id: string; numero: number; ano: number } | null
  pca: { consolidada: boolean; itens: Array<{ ano_exercicio?: number; numero_item: number }> }
  processo?: { id: string; numero_processo: string; modalidade: string; fase?: string; data_homologacao?: string | null } | null
  contratos: Array<{ id: string; numero_contrato: string; assinatura_status?: string }>
}

/** Item escolhido na busca — mesma forma para qualquer fonte (federal, próprio, novo). */
export interface ItemSelecionado {
  codigo: string
  descricao: string
  tipo: 'MATERIAL' | 'SERVICO'
  unidade_padrao?: string
  codigo_classe?: string
  nome_classe?: string
  codigo_pdm?: string
  nome_pdm?: string
  descricao_detalhada?: string
  fonte: 'COMPRASGOV' | 'PROPRIO' | 'NOVO'
}

export interface FormItemState {
  quantidade_estimada: string
  unidade_medida: string
  valor_unitario_estimado: string
  trimestre_previsto: string
  prioridade: string
  renovacao_contrato: boolean
  codigo_classe?: string
  nome_classe?: string
}

export const STATUS_DEMANDA: Record<string, { label: string; cor: string; icon: ComponentType<{ className?: string }> }> = {
  RASCUNHO:       { label: 'Rascunho',       cor: 'bg-gray-100 text-gray-800',       icon: FileText },
  ENVIADA:        { label: 'Enviada',        cor: 'bg-blue-100 text-blue-800',       icon: Send },
  EM_ANALISE:     { label: 'Em análise',     cor: 'bg-yellow-100 text-yellow-800',   icon: Clock },
  APROVADA:       { label: 'Aprovada',       cor: 'bg-green-100 text-green-800',     icon: CheckCircle },
  REJEITADA:      { label: 'Rejeitada',      cor: 'bg-red-100 text-red-800',         icon: XCircle },
  CONSOLIDADA:    { label: 'No PCA',         cor: 'bg-purple-100 text-purple-800',   icon: CheckCircle },
  EM_CONTRATACAO: { label: 'Em contratação', cor: 'bg-indigo-100 text-indigo-800',   icon: Clock },
  CONTRATADA:     { label: 'Contratada',     cor: 'bg-emerald-100 text-emerald-800', icon: CheckCircle },
}

export const PRIORIDADE_ITEM: Record<number, { label: string; cor: string }> = {
  1: { label: 'Muito alta',  cor: 'bg-red-50 text-red-800 border-red-200' },
  2: { label: 'Alta',        cor: 'bg-orange-50 text-orange-800 border-orange-200' },
  3: { label: 'Média',       cor: 'bg-yellow-50 text-yellow-800 border-yellow-200' },
  4: { label: 'Baixa',       cor: 'bg-blue-50 text-blue-800 border-blue-200' },
  5: { label: 'Muito baixa', cor: 'bg-gray-50 text-gray-700 border-gray-200' },
}

/** Unidades de medida oferecidas no formulário do item (sigla gravada + nome por extenso na tela). */
export const UNIDADES_MEDIDA: Array<{ sigla: string; nome: string }> = [
  { sigla: 'UN', nome: 'Unidade' },
  { sigla: 'MES', nome: 'Mês' },
  { sigla: 'HR', nome: 'Hora' },
  { sigla: 'KG', nome: 'Quilograma' },
  { sigla: 'M', nome: 'Metro' },
  { sigla: 'M2', nome: 'Metro quadrado' },
  { sigla: 'M3', nome: 'Metro cúbico' },
  { sigla: 'L', nome: 'Litro' },
  { sigla: 'CX', nome: 'Caixa' },
  { sigla: 'PCT', nome: 'Pacote' },
  { sigla: 'RL', nome: 'Rolo' },
  { sigla: 'SV', nome: 'Serviço' },
]

export const fmtMoeda = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

export const totalDaDemanda = (itens: ItemDemanda[] | undefined) =>
  (itens ?? []).reduce((acc, item) => acc + (Number(item.valor_total_estimado) || 0), 0)
