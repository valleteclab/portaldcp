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
import {
  Plus, Loader2, TrendingUp, CheckCircle, XCircle, Send, Pencil, Trash2, BarChart3,
  FileText, AlertTriangle, Calendar, MapPin, ExternalLink, ClipboardCheck, RotateCcw,
  ChevronRight, Eye, Clock, Shield,
} from 'lucide-react'
import Link from 'next/link'
import { API_URL, authFetch } from '@/lib/api'

interface OSRequisicao {
  id: string
  numero: string
  status: string
  descricao_os: string
  local_execucao: string
  data_solicitacao: string
  data_autorizacao: string
  data_inicio_prevista: string
  data_fim_prevista: string
  prazo_execucao_dias: number
  responsavel_tecnico: string
  fiscal_contrato_nome: string
  usuario_solicitante_nome: string
  usuario_autorizador_nome: string
  justificativa: string
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
}

const STATUS_OS: Record<string, { label: string; cor: string }> = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-gray-100 text-gray-800' },
  AGUARDANDO_AUTORIZACAO: { label: 'Aguardando Autorização', cor: 'bg-amber-100 text-amber-800' },
  AUTORIZADA: { label: 'Autorizada', cor: 'bg-blue-100 text-blue-800' },
  ORDEM_GERADA: { label: 'Em Execução', cor: 'bg-indigo-100 text-indigo-800' },
  ATENDIDA: { label: 'Concluída', cor: 'bg-green-100 text-green-800' },
  NEGADA: { label: 'Negada', cor: 'bg-red-100 text-red-800' },
  CANCELADA: { label: 'Cancelada', cor: 'bg-red-100 text-red-800' },
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

