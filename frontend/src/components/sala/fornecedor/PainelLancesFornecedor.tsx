'use client'

import { useState } from 'react'
import { ArrowDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Textarea } from '@/components/ui/textarea'
import type { DisputaV3Contexto, DisputaV3ItemBoard, DisputaV3LanceMeu } from '../types'
import { ItensDoLote, ehLote, rotuloUnidade } from '../unidade-lote'
import {
  calcularDiferencaParaLider,
  calcularLanceSugerido,
  descricaoFaseItem,
  direcaoDoCriterioV3,
  formatarMoeda,
  getItemStatusClass,
  getItemStatusLabel,
  textoCronometro,
} from '../utils'
import { percentualDoCiclo } from '../orgao/ItemEmFocoOrgao'

/**
 * Valor digitado → número. Com vírgula: formato brasileiro ("1.234,56");
 * sem vírgula: ponto decimal ("1234.56"). Nunca remove o ponto de "1234.56".
 */
export function lerValorMonetario(texto: string): number {
  const t = texto.trim().replace(/[R$\s]/g, '')
  if (!t) return NaN
  return t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
}

function classePosicao(posicao?: number | null) {
  if (posicao === 1) return 'text-emerald-700'
  if (posicao === 2) return 'text-amber-700'
  if (posicao === 3) return 'text-orange-700'
  return 'text-slate-700'
}

function rotuloPosicao(posicao?: number | null) {
  if (!posicao) return 'Sem lance'
  if (posicao === 1) return 'Você está liderando'
  return `Você está em ${posicao}º lugar`
}

/**
 * Painel de lances do licitante (item/lote em foco): posição, melhor oferta,
 * novo lance (inclusive o lance final fechado — IN 73 art. 24 §2º) e os
 * próprios lances com cancelamento em 15 s ou pedido ao pregoeiro (art. 21 §3º).
 */
