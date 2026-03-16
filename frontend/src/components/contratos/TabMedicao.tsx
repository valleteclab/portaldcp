'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus, Loader2, TrendingUp, CheckCircle, XCircle, Send, Pencil, Trash2, BarChart3,
  FileText, AlertTriangle, Calendar, MapPin, ExternalLink, ClipboardCheck, RotateCcw,
  ChevronRight, Eye, Clock, Shield, ListOrdered, Layers, DollarSign,
  Camera, Paperclip, Upload,
} from 'lucide-react'
import Link from 'next/link'
import { API_URL, authFetch } from '@/lib/api'
import { derivarCompetencia } from '@/lib/pdf-medicao'

interface OSRequisicao {
  id: string
  numero?: string
  numero_os?: string
  status: string
  descricao?: string
  descricao_os?: string
  local_execucao?: string
  data_solicitacao?: string
  data_autorizacao?: string
  data_abertura?: string
  data_aprovacao?: string
  data_inicio_prevista?: string
  data_fim_prevista?: string
  prazo_execucao_dias?: number
  responsavel_tecnico?: string
  fiscal_contrato_nome?: string
  fiscal_nome?: string
  usuario_solicitante_nome?: string
  usuario_autorizador_nome?: string
  aprovador_nome?: string
  justificativa?: string
  sla_dias?: number
  sla_excedido?: boolean
}

interface Etapa {
  id: string
  numero_etapa: number
  descricao: string
  percentual_fisico: number
  valor_previsto: number
  data_inicio_prevista: string
  data_fim_prevista: string
  percentual_executado: number
  valor_executado: number
  status: string
}

interface ItemCronograma {
  id: string
  numero_item: number
  descricao: string
  unidade_medida: string
  quantidade: number
  valor_unitario: number
  quantidade_meses?: number | null
  valor_mensal?: number
  valor_total: number
  quantidade_medida: number
  observacoes?: string
}

interface Medicao {
  id: string
  numero_medicao: number
  periodo_inicio: string
  periodo_fim: string
  valor_medido: number
  valor_acumulado_atual: number
  percentual_fisico_medido: number
  percentual_fisico_acumulado: number
  fiscal_nome: string
  fornecedor_nome?: string
  fornecedor_observacoes?: string
  nota_fiscal_numero?: string
  nota_fiscal_valor?: number
  nota_fiscal_data?: string
  data_submissao?: string
  ateste_fiscal_nome?: string
  ateste_data?: string
  ateste_observacoes?: string
  ateste_verificado_in_loco?: boolean
  aprovador_nome?: string
  data_aprovacao?: string
  observacao_aprovador?: string
  motivo_devolucao?: string
  data_devolucao?: string
  status: string
  created_at: string
  itens?: any[]
}

interface Resumo {
  valor_global: number
  valor_medido_total: number
  valor_comprometido_total?: number
  valor_em_analise?: number
  saldo_disponivel: number
  percentual_fisico_total: number
  total_etapas: number
  etapas_concluidas: number
  total_medicoes: number
  medicoes_aprovadas: number
  pendentes_ateste: number
  pendentes_aprovacao: number
  os_ativa: OSRequisicao | null
  total_os: number
  fluxo_os?: 'REQUISICAO' | 'MODULO_OS'
  itens_comprometidos?: Record<string, number>
  etapas_comprometidas?: Record<string, number>
}

const STATUS_OS: Record<string, { label: string; cor: string }> = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-gray-100 text-gray-800' },
  AGUARDANDO_APROVACAO: { label: 'Aguardando Aprovação', cor: 'bg-amber-100 text-amber-800' },
  AGUARDANDO_AUTORIZACAO: { label: 'Aguardando Autorização', cor: 'bg-amber-100 text-amber-800' },
  AUTORIZADA: { label: 'Autorizada', cor: 'bg-blue-100 text-blue-800' },
  ABERTA: { label: 'Aberta', cor: 'bg-blue-100 text-blue-800' },
  EM_EXECUCAO: { label: 'Em Execução', cor: 'bg-indigo-100 text-indigo-800' },
  ORDEM_GERADA: { label: 'Em Execução', cor: 'bg-indigo-100 text-indigo-800' },
  ENTREGUE: { label: 'Entregue', cor: 'bg-purple-100 text-purple-800' },
  EM_ACEITE: { label: 'Em Aceite', cor: 'bg-orange-100 text-orange-800' },
  ACEITA: { label: 'Aceita', cor: 'bg-green-100 text-green-800' },
  REJEITADA: { label: 'Rejeitada', cor: 'bg-red-100 text-red-800' },
  CANCELADA: { label: 'Cancelada', cor: 'bg-red-100 text-red-800' },
  CONCLUIDA: { label: 'Concluída', cor: 'bg-green-100 text-green-800' },
  ATENDIDA: { label: 'Concluída', cor: 'bg-green-100 text-green-800' },
  NEGADA: { label: 'Negada', cor: 'bg-red-100 text-red-800' },
}

const STATUS_ETAPA: Record<string, { label: string; cor: string }> = {
  PENDENTE: { label: 'Pendente', cor: 'bg-gray-100 text-gray-800' },
  EM_EXECUCAO: { label: 'Em Execução', cor: 'bg-blue-100 text-blue-800' },
  MEDIDA_PARCIAL: { label: 'Medida Parcial', cor: 'bg-amber-100 text-amber-800' },
  CONCLUIDA: { label: 'Concluída', cor: 'bg-green-100 text-green-800' },
}

const STATUS_MEDICAO: Record<string, { label: string; cor: string; icon: any }> = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-gray-100 text-gray-800', icon: FileText },
  SUBMETIDA: { label: 'Submetida', cor: 'bg-blue-100 text-blue-800', icon: Send },
  AGUARDANDO_ATESTE: { label: 'Aguardando Ateste', cor: 'bg-yellow-100 text-yellow-800', icon: ClipboardCheck },
  PARCIALMENTE_ATESTADA: { label: 'Parcialmente Atestada', cor: 'bg-amber-100 text-amber-800', icon: ClipboardCheck },
  AGUARDANDO_APROVACAO: { label: 'Aguardando Aprovação', cor: 'bg-orange-100 text-orange-800', icon: Clock },
  APROVADA: { label: 'Aprovada', cor: 'bg-green-100 text-green-800', icon: CheckCircle },
  REJEITADA: { label: 'Rejeitada', cor: 'bg-red-100 text-red-800', icon: XCircle },
  DEVOLVIDA: { label: 'Devolvida', cor: 'bg-amber-100 text-amber-800', icon: RotateCcw },
}

