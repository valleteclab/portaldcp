'use client'

import { useState, useEffect, useCallback, type ReactNode } from 'react'
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
  ClipboardCheck, TrendingUp, Search, Building2, FileText,
  Loader2, AlertTriangle, ChevronRight, ChevronLeft, CheckCircle, Clock,
  Send, XCircle, Calendar, History, Mail, Eye, Shield, RotateCcw, ChevronDown,
  MessageCircle, FileDown,
} from 'lucide-react'
import { API_URL, authFetch, formatarDataHoraBR } from '@/lib/api'
import { gerarPdfMedicao, derivarCompetencia, type DadosMedicaoPdf } from '@/lib/pdf-medicao'
import dynamic from 'next/dynamic'

const TabMedicao = dynamic(() => import('@/components/contratos/TabMedicao'), {
  loading: () => <div className="flex items-center justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-blue-600" /></div>,
  ssr: false,
})

// ============ INTERFACES ============

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
  numero_medicoes_mes?: number[]
  valor_medicoes_mes?: number
}

interface ResultadoEnvioLote {
  contrato_id: string
  numero_contrato?: string
  fornecedor_nome?: string
  sucesso: boolean
  erro?: string
  whatsapp_tentado?: boolean
  whatsapp_telefone?: string | null
  whatsapp_sem_telefone?: boolean
}

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

interface MedicaoDevolvida {
  id: string
  contrato_id: string
  numero_medicao: number
  status: string
  periodo_inicio: string
  periodo_fim: string
  valor_medido: number
  percentual_fisico_medido: number
  data_submissao?: string
  motivo_devolucao?: string
  data_devolucao?: string
  fornecedor_nome: string
  numero_contrato: string
  objeto_contrato: string
}

interface SolicitacaoEnviada {
  id: string
  contrato_id: string
  numero_contrato: string
  fornecedor_nome: string
  mes_referencia: string
  titulo: string
  mensagem: string
  solicitado_por_nome: string
  created_at: string
}

// ============ HELPERS ============

