'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Plus, Loader2, Package, Play, CheckCircle, XCircle, Send, Pencil, Trash2,
  BarChart3, AlertTriangle, Clock, Database,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface BancoMetricas {
  id: string
  metrica: string
  descricao: string
  quantidade_total: number
  quantidade_consumida: number
  quantidade_reservada: number
  saldo: number
  valor_unitario: number
}

interface OrdemServico {
  id: string
  numero_os: string
  sequencial: number
  descricao: string
  escopo_detalhado: string
  metrica: string
  quantidade_metrica: number
  valor_unitario_metrica: number
  valor_total: number
  data_abertura: string
  data_prazo: string
  data_entrega: string
  data_aceite: string
  responsavel_tecnico: string
  fiscal_nome: string
  nota_qualidade: number | null
  parecer_aceite: string
  sla_dias: number
  sla_excedido: boolean
  status: string
  observacoes: string
  numero_empenho?: string
}

interface EmpenhoFator {
  numero_liquidacao: string
  data: string
  fase: string
  credor: string
  cnpj: string
  valor: number
  valor_formatado: string
  bem_servico: string
  numero_contrato: string
  numero_processo: string
  modalidade: string
  elemento_despesa: string
}

interface ResumoOS {
  valor_global: number
  total_os: number
  os_aceitas: number
  os_em_andamento: number
  os_canceladas: number
  valor_aceito: number
  valor_em_execucao: number
  saldo_valor: number
  media_qualidade: number | null
  sla_excedido: number
  banco_metricas: { metrica: string; descricao: string; total: number; consumido: number; reservado: number; saldo: number }[]
}

const STATUS_OS: Record<string, { label: string; cor: string }> = {
  ABERTA: { label: 'Aberta', cor: 'bg-blue-100 text-blue-800' },
  EM_EXECUCAO: { label: 'Em Execução', cor: 'bg-indigo-100 text-indigo-800' },
  ENTREGUE: { label: 'Entregue', cor: 'bg-amber-100 text-amber-800' },
  EM_ACEITE: { label: 'Em Aceite', cor: 'bg-purple-100 text-purple-800' },
  ACEITA: { label: 'Aceita', cor: 'bg-green-100 text-green-800' },
  REJEITADA: { label: 'Rejeitada', cor: 'bg-red-100 text-red-800' },
  CANCELADA: { label: 'Cancelada', cor: 'bg-gray-100 text-gray-800' },
}

const METRICAS = [
  { value: 'UST', label: 'UST (Unidade de Serviço Técnico)' },
  { value: 'HORA', label: 'Hora Técnica' },
  { value: 'PONTO_FUNCAO', label: 'Ponto de Função' },
  { value: 'DEMANDA_FIXA', label: 'Demanda Fixa' },
  { value: 'UNIDADE', label: 'Unidade' },
]

