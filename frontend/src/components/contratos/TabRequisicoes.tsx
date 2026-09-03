'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Loader2, ClipboardList, Package, FileText, RefreshCw, Link2, History, ChevronDown, ChevronUp, Receipt, AlertTriangle, RotateCcw,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

// ============================================================================
// INTERFACES
// ============================================================================

interface Requisicao {
  id: string
  numero: string
  tipo: string
  status: string
  prioridade: string
  setor_solicitante: string
  justificativa: string
  valor_total_estimado: number
  data_solicitacao: string
  data_necessidade: string | null
  usuario_solicitante_nome: string
  usuario_autorizador_nome: string | null
  data_autorizacao: string | null
  observacao_autorizador: string | null
  contrato_id: string | null
  numeros_empenhos: string | null
  modo_os: string | null
  descricao_os: string | null
  itens: any[]
  itensOS: any[]
  etapasOS: any[]
  medicoes_vinculadas?: { id: string; numero_medicao: number; status: string }[]
  created_at: string
}

interface OrdemServico {
  id: string
  numero_os: string
  descricao: string
  escopo_detalhado: string
  valor_total: number
  status: string
  metrica: string
  data_abertura: string
  data_prazo: string
  fiscal_nome: string
  numero_empenho?: string
  numeros_empenhos?: string[] | null
  created_at: string
}

interface OrdemFornecimento {
  id: string
  numero: string
  tipo: string
  descricao: string | null
  valor_total: number
  valor_entregue: number
  status: string
  data_emissao: string
  data_entrega_prevista: string | null
  usuario_emitente_nome: string
  numeros_empenhos: string[] | null
  itens: any[]
  created_at: string
}

interface HistoricoItem {
  id: string
  acao: string
  descricao: string
  usuario_nome: string
  created_at: string
}

// ============================================================================
// HELPERS
// ============================================================================

function formatarMoeda(v: number | string) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(d: string | Date | null) {
  if (!d) return '-'
  const dateOnly = String(d).split('T')[0]
  const parts = dateOnly.split('-')
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function normalizarNumeroEmpenho(valor: string) {
  return valor.replace(/[-/]\d{4}$/, '')
}

function diasDesde(d: string | null) {
  if (!d) return null
  const inicio = new Date(String(d).split('T')[0] + 'T00:00:00-03:00').getTime()
  if (Number.isNaN(inicio)) return null
  return Math.max(0, Math.floor((Date.now() - inicio) / 86400000))
}

/** OS autorizada sem nenhuma medição ativa vinculada — aguardando medição. */
function osAguardandoMedicao(req: Requisicao) {
  return (
    req.tipo === 'ORDEM_SERVICO' &&
    req.status === 'AUTORIZADA' &&
    (!req.medicoes_vinculadas || req.medicoes_vinculadas.length === 0)
  )
}

const STATUS_REQ: Record<string, { label: string; cor: string }> = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-gray-100 text-gray-700' },
  AGUARDANDO_AUTORIZACAO: { label: 'Aguardando Autorização', cor: 'bg-yellow-100 text-yellow-700' },
  AUTORIZADA: { label: 'Autorizada', cor: 'bg-blue-100 text-blue-700' },
  NEGADA: { label: 'Negada', cor: 'bg-red-100 text-red-700' },
  DEVOLVIDA: { label: 'Devolvida', cor: 'bg-amber-100 text-amber-700' },
  CANCELADA: { label: 'Cancelada', cor: 'bg-gray-200 text-gray-600' },
  ORDEM_GERADA: { label: 'Ordem Gerada', cor: 'bg-indigo-100 text-indigo-700' },
  ATENDIDA_PARCIAL: { label: 'Atendida Parcial', cor: 'bg-purple-100 text-purple-700' },
  ATENDIDA: { label: 'Atendida', cor: 'bg-green-100 text-green-700' },
}

const STATUS_OS: Record<string, { label: string; cor: string }> = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-gray-100 text-gray-700' },
  AGUARDANDO_APROVACAO: { label: 'Aguardando Aprovação', cor: 'bg-yellow-100 text-yellow-700' },
  AUTORIZADA: { label: 'Autorizada', cor: 'bg-blue-100 text-blue-700' },
  ABERTA: { label: 'Aberta', cor: 'bg-blue-100 text-blue-700' },
  EM_EXECUCAO: { label: 'Em Execução', cor: 'bg-indigo-100 text-indigo-700' },
  ENTREGUE: { label: 'Entregue', cor: 'bg-purple-100 text-purple-700' },
  EM_ACEITE: { label: 'Em Aceite', cor: 'bg-purple-100 text-purple-700' },
  ACEITA: { label: 'Aceita', cor: 'bg-green-100 text-green-700' },
  REJEITADA: { label: 'Rejeitada', cor: 'bg-red-100 text-red-700' },
  CANCELADA: { label: 'Cancelada', cor: 'bg-gray-200 text-gray-600' },
  CONCLUIDA: { label: 'Concluída', cor: 'bg-green-200 text-green-800' },
}