export function PainelLancesFornecedor({
  item,
  contexto,
  meusLances,
  enviandoLance,
  enviandoCancelamento,
  onLance,
  onCancelarDireto,
  onSolicitarCancelamento,
}: {
  item: DisputaV3ItemBoard | null
  contexto?: DisputaV3Contexto | null
  meusLances: DisputaV3LanceMeu[]
  enviandoLance?: boolean
  enviandoCancelamento?: boolean
  onLance: (itemId: string, valor: number) => void
  onCancelarDireto: (itemId: string, lanceId: string) => void
  onSolicitarCancelamento: (itemId: string, lanceId: string, motivo?: string) => Promise<void>
}) {
  const [valor, setValor] = useState('')
  const [erroValor, setErroValor] = useState<string | null>(null)
  const [confirmarFechado, setConfirmarFechado] = useState<number | null>(null)
  const [solicitarLanceId, setSolicitarLanceId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')

  // Leilão (E7c): maior lance — o lance SOBE
  const direcao = direcaoDoCriterioV3(contexto?.criterioJulgamento)
  const diferenca = calcularDiferencaParaLider(item, direcao)
  const sugerido = calcularLanceSugerido(item, contexto?.cronometria.diferencaMinimaLances, contexto?.cronometria.tipoDiferencaMinimaLances, direcao)
  const etapaFechada = item?.status === 'EM_DISPUTA' && item.faseModo === 'FECHADA'
  const tempoOculto = !!item?.cronometro.oculto || item?.faseModo === 'ALEATORIO'
  const podeDarLance = item?.status === 'EM_DISPUTA' && item.possoDarLance !== false
  const descricaoFase = item ? descricaoFaseItem(item) : null
  const percentual = percentualDoCiclo(item, contexto)

  const enviar = () => {
    if (!item || !valor) return
    const numero = lerValorMonetario(valor)
    if (!Number.isFinite(numero) || numero <= 0) {
      setErroValor('Informe um valor válido.')
      return
    }
    setErroValor(null)
    if (etapaFechada) {
      setConfirmarFechado(numero)
      return
    }
    onLance(item.id, numero)
    setValor('')
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="border-b bg-emerald-950 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <CardDescription className="text-emerald-200">
              {ehLote(item) ? 'Lote em foco — lance pelo valor global do lote' : 'Item em foco'}
            </CardDescription>
            <CardTitle className="text-3xl">{item ? rotuloUnidade(item) : 'Selecione um item'}</CardTitle>
            <p className="max-w-2xl text-sm text-emerald-100">
              {item?.descricao || 'Escolha um item da disputa para acompanhar sua posição e enviar um novo lance.'}
            </p>
          </div>
          {item && (
            <div className="rounded-2xl bg-white/10 px-5 py-3 text-center">
              <div className="mb-1 text-xs uppercase tracking-[0.2em] text-emerald-200">
                {tempoOculto ? 'Encerramento em até 10 min' : etapaFechada ? 'Prazo do lance fechado' : 'Tempo restante'}
              </div>
              <div className="text-4xl font-semibold tabular-nums">{textoCronometro(item)}</div>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6 py-6">
        {!item ? (
          <div className="py-12 text-center text-slate-500">Nenhum item disponível para sua participação.</div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-emerald-100 bg-emerald-50/70">
                <CardHeader>
                  <CardDescription>Minha posição</CardDescription>
                  <CardTitle className={`text-3xl ${classePosicao(item.minhaPosicao)}`}>{item.minhaPosicao ? `${item.minhaPosicao}º` : '--'}</CardTitle>
                  <p className="text-sm text-slate-600">{rotuloPosicao(item.minhaPosicao)}</p>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Melhor lance atual</CardDescription>
                  <CardTitle>{formatarMoeda(item.melhorLance?.valor)}</CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Meu melhor lance</CardDescription>
                  <CardTitle>{formatarMoeda(item.meuMelhorLance)}</CardTitle>
                </CardHeader>
              </Card>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-slate-600">
                <span>{getItemStatusLabel(item)}</span>
                <span>{percentual}% do ciclo atual restante</span>
              </div>
              <Progress value={percentual} />
              {descricaoFase && (
                <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">{descricaoFase}</div>
              )}
              <ItensDoLote item={item} visao="FORNECEDOR" />
              {item.status === 'EM_DISPUTA' && item.possoDarLance === false && !ehLote(item) && (
                <div className="rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700">
                  {item.meuLanceFechado != null
                    ? 'Seu lance final fechado já foi registrado.'
                    : 'Você não está entre os licitantes classificados para esta fase. Sua proposta/último lance continua na classificação.'}
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Meu painel de decisão</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Diferença para o líder</span>
                    <strong>{diferenca === null ? '-' : formatarMoeda(diferenca)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Proposta inicial</span>
                    <strong>{formatarMoeda(item.minhaPropostaInicial)}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Status do item</span>
                    <Badge className={getItemStatusClass(item)}>{getItemStatusLabel(item)}</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">{etapaFechada ? 'Lance final fechado' : 'Novo lance'}</CardTitle>
                  <CardDescription>
                    {etapaFechada
                      ? 'Um único lance, menor que o seu último valor, sigiloso até o fim do prazo. Para manter o último lance da etapa aberta, não envie.'
                      : item.valorPrimeiraColocacao != null
                        ? `Reinício para as demais colocações: o lance não pode alcançar ${formatarMoeda(item.valorPrimeiraColocacao)} (1ª colocação).`
                        : direcao === 'MAIOR'
                          ? 'Leilão: lance ACIMA do seu próprio último lance (e da melhor oferta, para liderar).'
                          : 'Lance abaixo do seu próprio último lance (e da melhor oferta, para liderar).'}
                  </CardDescription>
                  {item.meuLanceFechado != null && (
                    <p className="text-sm font-medium text-violet-800">
                      Seu lance final fechado: {formatarMoeda(item.meuLanceFechado)} (visível só para você até o fim do prazo)
                    </p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <Input
                    value={valor}
                    inputMode="decimal"
                    onChange={(e) => setValor(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') enviar()
                    }}
                    placeholder="Digite o valor em R$"
                    disabled={!podeDarLance || enviandoLance}
                  />
                  {erroValor && <p className="text-xs text-red-700">{erroValor}</p>}
                  <div className="flex items-center justify-between rounded-xl border bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    <span>Sugestão</span>
                    <button
                      type="button"
                      className="font-medium text-emerald-700 disabled:text-slate-400"
                      onClick={() => sugerido !== null && setValor(sugerido.toFixed(2).replace('.', ','))}
                      disabled={sugerido === null}
                    >
                      {sugerido === null ? '-' : formatarMoeda(sugerido)}
                    </button>
                  </div>
                  <Button
                    className={`w-full ${etapaFechada ? 'bg-violet-600 hover:bg-violet-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}
                    onClick={enviar}
                    disabled={!podeDarLance || enviandoLance}
                  >
                    <ArrowDown className="mr-2 h-4 w-4" />
                    {enviandoLance ? 'Enviando...' : etapaFechada ? 'Enviar lance final fechado' : 'Enviar lance'}
                  </Button>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Meus lances neste item</CardTitle>
                  <CardDescription>Até 15 segundos após o envio você pode cancelar diretamente. Depois disso, solicite ao pregoeiro.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2">
                  {meusLances.length === 0 ? (
                    <p className="text-sm text-slate-500">Nenhum lance seu neste item ainda.</p>
                  ) : (
                    meusLances.map((l) => (
                      <div key={l.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-slate-900">{formatarMoeda(l.valor)}</span>
                          <span className="text-xs text-slate-500">{new Date(l.criadoEm).toLocaleString('pt-BR')}</span>
                        </div>
                        {l.cancelado && <Badge variant="secondary">Cancelado</Badge>}
                        {l.solicitacaoPendente && <Badge className="w-fit bg-amber-100 text-amber-900">Aguardando pregoeiro</Badge>}
                        {item.status === 'EM_DISPUTA' && !l.cancelado && !l.solicitacaoPendente && l.podeCancelarDireto && (
                          <Button size="sm" variant="outline" className="w-full" disabled={enviandoCancelamento} onClick={() => onCancelarDireto(item.id, l.id)}>
                            Cancelar lance ({l.segundosRestantesCancelamentoDireto}s)
                          </Button>
                        )}
                        {item.status === 'EM_DISPUTA' && !l.cancelado && !l.solicitacaoPendente && !l.podeCancelarDireto && (
                          <Button size="sm" variant="secondary" className="w-full" disabled={enviandoCancelamento} onClick={() => setSolicitarLanceId(l.id)}>
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
        )}
      </CardContent>

      <Dialog open={confirmarFechado !== null} onOpenChange={(o) => !o && setConfirmarFechado(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar lance final fechado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-700">
            Você vai enviar {formatarMoeda(confirmarFechado)} como lance final fechado do {item ? rotuloUnidade(item) : 'item'}. O lance é único, não pode
            ser alterado e fica sigiloso até o fim do prazo (IN SEGES 73/2022, art. 24 §2º).
          </p>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => setConfirmarFechado(null)}>Voltar</Button>
            <Button
              type="button"
              className="bg-violet-600 hover:bg-violet-700"
              disabled={enviandoLance || !item || confirmarFechado === null}
              onClick={() => {
                if (!item || confirmarFechado === null) return
                onLance(item.id, confirmarFechado)
                setValor('')
                setConfirmarFechado(null)
              }}
            >
              Enviar lance final fechado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={solicitarLanceId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setSolicitarLanceId(null)
            setMotivo('')
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar cancelamento ao pregoeiro</DialogTitle>
          </DialogHeader>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} placeholder="Descreva o motivo (opcional)" />
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" onClick={() => { setSolicitarLanceId(null); setMotivo('') }}>Voltar</Button>
            <Button
              type="button"
              disabled={enviandoCancelamento || !item || !solicitarLanceId}
              onClick={async () => {
                if (!item || !solicitarLanceId) return
                await onSolicitarCancelamento(item.id, solicitarLanceId, motivo)
                setSolicitarLanceId(null)
                setMotivo('')
              }}
            >
              Enviar solicitação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
