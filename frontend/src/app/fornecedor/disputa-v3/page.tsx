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
import { PropostaAdequadaPanel } from '@/components/disputa-v3/PropostaAdequadaPanel'
import { ItensDoLote, ehLote, rotuloUnidade } from '@/components/disputa-v3/unidade-lote'
import {
  calcularDiferencaParaLider,
  calcularLanceSugerido,
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
    sendingCancel,
    meusLances,
    enviarMensagem,
    enviarLance,
    cancelarLanceDireto,
    solicitarCancelamentoLance,
  } = useDisputaV3({
    area: 'fornecedor',
    sessaoIdParam: sessaoParam,
    licitacaoIdParam: licitacaoParam,
  })

  const [valorLance, setValorLance] = useState('')
  const [novaMensagem, setNovaMensagem] = useState('')
  const [dialogSolicitarLanceId, setDialogSolicitarLanceId] = useState<string | null>(null)
  const [motivoSolicitar, setMotivoSolicitar] = useState('')
  const [confirmarFechado, setConfirmarFechado] = useState<number | null>(null)

  const contexto = board?.contexto
  const itensOrdenados = board ? [...board.colunas.emDisputa, ...board.colunas.aguardando, ...board.colunas.encerrados] : []
  const itemFoco = selectedItem || itensOrdenados[0] || null
  const diferenca = calcularDiferencaParaLider(itemFoco)
  const lanceSugerido = calcularLanceSugerido(itemFoco, contexto?.cronometria.diferencaMinimaLances, contexto?.cronometria.tipoDiferencaMinimaLances)
  // Fase do item no modo de disputa (E2.4)
  const etapaFechada = itemFoco?.status === 'EM_DISPUTA' && itemFoco.faseModo === 'FECHADA'
  const tempoOculto = !!itemFoco?.cronometro.oculto || itemFoco?.faseModo === 'ALEATORIO'
  const podeDarLance = itemFoco?.status === 'EM_DISPUTA' && itemFoco.possoDarLance !== false
  const descricaoFase = itemFoco ? descricaoFaseItem(itemFoco) : null
  const percentualTempo = (() => {
    if (!itemFoco || itemFoco.status !== 'EM_DISPUTA' || tempoOculto) return 0
    const totalMinutos = itemFoco.cronometro.fase === 'PRORROGACAO'
      ? contexto?.cronometria.duracaoProrrogacaoMinutos
      : itemFoco.cronometro.fase === 'LANCE_FECHADO'
        ? contexto?.cronometria.lanceFinalFechadoMinutos
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
    // Lance final fechado é único e sigiloso: confirma antes de enviar (IN 73 art. 24 §2º)
    if (etapaFechada) {
      setConfirmarFechado(valor)
      return
    }
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
              <Badge variant="outline">Modo {rotuloModo(contexto?.modo)}</Badge>
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

            {/* Aceitação (IN 73/2022 art. 29): só aparece quando este licitante é convocado */}
            {sessaoId && <PropostaAdequadaPanel sessaoId={sessaoId} />}

            <div className="grid gap-4 lg:grid-cols-4">
              <Card className="lg:col-span-3 overflow-hidden">
                <CardHeader className="border-b bg-emerald-950 text-white">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <CardDescription className="text-emerald-200">
                        {ehLote(itemFoco) ? 'Lote em foco — lance pelo valor global do lote' : 'Item em foco'}
                      </CardDescription>
                      <CardTitle className="text-3xl">
                        {itemFoco ? rotuloUnidade(itemFoco) : 'Selecione um item'}
                      </CardTitle>
                      <p className="max-w-2xl text-sm text-emerald-100">
                        {itemFoco?.descricao || 'Escolha um item da disputa para acompanhar sua posicao e enviar um novo lance.'}
                      </p>
                    </div>
                    {itemFoco && (
                      <div className="rounded-2xl bg-white/10 px-5 py-3 text-center">
                        <div className="mb-1 text-xs uppercase tracking-[0.2em] text-emerald-200">
                          {tempoOculto ? 'Encerramento em até 10 min' : etapaFechada ? 'Prazo do lance fechado' : 'Tempo restante'}
                        </div>
                        <div className="text-4xl font-semibold tabular-nums">{textoCronometro(itemFoco)}</div>
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
                        {descricaoFase && (
                          <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
                            {descricaoFase}
                          </div>
                        )}
                        <ItensDoLote item={itemFoco} visao="FORNECEDOR" />
                        {itemFoco.status === 'EM_DISPUTA' && itemFoco.possoDarLance === false && !ehLote(itemFoco) && (
                          <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
                            {itemFoco.meuLanceFechado != null
                              ? 'Seu lance final fechado já foi registrado.'
                              : 'Você não está entre os licitantes classificados para esta fase. Sua proposta/último lance continua na classificação.'}
                          </div>
                        )}
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
                            <CardTitle className="text-base">{etapaFechada ? 'Lance final fechado' : 'Novo lance'}</CardTitle>
                            <CardDescription>
                              {etapaFechada
                                ? 'Um único lance, menor que o seu último valor, sigiloso até o fim do prazo. Para manter o último lance da etapa aberta, não envie.'
                                : itemFoco.valorPrimeiraColocacao != null
                                  ? `Reinício para as demais colocações: o lance não pode alcançar ${formatarMoeda(itemFoco.valorPrimeiraColocacao)} (1ª colocação).`
                                  : 'Lance abaixo do seu proprio ultimo lance (e da melhor oferta, para liderar).'}
                            </CardDescription>
                            {itemFoco.meuLanceFechado != null && (
                              <p className="text-sm font-medium text-violet-800">
                                Seu lance final fechado: {formatarMoeda(itemFoco.meuLanceFechado)} (visível só para você até o fim do prazo)
                              </p>
                            )}
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <Input
                              value={valorLance}
                              onChange={(event) => setValorLance(event.target.value)}
                              placeholder="Digite o valor em R$"
                              disabled={!podeDarLance || sendingBid}
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
                            <Button
                              className={`w-full ${etapaFechada ? 'bg-violet-600 hover:bg-violet-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                              onClick={confirmarLance}
                              disabled={!podeDarLance || sendingBid}
                            >
                              <ArrowDown className="mr-2 h-4 w-4" />
                              {sendingBid ? 'Enviando...' : etapaFechada ? 'Enviar lance final fechado' : 'Enviar lance'}
                            </Button>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle className="text-base">Meus lances neste item</CardTitle>
                            <CardDescription>
                              Ate 15 segundos apos o envio voce pode cancelar diretamente. Depois disso, solicite ao
                              pregoeiro.
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            {meusLances.length === 0 ? (
                              <p className="text-sm text-slate-500">Nenhum lance seu neste item ainda.</p>
                            ) : (
                              meusLances.map((l) => (
                                <div
                                  key={l.id}
                                  className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-medium text-slate-900">{formatarMoeda(l.valor)}</span>
                                    <span className="text-xs text-slate-500">
                                      {new Date(l.criadoEm).toLocaleString('pt-BR')}
                                    </span>
                                  </div>
                                  {l.cancelado && (
                                    <Badge variant="secondary">Cancelado</Badge>
                                  )}
                                  {l.solicitacaoPendente && (
                                    <Badge className="w-fit bg-amber-100 text-amber-900">Aguardando pregoeiro</Badge>
                                  )}
                                  {itemFoco.status === 'EM_DISPUTA' &&
                                    !l.cancelado &&
                                    !l.solicitacaoPendente &&
                                    l.podeCancelarDireto && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full"
                                        disabled={sendingCancel}
                                        onClick={() => cancelarLanceDireto(itemFoco.id, l.id)}
                                      >
                                        Cancelar lance ({l.segundosRestantesCancelamentoDireto}s)
                                      </Button>
                                    )}
                                  {itemFoco.status === 'EM_DISPUTA' &&
                                    !l.cancelado &&
                                    !l.solicitacaoPendente &&
                                    !l.podeCancelarDireto && (
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="w-full"
                                        disabled={sendingCancel}
                                        onClick={() => setDialogSolicitarLanceId(l.id)}
                                      >
                                        Solicitar cancelamento ao pregoeiro
                                      </Button>
                                    )}
                                </div>
                              ))
                            )}
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
                              <div className="font-medium text-slate-900">{rotuloUnidade(item)}</div>
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
                    {contexto?.cronometria.fases && (
                      <ol className="list-decimal space-y-1 pl-5 pt-2 text-xs text-slate-600">
                        {contexto.cronometria.fases.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ol>
                    )}
                    <p className="pt-2 text-xs text-slate-500">{contexto?.cronometria.observacao}</p>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </div>

      <Dialog open={confirmarFechado !== null} onOpenChange={(open) => !open && setConfirmarFechado(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar lance final fechado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            Você vai enviar {formatarMoeda(confirmarFechado)} como lance final fechado do Item {itemFoco?.numero}. O lance é
            único, não pode ser alterado e fica sigiloso até o fim do prazo (IN SEGES 73/2022, art. 24 §2º).
          </p>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setConfirmarFechado(null)}>
              Voltar
            </Button>
            <Button
              type="button"
              className="bg-violet-600 hover:bg-violet-700"
              disabled={sendingBid || !itemFoco || confirmarFechado === null}
              onClick={() => {
                if (!itemFoco || confirmarFechado === null) return
                enviarLance(itemFoco.id, confirmarFechado)
                setValorLance('')
                setConfirmarFechado(null)
              }}
            >
              Enviar lance final fechado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogSolicitarLanceId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDialogSolicitarLanceId(null)
            setMotivoSolicitar('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar cancelamento ao pregoeiro</DialogTitle>
          </DialogHeader>
          <Textarea
            value={motivoSolicitar}
            onChange={(e) => setMotivoSolicitar(e.target.value)}
            rows={4}
            placeholder="Descreva o motivo (opcional)"
          />
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDialogSolicitarLanceId(null)
                setMotivoSolicitar('')
              }}
            >
              Voltar
            </Button>
            <Button
              type="button"
              disabled={sendingCancel || !itemFoco || !dialogSolicitarLanceId}
              onClick={async () => {
                if (!itemFoco || !dialogSolicitarLanceId) return
                await solicitarCancelamentoLance(itemFoco.id, dialogSolicitarLanceId, motivoSolicitar)
                setDialogSolicitarLanceId(null)
                setMotivoSolicitar('')
              }}
            >
              Enviar solicitacao
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
