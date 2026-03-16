'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  ClipboardCheck, FileDown, Search, Loader2, CheckCircle, Clock,
  AlertTriangle, Shield, ChevronLeft, ChevronRight, X, Download, Plus,
  TrendingUp, FileText, Eye, Paperclip, PenLine, Archive, CheckSquare, Square, XCircle,
  RotateCcw, Trash2, Send, Mail, MessageCircle, Bell,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { gerarPdfMedicao } from '@/lib/pdf-medicao'
import dynamic from 'next/dynamic'

const TabMedicao = dynamic(() => import('@/components/contratos/TabMedicao'), {
  loading: () => (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
    </div>
  ),
  ssr: false,
})

// ============ INTERFACES ============

interface MedicaoPendente {
  id: string
  contrato_id: string
  numero_medicao: number
  status: string
  periodo_inicio: string
  periodo_fim: string
  valor_medido: number
  percentual_fisico_medido: number
  data_submissao: string
  data_solicitacao?: string | null
  fornecedor_nome: string
  nota_fiscal_numero?: string
  numero_contrato: string
  objeto_contrato: string
  fiscal_nome: string
  total_itens: number
  itens_atestados: number
  dias: number
  cnpj: string
  tipo: string
}

interface MedicaoAprovacao {
  id: string
  contrato_id: string
  numero_medicao: number
  status: string
  periodo_inicio: string
  periodo_fim: string
  valor_medido: number
  percentual_fisico_medido: number
  ateste_fiscal_nome: string
  ateste_data: string
  fornecedor_nome: string
  numero_contrato: string
  objeto_contrato: string
}

interface ContratoResumo {
  id: string
  numero_contrato: string
  objeto: string
  fornecedor_nome: string
  fornecedor_cnpj: string
  fornecedor_telefone?: string | null
  valor_global: number
  fiscal_nome: string
  status: string
  modalidade_execucao?: string
  total_medicoes: number
  submetidas: number
  parcialmente_atestadas: number
  aguardando_aprovacao: number
  aprovadas: number
  pendentes_ateste: number
  enviou_mes?: boolean
  solicitou_mes?: boolean
  medicao_id?: string | null
  numero_medicao?: number | null
  valor_medicoes_mes?: number
}

type StatusFiltro = 'todos' | 'aguardando' | 'em_analise' | 'aprovadas'
type TipoFiltro = 'todos' | 'servicos' | 'fornecimento' | 'obras'

// ============ HELPERS ============

function formatarMoeda(v: number | string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(d: string | null | undefined) {
  if (!d) return '-'
  const dateOnly = d.split('T')[0]
  const parts = dateOnly.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return new Date(d).toLocaleDateString('pt-BR')
}

function mesAtualYYYYMM(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function navegarMes(ym: string, direcao: 1 | -1): string {
  const [y, m] = ym.split('-').map(Number)
  let ano = y || new Date().getFullYear()
  let mes = m || new Date().getMonth() + 1
  mes += direcao
  if (mes > 12) { mes = 1; ano++ }
  if (mes < 1) { mes = 12; ano-- }
  return `${ano}-${String(mes).padStart(2, '0')}`
}

function formatarMesNomeCompleto(ym: string): string {
  const [y, m] = ym.split('-')
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const idx = parseInt(m || '1', 10) - 1
  return `${idx >= 0 && idx < 12 ? meses[idx] : m} ${y}`
}

function formatarCompetencia(periodoInicio: string): string {
  if (!periodoInicio) return '-'
  const dateStr = periodoInicio.split('T')[0]
  const [y, m] = dateStr.split('-')
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const idx = parseInt(m || '1', 10) - 1
  return `${idx >= 0 && idx < 12 ? meses[idx] : m}/${y}`
}

function calcularDiasEmAberto(dataSubmissao: string): number {
  if (!dataSubmissao) return 0
  const submissao = new Date(dataSubmissao)
  const hoje = new Date()
  const diff = hoje.getTime() - submissao.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function getSubmissaoMesAno(dataSubmissao: string): string {
  if (!dataSubmissao) return ''
  const d = new Date(dataSubmissao)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function mapModalidadeParaTipo(modalidade?: string): string {
  switch (modalidade) {
    case 'MEDICAO': return 'Obras'
    case 'CONTINUADO': return 'Serviços'
    case 'ORDEM_SERVICO': return 'Serviços'
    case 'ITEM_QUANTIDADE': return 'Fornecimento'
    case 'LICENCA': return 'Fornecimento'
    default: return 'Serviços'
  }
}

function tipoParaFiltro(tipo: string): TipoFiltro {
  if (tipo === 'Obras') return 'obras'
  if (tipo === 'Fornecimento') return 'fornecimento'
  return 'servicos'
}

function formatarNumeroMedicao(med: MedicaoPendente): string {
  const ano = med.data_submissao
    ? new Date(med.data_submissao).getFullYear()
    : new Date().getFullYear()
  return `MED-${ano}-${String(med.numero_medicao).padStart(4, '0')}`
}

// ============ BADGE DIAS EM ABERTO ============

function DiasBadge({ dias }: { dias: number }) {
  if (dias === 0) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
        Hoje
      </span>
    )
  }
  if (dias <= 5) {
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">
        {dias} dia{dias > 1 ? 's' : ''}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
      {dias} dias
    </span>
  )
}

// ============ STATUS BADGE ============

function StatusBadge({ status, dias }: { status: string; dias: number }) {
  if (status === 'PARCIALMENTE_ATESTADA') {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
        Em Análise
      </span>
    )
  }
  if (dias > 5) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Atrasada
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Aguardando
    </span>
  )
}

const ITENS_POR_PAGINA = 10

// ============ COMPONENTE PRINCIPAL ============

