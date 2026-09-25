'use client'

import { useState, type ReactNode } from 'react'
import { AlertTriangle, Pause, Play, RefreshCw, ShieldAlert } from 'lucide-react'
import { useSalaDisputa } from '@/hooks/useSalaDisputa'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { SalaStepper } from '../sala-stepper'
import { formatarMoeda, getStatusBadgeClass, getStatusLabel, rotuloModo } from '../utils'
import { FilaOperacional } from './FilaOperacional'
import { ItemEmFocoOrgao } from './ItemEmFocoOrgao'
import { PainelEtapaOrgao } from './PainelEtapaOrgao'
import { DialogoJustificativa, DialogoSuspender } from './DialogosSalaOrgao'

/**
 * SALA ÚNICA DO PREGOEIRO (plano E8 item 4): motor único (socket /disputa +
 * board do presenter) e um painel real por etapa. A sessão chega resolvida
 * pela página /orgao/processos/[id]/sessao — nada de `?sessao=` nem de
 * "última sessão" do navegador.
 */
export function SalaOrgao({ sessaoId, acoesCabecalho }: { sessaoId: string; acoesCabecalho?: ReactNode }) {
  const {
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
  } = useSalaDisputa({ area: 'orgao', sessaoIdParam: sessaoId })

  const [dialogo, setDialogo] = useState<null | 'suspender' | 'reiniciar' | 'reiniciarDemais'>(null)
  const [cancelarLance, setCancelarLance] = useState<{ itemId: string; lanceId: string } | null>(null)
  const [dataRetomada, setDataRetomada] = useState('')

  const contexto = board?.contexto
  const aguardando = board?.colunas.aguardando || []
  const emDisputa = board?.colunas.emDisputa || []
  const encerrados = board?.colunas.encerrados || []
  const itemFoco = selectedItem || emDisputa[0] || aguardando[0] || encerrados[0] || null
  const suspensaPorDesconexao = !!contexto?.operacao.motivoSuspensao?.startsWith('DESCONEXAO_AGENTE')

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="px-6 py-3">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={getStatusBadgeClass(contexto?.status || 'AGENDADA')}>{getStatusLabel(contexto?.status || 'AGENDADA')}</Badge>
                <Badge variant="outline">Modo {rotuloModo(contexto?.modo)}</Badge>
                <Badge variant="outline">{contexto?.disputaPorItem ? 'Por item' : 'Por lote'}</Badge>
                <Badge variant="outline" className={wsConectado ? 'border-emerald-300 text-emerald-700' : 'border-red-300 text-red-700'}>
                  {wsConectado ? 'Tempo real conectado' : 'Tempo real desconectado'}
                </Badge>
                {contexto?.operacao.anonimizacaoAtiva && (
                  <Badge variant="outline" className="border-violet-300 text-violet-700">Anonimização ativa</Badge>
                )}
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Sessão pública</h1>
                <p className="text-sm text-slate-600">
                  {contexto?.licitacao?.numero || contexto?.licitacao?.processo || 'Sessão'} — {contexto?.licitacao?.objeto || 'carregando a licitação...'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {acoesCabecalho}
              {contexto?.operacao.suspensa ? (
                <Button onClick={retomarSessao} className="bg-emerald-600 hover:bg-emerald-700">
                  <Play className="mr-2 h-4 w-4" />
                  Retomar
                </Button>
              ) : (
                <Button variant="outline" onClick={() => setDialogo('suspender')}>
                  <Pause className="mr-2 h-4 w-4" />
                  Suspender
                </Button>
              )}
              <Button variant="outline" onClick={() => setDialogo('reiniciar')}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reiniciar
              </Button>
            </div>
          </div>
          <div className="mt-5">
            <SalaStepper contexto={contexto} />
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-600">
              <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin" />
              Carregando a sala da sessão...
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
                      Sessão suspensa automaticamente: o agente de contratação ficou desconectado por mais de 10 minutos durante os
                      lances. Ela só pode ser reiniciada decorridas 24 horas da comunicação da data aos participantes (IN SEGES
                      73/2022, art. 27 §1º).
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input type="datetime-local" className="max-w-xs bg-white" value={dataRetomada} onChange={(e) => setDataRetomada(e.target.value)} />
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
                  <CardTitle className="text-base">Solicitações de cancelamento de lance</CardTitle>
                  <CardDescription>Fornecedores que ultrapassaram os 15 segundos para cancelamento direto aguardam sua decisão.</CardDescription>
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
                        {s.motivo ? <div className="text-xs text-slate-500">Motivo: {s.motivo}</div> : null}
                        <div className="text-xs text-slate-400">Solicitado em {new Date(s.solicitadoEm).toLocaleString('pt-BR')}</div>
                      </div>
                      <Button
                        size="sm"
                        className="shrink-0 bg-amber-700 hover:bg-amber-800"
                        onClick={() => setCancelarLance({ itemId: s.itemId, lanceId: s.lanceId })}
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
                <FilaOperacional
                  emDisputa={emDisputa}
                  aguardando={aguardando}
                  encerrados={encerrados}
                  selectedItemId={selectedItemId}
                  onSelecionar={setSelectedItemId}
                  onIniciar={iniciarItens}
                />
              </div>
              <div className="space-y-4 xl:col-span-7">
                <ItemEmFocoOrgao
                  item={itemFoco}
                  contexto={contexto}
                  onEncerrar={encerrarItem}
                  onReiniciarDemais={() => setDialogo('reiniciarDemais')}
                />
              </div>
              <div className="xl:col-span-3">
                <PainelEtapaOrgao
                  sessaoId={sessaoId}
                  contexto={contexto}
                  negociacaoVersao={negociacaoVersao}
                  mensagens={mensagens}
                  onEnviarMensagem={enviarMensagem}
                  enviandoMensagem={sendingMessage}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <DialogoSuspender aberto={dialogo === 'suspender'} onFechar={() => setDialogo(null)} onConfirmar={suspenderSessao} />
      <DialogoJustificativa
        aberto={dialogo === 'reiniciarDemais'}
        titulo="Reiniciar a disputa para as demais colocações"
        texto="Lei 14.133/2021, art. 56 §4º: definida a melhor proposta, se a diferença para a 2ª colocada for de pelo menos 5%, a Administração pode admitir o reinício da disputa aberta para definir as demais colocações. A 1ª colocação é mantida e nenhum lance poderá alcançá-la. O sistema confere o percentual."
        rotuloConfirmar="Reiniciar para demais colocações"
        onFechar={() => setDialogo(null)}
        onConfirmar={(j) => (itemFoco ? reiniciarDemais(itemFoco.id, j) : false)}
      />
      <DialogoJustificativa
        aberto={dialogo === 'reiniciar'}
        titulo="Reiniciar sessão"
        texto="Use este ato apenas quando for necessário recomeçar a sessão. Os lances não são apagados: ficam no retrato congelado e cancelados logicamente."
        rotuloConfirmar="Reiniciar sessão"
        destrutivo
        onFechar={() => setDialogo(null)}
        onConfirmar={(j) => reiniciarSessao(j)}
      />
      <DialogoJustificativa
        aberto={cancelarLance !== null}
        titulo="Cancelar lance (decisão do pregoeiro)"
        texto="Registre a justificativa do cancelamento. O lance deixará de valer e a cronometria será recalculada."
        rotuloConfirmar="Confirmar cancelamento"
        enviando={sendingCancel}
        onFechar={() => setCancelarLance(null)}
        onConfirmar={async (j) => {
          if (!cancelarLance) return false
          await pregoeiroCancelarLance(cancelarLance.itemId, cancelarLance.lanceId, j)
        }}
      />
    </div>
  )
}
