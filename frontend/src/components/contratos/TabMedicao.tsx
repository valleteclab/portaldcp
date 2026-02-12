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
  FileText, AlertTriangle, Calendar, MapPin, ExternalLink,
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

const STATUS_MEDICAO: Record<string, { label: string; cor: string }> = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-gray-100 text-gray-800' },
  AGUARDANDO_APROVACAO: { label: 'Aguardando Aprovação', cor: 'bg-amber-100 text-amber-800' },
  APROVADA: { label: 'Aprovada', cor: 'bg-green-100 text-green-800' },
  REJEITADA: { label: 'Rejeitada', cor: 'bg-red-100 text-red-800' },
}

function formatarMoeda(v: number | string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function TabMedicao({ contratoId, valorGlobal }: { contratoId: string; valorGlobal: number }) {
  const [etapas, setEtapas] = useState<Etapa[]>([])
  const [medicoes, setMedicoes] = useState<Medicao[]>([])
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)

  // Modais
  const [modalEtapa, setModalEtapa] = useState(false)
  const [editandoEtapa, setEditandoEtapa] = useState<Etapa | null>(null)
  const [modalMedicao, setModalMedicao] = useState(false)
  const [modalAprovar, setModalAprovar] = useState<Medicao | null>(null)
  const [modalRejeitar, setModalRejeitar] = useState<Medicao | null>(null)
  const [observacaoRejeicao, setObservacaoRejeicao] = useState('')

  // Forms
  const [formEtapa, setFormEtapa] = useState({
    descricao: '', percentual_fisico: '', valor_previsto: '',
    data_inicio_prevista: '', data_fim_prevista: '', observacoes: '',
  })
  const [formMedicao, setFormMedicao] = useState({
    periodo_inicio: '', periodo_fim: '', observacoes: '',
    itens: [] as { etapa_id: string; percentual_executado_atual: number }[],
  })

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

  const salvarEtapa = async () => {
    setActionLoading(true)
    try {
      const payload = {
        descricao: formEtapa.descricao,
        percentual_fisico: parseFloat(formEtapa.percentual_fisico),
        valor_previsto: parseFloat(formEtapa.valor_previsto),
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

  // ============ MEDIÇÕES ============

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

  const enviarParaAprovacao = async (medicaoId: string) => {
    setActionLoading(true)
    try {
      await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}/enviar-aprovacao`, {
        method: 'PATCH', body: JSON.stringify({ fiscal_id: '', fiscal_nome: 'Fiscal' }),
      })
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const aprovarMedicao = async (medicaoId: string) => {
    setActionLoading(true)
    try {
      await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}/aprovar`, {
        method: 'PATCH', body: JSON.stringify({ aprovador_id: '', aprovador_nome: 'Aprovador' }),
      })
      setModalAprovar(null)
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  const rejeitarMedicao = async (medicaoId: string) => {
    setActionLoading(true)
    try {
      await authFetch(`${API_URL}/api/contratos/medicoes/${medicaoId}/rejeitar`, {
        method: 'PATCH', body: JSON.stringify({ aprovador_id: '', aprovador_nome: 'Aprovador', observacao: observacaoRejeicao }),
      })
      setModalRejeitar(null)
      setObservacaoRejeicao('')
      carregarDados()
    } catch (e) { console.error(e) }
    setActionLoading(false)
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-6">
      {/* Ordem de Serviço — Seção Principal */}
      <Card className={!osAtiva ? 'border-amber-300 bg-amber-50/30' : osAtiva.status === 'ORDEM_GERADA' ? 'border-indigo-300' : ''}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><FileText className="w-5 h-5" />Ordem de Serviço</CardTitle>
              <CardDescription>A OS autoriza o início da execução da obra. Sem OS, não é possível registrar medições.</CardDescription>
            </div>
            <Button asChild size="sm" variant={osAtiva ? 'outline' : 'default'}>
              <Link href="/orgao/almoxarifado/requisicoes">
                <ExternalLink className="w-4 h-4 mr-1" />{osAtiva ? 'Ver Requisições' : 'Criar OS'}
              </Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!osAtiva ? (
            <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <div>
                <p className="font-medium text-amber-700">Nenhuma Ordem de Serviço ativa</p>
                <p className="text-sm text-amber-600">
                  Crie uma OS do tipo "Ordem de Serviço" na{' '}
                  <Link href="/orgao/almoxarifado/requisicoes" className="underline font-semibold">página de Requisições</Link>{' '}
                  para liberar o cadastro de etapas e medições.
                </p>
              </div>
            </div>
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
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        </div>
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
                        {e.data_inicio_prevista?.split('T')[0]} → {e.data_fim_prevista?.split('T')[0]}
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

      {/* Medições */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Boletins de Medição</CardTitle>
              <CardDescription>Medições realizadas pelo fiscal</CardDescription>
            </div>
            <Button onClick={abrirModalMedicao} size="sm" disabled={etapas.length === 0 || !temOSAutorizada}>
              <Plus className="w-4 h-4 mr-1" />Nova Medição
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {medicoes.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-10 h-10 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Nenhuma medição registrada.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Valor Medido</TableHead>
                  <TableHead className="text-right">Acumulado</TableHead>
                  <TableHead className="text-center">% Físico</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {medicoes.map(m => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.numero_medicao}ª</TableCell>
                    <TableCell>
                      <p className="text-sm">{m.periodo_inicio?.split('T')[0]} a {m.periodo_fim?.split('T')[0]}</p>
                      {m.fiscal_nome && <p className="text-xs text-gray-400">Fiscal: {m.fiscal_nome}</p>}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatarMoeda(m.valor_medido)}</TableCell>
                    <TableCell className="text-right">{formatarMoeda(m.valor_acumulado_atual)}</TableCell>
                    <TableCell className="text-center">{Number(m.percentual_fisico_acumulado).toFixed(1)}%</TableCell>
                    <TableCell className="text-center">
                      <Badge className={STATUS_MEDICAO[m.status]?.cor || 'bg-gray-100'}>
                        {STATUS_MEDICAO[m.status]?.label || m.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {m.status === 'RASCUNHO' && (
                          <Button variant="outline" size="sm" onClick={() => enviarParaAprovacao(m.id)} disabled={actionLoading}>
                            <Send className="w-3.5 h-3.5 mr-1" />Enviar
                          </Button>
                        )}
                        {m.status === 'AGUARDANDO_APROVACAO' && (
                          <>
                            <Button variant="outline" size="sm" className="text-green-600" onClick={() => setModalAprovar(m)} disabled={actionLoading}>
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />Aprovar
                            </Button>
                            <Button variant="outline" size="sm" className="text-red-600" onClick={() => setModalRejeitar(m)} disabled={actionLoading}>
                              <XCircle className="w-3.5 h-3.5" />
                            </Button>
                          </>
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>% Físico da Obra *</Label>
                <Input type="number" step="0.01" min="0" max="100" placeholder="Ex: 25" value={formEtapa.percentual_fisico} onChange={e => setFormEtapa({ ...formEtapa, percentual_fisico: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Valor Previsto (R$) *</Label>
                <Input type="number" step="0.01" min="0" placeholder="0,00" value={formEtapa.valor_previsto} onChange={e => setFormEtapa({ ...formEtapa, valor_previsto: e.target.value })} />
              </div>
            </div>
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

      {/* Modal Nova Medição */}
      <Dialog open={modalMedicao} onOpenChange={setModalMedicao}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nova Medição</DialogTitle>
            <DialogDescription>Informe o percentual executado de cada etapa neste período</DialogDescription>
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

      {/* Modal Aprovar */}
      <Dialog open={!!modalAprovar} onOpenChange={() => setModalAprovar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar Medição #{modalAprovar?.numero_medicao}</DialogTitle>
            <DialogDescription>Valor medido: {modalAprovar && formatarMoeda(modalAprovar.valor_medido)}</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-gray-600">Ao aprovar, o saldo do contrato será consumido e as etapas atualizadas.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAprovar(null)}>Cancelar</Button>
            <Button className="bg-green-600 hover:bg-green-700" onClick={() => modalAprovar && aprovarMedicao(modalAprovar.id)} disabled={actionLoading}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Aprovar Medição
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar */}
      <Dialog open={!!modalRejeitar} onOpenChange={() => setModalRejeitar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Medição #{modalRejeitar?.numero_medicao}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Motivo da Rejeição *</Label>
            <Textarea placeholder="Informe o motivo..." value={observacaoRejeicao} onChange={e => setObservacaoRejeicao(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalRejeitar(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => modalRejeitar && rejeitarMedicao(modalRejeitar.id)} disabled={actionLoading || !observacaoRejeicao}>
              {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  )
}
