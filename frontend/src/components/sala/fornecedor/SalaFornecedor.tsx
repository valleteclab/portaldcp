'use client'

import { useCallback, useState, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { useSalaDisputa } from '@/hooks/useSalaDisputa'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { SalaStepper } from '../sala-stepper'
import { getStatusBadgeClass, getStatusLabel, rotuloModo } from '../utils'
import { DesempateMeEppFornecedorPanel } from '../DesempateMeEppFornecedorPanel'
import { PropostaAdequadaPanel } from '../PropostaAdequadaPanel'
import { DisputaFinalPanel } from '../DisputaFinalPanel'
import { HabilitacaoFornecedorPanel } from '../HabilitacaoFornecedorPanel'
import { NegociacaoFornecedorPanel } from '../NegociacaoFornecedorPanel'
import { RecursosFornecedorPanel } from '../RecursosFornecedorPanel'
import { SalaPorFases, type LoteVisao } from '../SalaPorFases'
import { ChatLateral } from '../ChatLateral'
import { PainelLancesFornecedor } from './PainelLancesFornecedor'

/**
 * SALA ÚNICA DO FORNECEDOR (plano E8 item 6), de ANALISE_PROPOSTAS até a
 * homologação: lances (motor único — socket /disputa) e os painéis pós-disputa,
 * cada um aparecendo só quando o licitante é convocado ou tem algo a ver:
 * desempate ME/EPP, proposta adequada, disputa final/sorteio, habilitação,
 * negociação (a própria responde; as dos demais só leitura — IN 73 art. 30 §1º)
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
  const [lotes, setLotes] = useState<LoteVisao[]>([])
  const aoCarregarLotes = useCallback((l: LoteVisao[]) => setLotes(l), [])
  const loteSel = lotes.find((l) => l.id === itemFoco?.id) ?? lotes[0] ?? null
  const itemDoLote = loteSel ? itens.find((i) => i.id === loteSel.id) ?? null : null
  const painelLances = (
    <PainelLancesFornecedor
      item={itemDoLote}
      contexto={contexto}
      sessaoId={sessaoId}
      atualizacao={board}
      meusLances={meusLances}
      enviandoLance={sendingBid}
      enviandoCancelamento={sendingCancel}
      onLance={enviarLance}
      onCancelarDireto={cancelarLanceDireto}
      onSolicitarCancelamento={solicitarCancelamentoLance}
    />
  )

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
            <div className="flex flex-wrap gap-2">
              <ChatLateral
                mensagens={mensagens}
                onEnviar={enviarMensagem}
                enviando={sendingMessage}
                habilitado={!!contexto?.operacao.chatHabilitado}
                placeholder="Enviar mensagem ao pregoeiro..."
              />
              {acoesCabecalho}
            </div>
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

            {/* Meus lotes por fase, Vencendo × Perdendo, e a classificação (troféu) — dono, 09/11/2026 */}
            <SalaPorFases
              sessaoId={sessaoId}
              area="fornecedor"
              itensAoVivo={itens}
              selecionadoId={itemFoco?.id ?? null}
              onSelecionar={setSelectedItemId}
              atualizacao={board}
              onLotes={aoCarregarLotes}
            />

            {/* O que vale para o licitante como um todo (não para um lote): só aparece quando há algo a fazer */}
            <DesempateMeEppFornecedorPanel sessaoId={sessaoId} />
            <DisputaFinalPanel sessaoId={sessaoId} />
            {contexto?.licitacaoId && <HabilitacaoFornecedorPanel licitacaoId={contexto.licitacaoId} />}
            <RecursosFornecedorPanel sessaoId={sessaoId} />

            {/* Detalhe do lote aberto na tabela (dono, 09/11/2026): só o que ele tem a fazer ali */}
            {loteSel ? (
              <section aria-label={`Lote ${loteSel.numero}`} className="min-w-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-emerald-950 px-4 py-3 text-white">
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-emerald-200">{loteSel.tipo === 'ITEM' ? 'Item' : 'Lote'} em foco</div>
                    <div className="text-lg font-semibold">
                      {loteSel.tipo === 'ITEM' ? 'Item' : 'Lote'} {loteSel.numero} — {loteSel.descricao}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <Badge className="border-0 bg-white/15 text-white">{loteSel.faseRotulo}</Badge>
                    {loteSel.minhaPosicao && <span>Minha posição: <b>{loteSel.minhaPosicao}º</b></span>}
                  </div>
                </div>
                {loteSel.fase === 'JULGAMENTO' && (
                  <>
                    <PropostaAdequadaPanel sessaoId={sessaoId} unidade={{ tipo: loteSel.tipo, numero: loteSel.numero }} />
                    <NegociacaoFornecedorPanel sessaoId={sessaoId} versao={negociacaoVersao} unidade={{ tipo: loteSel.tipo, numero: loteSel.numero }} />
                  </>
                )}
                {['AGUARDANDO', 'DISPUTA'].includes(loteSel.fase) ? (
                  painelLances
                ) : (
                  <details className="rounded-xl border border-slate-200 bg-white">
                    <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">Lances deste lote (consulta)</summary>
                    <div className="border-t p-3">{painelLances}</div>
                  </details>
                )}
              </section>
            ) : (
              <div className="rounded-xl border bg-white px-4 py-6 text-sm text-slate-500">Abra um lote na tabela acima (›) para dar lances e acompanhar a fase dele.</div>
            )}

            {rodape}
          </div>
        )}
      </div>
    </div>
  )
}