export default function TabMedicao({ contratoId, valorGlobal }: { contratoId: string; valorGlobal: number }) {
  const [etapas, setEtapas] = useState<Etapa[]>([])
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
  const [modalMedicao, setModalMedicao] = useState(false)
  const [modalAteste, setModalAteste] = useState<Medicao | null>(null)
  const [modalDevolver, setModalDevolver] = useState<Medicao | null>(null)
  const [modalDetalhe, setModalDetalhe] = useState<Medicao | null>(null)

  // Forms
  const [formEtapa, setFormEtapa] = useState({
    descricao: '', percentual_fisico: '', valor_previsto: '',
    data_inicio_prevista: '', data_fim_prevista: '', observacoes: '',
  })
  const [formMedicao, setFormMedicao] = useState({
    periodo_inicio: '', periodo_fim: '', observacoes: '',
    itens: [] as { etapa_id: string; percentual_executado_atual: number }[],
  })
  const [formAteste, setFormAteste] = useState({ observacoes: '', verificado_in_loco: false })
  const [motivoDevolucao, setMotivoDevolucao] = useState('')

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [resEtapas, resMedicoes, resResumo] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/${contratoId}/etapas`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/medicoes`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/medicoes/resumo`),
      ])
      if (resEtapas.ok) setEtapas(await resEtapas.json())
      if (resMedicoes.ok) setMedicoes(await resMedicoes.json())
      if (resResumo.ok) setResumo(await resResumo.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [contratoId])

  useEffect(() => { carregarDados() }, [carregarDados])

  const osAtiva = resumo?.os_ativa
  const temOSAutorizada = osAtiva && ['AUTORIZADA', 'ORDEM_GERADA'].includes(osAtiva.status)

  // Medições separadas por status
  const medicoesPendentesAteste = medicoes.filter(m => m.status === 'SUBMETIDA')
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

  // ============ MEDIÇÕES — Criação interna (fiscal) ============

  const abrirModalMedicao = () => {
    setFormMedicao({
      periodo_inicio: '', periodo_fim: '', observacoes: '',
      itens: etapas.filter(e => e.status !== 'CONCLUIDA').map(e => ({
        etapa_id: e.id, percentual_executado_atual: 0,
      })),
    })
    setModalMedicao(true)
  }

  const salvarMedicao = async () => {
    setActionLoading(true)
    try {
      const payload = {
        periodo_inicio: formMedicao.periodo_inicio,
        periodo_fim: formMedicao.periodo_fim,
        observacoes: formMedicao.observacoes || null,
        itens: formMedicao.itens.filter(i => i.percentual_executado_atual > 0),
      }
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/medicoes`, {
        method: 'POST', body: JSON.stringify(payload),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalMedicao(false)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
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

  const atestarMedicao = async () => {
    if (!modalAteste) return
    setActionLoading(true)
    try {
      const usuario = JSON.parse(localStorage.getItem('usuario') || '{}')
      const res = await authFetch(`${API_URL}/api/contratos/medicoes/${modalAteste.id}/atestar`, {
        method: 'PATCH', body: JSON.stringify({
          fiscal_id: usuario.id || '',
          fiscal_nome: usuario.nome || 'Fiscal',
          observacoes: formAteste.observacoes || null,
          verificado_in_loco: formAteste.verificado_in_loco,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalAteste(null)
      setFormAteste({ observacoes: '', verificado_in_loco: false })
      carregarDados()
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
      {/* Ordem de Serviço */}
      <Card className={!osAtiva ? 'border-amber-300 bg-amber-50/30' : osAtiva.status === 'ORDEM_GERADA' ? 'border-indigo-300' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Ordem de Serviço</CardTitle>
          <CardDescription>A OS autoriza o início da execução da obra. Sem OS, não é possível registrar medições.</CardDescription>
        </CardHeader>
        <CardContent>
          {!osAtiva ? (
            <Link href="/orgao/almoxarifado/requisicoes/nova" className="block">
              <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 hover:border-amber-300 transition-colors cursor-pointer">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
                <div className="flex-1">
                  <p className="font-medium text-amber-700">Nenhuma Ordem de Serviço ativa</p>
                  <p className="text-sm text-amber-600">
                    Clique aqui para criar uma OS na página de Requisições e liberar o cadastro de etapas e medições.
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
                <span className="font-bold text-lg">{osAtiva.numero}</span>
              </div>
              <p className="text-sm text-gray-700">{osAtiva.descricao_os || osAtiva.justificativa}</p>
              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                {osAtiva.data_solicitacao && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Solicitação: {osAtiva.data_solicitacao.split('T')[0]}</span>}
                {osAtiva.data_autorizacao && <span>Autorizada: {osAtiva.data_autorizacao.split('T')[0]}</span>}
                {osAtiva.usuario_autorizador_nome && <span>Por: {osAtiva.usuario_autorizador_nome}</span>}
                {osAtiva.local_execucao && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{osAtiva.local_execucao}</span>}
                {osAtiva.responsavel_tecnico && <span>Resp. Técnico: {osAtiva.responsavel_tecnico}</span>}
                {osAtiva.fiscal_contrato_nome && <span>Fiscal: {osAtiva.fiscal_contrato_nome}</span>}
                {osAtiva.prazo_execucao_dias && <span>Prazo: {osAtiva.prazo_execucao_dias} dias</span>}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Resumo */}
      {resumo && temOSAutorizada && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <p className="text-xl font-bold text-green-600">{formatarMoeda(resumo.saldo_disponivel)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Avanço Físico</p>
              <p className="text-xl font-bold">{resumo.percentual_fisico_total.toFixed(1)}%</p>
              <Progress value={resumo.percentual_fisico_total} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Etapas</p>
              <p className="text-xl font-bold">{resumo.etapas_concluidas}/{resumo.total_etapas}</p>
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
                    {m.fornecedor_nome && <span className="text-xs text-gray-500">por {m.fornecedor_nome}</span>}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{formatarData(m.periodo_inicio)} a {formatarData(m.periodo_fim)}</span>
                    <span className="font-medium text-gray-700">{formatarMoeda(m.valor_medido)}</span>
                    <span>{Number(m.percentual_fisico_medido).toFixed(1)}% físico</span>
                    {m.nota_fiscal_numero && <span className="text-xs">NF: {m.nota_fiscal_numero}</span>}
                  </div>
                  {m.fornecedor_observacoes && (
                    <p className="text-xs text-gray-500 mt-1 italic">"{m.fornecedor_observacoes}"</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => setModalDetalhe(m)}>
                    <Eye className="w-3 h-3 mr-1" />Ver
                  </Button>
                  <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={() => { setModalAteste(m); setFormAteste({ observacoes: '', verificado_in_loco: false }) }}>
                    <ClipboardCheck className="w-3 h-3 mr-1" />Atestar
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

      {/* Etapas do Cronograma */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />Cronograma Físico-Financeiro</CardTitle>
              <CardDescription>Etapas da obra/serviço com percentual e valor previsto</CardDescription>
            </div>
            <Button onClick={() => abrirModalEtapa()} size="sm" disabled={!temOSAutorizada}><Plus className="w-4 h-4 mr-1" />Nova Etapa</Button>
          </div>
        </CardHeader>
        <CardContent>
          {etapas.length === 0 ? (
            <div className="text-center py-8">
              <BarChart3 className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Nenhuma etapa cadastrada.</p>
              <p className="text-sm text-gray-400">Cadastre as etapas do cronograma para iniciar as medições.</p>
            </div>
          ) : (
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
          )}
        </CardContent>
      </Card>

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
            <Button onClick={abrirModalMedicao} size="sm" disabled={etapas.length === 0 || !temOSAutorizada}>
              <Plus className="w-4 h-4 mr-1" />Nova Medição (Fiscal)
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
                      {m.status === 'SUBMETIDA' && (
                        <>
                          <Button size="sm" className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={() => { setModalAteste(m); setFormAteste({ observacoes: '', verificado_in_loco: false }) }}>
                            <ClipboardCheck className="w-3.5 h-3.5 mr-1" />Atestar
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
                      <Button variant="ghost" size="sm" onClick={() => setModalDetalhe(m)}>
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

      {/* Modal Nova Medição (criação interna pelo fiscal) */}
      <Dialog open={modalMedicao} onOpenChange={setModalMedicao}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova Medição (Fiscal)</DialogTitle>
            <DialogDescription>Crie uma medição internamente. Ela será enviada diretamente para aprovação do gestor.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Período Início *</Label>
                <Input type="date" value={formMedicao.periodo_inicio} onChange={e => setFormMedicao({ ...formMedicao, periodo_inicio: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Período Fim *</Label>
                <Input type="date" value={formMedicao.periodo_fim} onChange={e => setFormMedicao({ ...formMedicao, periodo_fim: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Etapas — Informe o % executado neste período</Label>
              <div className="border rounded-lg divide-y">
                {formMedicao.itens.map((item, idx) => {
                  const etapa = etapas.find(e => e.id === item.etapa_id)
                  if (!etapa) return null
                  return (
                    <div key={item.etapa_id} className="flex items-center gap-4 p-3">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{etapa.numero_etapa}. {etapa.descricao}</p>
                        <p className="text-xs text-gray-400">
                          Executado: {Number(etapa.percentual_executado).toFixed(1)}% | Valor: {formatarMoeda(etapa.valor_previsto)}
                        </p>
                      </div>
                      <div className="w-28">
                        <Input
                          type="number" step="0.01" min="0" max={100 - Number(etapa.percentual_executado)}
                          placeholder="0" className="text-center"
                          value={item.percentual_executado_atual || ''}
                          onChange={e => {
                            const itens = [...formMedicao.itens]
                            itens[idx] = { ...itens[idx], percentual_executado_atual: parseFloat(e.target.value) || 0 }
                            setFormMedicao({ ...formMedicao, itens })
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-6">%</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Observações da medição" value={formMedicao.observacoes} onChange={e => setFormMedicao({ ...formMedicao, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalMedicao(false)}>Cancelar</Button>
            <Button onClick={salvarMedicao} disabled={actionLoading || !formMedicao.periodo_inicio || !formMedicao.periodo_fim}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar Medição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Ateste do Fiscal */}
      <Dialog open={!!modalAteste} onOpenChange={() => setModalAteste(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-yellow-600" />
              Atestar {modalAteste?.numero_medicao}ª Medição
            </DialogTitle>
            <DialogDescription>
              Valor medido: {modalAteste && formatarMoeda(modalAteste.valor_medido)} — {modalAteste && Number(modalAteste.percentual_fisico_medido).toFixed(1)}% físico
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
            <div className="space-y-2">
              <Label>Observações do Ateste</Label>
              <Textarea
                placeholder="Observações sobre a verificação técnica..."
                value={formAteste.observacoes}
                onChange={e => setFormAteste({ ...formAteste, observacoes: e.target.value })}
                rows={3}
              />
            </div>
            <p className="text-xs text-gray-500">
              Ao atestar, a medição será encaminhada para aprovação do gestor na Central de Aprovações.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAteste(null)}>Cancelar</Button>
            <Button className="bg-yellow-600 hover:bg-yellow-700 text-white" onClick={atestarMedicao} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              <ClipboardCheck className="w-4 h-4 mr-2" />
              Atestar Medição
            </Button>
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

      {/* Modal Detalhe da Medição */}
      <Dialog open={!!modalDetalhe} onOpenChange={() => setModalDetalhe(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
