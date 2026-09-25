'use client'

import { AlertTriangle, CheckCircle2, Clock3, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import type { DisputaV3Contexto, DisputaV3ItemBoard } from '../types'
import { ItensDoLote, rotuloUnidade } from '../unidade-lote'
import { descricaoFaseItem, formatarMoeda, getItemStatusClass, getItemStatusLabel, textoCronometro } from '../utils'

/** Percentual do ciclo atual restante (0 quando o tempo está oculto ou fora de disputa). */
export function percentualDoCiclo(item: DisputaV3ItemBoard | null, contexto?: DisputaV3Contexto | null) {
  if (!item || item.status !== 'EM_DISPUTA' || item.cronometro.oculto || item.faseModo === 'ALEATORIO') return 0
  const totalMinutos =
    item.cronometro.fase === 'PRORROGACAO'
      ? contexto?.cronometria.duracaoProrrogacaoMinutos
      : item.cronometro.fase === 'LANCE_FECHADO'
        ? contexto?.cronometria.lanceFinalFechadoMinutos
        : contexto?.cronometria.etapaAbertaMinutos
  if (!totalMinutos || totalMinutos <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((item.cronometro.tempoRestanteSegundos / (totalMinutos * 60)) * 100)))
}

/** Item (ou lote) em foco na sala do pregoeiro: cronômetro, melhor lance e atos sobre a unidade. */
export function ItemEmFocoOrgao({
  item,
  contexto,
  onEncerrar,
  onReiniciarDemais,
}: {
  item: DisputaV3ItemBoard | null
  contexto?: DisputaV3Contexto | null
  onEncerrar: (itemId: string) => void
  onReiniciarDemais: () => void
}) {
  const tempoOculto = !!item?.cronometro.oculto || item?.faseModo === 'ALEATORIO'
  const descricaoFase = item ? descricaoFaseItem(item) : null
  const modoAtual = item?.modoDisputa || contexto?.modo
  // Aberto e fechado: fases e encerramento automáticos (IN 73 art. 24)
  const encerramentoAutomatico = modoAtual === 'ABERTO_FECHADO'
  // Reinício para as demais colocações (Lei 14.133 art. 56 §4º)
  const podeReiniciarDemais = !!item && item.status === 'ENCERRADO' && (modoAtual === 'ABERTO' || modoAtual === 'FECHADO_ABERTO')
  const rotuloCronometro = !item || item.status !== 'EM_DISPUTA'
    ? 'Status'
    : tempoOculto
      ? 'Fechamento iminente'
      : item.faseModo === 'FECHADA'
        ? 'Lance final fechado'
        : item.cronometro.fase === 'PRORROGACAO'
          ? 'Prorrogação'
          : 'Etapa aberta'
  const percentual = percentualDoCiclo(item, contexto)

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-slate-950 text-white">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardDescription className="text-slate-300">Item em foco</CardDescription>
            <CardTitle className="text-2xl">{item ? rotuloUnidade(item) : 'Selecione um item'}</CardTitle>
            <p className="max-w-2xl text-sm text-slate-300">
              {item?.descricao || 'Escolha um item da fila para acompanhar os lances e as ações da sessão.'}
            </p>
          </div>
          {item && (
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center">
              <div className="mb-1 text-xs uppercase tracking-[0.2em] text-slate-300">{rotuloCronometro}</div>
              <div className="text-4xl font-semibold tabular-nums">{textoCronometro(item)}</div>
              {tempoOculto && <div className="mt-1 text-[11px] text-slate-300">tempo aleatório sigiloso (até 10 min)</div>}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 py-6">
        {!item ? (
          <div className="py-12 text-center text-slate-500">Nenhum item disponível para a sessão atual.</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardDescription>Melhor lance</CardDescription>
                  <CardTitle>{formatarMoeda(item.melhorLance?.valor)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Participantes</CardDescription>
                  <CardTitle>{item.totalPropostas}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Quantidade</CardDescription>
                  <CardTitle>
                    {item.quantidade} {item.unidade}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>Ritmo da etapa</span>
                <span>{percentual}% do ciclo atual restante</span>
              </div>
              <Progress value={percentual} />
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={getItemStatusClass(item)}>{getItemStatusLabel(item)}</Badge>
                {item.participacaoRestrita && item.classificadosFase != null && (
                  <Badge variant="outline">{item.classificadosFase} classificado(s) nesta fase</Badge>
                )}
                {item.faseModo === 'FECHADA' && (
                  <Badge variant="outline" className="border-violet-300 text-violet-800">
                    {item.lancesFechadosRecebidos ?? 0} lance(s) final(is) recebido(s) — valores sigilosos até o fim do prazo
                  </Badge>
                )}
              </div>
              {descricaoFase && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">{descricaoFase}</div>
              )}
              <ItensDoLote item={item} visao="PREGOEIRO" />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-slate-900">Ações principais</h3>
                  <p className="text-sm text-slate-600">
                    {encerramentoAutomatico
                      ? 'Modo aberto e fechado: as fases e o encerramento são automáticos (IN 73 art. 24).'
                      : 'Atos do pregoeiro sobre o item em foco.'}
                  </p>
                </div>
                <Badge variant="outline">{contexto?.etapa.codigo || 'ABERTURA'}</Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => onEncerrar(item.id)} disabled={item.status !== 'EM_DISPUTA' || encerramentoAutomatico}>
                  Encerrar item
                </Button>
                {podeReiniciarDemais && (
                  <Button variant="outline" onClick={onReiniciarDemais}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Reiniciar para demais colocações
                  </Button>
                )}
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
                    <span>Prorrogação</span>
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
                  <CardTitle className="text-base">Sinais de decisão</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    {item.totalLances} lances registrados neste item
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-blue-600" />
                    Fase atual: {getItemStatusLabel(item)}
                  </div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                    {item.totalPropostas} participante(s) elegível(is)
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
