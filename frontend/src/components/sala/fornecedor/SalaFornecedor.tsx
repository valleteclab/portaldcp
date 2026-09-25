'use client'

import { type ReactNode } from 'react'
import { AlertTriangle, Clock3, RefreshCw, Trophy } from 'lucide-react'
import { useSalaDisputa } from '@/hooks/useSalaDisputa'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ChatSala } from '../ChatSala'
import { SalaStepper } from '../sala-stepper'
import { rotuloUnidade } from '../unidade-lote'
import { getItemStatusClass, getItemStatusLabel, getStatusBadgeClass, getStatusLabel, rotuloModo } from '../utils'
import { DesempateMeEppFornecedorPanel } from '../DesempateMeEppFornecedorPanel'
import { PropostaAdequadaPanel } from '../PropostaAdequadaPanel'
import { DisputaFinalPanel } from '../DisputaFinalPanel'
import { HabilitacaoFornecedorPanel } from '../HabilitacaoFornecedorPanel'
import { NegociacaoFornecedorPanel } from '../NegociacaoFornecedorPanel'
import { RecursosFornecedorPanel } from '../RecursosFornecedorPanel'
import { PainelLancesFornecedor } from './PainelLancesFornecedor'

/**
 * SALA ÚNICA DO FORNECEDOR (plano E8 item 6), de ANALISE_PROPOSTAS até a
 * homologação: lances (motor único — socket /disputa) e os painéis pós-disputa,
 * cada um aparecendo só quando o licitante é convocado ou tem algo a ver:
 * desempate ME/EPP, proposta adequada, disputa final/sorteio, habilitação,
 * negociação (a própria responde; as dos demais só leitura — IN 73 art. 30 §2º)
 * e recursos (intenção, razões, contrarrazões). A sessão chega resolvida pela
 * página a partir da licitação.
 */
export function SalaFornecedor({
  sessaoId,
  acoesCabecalho,
  rodape,
}: {
  sessaoId: string
  acoesCabecalho?: ReactNode
  /** Conteúdo abaixo da sala (resultado, painéis da modalidade). */
  rodape?: ReactNode
}) {
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
    sendingBid,
    sendingMessage,
    sendingCancel,
    meusLances,
    enviarMensagem,
    enviarLance,
    cancelarLanceDireto,
    solicitarCancelamentoLance,
    negociacaoVersao,
  } = useSalaDisputa({ area: 'fornecedor', sessaoIdParam: sessaoId })

  const contexto = board?.contexto
  const itens = board ? [...board.colunas.emDisputa, ...board.colunas.aguardando, ...board.colunas.encerrados] : []
  const itemFoco = selectedItem || itens[0] || null

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b bg-white">
        <div className="mx-auto max-w-7xl space-y-4 px-4 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className={getStatusBadgeClass(contexto?.status || 'AGENDADA')}>{getStatusLabel(contexto?.status || 'AGENDADA')}</Badge>
                <Badge variant="outline">Modo {rotuloModo(contexto?.modo)}</Badge>
                <Badge variant="outline" className={wsConectado ? 'border-emerald-300 text-emerald-700' : 'border-red-300 text-red-700'}>
                  {wsConectado ? 'Tempo real conectado' : 'Tempo real desconectado'}
                </Badge>
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">Sala da sessão</h1>
                <p className="text-sm text-slate-600">
                  {contexto?.licitacao?.numero || contexto?.licitacao?.processo || 'Sessão'} — {contexto?.licitacao?.objeto || 'carregando a licitação...'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">{acoesCabecalho}</div>
          </div>
          <SalaStepper contexto={contexto} />
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6">
        {loading ? (
          <Card>
            <CardContent className="py-12 text-center text-slate-600">
              <RefreshCw className="mx-auto mb-3 h-8 w-8 animate-spin" />
              Carregando a sala...
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

            {/* Painéis pós-disputa: cada um só aparece quando este licitante tem algo a fazer/ver */}
            <DesempateMeEppFornecedorPanel sessaoId={sessaoId} />
            <PropostaAdequadaPanel sessaoId={sessaoId} />
            <DisputaFinalPanel sessaoId={sessaoId} />
            {contexto?.licitacaoId && <HabilitacaoFornecedorPanel licitacaoId={contexto.licitacaoId} />}
            <NegociacaoFornecedorPanel sessaoId={sessaoId} versao={negociacaoVersao} />
            <RecursosFornecedorPanel sessaoId={sessaoId} />

            <div className="grid gap-4 lg:grid-cols-4">
              <div className="lg:col-span-3">
                <PainelLancesFornecedor
                  item={itemFoco}
                  contexto={contexto}
                  meusLances={meusLances}
                  enviandoLance={sendingBid}
                  enviandoCancelamento={sendingCancel}
                  onLance={enviarLance}
                  onCancelarDireto={cancelarLanceDireto}
                  onSolicitarCancelamento={solicitarCancelamentoLance}
                />
              </div>

              <div className="space-y-4 lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle>Meus itens</CardTitle>
                    <CardDescription>Troque o foco e acompanhe sua posição.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-[320px] pr-3">
                      <div className="space-y-3">
                        {itens.map((item) => (
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
                                  Líder
                                </Badge>
                              )}
                            </div>
                            <div className="line-clamp-2 text-xs text-slate-600">{item.descricao}</div>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Badge className={getItemStatusClass(item)}>{getItemStatusLabel(item)}</Badge>
                              {item.minhaPosicao && <Badge variant="outline">{item.minhaPosicao}º lugar</Badge>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <ChatSala
                  mensagens={mensagens}
                  onEnviar={enviarMensagem}
                  enviando={sendingMessage}
                  habilitado={!!contexto?.operacao.chatHabilitado}
                  titulo="Mensagens"
                  placeholder="Enviar mensagem ao pregoeiro..."
                  altura="h-[220px]"
                />

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Regras da disputa</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm text-slate-600">
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-blue-600" />
                      Etapa aberta: {contexto?.cronometria.etapaAbertaMinutos || '-'} min
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock3 className="h-4 w-4 text-emerald-600" />
                      Prorrogação: {contexto?.cronometria.duracaoProrrogacaoMinutos || '-'} min
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

            {rodape}
          </div>
        )}
      </div>
    </div>
  )
}
