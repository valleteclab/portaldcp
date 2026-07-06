'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Gavel,
  MessageSquare,
  Pause,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
  ThumbsDown,
  ThumbsUp,
  UserCheck,
  XCircle,
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { useDisputaV3 } from '@/hooks/useDisputaV3'
import { DisputaV3Stepper } from '@/components/disputa-v3/disputa-v3-stepper'
import { RecursosPanel } from '@/components/disputa-v3/RecursosPanel'
import { HomologacaoPanel } from '@/components/disputa-v3/HomologacaoPanel'
import {
  formatarMoeda,
  formatarTempo,
  getItemStatusClass,
  getItemStatusLabel,
  getStatusBadgeClass,
  getStatusLabel,
} from '@/components/disputa-v3/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

function tempoPercentual(segundos: number, totalMinutos?: number) {
  if (!totalMinutos || totalMinutos <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((segundos / (totalMinutos * 60)) * 100)))
}

export default function DisputaV3OrgaoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const sessaoParam = searchParams.get('sessao')
  const licitacaoParam = searchParams.get('licitacao')

  const {
    sessaoId,
    board,
    mensagens,
    loading,
    error,
    wsConectado,
    selectedItemId,
    selectedItem,
    setSelectedItemId,
    actionError,
    sendingMessage,
    sendingCancel,
    iniciarItens,
    encerrarItem,
    suspenderSessao,
    retomarSessao,
    reiniciarSessao,
    enviarMensagem,
    pregoeiroCancelarLance,
  } = useDisputaV3({
    area: 'orgao',
    sessaoIdParam: sessaoParam,
    licitacaoIdParam: licitacaoParam,
  })

  const [selecionados, setSelecionados] = useState<string[]>([])
  const [novaMensagem, setNovaMensagem] = useState('')
  const [dialogoSuspender, setDialogoSuspender] = useState(false)
  const [dialogoReiniciar, setDialogoReiniciar] = useState(false)
  const [motivoSuspensao, setMotivoSuspensao] = useState<'ADMINISTRATIVO' | 'CAUTELAR' | 'JUDICIAL'>('ADMINISTRATIVO')
  const [justificativaSuspensao, setJustificativaSuspensao] = useState('')
  const [justificativaReinicio, setJustificativaReinicio] = useState('')
  const [dialogPregoeiroCancel, setDialogPregoeiroCancel] = useState<{
    itemId: string
    lanceId: string
  } | null>(null)
  const [justificativaCancelPregoeiro, setJustificativaCancelPregoeiro] = useState('')

  // === HABILITAÇÃO STATE ===
  type DocStatus = 'PENDENTE' | 'VALIDO' | 'INVALIDO'
  interface HabRanking {
    posicao: number
    fornecedorId: string
    razaoSocial: string
    cpfCnpj: string
    valorTotal: number
    status: string
    isConvocado: boolean
  }
  interface HabStatus {
    sessaoId: string
    licitacaoId: string
    etapa: string
    convocado: HabRanking | null
    ranking: HabRanking[]
  }
  const [habStatus, setHabStatus] = useState<HabStatus | null>(null)
  const [habLoading, setHabLoading] = useState(false)
  const [habDocStatus, setHabDocStatus] = useState<Record<string, DocStatus>>({})
  const [habMotivoReprovar, setHabMotivoReprovar] = useState('')
  const [habActionError, setHabActionError] = useState<string | null>(null)
  const [habActionLoading, setHabActionLoading] = useState(false)

  // === NEGOCIAÇÃO STATE ===
  interface NegVencedor { fornecedorId: string; razaoSocial: string; cpfCnpj: string; valorProposta: number; porte?: string | null }
  interface NegStatus { sessaoId: string; etapa: string; vencedor: NegVencedor | null; melhorLance: number | null; historicoNegociacao: { tipo: string; mensagem: string; remetente: string; dataHora: string }[] }
  const [negStatus, setNegStatus] = useState<NegStatus | null>(null)
  const [negValorFinal, setNegValorFinal] = useState('')
  const [negActionLoading, setNegActionLoading] = useState(false)
  const [negActionError, setNegActionError] = useState<string | null>(null)

  // === INTENÇÃO DE RECURSO STATE ===
  interface IntencaoItem { fornecedorId: string; mensagem: string; dataHora: string }
  interface IntencaoStatus { sessaoId: string; etapa: string; intencoes: IntencaoItem[]; participantes: { fornecedorId: string; razaoSocial: string }[]; semIntencao: { fornecedorId: string; razaoSocial: string }[]; totalIntencoes: number }
  const [intencaoStatus, setIntencaoStatus] = useState<IntencaoStatus | null>(null)
  const [intencaoActionLoading, setIntencaoActionLoading] = useState(false)
  const [intencaoActionError, setIntencaoActionError] = useState<string | null>(null)
  const [intencaoTimer, setIntencaoTimer] = useState(0)

  // === ADJUDICAÇÃO STATE ===
  interface AdjItem { itemId: string; numero: number; descricao: string; quantidade: number; unidade: string; vencedor: { fornecedorId: string; razaoSocial: string; cpfCnpj: string; valor: number } | null }
  interface AdjStatus { sessaoId: string; licitacaoId: string; etapa: string; itens: AdjItem[] }
  const [adjStatus, setAdjStatus] = useState<AdjStatus | null>(null)
  const [adjActionLoading, setAdjActionLoading] = useState(false)
  const [adjActionError, setAdjActionError] = useState<string | null>(null)
  const [adjDialogOpen, setAdjDialogOpen] = useState(false)

  const contexto = board?.contexto
  const aguardando = board?.colunas.aguardando || []
  const emDisputa = board?.colunas.emDisputa || []
  const encerrados = board?.colunas.encerrados || []

  const itemFoco = selectedItem || emDisputa[0] || aguardando[0] || encerrados[0] || null

  const percentualTempo = (() => {
    if (!itemFoco || itemFoco.status !== 'EM_DISPUTA') return 0
    const totalMinutos = itemFoco.cronometro.fase === 'PRORROGACAO'
      ? contexto?.cronometria.duracaoProrrogacaoMinutos
      : contexto?.cronometria.etapaAbertaMinutos
    return tempoPercentual(itemFoco.cronometro.tempoRestanteSegundos, totalMinutos)
  })()

  const toggleSelecionado = (itemId: string) => {
    setSelecionados((current) =>
      current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId],
    )
  }

  const iniciarSelecionados = () => {
    if (selecionados.length === 0) return
    iniciarItens(selecionados)
    setSelecionados([])
  }

  const abrirV2 = () => {
    if (!sessaoId) return
    router.push(`/orgao/disputa?sessao=${sessaoId}`)
  }

  const enviarMensagemChat = () => {
    if (!novaMensagem.trim()) return
    enviarMensagem(novaMensagem)
    setNovaMensagem('')
  }

  const confirmarSuspensao = () => {
    if (!justificativaSuspensao.trim()) return
    suspenderSessao({
      motivo: motivoSuspensao,
      justificativa: justificativaSuspensao.trim(),
    })
    setDialogoSuspender(false)
    setJustificativaSuspensao('')
  }

  const confirmarReinicio = () => {
    if (!justificativaReinicio.trim()) return
    reiniciarSessao(justificativaReinicio)
    setDialogoReiniciar(false)
    setJustificativaReinicio('')
  }

  // === HABILITAÇÃO LOGIC ===
  const etapaCodigo = contexto?.etapa?.codigo || ''
  const isHabilitacaoAtiva = etapaCodigo === 'HABILITACAO'

  const carregarHabilitacao = useCallback(async () => {
    if (!sessaoId) return
    setHabLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/habilitacao`)
      if (!res.ok) throw new Error('Erro ao carregar habilitação')
      const data: HabStatus = await res.json()
      setHabStatus(data)
      // Init doc status map for convocado if changed
      if (data.convocado) {
        setHabDocStatus((prev) => {
          const tipos = ['HABILITACAO_JURIDICA', 'REGULARIDADE_FISCAL', 'QUALIFICACAO_TECNICA', 'QUALIFICACAO_ECONOMICA']
          const next: Record<string, DocStatus> = {}
          tipos.forEach((t) => { next[t] = prev[t] || 'PENDENTE' })
          return next
        })
      }
    } catch {
      // silently ignore poll errors
    } finally {
      setHabLoading(false)
    }
  }, [sessaoId])

  useEffect(() => {
    if (!isHabilitacaoAtiva || !sessaoId) return
    carregarHabilitacao()
    const interval = setInterval(carregarHabilitacao, 5000)
    return () => clearInterval(interval)
  }, [isHabilitacaoAtiva, sessaoId, carregarHabilitacao])

  const convocarFornecedor = async (fornecedorId: string) => {
    if (!sessaoId) return
    setHabActionLoading(true)
    setHabActionError(null)
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/habilitacao/convocar/${fornecedorId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Erro ao convocar') }
      await carregarHabilitacao()
    } catch (e: any) {
      setHabActionError(e.message)
    } finally {
      setHabActionLoading(false)
    }
  }

  const aprovarHabilitacao = async () => {
    if (!sessaoId || !habStatus?.convocado) return
    setHabActionLoading(true)
    setHabActionError(null)
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/habilitacao/aprovar/${habStatus.convocado.fornecedorId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Erro ao aprovar') }
      await carregarHabilitacao()
    } catch (e: any) {
      setHabActionError(e.message)
    } finally {
      setHabActionLoading(false)
    }
  }

  const reprovarHabilitacao = async () => {
    if (!sessaoId || !habStatus?.convocado || !habMotivoReprovar.trim()) return
    setHabActionLoading(true)
    setHabActionError(null)
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/habilitacao/reprovar/${habStatus.convocado.fornecedorId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: habMotivoReprovar }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Erro ao reprovar') }
      setHabMotivoReprovar('')
      await carregarHabilitacao()
    } catch (e: any) {
      setHabActionError(e.message)
    } finally {
      setHabActionLoading(false)
    }
  }

  const toggleDoc = (tipo: string) => {
    setHabDocStatus((prev) => {
      const atual = prev[tipo] || 'PENDENTE'
      const proximo: DocStatus = atual === 'PENDENTE' ? 'VALIDO' : atual === 'VALIDO' ? 'INVALIDO' : 'PENDENTE'
      return { ...prev, [tipo]: proximo }
    })
  }

  const todosDocsValidos = Object.values(habDocStatus).length > 0 && Object.values(habDocStatus).every((s) => s === 'VALIDO')

  const DOC_LABELS: Record<string, string> = {
    HABILITACAO_JURIDICA: 'Habilitação Jurídica',
    REGULARIDADE_FISCAL: 'Regularidade Fiscal',
    QUALIFICACAO_TECNICA: 'Qualificação Técnica',
    QUALIFICACAO_ECONOMICA: 'Qualificação Econômica',
  }

  // === NEGOCIAÇÃO LOGIC ===
  const isNegociacaoAtiva = etapaCodigo === 'NEGOCIACAO'
  const carregarNegociacao = useCallback(async () => {
    if (!sessaoId) return
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/negociacao`)
      if (res.ok) setNegStatus(await res.json())
    } catch { /* silently ignore */ }
  }, [sessaoId])
  useEffect(() => {
    if (!isNegociacaoAtiva || !sessaoId) return
    carregarNegociacao()
    const iv = setInterval(carregarNegociacao, 5000)
    return () => clearInterval(iv)
  }, [isNegociacaoAtiva, sessaoId, carregarNegociacao])

  const encerrarNegociacaoFn = async (pularNegociacao = false) => {
    if (!sessaoId) return
    setNegActionLoading(true)
    setNegActionError(null)
    try {
      const valorFinal = pularNegociacao ? undefined : (negValorFinal ? Number(negValorFinal) : undefined)
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/negociacao/encerrar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valorFinal }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Erro ao encerrar negociação') }
      setNegValorFinal('')
    } catch (e: any) {
      setNegActionError(e.message)
    } finally {
      setNegActionLoading(false)
    }
  }

  // === INTENÇÃO DE RECURSO LOGIC ===
  const isIntencaoAtiva = etapaCodigo === 'RECURSOS'
  const carregarIntencao = useCallback(async () => {
    if (!sessaoId) return
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/recursos/intencoes`)
      if (res.ok) setIntencaoStatus(await res.json())
    } catch { /* silently ignore */ }
  }, [sessaoId])
  useEffect(() => {
    if (!isIntencaoAtiva || !sessaoId) return
    carregarIntencao()
    const iv = setInterval(carregarIntencao, 5000)
    // Timer countdown (30 min displayed)
    setIntencaoTimer(30 * 60)
    const tiv = setInterval(() => setIntencaoTimer(t => Math.max(0, t - 1)), 1000)
    return () => { clearInterval(iv); clearInterval(tiv) }
  }, [isIntencaoAtiva, sessaoId, carregarIntencao])

  const encerrarPrazoIntencao = async () => {
    if (!sessaoId) return
    setIntencaoActionLoading(true)
    setIntencaoActionError(null)
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/recursos/encerrar-prazo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Erro ao encerrar prazo') }
    } catch (e: any) {
      setIntencaoActionError(e.message)
    } finally {
      setIntencaoActionLoading(false)
    }
  }

  // === ADJUDICAÇÃO LOGIC ===
  const isAdjudicacaoAtiva = etapaCodigo === 'ADJUDICACAO'
  const carregarAdjudicacao = useCallback(async () => {
    if (!sessaoId) return
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/adjudicacao`)
      if (res.ok) setAdjStatus(await res.json())
    } catch { /* silently ignore */ }
  }, [sessaoId])
  useEffect(() => {
    if (!isAdjudicacaoAtiva || !sessaoId) return
    carregarAdjudicacao()
  }, [isAdjudicacaoAtiva, sessaoId, carregarAdjudicacao])

  const confirmarAdjudicacaoTodos = async () => {
    if (!sessaoId) return
    setAdjActionLoading(true)
    setAdjActionError(null)
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/adjudicar-todos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || 'Erro ao adjudicar') }
      setAdjDialogOpen(false)
    } catch (e: any) {
      setAdjActionError(e.message)
    } finally {
      setAdjActionLoading(false)
    }
  }

  const formatTimer = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0')
    const sec = (s % 60).toString().padStart(2, '0')
    return `${m}:${sec}`
  }

  return (
    <ModuleGuard modulo={ModuloSistema.DISPUTA} fallbackUrl="/orgao">
      <div className="min-h-screen bg-slate-50">
        <div className="border-b bg-white">
          <div className="px-6 py-3">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={getStatusBadgeClass(contexto?.status || 'AGENDADA')}>
                    {getStatusLabel(contexto?.status || 'AGENDADA')}
                  </Badge>
                  <Badge variant="outline">{contexto?.modo || 'ABERTO'}</Badge>
                  <Badge variant="outline">{contexto?.disputaPorItem ? 'Por item' : 'Por lote'}</Badge>
                  <Badge variant="outline" className={wsConectado ? 'border-emerald-300 text-emerald-700' : 'border-red-300 text-red-700'}>
                    {wsConectado ? 'WS online' : 'WS offline'}
                  </Badge>
                  {contexto?.operacao.anonimizacaoAtiva && (
                    <Badge variant="outline" className="border-violet-300 text-violet-700">
                      Anonimizacao ativa
                    </Badge>
                  )}
                </div>
                <div>
                  <h1 className="text-2xl font-semibold text-slate-900">Sala de Disputa V3</h1>
                  <p className="text-sm text-slate-600">
                    {contexto?.licitacao?.numero || contexto?.licitacao?.processo || 'Sessao ativa'} - {contexto?.licitacao?.objeto || 'Aguardando contexto da licitacao'}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={abrirV2} disabled={!sessaoId}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Abrir sala operacional V2
                </Button>
                {contexto?.operacao.suspensa ? (
                  <Button onClick={retomarSessao} className="bg-emerald-600 hover:bg-emerald-700">
                    <Play className="mr-2 h-4 w-4" />
                    Retomar
                  </Button>
                ) : (
                  <Button variant="outline" onClick={() => setDialogoSuspender(true)}>
                    <Pause className="mr-2 h-4 w-4" />
                    Suspender
                  </Button>
                )}
                <Button variant="outline" onClick={() => setDialogoReiniciar(true)}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Reiniciar
                </Button>
              </div>
            </div>

            <div className="mt-5">
              <DisputaV3Stepper contexto={contexto} />
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          {loading ? (
            <Card>
              <CardContent className="py-12 text-center text-slate-600">
                <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin" />
                Carregando cockpit da disputa V3...
              </CardContent>
            </Card>
          ) : error ? (
            <Card className="border-red-200">
              <CardContent className="py-12 text-center">
                <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
                <p className="font-medium text-red-700">{error}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-6">
              {(actionError || contexto?.cronometria.requerFluxoEspecificoNaV3) && (
                <Card className={actionError ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/60'}>
                  <CardContent className="flex flex-col gap-2 py-4 text-sm text-slate-700">
                    {actionError && (
                      <div className="flex items-start gap-2 text-red-700">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{actionError}</span>
                      </div>
                    )}
                    {contexto?.cronometria.requerFluxoEspecificoNaV3 && (
                      <div className="flex items-start gap-2 text-amber-800">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                          {contexto.cronometria.modo === 'ABERTO_FECHADO'
                            ? 'Modo aberto-fechado (IN SEGES/ME 73/2022, art. 24): a etapa aberta e o encerramento iminente aleatorio sao operados pela V2. Use "Abrir sala operacional V2" para controlar a fase de lance final fechado. A V3 exibe contexto e decisoes administrativas.'
                            : contexto.cronometria.modo === 'FECHADO_ABERTO'
                            ? 'Modo fechado-aberto (IN SEGES/ME 73/2022, art. 25): a classificacao previa e a selecao dos fornecedores na faixa de 10% sao realizadas pela V2. A etapa aberta subsequente deve ser acompanhada na V2. A V3 exibe contexto e decisoes administrativas.'
                            : 'Modo fechado (Lei 14.133/2021, art. 56): lances sigilosos sao operados exclusivamente pela V2. Use "Abrir sala operacional V2" para toda a operacao de lances.'}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 md:grid-cols-4">
                <Card>
                  <CardHeader>
                    <CardDescription>Aguardando</CardDescription>
                    <CardTitle>{board?.metricas.totalAguardando || 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Em disputa</CardDescription>
                    <CardTitle>{board?.metricas.totalEmDisputa || 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Encerrados</CardDescription>
                    <CardTitle>{board?.metricas.totalEncerrados || 0}</CardTitle>
                  </CardHeader>
                </Card>
                <Card>
                  <CardHeader>
                    <CardDescription>Base legal da cronometria</CardDescription>
                    <CardTitle className="text-base">{contexto?.cronometria.baseLegal || '-'}</CardTitle>
                  </CardHeader>
                </Card>
              </div>

              {board?.solicitacoesCancelamento && board.solicitacoesCancelamento.length > 0 && (
                <Card className="border-amber-200 bg-amber-50/50">
                  <CardHeader>
                    <CardTitle className="text-base">Solicitacoes de cancelamento de lance</CardTitle>
                    <CardDescription>
                      Fornecedores que ultrapassaram os 15 segundos para cancelamento direto aguardam sua
                      decisao.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {board.solicitacoesCancelamento.map((s) => (
                      <div
                        key={s.lanceId}
                        className="flex flex-col gap-3 rounded-xl border border-amber-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="space-y-1">
                          <div className="font-medium text-slate-900">
                            Item {s.itemNumero} — {formatarMoeda(s.valor)}
                          </div>
                          <div className="text-sm text-slate-600">{s.fornecedorNome}</div>
                          {s.motivo ? (
                            <div className="text-xs text-slate-500">Motivo: {s.motivo}</div>
                          ) : null}
                          <div className="text-xs text-slate-400">
                            Solicitado em {new Date(s.solicitadoEm).toLocaleString('pt-BR')}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          className="shrink-0 bg-amber-700 hover:bg-amber-800"
                          onClick={() => {
                            setDialogPregoeiroCancel({ itemId: s.itemId, lanceId: s.lanceId })
                            setJustificativaCancelPregoeiro('')
                          }}
                        >
                          Cancelar lance (pregoeiro)
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 xl:grid-cols-12">
                <div className="space-y-4 xl:col-span-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Fila operacional</CardTitle>
                      <CardDescription>Selecione itens para iniciar e escolha o foco da sessao.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex gap-2">
                        <Button className="flex-1" onClick={iniciarSelecionados} disabled={selecionados.length === 0}>
                          <Gavel className="mr-2 h-4 w-4" />
                          Iniciar selecionados
                        </Button>
                      </div>

                      <ScrollArea className="h-[calc(100vh-340px)] pr-3">
                        <div className="space-y-3">
                          {[{ titulo: 'Em disputa', itens: emDisputa }, { titulo: 'Aguardando', itens: aguardando }, { titulo: 'Encerrados', itens: encerrados }].map((grupo) => (
                            <div key={grupo.titulo} className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{grupo.titulo}</div>
                              {grupo.itens.length === 0 ? (
                                <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-slate-400">
                                  Nenhum item nesta coluna.
                                </div>
                              ) : (
                                grupo.itens.map((item) => {
                                  const selecionado = selectedItemId === item.id
                                  const marcado = selecionados.includes(item.id)
                                  return (
                                    <button
                                      key={item.id}
                                      type="button"
                                      onClick={() => setSelectedItemId(item.id)}
                                      className={`w-full rounded-xl border p-3 text-left transition ${
                                        selecionado ? 'border-blue-500 bg-blue-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                                      }`}
                                    >
                                      <div className="mb-2 flex items-start justify-between gap-2">
                                        <div>
                                          <div className="font-medium text-slate-900">Item {item.numero}</div>
                                          <div className="line-clamp-2 text-xs text-slate-600">{item.descricao}</div>
                                        </div>
                                        {item.status === 'AGUARDANDO' && (
                                          <div onClick={(e) => e.stopPropagation()}>
                                            <Checkbox checked={marcado} onCheckedChange={() => toggleSelecionado(item.id)} />
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge className={getItemStatusClass(item)}>{getItemStatusLabel(item)}</Badge>
                                        <Badge variant="outline">{item.totalLances} lances</Badge>
                                      </div>
                                    </button>
                                  )
                                })
                              )}
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4 xl:col-span-7">
                  <Card className="overflow-hidden">
                    <CardHeader className="border-b bg-slate-950 text-white">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-1">
                          <CardDescription className="text-slate-300">Item em foco</CardDescription>
                          <CardTitle className="text-2xl">
                            {itemFoco ? `Item ${itemFoco.numero}` : 'Selecione um item'}
                          </CardTitle>
                          <p className="max-w-2xl text-sm text-slate-300">
                            {itemFoco?.descricao || 'Escolha um item da fila para acompanhar os lances e as acoes da sessao.'}
                          </p>
                        </div>
                        {itemFoco && (
                          <div className="rounded-2xl bg-white/10 px-5 py-3 text-center">
                            <div className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                              {itemFoco.cronometro.fase === 'PRORROGACAO' ? 'Prorrogacao' : itemFoco.status === 'EM_DISPUTA' ? 'Etapa aberta' : 'Status'}
                            </div>
                            <div className="text-4xl font-semibold tabular-nums">
                              {formatarTempo(itemFoco.cronometro.tempoRestanteSegundos)}
                            </div>
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6 py-6">
                      {itemFoco ? (
                        <>
                          <div className="grid gap-4 md:grid-cols-3">
                            <Card>
                              <CardHeader>
                                <CardDescription>Melhor lance</CardDescription>
                                <CardTitle>{formatarMoeda(itemFoco.melhorLance?.valor)}</CardTitle>
                              </CardHeader>
                            </Card>
                            <Card>
                              <CardHeader>
                                <CardDescription>Participantes</CardDescription>
                                <CardTitle>{itemFoco.totalPropostas}</CardTitle>
                              </CardHeader>
                            </Card>
                            <Card>
                              <CardHeader>
                                <CardDescription>Quantidade</CardDescription>
                                <CardTitle>{itemFoco.quantidade} {itemFoco.unidade}</CardTitle>
                              </CardHeader>
                            </Card>
                          </div>

                          <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm text-slate-600">
                              <span>Ritmo da etapa</span>
                              <span>{percentualTempo}% do ciclo atual restante</span>
                            </div>
                            <Progress value={percentualTempo} />
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-slate-900">Acoes principais</h3>
                                <p className="text-sm text-slate-600">
                                  A V3 ja centraliza as decisoes principais da sessao.
                                </p>
                              </div>
                              <Badge variant="outline">{contexto?.etapa.codigo || 'ABERTURA'}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={() => itemFoco && encerrarItem(itemFoco.id)}
                                disabled={itemFoco.status !== 'EM_DISPUTA'}
                              >
                                Encerrar item
                              </Button>
                              <Button variant="outline" onClick={abrirV2}>
                                Configuracoes avancadas
                              </Button>
                            </div>
                          </div>

                          <div className="grid gap-4 md:grid-cols-2">
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base">Regras da rodada</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2 text-sm text-slate-600">
                                <div className="flex items-center justify-between">
                                  <span>Etapa aberta</span>
                                  <span>{contexto?.cronometria.etapaAbertaMinutos || '-'} min</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>Prorrogacao</span>
                                  <span>{contexto?.cronometria.duracaoProrrogacaoMinutos || '-'} min</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span>Intervalo configurado</span>
                                  <span>{contexto?.cronometria.intervaloMinimoLancesMinutos || '-'} unidade(s)</span>
                                </div>
                                <p className="pt-2 text-xs text-slate-500">{contexto?.cronometria.observacao}</p>
                              </CardContent>
                            </Card>
                            <Card>
                              <CardHeader>
                                <CardTitle className="text-base">Sinais de decisao</CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2 text-sm text-slate-600">
                                <div className="flex items-center gap-2">
                                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                  {itemFoco.totalLances} lances registrados neste item
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock3 className="h-4 w-4 text-blue-600" />
                                  Fase atual: {getItemStatusLabel(itemFoco)}
                                </div>
                                <div className="flex items-center gap-2">
                                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                                  {itemFoco.totalPropostas} participante(s) elegivel(is)
                                </div>
                              </CardContent>
                            </Card>
                          </div>
                        </>
                      ) : (
                        <div className="py-12 text-center text-slate-500">
                          Nenhum item disponivel para a sessao atual.
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="space-y-4 xl:col-span-3">
                  {isNegociacaoAtiva ? (
                    /* =============================================
                       PAINEL DE NEGOCIAÇÃO (Art. 61 Lei 14.133)
                       ============================================= */
                    <Card>
                      <CardHeader className="border-b bg-blue-50">
                        <CardTitle className="flex items-center gap-2 text-blue-800">
                          <MessageSquare className="h-4 w-4" />
                          Negociação (Art. 61)
                        </CardTitle>
                        <CardDescription>Negocie o preço com o 1º classificado antes da habilitação.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        {negActionError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {negActionError}
                          </div>
                        )}
                        {negStatus?.vencedor ? (
                          <div className="space-y-4">
                            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">1º Classificado</div>
                              <div className="mt-1 font-semibold text-slate-900">{negStatus.vencedor.razaoSocial}</div>
                              <div className="text-sm text-slate-600">{negStatus.vencedor.cpfCnpj}</div>
                              {negStatus.melhorLance && (
                                <div className="mt-1 text-sm font-medium text-blue-700">
                                  Melhor lance: {negStatus.melhorLance.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                </div>
                              )}
                            </div>

                            {negStatus.historicoNegociacao.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Histórico</div>
                                <ScrollArea className="h-28 pr-1">
                                  {negStatus.historicoNegociacao.map((h, i) => (
                                    <div key={i} className="mb-2 rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700">
                                      <span className="font-medium">{h.remetente}: </span>{h.mensagem}
                                    </div>
                                  ))}
                                </ScrollArea>
                              </div>
                            )}

                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Valor negociado (opcional)</div>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                                  placeholder="R$ 0,00"
                                  value={negValorFinal}
                                  onChange={(e) => setNegValorFinal(e.target.value)}
                                />
                              </div>
                            </div>

                            <Button
                              className="w-full bg-blue-600 hover:bg-blue-700"
                              onClick={() => encerrarNegociacaoFn(false)}
                              disabled={negActionLoading}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Registrar e avançar para habilitação
                            </Button>
                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => encerrarNegociacaoFn(true)}
                              disabled={negActionLoading}
                            >
                              Pular negociação → habilitação
                            </Button>
                          </div>
                        ) : (
                          <div className="py-6 text-center text-sm text-slate-400">
                            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
                            Carregando vencedor...
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : isHabilitacaoAtiva ? (
                    /* =============================================
                       PAINEL DE HABILITAÇÃO (Art. 62-70 Lei 14.133)
                       Substitui o chat quando em fase de habilitação
                       ============================================= */
                    <Card>
                      <CardHeader className="border-b bg-emerald-50">
                        <CardTitle className="flex items-center gap-2 text-emerald-800">
                          <UserCheck className="h-4 w-4" />
                          Habilitação
                        </CardTitle>
                        <CardDescription>
                          Art. 62-70 — Lei 14.133/2021. Convoque o vencedor e analise os documentos.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        {habActionError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {habActionError}
                          </div>
                        )}

                        {habLoading && !habStatus ? (
                          <div className="py-6 text-center text-sm text-slate-400">
                            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
                            Carregando...
                          </div>
                        ) : habStatus?.convocado ? (
                          /* Fornecedor convocado — mostrar identidade + docs */
                          <div className="space-y-4">
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                              <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Convocado</div>
                              <div className="mt-1 font-semibold text-slate-900">{habStatus.convocado.razaoSocial}</div>
                              <div className="text-sm text-slate-600">{habStatus.convocado.cpfCnpj}</div>
                              <div className="mt-1 text-sm font-medium text-emerald-700">
                                {habStatus.convocado.valorTotal?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Documentos</div>
                              {Object.entries(DOC_LABELS).map(([tipo, label]) => {
                                const status = habDocStatus[tipo] || 'PENDENTE'
                                return (
                                  <div key={tipo} className={`flex items-center justify-between rounded-lg border p-2 text-sm ${
                                    status === 'VALIDO' ? 'border-emerald-200 bg-emerald-50' :
                                    status === 'INVALIDO' ? 'border-red-200 bg-red-50' :
                                    'border-slate-200 bg-white'
                                  }`}>
                                    <span className={status === 'INVALIDO' ? 'text-red-700' : status === 'VALIDO' ? 'text-emerald-700' : 'text-slate-700'}>
                                      {label}
                                    </span>
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() => setHabDocStatus((p) => ({ ...p, [tipo]: 'VALIDO' }))}
                                        className={`rounded p-1 transition ${status === 'VALIDO' ? 'bg-emerald-600 text-white' : 'hover:bg-emerald-100 text-slate-400'}`}
                                        title="Aprovar documento"
                                      >
                                        <ThumbsUp className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setHabDocStatus((p) => ({ ...p, [tipo]: 'INVALIDO' }))}
                                        className={`rounded p-1 transition ${status === 'INVALIDO' ? 'bg-red-600 text-white' : 'hover:bg-red-100 text-slate-400'}`}
                                        title="Reprovar documento"
                                      >
                                        <ThumbsDown className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>

                            <Button
                              className="w-full bg-emerald-600 hover:bg-emerald-700"
                              onClick={aprovarHabilitacao}
                              disabled={habActionLoading || !todosDocsValidos}
                              title={!todosDocsValidos ? 'Todos os documentos devem estar aprovados' : ''}
                            >
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                              Habilitar fornecedor
                            </Button>

                            <div className="space-y-2">
                              <Textarea
                                value={habMotivoReprovar}
                                onChange={(e) => setHabMotivoReprovar(e.target.value)}
                                placeholder="Motivo da inabilitação (obrigatório para reprovar)..."
                                rows={3}
                              />
                              <Button
                                variant="destructive"
                                className="w-full"
                                onClick={reprovarHabilitacao}
                                disabled={habActionLoading || !habMotivoReprovar.trim()}
                              >
                                <XCircle className="mr-2 h-4 w-4" />
                                Inabilitar e convocar próximo
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Nenhum convocado ainda — mostrar ranking para convocar */
                          <div className="space-y-3">
                            <p className="text-sm text-slate-600">
                              Convoque o 1º classificado para apresentar documentos de habilitação.
                            </p>
                            <ScrollArea className="h-[calc(100vh-560px)] pr-1">
                              <div className="space-y-2">
                                {(habStatus?.ranking || []).map((item) => (
                                  <div
                                    key={item.fornecedorId}
                                    className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3"
                                  >
                                    <div>
                                      <div className="text-xs text-slate-500">{item.posicao}º colocado</div>
                                      <div className="font-medium text-slate-900">{item.razaoSocial}</div>
                                      <div className="text-sm text-slate-600">
                                        {item.valorTotal?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                      </div>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => convocarFornecedor(item.fornecedorId)}
                                      disabled={habActionLoading}
                                    >
                                      Convocar
                                    </Button>
                                  </div>
                                ))}
                                {(!habStatus?.ranking || habStatus.ranking.length === 0) && (
                                  <div className="rounded-lg border border-dashed px-3 py-5 text-sm text-slate-400">
                                    Nenhum classificado disponível.
                                  </div>
                                )}
                              </div>
                            </ScrollArea>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ) : isIntencaoAtiva ? (
                    /* =============================================
                       PAINEL DE INTENÇÃO DE RECURSO (Art. 165)
                       + gestão de recursos formais (razões/contrarrazões/decisão)
                       ============================================= */
                    <div className="space-y-4">
                    <Card>
                      <CardHeader className="border-b bg-amber-50">
                        <CardTitle className="flex items-center gap-2 text-amber-800">
                          <AlertTriangle className="h-4 w-4" />
                          Intenção de Recurso (Art. 165)
                        </CardTitle>
                        <CardDescription>Prazo para fornecedores manifestarem intenção de recorrer.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        {intencaoActionError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {intencaoActionError}
                          </div>
                        )}

                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                          <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">Tempo restante</div>
                          <div className="mt-1 text-3xl font-bold tabular-nums text-amber-800">{formatTimer(intencaoTimer)}</div>
                        </div>

                        {intencaoStatus && (
                          <div className="space-y-3">
                            {intencaoStatus.intencoes.length > 0 && (
                              <div className="space-y-2">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                                  Registraram intenção ({intencaoStatus.intencoes.length})
                                </div>
                                {intencaoStatus.intencoes.map((it, i) => (
                                  <div key={i} className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-sm">
                                    <div className="font-medium text-amber-800">
                                      {intencaoStatus.participantes.find(p => p.fornecedorId === it.fornecedorId)?.razaoSocial || it.fornecedorId}
                                    </div>
                                    <div className="text-xs text-slate-600">{it.mensagem}</div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {intencaoStatus.semIntencao.length > 0 && (
                              <div className="space-y-1">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sem manifestação</div>
                                {intencaoStatus.semIntencao.map((p, i) => (
                                  <div key={i} className="text-sm text-slate-500">{p.razaoSocial}</div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        <Button
                          className="w-full"
                          onClick={encerrarPrazoIntencao}
                          disabled={intencaoActionLoading}
                          variant={intencaoStatus && intencaoStatus.totalIntencoes > 0 ? 'default' : 'outline'}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          {intencaoStatus && intencaoStatus.totalIntencoes > 0
                            ? `Encerrar prazo (${intencaoStatus.totalIntencoes} intenção/ões → Prazo Recursal)`
                            : 'Encerrar prazo sem recursos → Adjudicar'
                          }
                        </Button>
                      </CardContent>
                    </Card>
                    {sessaoId && <RecursosPanel sessaoId={sessaoId} />}
                    </div>
                  ) : etapaCodigo === 'HOMOLOGACAO' ? (
                    sessaoId ? <HomologacaoPanel sessaoId={sessaoId} /> : null
                  ) : isAdjudicacaoAtiva ? (
                    /* =============================================
                       PAINEL DE ADJUDICAÇÃO (Art. 71)
                       ============================================= */
                    <Card>
                      <CardHeader className="border-b bg-slate-900 text-white">
                        <CardTitle className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Adjudicação (Art. 71)
                        </CardTitle>
                        <CardDescription className="text-slate-300">Confirme o vencedor de cada item antes de encerrar.</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4 pt-4">
                        {adjActionError && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                            {adjActionError}
                          </div>
                        )}

                        <ScrollArea className="h-[calc(100vh-560px)] pr-1">
                          <div className="space-y-3">
                            {(adjStatus?.itens || []).map((item) => (
                              <div key={item.itemId} className="rounded-xl border border-slate-200 bg-white p-3">
                                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Item {item.numero}</div>
                                <div className="font-medium text-slate-900">{item.descricao}</div>
                                {item.vencedor ? (
                                  <>
                                    <div className="mt-1 text-sm font-semibold text-emerald-700">
                                      {item.vencedor.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                                    </div>
                                    <div className="text-sm text-slate-600">{item.vencedor.razaoSocial}</div>
                                    <div className="text-xs text-slate-400">{item.vencedor.cpfCnpj}</div>
                                  </>
                                ) : (
                                  <div className="mt-1 text-sm text-slate-400">Sem lance registrado</div>
                                )}
                              </div>
                            ))}
                            {!adjStatus && (
                              <div className="py-6 text-center text-sm text-slate-400">
                                <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
                                Carregando itens...
                              </div>
                            )}
                          </div>
                        </ScrollArea>

                        <Button
                          className="w-full bg-emerald-700 hover:bg-emerald-800"
                          onClick={() => setAdjDialogOpen(true)}
                          disabled={adjActionLoading || !adjStatus?.itens?.some(i => i.vencedor)}
                        >
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Confirmar adjudicação de todos os itens
                        </Button>
                      </CardContent>
                    </Card>
                  ) : (
                    /* PAINEL PADRÃO — chat + governança */
                    <>
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <MessageSquare className="h-4 w-4" />
                            Comunicacao da sessao
                          </CardTitle>
                          <CardDescription>Mensagens oficiais e orientacoes rapidas do pregoeiro.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <ScrollArea className="h-[calc(100vh-520px)] pr-3">
                            <div className="space-y-3">
                              {mensagens.length === 0 ? (
                                <div className="rounded-lg border border-dashed px-3 py-5 text-sm text-slate-400">
                                  Nenhuma mensagem ainda.
                                </div>
                              ) : (
                                mensagens.map((mensagem, index) => (
                                  <div key={`${mensagem.remetente}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="mb-1 flex items-center justify-between gap-2">
                                      <Badge variant="outline">{mensagem.tipo}</Badge>
                                      <span className="text-xs text-slate-400">
                                        {new Date(mensagem.dataHora).toLocaleTimeString('pt-BR')}
                                      </span>
                                    </div>
                                    <div className="text-sm font-medium text-slate-800">{mensagem.remetente}</div>
                                    <div className="mt-1 text-sm text-slate-600">{mensagem.conteudo}</div>
                                  </div>
                                ))
                              )}
                            </div>
                          </ScrollArea>

                          <div className="space-y-2">
                            <Textarea
                              value={novaMensagem}
                              onChange={(event) => setNovaMensagem(event.target.value)}
                              placeholder="Envie uma orientacao oficial para a sala..."
                              rows={4}
                            />
                            <Button className="w-full" onClick={enviarMensagemChat} disabled={sendingMessage || !contexto?.operacao.chatHabilitado}>
                              <Send className="mr-2 h-4 w-4" />
                              Enviar mensagem
                            </Button>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Governanca e fallback</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3 text-sm text-slate-600">
                          <p>
                            Esta V3 ja usa o board e a semantica legal nova, mas ainda reaproveita os eventos operacionais da V2 para iniciar itens, encerrar item, suspender e retomar.
                          </p>
                          <Button variant="outline" className="w-full" onClick={abrirV2}>
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Abrir fallback operacional
                          </Button>
                        </CardContent>
                      </Card>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <Dialog open={dialogoSuspender} onOpenChange={setDialogoSuspender}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Suspender sessao</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {(['ADMINISTRATIVO', 'CAUTELAR', 'JUDICIAL'] as const).map((motivo) => (
                  <Button
                    key={motivo}
                    type="button"
                    variant={motivoSuspensao === motivo ? 'default' : 'outline'}
                    onClick={() => setMotivoSuspensao(motivo)}
                  >
                    {motivo}
                  </Button>
                ))}
              </div>
              <Textarea
                value={justificativaSuspensao}
                onChange={(event) => setJustificativaSuspensao(event.target.value)}
                placeholder="Descreva o motivo da suspensao..."
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogoSuspender(false)}>Cancelar</Button>
              <Button onClick={confirmarSuspensao}>Confirmar suspensao</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={dialogoReiniciar} onOpenChange={setDialogoReiniciar}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reiniciar sessao</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Use esta acao apenas quando for necessario recomecar a sessao. A V3 envia o comando para a operacao existente.
              </p>
              <Textarea
                value={justificativaReinicio}
                onChange={(event) => setJustificativaReinicio(event.target.value)}
                placeholder="Informe a justificativa do reinicio..."
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogoReiniciar(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={confirmarReinicio}>Reiniciar sessao</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={dialogPregoeiroCancel !== null}
          onOpenChange={(open) => {
            if (!open) {
              setDialogPregoeiroCancel(null)
              setJustificativaCancelPregoeiro('')
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar lance (decisao do pregoeiro)</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-slate-600">
              Registre a justificativa do cancelamento. O lance deixara de valer e a cronometria sera recalculada.
            </p>
            <Textarea
              value={justificativaCancelPregoeiro}
              onChange={(e) => setJustificativaCancelPregoeiro(e.target.value)}
              rows={4}
              placeholder="Justificativa obrigatoria"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogPregoeiroCancel(null)}>
                Voltar
              </Button>
              <Button
                type="button"
                disabled={sendingCancel || !justificativaCancelPregoeiro.trim() || !dialogPregoeiroCancel}
                onClick={async () => {
                  if (!dialogPregoeiroCancel) return
                  await pregoeiroCancelarLance(
                    dialogPregoeiroCancel.itemId,
                    dialogPregoeiroCancel.lanceId,
                    justificativaCancelPregoeiro,
                  )
                  setDialogPregoeiroCancel(null)
                  setJustificativaCancelPregoeiro('')
                }}
              >
                Confirmar cancelamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog de confirmação de adjudicação */}
        <Dialog open={adjDialogOpen} onOpenChange={setAdjDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Adjudicação</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Você está prestes a adjudicar o objeto licitado ao(s) vencedor(es) de cada item, conforme Art. 71 da Lei 14.133/2021.
              </p>
              {adjStatus?.itens?.filter(i => i.vencedor).map(item => (
                <div key={item.itemId} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                  <div className="font-semibold">Item {item.numero}</div>
                  <div className="text-slate-700">{item.vencedor?.razaoSocial}</div>
                  <div className="text-emerald-700 font-medium">
                    {item.vencedor?.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </div>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdjDialogOpen(false)}>Cancelar</Button>
              <Button
                className="bg-emerald-700 hover:bg-emerald-800"
                onClick={confirmarAdjudicacaoTodos}
                disabled={adjActionLoading}
              >
                Confirmar Adjudicação
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ModuleGuard>
  )
}
