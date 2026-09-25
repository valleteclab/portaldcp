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
import { ItensDoLote, rotuloUnidade } from '@/components/disputa-v3/unidade-lote'
import { DisputaV3Stepper } from '@/components/disputa-v3/disputa-v3-stepper'
import { RecursosPanel } from '@/components/disputa-v3/RecursosPanel'
import { ResultadoPanel } from '@/components/resultado/ResultadoPanel'
import { AceitacaoPanel } from '@/components/disputa-v3/AceitacaoPanel'
import { HabilitacaoPanel } from '@/components/disputa-v3/HabilitacaoPanel'
import { DesempatePanel } from '@/components/disputa-v3/DesempatePanel'
import { BeneficioMeEppPanel } from '@/components/disputa-v3/BeneficioMeEppPanel'
import { NegociacaoPanel } from '@/components/disputa-v3/NegociacaoPanel'
import {
  descricaoFaseItem,
  formatarMoeda,
  getItemStatusClass,
  getItemStatusLabel,
  getStatusBadgeClass,
  getStatusLabel,
  rotuloModo,
  textoCronometro,
} from '@/components/disputa-v3/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
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
    reiniciarDemais,
    agendarRetomada,
    enviarMensagem,
    pregoeiroCancelarLance,
    negociacaoVersao,
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
  // Reinício para as demais colocações (Lei 14.133 art. 56 §4º) e retomada após desconexão (IN 73 art. 27)
  const [dialogoReinicioDemais, setDialogoReinicioDemais] = useState(false)
  const [justificativaReinicioDemais, setJustificativaReinicioDemais] = useState('')
  const [dataRetomada, setDataRetomada] = useState('')
  const [dialogPregoeiroCancel, setDialogPregoeiroCancel] = useState<{
    itemId: string
    lanceId: string
  } | null>(null)
  const [justificativaCancelPregoeiro, setJustificativaCancelPregoeiro] = useState('')

  // === HABILITAÇÃO (plano E4) ===
  // Toda a habilitação está no HabilitacaoPanel (/api/habilitacao): exigências do
  // edital, registro cadastral, documentos, diligência, habilitar/inabilitar.
  // O antigo checklist só no navegador (habDocStatus) foi removido.

  // === INTENÇÃO DE RECURSO STATE ===

  // === RESULTADO (plano E6) ===
  // Adjudicação e homologação: ResultadoPanel (/api/resultado). O painel
  // antigo (sessao/adjudicar-todos, sessao/homologar com autoridade digitada)
  // foi removido.

  const contexto = board?.contexto
  const aguardando = board?.colunas.aguardando || []
  const emDisputa = board?.colunas.emDisputa || []
  const encerrados = board?.colunas.encerrados || []

  const itemFoco = selectedItem || emDisputa[0] || aguardando[0] || encerrados[0] || null

  // Fase do item no modo de disputa (E2.4)
  const tempoOculto = !!itemFoco?.cronometro.oculto || itemFoco?.faseModo === 'ALEATORIO'
  const descricaoFase = itemFoco ? descricaoFaseItem(itemFoco) : null
  const modoAtual = itemFoco?.modoDisputa || contexto?.modo
  const encerramentoAutomatico = modoAtual === 'ABERTO_FECHADO'
  const podeReiniciarDemais =
    !!itemFoco && itemFoco.status === 'ENCERRADO' && (modoAtual === 'ABERTO' || modoAtual === 'FECHADO_ABERTO')
  const suspensaPorDesconexao = !!contexto?.operacao.motivoSuspensao?.startsWith('DESCONEXAO_AGENTE')
  const rotuloCronometro = !itemFoco || itemFoco.status !== 'EM_DISPUTA'
    ? 'Status'
    : tempoOculto
      ? 'Fechamento iminente'
      : itemFoco.faseModo === 'FECHADA'
        ? 'Lance final fechado'
        : itemFoco.cronometro.fase === 'PRORROGACAO'
          ? 'Prorrogacao'
          : 'Etapa aberta'
  const percentualTempo = (() => {
    if (!itemFoco || itemFoco.status !== 'EM_DISPUTA' || tempoOculto) return 0
    const totalMinutos = itemFoco.cronometro.fase === 'PRORROGACAO'
      ? contexto?.cronometria.duracaoProrrogacaoMinutos
      : itemFoco.cronometro.fase === 'LANCE_FECHADO'
        ? contexto?.cronometria.lanceFinalFechadoMinutos
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

  const confirmarReinicioDemais = async () => {
    if (!itemFoco || !justificativaReinicioDemais.trim()) return
    const ok = await reiniciarDemais(itemFoco.id, justificativaReinicioDemais)
    if (ok) {
      setDialogoReinicioDemais(false)
      setJustificativaReinicioDemais('')
    }
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

  // === NEGOCIAÇÃO (art. 61) ===
  // Por unidade, em /api/julgamento (NegociacaoPanel): na etapa de aceitação junto do painel de
  // aceitação e, em sessões antigas paradas na etapa NEGOCIACAO, sozinho.
  const isNegociacaoAtiva = etapaCodigo === 'NEGOCIACAO'

  // === RECURSOS (art. 165) — plano E5 ===
  // Janela de intenção, admissibilidade, prazos, reconsideração e autoridade:
  // tudo no RecursosPanel (/api/recursos). O fluxo antigo por eventos
  // (intencoes/encerrar-prazo com contagem fixa na tela) foi removido.
  const isIntencaoAtiva = etapaCodigo === 'RECURSOS'

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
                  <Badge variant="outline">Modo {rotuloModo(contexto?.modo)}</Badge>
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
              {actionError && (
                <Card className="border-red-200 bg-red-50/60">
                  <CardContent className="flex items-start gap-2 py-4 text-sm text-red-700">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{actionError}</span>
                  </CardContent>
                </Card>
              )}

              {contexto && contexto.modo !== 'ABERTO' && (
                <Card className="border-violet-200 bg-violet-50/60">
                  <CardContent className="flex flex-col gap-2 py-4 text-sm text-violet-900">
                    <div className="font-medium">
                      Modo {rotuloModo(contexto.modo)} — {contexto.cronometria.baseLegal}
                    </div>
                    {contexto.cronometria.fases && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {contexto.cronometria.fases.map((f, i) => (
                          <Badge key={f} variant="outline" className="border-violet-300 text-violet-800">
                            {i + 1}. {f}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <span className="text-xs text-violet-800">{contexto.cronometria.observacao}</span>
                  </CardContent>
                </Card>
              )}

              {suspensaPorDesconexao && contexto?.operacao.suspensa && (
                <Card className="border-amber-300 bg-amber-50/70">
                  <CardContent className="flex flex-col gap-3 py-4 text-sm text-amber-900">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>
                        Sessão suspensa automaticamente: o agente de contratação ficou desconectado por mais de 10 minutos durante
                        os lances. Ela só pode ser reiniciada decorridas 24 horas da comunicação da data aos participantes
                        (IN SEGES 73/2022, art. 27 §1º).
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        type="datetime-local"
                        className="max-w-xs bg-white"
                        value={dataRetomada}
                        onChange={(e) => setDataRetomada(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        disabled={!dataRetomada}
                        onClick={async () => {
                          if (await agendarRetomada(dataRetomada)) setDataRetomada('')
                        }}
                      >
                        Comunicar data de reinício
                      </Button>
                    </div>
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
                                          <div className="font-medium text-slate-900">{rotuloUnidade(item)}</div>
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
                            {itemFoco ? rotuloUnidade(itemFoco) : 'Selecione um item'}
                          </CardTitle>
                          <p className="max-w-2xl text-sm text-slate-300">
                            {itemFoco?.descricao || 'Escolha um item da fila para acompanhar os lances e as acoes da sessao.'}
                          </p>
                        </div>
                        {itemFoco && (
                          <div className="rounded-2xl bg-white/10 px-5 py-3 text-center">
                            <div className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-300">{rotuloCronometro}</div>
                            <div className="text-4xl font-semibold tabular-nums">{textoCronometro(itemFoco)}</div>
                            {tempoOculto && (
                              <div className="mt-1 text-[11px] text-slate-300">tempo aleatório sigiloso (até 10 min)</div>
                            )}
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
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge className={getItemStatusClass(itemFoco)}>{getItemStatusLabel(itemFoco)}</Badge>
                              {itemFoco.participacaoRestrita && itemFoco.classificadosFase != null && (
                                <Badge variant="outline">{itemFoco.classificadosFase} classificado(s) nesta fase</Badge>
                              )}
                              {itemFoco.faseModo === 'FECHADA' && (
                                <Badge variant="outline" className="border-violet-300 text-violet-800">
                                  {itemFoco.lancesFechadosRecebidos ?? 0} lance(s) final(is) recebido(s) — valores sigilosos até o fim do prazo
                                </Badge>
                              )}
                            </div>
                            {descricaoFase && (
                              <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                                {descricaoFase}
                              </div>
                            )}
                            <ItensDoLote item={itemFoco} visao="PREGOEIRO" />
                          </div>

                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="mb-3 flex items-center justify-between">
                              <div>
                                <h3 className="font-semibold text-slate-900">Acoes principais</h3>
                                <p className="text-sm text-slate-600">
                                  {encerramentoAutomatico
                                    ? 'Modo aberto e fechado: as fases e o encerramento são automáticos (IN 73 art. 24).'
                                    : 'Atos do pregoeiro sobre o item em foco.'}
                                </p>
                              </div>
                              <Badge variant="outline">{contexto?.etapa.codigo || 'ABERTURA'}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                onClick={() => itemFoco && encerrarItem(itemFoco.id)}
                                disabled={itemFoco.status !== 'EM_DISPUTA' || encerramentoAutomatico}
                              >
                                Encerrar item
                              </Button>
                              {podeReiniciarDemais && (
                                <Button variant="outline" onClick={() => setDialogoReinicioDemais(true)}>
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                  Reiniciar para demais colocações
                                </Button>
                              )}
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
                  {/* BENEFÍCIO ME/EPP (LC 123 arts. 44-45): aparece com desempate em curso (ou na etapa BENEFICIO_MPE) */}
                  {sessaoId && <BeneficioMeEppPanel sessaoId={sessaoId} sempreVisivel={etapaCodigo === 'BENEFICIO_MPE'} />}
                  {/* DESEMPATE (Lei 14.133 art. 60; IN 73 art. 28): aparece só com empate nas unidades encerradas */}
                  {sessaoId && <DesempatePanel sessaoId={sessaoId} />}
                  {/* INVERSÃO DE FASES (art. 17 §1º): habilitação de todos antes da disputa — só aparece nesse caso */}
                  {contexto?.licitacaoId && (etapaCodigo === 'ABERTURA' || etapaCodigo === 'ANALISE_PROPOSTAS') && (
                    <HabilitacaoPanel licitacaoId={contexto.licitacaoId} somentePreviaInversao />
                  )}
                  {etapaCodigo === 'ACEITACAO' && sessaoId ? (
                    /* =============================================
                       PAINEL DE ACEITAÇÃO DA PROPOSTA (IN 73/2022 art. 29)
                       ============================================= */
                    <div className="space-y-4">
                      <AceitacaoPanel sessaoId={sessaoId} />
                      <NegociacaoPanel sessaoId={sessaoId} versao={negociacaoVersao} />
                    </div>
                  ) : isNegociacaoAtiva && sessaoId ? (
                    /* =============================================
                       PAINEL DE NEGOCIAÇÃO (Art. 61 Lei 14.133; IN 73 art. 30)
                       ============================================= */
                    <NegociacaoPanel sessaoId={sessaoId} versao={negociacaoVersao} />
                  ) : isHabilitacaoAtiva ? (
                    /* HABILITAÇÃO (Arts. 62-70 Lei 14.133; IN 73 art. 39) — plano E4 */
                    contexto?.licitacaoId ? <HabilitacaoPanel licitacaoId={contexto.licitacaoId} /> : null
                  ) : isIntencaoAtiva ? (
                    /* RECURSOS (Art. 165) — janela de intenção, admissibilidade, prazos,
                       reconsideração do agente e decisão da autoridade superior (E5) */
                    sessaoId ? (
                      <div className="space-y-4">
                        <RecursosPanel sessaoId={sessaoId} />
                        {/* Sem recurso (janela encerrada) ou recursos decididos → adjudicação (E6) */}
                        {contexto?.licitacaoId && <ResultadoPanel licitacaoId={contexto.licitacaoId} />}
                      </div>
                    ) : null
                  ) : etapaCodigo === 'HOMOLOGACAO' || etapaCodigo === 'ADJUDICACAO' || etapaCodigo === 'ENCERRAMENTO' ? (
                    /* RESULTADO (Art. 71) — adjudicação e homologação (plano E6) */
                    contexto?.licitacaoId ? <ResultadoPanel licitacaoId={contexto.licitacaoId} /> : null
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
                            Todos os modos de disputa (aberto, aberto e fechado, fechado e aberto, fechado) rodam no motor único da
                            sala: iniciar itens, fases, lances, encerramento, suspensão e retomada.
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

        <Dialog open={dialogoReinicioDemais} onOpenChange={setDialogoReinicioDemais}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reiniciar a disputa para as demais colocações</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Lei 14.133/2021, art. 56 §4º: definida a melhor proposta, se a diferença para a 2ª colocada for de pelo menos 5%,
                a Administração pode admitir o reinício da disputa aberta para definir as demais colocações. A 1ª colocação é
                mantida e nenhum lance poderá alcançá-la. O sistema confere o percentual.
              </p>
              <Textarea
                value={justificativaReinicioDemais}
                onChange={(event) => setJustificativaReinicioDemais(event.target.value)}
                placeholder="Justificativa (obrigatória)..."
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogoReinicioDemais(false)}>Cancelar</Button>
              <Button onClick={confirmarReinicioDemais} disabled={!justificativaReinicioDemais.trim()}>
                Reiniciar para demais colocações
              </Button>
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

      </div>
    </ModuleGuard>
  )
}