function formatarMoeda(v: number | string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(d: string | null | undefined) {
  if (!d) return '-'
  // Se for formato YYYY-MM-DD (date-only), faz split para evitar problema de timezone UTC
  const dateOnly = d.split('T')[0]
  const parts = dateOnly.split('-')
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`
  }
  return new Date(d).toLocaleDateString('pt-BR')
}

/** Dias entre datas usando ano comercial (30 dias/mês, máx 360) */
function calcularDiasMesComercial(data1: string, data2: string, dataFimContrato?: string): number {
  const d1 = new Date(data1); const d2 = new Date(data2)
  const df = dataFimContrato ? new Date(dataFimContrato) : null
  const ano1 = d1.getUTCFullYear(); const mes1 = d1.getUTCMonth(); const dia1 = d1.getUTCDate()
  const ano2 = d2.getUTCFullYear(); const mes2 = d2.getUTCMonth(); const dia2 = d2.getUTCDate()
  let dias = 0
  if (ano1 === ano2 && mes1 === mes2) {
    const ehUltimo = df && ano2 === df.getUTCFullYear() && mes2 === df.getUTCMonth() && dia2 === df.getUTCDate()
    dias = Math.min(dia2 - dia1 + (ehUltimo ? 0 : 1), 30)
  } else {
    const diasPrimeiroMes = Math.min(30 - dia1 + 1, 30)
    let mesesCompletos = 0
    if (ano2 > ano1 || mes2 > mes1 + 1) mesesCompletos = (ano2 - ano1) * 12 + (mes2 - mes1 - 1)
    let diasUltimoMes = Math.min(dia2, 30)
    if (df && ano2 === df.getUTCFullYear() && mes2 === df.getUTCMonth() && dia2 === df.getUTCDate()) diasUltimoMes = dia2 - 1
    dias = diasPrimeiroMes + (mesesCompletos * 30) + diasUltimoMes
  }
  return Math.max(0, Math.min(dias, 360))
}

function calcularExecucaoFiscal(periodoInicio: string, periodoFim: string, vigenciaInicio: string, vigenciaFim: string) {
  const diasPeriodo = calcularDiasMesComercial(periodoInicio, periodoFim, vigenciaFim)
  const diasAte = calcularDiasMesComercial(vigenciaInicio, periodoFim, vigenciaFim)
  const diasRestantes = Math.max(0, 360 - diasAte)
  const fmt = (d: number) => {
    const m = Math.floor(d / 30); const r = d % 30
    const pM = m === 1 ? '1 mês' : m > 1 ? `${m} meses` : ''
    const pD = r === 1 ? '1 dia' : r > 1 ? `${r} dias` : ''
    return pM && pD ? `${pM} e ${pD}` : pM || pD || '0 dias'
  }
  return { noPeriodo: fmt(diasPeriodo), atePeriodo: fmt(diasAte), aExecutar: fmt(diasRestantes) }
}

export default function TabMedicao({ contratoId, valorGlobal, modalidade, onAtestar, contrato: contratoProp, isAdmin }: {
  contratoId: string; valorGlobal: number; modalidade?: string; onAtestar?: (medicao: any) => void;
  contrato?: { data_vigencia_inicio?: string; data_vigencia_fim?: string; valor_global?: number | string; boletim_por_quantidade?: boolean };
  isAdmin?: boolean;
}) {
  const isServicoContinuado = ['CONTINUADO', 'LICENCA'].includes(modalidade || '');
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [itensCronograma, setItensCronograma] = useState<ItemCronograma[]>([])
  const [unidadesCronograma, setUnidadesCronograma] = useState<string[]>(['HORA', 'MENSAL', 'LITROS', 'METROS', 'UNIDADE'])
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Verificar se o usuário logado tem permissão de excluir medições
  const [podeExcluirMedicao, setPodeExcluirMedicao] = useState(false)
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('usuario') || '{}')
      setPodeExcluirMedicao(u.pode_excluir_medicao === true)
    } catch { setPodeExcluirMedicao(false) }
  }, [])

  // Modais
  const [modalEtapa, setModalEtapa] = useState(false)
  const [editandoEtapa, setEditandoEtapa] = useState<Etapa | null>(null)
  const [modalItemCronograma, setModalItemCronograma] = useState(false)
  const [editandoItemCronograma, setEditandoItemCronograma] = useState<ItemCronograma | null>(null)
  const [modalTipoCronograma, setModalTipoCronograma] = useState(false)
  const [modalMedicao, setModalMedicao] = useState(false)
  const [modalAteste, setModalAteste] = useState<Medicao | null>(null)
  const [modalDevolver, setModalDevolver] = useState<Medicao | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<Medicao | null>(null)
  const [discriminacoesDetalhe, setDiscriminacoesDetalhe] = useState<any[]>([])
  const [execucaoFinanceira, setExecucaoFinanceira] = useState<any>(null)
  const [editandoDiscriminacao, setEditandoDiscriminacao] = useState<string | null>(null)
  const [motivoCorrecao, setMotivoCorrecao] = useState('')

  // Forms
  const [formEtapa, setFormEtapa] = useState({
    descricao: '', percentual_fisico: '', valor_previsto: '',
    data_inicio_prevista: '', data_fim_prevista: '', observacoes: '',
  })
  const [formItemCronograma, setFormItemCronograma] = useState({
    descricao: '', unidade_medida: 'UNIDADE', quantidade: '', valor_unitario: '', quantidade_meses: '', valor_mensal: '', valor_total: '', observacoes: '',
    quantidade_medida: '', // Apenas para admin (ajuste migração)
  })
  const [editandoMedidoItemId, setEditandoMedidoItemId] = useState<string | null>(null)
  const [editandoMedidoValor, setEditandoMedidoValor] = useState<string>('')
  const [formMedicao, setFormMedicao] = useState({
    periodo_inicio: '', periodo_fim: '', competencia: '', observacoes: '', valor_medido: '',
    nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '',
    itens: [] as (
      | { etapa_id: string; percentual_executado_atual: number; valor_executado_atual?: number; modo_input?: 'percentual' | 'valor' }
      | { item_cronograma_id: string; quantidade_medida: number; modo_input?: 'quantidade' | 'valor'; valor_override?: number }
    )[],
  })
  const [execucaoFinanceiraModal, setExecucaoFinanceiraModal] = useState<any>(null)
  const [formAteste, setFormAteste] = useState({ observacoes: '', verificado_in_loco: false, motivo_devolucao_parcial: '' })
  const [itensAteste, setItensAteste] = useState<Record<string, { selecionado: boolean; observacoes: string }>>({})

  const [motivoDevolucao, setMotivoDevolucao] = useState('')
  const [anexosMedicao, setAnexosMedicao] = useState<any[]>([])
  const [loadingAnexos, setLoadingAnexos] = useState(false)
  const [discriminacoes, setDiscriminacoes] = useState<{ descricao: string; valor: number; percentual: number }[]>([])
  const [arquivosPendentes, setArquivosPendentes] = useState<{ file: File; tipo: 'FOTO' | 'DOCUMENTO'; descricao: string }[]>([])
  const [modalOtp, setModalOtp] = useState(false)
  const [otpMedicaoId, setOtpMedicaoId] = useState<string | null>(null)
  const [otpEtapa, setOtpEtapa] = useState<'telefone' | 'codigo' | 'sucesso'>('telefone')
  const [otpTelefone, setOtpTelefone] = useState('')
  const [otpCodigo, setOtpCodigo] = useState('')
  const [otpCanais, setOtpCanais] = useState<{ telefone_mascarado?: string } | null>(null)
  const [otpErro, setOtpErro] = useState<string | null>(null)
  const [otpCodigoValidacao, setOtpCodigoValidacao] = useState<string | null>(null)
  const [otpLoading, setOtpLoading] = useState(false)

  const abrirDetalhe = async (m: Medicao) => {
    setModalDetalhe(m)
    setAnexosMedicao([])
    setDiscriminacoesDetalhe([])
    setExecucaoFinanceira(null)
    setEditandoDiscriminacao(null)
    setMotivoCorrecao('')
    setLoadingAnexos(true)
    try {
      const [anexosRes, discRes, execRes] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/${m.id}/anexos`),
        authFetch(`${API_URL}/api/contratos/medicoes/${m.id}/discriminacoes`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/execucao-financeira?medicaoId=${m.id}`),
      ])
      if (anexosRes.ok) setAnexosMedicao(await anexosRes.json())
      if (discRes.ok) setDiscriminacoesDetalhe(await discRes.json())
      if (execRes.ok) setExecucaoFinanceira(await execRes.json())
    } catch { }
    setLoadingAnexos(false)
  }

  const handleCorrigirDiscriminacao = async (discId: string, dados: { descricao?: string; valor?: number; percentual?: number }) => {
    if (!motivoCorrecao.trim()) {
      alert('Informe o motivo da correção')
      return
    }
    try {
      const medicaoId = modalDetalhe?.id
      if (!medicaoId) return
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}/discriminacoes/${discId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dados, motivo_correcao: motivoCorrecao }),
      })
      if (res.ok) {
        const updated = await res.json()
        setDiscriminacoesDetalhe(prev => prev.map(d => d.id === discId ? updated : d))
        setEditandoDiscriminacao(null)
        setMotivoCorrecao('')
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.message || 'Erro ao corrigir discriminação')
      }
    } catch {
      alert('Erro ao corrigir discriminação')
    }
  }

  const handleExcluirAnexoOrgao = async (anexoId: string, nomeAnexo: string) => {
    if (!confirm(`Deseja excluir o anexo "${nomeAnexo}"?`)) return
    if (!confirm('CONFIRMAÇÃO FINAL: Esta ação é irreversível. Tem certeza que deseja excluir este arquivo?')) return
    try {
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/anexos/${anexoId}`, { method: 'DELETE' })
      if (res.ok) {
        setAnexosMedicao(prev => prev.filter(a => a.id !== anexoId))
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.message || 'Erro ao excluir anexo')
      }
    } catch {
      alert('Erro ao excluir anexo')
    }
  }

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [resEtapas, resItens, resUnidades, resMedicoes, resResumo] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/${contratoId}/etapas`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/itens-cronograma`),
        authFetch(`${API_URL}/api/contratos/unidades-cronograma`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/medicoes`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/medicoes/resumo`),
      ])
      if (resEtapas.ok) setEtapas(await resEtapas.json())
      if (resItens.ok) setItensCronograma(await resItens.json())
      if (resUnidades.ok) {
        const data = await resUnidades.json()
        if (data.unidades?.length) setUnidadesCronograma(data.unidades)
      }
      if (resMedicoes.ok) setMedicoes(await resMedicoes.json())
      if (resResumo.ok) setResumo(await resResumo.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [contratoId])

  useEffect(() => { carregarDados() }, [carregarDados])

  const osAtiva = resumo?.os_ativa
  const temOSAutorizada = isServicoContinuado || (osAtiva && ['AUTORIZADA', 'EM_EXECUCAO', 'ORDEM_GERADA'].includes(osAtiva.status))
  const usarItensCronograma = itensCronograma.length > 0
  const temCronograma = etapas.length > 0 || itensCronograma.length > 0

  // Medições separadas por status
  const medicoesPendentesAteste = medicoes.filter(m => m.status === 'SUBMETIDA' || m.status === 'PARCIALMENTE_ATESTADA')
  const medicoesEmAndamento = medicoes.filter(m => ['RASCUNHO', 'AGUARDANDO_APROVACAO', 'DEVOLVIDA'].includes(m.status))
  const medicoesFinalizadas = medicoes.filter(m => ['APROVADA', 'REJEITADA'].includes(m.status))

  // ============ ETAPAS ============

  const abrirModalEtapa = (etapa?: Etapa) => {
    if (etapa) {
      setEditandoEtapa(etapa)
      setFormEtapa({
        descricao: etapa.descricao,
        percentual_fisico: etapa.percentual_fisico.toString(),
        valor_previsto: etapa.valor_previsto.toString(),
        data_inicio_prevista: etapa.data_inicio_prevista?.split('T')[0] || '',
        data_fim_prevista: etapa.data_fim_prevista?.split('T')[0] || '',
        observacoes: '',
      })
    } else {
      setEditandoEtapa(null)
      setFormEtapa({ descricao: '', percentual_fisico: '', valor_previsto: '', data_inicio_prevista: '', data_fim_prevista: '', observacoes: '' })
    }
    setModalEtapa(true)
  }

  // Calcula saldo disponível para etapas (valor e percentual)
  const somaValorEtapas = etapas.reduce((sum, e) => sum + Number(e.valor_previsto), 0)
  const somaPercentualEtapas = etapas.reduce((sum, e) => sum + Number(e.percentual_fisico), 0)
  const saldoValorEtapas = valorGlobal - somaValorEtapas
  const saldoPercentualEtapas = 100 - somaPercentualEtapas

  const salvarEtapa = async () => {
    const novoValor = parseFloat(formEtapa.valor_previsto) || 0
    const novoPercentual = parseFloat(formEtapa.percentual_fisico) || 0

    // Saldo excluindo a etapa sendo editada
    const somaValorOutras = editandoEtapa
      ? etapas.filter(e => e.id !== editandoEtapa.id).reduce((sum, e) => sum + Number(e.valor_previsto), 0)
      : somaValorEtapas
    const somaPercentualOutras = editandoEtapa
      ? etapas.filter(e => e.id !== editandoEtapa.id).reduce((sum, e) => sum + Number(e.percentual_fisico), 0)
      : somaPercentualEtapas

    if (somaValorOutras + novoValor > valorGlobal + 0.01) {
      const disponivel = Math.max(0, valorGlobal - somaValorOutras)
      alert(`O valor da etapa (R$ ${novoValor.toFixed(2)}) excede o saldo disponível.\n\nValor do contrato: R$ ${valorGlobal.toFixed(2)}\nJá alocado: R$ ${somaValorOutras.toFixed(2)}\nDisponível: R$ ${disponivel.toFixed(2)}`)
      return
    }

    if (somaPercentualOutras + novoPercentual > 100.01) {
      const disponivel = Math.max(0, 100 - somaPercentualOutras)
      alert(`O percentual da etapa (${novoPercentual.toFixed(2)}%) excede o disponível.\n\nJá alocado: ${somaPercentualOutras.toFixed(2)}%\nDisponível: ${disponivel.toFixed(2)}%`)
      return
    }

    setActionLoading(true)
    try {
      const payload = {
        descricao: formEtapa.descricao,
        percentual_fisico: novoPercentual,
        valor_previsto: novoValor,
        data_inicio_prevista: formEtapa.data_inicio_prevista,
        data_fim_prevista: formEtapa.data_fim_prevista,
        observacoes: formEtapa.observacoes || null,
      }
      const url = editandoEtapa
        ? `${API_URL}/api/contratos/etapas/${editandoEtapa.id}`
        : `${API_URL}/api/contratos/${contratoId}/etapas`
      const method = editandoEtapa ? 'PUT' : 'POST'
      const res = await authFetch(url, { method, body: JSON.stringify(payload) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalEtapa(false)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const excluirEtapa = async (etapaId: string) => {
    if (!confirm('Excluir esta etapa?')) return
    await authFetch(`${API_URL}/api/contratos/etapas/${etapaId}`, { method: 'DELETE' })
    carregarDados()
  }

  // ============ ITENS DO CRONOGRAMA ============

  const abrirModalItemCronograma = (item?: ItemCronograma) => {
    if (item) {
      setEditandoItemCronograma(item)
      setFormItemCronograma({
        descricao: item.descricao,
        unidade_medida: item.unidade_medida,
        quantidade: String(item.quantidade),
        valor_unitario: String(item.valor_unitario),
        quantidade_meses: item.quantidade_meses != null ? String(item.quantidade_meses) : '',
        valor_mensal: String(item.valor_mensal ?? (Number(item.quantidade) * Number(item.valor_unitario))),
        valor_total: String(item.valor_total),
        observacoes: item.observacoes || '',
        quantidade_medida: String(Number(item.quantidade_medida) || 0),
      })
    } else {
      setEditandoItemCronograma(null)
      setFormItemCronograma({ descricao: '', unidade_medida: 'UNIDADE', quantidade: '', valor_unitario: '', quantidade_meses: '', valor_mensal: '', valor_total: '', observacoes: '', quantidade_medida: '' })
    }
    setModalItemCronograma(true)
  }

  const somaValorItensCronograma = itensCronograma.reduce((sum, i) => sum + Number(i.valor_total), 0)
  const saldoValorItens = valorGlobal - somaValorItensCronograma

  const salvarItemCronograma = async () => {
    const qtd = parseFloat(formItemCronograma.quantidade) || 0
    const vlUnit = parseFloat(formItemCronograma.valor_unitario) || 0
    const meses = formItemCronograma.quantidade_meses ? parseInt(formItemCronograma.quantidade_meses) : null
    const vlMensal = qtd * vlUnit
    const novoValorTotal = meses ? vlMensal * meses : vlMensal

    const somaOutras = editandoItemCronograma
      ? itensCronograma.filter(i => i.id !== editandoItemCronograma.id).reduce((a, b) => a + Number(b.valor_total), 0)
      : somaValorItensCronograma
    if (somaOutras + novoValorTotal > valorGlobal + 0.01) {
      const disp = Math.max(0, valorGlobal - somaOutras)
      alert(`O valor total do item (R$ ${novoValorTotal.toFixed(2)}) excede o saldo disponível (R$ ${disp.toFixed(2)}).`)
      return
    }

    setActionLoading(true)
    try {
      const payload = {
        descricao: formItemCronograma.descricao,
        unidade_medida: formItemCronograma.unidade_medida,
        quantidade: qtd,
        valor_unitario: vlUnit,
        quantidade_meses: meses,
        observacoes: formItemCronograma.observacoes || null,
      }
      if (editandoItemCronograma) {
        const res = await authFetch(`${API_URL}/api/contratos/itens-cronograma/${editandoItemCronograma.id}`, { method: 'PUT', body: JSON.stringify(payload) })
        if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
        if (isAdmin) {
          const qtdMedida = parseFloat(formItemCronograma.quantidade_medida || '0') || 0
          const resMig = await authFetch(`${API_URL}/api/contratos/${contratoId}/itens-cronograma/${editandoItemCronograma.id}/quantidade-migracao`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ quantidade_medida: qtdMedida }),
          })
          if (!resMig.ok) { const e = await resMig.json().catch(() => ({})); alert(e.message || 'Erro ao salvar quantidade já utilizada'); return }
        }
      } else {
        const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/itens-cronograma`, { method: 'POST', body: JSON.stringify(payload) })
        if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      }
      setModalItemCronograma(false)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const excluirItemCronograma = async (itemId: string) => {
    if (!confirm('Excluir este item?')) return
    try {
      const res = await authFetch(`${API_URL}/api/contratos/itens-cronograma/${itemId}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      carregarDados()
    } catch (e) { console.error(e) }
  }

  const salvarQuantidadeMedidaMigracao = async (itemId: string, valor: string) => {
    const qtd = parseFloat(valor)
    if (isNaN(qtd) || qtd < 0) return
    setEditandoMedidoItemId(null)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/itens-cronograma/${itemId}/quantidade-migracao`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantidade_medida: qtd }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      carregarDados()
    } catch (e) { console.error(e); alert('Erro ao salvar quantidade medida') }
  }

  // ============ MEDIÇÕES — Criação interna (fiscal) ============

  const abrirModalMedicao = () => {
    setFormMedicao({
      periodo_inicio: '', periodo_fim: '', competencia: '', observacoes: '', valor_medido: '',
      nota_fiscal_numero: '', nota_fiscal_valor: '', nota_fiscal_data: '',
      itens: isServicoContinuado ? [] : usarItensCronograma
        ? itensCronograma.map(i => ({ item_cronograma_id: i.id, quantidade_medida: 0, modo_input: 'quantidade' as const, valor_override: 0 }))
        : etapas.filter(e => e.status !== 'CONCLUIDA').map(e => ({ etapa_id: e.id, percentual_executado_atual: 0, modo_input: 'percentual' as const })),
    })
    setExecucaoFinanceiraModal(null)
    setDiscriminacoes([])
    setArquivosPendentes([])
    setModalMedicao(true)
  }

  const carregarExecucaoFinanceiraModal = useCallback(async (medicaoId?: string, periodoInicio?: string, periodoFim?: string) => {
    try {
      let url = `${API_URL}/api/contratos/${contratoId}/execucao-financeira`
      const params = new URLSearchParams()
      if (medicaoId) params.set('medicaoId', medicaoId)
      else if (periodoInicio && periodoFim) {
        params.set('periodo_inicio', periodoInicio)
        params.set('periodo_fim', periodoFim)
      }
      if (params.toString()) url += `?${params.toString()}`
      const res = await authFetch(url)
      if (res.ok) setExecucaoFinanceiraModal(await res.json())
    } catch { setExecucaoFinanceiraModal(null) }
  }, [contratoId])

  const salvarMedicao = async (comoRascunho: boolean) => {
    if (!formMedicao.periodo_inicio || !formMedicao.periodo_fim) {
      alert('Informe o período de início e fim da medição')
      return
    }
    if (contratoProp?.data_vigencia_fim) {
      const dataFimPeriodo = new Date(formMedicao.periodo_fim)
      const dataVigenciaFim = new Date(contratoProp.data_vigencia_fim)
      if (dataFimPeriodo > dataVigenciaFim) {
        alert(`O período de medição não pode ultrapassar a data de vigência do contrato.`)
        return
      }
    }
    setActionLoading(true)
    try {
      const payload: any = {
        periodo_inicio: formMedicao.periodo_inicio,
        periodo_fim: formMedicao.periodo_fim,
        competencia: formMedicao.competencia || derivarCompetencia(formMedicao.periodo_inicio) || undefined,
        observacoes: formMedicao.observacoes || null,
        nota_fiscal_numero: formMedicao.nota_fiscal_numero || undefined,
        nota_fiscal_valor: formMedicao.nota_fiscal_valor ? Number(formMedicao.nota_fiscal_valor) : undefined,
        nota_fiscal_data: formMedicao.nota_fiscal_data || undefined,
      }
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}')
      if (usuario?.id) payload.fiscal_id = usuario.id
      if (usuario?.nome) payload.fiscal_nome = usuario.nome
      if (isServicoContinuado) {
        const valor = parseFloat(formMedicao.valor_medido) || 0
        if (valor <= 0) { alert('Informe o valor medido'); setActionLoading(false); return }
        payload.valor_medido = valor
      } else if (usarItensCronograma) {
        const itensComQtd = formMedicao.itens
          .filter((i): i is { item_cronograma_id: string; quantidade_medida: number } => 'item_cronograma_id' in i && Number((i as any).quantidade_medida) > 0)
          .map(i => ({ item_cronograma_id: i.item_cronograma_id, quantidade_medida: Number(i.quantidade_medida) }))
        if (itensComQtd.length === 0) { alert('Informe a quantidade medida em pelo menos um item'); setActionLoading(false); return }
        payload.itens = itensComQtd
      } else {
        const itensComValor = formMedicao.itens
          .filter((i): i is { etapa_id: string; percentual_executado_atual: number; valor_executado_atual?: number } => 'etapa_id' in i && ((i as any).percentual_executado_atual > 0 || ((i as any).valor_executado_atual != null && (i as any).valor_executado_atual > 0)))
          .map(i => ({ etapa_id: i.etapa_id, percentual_executado_atual: (i as any).percentual_executado_atual || 0, valor_executado_atual: (i as any).valor_executado_atual || undefined }))
        if (itensComValor.length === 0) { alert('Informe o percentual ou valor executado em pelo menos uma etapa'); setActionLoading(false); return }
        payload.itens = itensComValor
      }
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/medicoes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); setActionLoading(false); return }
      const medicaoSalva = await res.json()

      if (discriminacoes.length > 0 && medicaoSalva?.id) {
        try {
          await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoSalva.id}/discriminacoes`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itens: discriminacoes, motivo_correcao: 'Criação inicial pelo fiscal' }),
          })
        } catch { /* ignore */ }
      }
      if (medicaoSalva?.id && arquivosPendentes.length > 0) {
        for (const arq of arquivosPendentes) {
          try {
            const formData = new FormData()
            formData.append('file', arq.file)
            formData.append('tipo', arq.tipo)
            if (arq.descricao) formData.append('descricao', arq.descricao)
            await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoSalva.id}/anexos`, { method: 'POST', body: formData })
          } catch { /* ignore */ }
        }
      }

      if (!comoRascunho && medicaoSalva?.id) {
        setModalMedicao(false)
        setDiscriminacoes([])
        setArquivosPendentes([])
        abrirModalOtpFiscal(medicaoSalva.id)
        return
      }

      setModalMedicao(false)
      setDiscriminacoes([])
      setArquivosPendentes([])
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const abrirModalOtpFiscal = (medicaoId: string) => {
    setOtpMedicaoId(medicaoId)
    setOtpEtapa('telefone')
    setOtpTelefone('')
    setOtpCodigo('')
    setOtpCanais(null)
    setOtpErro(null)
    setOtpCodigoValidacao(null)
    setOtpLoading(false)
    setModalOtp(true)
  }

  const handleEnviarOtpFiscal = async () => {
    if (!otpMedicaoId || !otpTelefone.replace(/\D/g, '').match(/^\d{10,11}$/)) {
      setOtpErro('Informe um número de WhatsApp válido (10 ou 11 dígitos).')
      return
    }
    setOtpLoading(true)
    setOtpErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${otpMedicaoId}/solicitar-otp-fiscal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telefone: otpTelefone.replace(/\D/g, '') }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setOtpErro(err.message || 'Erro ao enviar código')
        setOtpLoading(false)
        return
      }
      const data = await res.json()
      setOtpCanais(data)
      setOtpEtapa('codigo')
    } catch {
      setOtpErro('Erro de conexão ao enviar código')
    } finally {
      setOtpLoading(false)
    }
  }

  const handleValidarOtpFiscal = async () => {
    if (!otpMedicaoId || !otpCodigo) return
    setOtpLoading(true)
    setOtpErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${otpMedicaoId}/validar-otp-fiscal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: otpCodigo }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setOtpErro(err.message || 'Código incorreto ou expirado')
        setOtpLoading(false)
        return
      }
      const data = await res.json()
      setOtpCodigoValidacao(data.codigo_formatado || data.codigo_validacao)
      setOtpEtapa('sucesso')

      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}')
      await authFetch(`${API_URL}/api/contratos/medicoes/${otpMedicaoId}/enviar-aprovacao`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscal_id: usuario?.id || '', fiscal_nome: usuario?.nome || 'Fiscal' }),
      })

      try {
        const resBoletim = await authFetch(`${API_URL}/api/contratos/medicoes/${otpMedicaoId}/boletim-oficial`)
        if (resBoletim.ok) {
          const boletim = await resBoletim.json()
          const pdfUrl = boletim.pdf_url?.startsWith('http') ? boletim.pdf_url : `${API_URL}${boletim.pdf_url || ''}`
          if (pdfUrl) {
            const arquivoRes = await authFetch(pdfUrl)
            if (arquivoRes.ok) {
              const pdfBlob = await arquivoRes.blob()
              const objectUrl = window.URL.createObjectURL(pdfBlob)
              const link = document.createElement('a')
              link.href = objectUrl
              link.download = boletim.filename || `boletim_medicao_${otpMedicaoId}.pdf`
              link.style.display = 'none'
              document.body.appendChild(link)
              link.click()
              setTimeout(() => { link.remove(); window.URL.revokeObjectURL(objectUrl) }, 1000)
            }
          }
        }
      } catch { /* ignore download errors */ }

      carregarDados()
    } catch {
      setOtpErro('Erro de conexão ao validar código')
    } finally {
      setOtpLoading(false)
    }
  }

  // ============ MEDIÇÕES — Envio direto para aprovação (fiscal cria internamente) ============

  const enviarParaAprovacao = async (medicaoId: string) => {
    setActionLoading(true)
    try {
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}')
      await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}/enviar-aprovacao`, {
        method: 'PATCH', body: JSON.stringify({
          fiscal_id: usuario.id || '',
          fiscal_nome: usuario.nome || 'Fiscal',
        }),
      })
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  // ============ MEDIÇÕES — Exclusão ============

  const excluirMedicao = async (medicaoId: string, numeroMedicao: number, statusAtual?: string) => {
    const msgExtra = statusAtual === 'APROVADA'
      ? '\n\n⚠️ ATENÇÃO: Esta medição já foi APROVADA. Ao excluí-la, os valores e percentuais das etapas serão revertidos.'
      : ''
    if (!confirm(`Excluir a ${numeroMedicao}ª Medição?${msgExtra}\n\nEsta ação não pode ser desfeita.`)) return
    setActionLoading(true)
    try {
      const params = podeExcluirMedicao ? '?podeExcluirMedicao=true' : ''
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}${params}`, { method: 'DELETE' })
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert(e.message || 'Erro ao excluir medição')
      } else {
        carregarDados()
      }
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  // ============ MEDIÇÕES — Ateste do Fiscal ============

  const abrirModalAteste = async (m: Medicao) => {
    setFormAteste({ observacoes: '', verificado_in_loco: false, motivo_devolucao_parcial: '' })
    setItensAteste({})
    setAnexosMedicao([])
    setLoadingAnexos(true)
    try {
      // Busca medição completa (inclui itens) + anexos em paralelo
      const [medicaoRes, anexosRes] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/${m.id}`),
        authFetch(`${API_URL}/api/contratos/medicoes/${m.id}/anexos`),
      ])
      const medicaoCompleta = medicaoRes.ok ? await medicaoRes.json() : m
      if (anexosRes.ok) setAnexosMedicao(await anexosRes.json())
      setModalAteste(medicaoCompleta)
      // Inicializar estado dos itens (itens já atestados ficam marcados e bloqueados)
      const itensMap: Record<string, { selecionado: boolean; observacoes: string }> = {}
      for (const item of (medicaoCompleta?.itens || [])) {
        itensMap[item.id] = {
          selecionado: !!item.atestado,
          observacoes: item.ateste_observacoes || '',
        }
      }
      setItensAteste(itensMap)
    } catch { setModalAteste(m) }
    setLoadingAnexos(false)
  }

  const atestarMedicao = async () => {
    if (!modalAteste) return

    const itens = ((modalAteste as any).itens || []) as any[]
    const itensSelecionados = itens.filter(item => itensAteste[item.id]?.selecionado && !item.atestado)
    const itensCancelarAteste = itens.filter(item => item.atestado && !itensAteste[item.id]?.selecionado).map((i: any) => i.id)
    const jaAtestadosMantidos = itens.filter((i: any) => i.atestado && itensAteste[i.id]?.selecionado).length
    const todosSerao = jaAtestadosMantidos + itensSelecionados.length === itens.length && itens.length > 0

    const temAcao = itensSelecionados.length > 0 || itensCancelarAteste.length > 0
    if (!temAcao) {
      alert('Selecione itens para atestar ou desmarque itens para cancelar o ateste.')
      return
    }

    if (!todosSerao && itensSelecionados.length > 0 && !formAteste.motivo_devolucao_parcial?.trim()) {
      const itensNaoSelecionados = itens.filter(i => !itensAteste[i.id]?.selecionado && !i.atestado).length
      if (itensNaoSelecionados > 0) {
        alert('No ateste parcial, informe o motivo da devolução para os itens não atestados.')
        return
      }
    }

    setActionLoading(true)
    try {
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}')
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${modalAteste.id}/atestar-itens`, {
        method: 'PATCH', body: JSON.stringify({
          fiscal_id: usuario.id || '',
          fiscal_nome: usuario.nome || 'Fiscal',
          itens: itensSelecionados.map((item: any) => ({
            item_id: item.id,
            observacoes: itensAteste[item.id]?.observacoes || null,
          })),
          itens_cancelar_ateste: itensCancelarAteste.length > 0 ? itensCancelarAteste : undefined,
          observacoes_gerais: formAteste.observacoes || null,
          verificado_in_loco: formAteste.verificado_in_loco,
          motivo_devolucao: !todosSerao ? formAteste.motivo_devolucao_parcial?.trim() || undefined : undefined,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      const resultado = await res.json().catch(() => ({}))
      setModalAteste(null)
      setFormAteste({ observacoes: '', verificado_in_loco: false, motivo_devolucao_parcial: '' })
      setItensAteste({})
      carregarDados()
      // Mensagem informativa ao fiscal
      if (resultado.status === 'AGUARDANDO_APROVACAO') {
        alert('Medição atestada com sucesso! Foi enviada para aprovação do gestor na Central de Aprovações.')
      } else if (resultado.status === 'DEVOLVIDA') {
        alert('Itens atestados e medição devolvida ao fornecedor com sucesso! O fornecedor será notificado para corrigir os itens não atestados.')
      } else if (resultado.status === 'SUBMETIDA') {
        alert('Ateste(s) cancelado(s) com sucesso! A medição voltou ao status submetida.')
      } else if (resultado.status === 'PARCIALMENTE_ATESTADA') {
        alert('Alterações salvas com sucesso! A medição ficou parcialmente atestada.')
      }
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const devolverMedicao = async () => {
    if (!modalDevolver) return
    setActionLoading(true)
    try {
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}')
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${modalDevolver.id}/devolver`, {
        method: 'PATCH', body: JSON.stringify({
          fiscal_id: usuario.id || '',
          fiscal_nome: usuario.nome || 'Fiscal',
          motivo: motivoDevolucao,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalDevolver(null)
      setMotivoDevolucao('')
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>

  // ============ RENDER ============

  return (
    <div className="space-y-6">
      {/* Ordem de Serviço (para todos os contratos, exceto serviços continuados que são opcionais) */}
      {!isServicoContinuado && (
      <Card className={!osAtiva ? 'border-amber-300 bg-amber-50/30' : osAtiva.status === 'EM_EXECUCAO' ? 'border-indigo-300' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Ordem de Serviço</CardTitle>
          <CardDescription>A OS autoriza o início da execução. Sem OS aprovada, não é possível registrar medições.</CardDescription>
        </CardHeader>
        <CardContent>
          {!osAtiva ? (
            <Link
              href={resumo?.fluxo_os === 'MODULO_OS'
                ? '/orgao/ordens-servico'
                : `/orgao/almoxarifado/requisicoes/nova?contrato=${contratoId}&tipo=ORDEM_SERVICO`}
              className="block"
            >
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 hover:border-amber-300 transition-colors cursor-pointer">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-amber-700">Nenhuma Ordem de Serviço ativa</p>
                  <p className="text-sm text-amber-600">
                    {resumo?.fluxo_os === 'MODULO_OS'
                      ? 'Clique aqui para criar uma OS no módulo de Ordens de Serviço e liberar o cadastro de medições.'
                      : 'Clique aqui para criar uma OS na página de Requisições e liberar o cadastro de medições.'}
                  </p>
                </div>
                <ExternalLink className="w-4 h-4 text-amber-500 shrink-0" />
              </div>
            </Link>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Badge className={STATUS_OS[osAtiva.status]?.cor || 'bg-gray-100'}>
                  {STATUS_OS[osAtiva.status]?.label || osAtiva.status}
                </Badge>
                <span className="font-bold text-lg">{osAtiva.numero_os || osAtiva.numero}</span>
              </div>
              <p className="text-sm text-gray-700">{osAtiva.descricao || osAtiva.descricao_os || osAtiva.justificativa}</p>
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                {osAtiva.data_abertura && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Abertura: {String(osAtiva.data_abertura).split('T')[0]}</span>}
                {osAtiva.data_aprovacao && <span>Aprovada: {String(osAtiva.data_aprovacao).split('T')[0]}</span>}
                {osAtiva.aprovador_nome && <span>Por: {osAtiva.aprovador_nome}</span>}
                {osAtiva.responsavel_tecnico && <span>Resp. Técnico: {osAtiva.responsavel_tecnico}</span>}
                {osAtiva.fiscal_nome && <span>Fiscal: {osAtiva.fiscal_nome}</span>}
                {osAtiva.sla_dias && <span>SLA: {osAtiva.sla_dias} dias</span>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* Resumo */}
      {resumo && temOSAutorizada && (
        <div className={`grid grid-cols-2 ${isServicoContinuado ? 'md:grid-cols-4' : 'md:grid-cols-5'} gap-4`}>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Valor Medido</p>
              <p className="text-xl font-bold text-blue-600">{formatarMoeda(resumo.valor_medido_total)}</p>
              <p className="text-xs text-gray-400">de {formatarMoeda(resumo.valor_global)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Saldo Disponível</p>
              <p className={`text-xl font-bold ${resumo.saldo_disponivel > 0 ? 'text-green-600' : 'text-red-600'}`}>{formatarMoeda(resumo.saldo_disponivel)}</p>
              {(resumo.valor_em_analise || 0) > 0 && (
                <p className="text-xs text-amber-600">Em análise: {formatarMoeda(resumo.valor_em_analise || 0)}</p>
              )}
            </CardContent>
          </Card>
          {!isServicoContinuado && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Avanço Físico</p>
              <p className="text-xl font-bold">{resumo.percentual_fisico_total.toFixed(1)}%</p>
              <Progress value={resumo.percentual_fisico_total} className="mt-2" />
            </CardContent>
          </Card>
          )}
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">{isServicoContinuado ? 'Medições' : 'Etapas'}</p>
              <p className="text-xl font-bold">{isServicoContinuado ? resumo.medicoes_aprovadas : `${resumo.etapas_concluidas}/${resumo.total_etapas}`}</p>
              <p className="text-xs text-gray-400">{resumo.medicoes_aprovadas} medições aprovadas</p>
            </CardContent>
          </Card>
          <Card className={resumo.pendentes_ateste > 0 ? 'border-yellow-300 bg-yellow-50/50' : ''}>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Pendentes</p>
              <div className="flex items-center gap-2">
                {resumo.pendentes_ateste > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-800">{resumo.pendentes_ateste} ateste</Badge>
                )}
                {resumo.pendentes_aprovacao > 0 && (
                  <Badge className="bg-orange-100 text-orange-800">{resumo.pendentes_aprovacao} aprovação</Badge>
                )}
                {resumo.pendentes_ateste === 0 && resumo.pendentes_aprovacao === 0 && (
                  <p className="text-sm text-green-600 font-medium">Nenhuma</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Medições Pendentes de Ateste do Fiscal */}
      {medicoesPendentesAteste.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-yellow-600" />
              Medições Pendentes de Ateste
              <Badge className="bg-yellow-100 text-yellow-800">{medicoesPendentesAteste.length}</Badge>
            </CardTitle>
            <CardDescription>Medições submetidas pelo fornecedor aguardando seu ateste técnico</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {medicoesPendentesAteste.map(m => (
              <div key={m.id} className="flex items-center gap-4 p-4 bg-white border border-yellow-200 rounded-lg">
                <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 text-yellow-700 font-bold text-sm">
                  {m.numero_medicao}ª
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{m.numero_medicao}ª Medição</span>
                    <Badge className={STATUS_MEDICAO[m.status]?.cor}>{STATUS_MEDICAO[m.status]?.label}</Badge>
                    {m.fornecedor_nome && <span className="text-xs text-gray-500">por {typeof m.fornecedor_nome === 'string' ? m.fornecedor_nome : (m as any).fornecedor?.razao_social}</span>}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{formatarData(m.periodo_inicio)} a {formatarData(m.periodo_fim)}</span>
                    <span className="font-medium text-gray-700">{formatarMoeda(m.valor_medido)}</span>
                    <span>{Number(m.percentual_fisico_medido).toFixed(1)}% físico</span>
                    {m.nota_fiscal_numero && <span className="text-xs">NF: {m.nota_fiscal_numero}</span>}
                    {m.status === 'PARCIALMENTE_ATESTADA' && (() => {
                      const itens = (m as any).itens || []
                      const atestados = itens.filter((i: any) => i.atestado).length
                      return <span className="text-xs text-yellow-600 font-medium">{atestados}/{itens.length} itens atestados</span>
                    })()}
                  </div>
                  {m.fornecedor_observacoes && (
                    <p className="text-xs text-gray-500 mt-1 italic">"{m.fornecedor_observacoes}"</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => abrirDetalhe(m)}>
                    <Eye className="w-3 h-3 mr-1" />Ver
                  </Button>
                  <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={() => onAtestar ? onAtestar(m) : abrirModalAteste(m)}>
                    <ClipboardCheck className="w-3 h-3 mr-1" />{m.status === 'PARCIALMENTE_ATESTADA' ? 'Continuar Ateste' : 'Atestar'}
                  </Button>
                  <Button size="sm" variant="outline" className="text-amber-600 border-amber-300" onClick={() => { setModalDevolver(m); setMotivoDevolucao('') }}>
                    <RotateCcw className="w-3 h-3 mr-1" />Devolver
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Cronograma Físico-Financeiro (etapas ou itens) */}
      {!isServicoContinuado && (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />Cronograma Físico-Financeiro</CardTitle>
              <CardDescription>
                {usarItensCronograma ? 'Itens do cronograma com quantidade e valor unitário' : 'Etapas da obra/serviço com percentual e valor previsto'}
              </CardDescription>
            </div>
            {etapas.length > 0 ? (
              <Button onClick={() => abrirModalEtapa()} size="sm"><Plus className="w-4 h-4 mr-1" />Nova Etapa</Button>
            ) : itensCronograma.length > 0 ? (
              <Button onClick={() => abrirModalItemCronograma()} size="sm"><Plus className="w-4 h-4 mr-1" />Novo Item</Button>
            ) : (
              <Button onClick={() => setModalTipoCronograma(true)} size="sm"><Plus className="w-4 h-4 mr-1" />Adicionar</Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {etapas.length === 0 && itensCronograma.length === 0 ? (
            <div className="text-center py-8">
              <BarChart3 className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Nenhum item cadastrado no cronograma.</p>
              <p className="text-sm text-gray-400">Adicione etapas (obras) ou itens (serviços) para iniciar as medições.</p>
              <Button onClick={() => setModalTipoCronograma(true)} size="sm" className="mt-3">
                <Plus className="w-4 h-4 mr-1" />Adicionar
              </Button>
            </div>
          ) : etapas.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-center">% Físico</TableHead>
                  <TableHead className="text-right">Valor Previsto</TableHead>
                  <TableHead className="text-center">Executado</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {etapas.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{e.numero_etapa}</TableCell>
                    <TableCell>
                      <p className="font-medium">{e.descricao}</p>
                      <p className="text-xs text-gray-400">
                        {formatarData(e.data_inicio_prevista)} → {formatarData(e.data_fim_prevista)}
                      </p>
                    </TableCell>
                    <TableCell className="text-center">{Number(e.percentual_fisico).toFixed(1)}%</TableCell>
                    <TableCell className="text-right">{formatarMoeda(e.valor_previsto)}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="font-medium">{Number(e.percentual_executado).toFixed(1)}%</span>
                        <Progress value={Number(e.percentual_executado)} className="w-16 h-1.5" />
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={STATUS_ETAPA[e.status]?.cor || 'bg-gray-100'}>
                        {STATUS_ETAPA[e.status]?.label || e.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => abrirModalEtapa(e)} disabled={e.status === 'CONCLUIDA'}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => excluirEtapa(e.id)} disabled={e.status !== 'PENDENTE'}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="min-w-[200px] max-w-[400px]">Descrição</TableHead>
                  <TableHead className="text-center">Unidade</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Valor Unit.</TableHead>
                  <TableHead className="text-right">Meses</TableHead>
                  <TableHead className="text-right">Val. Mensal</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-center">Medido</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itensCronograma.map(i => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.numero_item}</TableCell>
                    <TableCell className="whitespace-normal break-words min-w-[200px] max-w-[400px]">{i.descricao}</TableCell>
                    <TableCell className="text-center whitespace-nowrap">{i.unidade_medida}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{Number(i.quantidade).toLocaleString('pt-BR')}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatarMoeda(i.valor_unitario)}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{i.quantidade_meses != null ? i.quantidade_meses : '-'}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{formatarMoeda(i.valor_mensal ?? (Number(i.quantidade) * Number(i.valor_unitario)))}</TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap">{formatarMoeda(i.valor_total)}</TableCell>
                    <TableCell className="text-center whitespace-nowrap">
                      {isAdmin ? (
                        editandoMedidoItemId === i.id ? (
                          <div className="flex items-center gap-1 justify-center">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={Number(i.quantidade) || 0}
                              value={editandoMedidoValor}
                              onChange={e => setEditandoMedidoValor(e.target.value)}
                              onBlur={() => salvarQuantidadeMedidaMigracao(i.id, editandoMedidoValor)}
                              onKeyDown={e => { if (e.key === 'Enter') salvarQuantidadeMedidaMigracao(i.id, editandoMedidoValor); if (e.key === 'Escape') setEditandoMedidoItemId(null) }}
                              className="w-20 h-8 text-sm text-center"
                              autoFocus
                            />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { setEditandoMedidoItemId(i.id); setEditandoMedidoValor(String(Number(i.quantidade_medida) || 0)) }}
                            className="text-blue-600 font-medium hover:bg-blue-50 rounded px-1 py-0.5 text-sm"
                            title="Clique para informar quantidade já utilizada (migração)"
                          >
                            {Number(i.quantidade_medida).toLocaleString('pt-BR')}
                          </button>
                        )
                      ) : (
                        <span className="text-blue-600 font-medium">{Number(i.quantidade_medida).toLocaleString('pt-BR')}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => abrirModalItemCronograma(i)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => excluirItemCronograma(i.id)} disabled={Number(i.quantidade_medida) > 0}>
                          <Trash2 className="w-3.5 h-3.5 text-red-500" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}

      {/* Boletins de Medição — Todos */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Boletins de Medição</CardTitle>
              <CardDescription>
                Medições submetidas pelo fornecedor ou criadas internamente pelo fiscal.
                A aprovação final é feita na Central de Aprovações.
              </CardDescription>
            </div>
            <Button onClick={abrirModalMedicao} size="sm" disabled={!isServicoContinuado && (!temCronograma || !temOSAutorizada)}>
              <Plus className="w-4 h-4 mr-1" />Nova Medição {isServicoContinuado ? '' : '(Fiscal)'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {medicoes.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Nenhuma medição registrada.</p>
              <p className="text-sm text-gray-400">O fornecedor pode submeter medições pelo portal, ou o fiscal pode criar internamente.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {medicoes.map(m => {
                const statusInfo = STATUS_MEDICAO[m.status] || STATUS_MEDICAO.RASCUNHO
                const StatusIcon = statusInfo.icon
                return (
                  <div key={m.id} className={`flex items-center gap-4 p-4 border rounded-lg hover:shadow-sm transition-shadow ${
                    m.status === 'DEVOLVIDA' ? 'border-amber-300 bg-amber-50/30' :
                    m.status === 'SUBMETIDA' ? 'border-yellow-200 bg-yellow-50/20' :
                    m.status === 'APROVADA' ? 'border-green-200' : ''
                  }`}>
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-700 font-bold text-sm shrink-0">
                      {m.numero_medicao}ª
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{m.numero_medicao}ª Medição</span>
                        <Badge className={statusInfo.cor}>
                          <StatusIcon className="w-3 h-3 mr-1" />{statusInfo.label}
                        </Badge>
                        {m.fornecedor_nome && (
                          <span className="text-xs text-gray-400">Fornecedor: {m.fornecedor_nome}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-500">
                        <span>{formatarData(m.periodo_inicio)} a {formatarData(m.periodo_fim)}</span>
                        <span className="font-medium text-gray-700">{formatarMoeda(m.valor_medido)}</span>
                        <span>{Number(m.percentual_fisico_medido).toFixed(1)}% físico</span>
                        {m.nota_fiscal_numero && <span className="text-xs">NF: {m.nota_fiscal_numero}</span>}
                      </div>

                      {/* Timeline mini */}
                      <div className="mt-2 flex items-center gap-1 text-xs">
                        <span className={`px-1.5 py-0.5 rounded ${m.created_at ? 'bg-gray-200 text-gray-600' : 'bg-gray-100 text-gray-400'}`}>
                          Criada
                        </span>
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <span className={`px-1.5 py-0.5 rounded ${m.data_submissao ? 'bg-blue-200 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                          {m.data_submissao ? `Submetida ${formatarData(m.data_submissao)}` : 'Submissão'}
                        </span>
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <span className={`px-1.5 py-0.5 rounded ${m.ateste_data ? 'bg-yellow-200 text-yellow-700' : 'bg-gray-100 text-gray-400'}`}>
                          {m.ateste_data ? `Atestada ${formatarData(m.ateste_data)}` : 'Ateste'}
                        </span>
                        <ChevronRight className="w-3 h-3 text-gray-300" />
                        <span className={`px-1.5 py-0.5 rounded ${
                          m.status === 'APROVADA' ? 'bg-green-200 text-green-700' :
                          m.status === 'REJEITADA' ? 'bg-red-200 text-red-700' :
                          'bg-gray-100 text-gray-400'
                        }`}>
                          {m.data_aprovacao ? `${m.status === 'APROVADA' ? 'Aprovada' : 'Rejeitada'} ${formatarData(m.data_aprovacao)}` : 'Aprovação'}
                        </span>
                      </div>

                      {m.status === 'DEVOLVIDA' && m.motivo_devolucao && (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                          <strong>Devolvida:</strong> {m.motivo_devolucao}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.status === 'RASCUNHO' && !m.fornecedor_nome && (
                        <>
                          <Button variant="outline" size="sm" onClick={() => enviarParaAprovacao(m.id)} disabled={actionLoading}>
                            <Send className="w-3.5 h-3.5 mr-1" />Enviar p/ Aprovação
                          </Button>
                          <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => excluirMedicao(m.id, m.numero_medicao)} disabled={actionLoading}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      {m.status === 'RASCUNHO' && m.fornecedor_nome && (
                        <>
                          <Badge variant="outline" className="text-xs text-gray-500">
                            <Clock className="w-3 h-3 mr-1" />Rascunho do fornecedor
                          </Badge>
                          <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => excluirMedicao(m.id, m.numero_medicao)} disabled={actionLoading}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </>
                      )}
                      {(m.status === 'SUBMETIDA' || m.status === 'PARCIALMENTE_ATESTADA') && (
                        <>
                          <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={() => onAtestar ? onAtestar(m) : abrirModalAteste(m)}>
                            <ClipboardCheck className="w-3.5 h-3.5 mr-1" />{m.status === 'PARCIALMENTE_ATESTADA' ? 'Continuar Ateste' : 'Atestar'}
                          </Button>
                          <Button size="sm" variant="outline" className="text-amber-600" onClick={() => { setModalDevolver(m); setMotivoDevolucao('') }}>
                            <RotateCcw className="w-3.5 h-3.5 mr-1" />Devolver
                          </Button>
                        </>
                      )}
                      {podeExcluirMedicao && m.status !== 'RASCUNHO' && (
                        <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50" onClick={() => excluirMedicao(m.id, m.numero_medicao, m.status)} disabled={actionLoading}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => abrirDetalhe(m)}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ============ MODAIS ============ */}

      {/* Modal Escolha Tipo Cronograma (quando ambos vazios) */}
      <Dialog open={modalTipoCronograma} onOpenChange={setModalTipoCronograma}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar ao Cronograma</DialogTitle>
            <DialogDescription>Escolha o tipo de item a cadastrar</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2"
              onClick={() => { setModalTipoCronograma(false); abrirModalEtapa() }}
            >
              <Layers className="w-8 h-8 text-blue-600" />
              <span className="font-medium">Etapa</span>
              <span className="text-xs text-gray-500">Obras: % físico, valor previsto, datas</span>
            </Button>
            <Button
              variant="outline"
              className="h-24 flex flex-col gap-2"
              onClick={() => { setModalTipoCronograma(false); abrirModalItemCronograma() }}
            >
              <ListOrdered className="w-8 h-8 text-green-600" />
              <span className="font-medium">Item</span>
              <span className="text-xs text-gray-500">Serviços: unidade, quantidade, valor unit.</span>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Nova/Editar Etapa */}
      <Dialog open={modalEtapa} onOpenChange={setModalEtapa}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editandoEtapa ? 'Editar Etapa' : 'Nova Etapa do Cronograma'}</DialogTitle>
            <DialogDescription>Defina a etapa com percentual físico e valor previsto</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input placeholder="Ex: Fundação, Alvenaria, Cobertura..." value={formEtapa.descricao} onChange={e => setFormEtapa({ ...formEtapa, descricao: e.target.value })} />
            </div>
            {/* Indicador de saldo disponível */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Valor do contrato:</span>
                <span className="font-medium">{formatarMoeda(valorGlobal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Alocado em etapas:</span>
                <span className="font-medium">{formatarMoeda(editandoEtapa ? somaValorEtapas - Number(editandoEtapa.valor_previsto) : somaValorEtapas)}</span>
              </div>
              <div className="flex justify-between border-t border-blue-200 pt-1 mt-1">
                <span className="text-blue-700 font-medium">Disponível:</span>
                <span className="font-bold text-blue-700">{formatarMoeda(editandoEtapa ? saldoValorEtapas + Number(editandoEtapa.valor_previsto) : saldoValorEtapas)}</span>
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-gray-600">% Alocado:</span>
                <span className="font-medium">{(editandoEtapa ? somaPercentualEtapas - Number(editandoEtapa.percentual_fisico) : somaPercentualEtapas).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-700 font-medium">% Disponível:</span>
                <span className="font-bold text-blue-700">{(editandoEtapa ? saldoPercentualEtapas + Number(editandoEtapa.percentual_fisico) : saldoPercentualEtapas).toFixed(2)}%</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>% Físico da Obra</Label>
                <Input
                  type="number" step="0.01" min="0" max="100" placeholder="Ex: 25"
                  value={formEtapa.percentual_fisico}
                  onChange={e => {
                    const perc = e.target.value
                    const valorCalc = perc && valorGlobal > 0 ? ((parseFloat(perc) / 100) * valorGlobal).toFixed(2) : ''
                    setFormEtapa({ ...formEtapa, percentual_fisico: perc, valor_previsto: valorCalc })
                  }}
                />
                {formEtapa.percentual_fisico && (() => {
                  const dispPerc = editandoEtapa ? saldoPercentualEtapas + Number(editandoEtapa.percentual_fisico) : saldoPercentualEtapas
                  const excede = parseFloat(formEtapa.percentual_fisico) > dispPerc + 0.01
                  return excede ? <p className="text-xs text-red-500 font-medium">Excede o % disponível ({dispPerc.toFixed(2)}%)</p> : null
                })()}
              </div>
              <div className="space-y-2">
                <Label>Valor Previsto (R$)</Label>
                <Input
                  type="number" step="0.01" min="0" placeholder="0,00"
                  value={formEtapa.valor_previsto}
                  onChange={e => {
                    const valor = e.target.value
                    const percCalc = valor && valorGlobal > 0 ? ((parseFloat(valor) / valorGlobal) * 100).toFixed(2) : ''
                    setFormEtapa({ ...formEtapa, valor_previsto: valor, percentual_fisico: percCalc })
                  }}
                />
                {formEtapa.valor_previsto && (() => {
                  const dispValor = editandoEtapa ? saldoValorEtapas + Number(editandoEtapa.valor_previsto) : saldoValorEtapas
                  const excede = parseFloat(formEtapa.valor_previsto) > dispValor + 0.01
                  return excede ? <p className="text-xs text-red-500 font-medium">Excede o saldo disponível ({formatarMoeda(dispValor)})</p> : null
                })()}
              </div>
            </div>
            <p className="text-xs text-gray-400">Informe o % ou o valor em R$ - o outro campo será calculado automaticamente.</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Início Previsto *</Label>
                <Input type="date" value={formEtapa.data_inicio_prevista} onChange={e => setFormEtapa({ ...formEtapa, data_inicio_prevista: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Fim Previsto *</Label>
                <Input type="date" value={formEtapa.data_fim_prevista} onChange={e => setFormEtapa({ ...formEtapa, data_fim_prevista: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Observações opcionais" value={formEtapa.observacoes} onChange={e => setFormEtapa({ ...formEtapa, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEtapa(false)}>Cancelar</Button>
            <Button onClick={salvarEtapa} disabled={actionLoading || !formEtapa.descricao || !formEtapa.percentual_fisico || !formEtapa.valor_previsto}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editandoEtapa ? 'Salvar' : 'Criar Etapa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nova/Editar Item do Cronograma */}
      <Dialog open={modalItemCronograma} onOpenChange={setModalItemCronograma}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editandoItemCronograma ? 'Editar Item' : 'Novo Item do Cronograma'}</DialogTitle>
            <DialogDescription>Descrição, unidade, quantidade, meses e valor unitário</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Valor do contrato:</span>
                <span className="font-medium">{formatarMoeda(valorGlobal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Já alocado:</span>
                <span className="font-medium">{formatarMoeda(editandoItemCronograma ? somaValorItensCronograma - Number(editandoItemCronograma.valor_total) : somaValorItensCronograma)}</span>
              </div>
              <div className="flex justify-between border-t border-blue-200 pt-1 mt-1">
                <span className="text-blue-700 font-medium">Disponível:</span>
                <span className="font-bold text-blue-700">{formatarMoeda(editandoItemCronograma ? saldoValorItens + Number(editandoItemCronograma.valor_total) : saldoValorItens)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input placeholder="Ex: Serviço de gravações, Manutenção mensal..." value={formItemCronograma.descricao} onChange={e => setFormItemCronograma({ ...formItemCronograma, descricao: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Unidade de Medida</Label>
                <Select value={formItemCronograma.unidade_medida} onValueChange={v => {
                  // Ao trocar para MENSAL, limpa quantidade_meses e recalcula
                  const q = parseFloat(formItemCronograma.quantidade) || 0
                  const vl = parseFloat(formItemCronograma.valor_unitario) || 0
                  const isMensal = v === 'MENSAL'
                  const mensal = isMensal ? (vl ? vl.toFixed(2) : '') : (q && vl ? (q * vl).toFixed(2) : '')
                  const total = isMensal ? (q && vl ? (q * vl).toFixed(2) : '') : mensal
                  setFormItemCronograma({
                    ...formItemCronograma,
                    unidade_medida: v,
                    quantidade_meses: isMensal ? '' : formItemCronograma.quantidade_meses,
                    valor_mensal: mensal,
                    valor_total: total,
                  })
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {unidadesCronograma.map(u => (
                      <SelectItem key={u} value={u}>{u}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantidade {formItemCronograma.unidade_medida === 'MENSAL' ? '(Meses) *' : '*'}</Label>
                <Input
                  type="number" step="0.0001" min="0"
                  placeholder={formItemCronograma.unidade_medida === 'MENSAL' ? 'Ex: 12' : '0'}
                  value={formItemCronograma.quantidade}
                  onChange={e => {
                    const q = e.target.value
                    const vl = parseFloat(formItemCronograma.valor_unitario) || 0
                    const isMensal = formItemCronograma.unidade_medida === 'MENSAL'
                    const meses = isMensal ? null : (formItemCronograma.quantidade_meses ? parseInt(formItemCronograma.quantidade_meses) : null)
                    // MENSAL: Valor Mensal = Valor Unitário (por mês); Valor Total = Qtd. meses × Valor Unitário
                    // OUTROS: Valor Mensal = Qtd × Valor Unitário; Valor Total = Valor Mensal × Qtd.Meses
                    const mensal = isMensal
                      ? (vl ? vl.toFixed(2) : '')
                      : (q && vl ? (parseFloat(q) * vl).toFixed(2) : '')
                    const total = isMensal
                      ? (q && vl ? (parseFloat(q) * vl).toFixed(2) : '')
                      : (mensal && meses ? (parseFloat(mensal) * meses).toFixed(2) : mensal)
                    setFormItemCronograma({ ...formItemCronograma, quantidade: q, valor_mensal: mensal, valor_total: total })
                  }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor Unitário {formItemCronograma.unidade_medida === 'MENSAL' ? '(R$/mês) *' : '(R$) *'}</Label>
                <Input
                  type="number" step="0.01" min="0" placeholder="0,00"
                  value={formItemCronograma.valor_unitario}
                  onChange={e => {
                    const v = e.target.value
                    const q = parseFloat(formItemCronograma.quantidade) || 0
                    const isMensal = formItemCronograma.unidade_medida === 'MENSAL'
                    const meses = isMensal ? null : (formItemCronograma.quantidade_meses ? parseInt(formItemCronograma.quantidade_meses) : null)
                    const mensal = isMensal
                      ? (v ? parseFloat(v).toFixed(2) : '')
                      : (v && q ? (parseFloat(v) * q).toFixed(2) : '')
                    const total = isMensal
                      ? (q && v ? (q * parseFloat(v)).toFixed(2) : '')
                      : (mensal && meses ? (parseFloat(mensal) * meses).toFixed(2) : mensal)
                    setFormItemCronograma({ ...formItemCronograma, valor_unitario: v, valor_mensal: mensal, valor_total: total })
                  }}
                />
              </div>
              {/* Qtd. Meses: oculto para unidade MENSAL (quantidade já representa os meses) */}
              {formItemCronograma.unidade_medida !== 'MENSAL' && (
                <div className="space-y-2">
                  <Label>Qtd. Meses</Label>
                  <Input
                    type="number" step="1" min="1" placeholder="Ex: 12"
                    value={formItemCronograma.quantidade_meses}
                    onChange={e => {
                      const m = e.target.value
                      const mensal = parseFloat(formItemCronograma.valor_mensal) || 0
                      const total = m && mensal ? (parseInt(m) * mensal).toFixed(2) : formItemCronograma.valor_mensal
                      setFormItemCronograma({ ...formItemCronograma, quantidade_meses: m, valor_total: total })
                    }}
                  />
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Valor Mensal (R$)</Label>
                <Input type="text" readOnly className="bg-gray-50 font-medium" value={formItemCronograma.valor_mensal ? formatarMoeda(parseFloat(formItemCronograma.valor_mensal)) : '0,00'} />
              </div>
              <div className="space-y-2">
                <Label>Valor Total (R$)</Label>
                <Input type="text" readOnly className="bg-gray-50 font-medium text-blue-700" value={formItemCronograma.valor_total ? formatarMoeda(parseFloat(formItemCronograma.valor_total)) : '0,00'} />
              </div>
            </div>
            {isAdmin && editandoItemCronograma && (
              <div className="space-y-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <Label className="text-amber-800 font-medium">Quantidade já utilizada (ajuste migração)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={parseFloat(formItemCronograma.quantidade) || 0}
                  value={formItemCronograma.quantidade_medida}
                  onChange={e => setFormItemCronograma({ ...formItemCronograma, quantidade_medida: e.target.value })}
                  placeholder="0"
                />
                <p className="text-xs text-amber-700">Informe a quantidade já consumida antes da implantação do sistema. Será considerada nos cálculos de disponibilidade.</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Opcional" value={formItemCronograma.observacoes} onChange={e => setFormItemCronograma({ ...formItemCronograma, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalItemCronograma(false)}>Cancelar</Button>
            <Button onClick={salvarItemCronograma} disabled={actionLoading || !formItemCronograma.descricao || !formItemCronograma.quantidade || !formItemCronograma.valor_unitario || parseFloat(formItemCronograma.quantidade) <= 0 || parseFloat(formItemCronograma.valor_unitario) <= 0}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editandoItemCronograma ? 'Salvar' : 'Criar Item'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nova Medição — 100% igual ao fornecedor */}
      <Dialog open={modalMedicao} onOpenChange={(open) => {
        setModalMedicao(open)
        if (!open) {
          setExecucaoFinanceiraModal(null)
          setDiscriminacoes([])
          setArquivosPendentes([])
        }
      }}>
        <DialogContent className="w-[96vw] max-w-[96vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl">Boletim de Medição #{medicoes.length + 1}</DialogTitle>
                <DialogDescription>
                  {formMedicao.periodo_inicio && formMedicao.periodo_fim
                    ? `Período: ${formatarData(formMedicao.periodo_inicio)} a ${formatarData(formMedicao.periodo_fim)}`
                    : 'Informe o período e preencha a execução de cada item'}
                </DialogDescription>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Valor da Medição</p>
                {(() => {
                  const totalMedicao = isServicoContinuado
                    ? (parseFloat(formMedicao.valor_medido) || 0)
                    : usarItensCronograma
                      ? formMedicao.itens.reduce((acc, item) => {
                          if (!('item_cronograma_id' in item)) return acc
                          const ic = itensCronograma.find(i => i.id === item.item_cronograma_id)
                          return acc + (ic ? item.quantidade_medida * Number(ic.valor_unitario) : 0)
                        }, 0)
                      : formMedicao.itens.reduce((acc, item, idx) => {
                          const etapa = etapas[idx]
                          if (!etapa || !('etapa_id' in item)) return acc
                          return (item.modo_input === 'valor' && item.valor_executado_atual) ? acc + item.valor_executado_atual : acc + (item.percentual_executado_atual / 100) * Number(etapa.valor_previsto)
                        }, 0)
                  const saldoDisp = resumo?.saldo_disponivel ?? Infinity
                  const excedeSaldo = totalMedicao > saldoDisp + 0.01
                  return (
                    <>
                      <p className={`text-2xl font-bold ${excedeSaldo ? 'text-red-600' : 'text-blue-700'}`}>
                        {formatarMoeda(totalMedicao)}
                      </p>
                      {excedeSaldo && (
                        <p className="text-xs text-red-500 mt-1">Excede o saldo de {formatarMoeda(saldoDisp)}</p>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border bg-orange-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-orange-700">Vigência do contrato</p>
                <p className="mt-1 text-sm font-semibold text-orange-900">
                  {contratoProp?.data_vigencia_inicio && contratoProp?.data_vigencia_fim
                    ? `${formatarData(contratoProp.data_vigencia_inicio)} a ${formatarData(contratoProp.data_vigencia_fim)}`
                    : '-'}
                </p>
              </div>
              <div className="rounded-lg border bg-blue-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Saldo disponível</p>
                <p className={`mt-1 text-sm font-semibold ${(resumo?.saldo_disponivel || 0) > 0 ? 'text-blue-900' : 'text-red-700'}`}>
                  {formatarMoeda(resumo?.saldo_disponivel || 0)}
                </p>
                {(resumo?.valor_em_analise || 0) > 0 && (
                  <p className="mt-1 text-xs text-amber-600">Em análise: {formatarMoeda(resumo?.valor_em_analise || 0)}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div><Label>Período Início *</Label>
                <Input type="date" value={formMedicao.periodo_inicio}
                  onChange={e => {
                    const v = e.target.value
                    if (usarItensCronograma && v && formMedicao.periodo_fim) {
                      const dias = calcularDiasMesComercial(v, formMedicao.periodo_fim, contratoProp?.data_vigencia_fim)
                      const fator = Math.min(dias / 30, 1)
                      const itens = itensCronograma.map(ic => {
                        const saldo = Number(ic.quantidade) - Number(ic.quantidade_medida) - (resumo?.itens_comprometidos?.[ic.id] || 0)
                        const isMensal = ic.unidade_medida === 'MENSAL'
                        const qtd = isMensal ? Math.min(Math.round(fator * 1000) / 1000, saldo) : Math.min(Math.round(fator * saldo * 1000) / 1000, saldo)
                        return { item_cronograma_id: ic.id, quantidade_medida: qtd, modo_input: 'quantidade' as const, valor_override: Math.round(qtd * Number(ic.valor_unitario) * 100) / 100 }
                      })
                      setFormMedicao({ ...formMedicao, periodo_inicio: v, itens })
                    } else setFormMedicao({ ...formMedicao, periodo_inicio: v })
                    if (v && formMedicao.periodo_fim) carregarExecucaoFinanceiraModal(undefined, v, formMedicao.periodo_fim)
                  }} />
              </div>
              <div><Label>Período Fim *</Label>
                <Input type="date" value={formMedicao.periodo_fim}
                  onChange={e => {
                    const v = e.target.value
                    if (usarItensCronograma && formMedicao.periodo_inicio && v) {
                      const dias = calcularDiasMesComercial(formMedicao.periodo_inicio, v, contratoProp?.data_vigencia_fim)
                      const fator = Math.min(dias / 30, 1)
                      const itens = itensCronograma.map(ic => {
                        const saldo = Number(ic.quantidade) - Number(ic.quantidade_medida) - (resumo?.itens_comprometidos?.[ic.id] || 0)
                        const isMensal = ic.unidade_medida === 'MENSAL'
                        const qtd = isMensal ? Math.min(Math.round(fator * 1000) / 1000, saldo) : Math.min(Math.round(fator * saldo * 1000) / 1000, saldo)
                        return { item_cronograma_id: ic.id, quantidade_medida: qtd, modo_input: 'quantidade' as const, valor_override: Math.round(qtd * Number(ic.valor_unitario) * 100) / 100 }
                      })
                      setFormMedicao({ ...formMedicao, periodo_fim: v, itens })
                    } else setFormMedicao({ ...formMedicao, periodo_fim: v })
                    if (formMedicao.periodo_inicio && v) carregarExecucaoFinanceiraModal(undefined, formMedicao.periodo_inicio, v)
                  }} />
              </div>
            </div>

            <div>
              <Label>Competência *</Label>
              <Input value={formMedicao.competencia} onChange={e => setFormMedicao({ ...formMedicao, competencia: e.target.value })} placeholder="Ex: FEVEREIRO/2026" className="uppercase" />
              <p className="text-xs text-gray-500 mt-1">Informe a competência no formato MÊS/ANO (ex: FEVEREIRO/2026)</p>
            </div>

            {isServicoContinuado && (
              <div className="border rounded-lg p-4 bg-blue-50/30">
                <Label className="text-sm font-bold text-gray-700 mb-2 block">Valor Medido no Período (R$) *</Label>
                <Input type="number" step="0.01" min="0" value={formMedicao.valor_medido} onChange={e => setFormMedicao({ ...formMedicao, valor_medido: e.target.value })} placeholder="0,00" className="max-w-xs text-lg font-medium" />
                {resumo && <p className="text-xs text-gray-500 mt-2">Saldo disponível: {formatarMoeda(resumo.saldo_disponivel)} de {formatarMoeda(valorGlobal)}</p>}
              </div>
            )}

            {!isServicoContinuado && usarItensCronograma && (
              <div className="border rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b gap-3">
                  <p className="text-xs text-gray-500">Para períodos parciais (ex: 21 dias), use <strong>Proporcional</strong> ou informe o <strong>Valor R$</strong> diretamente.</p>
                  <Button type="button" variant="outline" size="sm" disabled={!formMedicao.periodo_inicio || !formMedicao.periodo_fim}
                    onClick={() => {
                      if (!formMedicao.periodo_inicio || !formMedicao.periodo_fim) return
                      const dias = calcularDiasMesComercial(formMedicao.periodo_inicio, formMedicao.periodo_fim, contratoProp?.data_vigencia_fim)
                      const fator = Math.min(dias / 30, 1)
                      const itens = itensCronograma.map(ic => {
                        const saldo = Number(ic.quantidade) - Number(ic.quantidade_medida) - (resumo?.itens_comprometidos?.[ic.id] || 0)
                        const isMensal = ic.unidade_medida === 'MENSAL'
                        const qtd = isMensal ? Math.min(Math.round(fator * 1000) / 1000, saldo) : Math.min(Math.round(fator * saldo * 1000) / 1000, saldo)
                        return { item_cronograma_id: ic.id, quantidade_medida: qtd, modo_input: 'quantidade' as const, valor_override: Math.round(qtd * Number(ic.valor_unitario) * 100) / 100 }
                      })
                      setFormMedicao({ ...formMedicao, itens })
                    }}
                    className="text-blue-700 border-blue-300 hover:bg-blue-50 whitespace-nowrap">
                    Proporcional ({formMedicao.periodo_inicio && formMedicao.periodo_fim ? `${calcularDiasMesComercial(formMedicao.periodo_inicio, formMedicao.periodo_fim, contratoProp?.data_vigencia_fim)}/30 dias` : 'defina o período'})
                  </Button>
                </div>
                <Table>
                  <TableHeader><TableRow className="bg-gray-50">
                    <TableHead className="w-12 text-center font-bold text-xs uppercase">Item</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Descrição</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-20">Unidade</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase w-20">Qtd. Total</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase w-24">Valor Unit.</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-24 bg-blue-50">Qtd. Mês/Dias</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-28 bg-green-50">Valor R$</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase w-24 bg-blue-50">Subtotal</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {itensCronograma.map((ic, idx) => {
                      const itemState = formMedicao.itens[idx] as { item_cronograma_id: string; quantidade_medida: number; modo_input?: 'quantidade' | 'valor'; valor_override?: number } | undefined
                      const qtdMedida = itemState?.quantidade_medida || 0
                      const valorOverride = itemState?.valor_override
                      const modoInput = itemState?.modo_input ?? 'quantidade'
                      const qtdTotal = Number(ic.quantidade)
                      const qtdAprovada = Number(ic.quantidade_medida)
                      const emTransito = resumo?.itens_comprometidos?.[ic.id] || 0
                      const saldo = qtdTotal - qtdAprovada - emTransito
                      const valorUnit = Number(ic.valor_unitario)
                      const subtotal = modoInput === 'valor' && valorOverride != null ? valorOverride : qtdMedida * valorUnit
                      const excedeSaldo = modoInput === 'valor' ? (valorOverride || 0) > saldo * valorUnit + 0.01 : qtdMedida > saldo + 0.001
                      return (
                        <TableRow key={ic.id} className="hover:bg-gray-50">
                          <TableCell className="text-center font-mono text-sm font-medium">{ic.numero_item}</TableCell>
                          <TableCell className="whitespace-normal break-words min-w-[200px]"><p className="text-sm font-medium">{ic.descricao}</p></TableCell>
                          <TableCell className="text-center text-sm">{ic.unidade_medida}</TableCell>
                          <TableCell className="text-right text-sm">{qtdTotal.toLocaleString('pt-BR')}</TableCell>
                          <TableCell className="text-right text-sm">{formatarMoeda(valorUnit)}</TableCell>
                          <TableCell className="bg-blue-50/50">
                            <Input type="number" step="0.001" min="0" max={saldo} placeholder="0" value={modoInput === 'quantidade' ? (qtdMedida || '') : (qtdMedida > 0 ? qtdMedida.toFixed(4) : '')}
                              onChange={e => { const val = parseFloat(e.target.value) || 0; const itens = [...formMedicao.itens]; itens[idx] = { item_cronograma_id: ic.id, quantidade_medida: val, modo_input: 'quantidade', valor_override: Math.round(val * valorUnit * 100) / 100 }; setFormMedicao({ ...formMedicao, itens }) }}
                              className={`text-center h-8 text-sm ${modoInput === 'quantidade' ? 'ring-1 ring-blue-300 bg-white' : 'bg-gray-50 text-gray-500'} ${excedeSaldo ? 'border-red-400' : ''}`} />
                          </TableCell>
                          <TableCell className="bg-green-50/50">
                            <Input type="number" step="0.01" min="0" max={saldo * valorUnit} placeholder="0,00" value={modoInput === 'valor' ? (valorOverride || '') : (subtotal > 0 ? subtotal.toFixed(2) : '')}
                              onChange={e => { const val = parseFloat(e.target.value) || 0; const qtdCalc = valorUnit > 0 ? Math.round((val / valorUnit) * 10000) / 10000 : 0; const itens = [...formMedicao.itens]; itens[idx] = { item_cronograma_id: ic.id, quantidade_medida: qtdCalc, modo_input: 'valor', valor_override: val }; setFormMedicao({ ...formMedicao, itens }) }}
                              className={`text-center h-8 text-sm ${modoInput === 'valor' ? 'ring-1 ring-green-300 bg-white' : 'bg-gray-50 text-gray-500'} ${excedeSaldo ? 'border-red-400' : ''}`} />
                          </TableCell>
                          <TableCell className="text-right font-medium bg-blue-50/50">
                            <span className={`text-sm ${subtotal > 0 ? (excedeSaldo ? 'text-red-600' : 'text-blue-700') : 'text-gray-400'}`}>{formatarMoeda(subtotal)}</span>
                            {excedeSaldo && <p className="text-xs text-red-500">Excede saldo</p>}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {!isServicoContinuado && !usarItensCronograma && (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader><TableRow className="bg-gray-50">
                    <TableHead className="w-16 text-center font-bold text-xs uppercase">Item</TableHead>
                    <TableHead className="font-bold text-xs uppercase">Descrição</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase w-28">Valor Prev.</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-20">Med. Acum.</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-28 bg-blue-50">Exec. Mês (%)</TableHead>
                    <TableHead className="text-center font-bold text-xs uppercase w-32 bg-green-50">Exec. Mês (R$)</TableHead>
                    <TableHead className="text-right font-bold text-xs uppercase w-28 bg-blue-50">Subtotal</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {etapas.filter(e => e.status !== 'CONCLUIDA').map((etapa, idx) => {
                      const jaExecutado = Number(etapa.percentual_executado)
                      const emTransito = resumo?.etapas_comprometidas?.[etapa.id] || 0
                      const itemState = formMedicao.itens[idx] as { etapa_id: string; percentual_executado_atual: number; valor_executado_atual?: number; modo_input?: 'percentual' | 'valor' } | undefined
                      const modoInput = itemState?.modo_input ?? 'percentual'
                      const execPerc = itemState?.percentual_executado_atual ?? 0
                      const execValor = itemState?.valor_executado_atual ?? 0
                      const valorPrevisto = Number(etapa.valor_previsto)
                      const restante = 100 - jaExecutado - emTransito
                      const valorRestante = (restante / 100) * valorPrevisto
                      const subtotal = modoInput === 'valor' ? execValor : (execPerc / 100) * valorPrevisto
                      const percExibido = modoInput === 'valor' && valorPrevisto > 0 ? (execValor / valorPrevisto) * 100 : execPerc
                      const excedeLimite = percExibido > restante + 0.01
                      return (
                        <TableRow key={etapa.id} className="hover:bg-gray-50">
                          <TableCell className="text-center font-mono text-sm font-medium">{etapa.numero_etapa}</TableCell>
                          <TableCell><p className="text-sm font-medium">{etapa.descricao}</p><p className="text-xs text-gray-400">Disponível: {restante.toFixed(1)}% ({formatarMoeda(valorRestante)})</p></TableCell>
                          <TableCell className="text-right text-sm">{formatarMoeda(valorPrevisto)}</TableCell>
                          <TableCell className="text-center"><span className="text-sm font-medium text-blue-600">{jaExecutado.toFixed(0)}%</span></TableCell>
                          <TableCell className="bg-blue-50/50">
                            <Input type="number" min="0" max={restante} step="0.1" placeholder="0" value={modoInput === 'percentual' ? (execPerc || '') : (percExibido > 0 ? percExibido.toFixed(2) : '')}
                              onChange={e => { const num = e.target.value === '' ? 0 : Number(e.target.value); const itens = [...formMedicao.itens]; itens[idx] = { etapa_id: etapa.id, percentual_executado_atual: num, valor_executado_atual: valorPrevisto > 0 ? (num / 100) * valorPrevisto : 0, modo_input: 'percentual' }; setFormMedicao({ ...formMedicao, itens }) }}
                              className={`text-center h-8 text-sm ${modoInput === 'percentual' ? 'ring-1 ring-blue-300 bg-white' : 'bg-gray-50 text-gray-500'} ${excedeLimite ? 'border-red-400' : ''}`} />
                          </TableCell>
                          <TableCell className="bg-green-50/50">
                            <Input type="number" min="0" max={valorRestante} step="0.01" placeholder="0,00" value={modoInput === 'valor' ? (execValor || '') : (subtotal > 0 ? subtotal.toFixed(2) : '')}
                              onChange={e => { const num = e.target.value === '' ? 0 : Number(e.target.value); const perc = valorPrevisto > 0 ? (num / valorPrevisto) * 100 : 0; const itens = [...formMedicao.itens]; itens[idx] = { etapa_id: etapa.id, percentual_executado_atual: Math.round(perc * 100) / 100, valor_executado_atual: num, modo_input: 'valor' }; setFormMedicao({ ...formMedicao, itens }) }}
                              className={`text-center h-8 text-sm ${modoInput === 'valor' ? 'ring-1 ring-green-300 bg-white' : 'bg-gray-50 text-gray-500'} ${excedeLimite ? 'border-red-400' : ''}`} />
                          </TableCell>
                          <TableCell className="text-right bg-blue-50/50"><span className={`text-sm font-medium ${subtotal > 0 ? (excedeLimite ? 'text-red-600' : 'text-blue-700') : 'text-gray-400'}`}>{formatarMoeda(subtotal)}</span></TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {formMedicao.periodo_inicio && formMedicao.periodo_fim && contratoProp?.data_vigencia_inicio && contratoProp?.data_vigencia_fim && (() => {
              const valorMedicaoAtual = isServicoContinuado
                ? (parseFloat(formMedicao.valor_medido) || 0)
                : usarItensCronograma
                  ? formMedicao.itens.reduce((acc, item) => {
                      if (!('item_cronograma_id' in item)) return acc
                      const ic = itensCronograma.find(i => i.id === item.item_cronograma_id)
                      return acc + (ic ? item.quantidade_medida * Number(ic.valor_unitario) : 0)
                    }, 0)
                  : formMedicao.itens.reduce((acc, item, idx) => {
                      const etapa = etapas[idx]
                      if (!etapa || !('etapa_id' in item)) return acc
                      return (item.modo_input === 'valor' && item.valor_executado_atual) ? acc + item.valor_executado_atual : acc + (item.percentual_executado_atual / 100) * Number(etapa.valor_previsto)
                    }, 0)
              const valorAprovadoAnterior = Number(resumo?.valor_medido_total || 0)
              const noPeriodoBackend = Number(execucaoFinanceiraModal?.totais?.no_periodo || 0)
              const atePeriodoBackend = Number(execucaoFinanceiraModal?.totais?.ate_periodo || 0)
              const aExecutarBackend = Number(execucaoFinanceiraModal?.totais?.a_executar || 0)
              const noPeriodoExibicao = Math.max(noPeriodoBackend, valorMedicaoAtual || 0)
              const valorLocalNaoPersistido = Math.max(0, noPeriodoExibicao - noPeriodoBackend)
              const atePeriodoExibicao = atePeriodoBackend > 0
                ? atePeriodoBackend + valorLocalNaoPersistido
                : (valorAprovadoAnterior + noPeriodoExibicao)
              const aExecutarExibicao = Math.max(
                0,
                aExecutarBackend > 0 || atePeriodoBackend > 0
                  ? aExecutarBackend - valorLocalNaoPersistido
                  : Number(valorGlobal || contratoProp?.valor_global || 0) - atePeriodoExibicao
              )
              return (
              <div className="bg-gradient-to-r from-blue-50 to-green-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3"><TrendingUp className="w-5 h-5 text-blue-600" /><h3 className="text-lg font-semibold text-blue-800">Execução Fiscal e Financeira</h3></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <h4 className="font-medium text-blue-700 mb-3 flex items-center gap-2">
                      {contratoProp?.boletim_por_quantidade ? <><BarChart3 className="w-4 h-4" />Execução Fiscal (Quantidade)</> : <><Clock className="w-4 h-4" />Execução Fiscal (Tempo)</>}
                    </h4>
                    <div className="space-y-2 text-sm">
                      {contratoProp?.boletim_por_quantidade && usarItensCronograma ? (
                        itensCronograma.length === 1 ? (
                          (() => {
                            const ic = itensCronograma[0]
                            const itemState = formMedicao.itens[0] as { quantidade_medida?: number } | undefined
                            const qtdNoPeriodo = Number(itemState?.quantidade_medida ?? 0)
                            const qtdAprovada = Number(ic.quantidade_medida ?? 0)
                            const qtdTotal = Number(ic.quantidade ?? 0)
                            const qtdAtePeriodo = qtdAprovada + qtdNoPeriodo
                            const qtdAExecutar = Math.max(0, qtdTotal - qtdAtePeriodo)
                            const unidade = ic.unidade_medida || 'UNIDADE'
                            return (
                              <>
                                <div className="flex justify-between"><span className="text-gray-600">No Período:</span><span className="font-medium text-blue-700">{qtdNoPeriodo.toLocaleString('pt-BR')} {unidade}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">Até o Período:</span><span className="font-medium text-blue-700">{qtdAtePeriodo.toLocaleString('pt-BR')} {unidade}</span></div>
                                <div className="flex justify-between"><span className="text-gray-600">A Executar:</span><span className="font-medium text-green-700">{qtdAExecutar.toLocaleString('pt-BR')} {unidade}</span></div>
                              </>
                            )
                          })()
                        ) : <p className="text-gray-600 text-xs">Por item na tabela de itens do boletim</p>
                      ) : !contratoProp?.boletim_por_quantidade ? (
                        <>
                          <div className="flex justify-between"><span className="text-gray-600">No Período:</span><span className="font-medium text-blue-700">{calcularExecucaoFiscal(formMedicao.periodo_inicio, formMedicao.periodo_fim, contratoProp.data_vigencia_inicio, contratoProp.data_vigencia_fim).noPeriodo}</span></div>
                          <div className="flex justify-between"><span className="text-gray-600">Até o Período:</span><span className="font-medium text-blue-700">{calcularExecucaoFiscal(formMedicao.periodo_inicio, formMedicao.periodo_fim, contratoProp.data_vigencia_inicio, contratoProp.data_vigencia_fim).atePeriodo}</span></div>
                          <div className="flex justify-between"><span className="text-gray-600">A Executar:</span><span className="font-medium text-green-700">{calcularExecucaoFiscal(formMedicao.periodo_inicio, formMedicao.periodo_fim, contratoProp.data_vigencia_inicio, contratoProp.data_vigencia_fim).aExecutar}</span></div>
                        </>
                      ) : <p className="text-gray-500 text-xs">Carregue os itens da medição para ver a execução por quantidade</p>}
                    </div>
                  </div>
                  <div className="bg-white rounded-lg p-4 border border-green-200">
                    <h4 className="font-medium text-green-700 mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4" />Execução Financeira (Valores)</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-gray-600">No Período:</span><span className="font-medium text-green-700">{formatarMoeda(noPeriodoExibicao)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">Até o Período:</span><span className="font-medium text-blue-700">{formatarMoeda(atePeriodoExibicao)}</span></div>
                      <div className="flex justify-between"><span className="text-gray-600">A Executar:</span><span className="font-medium text-orange-700">{formatarMoeda(aExecutarExibicao)}</span></div>
                    </div>
                  </div>
                </div>
              </div>
              )
            })()}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Observações do Boletim</Label><Textarea value={formMedicao.observacoes} onChange={e => setFormMedicao({ ...formMedicao, observacoes: e.target.value })} placeholder="Observações relevantes..." rows={4} /></div>
              <div className="space-y-3">
                <Label className="flex items-center gap-2"><DollarSign className="w-4 h-4" />Nota Fiscal (opcional)</Label>
                <Input value={formMedicao.nota_fiscal_numero} onChange={e => setFormMedicao({ ...formMedicao, nota_fiscal_numero: e.target.value })} placeholder="Número da NF" />
                <div className="grid grid-cols-2 gap-2">
                  <Input type="number" step="0.01" value={formMedicao.nota_fiscal_valor} onChange={e => setFormMedicao({ ...formMedicao, nota_fiscal_valor: e.target.value })} placeholder="Valor NF" />
                  <Input type="date" value={formMedicao.nota_fiscal_data} onChange={e => setFormMedicao({ ...formMedicao, nota_fiscal_data: e.target.value })} />
                </div>
              </div>
            </div>

            {/* Discriminação das Despesas — igual ao fornecedor */}
            {(() => {
              const valorMedidoAtual = isServicoContinuado
                ? (parseFloat(formMedicao.valor_medido) || 0)
                : usarItensCronograma
                  ? formMedicao.itens.reduce((acc, item) => {
                      if (!('item_cronograma_id' in item)) return acc
                      const ic = itensCronograma.find(i => i.id === item.item_cronograma_id)
                      return acc + (ic ? item.quantidade_medida * Number(ic.valor_unitario) : 0)
                    }, 0)
                  : formMedicao.itens.reduce((acc, item, idx) => {
                      const etapa = etapas[idx]
                      if (!etapa || !('etapa_id' in item)) return acc
                      return (item.modo_input === 'valor' && item.valor_executado_atual) ? acc + item.valor_executado_atual : acc + (item.percentual_executado_atual / 100) * Number(etapa.valor_previsto)
                    }, 0)
              const totalDiscPerc = discriminacoes.reduce((s, d) => s + (Number(d.percentual) || 0), 0)
              const totalDiscValorBruto = discriminacoes.reduce((s, d) => s + (Number(d.valor) || 0), 0)
              const arredondamentoApenas = valorMedidoAtual > 0 && Math.abs(totalDiscPerc - 100) < 0.05 && Math.abs(totalDiscValorBruto - valorMedidoAtual) <= 0.02
              const totalDiscValor = arredondamentoApenas ? valorMedidoAtual : totalDiscValorBruto
              return (
                <div className="border rounded-lg p-4 bg-amber-50/30">
                  <div className="flex items-center justify-between mb-3">
                    <Label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                      <DollarSign className="w-4 h-4" />
                      Discriminação das Despesas
                      <span className="text-xs font-normal text-gray-400">(opcional - composição do valor da NF)</span>
                    </Label>
                    <div className="flex gap-2">
                      {medicoes.length > 0 && (
                        <Button type="button" variant="outline" size="sm" onClick={async () => {
                          if (valorMedidoAtual <= 0) {
                            alert(isServicoContinuado ? 'Informe o valor medido antes de reaproveitar.' : 'Preencha os itens da planilha antes de reaproveitar.')
                            return
                          }
                          try {
                            const ultima = medicoes[medicoes.length - 1]
                            const res = await authFetch(`${API_URL}/api/contratos/medicoes/${ultima.id}/discriminacoes/sugestao`)
                            if (!res.ok) return
                            const sugestoes = await res.json()
                            if (!sugestoes?.length) {
                              alert('Nenhuma medição anterior possui discriminação para reaproveitar.')
                              return
                            }
                            setDiscriminacoes(sugestoes.map((s: any) => {
                              const perc = Number(s.percentual) || 0
                              const valor = (perc / 100) * valorMedidoAtual
                              return { descricao: s.descricao || '', percentual: perc, valor: Math.round(valor * 100) / 100 }
                            }))
                          } catch {
                            alert('Erro ao buscar despesas da última medição.')
                          }
                        }} className="text-amber-700 border-amber-300 hover:bg-amber-50">
                          Reaproveitar despesas do último mês
                        </Button>
                      )}
                      <Button type="button" variant="outline" size="sm" onClick={() => setDiscriminacoes([...discriminacoes, { descricao: '', valor: 0, percentual: 0 }])}>
                        <Plus className="w-3 h-3 mr-1" /> Adicionar Item
                      </Button>
                    </div>
                  </div>
                  {discriminacoes.length > 0 ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-[40px_1fr_130px_100px_36px] gap-2 text-xs font-semibold text-gray-500 uppercase px-1">
                        <span>Item</span><span>Discriminação</span><span className="text-right">Valor R$</span><span className="text-right">%</span><span></span>
                      </div>
                      {discriminacoes.map((disc, idx) => (
                        <div key={idx} className="grid grid-cols-[40px_1fr_130px_100px_36px] gap-2 items-center">
                          <span className="text-sm text-center font-mono text-gray-500">{idx + 1}</span>
                          <Input value={disc.descricao} onChange={e => { const u = [...discriminacoes]; u[idx] = { ...u[idx], descricao: e.target.value }; setDiscriminacoes(u) }} placeholder="Ex: Tributação, Serviços..." className="h-8 text-sm" />
                          <Input type="number" step="0.01" min="0" value={disc.valor || ''} onChange={e => { const val = e.target.value === '' ? 0 : Number(e.target.value); const perc = valorMedidoAtual > 0 ? (val / valorMedidoAtual) * 100 : 0; const u = [...discriminacoes]; u[idx] = { ...u[idx], valor: val, percentual: Math.round(perc * 10000) / 10000 }; setDiscriminacoes(u) }} placeholder="0,00" className="h-8 text-sm text-right" />
                          <Input type="number" step="0.01" min="0" max="100" value={disc.percentual || ''} onChange={e => { const perc = e.target.value === '' ? 0 : Number(e.target.value); const val = valorMedidoAtual > 0 ? (perc / 100) * valorMedidoAtual : 0; const u = [...discriminacoes]; u[idx] = { ...u[idx], percentual: perc, valor: Math.round(val * 100) / 100 }; setDiscriminacoes(u) }} placeholder="0,00" className="h-8 text-sm text-right" />
                          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-red-400 hover:text-red-600" onClick={() => setDiscriminacoes(discriminacoes.filter((_, i) => i !== idx))}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ))}
                      <div className="grid grid-cols-[40px_1fr_130px_100px_36px] gap-2 items-center border-t pt-2 mt-2">
                        <span></span><span className="text-sm font-bold text-gray-700">Total</span>
                        <span className={`text-sm font-bold text-right ${Math.abs(totalDiscValor - valorMedidoAtual) < 0.02 ? 'text-green-600' : 'text-amber-600'}`}>{formatarMoeda(totalDiscValor)}</span>
                        <span className={`text-sm font-bold text-right ${Math.abs(totalDiscPerc - 100) < 0.02 ? 'text-green-600' : 'text-amber-600'}`}>{totalDiscPerc.toFixed(2)}%</span><span></span>
                      </div>
                      {valorMedidoAtual > 0 && Math.abs(totalDiscValor - valorMedidoAtual) > 0.02 && (
                        <p className="text-xs text-amber-600 mt-1">Valor da medição: {formatarMoeda(valorMedidoAtual)}. Diferença: {formatarMoeda(totalDiscValor - valorMedidoAtual)}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400 text-center py-3">
                      Nenhuma discriminação adicionada. Use &quot;Reaproveitar despesas do último mês&quot; para trazer os % da última medição (valores recalculados pela medição atual) ou &quot;Adicionar Item&quot; para criar manualmente.
                    </p>
                  )}
                </div>
              )
            })()}

            {/* Fotos e Documentos — igual ao fornecedor */}
            <div className="border rounded-lg p-4 bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <Label className="flex items-center gap-2 text-sm font-bold text-gray-700">
                  <Paperclip className="w-4 h-4" />
                  Fotos e Documentos
                  <span className="text-xs font-normal text-gray-400">(opcional)</span>
                </Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'image/jpeg,image/png,image/jpg'
                    input.multiple = true
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files
                      if (files) {
                        const titulo = prompt('Título da foto (opcional):') ?? ''
                        setArquivosPendentes(prev => [...prev, ...Array.from(files).map(f => ({ file: f, tipo: 'FOTO' as const, descricao: titulo }))])
                      }
                    }
                    input.click()
                  }}>
                    <Camera className="w-3 h-3" /> Foto
                  </Button>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => {
                    const input = document.createElement('input')
                    input.type = 'file'
                    input.accept = 'application/pdf,image/jpeg,image/png'
                    input.onchange = (e) => {
                      const files = (e.target as HTMLInputElement).files
                      if (files?.[0]) {
                        const titulo = prompt('Título do documento (opcional):') ?? ''
                        setArquivosPendentes(prev => [...prev, { file: files[0], tipo: 'DOCUMENTO', descricao: titulo }])
                      }
                    }
                    input.click()
                  }}>
                    <Upload className="w-3 h-3" /> Documento
                  </Button>
                </div>
              </div>
              {arquivosPendentes.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Nenhum arquivo adicionado. Você pode adicionar fotos e documentos agora ou depois.</p>
              ) : (
                <div className="space-y-1">
                  {arquivosPendentes.map((arq, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-white rounded px-3 py-1.5 text-xs border">
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{arq.tipo === 'FOTO' ? '📷' : '📄'}</span>
                        <span className="truncate font-medium">{arq.descricao || arq.file.name}</span>
                        <span className="text-gray-400 flex-shrink-0">({(arq.file.size / 1024).toFixed(0)} KB)</span>
                      </div>
                      <Button type="button" size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => setArquivosPendentes(prev => prev.filter((_, i) => i !== idx))}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <Button variant="outline" onClick={() => setModalMedicao(false)}>Cancelar Lançamento</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => salvarMedicao(true)} disabled={
                actionLoading || !formMedicao.periodo_inicio || !formMedicao.periodo_fim ||
                (isServicoContinuado && (!formMedicao.valor_medido || parseFloat(formMedicao.valor_medido) <= 0)) ||
                (!isServicoContinuado && !usarItensCronograma && formMedicao.itens.every(i => 'percentual_executado_atual' in i && (i as any).percentual_executado_atual <= 0 && ((i as any).valor_executado_atual == null || (i as any).valor_executado_atual <= 0))) ||
                (!isServicoContinuado && usarItensCronograma && formMedicao.itens.every(i => 'quantidade_medida' in i && (i as any).quantidade_medida <= 0))
              }>
                {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
                Salvar Rascunho
              </Button>
              <Button onClick={() => salvarMedicao(false)} disabled={
                actionLoading || !formMedicao.periodo_inicio || !formMedicao.periodo_fim ||
                (isServicoContinuado && (!formMedicao.valor_medido || parseFloat(formMedicao.valor_medido) <= 0)) ||
                (!isServicoContinuado && !usarItensCronograma && formMedicao.itens.every(i => 'percentual_executado_atual' in i && (i as any).percentual_executado_atual <= 0 && ((i as any).valor_executado_atual == null || (i as any).valor_executado_atual <= 0))) ||
                (!isServicoContinuado && usarItensCronograma && formMedicao.itens.every(i => 'quantidade_medida' in i && (i as any).quantidade_medida <= 0))
              } className="bg-blue-600 hover:bg-blue-700">
                {actionLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                Enviar para Ateste
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ateste do Fiscal (com seleção por item) */}
      <Dialog open={!!modalAteste} onOpenChange={() => setModalAteste(null)}>
        <DialogContent className="w-[95vw] max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-yellow-600" />
              Atestar {modalAteste?.numero_medicao}ª Medição
            </DialogTitle>
            <DialogDescription>
              Valor medido: {modalAteste && formatarMoeda(modalAteste.valor_medido)} — {modalAteste && Number(modalAteste.percentual_fisico_medido).toFixed(1)}% físico
              {modalAteste?.status === 'PARCIALMENTE_ATESTADA' && (
                <span className="ml-2 text-yellow-600 font-medium">— Ateste parcial em andamento</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {modalAteste?.fornecedor_nome && (
              <div className="p-3 bg-blue-50 rounded-lg text-sm">
                <p className="text-blue-700"><strong>Fornecedor:</strong> {modalAteste.fornecedor_nome}</p>
                {modalAteste.fornecedor_observacoes && <p className="text-blue-600 mt-1 italic">"{modalAteste.fornecedor_observacoes}"</p>}
                {modalAteste.nota_fiscal_numero && (
                  <p className="text-blue-600 mt-1">NF: {modalAteste.nota_fiscal_numero} — {formatarMoeda(modalAteste.nota_fiscal_valor || 0)}</p>
                )}
              </div>
            )}

            {/* Tabela de Itens para Ateste */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 uppercase tracking-wide font-bold">Itens do Cronograma</p>
                {(() => {
                  const itens = ((modalAteste as any)?.itens || []) as any[]
                  const totalAtestados = itens.filter((i: any) => i.atestado || itensAteste[i.id]?.selecionado).length
                  return <Badge className={totalAtestados === itens.length ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}>{totalAtestados}/{itens.length} atestados</Badge>
                })()}
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-10 text-center">
                        {(() => {
                          const itens = ((modalAteste as any)?.itens || []) as any[]
                          const naoAtestados = itens.filter((i: any) => !i.atestado)
                          const todosSelecionados = naoAtestados.length > 0 && naoAtestados.every((i: any) => itensAteste[i.id]?.selecionado)
                          if (naoAtestados.length === 0) return null
                          return (
                            <input
                              type="checkbox"
                              checked={todosSelecionados}
                              onChange={(e) => {
                                const checked = e.target.checked
                                setItensAteste(prev => {
                                  const novo = { ...prev }
                                  for (const item of naoAtestados) {
                                    novo[item.id] = { ...novo[item.id], selecionado: checked }
                                  }
                                  return novo
                                })
                              }}
                              className="w-4 h-4"
                              title={todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
                            />
                          )
                        })()}
                      </TableHead>
                      <TableHead className="text-xs font-bold">Etapa</TableHead>
                      <TableHead className="text-xs font-bold text-center w-16">% Med.</TableHead>
                      <TableHead className="text-xs font-bold text-right w-24">Valor</TableHead>
                      <TableHead className="text-xs font-bold w-10">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {((modalAteste as any)?.itens || []).map((item: any, idx: number) => {
                      const jaAtestado = !!item.atestado
                      const selecionado = itensAteste[item.id]?.selecionado || false
                      const podeEditarAteste = ['SUBMETIDA', 'PARCIALMENTE_ATESTADA'].includes((modalAteste as any)?.status || '')
                      return (
                        <TableRow key={item.id || idx} className={jaAtestado ? 'bg-green-50/50' : selecionado ? 'bg-yellow-50/50' : ''}>
                          <TableCell className="text-center">
                            <input
                              type="checkbox"
                              checked={selecionado}
                              disabled={jaAtestado && !podeEditarAteste}
                              onChange={e => setItensAteste(prev => ({
                                ...prev,
                                [item.id]: { ...prev[item.id], selecionado: e.target.checked },
                              }))}
                              className="w-4 h-4"
                            />
                          </TableCell>
                          <TableCell>
                            <p className="text-sm font-medium">{item.etapa_numero}. {item.etapa_descricao || `Etapa ${idx + 1}`}</p>
                            {jaAtestado && (
                              <p className="text-xs text-green-600 mt-0.5">Atestado por {item.ateste_fiscal_nome} em {formatarData(item.ateste_data)}</p>
                            )}
                            {!jaAtestado && selecionado && (
                              <Input
                                placeholder="Observação sobre este item (opcional)"
                                className="mt-1 h-7 text-xs"
                                value={itensAteste[item.id]?.observacoes || ''}
                                onChange={e => setItensAteste(prev => ({
                                  ...prev,
                                  [item.id]: { ...prev[item.id], observacoes: e.target.value },
                                }))}
                              />
                            )}
                            {jaAtestado && item.ateste_observacoes && (
                              <p className="text-xs text-gray-500 mt-0.5 italic">"{item.ateste_observacoes}"</p>
                            )}
                          </TableCell>
                          <TableCell className="text-center text-sm">{Number(item.percentual_executado_atual || 0).toFixed(1)}%</TableCell>
                          <TableCell className="text-right text-sm">{formatarMoeda(item.valor_medido)}</TableCell>
                          <TableCell className="text-center">
                            {jaAtestado ? (
                              <CheckCircle className="w-4 h-4 text-green-600 mx-auto" />
                            ) : selecionado ? (
                              <ClipboardCheck className="w-4 h-4 text-yellow-600 mx-auto" />
                            ) : (
                              <Clock className="w-4 h-4 text-gray-300 mx-auto" />
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <input
                type="checkbox"
                id="verificado_in_loco"
                checked={formAteste.verificado_in_loco}
                onChange={e => setFormAteste({ ...formAteste, verificado_in_loco: e.target.checked })}
                className="w-4 h-4"
              />
              <label htmlFor="verificado_in_loco" className="flex items-center gap-2 text-sm cursor-pointer">
                <Shield className="w-4 h-4 text-green-600" />
                Confirmo que realizei verificação presencial (in loco)
              </label>
            </div>
            {/* Anexos do Fornecedor (fotos e documentos) */}
            <div className="border-t pt-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold flex items-center gap-1">
                Evidências do Fornecedor {anexosMedicao.length > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">{anexosMedicao.length}</Badge>}
              </p>
              {loadingAnexos && <p className="text-xs text-gray-400">Carregando anexos...</p>}
              {!loadingAnexos && anexosMedicao.length === 0 && (
                <p className="text-xs text-gray-400 italic">Nenhuma evidência enviada pelo fornecedor.</p>
              )}
              {anexosMedicao.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {anexosMedicao.map((anexo: any) => (
                    <div key={anexo.id} className="relative group border rounded-lg overflow-hidden bg-gray-50">
                      <div className="cursor-pointer" onClick={() => window.open(`${API_URL}${anexo.url}`, '_blank')}>
                        {anexo.tipo === 'FOTO' ? (
                          <div className="aspect-square bg-gray-100 flex items-center justify-center">
                            <img
                              src={`${API_URL}${anexo.url}`}
                              alt={anexo.descricao || anexo.nome_original}
                              className="w-full h-full object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        ) : (
                          <div className="aspect-square bg-blue-50 flex flex-col items-center justify-center">
                            <svg className="w-8 h-8 text-blue-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                            <p className="text-xs text-blue-600 text-center px-1 truncate w-full">{anexo.nome_original}</p>
                          </div>
                        )}
                      </div>
                      <div className="p-1.5">
                        {anexo.descricao && <p className="text-xs font-medium text-gray-700 truncate">{anexo.descricao}</p>}
                        <p className="text-xs text-gray-500 truncate">{anexo.nome_original}</p>
                      </div>
                      {/* Botão excluir (órgão) */}
                      <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleExcluirAnexoOrgao(anexo.id, anexo.descricao || anexo.nome_original) }}
                          className="bg-white/90 rounded p-1 shadow hover:bg-red-50"
                          title="Excluir anexo"
                        >
                          <Trash2 className="w-3 h-3 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Observações gerais do Ateste</Label>
              <Textarea
                placeholder="Observações sobre a verificação técnica..."
                value={formAteste.observacoes}
                onChange={e => setFormAteste({ ...formAteste, observacoes: e.target.value })}
                rows={2}
              />
            </div>
            {(() => {
              const itens = ((modalAteste as any)?.itens || []) as any[]
              const novosAtestados = itens.filter((i: any) => !i.atestado && itensAteste[i.id]?.selecionado).length
              const jaAtestados = itens.filter((i: any) => i.atestado).length
              const todosSerao = jaAtestados + novosAtestados === itens.length && itens.length > 0
              return (
                <>
                  {!todosSerao && novosAtestados > 0 && (
                    <div className="space-y-2 p-3 border border-amber-200 rounded-lg bg-amber-50/50">
                      <Label className="text-amber-800">Motivo da devolução (itens não atestados) *</Label>
                      <Textarea
                        placeholder="Informe o motivo para devolver ao fornecedor (obrigatório no ateste parcial)..."
                        value={formAteste.motivo_devolucao_parcial}
                        onChange={e => setFormAteste({ ...formAteste, motivo_devolucao_parcial: e.target.value })}
                        rows={2}
                        className="border-amber-200"
                      />
                      <p className="text-xs text-amber-700">A medição será devolvida ao fornecedor em um único passo.</p>
                    </div>
                  )}
                  <p className="text-xs text-gray-500">
                    {novosAtestados === 0 && !itens.some((i: any) => i.atestado && !itensAteste[i.id]?.selecionado)
                      ? 'Selecione os itens que deseja atestar.'
                      : todosSerao
                        ? `Ao atestar ${novosAtestados} item(ns), todos os itens estarão atestados e a medição será encaminhada para aprovação.`
                        : itens.some((i: any) => i.atestado && !itensAteste[i.id]?.selecionado) && novosAtestados === 0
                          ? 'Desmarque os itens para cancelar o ateste. Clique em "Cancelar Atestes" para confirmar.'
                          : `${novosAtestados} item(ns) selecionado(s). Informe o motivo e a medição será devolvida ao fornecedor em um clique.`
                    }
                  </p>
                </>
              )
            })()}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAteste(null)}>Cancelar</Button>
            {(() => {
              const itens = ((modalAteste as any)?.itens || []) as any[]
              const temSelecionados = itens.some((i: any) => !i.atestado && itensAteste[i.id]?.selecionado)
              const temCancelados = itens.some((i: any) => i.atestado && !itensAteste[i.id]?.selecionado)
              const temAcao = temSelecionados || temCancelados
              const novosAtestados = itens.filter((i: any) => !i.atestado && itensAteste[i.id]?.selecionado).length
              const jaAtestadosMantidos = itens.filter((i: any) => i.atestado && itensAteste[i.id]?.selecionado).length
              const todosSerao = jaAtestadosMantidos + novosAtestados === itens.length && itens.length > 0
              const itensNaoSelecionados = itens.filter((i: any) => !itensAteste[i.id]?.selecionado && !i.atestado).length
              const motivoObrigatorio = !todosSerao && temSelecionados && itensNaoSelecionados > 0 && !formAteste.motivo_devolucao_parcial?.trim()
              return (
                <Button
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  onClick={atestarMedicao}
                  disabled={actionLoading || !temAcao || motivoObrigatorio}
                >
                  {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <ClipboardCheck className="w-4 h-4 mr-2" />
                  {temCancelados && !temSelecionados ? 'Cancelar Atestes' : todosSerao ? 'Atestar Selecionados' : 'Atestar e Devolver'}
                </Button>
              )
            })()}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Devolver ao Fornecedor */}
      <Dialog open={!!modalDevolver} onOpenChange={() => setModalDevolver(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              Devolver {modalDevolver?.numero_medicao}ª Medição
            </DialogTitle>
            <DialogDescription>A medição será devolvida ao fornecedor para correção.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da Devolução *</Label>
            <Textarea
              placeholder="Descreva o que precisa ser corrigido..."
              value={motivoDevolucao}
              onChange={e => setMotivoDevolucao(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDevolver(null)}>Cancelar</Button>
            <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={devolverMedicao} disabled={actionLoading || !motivoDevolucao.trim()}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Devolver ao Fornecedor
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Assinatura Digital OTP — Fiscal (Enviar para Ateste) */}
      <Dialog open={modalOtp} onOpenChange={(open) => { if (!open) { setModalOtp(false); setOtpMedicaoId(null); carregarDados(); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-blue-600" />
              Assinatura Digital do Boletim
            </DialogTitle>
            <DialogDescription>
              {otpEtapa === 'telefone' && 'Informe seu WhatsApp para receber o código de verificação.'}
              {otpEtapa === 'codigo' && 'Digite o código de verificação enviado.'}
              {otpEtapa === 'sucesso' && 'Boletim assinado e enviado para aprovação!'}
            </DialogDescription>
          </DialogHeader>

          {otpEtapa === 'telefone' && (
            <div className="space-y-4">
              <div>
                <Label>WhatsApp (com DDD)</Label>
                <Input
                  value={otpTelefone}
                  onChange={e => setOtpTelefone(e.target.value.replace(/\D/g, '').replace(/^(\d{2})(\d)/g, '($1) $2').replace(/(\d)(\d{4})$/, '$1-$2'))}
                  placeholder="(11) 99999-9999"
                  className="mt-1"
                />
              </div>
              {otpErro && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{otpErro}</p>}
            </div>
          )}

          {otpEtapa === 'codigo' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
                <p className="font-medium mb-1">Código enviado!</p>
                {otpCanais?.telefone_mascarado && <p>📱 {otpCanais.telefone_mascarado}</p>}
              </div>
              <div>
                <Label>Código (6 dígitos)</Label>
                <Input
                  value={otpCodigo}
                  onChange={e => setOtpCodigo(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="text-center text-2xl tracking-[0.5em] font-mono mt-1"
                  maxLength={6}
                  onKeyDown={e => { if (e.key === 'Enter' && otpCodigo.length === 6) handleValidarOtpFiscal(); }}
                />
              </div>
              {otpErro && <p className="text-sm text-red-600 bg-red-50 p-2 rounded">{otpErro}</p>}
            </div>
          )}

          {otpEtapa === 'sucesso' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <CheckCircle className="w-10 h-10 text-green-600 mx-auto mb-2" />
                <p className="font-semibold text-green-900">Boletim assinado digitalmente!</p>
                <p className="text-sm text-green-700 mt-1">A medição foi enviada para aprovação do gestor.</p>
                {otpCodigoValidacao && (
                  <div className="mt-2 bg-white border border-green-300 rounded p-2">
                    <p className="text-xs text-gray-500">Código de validação:</p>
                    <p className="font-mono text-sm font-bold text-green-800">{otpCodigoValidacao}</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 text-center">O PDF do boletim foi baixado automaticamente.</p>
            </div>
          )}

          <DialogFooter>
            {otpEtapa === 'telefone' && (
              <div className="flex w-full gap-2 justify-between">
                <Button variant="outline" onClick={() => { setModalOtp(false); carregarDados(); }}>Cancelar</Button>
                <Button onClick={handleEnviarOtpFiscal} disabled={otpLoading || !otpTelefone.replace(/\D/g, '').match(/^\d{10,11}$/)} className="bg-blue-600 hover:bg-blue-700 gap-2">
                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  Enviar Código
                </Button>
              </div>
            )}
            {otpEtapa === 'codigo' && (
              <div className="flex w-full gap-2 justify-between">
                <Button variant="outline" onClick={() => { setModalOtp(false); carregarDados(); }}>Cancelar</Button>
                <Button onClick={handleValidarOtpFiscal} disabled={otpLoading || otpCodigo.length !== 6} className="bg-blue-600 hover:bg-blue-700 gap-2">
                  {otpLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                  Confirmar e Enviar
                </Button>
              </div>
            )}
            {otpEtapa === 'sucesso' && (
              <Button onClick={() => { setModalOtp(false); carregarDados(); }} className="w-full bg-green-600 hover:bg-green-700">
                Fechar
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Detalhe da Medição */}
      <Dialog open={!!modalDetalhe} onOpenChange={() => setModalDetalhe(null)}>
        <DialogContent className="w-[95vw] max-w-6xl max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{modalDetalhe?.numero_medicao}ª Medição — Detalhes</DialogTitle>
          </DialogHeader>
          {modalDetalhe && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><p className="text-xs text-gray-500">Período</p><p className="font-medium">{formatarData(modalDetalhe.periodo_inicio)} a {formatarData(modalDetalhe.periodo_fim)}</p></div>
                <div><p className="text-xs text-gray-500">Status</p><Badge className={STATUS_MEDICAO[modalDetalhe.status]?.cor}>{STATUS_MEDICAO[modalDetalhe.status]?.label}</Badge></div>
                <div><p className="text-xs text-gray-500">Valor Medido</p><p className="font-medium text-blue-700">{formatarMoeda(modalDetalhe.valor_medido)}</p></div>
                <div><p className="text-xs text-gray-500">% Físico</p><p className="font-medium">{Number(modalDetalhe.percentual_fisico_medido).toFixed(1)}%</p></div>
                <div><p className="text-xs text-gray-500">Acumulado</p><p className="font-medium">{formatarMoeda(modalDetalhe.valor_acumulado_atual)}</p></div>
                <div><p className="text-xs text-gray-500">% Acumulado</p><p className="font-medium">{Number(modalDetalhe.percentual_fisico_acumulado).toFixed(1)}%</p></div>
              </div>

              {/* Itens da Medição (Cronograma) */}
              {(modalDetalhe as any).itens && (modalDetalhe as any).itens.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold">Itens do Cronograma</p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="text-xs font-bold w-12">Item</TableHead>
                          <TableHead className="text-xs font-bold">Descrição</TableHead>
                          <TableHead className="text-xs font-bold text-right w-24">Valor Prev.</TableHead>
                          <TableHead className="text-xs font-bold text-center w-20">% Anterior</TableHead>
                          <TableHead className="text-xs font-bold text-center w-20 bg-blue-50">% Medido</TableHead>
                          <TableHead className="text-xs font-bold text-center w-20">% Acum.</TableHead>
                          <TableHead className="text-xs font-bold text-right w-28 bg-blue-50">Valor Medido</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(modalDetalhe as any).itens.map((item: any, idx: number) => (
                          <TableRow key={item.id || idx}>
                            <TableCell className="text-sm font-mono">{item.etapa_numero || idx + 1}</TableCell>
                            <TableCell className="text-sm">{item.etapa_descricao || `Etapa ${idx + 1}`}</TableCell>
                            <TableCell className="text-sm text-right">{formatarMoeda(item.etapa_valor_previsto)}</TableCell>
                            <TableCell className="text-sm text-center text-gray-500">{Number(item.percentual_executado_anterior || 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-sm text-center font-medium text-blue-700 bg-blue-50/50">{Number(item.percentual_executado_atual || 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-sm text-center font-medium">{Number(item.percentual_executado_acumulado || 0).toFixed(1)}%</TableCell>
                            <TableCell className="text-sm text-right font-medium text-blue-700 bg-blue-50/50">{formatarMoeda(item.valor_medido)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {modalDetalhe.fornecedor_nome && (
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Fornecedor</p>
                  <p className="text-sm font-medium">{modalDetalhe.fornecedor_nome}</p>
                  {modalDetalhe.fornecedor_observacoes && <p className="text-sm text-gray-600 mt-1">{modalDetalhe.fornecedor_observacoes}</p>}
                  {modalDetalhe.data_submissao && <p className="text-xs text-gray-400 mt-1">Submetida em {formatarData(modalDetalhe.data_submissao)}</p>}
                </div>
              )}

              {modalDetalhe.nota_fiscal_numero && (
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Nota Fiscal</p>
                  <p className="text-sm">NF {modalDetalhe.nota_fiscal_numero} — {formatarMoeda(modalDetalhe.nota_fiscal_valor || 0)} — {formatarData(modalDetalhe.nota_fiscal_data || '')}</p>
                </div>
              )}

              {/* Discriminação das Despesas */}
              {discriminacoesDetalhe.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold">Discriminacao das Despesas</p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-amber-50">
                          <TableHead className="text-xs font-bold w-12">Item</TableHead>
                          <TableHead className="text-xs font-bold">Discriminacao</TableHead>
                          <TableHead className="text-xs font-bold text-right w-28">Valor R$</TableHead>
                          <TableHead className="text-xs font-bold text-right w-20">%</TableHead>
                          <TableHead className="text-xs font-bold w-10"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {discriminacoesDetalhe.map((d: any, idx: number) => (
                          <TableRow key={d.id || idx}>
                            <TableCell className="text-sm font-mono">{d.numero_item || idx + 1}</TableCell>
                            <TableCell className="text-sm">
                              {editandoDiscriminacao === d.id ? (
                                <Input
                                  defaultValue={d.descricao}
                                  className="h-7 text-sm"
                                  onBlur={(e) => {
                                    const novoValor = e.target.value
                                    if (novoValor !== d.descricao) {
                                      handleCorrigirDiscriminacao(d.id, { descricao: novoValor })
                                    }
                                  }}
                                />
                              ) : (
                                <>
                                  {d.descricao}
                                  {d.corrigido_por_nome && (
                                    <span className="ml-1 text-xs text-amber-600" title={`Corrigido por ${d.corrigido_por_nome}: ${d.motivo_correcao || ''}`}>
                                      (corrigido)
                                    </span>
                                  )}
                                </>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-right font-medium">{formatarMoeda(d.valor)}</TableCell>
                            <TableCell className="text-sm text-right">{Number(d.percentual || 0).toFixed(2)}%</TableCell>
                            <TableCell>
                              <button
                                onClick={() => {
                                  if (editandoDiscriminacao === d.id) {
                                    setEditandoDiscriminacao(null)
                                    setMotivoCorrecao('')
                                  } else {
                                    setEditandoDiscriminacao(d.id)
                                  }
                                }}
                                className="p-1 hover:bg-gray-100 rounded"
                                title="Corrigir"
                              >
                                <Pencil className="w-3 h-3 text-gray-400" />
                              </button>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-gray-50 font-bold">
                          <TableCell></TableCell>
                          <TableCell className="text-sm font-bold">Total</TableCell>
                          <TableCell className="text-sm text-right font-bold">{formatarMoeda(discriminacoesDetalhe.reduce((s: number, d: any) => s + Number(d.valor || 0), 0))}</TableCell>
                          <TableCell className="text-sm text-right font-bold">{discriminacoesDetalhe.reduce((s: number, d: any) => s + Number(d.percentual || 0), 0).toFixed(2)}%</TableCell>
                          <TableCell></TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  {editandoDiscriminacao && (
                    <div className="mt-2 flex gap-2 items-center">
                      <Input
                        placeholder="Motivo da correção (obrigatório)"
                        value={motivoCorrecao}
                        onChange={(e) => setMotivoCorrecao(e.target.value)}
                        className="h-8 text-sm flex-1"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Execução Fiscal/Financeira */}
              {execucaoFinanceira && execucaoFinanceira.itens && execucaoFinanceira.itens.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold">Execucao Fiscal/Financeira</p>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-indigo-50">
                          <TableHead className="text-xs font-bold w-12">Item</TableHead>
                          <TableHead className="text-xs font-bold">Descricao</TableHead>
                          <TableHead className="text-xs font-bold text-right w-24">Previsto</TableHead>
                          <TableHead className="text-xs font-bold text-right w-24 bg-blue-50">No Periodo</TableHead>
                          <TableHead className="text-xs font-bold text-right w-24">Ate Periodo</TableHead>
                          <TableHead className="text-xs font-bold text-right w-24 bg-green-50">A Executar</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {execucaoFinanceira.itens.map((item: any, idx: number) => (
                          <TableRow key={item.etapa_id || idx}>
                            <TableCell className="text-sm font-mono">{item.numero_etapa}</TableCell>
                            <TableCell className="text-sm">{item.descricao}</TableCell>
                            <TableCell className="text-sm text-right">{formatarMoeda(item.valor_previsto)}</TableCell>
                            <TableCell className="text-sm text-right font-medium text-blue-700 bg-blue-50/50">{formatarMoeda(item.no_periodo)}</TableCell>
                            <TableCell className="text-sm text-right">{formatarMoeda(item.ate_periodo)}</TableCell>
                            <TableCell className="text-sm text-right font-medium text-green-700 bg-green-50/50">{formatarMoeda(item.a_executar)}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-gray-50 font-bold">
                          <TableCell></TableCell>
                          <TableCell className="text-sm font-bold">Total</TableCell>
                          <TableCell className="text-sm text-right font-bold">{formatarMoeda(execucaoFinanceira.totais?.valor_previsto || 0)}</TableCell>
                          <TableCell className="text-sm text-right font-bold text-blue-700">{formatarMoeda(execucaoFinanceira.totais?.no_periodo || 0)}</TableCell>
                          <TableCell className="text-sm text-right font-bold">{formatarMoeda(execucaoFinanceira.totais?.ate_periodo || 0)}</TableCell>
                          <TableCell className="text-sm text-right font-bold text-green-700">{formatarMoeda(execucaoFinanceira.totais?.a_executar || 0)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                  {execucaoFinanceira.execucao_fiscal && (
                    <div className="mt-2 p-2 bg-indigo-50/50 rounded text-xs text-gray-600">
                      <span className="font-medium">Execucao Temporal:</span>{' '}
                      {execucaoFinanceira.execucao_fiscal.meses_executados} meses e {execucaoFinanceira.execucao_fiscal.dias_executados_extra} dias executados
                      {' | '}{execucaoFinanceira.execucao_fiscal.meses_restantes} meses e {execucaoFinanceira.execucao_fiscal.dias_restantes_extra} dias restantes
                    </div>
                  )}
                </div>
              )}

              {modalDetalhe.ateste_fiscal_nome && (
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xs text-gray-500 mb-1">Ateste do Fiscal</p>
                  <p className="text-sm">Atestado por <strong>{modalDetalhe.ateste_fiscal_nome}</strong> em {formatarData(modalDetalhe.ateste_data || '')}</p>
                  {modalDetalhe.ateste_verificado_in_loco && <Badge className="bg-green-100 text-green-700 mt-1">Verificado in loco</Badge>}
                  {modalDetalhe.ateste_observacoes && <p className="text-sm text-gray-600 mt-1">{modalDetalhe.ateste_observacoes}</p>}
                </div>
              )}

              {modalDetalhe.aprovador_nome && (
                <div className={`p-3 rounded-lg ${modalDetalhe.status === 'APROVADA' ? 'bg-green-50' : 'bg-red-50'}`}>
                  <p className="text-xs text-gray-500 mb-1">{modalDetalhe.status === 'APROVADA' ? 'Aprovação' : 'Rejeição'}</p>
                  <p className="text-sm">{modalDetalhe.status === 'APROVADA' ? 'Aprovado' : 'Rejeitado'} por <strong>{modalDetalhe.aprovador_nome}</strong> em {formatarData(modalDetalhe.data_aprovacao || '')}</p>
                  {modalDetalhe.observacao_aprovador && <p className="text-sm text-gray-600 mt-1">{modalDetalhe.observacao_aprovador}</p>}
                </div>
              )}

              {modalDetalhe.status === 'DEVOLVIDA' && modalDetalhe.motivo_devolucao && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs text-amber-600 mb-1">Motivo da Devolução</p>
                  <p className="text-sm text-amber-700">{modalDetalhe.motivo_devolucao}</p>
                </div>
              )}

              {/* Anexos (Fotos e Documentos) do Fornecedor */}
              <div className="border-t pt-3">
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-bold flex items-center gap-1">
                  📎 Evidências e Documentos {anexosMedicao.length > 0 && <Badge variant="outline" className="text-xs px-1.5 py-0">{anexosMedicao.length}</Badge>}
                </p>
                {loadingAnexos && <p className="text-xs text-gray-400">Carregando anexos...</p>}
                {!loadingAnexos && anexosMedicao.length === 0 && (
                  <p className="text-xs text-gray-400 italic">Nenhuma evidência enviada pelo fornecedor.</p>
                )}
                {anexosMedicao.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {anexosMedicao.map((anexo: any) => (
                      <div key={anexo.id} className="relative group border rounded-lg overflow-hidden bg-gray-50">
                        <div className="cursor-pointer" onClick={() => window.open(`${API_URL}${anexo.url}`, '_blank')}>
                          {anexo.tipo === 'FOTO' ? (
                            <div className="aspect-square bg-gray-100 flex items-center justify-center">
                              <img
                                src={`${API_URL}${anexo.url}`}
                                alt={anexo.descricao || anexo.nome_original}
                                className="w-full h-full object-cover"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            </div>
                          ) : (
                            <div className="aspect-square bg-blue-50 flex flex-col items-center justify-center">
                              <svg className="w-8 h-8 text-blue-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                              <p className="text-xs text-blue-600 text-center px-1 truncate w-full">{anexo.nome_original}</p>
                            </div>
                          )}
                        </div>
                        <div className="p-1.5">
                          {anexo.descricao && <p className="text-xs font-medium text-gray-700 truncate">{anexo.descricao}</p>}
                          <p className="text-xs text-gray-500 truncate">{anexo.nome_original}</p>
                          <p className="text-xs text-gray-400">{(anexo.tamanho_bytes / 1024).toFixed(0)} KB</p>
                        </div>
                        {/* Botão excluir (órgão) */}
                        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleExcluirAnexoOrgao(anexo.id, anexo.descricao || anexo.nome_original) }}
                            className="bg-white/90 rounded p-1 shadow hover:bg-red-50"
                            title="Excluir anexo"
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