function formatarMoeda(v: number | string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function TabOrdensServico({ contratoId, valorGlobal }: { contratoId: string; valorGlobal: number }) {
  const [bancos, setBancos] = useState<BancoMetricas[]>([])
  const [ordens, setOrdens] = useState<OrdemServico[]>([])
  const [resumo, setResumo] = useState<ResumoOS | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  const [modalBanco, setModalBanco] = useState(false)
  const [editandoBanco, setEditandoBanco] = useState<BancoMetricas | null>(null)
  const [modalOS, setModalOS] = useState(false)
  const [modalAceitar, setModalAceitar] = useState<OrdemServico | null>(null)
  const [modalRejeitar, setModalRejeitar] = useState<OrdemServico | null>(null)
  const [modalCancelar, setModalCancelar] = useState<OrdemServico | null>(null)

  const [formBanco, setFormBanco] = useState({
    metrica: 'UST', descricao: '', quantidade_total: '', valor_unitario: '',
  })
  const [formOS, setFormOS] = useState({
    descricao: '', escopo_detalhado: '', metrica: 'UST',
    quantidade_metrica: '', valor_unitario_metrica: '',
    data_abertura: '', data_prazo: '', sla_dias: '',
    responsavel_tecnico: '', criterios_aceite: '', observacoes: '',
    numero_empenho: '',
  })
  const [empenhos, setEmpenhos] = useState<EmpenhoFator[]>([])
  const [loadingEmpenhos, setLoadingEmpenhos] = useState(false)
  const [formAceite, setFormAceite] = useState({ nota_qualidade: '', parecer_aceite: '' })
  const [observacaoCancelar, setObservacaoCancelar] = useState('')
  const [parecerRejeicao, setParecerRejeicao] = useState('')

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [resBancos, resOrdens, resResumo] = await Promise.all([
        authFetch(`${API_URL}/api/contratos/${contratoId}/banco-metricas`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/ordens-servico`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/ordens-servico/resumo`),
      ])
      if (resBancos.ok) setBancos(await resBancos.json())
      if (resOrdens.ok) setOrdens(await resOrdens.json())
      if (resResumo.ok) setResumo(await resResumo.json())
    } catch (e) { console.error(e) }
    setLoading(false)
  }, [contratoId])

  useEffect(() => { carregarDados() }, [carregarDados])

  // ============ BANCO DE MÉTRICAS ============

  const abrirModalBanco = (banco?: BancoMetricas) => {
    if (banco) {
      setEditandoBanco(banco)
      setFormBanco({
        metrica: banco.metrica, descricao: banco.descricao || '',
        quantidade_total: banco.quantidade_total.toString(), valor_unitario: banco.valor_unitario.toString(),
      })
    } else {
      setEditandoBanco(null)
      setFormBanco({ metrica: 'UST', descricao: '', quantidade_total: '', valor_unitario: '' })
    }
    setModalBanco(true)
  }

  const salvarBanco = async () => {
    setActionLoading(true)
    try {
      const payload = {
        metrica: formBanco.metrica,
        descricao: formBanco.descricao || null,
        quantidade_total: parseFloat(formBanco.quantidade_total),
        valor_unitario: parseFloat(formBanco.valor_unitario),
      }
      const url = editandoBanco
        ? `${API_URL}/api/contratos/banco-metricas/${editandoBanco.id}`
        : `${API_URL}/api/contratos/${contratoId}/banco-metricas`
      const method = editandoBanco ? 'PUT' : 'POST'
      const res = await authFetch(url, { method, body: JSON.stringify(payload) })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalBanco(false)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  // ============ ORDENS DE SERVIÇO ============

  const abrirModalOS = async () => {
    const hoje = new Date().toISOString().split('T')[0]
    setFormOS({
      descricao: '', escopo_detalhado: '', metrica: bancos.length > 0 ? bancos[0].metrica : 'UST',
      quantidade_metrica: '', valor_unitario_metrica: bancos.length > 0 ? bancos[0].valor_unitario.toString() : '',
      data_abertura: hoje, data_prazo: '', sla_dias: '',
      responsavel_tecnico: '', criterios_aceite: '', observacoes: '',
      numero_empenho: '',
    })
    setModalOS(true)
    setLoadingEmpenhos(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/empenhos`)
      if (res.ok) setEmpenhos(await res.json())
      else setEmpenhos([])
    } catch { setEmpenhos([]) }
    setLoadingEmpenhos(false)
  }

  const criarOS = async () => {
    setActionLoading(true)
    try {
      const payload = {
        descricao: formOS.descricao,
        escopo_detalhado: formOS.escopo_detalhado || null,
        metrica: formOS.metrica,
        quantidade_metrica: parseFloat(formOS.quantidade_metrica),
        valor_unitario_metrica: parseFloat(formOS.valor_unitario_metrica),
        data_abertura: formOS.data_abertura,
        data_prazo: formOS.data_prazo,
        sla_dias: formOS.sla_dias ? parseInt(formOS.sla_dias) : null,
        responsavel_tecnico: formOS.responsavel_tecnico || null,
        criterios_aceite: formOS.criterios_aceite || null,
        observacoes: formOS.observacoes || null,
        numero_empenho: formOS.numero_empenho || null,
      }
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/ordens-servico`, {
        method: 'POST', body: JSON.stringify(payload),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalOS(false)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const iniciarExecucao = async (osId: string) => {
    await authFetch(`${API_URL}/api/contratos/ordens-servico/${osId}/iniciar`, { method: 'PATCH' })
    carregarDados()
  }

  const registrarEntrega = async (osId: string) => {
    await authFetch(`${API_URL}/api/contratos/ordens-servico/${osId}/entregar`, { method: 'PATCH' })
    carregarDados()
  }

  const aceitarOS = async () => {
    if (!modalAceitar) return
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/ordens-servico/${modalAceitar.id}/aceitar`, {
        method: 'PATCH',
        body: JSON.stringify({
          fiscal_id: '', fiscal_nome: 'Fiscal',
          nota_qualidade: formAceite.nota_qualidade ? parseFloat(formAceite.nota_qualidade) : null,
          parecer_aceite: formAceite.parecer_aceite || null,
        }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); alert(e.message || 'Erro'); return }
      setModalAceitar(null)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const rejeitarOS = async () => {
    if (!modalRejeitar) return
    setActionLoading(true)
    try {
      await authFetch(`${API_URL}/api/contratos/ordens-servico/${modalRejeitar.id}/rejeitar`, {
        method: 'PATCH',
        body: JSON.stringify({ fiscal_id: '', fiscal_nome: 'Fiscal', parecer_aceite: parecerRejeicao }),
      })
      setModalRejeitar(null)
      setParecerRejeicao('')
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const cancelarOS = async () => {
    if (!modalCancelar) return
    setActionLoading(true)
    try {
      await authFetch(`${API_URL}/api/contratos/ordens-servico/${modalCancelar.id}/cancelar`, {
        method: 'PATCH', body: JSON.stringify({ observacao: observacaoCancelar }),
      })
      setModalCancelar(null)
      setObservacaoCancelar('')
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-6">
      {/* Resumo */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Valor Aceito</p>
              <p className="text-xl font-bold text-green-600">{formatarMoeda(resumo.valor_aceito)}</p>
              <p className="text-xs text-gray-400">de {formatarMoeda(resumo.valor_global)}</p>
              <Progress value={(resumo.valor_aceito / Math.max(Number(resumo.valor_global), 1)) * 100} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Saldo em Valor</p>
              <p className="text-xl font-bold text-blue-600">{formatarMoeda(resumo.saldo_valor)}</p>
              <p className="text-xs text-gray-400">{formatarMoeda(resumo.valor_em_execucao)} em execução</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Ordens de Serviço</p>
              <p className="text-xl font-bold">{resumo.os_aceitas}/{resumo.total_os}</p>
              <p className="text-xs text-gray-400">{resumo.os_em_andamento} em andamento</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-gray-500">Qualidade / SLA</p>
              <div className="flex items-center gap-3">
                <span className="text-xl font-bold">{resumo.media_qualidade != null ? resumo.media_qualidade.toFixed(0) : '—'}</span>
                {resumo.sla_excedido > 0 && (
                  <Badge className="bg-red-100 text-red-800">
                    <AlertTriangle className="w-3 h-3 mr-1" />{resumo.sla_excedido} SLA
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Banco de Métricas */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Database className="w-5 h-5" />Banco de Métricas</CardTitle>
              <CardDescription>Saldo de métricas contratadas (UST, horas, PF)</CardDescription>
            </div>
            <Button onClick={() => abrirModalBanco()} size="sm"><Plus className="w-4 h-4 mr-1" />Nova Métrica</Button>
          </div>
        </CardHeader>
        <CardContent>
          {bancos.length === 0 ? (
            <div className="text-center py-6">
              <Database className="w-8 h-8 mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500 text-sm">Cadastre as métricas do contrato para abrir OS.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bancos.map(b => {
                const pctUsado = (Number(b.quantidade_consumida) / Math.max(Number(b.quantidade_total), 1)) * 100
                return (
                  <div key={b.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">{METRICAS.find(m => m.value === b.metrica)?.label || b.metrica}</p>
                        {b.descricao && <p className="text-xs text-gray-400">{b.descricao}</p>}
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => abrirModalBanco(b)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Progress value={pctUsado} className="h-2" />
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <p className="text-gray-400">Total</p>
                        <p className="font-bold">{Number(b.quantidade_total).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Consumido</p>
                        <p className="font-bold text-blue-600">{Number(b.quantidade_consumida).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-gray-400">Saldo</p>
                        <p className="font-bold text-green-600">{Number(b.saldo).toLocaleString()}</p>
                      </div>
                    </div>
                    {Number(b.quantidade_reservada) > 0 && (
                      <p className="text-xs text-amber-600 text-center">{Number(b.quantidade_reservada).toLocaleString()} reservadas em OS</p>
                    )}
                    <p className="text-xs text-gray-400 text-center">Valor unit.: {formatarMoeda(b.valor_unitario)}</p>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ordens de Serviço */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Package className="w-5 h-5" />Ordens de Serviço</CardTitle>
              <CardDescription>Demandas abertas, em execução e concluídas</CardDescription>
            </div>
            <Button onClick={abrirModalOS} size="sm" disabled={bancos.length === 0}>
              <Plus className="w-4 h-4 mr-1" />Nova OS
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {ordens.length === 0 ? (
            <div className="text-center py-8">
              <Package className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Nenhuma ordem de serviço.</p>
              <p className="text-sm text-gray-400">
                {bancos.length === 0 ? 'Cadastre métricas no banco antes de abrir OS.' : 'Abra a primeira OS para este contrato.'}
              </p>
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">OS</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-center">Métrica</TableHead>
                  <TableHead className="w-28 text-right">Valor</TableHead>
                  <TableHead className="w-24 text-center">Prazo</TableHead>
                  <TableHead className="w-32 text-center">Status</TableHead>
                  <TableHead className="w-40"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordens.map(os => (
                  <TableRow key={os.id}>
                    <TableCell className="font-medium">{os.numero_os}</TableCell>
                    <TableCell>
                      <p className="font-medium text-sm whitespace-normal break-words">{os.descricao}</p>
                      {os.responsavel_tecnico && <p className="text-xs text-gray-400">Resp: {os.responsavel_tecnico}</p>}
                      {os.numero_empenho && <p className="text-xs text-blue-600">Emp.: {os.numero_empenho}</p>}
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="text-sm">{Number(os.quantidade_metrica).toLocaleString()} {os.metrica}</span>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatarMoeda(os.valor_total)}</TableCell>
                    <TableCell className="text-center">
                      <p className="text-xs">{os.data_prazo?.split('T')[0]}</p>
                      {os.sla_excedido && <Badge className="bg-red-100 text-red-800 text-xs">SLA!</Badge>}
                      {os.sla_dias && !os.sla_excedido && <p className="text-xs text-gray-400">{os.sla_dias}d SLA</p>}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={STATUS_OS[os.status]?.cor || 'bg-gray-100'}>
                        {STATUS_OS[os.status]?.label || os.status}
                      </Badge>
                      {os.nota_qualidade != null && (
                        <p className="text-xs text-gray-400 mt-1">Nota: {Number(os.nota_qualidade).toFixed(0)}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {os.status === 'ABERTA' && (
                          <Button variant="outline" size="sm" onClick={() => iniciarExecucao(os.id)}>
                            <Play className="w-3 h-3 mr-1" />Iniciar
                          </Button>
                        )}
                        {os.status === 'EM_EXECUCAO' && (
                          <Button variant="outline" size="sm" onClick={() => registrarEntrega(os.id)}>
                            <Send className="w-3 h-3 mr-1" />Entregar
                          </Button>
                        )}
                        {(os.status === 'ENTREGUE' || os.status === 'EM_ACEITE') && (
                          <>
                            <Button variant="outline" size="sm" className="text-green-600" onClick={() => { setModalAceitar(os); setFormAceite({ nota_qualidade: '', parecer_aceite: '' }) }}>
                              <CheckCircle className="w-3 h-3 mr-1" />Aceitar
                            </Button>
                            <Button variant="outline" size="sm" className="text-red-600" onClick={() => setModalRejeitar(os)}>
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                        {os.status !== 'ACEITA' && os.status !== 'CANCELADA' && (
                          <Button variant="ghost" size="icon" onClick={() => setModalCancelar(os)} title="Cancelar OS">
                            <Trash2 className="w-3.5 h-3.5 text-red-400" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal Banco de Métricas */}
      <Dialog open={modalBanco} onOpenChange={setModalBanco}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editandoBanco ? 'Editar Métrica' : 'Nova Métrica no Banco'}</DialogTitle>
            <DialogDescription>Defina a métrica e quantidade total contratada</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Métrica *</Label>
              <Select value={formBanco.metrica} onValueChange={v => setFormBanco({ ...formBanco, metrica: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{METRICAS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Input placeholder="Ex: UST - Desenvolvimento" value={formBanco.descricao} onChange={e => setFormBanco({ ...formBanco, descricao: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantidade Total *</Label>
                <Input type="number" step="0.01" min="0" placeholder="Ex: 5000" value={formBanco.quantidade_total} onChange={e => setFormBanco({ ...formBanco, quantidade_total: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Valor Unitário (R$) *</Label>
                <Input type="number" step="0.0001" min="0" placeholder="Ex: 150.00" value={formBanco.valor_unitario} onChange={e => setFormBanco({ ...formBanco, valor_unitario: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalBanco(false)}>Cancelar</Button>
            <Button onClick={salvarBanco} disabled={actionLoading || !formBanco.quantidade_total || !formBanco.valor_unitario}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editandoBanco ? 'Salvar' : 'Criar Métrica'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nova OS */}
      <Dialog open={modalOS} onOpenChange={setModalOS}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Ordem de Serviço</DialogTitle>
            <DialogDescription>Defina o escopo, métricas e prazos da OS</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Descrição *</Label>
              <Input placeholder="Ex: Desenvolvimento do módulo de relatórios" value={formOS.descricao} onChange={e => setFormOS({ ...formOS, descricao: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Escopo Detalhado</Label>
              <Textarea placeholder="Detalhamento do escopo da OS" value={formOS.escopo_detalhado} onChange={e => setFormOS({ ...formOS, escopo_detalhado: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Métrica *</Label>
                <Select value={formOS.metrica} onValueChange={v => {
                  const banco = bancos.find(b => b.metrica === v)
                  setFormOS({ ...formOS, metrica: v, valor_unitario_metrica: banco ? banco.valor_unitario.toString() : '' })
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{METRICAS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Quantidade *</Label>
                <Input type="number" step="0.01" min="0" placeholder="Ex: 200" value={formOS.quantidade_metrica} onChange={e => setFormOS({ ...formOS, quantidade_metrica: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Valor Unit. (R$) *</Label>
                <Input type="number" step="0.0001" min="0" value={formOS.valor_unitario_metrica} onChange={e => setFormOS({ ...formOS, valor_unitario_metrica: e.target.value })} />
              </div>
            </div>
            {formOS.quantidade_metrica && formOS.valor_unitario_metrica && (
              <div className="p-3 bg-blue-50 rounded-lg">
                <p className="text-sm font-medium text-blue-700">
                  Valor Total: {formatarMoeda(parseFloat(formOS.quantidade_metrica) * parseFloat(formOS.valor_unitario_metrica))}
                </p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Data Abertura *</Label>
                <Input type="date" value={formOS.data_abertura} onChange={e => setFormOS({ ...formOS, data_abertura: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Prazo Entrega *</Label>
                <Input type="date" value={formOS.data_prazo} onChange={e => setFormOS({ ...formOS, data_prazo: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>SLA (dias úteis)</Label>
                <Input type="number" min="0" placeholder="Ex: 30" value={formOS.sla_dias} onChange={e => setFormOS({ ...formOS, sla_dias: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Responsável Técnico</Label>
                <Input placeholder="Nome do responsável no fornecedor" value={formOS.responsavel_tecnico} onChange={e => setFormOS({ ...formOS, responsavel_tecnico: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Critérios de Aceite</Label>
                <Input placeholder="Critérios para aceite da OS" value={formOS.criterios_aceite} onChange={e => setFormOS({ ...formOS, criterios_aceite: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Empenho</Label>
              {loadingEmpenhos ? (
                <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />Buscando empenhos...
                </div>
              ) : empenhos.length > 0 ? (
                <Select value={formOS.numero_empenho} onValueChange={v => setFormOS({ ...formOS, numero_empenho: v === '__nenhum__' ? '' : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar empenho (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhum__">Nenhum</SelectItem>
                    {empenhos.map((e, i) => (
                      <SelectItem key={i} value={e.numero_liquidacao || String(i)}>
                        {e.numero_liquidacao ? `Liq. ${e.numero_liquidacao} — ` : ''}{e.credor} — {e.valor_formatado}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  placeholder="Número do empenho (opcional)"
                  value={formOS.numero_empenho}
                  onChange={e => setFormOS({ ...formOS, numero_empenho: e.target.value })}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea placeholder="Observações" value={formOS.observacoes} onChange={e => setFormOS({ ...formOS, observacoes: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOS(false)}>Cancelar</Button>
            <Button onClick={criarOS} disabled={actionLoading || !formOS.descricao || !formOS.quantidade_metrica || !formOS.data_prazo}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Criar OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Aceitar OS */}
      <Dialog open={!!modalAceitar} onOpenChange={() => setModalAceitar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aceitar OS {modalAceitar?.numero_os}</DialogTitle>
            <DialogDescription>
              {modalAceitar && `${Number(modalAceitar.quantidade_metrica).toLocaleString()} ${modalAceitar.metrica} — ${formatarMoeda(modalAceitar.valor_total)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nota de Qualidade (0-100)</Label>
              <Input type="number" min="0" max="100" placeholder="Ex: 85" value={formAceite.nota_qualidade} onChange={e => setFormAceite({ ...formAceite, nota_qualidade: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Parecer de Aceite</Label>
              <Textarea placeholder="Parecer do fiscal sobre a entrega" value={formAceite.parecer_aceite} onChange={e => setFormAceite({ ...formAceite, parecer_aceite: e.target.value })} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAceitar(null)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={aceitarOS} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Aceitar OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar OS */}
      <Dialog open={!!modalRejeitar} onOpenChange={() => setModalRejeitar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar OS {modalRejeitar?.numero_os}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da Rejeição *</Label>
            <Textarea placeholder="Informe o motivo..." value={parecerRejeicao} onChange={e => setParecerRejeicao(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRejeitar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={rejeitarOS} disabled={actionLoading || !parecerRejeicao}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Cancelar OS */}
      <Dialog open={!!modalCancelar} onOpenChange={() => setModalCancelar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar OS {modalCancelar?.numero_os}</DialogTitle>
          </DialogHeader>
          <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg">
            <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5" />
            <p className="text-sm text-red-700">Ao cancelar, as métricas reservadas serão liberadas de volta ao banco.</p>
          </div>
          <div className="space-y-2">
            <Label>Motivo do Cancelamento *</Label>
            <Textarea placeholder="Informe o motivo..." value={observacaoCancelar} onChange={e => setObservacaoCancelar(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalCancelar(null)}>Voltar</Button>
            <Button variant="destructive" onClick={cancelarOS} disabled={actionLoading || !observacaoCancelar}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Cancelar OS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
