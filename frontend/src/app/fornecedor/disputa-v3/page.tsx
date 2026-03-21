'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
  ArrowDown,
  Clock3,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Send,
  Trophy,
} from 'lucide-react'
import { useDisputaV3 } from '@/hooks/useDisputaV3'
import {
  calcularDiferencaParaLider,
  calcularLanceSugerido,
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
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'

function getPosicaoClass(posicao?: number | null) {
  if (posicao === 1) return 'text-emerald-700'
  if (posicao === 2) return 'text-amber-700'
  if (posicao === 3) return 'text-orange-700'
  return 'text-slate-700'
}

function getPosicaoLabel(posicao?: number | null) {
  if (!posicao) return 'Sem lance'
  if (posicao === 1) return 'Voce esta liderando'
  if (posicao === 2) return 'Voce esta em 2o lugar'
  if (posicao === 3) return 'Voce esta em 3o lugar'
  return `Voce esta em ${posicao}o lugar`
}

export default function DisputaV3FornecedorPage() {
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
    sendingBid,
    sendingMessage,
    enviarMensagem,
    enviarLance,
  } = useDisputaV3({
    area: 'fornecedor',
    sessaoIdParam: sessaoParam,
    licitacaoIdParam: licitacaoParam,
  })

  const [valorLance, setValorLance] = useState('')
  const [novaMensagem, setNovaMensagem] = useState('')

  const contexto = board?.contexto
  const itensOrdenados = board ? [...board.colunas.emDisputa, ...board.colunas.aguardando, ...board.colunas.encerrados] : []
  const itemFoco = selectedItem || itensOrdenados[0] || null
  const diferenca = calcularDiferencaParaLider(itemFoco)
  const lanceSugerido = calcularLanceSugerido(itemFoco)
  const percentualTempo = (() => {
    if (!itemFoco || itemFoco.status !== 'EM_DISPUTA') return 0
    const totalMinutos = itemFoco.cronometro.fase === 'PRORROGACAO'
      ? contexto?.cronometria.duracaoProrrogacaoMinutos
      : contexto?.cronometria.etapaAbertaMinutos
    if (!totalMinutos) return 0
    return Math.max(0, Math.min(100, Math.round((itemFoco.cronometro.tempoRestanteSegundos / (totalMinutos * 60)) * 100)))
  })()

  const abrirV2 = () => {
    if (!sessaoId) return
    router.push(`/fornecedor/disputa?sessao=${sessaoId}`)
  }

  const usarSugestao = () => {
    if (lanceSugerido === null) return
    setValorLance(String(lanceSugerido.toFixed(2)).replace('.', ','))
  }

  const confirmarLance = () => {
    if (!itemFoco || !valorLance) return
    const valor = Number(valorLance.replace(',', '.'))
    if (!Number.isFinite(valor) || valor <= 0) return
    enviarLance(itemFoco.id, valor)
    setValorLance('')
  }

  const confirmarMensagem = () => {
    if (!novaMensagem.trim()) return
    enviarMensagem(novaMensagem)
    setNovaMensagem('')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={getStatusBadgeClass(contexto?.status || 'AGENDADA')}>
                {getStatusLabel(contexto?.status || 'AGENDADA')}
              </Badge>
              <Badge variant="outline">{contexto?.modo || 'ABERTO'}</Badge>
              <Badge variant="outline" className={wsConectado ? 'border-emerald-300 text-emerald-700' : 'border-red-300 text-red-700'}>
                {wsConectado ? 'WS online' : 'WS offline'}
              </Badge>
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Sala de Disputa V3</h1>
              <p className="text-sm text-slate-600">
                {contexto?.licitacao?.numero || contexto?.licitacao?.processo || 'Sessao ativa'} - {contexto?.licitacao?.objeto || 'Aguardando contexto da licitacao'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={abrirV2} disabled={!sessaoId}>
              <ExternalLink className="mr-2 h-4 w-4" />
              Abrir sala V2
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-600">
              <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin" />
              Carregando experiencia da disputa V3...
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
                <CardContent className="py-4 text-sm text-red-700">{actionError}</CardContent>
              </Card>
            )}

            <div className="grid gap-4 lg:grid-cols-4">
              <Card className="lg:col-span-3 overflow-hidden">
                <CardHeader className="border-b bg-emerald-950 text-white">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <CardDescription className="text-emerald-200">Item em foco</CardDescription>
                      <CardTitle className="text-3xl">
                        {itemFoco ? `Item ${itemFoco.numero}` : 'Selecione um item'}
                      </CardTitle>
                      <p className="max-w-2xl text-sm text-emerald-100">
                        {itemFoco?.descricao || 'Escolha um item da disputa para acompanhar sua posicao e enviar um novo lance.'}
                      </p>
                    </div>
                    {itemFoco && (
                      <div className="rounded-2xl bg-white/10 px-5 py-3 text-center">
                        <div className="mb-1 text-xs uppercase tracking-[0.2em] text-emerald-200">Tempo restante</div>
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
                        <Card className="border-emerald-100 bg-emerald-50/70">
                          <CardHeader>
                            <CardDescription>Minha posicao</CardDescription>
                            <CardTitle className={`text-3xl ${getPosicaoClass(itemFoco.minhaPosicao)}`}>
                              {itemFoco.minhaPosicao ? `${itemFoco.minhaPosicao}o` : '--'}
                            </CardTitle>
                            <p className="text-sm text-slate-600">{getPosicaoLabel(itemFoco.minhaPosicao)}</p>
                          </CardHeader>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardDescription>Melhor lance atual</CardDescription>
                            <CardTitle>{formatarMoeda(itemFoco.melhorLance?.valor)}</CardTitle>
                          </CardHeader>
                        </Card>
                        <Card>
                          <CardHeader>
                            <CardDescription>Meu melhor lance</CardDescription>
                            <CardTitle>{formatarMoeda(itemFoco.meuMelhorLance)}</CardTitle>
                          </CardHeader>
                        </Card>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-sm text-slate-600">
                          <span>{getItemStatusLabel(itemFoco)}</span>
                          <span>{percentualTempo}% do ciclo atual restante</span>
                        </div>
                        <Progress value={percentualTempo} />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Meu painel de decisao</CardTitle>
                          </CardHeader>
                          <CardContent className="space-y-3 text-sm text-slate-600">
                            <div className="flex items-center justify-between">
                              <span>Diferenca para o lider</span>
                              <strong>{diferenca === null ? '-' : formatarMoeda(diferenca)}</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Proposta inicial</span>
                              <strong>{formatarMoeda(itemFoco.minhaPropostaInicial)}</strong>
                            </div>
                            <div className="flex items-center justify-between">
                              <span>Status do item</span>
                              <Badge className={getItemStatusClass(itemFoco)}>{getItemStatusLabel(itemFoco)}</Badge>
                            </div>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Novo lance</CardTitle>
                            <CardDescription>
                              Lance abaixo do melhor atual e do seu proprio ultimo lance.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <Input
                              value={valorLance}
                              onChange={(event) => setValorLance(event.target.value)}
                              placeholder="Digite o valor em R$"
                              disabled={itemFoco.status !== 'EM_DISPUTA' || sendingBid}
                            />
                            <div className="flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                              <span>Sugestao visual</span>
                              <button
                                type="button"
                                className="font-medium text-emerald-700 disabled:text-slate-400"
                                onClick={usarSugestao}
                                disabled={lanceSugerido === null}
                              >
                                {lanceSugerido === null ? '-' : formatarMoeda(lanceSugerido)}
                              </button>
                            </div>
                            <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={confirmarLance} disabled={itemFoco.status !== 'EM_DISPUTA' || sendingBid}>
                              <ArrowDown className="mr-2 h-4 w-4" />
                              {sendingBid ? 'Enviando...' : 'Enviar lance'}
                            </Button>
                          </CardContent>
                        </Card>
                      </div>
                    </>
                  ) : (
                    <div className="py-12 text-center text-slate-500">Nenhum item disponivel para sua participacao.</div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-4 lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle>Meus itens</CardTitle>
                    <CardDescription>Troque o foco rapidamente e acompanhe sua posicao.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[320px] pr-3">
                      <div className="space-y-3">
                        {itensOrdenados.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedItemId(item.id)}
                            className={`w-full rounded-xl border p-3 text-left transition ${
                              selectedItemId === item.id ? 'border-emerald-500 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'
                            }`}
                          >
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <div className="font-medium text-slate-900">Item {item.numero}</div>
                              {item.minhaPosicao === 1 && (
                                <Badge className="bg-yellow-100 text-yellow-800">
                                  <Trophy className="mr-1 h-3 w-3" />
                                  Lider
                                </Badge>
                              )}
                            </div>
                            <div className="line-clamp-2 text-xs text-slate-600">{item.descricao}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge className={getItemStatusClass(item)}>{getItemStatusLabel(item)}</Badge>
                              {item.minhaPosicao && <Badge variant="outline">{item.minhaPosicao}o lugar</Badge>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Mensagens
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <ScrollArea className="h-[220px] pr-3">
                      <div className="space-y-3">
                        {mensagens.length === 0 ? (
                          <div className="rounded-lg border border-dashed px-3 py-4 text-sm text-slate-400">
                            Nenhuma mensagem recebida.
                          </div>
                        ) : (
                          mensagens.map((mensagem, index) => (
                            <div key={`${mensagem.remetente}-${index}`} className="rounded-xl border border-slate-200 bg-white p-3">
                              <div className="mb-1 flex items-center justify-between">
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
                        rows={3}
                        placeholder="Enviar mensagem ao pregoeiro..."
                        disabled={!contexto?.operacao.chatHabilitado}
                      />
                      <Button className="w-full" onClick={confirmarMensagem} disabled={sendingMessage || !contexto?.operacao.chatHabilitado}>
                        <Send className="mr-2 h-4 w-4" />
                        Enviar mensagem
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Regras visiveis</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-blue-600" />
                      Etapa aberta: {contexto?.cronometria.etapaAbertaMinutos || '-'} min
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-emerald-600" />
                      Prorrogacao: {contexto?.cronometria.duracaoProrrogacaoMinutos || '-'} min
                    </div>
                    <p className="pt-2 text-xs text-slate-500">{contexto?.cronometria.observacao}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