function formatarMoeda(v: number | string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function mesAnteriorYYYYMM(): string {
  const d = new Date()
  d.setMonth(d.getMonth() - 1)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function formatarMesReferencia(ym: string): string {
  const [y, m] = ym.split('-')
  if (!m || !y) return ym
  const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']
  const idx = parseInt(m, 10) - 1
  return idx >= 0 && idx < 12 ? `${meses[idx]}/${y}` : ym
}

function formatarMesNomeCompleto(ym: string): { mes: string; ano: string } {
  const [y, m] = ym.split('-')
  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  const idx = parseInt(m || '1', 10) - 1
  return { mes: idx >= 0 && idx < 12 ? meses[idx] : m || '', ano: y || '' }
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

function formatarData(d: string | null | undefined) {
  if (!d) return '-'
  const dateOnly = d.split('T')[0]
  const parts = dateOnly.split('-')
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
  return new Date(d).toLocaleDateString('pt-BR')
}

const STATUS_MEDICAO: Record<string, { label: string; cor: string }> = {
  SUBMETIDA: { label: 'Submetida', cor: 'bg-blue-100 text-blue-800' },
  PARCIALMENTE_ATESTADA: { label: 'Parcialmente Atestada', cor: 'bg-amber-100 text-amber-800' },
  AGUARDANDO_APROVACAO: { label: 'Aguardando Aprovação', cor: 'bg-orange-100 text-orange-800' },
  APROVADA: { label: 'Aprovada', cor: 'bg-green-100 text-green-800' },
}

// ============ COMPONENTE PRINCIPAL ============

export default function MedicoesPage() {
  // Dados do painel
  const [contratos, setContratos] = useState<ContratoResumo[]>([])
  const [pendentesAteste, setPendentesAteste] = useState<MedicaoPendente[]>([])
  const [pendentesAprovacao, setPendentesAprovacao] = useState<MedicaoAprovacao[]>([])
  const [devolvidas, setDevolvidas] = useState<MedicaoDevolvida[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [mesReferencia, setMesReferencia] = useState(mesAnteriorYYYYMM)

  // Seções colapsáveis
  const [secaoAprovacaoAberta, setSecaoAprovacaoAberta] = useState(false)
  const [secaoDevolvidasAberta, setSecaoDevolvidasAberta] = useState(false)
  const [secaoContratosAberta, setSecaoContratosAberta] = useState(false)
  const [historicoAberto, setHistoricoAberto] = useState(false)

  // Modal TabMedicao (contrato)
  const [contratoAberto, setContratoAberto] = useState<ContratoResumo | null>(null)

  // Modal de ateste direto
  const [modalAteste, setModalAteste] = useState<any>(null)
  const [loadingAteste, setLoadingAteste] = useState(false)
  const [formAteste, setFormAteste] = useState({ observacoes: '', verificado_in_loco: false, motivo_devolucao_parcial: '' })
  const [itensAteste, setItensAteste] = useState<Record<string, { selecionado: boolean; observacoes: string }>>({})
  const [actionLoading, setActionLoading] = useState(false)

  // Solicitar em lote
  const [contratosSelecionados, setContratosSelecionados] = useState<Record<string, boolean>>({})
  const [mensagemLote, setMensagemLote] = useState('')
  const [loadingSolicitarLote, setLoadingSolicitarLote] = useState(false)
  const [enviarWhatsappLote, setEnviarWhatsappLote] = useState(false)
  const [telefonesLote, setTelefonesLote] = useState<Record<string, string>>({})
  const [resultadoLote, setResultadoLote] = useState<ResultadoEnvioLote[] | null>(null)

  // Solicitar individual (mantido)
  const [solicitarContrato, setSolicitarContrato] = useState<ContratoResumo | null>(null)
  const [mensagemSolicitar, setMensagemSolicitar] = useState('')
  const [loadingSolicitar, setLoadingSolicitar] = useState(false)
  const [erroSolicitar, setErroSolicitar] = useState<string | null>(null)
  const [enviarWhatsappIndividual, setEnviarWhatsappIndividual] = useState(false)
  const [telefoneWhatsappIndividual, setTelefoneWhatsappIndividual] = useState('')

  // WhatsApp configurado
  const [whatsappConfigurado, setWhatsappConfigurado] = useState(false)

  // Histórico
  const [historico, setHistorico] = useState<SolicitacaoEnviada[]>([])
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  const [mensagemDetalhe, setMensagemDetalhe] = useState<SolicitacaoEnviada | null>(null)

  // ============ FETCH DE DADOS ============

  useEffect(() => {
    const orgao = JSON.parse(localStorage.getItem('orgao') || '{}')
    const orgaoId = orgao.id
    if (!orgaoId) return
    authFetch(`${API_URL}/api/orgaos/${orgaoId}/whatsapp-config`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) setWhatsappConfigurado(!!(data.whatsapp_instance_id || data.configurado))
      })
      .catch(() => {})
  }, [])

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const orgao = JSON.parse(localStorage.getItem('orgao') || '{}')
      const orgaoId = orgao.id
      if (!orgaoId) return

      const [resContratos, resPendentes, resAprovacao, resDevolvidas, resHistorico] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/resumo-fiscal?orgaoId=${orgaoId}&mes=${mesReferencia}`),
        authFetch(`${API_URL}/api/contratos/medicoes/pendentes-ateste?orgaoId=${orgaoId}`),
        authFetch(`${API_URL}/api/contratos/medicoes/pendentes-aprovacao?orgaoId=${orgaoId}`),
        authFetch(`${API_URL}/api/contratos/medicoes/devolvidas?orgaoId=${orgaoId}`),
        authFetch(`${API_URL}/api/contratos/medicoes/solicitacoes-enviadas?orgaoId=${orgaoId}`),
      ])

      if (resHistorico.ok) setHistorico(await resHistorico.json())

      if (resContratos.ok) {
        const data = await resContratos.json()
        setContratos(data)
        // Inicializar seleção de contratos para solicitar: marcar os que NÃO enviaram
        const sel: Record<string, boolean> = {}
        data.forEach((c: ContratoResumo) => {
          if (typeof c.enviou_mes === 'boolean') {
            sel[c.id] = !c.enviou_mes
          }
        })
        setContratosSelecionados(sel)
      }
      if (resPendentes.ok) setPendentesAteste(await resPendentes.json())
      if (resAprovacao.ok) setPendentesAprovacao(await resAprovacao.json())
      if (resDevolvidas.ok) setDevolvidas(await resDevolvidas.json())
    } catch (e) {
      console.error('Erro ao carregar dados:', e)
    }
    setLoading(false)
  }, [mesReferencia])

  useEffect(() => { carregarDados() }, [carregarDados])

  const carregarHistorico = useCallback(async () => {
    setLoadingHistorico(true)
    try {
      const orgao = JSON.parse(localStorage.getItem('orgao') || '{}')
      const orgaoId = orgao.id
      if (!orgaoId) return
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/solicitacoes-enviadas?orgaoId=${orgaoId}`)
      if (res.ok) setHistorico(await res.json())
    } catch (e) {
      console.error('Erro ao carregar histórico:', e)
    }
    setLoadingHistorico(false)
  }, [])

  useEffect(() => {
    if (historicoAberto && historico.length === 0) carregarHistorico()
  }, [historicoAberto, historico.length, carregarHistorico])

  // ============ ATESTAR DIRETO ============

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
      setModalAteste(medicaoCompleta)
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
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); setActionLoading(false); return }
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

      // Montar overrides de telefone para contratos que tiveram o número editado
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
          mes_referencia: mesReferencia,
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
      if (enviarWhatsappLote && resultado.resultados?.length) {
        setResultadoLote(resultado.resultados)
      } else {
        alert(resultado.message)
      }
      carregarDados()
      if (historicoAberto) carregarHistorico()
    } catch { alert('Erro ao enviar solicitações') }
    setLoadingSolicitarLote(false)
  }

  // ============ SOLICITAR INDIVIDUAL (mantido) ============

  const enviarSolicitacao = async () => {
    if (!solicitarContrato) return
    setErroSolicitar(null)
    setLoadingSolicitar(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${solicitarContrato.id}/medicoes/solicitar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mes_referencia: mesReferencia,
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
      if (historicoAberto) carregarHistorico()
    } catch (e) {
      setErroSolicitar(e instanceof Error ? e.message : 'Erro ao enviar')
    }
    setLoadingSolicitar(false)
  }

  // ============ FILTROS ============

  const contratosFiltrados = contratos.filter(c => {
    if (!busca) return true
    const termo = busca.toLowerCase()
    return (
      c.numero_contrato?.toLowerCase().includes(termo) ||
      c.fornecedor_nome?.toLowerCase().includes(termo) ||
      c.objeto?.toLowerCase().includes(termo) ||
      c.fiscal_nome?.toLowerCase().includes(termo)
    )
  })

  const pendentesAtesteFiltradas = pendentesAteste.filter(m => {
    if (!busca) return true
    const termo = busca.toLowerCase()
    return (
      m.numero_contrato?.toLowerCase().includes(termo) ||
      m.fornecedor_nome?.toLowerCase().includes(termo) ||
      m.objeto_contrato?.toLowerCase().includes(termo)
    )
  })

  const totalPendentesAteste = contratos.reduce((s, c) => s + c.pendentes_ateste, 0)
  const totalAguardandoAprovacao = contratos.reduce((s, c) => s + c.aguardando_aprovacao, 0)
  const totalAprovadas = contratos.reduce((s, c) => s + c.aprovadas, 0)
  const contratosNaoEnviaram = contratos.filter(c => c.enviou_mes === false)
  const totalSelecionadosSolicitar = Object.values(contratosSelecionados).filter(Boolean).length

  // Aguardando Fornecedor: contratos com solicitação enviada no mês e fornecedor ainda não enviou (usa solicitou_mes do backend)
  const contratosAguardandoFornecedor = contratos.filter(c => c.solicitou_mes && c.enviou_mes === false)
  const aguardandoFornecedor = contratosAguardandoFornecedor.length

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-blue-600" />
            Painel de Medições
          </h1>
          <p className="text-gray-500 mt-1">Acompanhe e ateste as medições de todos os contratos</p>
        </div>
        <Button variant="outline" onClick={carregarDados}>
          <Loader2 className="w-4 h-4 mr-2" /> Atualizar
        </Button>
      </div>

      {/* Cards de Status - Fluxo do Mockup */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={`border-l-4 border-amber-500 shadow-sm transition-shadow hover:shadow-md ${aguardandoFornecedor > 0 ? 'bg-amber-50/50' : ''}`}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 bg-amber-100 rounded-lg flex items-center justify-center">
                <Clock className="w-6 h-6 text-amber-600" />
              </div>
              <Badge className="bg-amber-100 text-amber-800 text-xs font-semibold">PENDENTE</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 mb-1">{aguardandoFornecedor}</div>
            <div className="text-sm text-gray-600">Aguardando Fornecedor</div>
            <p className="text-xs text-gray-500 mt-2">Medições solicitadas</p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 border-blue-500 shadow-sm transition-shadow hover:shadow-md ${totalPendentesAteste > 0 ? 'bg-blue-50/50' : ''}`}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <ClipboardCheck className="w-6 h-6 text-blue-600" />
              </div>
              <Badge className="bg-blue-100 text-blue-800 text-xs font-semibold">AÇÃO NECESSÁRIA</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 mb-1">{totalPendentesAteste}</div>
            <div className="text-sm text-gray-600">Aguardando Seu Ateste</div>
            <p className="text-xs text-gray-500 mt-2">Submetidas pelos fornecedores</p>
          </CardContent>
        </Card>

        <Card className={`border-l-4 border-purple-500 shadow-sm transition-shadow hover:shadow-md ${totalAguardandoAprovacao > 0 ? 'bg-purple-50/50' : ''}`}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-purple-600" />
              </div>
              <Badge className="bg-purple-100 text-purple-800 text-xs font-semibold">EM APROVAÇÃO</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 mb-1">{totalAguardandoAprovacao}</div>
            <div className="text-sm text-gray-600">Aguardando Aprovação</div>
            <p className="text-xs text-gray-500 mt-2">Atestadas, na Central de Aprovações</p>
          </CardContent>
        </Card>

        <Card className="border-l-4 border-green-500 shadow-sm transition-shadow hover:shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <Badge className="bg-green-100 text-green-800 text-xs font-semibold">CONCLUÍDO</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-gray-900 mb-1">{totalAprovadas}</div>
            <div className="text-sm text-gray-600">Aprovadas</div>
            <p className="text-xs text-gray-500 mt-2">Finalizadas no mês</p>
          </CardContent>
        </Card>
      </div>

      {/* Seletor de Competência (Mês de Referência) */}
      <div className="mb-6">
        <Label className="block text-sm font-medium text-gray-700 mb-3">Competência (Mês de Referência)</Label>
        <div className="flex gap-3 items-center">
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setMesReferencia(navegarMes(mesReferencia, -1))}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-w-[200px]">
            <div className="text-center">
              <div className="text-3xl md:text-4xl font-bold text-gray-900">{formatarMesNomeCompleto(mesReferencia).mes}</div>
              <div className="text-lg md:text-xl text-gray-600 mt-1">{formatarMesNomeCompleto(mesReferencia).ano}</div>
            </div>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0"
            onClick={() => setMesReferencia(navegarMes(mesReferencia, 1))}
          >
            <ChevronRight className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <Input
          className="pl-10"
          placeholder="Buscar por contrato, fornecedor, objeto ou fiscal..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
      </div>

      {/* ============ SEÇÃO: AGUARDANDO FORNECEDOR ============ */}
      {aguardandoFornecedor > 0 && (
        <Card className="border-amber-300 bg-amber-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-600" />
              Aguardando Fornecedor ({aguardandoFornecedor})
              <span className="text-xs font-normal text-gray-500 ml-2">Solicitação enviada, aguardando envio da medição</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {contratosAguardandoFornecedor
              .filter(c => !busca || [c.numero_contrato, c.fornecedor_nome, c.objeto].some(v => v?.toLowerCase().includes(busca.toLowerCase())))
              .map((c) => {
                const ultimaSolicitacao = historico
                  .filter(s => s.contrato_id === c.id && s.mes_referencia === mesReferencia)
                  .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0]
                const dataSolicitada = ultimaSolicitacao ? formatarData(ultimaSolicitacao.created_at) : '—'
                return (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 p-3 bg-white rounded-lg border hover:shadow-sm transition-shadow"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{c.numero_contrato}</span>
                        <span className="text-gray-400">-</span>
                        <span className="text-sm text-gray-600 truncate">{c.fornecedor_nome}</span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">Solicitada em {dataSolicitada}</div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={() => {
                        setSolicitarContrato(c)
                        setMensagemSolicitar('Lembramos que a medição ainda está pendente.')
                        setEnviarWhatsappIndividual(false)
                        setTelefoneWhatsappIndividual('')
                      }}
                      disabled={loadingSolicitar}
                    >
                      <Mail className="w-4 h-4 mr-1" />
                      Lembrar fornecedor
                    </Button>
                  </div>
                )
              })}
          </CardContent>
        </Card>
      )}

      {/* ============ SEÇÃO 1: PENDENTES DE ATESTE ============ */}
      {pendentesAtesteFiltradas.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
              Pendentes de Ateste ({pendentesAtesteFiltradas.length})
              <span className="text-xs font-normal text-gray-500 ml-2">Medições aguardando sua verificação</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 divide-y divide-gray-100">
            {pendentesAtesteFiltradas.map((med) => {
              const status = STATUS_MEDICAO[med.status] || { label: med.status, cor: 'bg-gray-100 text-gray-800' }
              // Timeline: 1=Solicitada, 2=Submetida, 3=Atestada, 4=Aprovada. Para pendentes ateste: etapa atual = 3
              const etapaAtual = 3
              const etapas = [
                { nome: 'Solicitada', idx: 1 },
                { nome: 'Submetida', idx: 2 },
                { nome: 'Atestada', idx: 3 },
                { nome: 'Aprovada', idx: 4 },
              ]
              return (
                <div key={med.id} className="pt-4 first:pt-0 hover:bg-gray-50/50 -mx-2 px-4 py-4 rounded-lg transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded">Med. #{String(med.numero_medicao).padStart(3, '0')}</span>
                        <span className="text-xs text-gray-400">•</span>
                        <span className="text-sm font-medium text-gray-900">Contrato {med.numero_contrato}</span>
                      </div>
                      <h4 className="text-base font-semibold text-gray-900 mb-1">{med.fornecedor_nome}</h4>
                      <p className="text-sm text-gray-600 mb-3">Competência: <span className="font-semibold">{formatarMesReferencia(typeof med.periodo_inicio === 'string' ? med.periodo_inicio.slice(0, 7) : med.periodo_inicio ? new Date(med.periodo_inicio).toISOString().slice(0, 7) : '')}</span></p>

                      {/* Timeline */}
                      <div className="flex items-center gap-1 sm:gap-2 mb-3 flex-wrap">
                        {etapas.map((e, i) => (
                          <div key={e.idx} className="flex items-center gap-1">
                            <div
                              className={`w-3 h-3 rounded-full flex-shrink-0 ${
                                e.idx < etapaAtual ? 'bg-green-500' : e.idx === etapaAtual ? 'bg-amber-500' : 'bg-gray-300'
                              }`}
                            />
                            <span className={`text-xs ${e.idx <= etapaAtual ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{e.nome}</span>
                            {i < etapas.length - 1 && <div className="w-4 sm:w-8 h-0.5 bg-gray-200 flex-shrink-0" />}
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-600 flex-wrap">
                        {med.data_solicitacao && <span>Solicitada: {formatarData(med.data_solicitacao)}</span>}
                        {med.data_solicitacao && <span>•</span>}
                        <span>Submetida: {formatarData(med.data_submissao)}</span>
                        {med.total_itens > 0 && (
                          <>
                            <span>•</span>
                            <span className={med.itens_atestados > 0 ? 'text-green-600 font-medium' : ''}>
                              {med.itens_atestados}/{med.total_itens} itens atestados
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <div className="text-xl font-bold text-gray-900">{formatarMoeda(med.valor_medido)}</div>
                      <div className="text-xs text-gray-500 mt-1">Valor da medição</div>
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          size="sm"
                          className={med.itens_atestados > 0 ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}
                          onClick={() => abrirModalAtesteDireto(med)}
                          disabled={loadingAteste}
                        >
                          {loadingAteste ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-1" />}
                          {med.itens_atestados > 0 ? 'Continuar Ateste' : 'Atestar Medição'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-400"
                          onClick={() => { const c = contratos.find(x => x.id === med.contrato_id); if (c) setContratoAberto(c) }}
                          title="Abrir contrato completo"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                    <Badge className={`${status.cor} text-xs`}>{status.label}</Badge>
                    <span className="text-xs text-gray-500">
                      {med.status === 'SUBMETIDA' ? 'Enviada pelo fornecedor, aguardando seu ateste' : 'Aguardando conclusão do ateste'}
                    </span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}

      {pendentesAteste.length === 0 && (
        <Card className="border-green-200 bg-green-50/30">
          <CardContent className="py-6 text-center">
            <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
            <p className="text-sm text-green-700 font-medium">Nenhuma medição pendente de ateste</p>
            <p className="text-xs text-gray-500 mt-1">Todas as medições estão em dia!</p>
          </CardContent>
        </Card>
      )}

      {/* ============ SEÇÃO 2: AGUARDANDO APROVAÇÃO (colapsável) ============ */}
      {pendentesAprovacao.length > 0 && (
        <Card>
          <button
            type="button"
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 rounded-lg transition-colors"
            onClick={() => setSecaoAprovacaoAberta(!secaoAprovacaoAberta)}
          >
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Aguardando Aprovação ({pendentesAprovacao.length})
              <span className="text-xs font-normal text-gray-500 ml-2">Atestadas pelo fiscal, na Central de Aprovações</span>
            </CardTitle>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${secaoAprovacaoAberta ? 'rotate-180' : ''}`} />
          </button>
          {secaoAprovacaoAberta && (
            <CardContent className="pt-0 border-t space-y-2">
              {pendentesAprovacao.map((med) => (
                <div
                  key={med.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-blue-50/30"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-blue-700">{med.numero_medicao}ª</span>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{med.numero_contrato}</span>
                        <span className="text-gray-400">-</span>
                        <span className="text-sm text-gray-600 truncate">{med.fornecedor_nome}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        <span>{formatarData(med.periodo_inicio)} a {formatarData(med.periodo_fim)}</span>
                        <span className="font-medium text-gray-700">{formatarMoeda(med.valor_medido)}</span>
                        {med.ateste_fiscal_nome && (
                          <span>Atestada por {med.ateste_fiscal_nome} em {formatarData(med.ateste_data)}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Badge className="bg-orange-100 text-orange-800 text-xs">Aguardando Aprovação</Badge>
                </div>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* ============ SEÇÃO: MEDIÇÕES DEVOLVIDAS (colapsável) ============ */}
      {devolvidas.length > 0 && (
        <Card>
          <button
            type="button"
            className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 rounded-lg transition-colors"
            onClick={() => setSecaoDevolvidasAberta(!secaoDevolvidasAberta)}
          >
            <CardTitle className="text-base flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-600" />
              Medições Devolvidas ({devolvidas.length})
              <span className="text-xs font-normal text-gray-500 ml-2">Devolvidas ao fornecedor para correção</span>
            </CardTitle>
            <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${secaoDevolvidasAberta ? 'rotate-180' : ''}`} />
          </button>
          {secaoDevolvidasAberta && (
            <CardContent className="pt-0 border-t space-y-2">
              {devolvidas
                .filter(m => !busca || [m.numero_contrato, m.fornecedor_nome, m.objeto_contrato].some(v => v?.toLowerCase().includes(busca.toLowerCase())))
                .map((med) => (
                  <div
                    key={med.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-amber-200 bg-amber-50/30"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs font-mono rounded">Med. #{String(med.numero_medicao).padStart(3, '0')}</span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-sm font-medium text-gray-900">Contrato {med.numero_contrato}</span>
                          <Badge className="bg-amber-100 text-amber-800 text-xs">Devolvida</Badge>
                        </div>
                        <div className="text-sm text-gray-600 truncate mb-0.5">{med.fornecedor_nome}</div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                          <span>{formatarData(med.periodo_inicio)} a {formatarData(med.periodo_fim)}</span>
                          <span className="font-medium text-gray-700">{formatarMoeda(med.valor_medido)}</span>
                        </div>
                        {med.motivo_devolucao && (
                          <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                            <strong>Devolvida:</strong> {med.motivo_devolucao}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { const c = contratos.find(x => x.id === med.contrato_id); if (c) setContratoAberto(c) }}
                      title="Abrir contrato para ver detalhes"
                    >
                      <Eye className="w-4 h-4 mr-1" /> Ver contrato
                    </Button>
                  </div>
                ))}
            </CardContent>
          )}
        </Card>
      )}

      {/* ============ SEÇÃO 3: SOLICITAR MEDIÇÕES DO MÊS ============ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-600" />
            Solicitar Nova Medição — {formatarMesNomeCompleto(mesReferencia).mes}/{formatarMesNomeCompleto(mesReferencia).ano}
            {contratosNaoEnviaram.length > 0 && (
              <Badge className="bg-amber-100 text-amber-800 text-xs ml-2">
                {contratosNaoEnviaram.length} pendente{contratosNaoEnviaram.length > 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800">
            Ao solicitar, você está pedindo que o fornecedor envie a planilha de medições e notas fiscais referentes aos serviços executados em {formatarMesNomeCompleto(mesReferencia).mes} de {formatarMesNomeCompleto(mesReferencia).ano}.
          </div>
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
                        <span className="text-gray-400 mx-2">-</span>
                        <span className="text-sm text-gray-600">{c.fornecedor_nome}</span>
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
                      id="wpp-lote"
                      checked={enviarWhatsappLote}
                      onChange={(e) => {
                        setEnviarWhatsappLote(e.target.checked)
                        if (e.target.checked) {
                          // Pré-preencher telefones com os cadastrados
                          const tels: Record<string, string> = {}
                          contratos.forEach(c => { if (c.fornecedor_telefone) tels[c.id] = c.fornecedor_telefone })
                          setTelefonesLote(tels)
                        } else {
                          setTelefonesLote({})
                        }
                      }}
                      className="w-4 h-4 rounded border-gray-300 text-green-600"
                    />
                    <label htmlFor="wpp-lote" className="flex items-center gap-1.5 text-sm cursor-pointer select-none">
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
                >
                  {loadingSolicitarLote ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                  Solicitar de Todos Pendentes ({contratosNaoEnviaram.length})
                </Button>
                <Button
                  variant="outline"
                  onClick={() => enviarSolicitacaoLote(false)}
                  disabled={loadingSolicitarLote || totalSelecionadosSolicitar === 0}
                >
                  <Send className="w-4 h-4 mr-2" />
                  Solicitar Selecionados ({totalSelecionadosSolicitar})
                </Button>
                <span className="text-xs text-gray-400">{contratos.length} contratos</span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ============ SEÇÃO 4: TABELA DE CONTRATOS ============ */}
      <Card>
        <button
          type="button"
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 rounded-lg transition-colors"
          onClick={() => setSecaoContratosAberta(!secaoContratosAberta)}
        >
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4 text-gray-500" />
            Contratos ({contratosFiltrados.length})
            <span className="text-xs font-normal text-gray-500 ml-2">Visão completa por contrato</span>
          </CardTitle>
          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${secaoContratosAberta ? 'rotate-180' : ''}`} />
        </button>
        {secaoContratosAberta && (
          <CardContent className="pt-0 border-t overflow-x-auto">
            {contratosFiltrados.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nenhum contrato encontrado</p>
              </div>
            ) : (
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>Contrato</TableHead>
                    <TableHead>Fornecedor</TableHead>
                    <TableHead>Nº Med.</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="w-[120px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contratosFiltrados.map((c) => {
                    const nums = c.numero_medicoes_mes?.length ? c.numero_medicoes_mes.map(n => `#${String(n).padStart(3, '0')}`).join(', ') : '—'
                    const valor = (c.valor_medicoes_mes ?? 0) > 0 ? formatarMoeda(c.valor_medicoes_mes!) : '—'
                    let statusLabel = 'Não solicitada'
                    let statusClass = 'bg-gray-100 text-gray-700'
                    if (c.solicitou_mes && !c.enviou_mes) {
                      statusLabel = 'Aguardando fornecedor'
                      statusClass = 'bg-amber-100 text-amber-800'
                    } else if (c.pendentes_ateste > 0) {
                      statusLabel = `${c.pendentes_ateste} pendente${c.pendentes_ateste > 1 ? 's' : ''}`
                      statusClass = 'bg-yellow-100 text-yellow-800'
                    } else if (c.aguardando_aprovacao > 0) {
                      statusLabel = 'Aguardando aprovação'
                      statusClass = 'bg-purple-100 text-purple-800'
                    } else if (c.aprovadas > 0) {
                      statusLabel = `${c.aprovadas} aprovada${c.aprovadas > 1 ? 's' : ''}`
                      statusClass = 'bg-green-100 text-green-800'
                    } else if (c.enviou_mes) {
                      statusLabel = 'Enviou'
                      statusClass = 'bg-green-100 text-green-800'
                    }
                    return (
                      <TableRow key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setContratoAberto(c)}>
                        <TableCell className="font-medium">{c.numero_contrato}</TableCell>
                        <TableCell className="max-w-[180px] truncate">{c.fornecedor_nome}</TableCell>
                        <TableCell className="font-mono text-xs">{nums}</TableCell>
                        <TableCell><Badge className={`${statusClass} text-xs`}>{statusLabel}</Badge></TableCell>
                        <TableCell className="text-right font-medium">{valor}</TableCell>
                        <TableCell>
                          {!c.solicitou_mes && !c.enviou_mes ? (
                            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); setSolicitarContrato(c) }}>
                              <Send className="w-4 h-4 mr-1" />
                              Solicitar
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={(e) => { e.stopPropagation(); setContratoAberto(c) }}>
                              <Eye className="w-4 h-4 mr-1" />
                              Ver detalhes
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        )}
      </Card>

      {/* ============ SEÇÃO 5: HISTÓRICO ============ */}
      <Card>
        <button
          type="button"
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50 rounded-lg transition-colors"
          onClick={() => setHistoricoAberto(!historicoAberto)}
        >
          <CardTitle className="text-base flex items-center gap-2">
            <History className="w-4 h-4 text-gray-500" />
            Histórico de solicitações enviadas
          </CardTitle>
          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${historicoAberto ? 'rotate-180' : ''}`} />
        </button>
        {historicoAberto && (
          <CardContent className="pt-0 border-t">
            {loadingHistorico ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : historico.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">Nenhuma solicitação enviada ainda.</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto mt-3">
                {historico.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-2 py-2 px-3 rounded-lg hover:bg-gray-50 border border-transparent hover:border-gray-200"
                  >
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-900">{s.numero_contrato}</span>
                      <span className="text-gray-500 mx-2">–</span>
                      <span className="text-sm text-gray-600">{s.fornecedor_nome}</span>
                      <span className="text-gray-400 text-sm ml-2">{formatarMesReferencia(s.mes_referencia)}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-gray-400">{formatarDataHoraBR(s.created_at)}</span>
                      <Button variant="ghost" size="sm" onClick={() => setMensagemDetalhe(s)}>
                        <Mail className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ============ FOOTER: Como funciona o fluxo? ============ */}
      <div className="bg-gradient-to-r from-gray-50 to-blue-50 rounded-xl p-6 border border-gray-200">
        <h4 className="font-semibold text-gray-900 mb-3">Como funciona o fluxo?</h4>
        <div className="grid md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="font-medium text-amber-700 mb-1">1. Solicitada</div>
            <p className="text-gray-600">Você solicita a medição ao fornecedor para a competência do mês</p>
          </div>
          <div>
            <div className="font-medium text-blue-700 mb-1">2. Submetida</div>
            <p className="text-gray-600">Fornecedor envia planilha de medições e notas fiscais</p>
          </div>
          <div>
            <div className="font-medium text-purple-700 mb-1">3. Atestada</div>
            <p className="text-gray-600">Você verifica e atesta os itens executados</p>
          </div>
          <div>
            <div className="font-medium text-green-700 mb-1">4. Aprovada</div>
            <p className="text-gray-600">Central de Aprovações finaliza o processo</p>
          </div>
        </div>
      </div>

      {/* ============ MODAL: ATESTE DIRETO ============ */}
      <Dialog open={!!modalAteste} onOpenChange={() => setModalAteste(null)}>
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
                              title={todosSelecionados ? 'Desmarcar todos' : 'Selecionar todos'}
                            />
                          )
                        })()}
                      </TableHead>
                      <TableHead className="text-xs font-bold">Item / Etapa</TableHead>
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
                        <TableRow key={item.id || idx} className={jaAtestado && selecionado ? 'bg-green-50/50' : selecionado ? 'bg-yellow-50/50' : ''}>
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
                            <p className="text-sm font-medium">{numero}. {descricao}</p>
                            {jaAtestado && selecionado && (
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
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {isItemCronograma
                              ? <span className="text-blue-700">
                                  {Number(item.quantidade_medida || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} {item.item_unidade || ''}
                                  {Number(item.quantidade_medida || 0) > 0 && Number(item.quantidade_medida || 0) < 1 && (item.item_unidade === 'MES' || item.item_unidade === 'MÊS') && (
                                    <span className="text-[10px] text-blue-500 ml-1">({Math.round(Number(item.quantidade_medida) * 30)}d)</span>
                                  )}
                                </span>
                              : <span>{Number(item.percentual_executado_atual || 0).toFixed(1)}%</span>
                            }
                          </TableCell>
                          <TableCell className="text-right text-sm font-medium">{formatarMoeda(item.valor_medido)}</TableCell>
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

              {/* Verificação in loco */}
              <div className="flex items-center gap-3 p-3 border rounded-lg">
                <input
                  type="checkbox"
                  id="verificado_in_loco_painel"
                  checked={formAteste.verificado_in_loco}
                  onChange={e => setFormAteste({ ...formAteste, verificado_in_loco: e.target.checked })}
                  className="w-4 h-4"
                />
                <label htmlFor="verificado_in_loco_painel" className="flex items-center gap-2 text-sm cursor-pointer">
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

              {/* Motivo devolução (quando parcial) */}
              {(() => {
                const itens = (modalAteste.itens || []) as any[]
                const novosAtestados = itens.filter((i: any) => !i.atestado && itensAteste[i.id]?.selecionado).length
                const jaAtestadosMantidos = itens.filter((i: any) => i.atestado && itensAteste[i.id]?.selecionado).length
                const todosSerao = jaAtestadosMantidos + novosAtestados === itens.length && itens.length > 0
                return (
                  <>
                    {!todosSerao && novosAtestados > 0 && (
                      <div className="space-y-2 p-3 border border-amber-200 rounded-lg bg-amber-50/50">
                        <Label className="text-amber-800">Motivo da devolução (itens não atestados) *</Label>
                        <Textarea
                          placeholder="Informe o motivo para devolver ao fornecedor..."
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
                          ? `Ao atestar ${novosAtestados} item(ns), a medição será encaminhada para aprovação.`
                          : itens.some((i: any) => i.atestado && !itensAteste[i.id]?.selecionado) && novosAtestados === 0
                            ? 'Desmarque os itens para cancelar o ateste.'
                            : `${novosAtestados} item(ns) selecionado(s). Informe o motivo e a medição será devolvida.`
                      }
                    </p>
                  </>
                )
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAteste(null)}>Cancelar</Button>
            {modalAteste && (
              <Button
                size="sm"
                className="gap-2 text-blue-700 border-blue-200 hover:bg-blue-50"
                onClick={async () => {
                  const resBoletim = await authFetch(`${API_URL}/api/contratos/medicoes/${modalAteste.id}/boletim-oficial`)
                  if (!resBoletim.ok) return

                  const boletim = await resBoletim.json()
                  if (!boletim?.pdf_url) return

                  const arquivoRes = await authFetch(`${API_URL}${boletim.pdf_url}`)
                  if (!arquivoRes.ok) return

                  const pdfBlob = await arquivoRes.blob()
                  const objectUrl = window.URL.createObjectURL(pdfBlob)
                  const link = document.createElement('a')
                  link.href = objectUrl
                  link.download = boletim.filename || `boletim_medicao_${modalAteste.id}.pdf`
                  document.body.appendChild(link)
                  link.click()
                  link.remove()
                  window.URL.revokeObjectURL(objectUrl)
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
              return (
                <Button
                  className="bg-yellow-600 hover:bg-yellow-700 text-white"
                  onClick={executarAteste}
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

      {/* ============ MODAL: CONTRATO com TabMedicao ============ */}
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
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ============ MODAL: Detalhe mensagem (histórico) ============ */}
      <Dialog open={!!mensagemDetalhe} onOpenChange={(open) => !open && setMensagemDetalhe(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              {mensagemDetalhe?.titulo}
            </DialogTitle>
          </DialogHeader>
          {mensagemDetalhe && (
            <div className="space-y-3 text-sm">
              <p><span className="text-gray-500">Contrato:</span> {mensagemDetalhe.numero_contrato} – {mensagemDetalhe.fornecedor_nome}</p>
              <p><span className="text-gray-500">Mês:</span> {formatarMesReferencia(mensagemDetalhe.mes_referencia)}</p>
              <p><span className="text-gray-500">Enviado por:</span> {mensagemDetalhe.solicitado_por_nome}</p>
              <p><span className="text-gray-500">Data:</span> {formatarDataHoraBR(mensagemDetalhe.created_at)}</p>
              <div className="pt-2 border-t">
                <p className="text-gray-500 mb-1">Mensagem:</p>
                <p className="whitespace-pre-wrap text-gray-800">{mensagemDetalhe.mensagem}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ MODAL: Solicitar individual (mantido) ============ */}
      <Dialog open={!!solicitarContrato} onOpenChange={(open) => { if (!open) { setSolicitarContrato(null); setEnviarWhatsappIndividual(false); setTelefoneWhatsappIndividual('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-600" />
              Solicitar envio de medição
            </DialogTitle>
          </DialogHeader>
          {solicitarContrato && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Contrato <strong>{solicitarContrato.numero_contrato}</strong> — {solicitarContrato.fornecedor_nome}
              </p>
              <div>
                <Label>Mês de referência</Label>
                <p className="text-sm font-medium text-gray-900 mt-1">{formatarMesReferencia(mesReferencia)}</p>
              </div>
              <div>
                <Label htmlFor="msg-solicitar">Mensagem ao fornecedor (opcional)</Label>
                <Textarea
                  id="msg-solicitar"
                  value={mensagemSolicitar}
                  onChange={(e) => setMensagemSolicitar(e.target.value)}
                  placeholder="Ex.: Precisamos da medição para fechamento do mês..."
                  className="mt-1 min-h-[80px]"
                  rows={3}
                />
              </div>

              {whatsappConfigurado && (
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={enviarWhatsappIndividual}
                      onChange={(e) => setEnviarWhatsappIndividual(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-green-600"
                    />
                    <MessageCircle className="w-4 h-4 text-green-600" />
                    <span className="text-sm font-medium text-gray-700">Notificar via WhatsApp</span>
                  </label>
                  {enviarWhatsappIndividual && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
                      <p className="text-xs font-medium text-gray-700">Número que receberá a mensagem:</p>
                      <input
                        type="tel"
                        value={telefoneWhatsappIndividual}
                        onChange={(e) => setTelefoneWhatsappIndividual(e.target.value)}
                        placeholder="Ex: 5577999999999"
                        className="w-full text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                      {!telefoneWhatsappIndividual.trim() && (
                        <p className="text-xs text-amber-600">⚠️ Informe o número manualmente (código país + DDD + número)</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {erroSolicitar && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{erroSolicitar}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => { setSolicitarContrato(null); setEnviarWhatsappIndividual(false); setTelefoneWhatsappIndividual('') }} disabled={loadingSolicitar}>
                  Cancelar
                </Button>
                <Button onClick={enviarSolicitacao} disabled={loadingSolicitar}>
                  {loadingSolicitar ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4 mr-1" />}
                  Enviar solicitação
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ MODAL: Monitoramento de envio WhatsApp em lote ============ */}
      <Dialog open={!!resultadoLote} onOpenChange={(open) => !open && setResultadoLote(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" />
              Resultado do envio — WhatsApp
            </DialogTitle>
            <DialogDescription>
              {resultadoLote && (() => {
                const ok = resultadoLote.filter(r => r.sucesso && r.whatsapp_tentado && r.whatsapp_telefone).length
                const semTel = resultadoLote.filter(r => r.sucesso && r.whatsapp_sem_telefone).length
                const erros = resultadoLote.filter(r => !r.sucesso).length
                return `${ok} enviado(s) via WhatsApp · ${semTel} sem telefone · ${erros} erro(s)`
              })()}
            </DialogDescription>
          </DialogHeader>

          {resultadoLote && (
            <div className="space-y-2 mt-2">
              {/* Resumo */}
              {(() => {
                const ok = resultadoLote.filter(r => r.sucesso && r.whatsapp_tentado && r.whatsapp_telefone).length
                const semTel = resultadoLote.filter(r => r.sucesso && r.whatsapp_sem_telefone).length
                const erros = resultadoLote.filter(r => !r.sucesso).length
                return (
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                      <div className="text-2xl font-bold text-green-700">{ok}</div>
                      <div className="text-xs text-green-600 mt-0.5">WhatsApp enviado</div>
                    </div>
                    <div className={`border rounded-lg p-3 text-center ${semTel > 0 ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className={`text-2xl font-bold ${semTel > 0 ? 'text-amber-700' : 'text-gray-400'}`}>{semTel}</div>
                      <div className={`text-xs mt-0.5 ${semTel > 0 ? 'text-amber-600' : 'text-gray-400'}`}>Sem telefone</div>
                    </div>
                    <div className={`border rounded-lg p-3 text-center ${erros > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                      <div className={`text-2xl font-bold ${erros > 0 ? 'text-red-700' : 'text-gray-400'}`}>{erros}</div>
                      <div className={`text-xs mt-0.5 ${erros > 0 ? 'text-red-600' : 'text-gray-400'}`}>Erro no envio</div>
                    </div>
                  </div>
                )
              })()}

              {/* Lista detalhada */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 grid grid-cols-[1fr_1.5fr_auto] gap-2">
                  <span>Contrato</span>
                  <span>Fornecedor</span>
                  <span>Status WhatsApp</span>
                </div>
                <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
                  {resultadoLote.map((r) => {
                    let statusIcon: ReactNode
                    let statusText: string
                    let rowBg: string

                    if (!r.sucesso) {
                      statusIcon = <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      statusText = r.erro || 'Erro'
                      rowBg = 'bg-red-50'
                    } else if (r.whatsapp_tentado && r.whatsapp_telefone) {
                      statusIcon = <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      statusText = r.whatsapp_telefone
                      rowBg = 'bg-white'
                    } else if (r.whatsapp_sem_telefone) {
                      statusIcon = <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      statusText = 'Sem telefone cadastrado'
                      rowBg = 'bg-amber-50'
                    } else {
                      statusIcon = <Mail className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      statusText = 'Solicitação enviada (sem WhatsApp)'
                      rowBg = 'bg-white'
                    }

                    return (
                      <div key={r.contrato_id} className={`grid grid-cols-[1fr_1.5fr_auto] gap-2 items-center px-3 py-2.5 text-xs ${rowBg}`}>
                        <span className="font-mono font-medium text-gray-800">{r.numero_contrato || r.contrato_id.slice(0, 8)}</span>
                        <span className="text-gray-600 truncate">{r.fornecedor_nome || '—'}</span>
                        <div className="flex items-center gap-1.5 justify-end">
                          {statusIcon}
                          <span className={`truncate max-w-[160px] ${!r.sucesso ? 'text-red-600' : r.whatsapp_sem_telefone ? 'text-amber-600' : 'text-gray-600'}`}>
                            {statusText}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {resultadoLote.some(r => r.whatsapp_sem_telefone) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-700">
                  <strong>Dica:</strong> Para os fornecedores sem telefone, acesse o cadastro do fornecedor e adicione o número de WhatsApp para os próximos envios.
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setResultadoLote(null)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