const STATUS_OF: Record<string, { label: string; cor: string }> = {
  RASCUNHO: { label: 'Rascunho', cor: 'bg-gray-100 text-gray-700' },
  EMITIDA: { label: 'Emitida', cor: 'bg-blue-100 text-blue-700' },
  ENVIADA: { label: 'Enviada', cor: 'bg-cyan-100 text-cyan-700' },
  EM_ATENDIMENTO: { label: 'Em Atendimento', cor: 'bg-indigo-100 text-indigo-700' },
  ATENDIDA_PARCIAL: { label: 'Atendida Parcial', cor: 'bg-amber-100 text-amber-700' },
  ATENDIDA: { label: 'Atendida', cor: 'bg-green-100 text-green-700' },
  CANCELADA: { label: 'Cancelada', cor: 'bg-gray-200 text-gray-600' },
}

const TIPO_REQ: Record<string, { label: string; cor: string }> = {
  MATERIAL: { label: 'Material', cor: 'bg-amber-50 text-amber-700 border-amber-200' },
  SERVICO: { label: 'Serviço', cor: 'bg-blue-50 text-blue-700 border-blue-200' },
  PERMANENTE: { label: 'Permanente', cor: 'bg-purple-50 text-purple-700 border-purple-200' },
  ORDEM_SERVICO: { label: 'Ordem de Serviço', cor: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
}

// ============================================================================
// COMPONENT
// ============================================================================

export default function TabRequisicoes({ contratoId, contratoNumero }: { contratoId: string; contratoNumero: string }) {
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([])
  const [ordensServico, setOrdensServico] = useState<OrdemServico[]>([])
  const [ordensFornecimento, setOrdensFornecimento] = useState<OrdemFornecimento[]>([])
  const [loading, setLoading] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState<'requisicoes' | 'os' | 'of'>('requisicoes')

  // Modal detalhe
  const [detalheReq, setDetalheReq] = useState<Requisicao | null>(null)
  const [detalheHistorico, setDetalheHistorico] = useState<HistoricoItem[]>([])
  const [loadingHistorico, setLoadingHistorico] = useState(false)

  // Modal vincular empenho (mesmo padrão do almoxarifado/ordens)
  const [modalEmpenho, setModalEmpenho] = useState<{ tipo: 'requisicao' | 'os' | 'of'; id: string; numero: string; empenhosAtuais: string[] } | null>(null)
  const [empenhosDisponiveis, setEmpenhosDisponiveis] = useState<any[]>([])
  const [empenhosSelecionados, setEmpenhosSelecionados] = useState<Set<string>>(new Set())
  const [loadingEmpenhosVincular, setLoadingEmpenhosVincular] = useState(false)
  const [salvandoEmpenho, setSalvandoEmpenho] = useState(false)
  const [anoEmpenho, setAnoEmpenho] = useState(new Date().getFullYear().toString())

  // Expandir detalhes
  const [expandido, setExpandido] = useState<string | null>(null)

  // Modal "OS atendida fora do sistema"
  const [modalAtenderFora, setModalAtenderFora] = useState<Requisicao | null>(null)
  const [motivoAtenderFora, setMotivoAtenderFora] = useState('')
  const [salvandoAtenderFora, setSalvandoAtenderFora] = useState(false)
  const [erroAtenderFora, setErroAtenderFora] = useState<string | null>(null)

  const carregarDados = useCallback(async () => {
    setLoading(true)
    try {
      const [reqRes, osRes, ofRes] = await Promise.all([
        authFetch(`${API_URL}/api/almoxarifado/requisicoes?contratoId=${contratoId}`),
        authFetch(`${API_URL}/api/contratos/${contratoId}/ordens-servico`),
        authFetch(`${API_URL}/api/almoxarifado/ordens?contratoId=${contratoId}`),
      ])
      if (reqRes.ok) setRequisicoes(await reqRes.json())
      if (osRes.ok) setOrdensServico(await osRes.json())
      if (ofRes.ok) setOrdensFornecimento(await ofRes.json())
    } catch (e) { console.error('Erro ao carregar requisições:', e) }
    setLoading(false)
  }, [contratoId])

  useEffect(() => { carregarDados() }, [carregarDados])

  // ============================================================================
  // AÇÕES
  // ============================================================================

  const abrirDetalhe = async (req: Requisicao) => {
    setDetalheReq(req)
    setLoadingHistorico(true)
    try {
      const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${req.id}/historico`)
      if (res.ok) setDetalheHistorico(await res.json())
      else setDetalheHistorico([])
    } catch { setDetalheHistorico([]) }
    setLoadingHistorico(false)
  }

  const abrirModalEmpenho = async (tipo: 'requisicao' | 'os' | 'of', id: string, numero: string, empenhosAtuais: string[]) => {
    setModalEmpenho({ tipo, id, numero, empenhosAtuais })
    setEmpenhosSelecionados(new Set(empenhosAtuais.map(normalizarNumeroEmpenho).filter(Boolean)))
    setEmpenhosDisponiveis([])
    setLoadingEmpenhosVincular(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/empenhos?ano=${anoEmpenho}`)
      if (res.ok) {
        const data = await res.json()
        const grupos: any[] = data.grupos_exercicio ?? []
        const compostos: any[] = []
        for (const g of grupos) {
          if (g.empenhos_compostos?.length) compostos.push(...g.empenhos_compostos)
        }
        setEmpenhosDisponiveis(compostos)
      }
    } catch (e) { console.error(e) }
    setLoadingEmpenhosVincular(false)
  }

  const buscarEmpenhosAno = async () => {
    if (!modalEmpenho) return
    setLoadingEmpenhosVincular(true)
    setEmpenhosDisponiveis([])
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/empenhos?ano=${anoEmpenho}`)
      if (res.ok) {
        const data = await res.json()
        const grupos: any[] = data.grupos_exercicio ?? []
        const compostos: any[] = []
        for (const g of grupos) {
          if (g.empenhos_compostos?.length) compostos.push(...g.empenhos_compostos)
        }
        setEmpenhosDisponiveis(compostos)
      }
    } catch (e) { console.error(e) }
    setLoadingEmpenhosVincular(false)
  }

  const toggleEmpenho = (numero: string) => {
    setEmpenhosSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(numero)) next.delete(numero); else next.add(numero)
      return next
    })
  }

  const salvarEmpenhos = async () => {
    if (!modalEmpenho) return
    setSalvandoEmpenho(true)
    try {
      const empenhos = Array.from(empenhosSelecionados).map(num => {
        const comp = empenhosDisponiveis.find((c: any) =>
          (c.numero_empenho || c.empenho?.numero_liquidacao || '') === num
        )
        if (comp?.ano_exercicio) return `${num}-${comp.ano_exercicio}`
        return num
      })
      let res: Response
      if (modalEmpenho.tipo === 'requisicao') {
        res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${modalEmpenho.id}/empenhos`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empenhos }),
        })
      } else if (modalEmpenho.tipo === 'os') {
        res = await authFetch(`${API_URL}/api/contratos/ordens-servico/${modalEmpenho.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            numeros_empenhos: empenhos,
            numero_empenho: empenhos[0] ?? null,
          }),
        })
      } else {
        res = await authFetch(`${API_URL}/api/almoxarifado/ordens/${modalEmpenho.id}/empenhos`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ empenhos }),
        })
      }
      if (res.ok) {
        alert('Empenhos vinculados com sucesso!')
        setModalEmpenho(null)
        carregarDados()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.message || 'Erro ao vincular empenhos')
      }
    } catch { alert('Erro ao vincular empenhos') }
    setSalvandoEmpenho(false)
  }

  const parseEmpenhos = (val: string | string[] | null | undefined): string[] => {
    if (!val) return []
    if (Array.isArray(val)) return val
    try {
      const parsed = JSON.parse(val)
      return Array.isArray(parsed) ? parsed : []
    } catch { return val ? [val] : [] }
  }

  const empenhosComSaldo = empenhosDisponiveis.filter((comp: any) => Number(comp.saldo_virtual ?? comp.saldo_a_liquidar ?? 0) > 0.01)
  const empenhosSemSaldo = empenhosDisponiveis.filter((comp: any) => Number(comp.saldo_virtual ?? comp.saldo_a_liquidar ?? 0) <= 0.01)
  const algumSemSaldoSelecionado = empenhosSelecionados.size > 0 && Array.from(empenhosSelecionados).some(num =>
    empenhosSemSaldo.some((comp: any) => (comp.numero_empenho || comp.empenho?.numero_liquidacao || '') === num)
  )

  const selecionarTodosComSaldo = () => {
    setEmpenhosSelecionados(
      new Set(
        empenhosComSaldo
          .map((comp: any) => comp.numero_empenho || comp.empenho?.numero_liquidacao || '')
          .filter(Boolean),
      ),
    )
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 gap-2 text-gray-500">
        <Loader2 className="w-6 h-6 animate-spin" />
        <span>Carregando requisições...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-2 border-b pb-2">
        <Button variant={abaAtiva === 'requisicoes' ? 'default' : 'ghost'} size="sm" onClick={() => setAbaAtiva('requisicoes')}>
          <ClipboardList className="w-4 h-4 mr-1" />
          Requisições ({requisicoes.length})
        </Button>
        <Button variant={abaAtiva === 'os' ? 'default' : 'ghost'} size="sm" onClick={() => setAbaAtiva('os')}>
          <FileText className="w-4 h-4 mr-1" />
          Ordens de Serviço ({ordensServico.length})
        </Button>
        <Button variant={abaAtiva === 'of' ? 'default' : 'ghost'} size="sm" onClick={() => setAbaAtiva('of')}>
          <Package className="w-4 h-4 mr-1" />
          Ordens de Fornecimento ({ordensFornecimento.length})
        </Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={carregarDados}>
          <RefreshCw className="w-4 h-4 mr-1" /> Atualizar
        </Button>
      </div>

      {/* ==================== REQUISIÇÕES ==================== */}
      {abaAtiva === 'requisicoes' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="w-5 h-5" />
              Requisições do Contrato {contratoNumero}
            </CardTitle>
            <CardDescription>Requisições internas vinculadas a este contrato</CardDescription>
          </CardHeader>
          <CardContent>
            {requisicoes.length === 0 ? (
              <div className="text-center py-12">
                <ClipboardList className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">Nenhuma requisição vinculada</p>
                <p className="text-sm text-gray-400">As requisições são criadas no módulo de Almoxarifado</p>
              </div>
            ) : (
              <div className="space-y-3">
                {requisicoes.map(req => {
                  const statusInfo = STATUS_REQ[req.status] || { label: req.status, cor: 'bg-gray-100 text-gray-600' }
                  const tipoInfo = TIPO_REQ[req.tipo] || { label: req.tipo, cor: 'bg-gray-50 text-gray-600' }
                  const empenhos = parseEmpenhos(req.numeros_empenhos)
                  const isExpanded = expandido === req.id
                  return (
                    <div key={req.id} className="border rounded-lg">
                      <div
                        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandido(isExpanded ? null : req.id)}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-700 font-bold text-xs shrink-0">
                          REQ
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium">{req.numero}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium border ${tipoInfo.cor}`}>{tipoInfo.label}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusInfo.cor}`}>{statusInfo.label}</span>
                            {empenhos.length > 0 && (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                {empenhos.length} empenho{empenhos.length > 1 ? 's' : ''}
                              </span>
                            )}
                            {osAguardandoMedicao(req) && (() => {
                              const dias = diasDesde(req.data_autorizacao || req.created_at)
                              return (
                                <span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  Aguardando medição{dias != null ? ` há ${dias} dia${dias === 1 ? '' : 's'}` : ''}
                                </span>
                              )
                            })()}
                          </div>
                          <div className="flex items-center gap-3 text-sm text-gray-500">
                            <span>{formatarMoeda(req.valor_total_estimado)}</span>
                            <span>{formatarData(req.data_solicitacao)}</span>
                            <span>{req.setor_solicitante}</span>
                          </div>
                        </div>
                        <div className="shrink-0">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="border-t px-4 py-4 bg-gray-50/50 space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                              <p className="text-gray-500">Solicitante</p>
                              <p className="font-medium">{req.usuario_solicitante_nome}</p>
                            </div>
                            <div>
                              <p className="text-gray-500">Setor</p>
                              <p className="font-medium">{req.setor_solicitante}</p>
                            </div>
                            {req.usuario_autorizador_nome && (
                              <div>
                                <p className="text-gray-500">Autorizador</p>
                                <p className="font-medium">{req.usuario_autorizador_nome}</p>
                              </div>
                            )}
                            {req.data_autorizacao && (
                              <div>
                                <p className="text-gray-500">Data Autorização</p>
                                <p className="font-medium">{formatarData(req.data_autorizacao)}</p>
                              </div>
                            )}
                            {req.data_necessidade && (
                              <div>
                                <p className="text-gray-500">Data Necessidade</p>
                                <p className="font-medium">{formatarData(req.data_necessidade)}</p>
                              </div>
                            )}
                          </div>

                          {req.justificativa && (
                            <div className="text-sm">
                              <p className="text-gray-500">Justificativa</p>
                              <p className="text-gray-700 whitespace-pre-wrap">{req.justificativa}</p>
                            </div>
                          )}

                          {/* Empenhos vinculados */}
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <p className="text-sm text-gray-500 mb-1">Empenhos vinculados</p>
                              {empenhos.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {empenhos.map((emp, i) => (
                                    <Badge key={i} variant="outline" className="bg-green-50 text-green-700 border-green-200">{emp}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-400 italic">Nenhum empenho vinculado</p>
                              )}
                            </div>
                            <Button variant="outline" size="sm" onClick={() => abrirModalEmpenho('requisicao', req.id, req.numero, empenhos)}>
                              <Link2 className="w-3.5 h-3.5 mr-1" /> Vincular Empenho
                            </Button>
                          </div>

                          {/* Itens da requisição */}
                          {req.itens && req.itens.length > 0 && (
                            <div>
                              <p className="text-sm text-gray-500 mb-2">Itens</p>
                              <div className="space-y-1">
                                {req.itens.map((item: any, i: number) => (
                                  <div key={i} className="flex items-center gap-3 text-sm p-2 bg-white rounded border">
                                    <span className="text-gray-400">#{item.numero_item || i + 1}</span>
                                    <span className="flex-1">{item.descricao}</span>
                                    <span className="text-gray-500">{item.quantidade_solicitada || item.quantidade} {item.unidade_medida || ''}</span>
                                    <span className="font-medium">{formatarMoeda(item.valor_total || item.valor_estimado || 0)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Ações */}
                          <div className="flex gap-2 pt-2 flex-wrap">
                            <Button variant="outline" size="sm" onClick={() => abrirDetalhe(req)}>
                              <History className="w-3.5 h-3.5 mr-1" /> Histórico
                            </Button>
                            {osAguardandoMedicao(req) && (
                              <Button
                                variant="outline"
                                size="sm"
                                className="border-amber-300 text-amber-700 hover:bg-amber-50"
                                onClick={() => { setModalAtenderFora(req); setMotivoAtenderFora(''); setErroAtenderFora(null) }}
                              >
                                <AlertTriangle className="w-3.5 h-3.5 mr-1" /> Atendida fora do sistema
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ==================== ORDENS DE SERVIÇO ==================== */}
      {abaAtiva === 'os' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Ordens de Serviço
            </CardTitle>
            <CardDescription>Ordens de serviço emitidas para este contrato</CardDescription>
          </CardHeader>
          <CardContent>
            {ordensServico.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">Nenhuma ordem de serviço</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ordensServico.map(os => {
                  const statusInfo = STATUS_OS[os.status] || { label: os.status, cor: 'bg-gray-100 text-gray-600' }
                  const empenhos = parseEmpenhos(os.numeros_empenhos)
                  const isExpanded = expandido === `os-${os.id}`
                  const empenhoPrincipal = os.numero_empenho
                  return (
                    <div key={os.id} className="border rounded-lg">
                      <div
                        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandido(isExpanded ? null : `os-${os.id}`)}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-50 text-blue-700 font-bold text-xs shrink-0">
                          OS
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium">{os.numero_os}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusInfo.cor}`}>{statusInfo.label}</span>
                            {(empenhos.length > 0 || empenhoPrincipal) && (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                Empenho{empenhos.length > 1 ? 's' : ''}: {empenhos.length > 0 ? empenhos.join(', ') : empenhoPrincipal}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 truncate">{os.descricao || os.escopo_detalhado || '-'}</p>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                            <span>{formatarMoeda(os.valor_total)}</span>
                            <span>{formatarData(os.data_abertura)}</span>
                            {os.fiscal_nome && <span>Fiscal: {os.fiscal_nome}</span>}
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>

                      {isExpanded && (
                        <div className="border-t px-4 py-4 bg-gray-50/50 space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            {os.metrica && <div><p className="text-gray-500">Métrica</p><p className="font-medium">{os.metrica}</p></div>}
                            {os.fiscal_nome && <div><p className="text-gray-500">Fiscal</p><p className="font-medium">{os.fiscal_nome}</p></div>}
                            <div><p className="text-gray-500">Prazo</p><p className="font-medium">{formatarData(os.data_prazo)}</p></div>
                          </div>

                          {/* Empenhos */}
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <p className="text-sm text-gray-500 mb-1">Empenhos vinculados</p>
                              {empenhos.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {empenhos.map((emp, i) => (
                                    <Badge key={i} variant="outline" className="bg-green-50 text-green-700 border-green-200">{emp}</Badge>
                                  ))}
                                </div>
                              ) : empenhoPrincipal ? (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">{empenhoPrincipal}</Badge>
                              ) : (
                                <p className="text-sm text-gray-400 italic">Nenhum empenho vinculado</p>
                              )}
                            </div>
                            <Button variant="outline" size="sm" onClick={() => abrirModalEmpenho('os', os.id, os.numero_os, empenhos.length > 0 ? empenhos : (empenhoPrincipal ? [empenhoPrincipal] : []))}>
                              <Link2 className="w-3.5 h-3.5 mr-1" /> Vincular Empenho
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ==================== ORDENS DE FORNECIMENTO ==================== */}
      {abaAtiva === 'of' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Ordens de Fornecimento
            </CardTitle>
            <CardDescription>Ordens de fornecimento emitidas para este contrato</CardDescription>
          </CardHeader>
          <CardContent>
            {ordensFornecimento.length === 0 ? (
              <div className="text-center py-12">
                <Package className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">Nenhuma ordem de fornecimento</p>
              </div>
            ) : (
              <div className="space-y-3">
                {ordensFornecimento.map(of => {
                  const statusInfo = STATUS_OF[of.status] || { label: of.status, cor: 'bg-gray-100 text-gray-600' }
                  const empenhos = parseEmpenhos(of.numeros_empenhos)
                  const isExpanded = expandido === `of-${of.id}`
                  return (
                    <div key={of.id} className="border rounded-lg">
                      <div
                        className="flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50"
                        onClick={() => setExpandido(isExpanded ? null : `of-${of.id}`)}
                      >
                        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-50 text-amber-700 font-bold text-xs shrink-0">
                          OF
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium">{of.numero}</span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${statusInfo.cor}`}>{statusInfo.label}</span>
                            {empenhos.length > 0 && (
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                                {empenhos.length} empenho{empenhos.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-600 truncate">{of.descricao || '-'}</p>
                          <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                            <span>{formatarMoeda(of.valor_total)}</span>
                            <span>{formatarData(of.data_emissao)}</span>
                            <span>Emitente: {of.usuario_emitente_nome}</span>
                          </div>
                        </div>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                      </div>

                      {isExpanded && (
                        <div className="border-t px-4 py-4 bg-gray-50/50 space-y-3">
                          <div className="grid grid-cols-2 gap-4 text-sm">
                            <div><p className="text-gray-500">Valor Entregue</p><p className="font-medium">{formatarMoeda(of.valor_entregue)}</p></div>
                            {of.data_entrega_prevista && <div><p className="text-gray-500">Entrega Prevista</p><p className="font-medium">{formatarData(of.data_entrega_prevista)}</p></div>}
                          </div>

                          {/* Itens */}
                          {of.itens && of.itens.length > 0 && (
                            <div>
                              <p className="text-sm text-gray-500 mb-2">Itens</p>
                              <div className="space-y-1">
                                {of.itens.map((item: any, i: number) => (
                                  <div key={i} className="flex items-center gap-3 text-sm p-2 bg-white rounded border">
                                    <span className="text-gray-400">#{item.numero_item || i + 1}</span>
                                    <span className="flex-1">{item.descricao}</span>
                                    <span className="text-gray-500">{item.quantidade} {item.unidade_medida || ''}</span>
                                    <span className="font-medium">{formatarMoeda(item.valor_total)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Empenhos */}
                          <div className="flex items-start gap-2">
                            <div className="flex-1">
                              <p className="text-sm text-gray-500 mb-1">Empenhos vinculados</p>
                              {empenhos.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {empenhos.map((emp, i) => (
                                    <Badge key={i} variant="outline" className="bg-green-50 text-green-700 border-green-200">{emp}</Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-gray-400 italic">Nenhum empenho vinculado</p>
                              )}
                            </div>
                            <Button variant="outline" size="sm" onClick={() => abrirModalEmpenho('of', of.id, of.numero, empenhos)}>
                              <Link2 className="w-3.5 h-3.5 mr-1" /> Vincular Empenho
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ==================== MODAL: OS ATENDIDA FORA DO SISTEMA ==================== */}
      <Dialog open={!!modalAtenderFora} onOpenChange={() => setModalAtenderFora(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              OS atendida fora do sistema — {modalAtenderFora?.numero}
            </DialogTitle>
            <DialogDescription>
              Use quando a execução desta OS já foi paga pela contabilidade sem medição no sistema.
              A OS será marcada como atendida e o saldo dos itens será consumido — o mesmo efeito
              que a medição aprovada teria. A ação fica registrada no histórico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium">Motivo *</p>
            <textarea
              className="w-full border rounded-md p-2 text-sm h-24"
              placeholder="Ex.: NF 307 emitida em 10/07/2026, liquidada e paga em 20/07/2026 (empenho 66)."
              value={motivoAtenderFora}
              onChange={(e) => setMotivoAtenderFora(e.target.value)}
            />
            {erroAtenderFora && <p className="text-sm text-red-600">{erroAtenderFora}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalAtenderFora(null)} disabled={salvandoAtenderFora}>Cancelar</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              disabled={salvandoAtenderFora || motivoAtenderFora.trim().length < 10}
              onClick={async () => {
                if (!modalAtenderFora) return
                setSalvandoAtenderFora(true)
                setErroAtenderFora(null)
                try {
                  const res = await authFetch(`${API_URL}/api/almoxarifado/requisicoes/${modalAtenderFora.id}/atender-fora-sistema`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ motivo: motivoAtenderFora.trim() }),
                  })
                  if (!res.ok) {
                    const data = await res.json().catch(() => null)
                    throw new Error(data?.message || 'Erro ao marcar OS como atendida')
                  }
                  setModalAtenderFora(null)
                  await carregarDados()
                } catch (e: any) {
                  setErroAtenderFora(e?.message || 'Erro ao marcar OS como atendida')
                } finally {
                  setSalvandoAtenderFora(false)
                }
              }}
            >
              {salvandoAtenderFora ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <AlertTriangle className="w-4 h-4 mr-1" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL: HISTÓRICO ==================== */}
      <Dialog open={!!detalheReq} onOpenChange={() => setDetalheReq(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Histórico — {detalheReq?.numero}
            </DialogTitle>
            <DialogDescription>Timeline de ações da requisição</DialogDescription>
          </DialogHeader>
          {loadingHistorico ? (
            <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
          ) : detalheHistorico.length === 0 ? (
            <p className="text-gray-500 text-center py-8">Nenhum registro encontrado</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {detalheHistorico.map((h, i) => (
                <div key={h.id || i} className="flex gap-3 text-sm">
                  <div className="flex flex-col items-center">
                    <div className="w-2 h-2 rounded-full bg-blue-400 mt-1.5" />
                    {i < detalheHistorico.length - 1 && <div className="w-px flex-1 bg-gray-200 mt-1" />}
                  </div>
                  <div className="flex-1 pb-3">
                    <p className="font-medium">{h.acao || h.descricao}</p>
                    {h.descricao && h.acao && <p className="text-gray-500">{h.descricao}</p>}
                    <p className="text-xs text-gray-400">{formatarData(h.created_at)} — {h.usuario_nome || 'Sistema'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ==================== MODAL: VINCULAR EMPENHO (mesmo padrão almoxarifado/ordens) ==================== */}
      <Dialog open={!!modalEmpenho} onOpenChange={() => setModalEmpenho(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-blue-600" />
              Vincular Empenho — {modalEmpenho?.numero}
            </DialogTitle>
            <DialogDescription>
              Selecione os empenhos do Portal Fator Transparência. O PDF será regerado com os dados atualizados quando aplicável.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Ano:</label>
              <select
                className="border rounded px-2 py-1 text-sm"
                value={anoEmpenho}
                onChange={e => setAnoEmpenho(e.target.value)}
              >
                {[0, 1, 2].map(d => {
                  const y = (new Date().getFullYear() - d).toString()
                  return <option key={y} value={y}>{y}</option>
                })}
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={buscarEmpenhosAno}
                disabled={loadingEmpenhosVincular}
              >
                {loadingEmpenhosVincular ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Buscar'}
              </Button>
            </div>

            {loadingEmpenhosVincular && (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                <span className="ml-2 text-sm text-gray-500">Buscando empenhos...</span>
              </div>
            )}

            {!loadingEmpenhosVincular && empenhosDisponiveis.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-4 italic">Nenhum empenho encontrado para este contrato neste ano.</p>
            )}

            {!loadingEmpenhosVincular && empenhosDisponiveis.length > 0 && (
              <div className="space-y-3">
                {empenhosComSaldo.length === 0 && empenhosSemSaldo.length > 0 && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Todos os empenhos deste contrato estão com saldo insuficiente. O vínculo ainda pode ser salvo, mas isso pode impactar a liquidação.</span>
                  </div>
                )}

                {algumSemSaldoSelecionado && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <span>Um ou mais empenhos selecionados estão com saldo insuficiente.</span>
                  </div>
                )}

                <div className="flex items-center gap-3 text-xs">
                  {empenhosComSaldo.length > 0 && (
                    <button
                      type="button"
                      onClick={selecionarTodosComSaldo}
                      className="text-blue-600 hover:text-blue-800 underline"
                    >
                      Selecionar todos com saldo
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEmpenhosSelecionados(new Set())}
                    className="text-gray-500 hover:text-gray-700 underline"
                  >
                    Limpar seleção
                  </button>
                  {empenhosSelecionados.size > 0 && (
                    <span className="ml-auto text-gray-500">
                      {empenhosSelecionados.size} selecionado{empenhosSelecionados.size > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
            )}

            {!loadingEmpenhosVincular && empenhosComSaldo.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-green-700">Disponíveis</p>
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {empenhosComSaldo.map((comp: any) => {
                    const num = comp.numero_empenho || comp.empenho?.numero_liquidacao || ''
                    const data = comp.empenho?.data || ''
                    const valor = comp.total_empenhado_bruto ?? comp.empenho?.valor ?? 0
                    const credor = comp.empenho?.credor || ''
                    const key = num || `sem-${data}`
                    const selecionado = empenhosSelecionados.has(num)
                    const saldoVirtual = comp.saldo_virtual ?? comp.saldo_a_liquidar
                    const comprometido = comp.comprometido ?? 0
                    const ano = comp.ano_exercicio
                    const fmt = (v: number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                    return (
                      <div
                        key={key}
                        onClick={() => num && toggleEmpenho(num)}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                          selecionado ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        } ${!num ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={selecionado}
                          disabled={!num}
                          className="mt-0.5 accent-blue-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-sm font-semibold">
                              {num ? `#${num}${ano ? `-${ano}` : ''}` : 's/n'}
                            </span>
                            <span className="text-xs text-gray-500">{data}</span>
                            <span className="text-xs font-medium text-green-700">
                              Emp. {fmt(valor)}
                            </span>
                            {comprometido > 0.01 && (
                              <span className="text-xs text-orange-600">Comprometido {fmt(comprometido)}</span>
                            )}
                            <span className="text-xs font-bold text-blue-700">
                              Disponível {fmt(saldoVirtual)}
                            </span>
                          </div>
                          <p className="text-xs text-gray-600 truncate mt-0.5">{credor}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {!loadingEmpenhosVincular && empenhosSemSaldo.length > 0 && (
              <details className="group">
                <summary className="flex cursor-pointer items-center gap-1 text-xs font-medium uppercase tracking-wide text-gray-500 hover:text-gray-700">
                  <RotateCcw className="h-3 w-3" />
                  Histórico ({empenhosSemSaldo.length} empenho{empenhosSemSaldo.length > 1 ? 's' : ''} sem saldo)
                  <ChevronDown className="h-3 w-3 transition-transform group-open:rotate-180" />
                </summary>
                <div className="mt-2 space-y-1">
                  {empenhosSemSaldo.map((comp: any) => {
                    const num = comp.numero_empenho || comp.empenho?.numero_liquidacao || ''
                    const data = comp.empenho?.data || ''
                    const credor = comp.empenho?.credor || ''
                    const key = `${num || 'sem'}-${data}`
                    const selecionado = empenhosSelecionados.has(num)
                    const ano = comp.ano_exercicio
                    return (
                      <div
                        key={key}
                        onClick={() => num && toggleEmpenho(num)}
                        className={`flex items-start gap-3 rounded-lg border p-3 transition-colors ${
                          selecionado ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                        } ${!num ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                      >
                        <input
                          type="checkbox"
                          readOnly
                          checked={selecionado}
                          disabled={!num}
                          className="mt-0.5 accent-amber-600"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200">Encerrado</Badge>
                            <span className="font-mono text-sm font-semibold text-gray-700">
                              {num ? `#${num}${ano ? `-${ano}` : ''}` : 's/n'}
                            </span>
                            <span className="text-xs text-gray-500">{data}</span>
                            <span className="text-xs font-medium text-gray-500">Saldo R$ 0,00</span>
                          </div>
                          <p className="text-xs text-gray-500 truncate mt-0.5">{credor}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </details>
            )}

            {empenhosSelecionados.size > 0 && (
              <div className="bg-blue-50 rounded-lg p-2 flex flex-wrap gap-1">
                <span className="text-xs text-blue-700 font-medium mr-1">Selecionados:</span>
                {Array.from(empenhosSelecionados).map(n => (
                  <Badge key={n} variant="outline" className="font-mono text-xs bg-blue-100 border-blue-300 text-blue-800">
                    #{n}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEmpenho(null)}>Cancelar</Button>
            <Button onClick={salvarEmpenhos} disabled={salvandoEmpenho} className="bg-blue-600 hover:bg-blue-700">
              {salvandoEmpenho ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Link2 className="h-4 w-4 mr-2" />}
              Salvar e Regerar PDF
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