export default function MedicoesV2Page() {
  const [pendentesAteste, setPendentesAteste] = useState<MedicaoPendente[]>([])
  const [pendentesAprovacao, setPendentesAprovacao] = useState<MedicaoAprovacao[]>([])
  const [contratos, setContratos] = useState<ContratoResumo[]>([])
  const [contratoMap, setContratoMap] = useState<Map<string, ContratoResumo>>(new Map())
  const [loading, setLoading] = useState(true)

  // Filtros
  const [busca, setBusca] = useState('')
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todos')
  const [periodo, setPeriodo] = useState(mesAtualYYYYMM)
  const [tipoFiltro, setTipoFiltro] = useState<TipoFiltro>('todos')

  // Paginação
  const [pagina, setPagina] = useState(1)

  // Modal ateste direto
  const [modalAteste, setModalAteste] = useState<any>(null)
  const [loadingAteste, setLoadingAteste] = useState(false)
  const [formAteste, setFormAteste] = useState({ observacoes: '', verificado_in_loco: false, motivo_devolucao_parcial: '' })
  const [itensAteste, setItensAteste] = useState<Record<string, { selecionado: boolean; observacoes: string }>>({})
  const [actionLoading, setActionLoading] = useState(false)
  // Anexos do modal de ateste
  const [anexosAteste, setAnexosAteste] = useState<any[]>([])
  const [loadingAnexos, setLoadingAnexos] = useState(false)
  // Assinatura digital via link WhatsApp
  const [fiscaisDisponiveis, setFiscaisDisponiveis] = useState<any[]>([])
  const [fiscalSelecionado, setFiscalSelecionado] = useState('')
  const [etapaAssinatura, setEtapaAssinatura] = useState<'idle' | 'aguardando' | 'assinado' | 'recusado'>('idle')
  const [statusAssinatura, setStatusAssinatura] = useState<any>(null)
  const [loadingAssinatura, setLoadingAssinatura] = useState(false)
  const [whatsappFiscal, setWhatsappFiscal] = useState('')
  const [otpFiscal, setOtpFiscal] = useState('')
  const [codigoAssinatura, setCodigoAssinatura] = useState<string | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Devolver / Excluir
  const [modalDevolver, setModalDevolver] = useState<any>(null)
  const [motivoDevolucao, setMotivoDevolucao] = useState('')
  const [podeExcluirMedicao, setPodeExcluirMedicao] = useState(false)

  // Aba aprovadas
  const [aprovadas, setAprovadas] = useState<any[]>([])
  const [loadingAprovadas, setLoadingAprovadas] = useState(false)
  const [downloadingZip, setDownloadingZip] = useState<string | null>(null)

  // Modal TabMedicao
  const [contratoAberto, setContratoAberto] = useState<ContratoResumo | null>(null)

  // Lembrar Fornecedor (individual)
  const [historico, setHistorico] = useState<any[]>([])
  const [solicitarContrato, setSolicitarContrato] = useState<ContratoResumo | null>(null)
  const [mensagemSolicitar, setMensagemSolicitar] = useState('')
  const [loadingSolicitar, setLoadingSolicitar] = useState(false)
  const [erroSolicitar, setErroSolicitar] = useState<string | null>(null)
  const [enviarWhatsappIndividual, setEnviarWhatsappIndividual] = useState(false)
  const [telefoneWhatsappIndividual, setTelefoneWhatsappIndividual] = useState('')
  const [whatsappConfigurado, setWhatsappConfigurado] = useState(false)
  const [aguardandoFornecedorAberto, setAguardandoFornecedorAberto] = useState(true)

  // Solicitar em lote
  const [contratosSelecionados, setContratosSelecionados] = useState<Record<string, boolean>>({})
  const [mensagemLote, setMensagemLote] = useState('')
  const [loadingSolicitarLote, setLoadingSolicitarLote] = useState(false)
  const [enviarWhatsappLote, setEnviarWhatsappLote] = useState(false)
  const [telefonesLote, setTelefonesLote] = useState<Record<string, string>>({})
  const [solicitarLoteAberto, setSolicitarLoteAberto] = useState(false)

  // ============ FETCH ============

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const orgao = JSON.parse(localStorage.getItem('orgao') || '{}')
      const orgaoId = orgao.id
      if (!orgaoId) return

      const [resPendentes, resAprovacao, resContratos, resHistorico] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/pendentes-ateste?orgaoId=${orgaoId}`),
        authFetch(`${API_URL}/api/contratos/medicoes/pendentes-aprovacao?orgaoId=${orgaoId}`),
        authFetch(`${API_URL}/api/contratos/medicoes/resumo-fiscal?orgaoId=${orgaoId}&mes=${periodo}`),
        authFetch(`${API_URL}/api/contratos/medicoes/solicitacoes-enviadas?orgaoId=${orgaoId}`),
      ])

      if (resPendentes.ok) setPendentesAteste(await resPendentes.json())
      if (resAprovacao.ok) setPendentesAprovacao(await resAprovacao.json())
      if (resHistorico.ok) setHistorico(await resHistorico.json())
      if (resContratos.ok) {
        const data: ContratoResumo[] = await resContratos.json()
        setContratos(data)
        const map = new Map<string, ContratoResumo>()
        data.forEach(c => map.set(c.id, c))
        setContratoMap(map)
      }
    } catch (e) {
      console.error('Erro ao carregar dados:', e)
    }
    setLoading(false)
  }, [periodo])

  useEffect(() => { carregarDados() }, [carregarDados])

  useEffect(() => {
    const orgao = JSON.parse(localStorage.getItem('orgao') || '{}')
    const orgaoId = orgao.id
    if (!orgaoId) return
    authFetch(`${API_URL}/api/orgaos/${orgaoId}/whatsapp-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data) setWhatsappConfigurado(!!(data.whatsapp_instance_id || data.configurado)) })
      .catch(() => {})
  }, [])

  // Verificar permissão de excluir medição
  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem('usuario') || '{}')
      setPodeExcluirMedicao(u.pode_excluir_medicao === true)
    } catch { setPodeExcluirMedicao(false) }
  }, [])

  // Reset página ao mudar filtros
  useEffect(() => { setPagina(1) }, [busca, statusFiltro, tipoFiltro, periodo])

  // Carregar medições aprovadas quando aba "aprovadas" ou filtro "todos" for selecionado
  useEffect(() => {
    if (statusFiltro !== 'aprovadas' && statusFiltro !== 'todos') return
    if (aprovadas.length > 0) return // já carregado
    const orgao = JSON.parse(localStorage.getItem('orgao') || '{}')
    const orgaoId = orgao.id
    if (!orgaoId) return
    setLoadingAprovadas(true)
    authFetch(`${API_URL}/api/contratos/medicoes/aprovadas?orgaoId=${orgaoId}`)
      .then(r => r.ok ? r.json() : [])
      .then(setAprovadas)
      .finally(() => setLoadingAprovadas(false))
  }, [statusFiltro])

  // ============ APROVADAS — AÇÕES ============

  const baixarBoletim = async (medicao: any) => {
    const res = await authFetch(`${API_URL}/api/contratos/medicoes/${medicao.id}/boletim-oficial`)
    if (!res.ok) { alert('Boletim não disponível'); return }
    const { pdf_url, filename } = await res.json()
    const fileUrl = pdf_url.startsWith('http') ? pdf_url : `${API_URL}${pdf_url}`
    const fileRes = await fetch(fileUrl)
    const blob = await fileRes.blob()
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = filename || `boletim_${medicao.numero_medicao}.pdf`
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href) }, 1000)
  }

  const baixarZip = async (medicaoId: string, numero: number) => {
    setDownloadingZip(medicaoId)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}/download-zip`)
      if (!res.ok) { alert('Erro ao gerar ZIP'); return }
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `medicao_${numero}_documentos.zip`
      document.body.appendChild(a)
      a.click()
      setTimeout(() => { a.remove(); URL.revokeObjectURL(a.href) }, 1000)
    } finally {
      setDownloadingZip(null)
    }
  }

  const toggleContabilidade = async (medicaoId: string) => {
    const res = await authFetch(
      `${API_URL}/api/contratos/medicoes/${medicaoId}/marcar-enviado-contabilidade`,
      { method: 'PATCH' }
    )
    if (res.ok) {
      const data = await res.json()
      setAprovadas(prev => prev.map(m =>
        m.id === medicaoId
          ? { ...m, enviado_contabilidade: data.enviado_contabilidade, data_envio_contabilidade: data.data_envio_contabilidade }
          : m
      ))
    } else {
      alert('Sem permissão para esta ação')
    }
  }

  // ============ ATESTE ============

  const abrirModalAtesteDireto = async (medicao: MedicaoPendente) => {
    setLoadingAteste(true)
    setModalAteste(null)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${medicao.id}`)
      if (!res.ok) { alert('Erro ao carregar medição'); setLoadingAteste(false); return }
      const medicaoCompleta = await res.json()
      setFormAteste({ observacoes: '', verificado_in_loco: false, motivo_devolucao_parcial: '' })
      const itens = medicaoCompleta.itens || []
      const itensMap: Record<string, { selecionado: boolean; observacoes: string }> = {}
      for (const item of itens) {
        itensMap[item.id] = { selecionado: !!item.atestado, observacoes: item.ateste_observacoes || '' }
      }
      setItensAteste(itensMap)
      setEtapaAssinatura('idle')
      setFiscalSelecionado('')
      setStatusAssinatura(null)
      setFiscaisDisponiveis([])
      setAnexosAteste([])
      setModalAteste(medicaoCompleta)
      // Buscar anexos em paralelo
      setLoadingAnexos(true)
      authFetch(`${API_URL}/api/contratos/medicoes/${medicao.id}/anexos`)
        .then(r => r.ok ? r.json() : [])
        .then(data => setAnexosAteste(Array.isArray(data) ? data : []))
        .catch(() => {})
        .finally(() => setLoadingAnexos(false))
      // Buscar fiscais disponíveis
      const orgaoId = JSON.parse(localStorage.getItem('orgao') || '{}').id || ''
      if (orgaoId) {
        authFetch(`${API_URL}/api/contratos/medicoes/fiscais?orgaoId=${orgaoId}`)
          .then(r => r.ok ? r.json() : [])
          .then(data => setFiscaisDisponiveis(Array.isArray(data) ? data : []))
          .catch(() => {})
      }
      // Verificar se já existe um link de assinatura pendente/assinado
      authFetch(`${API_URL}/api/contratos/medicoes/${medicao.id}/status-assinatura-fiscal`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data && data.status && data.status !== 'sem_solicitacao') {
            setStatusAssinatura(data)
            if (data.status === 'pendente') setEtapaAssinatura('aguardando')
            else if (data.status === 'assinado') setEtapaAssinatura('assinado')
            else if (data.status === 'recusado') setEtapaAssinatura('recusado')
          }
        })
        .catch(() => {})
    } catch { alert('Erro ao carregar medição') }
    setLoadingAteste(false)
  }

  const executarAteste = async () => {
    if (!modalAteste) return
    const itens = (modalAteste.itens || []) as any[]
    const itensSelecionados = itens.filter((item: any) => itensAteste[item.id]?.selecionado && !item.atestado)
    const itensCancelarAteste = itens.filter((item: any) => item.atestado && !itensAteste[item.id]?.selecionado).map((i: any) => i.id)
    const jaAtestadosMantidos = itens.filter((i: any) => i.atestado && itensAteste[i.id]?.selecionado).length
    const todosSerao = jaAtestadosMantidos + itensSelecionados.length === itens.length && itens.length > 0
    const temAcao = itensSelecionados.length > 0 || itensCancelarAteste.length > 0
    if (!temAcao) { alert('Selecione itens para atestar ou desmarque itens para cancelar.'); return }
    if (!todosSerao && itensSelecionados.length > 0) {
      const itensNaoSelecionados = itens.filter((i: any) => !itensAteste[i.id]?.selecionado && !i.atestado).length
      if (itensNaoSelecionados > 0 && !formAteste.motivo_devolucao_parcial?.trim()) {
        alert('No ateste parcial, informe o motivo da devolução.'); return
      }
    }
    setActionLoading(true)
    try {
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}')
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${modalAteste.id}/atestar-itens`, {
        method: 'PATCH',
        body: JSON.stringify({
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
      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        alert(e.message || 'Erro ao atestar')
        setActionLoading(false)
        return
      }
      const resultado = await res.json().catch(() => ({}))
      setModalAteste(null)
      carregarDados()
      if (resultado.status === 'AGUARDANDO_APROVACAO') {
        alert('Medição atestada com sucesso! Enviada para aprovação do gestor.')
      } else if (resultado.status === 'DEVOLVIDA') {
        alert('Itens atestados e medição devolvida ao fornecedor!')
      } else if (resultado.status === 'SUBMETIDA') {
        alert('Ateste(s) cancelado(s) com sucesso!')
      } else if (resultado.status === 'PARCIALMENTE_ATESTADA') {
        alert('Alterações salvas com sucesso!')
      }
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  // ============ DEVOLVER / EXCLUIR ============

  const devolverMedicao = async () => {
    if (!modalDevolver) return
    if (!motivoDevolucao.trim()) { alert('Informe o motivo da devolução.'); return }
    setActionLoading(true)
    try {
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}')
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${modalDevolver.id}/devolver`, {
        method: 'PATCH',
        body: JSON.stringify({ fiscal_id: usuario.id || '', fiscal_nome: usuario.nome || 'Fiscal', motivo: motivoDevolucao }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro ao devolver medição') }
      else { setModalDevolver(null); setMotivoDevolucao(''); carregarDados(); alert('Medição devolvida ao fornecedor com sucesso!') }
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const excluirMedicaoById = async (medicaoId: string, numeroMedicao: number, statusAtual?: string) => {
    const msgExtra = statusAtual === 'APROVADA'
      ? '\n\n⚠️ ATENÇÃO: Esta medição já foi APROVADA. Ao excluí-la, os valores e percentuais das etapas serão revertidos.'
      : ''
    if (!confirm(`Excluir a ${numeroMedicao}ª Medição?${msgExtra}\n\nEsta ação não pode ser desfeita.`)) return
    try {
      const params = podeExcluirMedicao ? '?podeExcluirMedicao=true' : ''
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}${params}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro ao excluir medição') }
      else { carregarDados() }
    } catch (e) { console.error(e) }
  }

  // ============ LEMBRAR FORNECEDOR ============

  const enviarSolicitacao = async () => {
    if (!solicitarContrato) return
    setErroSolicitar(null)
    setLoadingSolicitar(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${solicitarContrato.id}/medicoes/solicitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mes_referencia: periodo,
          mensagem: mensagemSolicitar.trim() || undefined,
          enviar_whatsapp: enviarWhatsappIndividual || undefined,
          telefone_whatsapp: enviarWhatsappIndividual && telefoneWhatsappIndividual.trim() ? telefoneWhatsappIndividual.trim() : undefined,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Erro ${res.status}`)
      }
      setSolicitarContrato(null)
      setMensagemSolicitar('')
      setEnviarWhatsappIndividual(false)
      setTelefoneWhatsappIndividual('')
      carregarDados()
    } catch (e) {
      setErroSolicitar(e instanceof Error ? e.message : 'Erro ao enviar')
    }
    setLoadingSolicitar(false)
  }

  // ============ SOLICITAR EM LOTE ============

  const enviarSolicitacaoLote = async (apenasNaoEnviaram = false) => {
    setLoadingSolicitarLote(true)
    try {
      let ids: string[]
      if (apenasNaoEnviaram) {
        ids = contratos.filter(c => c.enviou_mes === false).map(c => c.id)
      } else {
        ids = Object.entries(contratosSelecionados).filter(([, v]) => v).map(([k]) => k)
      }
      if (ids.length === 0) { alert('Nenhum contrato selecionado.'); setLoadingSolicitarLote(false); return }

      const telefoneOverrides: Record<string, string> = {}
      if (enviarWhatsappLote) {
        ids.forEach(id => {
          const tel = telefonesLote[id]?.trim()
          if (tel) telefoneOverrides[id] = tel
        })
      }

      const res = await authFetch(`${API_URL}/api/contratos/medicoes/solicitar-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contrato_ids: ids,
          mes_referencia: periodo,
          mensagem: mensagemLote.trim() || undefined,
          enviar_whatsapp: enviarWhatsappLote || undefined,
          telefone_overrides: Object.keys(telefoneOverrides).length > 0 ? telefoneOverrides : undefined,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); setLoadingSolicitarLote(false); return }
      const resultado = await res.json()
      setMensagemLote('')
      setEnviarWhatsappLote(false)
      setTelefonesLote({})
      setContratosSelecionados({})
      alert(resultado.message || 'Solicitações enviadas!')
      carregarDados()
    } catch { alert('Erro ao enviar solicitações') }
    setLoadingSolicitarLote(false)
  }

  // ============ DADOS CALCULADOS ============

  const totalAprovadas = contratos.reduce((s, c) => s + (c.aprovadas || 0), 0)
  const valorAprovadas = contratos.reduce((s, c) => s + (Number(c.valor_medicoes_mes) || 0), 0)
  const contratosNaoEnviaram = contratos.filter(c => c.enviou_mes === false)
  const totalSelecionadosSolicitar = Object.values(contratosSelecionados).filter(Boolean).length

  const medicoesEnriquecidas = pendentesAteste.map(med => {
    const contrato = contratoMap.get(med.contrato_id)
    const dias = calcularDiasEmAberto(med.data_submissao)
    const tipo = mapModalidadeParaTipo(contrato?.modalidade_execucao)
    return { ...med, cnpj: contrato?.fornecedor_cnpj || '', tipo, dias }
  })

  const totalAtrasadas = medicoesEnriquecidas.filter(m => m.dias > 5).length

  // Aguardando Fornecedor: solicitados mas ainda não enviaram
  const contratosAguardandoFornecedor = contratos.filter(c => c.solicitou_mes && c.enviou_mes === false)

  // ============ FILTROS ============

  const aprovacaoEnriquecidas = pendentesAprovacao.map(med => {
    const contrato = contratoMap.get(med.contrato_id)
    const tipo = mapModalidadeParaTipo(contrato?.modalidade_execucao)
    return { ...med, cnpj: contrato?.fornecedor_cnpj || '', tipo, dias: 0, status: med.status }
  })

  const medicoesVisiveis = (() => {
    const filtrarBusca = (med: any) => {
      if (!busca) return true
      const t = busca.toLowerCase()
      return [med.numero_contrato, med.fornecedor_nome, med.objeto_contrato].some(v => v?.toLowerCase().includes(t))
    }
    const filtrarTipo = (med: any) => tipoFiltro === 'todos' || tipoParaFiltro(med.tipo) === tipoFiltro

    if (statusFiltro === 'em_analise') {
      return aprovacaoEnriquecidas.filter(med => {
        const mesAno = getSubmissaoMesAno(med.ateste_data || '')
        if (mesAno && mesAno !== periodo) return false
        return filtrarBusca(med) && filtrarTipo(med)
      })
    }

    if (statusFiltro === 'todos') {
      // Combina pendentes de ateste + em análise + aprovadas
      const ateste = medicoesEnriquecidas.filter(med => {
        const mesAno = getSubmissaoMesAno(med.data_submissao)
        if (mesAno && mesAno !== periodo) return false
        return filtrarBusca(med) && filtrarTipo(med)
      })
      const analise = aprovacaoEnriquecidas.filter(med => {
        const mesAno = getSubmissaoMesAno(med.ateste_data || '')
        if (mesAno && mesAno !== periodo) return false
        return filtrarBusca(med) && filtrarTipo(med)
      })
      const aprovadasPeriodo = aprovadas
        .map((m: any) => {
          const contrato = contratoMap.get(m.contrato_id) || m.contrato
          const tipo = mapModalidadeParaTipo(contrato?.modalidade_execucao)
          return {
            ...m,
            numero_contrato: m.contrato?.numero_contrato || m.numero_contrato || '',
            objeto_contrato: m.contrato?.objeto || m.objeto_contrato || '',
            cnpj: m.contrato?.fornecedor_cnpj || '',
            tipo,
            dias: 0,
            status: 'APROVADA',
            data_submissao: m.data_aprovacao || m.periodo_inicio,
          }
        })
        .filter((m: any) => {
          const mesAno = getSubmissaoMesAno(m.data_submissao)
          if (mesAno && mesAno !== periodo) return false
          return filtrarBusca(m) && filtrarTipo(m)
        })
      return [...ateste, ...analise, ...aprovadasPeriodo]
    }

    // Pendentes de ateste (aguardando / padrão)
    return medicoesEnriquecidas.filter(med => {
      const mesAno = getSubmissaoMesAno(med.data_submissao)
      if (mesAno && mesAno !== periodo) return false
      return filtrarBusca(med) && filtrarTipo(med)
    })
  })()

  const totalPaginas = Math.max(1, Math.ceil(medicoesVisiveis.length / ITENS_POR_PAGINA))
  const medicoesPaginadas = medicoesVisiveis.slice((pagina - 1) * ITENS_POR_PAGINA, pagina * ITENS_POR_PAGINA)

  const tituloTabela = statusFiltro === 'em_analise' ? 'Medições Em Análise'
    : statusFiltro === 'todos' ? 'Todas as Medições'
    : 'Medições Aguardando Análise'

  const limparFiltros = () => {
    setBusca('')
    setStatusFiltro('todos')
    setTipoFiltro('todos')
    setPeriodo(mesAtualYYYYMM())
  }

  const temFiltrosAtivos = busca !== '' || statusFiltro !== 'todos' || tipoFiltro !== 'todos'

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ============ HEADER ============ */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Medições Pendentes</h1>
          <nav className="flex items-center gap-1 text-sm text-gray-500 mt-1">
            <span>Início</span>
            <span className="mx-1 text-gray-300">/</span>
            <span>Medições</span>
            <span className="mx-1 text-gray-300">/</span>
            <span className="text-blue-600">Aguardando Análise</span>
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={carregarDados}>
            <Download className="w-4 h-4 mr-1.5" />
            Exportar
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => {
            const c = contratos[0]
            if (c) setContratoAberto(c)
          }}>
            <Plus className="w-4 h-4 mr-1.5" />
            Nova Medição
          </Button>
        </div>
      </div>

      {/* ============ STAT CARDS ============ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Pendentes */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-blue-500" />
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-500">Total Pendentes</p>
              <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <ClipboardCheck className="w-5 h-5 text-blue-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{pendentesAteste.length}</p>
            <p className="text-xs text-gray-500 mt-1">Aguardando análise</p>
          </div>
        </div>

        {/* Em Análise */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-orange-400" />
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-500">Em Análise</p>
              <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-orange-500" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{pendentesAprovacao.length}</p>
            <p className="text-xs text-gray-500 mt-1">Em andamento</p>
          </div>
        </div>

        {/* Atrasadas */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-red-500" />
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-500">Atrasadas</p>
              <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{totalAtrasadas}</p>
            <p className="text-xs text-gray-500 mt-1">Prazo vencido</p>
          </div>
        </div>

        {/* Aprovadas (mês) */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-green-500" />
          <div className="p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-medium text-gray-500">Aprovadas (mês)</p>
              <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
            </div>
            <p className="text-3xl font-bold text-gray-900">{totalAprovadas}</p>
            {valorAprovadas > 0 && (
              <p className="text-xs text-gray-500 mt-1">{formatarMoeda(valorAprovadas)}</p>
            )}
          </div>
        </div>
      </div>

      {/* ============ SOLICITAR MEDIÇÕES EM LOTE ============ */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
        <button
          type="button"
          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
          onClick={() => setSolicitarLoteAberto(p => !p)}
        >
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-semibold text-gray-800">
              Solicitar Medições do Mês
            </span>
            <span className="text-xs text-gray-500">— {formatarMesNomeCompleto(periodo)}</span>
            {contratosNaoEnviaram.length > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                {contratosNaoEnviaram.length} pendente{contratosNaoEnviaram.length > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <ChevronLeft className={`w-4 h-4 text-gray-400 transition-transform ${solicitarLoteAberto ? '-rotate-90' : 'rotate-0'}`} />
        </button>

        {solicitarLoteAberto && (
          <div className="border-t border-gray-100 p-4 space-y-4">
            <p className="text-sm text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Solicite que os fornecedores enviem a planilha de medições e notas fiscais referentes a {formatarMesNomeCompleto(periodo)}.
            </p>

            {contratos.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum contrato de medição encontrado.</p>
            ) : (
              <>
                <div className="max-h-52 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {contratos.map((c) => {
                    const jaEnviou = c.enviou_mes === true
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                          jaEnviou ? 'bg-green-50/50' : contratosSelecionados[c.id] ? 'bg-blue-50/50' : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={!!contratosSelecionados[c.id]}
                          onChange={(e) => setContratosSelecionados(prev => ({ ...prev, [c.id]: e.target.checked }))}
                          className="w-4 h-4"
                          disabled={loadingSolicitarLote}
                        />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900">{c.numero_contrato}</span>
                          <span className="text-gray-400 mx-2">·</span>
                          <span className="text-sm text-gray-600 truncate">{c.fornecedor_nome}</span>
                        </div>
                        <div className="flex-shrink-0">
                          {jaEnviou ? (
                            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-100 px-2 py-0.5 rounded">
                              <CheckCircle className="w-3 h-3" /> Enviou
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                              <XCircle className="w-3 h-3" /> Não enviou
                            </span>
                          )}
                        </div>
                      </label>
                    )
                  })}
                </div>

                <div>
                  <Label className="text-sm text-gray-600">Mensagem ao fornecedor (opcional)</Label>
                  <Textarea
                    value={mensagemLote}
                    onChange={(e) => setMensagemLote(e.target.value)}
                    placeholder="Ex.: Precisamos da medição para fechamento do mês..."
                    rows={2}
                    className="mt-1"
                  />
                </div>

                {whatsappConfigurado && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="wpp-lote-v2"
                        checked={enviarWhatsappLote}
                        onChange={(e) => {
                          setEnviarWhatsappLote(e.target.checked)
                          if (e.target.checked) {
                            const tels: Record<string, string> = {}
                            contratos.forEach(c => { if (c.fornecedor_telefone) tels[c.id] = c.fornecedor_telefone })
                            setTelefonesLote(tels)
                          } else {
                            setTelefonesLote({})
                          }
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-green-600"
                      />
                      <label htmlFor="wpp-lote-v2" className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                        <MessageCircle className="w-4 h-4 text-green-600" />
                        <span className="font-medium text-gray-700">Notificar via WhatsApp</span>
                      </label>
                    </div>

                    {enviarWhatsappLote && (() => {
                      const idsSelecionados = Object.entries(contratosSelecionados).filter(([, v]) => v).map(([k]) => k)
                      const contratosSel = contratos.filter(c => idsSelecionados.includes(c.id) && !c.enviou_mes)
                      const semTelefone = contratosSel.filter(c => !telefonesLote[c.id]?.trim())
                      const comTelefone = contratosSel.filter(c => !!telefonesLote[c.id]?.trim())
                      return (
                        <div className="border border-green-200 rounded-lg overflow-hidden">
                          <div className="bg-green-50 px-3 py-2 flex items-center justify-between">
                            <span className="text-xs font-medium text-green-800">Checklist de envio WhatsApp</span>
                            <div className="flex gap-3 text-xs">
                              <span className="text-green-700">✓ {comTelefone.length} com telefone</span>
                              {semTelefone.length > 0 && <span className="text-red-600">⚠ {semTelefone.length} sem telefone</span>}
                            </div>
                          </div>
                          <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                            {contratosSel.map(c => {
                              const tel = telefonesLote[c.id] || ''
                              const temTel = !!tel.trim()
                              return (
                                <div key={c.id} className={`flex items-center gap-2 px-3 py-2 text-xs ${temTel ? 'bg-white' : 'bg-red-50'}`}>
                                  <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${temTel ? 'bg-green-500' : 'bg-red-400'}`}>
                                    {temTel ? '✓' : '!'}
                                  </span>
                                  <span className="font-medium text-gray-800 w-20 flex-shrink-0 truncate">{c.numero_contrato}</span>
                                  <span className="text-gray-500 flex-1 truncate">{c.fornecedor_nome}</span>
                                  <input
                                    type="tel"
                                    value={tel}
                                    onChange={(e) => setTelefonesLote(prev => ({ ...prev, [c.id]: e.target.value }))}
                                    placeholder={temTel ? '' : 'Informe o telefone'}
                                    className={`w-36 flex-shrink-0 border rounded px-2 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500 ${temTel ? 'border-gray-200' : 'border-red-300 bg-red-50'}`}
                                  />
                                </div>
                              )
                            })}
                            {contratosSel.length === 0 && (
                              <p className="text-xs text-gray-400 px-3 py-2">Selecione contratos acima para ver o checklist.</p>
                            )}
                          </div>
                          {semTelefone.length > 0 && (
                            <div className="bg-amber-50 border-t border-amber-200 px-3 py-2 text-xs text-amber-700">
                              ⚠ Fornecedores sem telefone não receberão o WhatsApp. Preencha o número ou desmarque-os.
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <Button
                    onClick={() => enviarSolicitacaoLote(true)}
                    disabled={loadingSolicitarLote || contratosNaoEnviaram.length === 0}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {loadingSolicitarLote ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                    Solicitar Todos Pendentes ({contratosNaoEnviaram.length})
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => enviarSolicitacaoLote(false)}
                    disabled={loadingSolicitarLote || totalSelecionadosSolicitar === 0}
                  >
                    <Send className="w-4 h-4 mr-2" />
                    Solicitar Selecionados ({totalSelecionadosSolicitar})
                  </Button>
                  <span className="text-xs text-gray-400">{contratos.length} contrato{contratos.length !== 1 ? 's' : ''}</span>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ============ AGUARDANDO FORNECEDOR ============ */}
      {contratosAguardandoFornecedor.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-amber-100/50 transition-colors"
            onClick={() => setAguardandoFornecedorAberto(p => !p)}
          >
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <span className="text-sm font-semibold text-amber-800">
                Aguardando Fornecedor ({contratosAguardandoFornecedor.length})
              </span>
              <span className="text-xs text-amber-600">— Solicitação enviada, medição ainda não enviada</span>
            </div>
            <ChevronLeft className={`w-4 h-4 text-amber-500 transition-transform ${aguardandoFornecedorAberto ? '-rotate-90' : 'rotate-0'}`} />
          </button>
          {aguardandoFornecedorAberto && (
            <div className="border-t border-amber-200 divide-y divide-amber-100">
              {contratosAguardandoFornecedor
                .filter(c => !busca || [c.numero_contrato, c.fornecedor_nome, c.objeto].some(v => v?.toLowerCase().includes(busca.toLowerCase())))
                .map((c) => {
                  const ultimaSolicitacao = historico
                    .filter(s => s.contrato_id === c.id && s.mes_referencia === periodo)
                    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                  const dataSolicitada = ultimaSolicitacao ? formatarData(ultimaSolicitacao.created_at) : '—'
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-white/60">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 text-sm">{c.numero_contrato}</span>
                          <span className="text-gray-400">·</span>
                          <span className="text-sm text-gray-600 truncate">{c.fornecedor_nome}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5">Solicitada em {dataSolicitada}</div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-300 text-amber-700 hover:bg-amber-50 shrink-0"
                        onClick={() => {
                          setSolicitarContrato(c)
                          setMensagemSolicitar('Lembramos que a medição ainda está pendente.')
                          setEnviarWhatsappIndividual(false)
                          setTelefoneWhatsappIndividual('')
                          setErroSolicitar(null)
                        }}
                        disabled={loadingSolicitar}
                      >
                        <Mail className="w-4 h-4 mr-1" />
                        Lembrar fornecedor
                      </Button>
                    </div>
                  )
                })}
            </div>
          )}
        </div>
      )}

      {/* ============ FILTROS ============ */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Busca */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              className="pl-9 h-9"
              placeholder="Contrato, fornecedor ou nº medição..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <Label className="text-sm text-gray-500 whitespace-nowrap">Status</Label>
            <Select value={statusFiltro} onValueChange={(v) => setStatusFiltro(v as StatusFiltro)}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as medições</SelectItem>
                <SelectItem value="aguardando">Aguardando Análise</SelectItem>
                <SelectItem value="em_analise">Em Análise</SelectItem>
                <SelectItem value="aprovadas">Aprovadas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Período */}
          <div className="flex items-center gap-2">
            <Label className="text-sm text-gray-500 whitespace-nowrap">Período</Label>
            <div className="flex items-center border rounded-md overflow-hidden h-9">
              <button
                type="button"
                className="px-2 h-full hover:bg-gray-50 border-r text-gray-500"
                onClick={() => setPeriodo(prev => navegarMes(prev, -1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 text-sm font-medium text-gray-700 whitespace-nowrap min-w-[120px] text-center">
                {formatarMesNomeCompleto(periodo)}
              </span>
              <button
                type="button"
                className="px-2 h-full hover:bg-gray-50 border-l text-gray-500"
                onClick={() => setPeriodo(prev => navegarMes(prev, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tipo */}
          <div className="flex items-center gap-2">
            <Label className="text-sm text-gray-500 whitespace-nowrap">Tipo</Label>
            <Select value={tipoFiltro} onValueChange={(v) => setTipoFiltro(v as TipoFiltro)}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="servicos">Serviços</SelectItem>
                <SelectItem value="fornecimento">Fornecimento</SelectItem>
                <SelectItem value="obras">Obras</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Limpar filtros */}
          {temFiltrosAtivos && (
            <button
              type="button"
              onClick={limparFiltros}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <X className="w-4 h-4" />
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ============ TABELA APROVADAS ============ */}
      {statusFiltro === 'aprovadas' && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              Medições Aprovadas
              <Badge variant="secondary" className="ml-1">{aprovadas.length}</Badge>
            </h2>
            <span className="text-sm text-gray-500">{aprovadas.length} registros</span>
          </div>
          <div className="overflow-x-auto">
            {loadingAprovadas ? (
              <div className="flex items-center justify-center py-16 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando...
              </div>
            ) : aprovadas.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16 text-gray-400">
                <CheckCircle className="w-10 h-10 text-gray-200" />
                <p className="text-sm">Nenhuma medição aprovada encontrada</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50 hover:bg-gray-50">
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">N° Medição / Contrato</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">Fornecedor</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">Período</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">Valor</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">Documentos</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">Contabilidade</TableHead>
                    <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aprovadas.map((m) => (
                    <TableRow key={m.id} className="hover:bg-gray-50/50">
                      <TableCell className="py-4">
                        <p className="font-mono text-xs font-semibold text-gray-800">
                          MED-{new Date(m.periodo_inicio).getFullYear()}-{String(m.numero_medicao).padStart(4, '0')}
                        </p>
                        <p className="text-xs text-gray-500 truncate max-w-[200px]">
                          Contrato {m.contrato?.numero_contrato}
                        </p>
                      </TableCell>
                      <TableCell className="py-4 text-sm text-gray-700 max-w-[160px] truncate">
                        {m.fornecedor_nome}
                      </TableCell>
                      <TableCell className="py-4">
                        <p className="text-xs text-gray-600">
                          {formatarData(m.periodo_inicio)} – {formatarData(m.periodo_fim)}
                        </p>
                        {m.competencia && <p className="text-xs text-gray-400">{m.competencia}</p>}
                      </TableCell>
                      <TableCell className="py-4">
                        <p className="text-sm font-semibold text-gray-800">{formatarMoeda(m.valor_medido)}</p>
                        <p className="text-xs text-gray-400">{formatarData(m.data_aprovacao)}</p>
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex flex-wrap gap-1">
                          {m.boletim_pdf_url ? (
                            <Badge className="bg-green-100 text-green-700 text-xs font-normal">✓ Boletim</Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-gray-400 font-normal">Sem boletim</Badge>
                          )}
                          {m.total_anexos > 0 && (
                            <Badge variant="outline" className="text-xs font-normal flex items-center gap-0.5">
                              <Paperclip className="w-3 h-3" />{m.total_anexos}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="py-4">
                        {m.enviado_contabilidade ? (
                          <div>
                            <Badge className="bg-green-100 text-green-800 text-xs font-normal">Enviado</Badge>
                            <p className="text-xs text-gray-400 mt-0.5">{formatarData(m.data_envio_contabilidade)}</p>
                            {m.enviado_contabilidade_por_nome && (
                              <p className="text-xs text-gray-400 truncate max-w-[120px]">{m.enviado_contabilidade_por_nome}</p>
                            )}
                          </div>
                        ) : (
                          <Badge variant="outline" className="text-xs text-gray-400 font-normal">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell className="py-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title="Baixar Boletim PDF"
                            disabled={!m.boletim_pdf_url}
                            onClick={() => baixarBoletim(m)}
                          >
                            <FileDown className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon" variant="ghost" className="h-7 w-7"
                            title="Baixar todos os documentos (ZIP)"
                            disabled={downloadingZip === m.id}
                            onClick={() => baixarZip(m.id, m.numero_medicao)}
                          >
                            {downloadingZip === m.id
                              ? <Loader2 className="w-4 h-4 animate-spin" />
                              : <Archive className="w-4 h-4" />}
                          </Button>
                          <Button
                            size="icon" variant="ghost"
                            className={`h-7 w-7 ${m.enviado_contabilidade ? 'text-green-600' : 'text-gray-400'}`}
                            title={m.enviado_contabilidade ? 'Desmarcar envio para contabilidade' : 'Marcar como impresso e enviado para contabilidade'}
                            onClick={() => toggleContabilidade(m.id)}
                          >
                            {m.enviado_contabilidade
                              ? <CheckSquare className="w-4 h-4" />
                              : <Square className="w-4 h-4" />}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      )}

      {/* ============ TABELA PENDENTES ============ */}
      {statusFiltro !== 'aprovadas' && (
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Cabeçalho da seção */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{tituloTabela}</h2>
          <span className="text-sm text-gray-500">{medicoesVisiveis.length} registros encontrados</span>
        </div>

        {/* Tabela */}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50 hover:bg-gray-50">
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">
                  N° Medição / Contrato
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">
                  Fornecedor
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">
                  Tipo
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">
                  Valor Medido
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">
                  Enviado Em
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">
                  Dias Em Aberto
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3">
                  Status
                </TableHead>
                <TableHead className="text-xs font-semibold text-gray-500 uppercase tracking-wide py-3 text-right">
                  Ações
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {medicoesPaginadas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-10 h-10 text-gray-200" />
                      <p className="text-sm text-gray-500">Nenhuma medição encontrada</p>
                      {temFiltrosAtivos && (
                        <button
                          type="button"
                          onClick={limparFiltros}
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Limpar filtros
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                medicoesPaginadas.map((med: any) => {
                  const isAprovacao = med.status === 'AGUARDANDO_APROVACAO'
                  const isAprovada = med.status === 'APROVADA'
                  const ano = isAprovacao
                    ? (new Date(med.ateste_data || med.periodo_inicio || '').getFullYear() || new Date().getFullYear())
                    : isAprovada
                    ? (new Date(med.data_aprovacao || med.periodo_inicio || '').getFullYear() || new Date().getFullYear())
                    : (med.data_submissao ? new Date(med.data_submissao).getFullYear() : new Date().getFullYear())
                  const numFormatado = `MED-${ano}-${String(med.numero_medicao).padStart(4, '0')}`
                  const dataEnvio = isAprovacao ? med.ateste_data : isAprovada ? med.data_aprovacao : (med as MedicaoPendente).data_submissao
                  const dias = (isAprovacao || isAprovada) ? 0 : (med as MedicaoPendente).dias

                  return (
                    <TableRow key={med.id} className={`hover:bg-gray-50/70 transition-colors ${isAprovada ? 'bg-green-50/30' : ''}`}>
                      {/* N° Medição / Contrato */}
                      <TableCell className="py-4">
                        <p className="text-sm font-semibold text-blue-600">{numFormatado}</p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Contrato {med.numero_contrato}
                          {med.objeto_contrato && (
                            <span className="text-gray-400"> · {med.objeto_contrato.slice(0, 30)}{med.objeto_contrato.length > 30 ? '...' : ''}</span>
                          )}
                        </p>
                      </TableCell>

                      {/* Fornecedor */}
                      <TableCell className="py-4">
                        <p className="text-sm font-medium text-gray-900">{med.fornecedor_nome}</p>
                        {med.cnpj && (
                          <p className="text-xs text-gray-500 mt-0.5">CNPJ: {med.cnpj}</p>
                        )}
                      </TableCell>

                      {/* Tipo */}
                      <TableCell className="py-4">
                        <span className="text-sm text-gray-700">{med.tipo || 'Serviços'}</span>
                      </TableCell>

                      {/* Valor Medido */}
                      <TableCell className="py-4">
                        <p className="text-sm font-semibold text-gray-900">{formatarMoeda(med.valor_medido)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{formatarCompetencia(med.periodo_inicio)}</p>
                      </TableCell>

                      {/* Enviado Em */}
                      <TableCell className="py-4">
                        <span className="text-sm text-gray-700">{formatarData(dataEnvio)}</span>
                      </TableCell>

                      {/* Dias em aberto */}
                      <TableCell className="py-4">
                        {isAprovada ? <span className="text-xs text-gray-400">—</span> : <DiasBadge dias={dias} />}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-4">
                        {isAprovada ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                            Aprovada
                          </span>
                        ) : isAprovacao ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                            Em Análise
                          </span>
                        ) : (
                          <StatusBadge status={med.status} dias={dias} />
                        )}
                      </TableCell>

                      {/* Ações */}
                      <TableCell className="py-4">
                        <div className="flex items-center justify-end gap-2">
                          {isAprovada && (
                            <Button
                              size="icon" variant="ghost" className="h-8 w-8"
                              title="Baixar Boletim PDF"
                              disabled={!med.boletim_pdf_url}
                              onClick={() => baixarBoletim(med)}
                            >
                              <FileDown className="w-4 h-4" />
                            </Button>
                          )}
                          {isAprovada && (
                            <Button
                              size="icon" variant="ghost" className="h-8 w-8"
                              title="Baixar todos os documentos (ZIP)"
                              disabled={downloadingZip === med.id}
                              onClick={() => baixarZip(med.id, med.numero_medicao)}
                            >
                              {downloadingZip === med.id
                                ? <Loader2 className="w-4 h-4 animate-spin" />
                                : <Archive className="w-4 h-4" />}
                            </Button>
                          )}
                          {!isAprovacao && !isAprovada && (
                            <Button
                              size="sm"
                              className="h-8 bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => abrirModalAtesteDireto(med as MedicaoPendente)}
                              disabled={loadingAteste}
                            >
                              {loadingAteste ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : med.status === 'PARCIALMENTE_ATESTADA' ? 'Continuar' : 'Analisar'}
                            </Button>
                          )}
                          {!isAprovacao && !isAprovada && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-amber-600 border-amber-300 hover:bg-amber-50"
                              title="Devolver ao fornecedor"
                              onClick={() => { setModalDevolver(med); setMotivoDevolucao('') }}
                            >
                              <RotateCcw className="w-3 h-3 mr-1" />Devolver
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => {
                              const c = contratoMap.get(med.contrato_id)
                              if (c) setContratoAberto(c)
                            }}
                          >
                            Ver
                          </Button>
                          {(podeExcluirMedicao || !isAprovacao) && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                              title="Excluir medição"
                              onClick={() => excluirMedicaoById(med.id, med.numero_medicao, med.status)}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* ============ PAGINAÇÃO ============ */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Mostrando {((pagina - 1) * ITENS_POR_PAGINA) + 1}–{Math.min(pagina * ITENS_POR_PAGINA, medicoesVisiveis.length)} de {medicoesVisiveis.length} registros
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                onClick={() => setPagina(p => Math.max(1, p - 1))}
                disabled={pagina === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: totalPaginas }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  type="button"
                  className={`w-8 h-8 flex items-center justify-center rounded border text-sm font-medium transition-colors ${
                    p === pagina
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                  onClick={() => setPagina(p)}
                >
                  {p}
                </button>
              ))}
              <button
                type="button"
                className="w-8 h-8 flex items-center justify-center rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40"
                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                disabled={pagina === totalPaginas}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Rodapé simples quando há 1 página */}
        {totalPaginas === 1 && medicoesVisiveis.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Mostrando 1–{medicoesVisiveis.length} de {medicoesVisiveis.length} registros
            </p>
          </div>
        )}
      </div>
      )}

      {/* ============ MODAL: ATESTE DIRETO ============ */}
      <Dialog open={!!modalAteste} onOpenChange={() => { setModalAteste(null); setAnexosAteste([]); setEtapaAssinatura('idle'); setFiscalSelecionado(''); setStatusAssinatura(null); if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null } }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-yellow-600" />
              Atestar {modalAteste?.numero_medicao}ª Medição
            </DialogTitle>
            <DialogDescription>
              Valor medido: {formatarMoeda(modalAteste?.valor_medido || 0)} — {Number(modalAteste?.percentual_fisico_medido || 0).toFixed(1)}% físico
              {modalAteste?.status === 'PARCIALMENTE_ATESTADA' && ' — Ateste parcial em andamento'}
            </DialogDescription>
          </DialogHeader>

          {modalAteste && (
            <div className="space-y-4">
              <div className="bg-blue-50 p-3 rounded-lg text-sm">
                <span className="font-medium">{modalAteste.contrato?.numero_contrato || 'Contrato'}</span>
                <span className="text-gray-500 mx-2">-</span>
                <span>{modalAteste.contrato?.fornecedor_razao_social || modalAteste.fornecedor_nome || 'Fornecedor'}</span>
              </div>

              {/* Tabela de itens */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead className="w-10 text-center">
                        {(() => {
                          const itens = (modalAteste.itens || []) as any[]
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
                            />
                          )
                        })()}
                      </TableHead>
                      <TableHead className="text-xs font-bold max-w-xs">Item / Etapa</TableHead>
                      <TableHead className="text-xs font-bold text-center w-24">Qtd / %</TableHead>
                      <TableHead className="text-xs font-bold text-right w-24">Valor</TableHead>
                      <TableHead className="text-xs font-bold w-10">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(modalAteste.itens || []).map((item: any, idx: number) => {
                      const jaAtestado = !!item.atestado
                      const selecionado = itensAteste[item.id]?.selecionado || false
                      const podeEditarAteste = ['SUBMETIDA', 'PARCIALMENTE_ATESTADA'].includes(modalAteste.status || '')
                      const isItemCronograma = item.tipo_item === 'item_cronograma'
                      const descricao = isItemCronograma
                        ? (item.item_descricao || item.etapa_descricao || `Item ${idx + 1}`)
                        : (item.etapa_descricao || `Etapa ${idx + 1}`)
                      const numero = isItemCronograma
                        ? (item.item_numero || item.etapa_numero || idx + 1)
                        : (item.etapa_numero || idx + 1)
                      return (
                        <TableRow
                          key={item.id || idx}
                          className={jaAtestado && selecionado ? 'bg-green-50/50' : selecionado ? 'bg-yellow-50/50' : ''}
                        >
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
                          <TableCell className="min-w-0 max-w-xs">
                            <p className="text-sm font-medium break-words whitespace-normal">{numero}. {descricao}</p>
                            {jaAtestado && selecionado && (
                              <p className="text-xs text-green-600 mt-0.5">
                                Atestado por {item.ateste_fiscal_nome} em {formatarData(item.ateste_data)}
                              </p>
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
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {isItemCronograma
                              ? (
                                <span className="text-blue-700">
                                  {Number(item.quantidade_medida || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} {item.item_unidade || ''}
                                </span>
                              )
                              : <span>{Number(item.percentual_executado_atual || 0).toFixed(1)}%</span>
                            }
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">
                            {formatarMoeda(item.valor_medido)}
                          </TableCell>
                          <TableCell className="text-center">
                            {jaAtestado && selecionado ? (
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

              {/* Anexos do Fornecedor */}
              {(loadingAnexos || anexosAteste.length > 0) && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">Evidências do Fornecedor</span>
                    {anexosAteste.length > 0 && (
                      <Badge variant="outline" className="text-xs">{anexosAteste.length}</Badge>
                    )}
                  </div>
                  {loadingAnexos ? (
                    <p className="text-xs text-gray-400">Carregando anexos...</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {anexosAteste.map((anexo: any) => (
                        <div
                          key={anexo.id}
                          className="border rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => window.open(`${API_URL}${anexo.url}`, '_blank')}
                        >
                          {anexo.tipo === 'FOTO' ? (
                            <img
                              src={`${API_URL}${anexo.url}`}
                              alt={anexo.descricao || anexo.nome_original}
                              className="w-full h-20 object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : (
                            <div className="w-full h-20 flex items-center justify-center bg-gray-50">
                              <FileText className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                          <div className="p-1.5">
                            <p className="text-xs text-gray-600 truncate">{anexo.descricao || anexo.nome_original}</p>
                            <p className="text-xs text-gray-400">{Math.round((anexo.tamanho_bytes || 0) / 1024)} KB</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Verificação in loco */}
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <input
                  type="checkbox"
                  id="verificado_in_loco_v2"
                  checked={formAteste.verificado_in_loco}
                  onChange={e => setFormAteste({ ...formAteste, verificado_in_loco: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="verificado_in_loco_v2" className="flex items-center gap-2 text-sm cursor-pointer">
                  <Shield className="w-4 h-4 text-green-600" />
                  Confirmo que realizei verificação presencial (in loco)
                </label>
              </div>

              {/* Observações */}
              <div className="space-y-2">
                <Label>Observações gerais do Ateste</Label>
                <Textarea
                  placeholder="Observações sobre a verificação técnica..."
                  value={formAteste.observacoes}
                  onChange={e => setFormAteste({ ...formAteste, observacoes: e.target.value })}
                  rows={2}
                />
              </div>

              {/* Motivo devolução parcial */}
              {(() => {
                const itens = (modalAteste.itens || []) as any[]
                const novosAtestados = itens.filter((i: any) => !i.atestado && itensAteste[i.id]?.selecionado).length
                const jaAtestadosMantidos = itens.filter((i: any) => i.atestado && itensAteste[i.id]?.selecionado).length
                const todosSerao = jaAtestadosMantidos + novosAtestados === itens.length && itens.length > 0
                return !todosSerao && novosAtestados > 0 ? (
                  <div className="space-y-2 p-3 border border-amber-200 rounded-lg bg-amber-50/50">
                    <Label className="text-amber-800">Motivo da devolução (itens não atestados) *</Label>
                    <Textarea
                      placeholder="Informe o motivo para devolver ao fornecedor..."
                      value={formAteste.motivo_devolucao_parcial}
                      onChange={e => setFormAteste({ ...formAteste, motivo_devolucao_parcial: e.target.value })}
                      rows={2}
                      className="border-amber-200"
                    />
                  </div>
                ) : null
              })()}
            </div>
          )}

          {/* Assinatura Digital do Fiscal */}
          {modalAteste && (
            <div className="border-t pt-4 space-y-3 px-1">
              <div className="flex items-center gap-2">
                <PenLine className="w-4 h-4 text-indigo-600" />
                <span className="text-sm font-semibold text-gray-800">Assinatura Digital do Fiscal</span>
                {etapaAssinatura === 'assinado' && <CheckCircle className="w-4 h-4 text-green-600" />}
                {etapaAssinatura === 'recusado' && <XCircle className="w-4 h-4 text-red-500" />}
              </div>

              {etapaAssinatura === 'idle' && (
                <div className="flex gap-2">
                  <Select value={fiscalSelecionado} onValueChange={setFiscalSelecionado}>
                    <SelectTrigger className="flex-1 text-sm">
                      <SelectValue placeholder={fiscaisDisponiveis.length === 0 ? 'Carregando fiscais...' : 'Selecione o fiscal...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {fiscaisDisponiveis.map((f: any) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome}{f.cargo ? ` — ${f.cargo}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!fiscalSelecionado || loadingAssinatura}
                    onClick={async () => {
                      setLoadingAssinatura(true)
                      try {
                        const res = await authFetch(
                          `${API_URL}/api/contratos/medicoes/${modalAteste.id}/solicitar-assinatura-fiscal`,
                          { method: 'POST', body: JSON.stringify({ fiscalUsuarioId: fiscalSelecionado }) }
                        )
                        if (res.ok) {
                          const data = await res.json()
                          setStatusAssinatura(data)
                          setEtapaAssinatura('aguardando')
                          // Polling a cada 30s
                          if (pollingRef.current) clearInterval(pollingRef.current)
                          pollingRef.current = setInterval(async () => {
                            const r = await authFetch(`${API_URL}/api/contratos/medicoes/${modalAteste.id}/status-assinatura-fiscal`)
                            if (!r.ok) return
                            const s = await r.json()
                            setStatusAssinatura(s)
                            if (s.status === 'assinado') {
                              setEtapaAssinatura('assinado')
                              clearInterval(pollingRef.current!)
                              pollingRef.current = null
                            } else if (s.status === 'recusado') {
                              setEtapaAssinatura('recusado')
                              clearInterval(pollingRef.current!)
                              pollingRef.current = null
                            }
                          }, 30_000)
                        } else {
                          const err = await res.json().catch(() => ({}))
                          alert(err.message || 'Erro ao enviar solicitação.')
                        }
                      } catch {
                        alert('Erro ao enviar solicitação.')
                      }
                      setLoadingAssinatura(false)
                    }}
                  >
                    {loadingAssinatura ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar para assinar'}
                  </Button>
                </div>
              )}

              {etapaAssinatura === 'aguardando' && (
                <div className="space-y-2">
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm">
                    <p className="text-yellow-800 font-medium flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Aguardando assinatura de <strong>{statusAssinatura?.fiscal_nome}</strong>
                    </p>
                    <p className="text-yellow-600 text-xs mt-1">Link enviado via WhatsApp. Verificando automaticamente a cada 30s.</p>
                  </div>
                  <Button size="sm" variant="outline" className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-50" onClick={() => {
                    if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
                    setEtapaAssinatura('idle')
                    setFiscalSelecionado('')
                    setStatusAssinatura(null)
                  }}>
                    <Send className="w-3.5 h-3.5" />
                    Reenviar para outro fiscal
                  </Button>
                </div>
              )}

              {etapaAssinatura === 'assinado' && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                  ✅ Boletim assinado digitalmente por <strong>{statusAssinatura?.fiscal_nome}</strong>
                </div>
              )}

              {etapaAssinatura === 'recusado' && (
                <div className="space-y-2">
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                    ❌ Assinatura recusada por <strong>{statusAssinatura?.fiscal_nome}</strong>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => {
                    setEtapaAssinatura('idle')
                    setFiscalSelecionado('')
                    setStatusAssinatura(null)
                  }}>
                    Solicitar novamente
                  </Button>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalAteste(null); setAnexosAteste([]); setEtapaAssinatura('idle'); setFiscalSelecionado(''); setStatusAssinatura(null); if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null } }}>Cancelar</Button>
            {modalAteste && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-amber-600 border-amber-300 hover:bg-amber-50"
                onClick={() => {
                  const med = modalAteste
                  setModalAteste(null)
                  setAnexosAteste([])
                  setEtapaAssinatura('idle')
                  setFiscalSelecionado('')
                  setStatusAssinatura(null)
                  if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
                  setModalDevolver(med)
                  setMotivoDevolucao('')
                }}
              >
                <RotateCcw className="w-4 h-4" />
                Devolver
              </Button>
            )}
            {modalAteste && (podeExcluirMedicao) && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-red-600 border-red-200 hover:bg-red-50"
                onClick={() => {
                  const { id, numero_medicao, status } = modalAteste
                  setModalAteste(null)
                  excluirMedicaoById(id, numero_medicao, status)
                }}
              >
                <Trash2 className="w-4 h-4" />
                Excluir
              </Button>
            )}
            {modalAteste && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2 text-blue-700 border-blue-200 hover:bg-blue-50"
                onClick={async () => {
                  const resBoletim = await authFetch(`${API_URL}/api/contratos/medicoes/${modalAteste.id}/boletim-oficial`)
                  if (!resBoletim.ok) return
                  const boletim = await resBoletim.json()
                  if (!boletim?.pdf_url) return
                  const arquivoRes = await fetch(boletim.pdf_url)
                  if (!arquivoRes.ok) return
                  const pdfBlob = await arquivoRes.blob()
                  const objectUrl = window.URL.createObjectURL(pdfBlob)
                  const link = document.createElement('a')
                  link.href = objectUrl
                  link.download = boletim.filename || `boletim_medicao_${modalAteste.id}.pdf`
                  link.style.display = 'none'
                  document.body.appendChild(link)
                  link.click()
                  setTimeout(() => { link.remove(); window.URL.revokeObjectURL(objectUrl) }, 1000)
                }}
              >
                <FileDown className="w-4 h-4" />
                Baixar PDF
              </Button>
            )}
            {modalAteste && (() => {
              const itens = (modalAteste.itens || []) as any[]
              const temSelecionados = itens.some((i: any) => !i.atestado && itensAteste[i.id]?.selecionado)
              const temCancelados = itens.some((i: any) => i.atestado && !itensAteste[i.id]?.selecionado)
              const temAcao = temSelecionados || temCancelados
              const novosAtestados = itens.filter((i: any) => !i.atestado && itensAteste[i.id]?.selecionado).length
              const jaAtestadosMantidos = itens.filter((i: any) => i.atestado && itensAteste[i.id]?.selecionado).length
              const todosSerao = jaAtestadosMantidos + novosAtestados === itens.length && itens.length > 0
              const itensNaoSelecionados = itens.filter((i: any) => !itensAteste[i.id]?.selecionado && !i.atestado).length
              const motivoObrigatorio = !todosSerao && temSelecionados && itensNaoSelecionados > 0 && !formAteste.motivo_devolucao_parcial?.trim()
              const fiscalNaoAssinou = etapaAssinatura !== 'assinado'
              return (
                <Button
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  onClick={executarAteste}
                  disabled={actionLoading || !temAcao || motivoObrigatorio || fiscalNaoAssinou}
                  title={fiscalNaoAssinou ? 'Aguardando assinatura digital do fiscal' : undefined}
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

      {/* ============ MODAL: DEVOLVER ============ */}
      <Dialog open={!!modalDevolver} onOpenChange={() => { setModalDevolver(null); setMotivoDevolucao('') }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-5 h-5 text-amber-600" />
              Devolver Medição ao Fornecedor
            </DialogTitle>
            <DialogDescription>
              {modalDevolver?.numero_medicao}ª Medição — {modalDevolver?.fornecedor_nome}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label>Motivo da devolução *</Label>
            <Textarea
              placeholder="Informe o motivo para devolver ao fornecedor..."
              value={motivoDevolucao}
              onChange={e => setMotivoDevolucao(e.target.value)}
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalDevolver(null); setMotivoDevolucao('') }}>Cancelar</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!motivoDevolucao.trim() || actionLoading}
              onClick={devolverMedicao}
            >
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <RotateCcw className="w-4 h-4 mr-2" />
              Devolver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ MODAL: CONTRATO (TabMedicao) ============ */}
      <Dialog open={!!contratoAberto} onOpenChange={() => setContratoAberto(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-blue-600" />
              {contratoAberto?.numero_contrato} — {contratoAberto?.fornecedor_nome}
            </DialogTitle>
          </DialogHeader>
          {contratoAberto && (
            <TabMedicao
              contratoId={contratoAberto.id}
              valorGlobal={contratoAberto.valor_global}
              modalidade={(contratoAberto as any).modalidade_execucao}
              contrato={(contratoAberto as any).data_vigencia_inicio ? contratoAberto as any : undefined}
              onAtestar={abrirModalAtesteDireto}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ============ MODAL: LEMBRAR FORNECEDOR ============ */}
      <Dialog open={!!solicitarContrato} onOpenChange={() => { setSolicitarContrato(null); setErroSolicitar(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-amber-600" />
              Lembrar Fornecedor
            </DialogTitle>
            <DialogDescription>
              {solicitarContrato?.numero_contrato} — {solicitarContrato?.fornecedor_nome}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label className="text-sm text-gray-700">Mensagem</Label>
              <Textarea
                className="mt-1"
                rows={3}
                value={mensagemSolicitar}
                onChange={e => setMensagemSolicitar(e.target.value)}
                placeholder="Ex.: Lembramos que a medição ainda está pendente..."
              />
            </div>

            {whatsappConfigurado && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="wpp-individual-v2"
                    checked={enviarWhatsappIndividual}
                    onChange={e => setEnviarWhatsappIndividual(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-green-600"
                  />
                  <label htmlFor="wpp-individual-v2" className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    <span className="font-medium text-gray-700">Enviar também via WhatsApp</span>
                  </label>
                </div>
                {enviarWhatsappIndividual && (
                  <div>
                    <Label className="text-sm text-gray-600">Telefone WhatsApp</Label>
                    <Input
                      className="mt-1"
                      type="tel"
                      placeholder={solicitarContrato?.fornecedor_telefone || '(XX) XXXXX-XXXX'}
                      value={telefoneWhatsappIndividual || solicitarContrato?.fornecedor_telefone || ''}
                      onChange={e => setTelefoneWhatsappIndividual(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

            {erroSolicitar && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {erroSolicitar}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { setSolicitarContrato(null); setErroSolicitar(null) }}>
              Cancelar
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={enviarSolicitacao}
              disabled={loadingSolicitar}
            >
              {loadingSolicitar && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <Send className="w-4 h-4 mr-2" />
              Enviar Lembrete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
