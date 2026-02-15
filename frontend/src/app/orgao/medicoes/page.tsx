'use client'

import { useState, useEffect, useCallback } from 'react'
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
  Loader2, AlertTriangle, ChevronRight, CheckCircle, Clock,
  Send, XCircle, Calendar, History, Mail, Eye, Shield, RotateCcw, ChevronDown,
} from 'lucide-react'
import { authFetch } from '@/lib/api'
import TabMedicao from '@/components/contratos/TabMedicao'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// ============ INTERFACES ============

interface ContratoResumo {
  id: string
  numero_contrato: string
  objeto: string
  fornecedor_nome: string
  fornecedor_cnpj: string
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
  medicao_id?: string | null
  numero_medicao?: number | null
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
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [mesReferencia, setMesReferencia] = useState(mesAnteriorYYYYMM)

  // Seções colapsáveis
  const [secaoAprovacaoAberta, setSecaoAprovacaoAberta] = useState(false)
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

  // Solicitar individual (mantido)
  const [solicitarContrato, setSolicitarContrato] = useState<ContratoResumo | null>(null)
  const [mensagemSolicitar, setMensagemSolicitar] = useState('')
  const [loadingSolicitar, setLoadingSolicitar] = useState(false)
  const [erroSolicitar, setErroSolicitar] = useState<string | null>(null)

  // Histórico
  const [historico, setHistorico] = useState<SolicitacaoEnviada[]>([])
  const [loadingHistorico, setLoadingHistorico] = useState(false)
  const [mensagemDetalhe, setMensagemDetalhe] = useState<SolicitacaoEnviada | null>(null)

  // ============ FETCH DE DADOS ============

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const orgao = JSON.parse(localStorage.getItem('orgao') || '{}')
      const orgaoId = orgao.id
      if (!orgaoId) return

      const [resContratos, resPendentes, resAprovacao] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/medicoes/resumo-fiscal?orgaoId=${orgaoId}&mes=${mesReferencia}`),
        authFetch(`${API_URL}/api/contratos/medicoes/pendentes-ateste?orgaoId=${orgaoId}`),
        authFetch(`${API_URL}/api/contratos/medicoes/pendentes-aprovacao?orgaoId=${orgaoId}`),
      ])

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

      const res = await authFetch(`${API_URL}/api/contratos/medicoes/solicitar-lote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contrato_ids: ids,
          mes_referencia: mesReferencia,
          mensagem: mensagemLote.trim() || undefined,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); setLoadingSolicitarLote(false); return }
      const resultado = await res.json()
      alert(resultado.message)
      setMensagemLote('')
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
        body: JSON.stringify({ mes_referencia: mesReferencia, mensagem: mensagemSolicitar.trim() || undefined }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || `Erro ${res.status}`)
      }
      setSolicitarContrato(null)
      setMensagemSolicitar('')
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
  const totalMedicoes = contratos.reduce((s, c) => s + c.total_medicoes, 0)
  const contratosNaoEnviaram = contratos.filter(c => c.enviou_mes === false)
  const totalSelecionadosSolicitar = Object.values(contratosSelecionados).filter(Boolean).length

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

      {/* Cards Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className={totalPendentesAteste > 0 ? 'border-yellow-300 bg-yellow-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-500" />
              Pendentes de Ateste
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-700">{totalPendentesAteste}</div>
            <p className="text-xs text-gray-500 mt-1">Medições aguardando verificação do fiscal</p>
          </CardContent>
        </Card>

        <Card className={totalAguardandoAprovacao > 0 ? 'border-blue-300 bg-blue-50' : ''}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <Clock className="w-4 h-4 text-blue-500" />
              Aguardando Aprovação
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{totalAguardandoAprovacao}</div>
            <p className="text-xs text-gray-500 mt-1">Atestadas, na Central de Aprovações</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Aprovadas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-700">{totalAprovadas}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-gray-500" />
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-700">{totalMedicoes}</div>
            <p className="text-xs text-gray-500 mt-1">{contratos.length} contratos</p>
          </CardContent>
        </Card>
      </div>

      {/* Mês de referência e Busca */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="mes-ref" className="text-sm text-gray-600 flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            Mês de referência
          </Label>
          <Input
            id="mes-ref"
            type="month"
            value={mesReferencia}
            onChange={(e) => setMesReferencia(e.target.value)}
            className="w-[140px]"
          />
          <span className="text-sm text-gray-500">{formatarMesReferencia(mesReferencia)}</span>
        </div>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            className="pl-10"
            placeholder="Buscar por contrato, fornecedor, objeto ou fiscal..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

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
          <CardContent className="space-y-2">
            {pendentesAtesteFiltradas.map((med) => {
              const status = STATUS_MEDICAO[med.status] || { label: med.status, cor: 'bg-gray-100 text-gray-800' }
              return (
                <div
                  key={med.id}
                  className="flex items-center justify-between gap-3 p-3 bg-white rounded-lg border hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center">
                      <span className="text-sm font-bold text-yellow-700">{med.numero_medicao}ª</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 text-sm">{med.numero_contrato}</span>
                        <span className="text-gray-400">-</span>
                        <span className="text-sm text-gray-600 truncate">{med.fornecedor_nome}</span>
                        <Badge className={`${status.cor} text-xs`}>{status.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500">
                        <span>{formatarData(med.periodo_inicio)} a {formatarData(med.periodo_fim)}</span>
                        <span className="font-medium text-gray-700">{formatarMoeda(med.valor_medido)}</span>
                        {med.total_itens > 0 && (
                          <span className={med.itens_atestados > 0 ? 'text-green-600 font-medium' : ''}>
                            {med.itens_atestados}/{med.total_itens} itens atestados
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      size="sm"
                      className="bg-yellow-600 hover:bg-yellow-700 text-white"
                      onClick={() => abrirModalAtesteDireto(med)}
                      disabled={loadingAteste}
                    >
                      {loadingAteste ? <Loader2 className="w-4 h-4 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-1" />}
                      {med.itens_atestados > 0 ? 'Continuar Ateste' : 'Atestar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-gray-400"
                      onClick={() => {
                        const contrato = contratos.find(c => c.id === med.contrato_id)
                        if (contrato) setContratoAberto(contrato)
                      }}
                      title="Abrir contrato completo"
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
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

      {/* ============ SEÇÃO 3: SOLICITAR MEDIÇÕES DO MÊS ============ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Send className="w-5 h-5 text-blue-600" />
            Solicitar Medições — {formatarMesReferencia(mesReferencia)}
            {contratosNaoEnviaram.length > 0 && (
              <Badge className="bg-amber-100 text-amber-800 text-xs ml-2">
                {contratosNaoEnviaram.length} pendente{contratosNaoEnviaram.length > 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
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

      {/* ============ SEÇÃO 4: CONTRATOS (colapsável) ============ */}
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
          <CardContent className="pt-0 border-t">
            {contratosFiltrados.length === 0 ? (
              <div className="py-8 text-center">
                <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nenhum contrato encontrado</p>
              </div>
            ) : (
              <div className="space-y-2 mt-3">
                {contratosFiltrados.map((contrato) => (
                  <div
                    key={contrato.id}
                    className={`flex items-center justify-between gap-3 p-3 rounded-lg border hover:shadow-sm transition-shadow cursor-pointer ${
                      contrato.pendentes_ateste > 0 ? 'border-l-4 border-l-yellow-400' : ''
                    }`}
                    onClick={() => setContratoAberto(contrato)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-gray-400" />
                        <span className="font-bold text-gray-900 text-sm">{contrato.numero_contrato}</span>
                        <span className="text-sm text-gray-600 truncate">{contrato.fornecedor_nome}</span>
                      </div>
                      <p className="text-xs text-gray-500 ml-6 line-clamp-1 mt-0.5">{contrato.objeto}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {contrato.submetidas > 0 && <Badge className="bg-yellow-100 text-yellow-800 text-xs">{contrato.submetidas} submetida{contrato.submetidas > 1 ? 's' : ''}</Badge>}
                      {contrato.parcialmente_atestadas > 0 && <Badge className="bg-amber-100 text-amber-800 text-xs">{contrato.parcialmente_atestadas} parcial</Badge>}
                      {contrato.aguardando_aprovacao > 0 && <Badge className="bg-blue-100 text-blue-800 text-xs">{contrato.aguardando_aprovacao} aprovação</Badge>}
                      {contrato.aprovadas > 0 && <Badge className="bg-green-100 text-green-800 text-xs">{contrato.aprovadas} aprovada{contrato.aprovadas > 1 ? 's' : ''}</Badge>}
                      {contrato.total_medicoes === 0 && <Badge variant="outline" className="text-xs text-gray-400">Sem medições</Badge>}
                      <ChevronRight className="w-4 h-4 text-gray-300" />
                    </div>
                  </div>
                ))}
              </div>
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
                      <span className="text-xs text-gray-400">{new Date(s.created_at).toLocaleString('pt-BR')}</span>
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
                      <TableHead className="text-xs font-bold">Etapa</TableHead>
                      <TableHead className="text-xs font-bold text-center w-16">% Med.</TableHead>
                      <TableHead className="text-xs font-bold text-right w-24">Valor</TableHead>
                      <TableHead className="text-xs font-bold w-10">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(modalAteste.itens || []).map((item: any, idx: number) => {
                      const jaAtestado = !!item.atestado
                      const selecionado = itensAteste[item.id]?.selecionado || false
                      const podeEditarAteste = ['SUBMETIDA', 'PARCIALMENTE_ATESTADA'].includes(modalAteste.status || '')
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
                            <p className="text-sm font-medium">{item.etapa_numero || idx + 1}. {item.etapa_descricao || `Etapa ${idx + 1}`}</p>
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
                          <TableCell className="text-center text-sm">{Number(item.percentual_executado_atual || 0).toFixed(1)}%</TableCell>
                          <TableCell className="text-right text-sm">{formatarMoeda(item.valor_medido)}</TableCell>
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
              <p><span className="text-gray-500">Data:</span> {new Date(mensagemDetalhe.created_at).toLocaleString('pt-BR')}</p>
              <div className="pt-2 border-t">
                <p className="text-gray-500 mb-1">Mensagem:</p>
                <p className="whitespace-pre-wrap text-gray-800">{mensagemDetalhe.mensagem}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ============ MODAL: Solicitar individual (mantido) ============ */}
      <Dialog open={!!solicitarContrato} onOpenChange={(open) => !open && setSolicitarContrato(null)}>
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
              {erroSolicitar && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{erroSolicitar}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSolicitarContrato(null)} disabled={loadingSolicitar}>
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
    </div>
  )
}
