'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Ban, CheckCircle2, Eye, Handshake, MessageSquare, RefreshCw, Send } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatarMoeda } from './utils'

/**
 * PAINEL DE NEGOCIAÇÃO (agente de contratação) — Lei 14.133/2021 art. 61;
 * IN SEGES 73/2022 art. 30. Por unidade (item ou lote): licitante na vez,
 * valor atual × preço máximo (alerta "acima do estimado" = negociação
 * obrigatória antes do aceite), abertura da negociação, conversa com o
 * licitante (acompanhada pelos demais — IN 73 art. 30 §1º), contraproposta, encerramento (valor mantido) ou
 * desclassificação por preço acima do máximo (art. 59 III) — o próximo do
 * ranking é chamado sozinho. Quem decide regras e ordem é o backend
 * (/api/julgamento/sessao/:id/negociacao).
 */

export interface MensagemNegociacao {
  id: string
  tipo: string
  autor: 'AGENTE' | 'LICITANTE' | 'SISTEMA'
  texto: string
  valor: number | null
  dataHora: string
}
interface Rodada { valor: number; valorTotal: number; enviadaEm: string; status: string; respondidaEm?: string | null; motivo?: string | null }
interface Negociacao {
  id: string
  unidadeId: string
  fornecedorId: string
  razaoSocial?: string | null
  posicao: number | null
  status: 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'
  resultado: 'REDUZIDO' | 'MANTIDO' | 'DESCLASSIFICADO' | null
  origem: 'MANUAL' | 'AUTOMATICA'
  baseLance: string
  valorInicial: number
  valorInicialTotal: number
  valorFinal: number | null
  valorFinalTotal: number | null
  contraproposta: { valor: number; em: string; status: string } | null
  rodadas: Rodada[]
  abertaEm: string
  encerradaEm: string | null
  encerradaMotivo: string | null
  precoMaximoTotal?: number | null
  obrigatoria?: boolean
  mensagens: MensagemNegociacao[]
}
interface UnidadeNeg {
  tipo: 'ITEM' | 'LOTE'
  id: string
  numero: number
  descricao: string
  encerrada: boolean
  baseLance: string
  quantidade: number
  precoMaximoTotal: number | null
  atual: { fornecedorId: string; razaoSocial: string; cpfCnpj: string; posicao: number | null; situacao: string; valorAtual: number; valorAtualTotal: number } | null
  acimaDoPrecoMaximo: boolean
  negociacaoObrigatoria: boolean
  podeAbrir: boolean
  motivoNaoAbre: string | null
  ativa: Negociacao | null
  historico: Negociacao[]
}
interface PainelNeg { sessaoId: string; faseLicitacao: string | null; direcao: string; unidades: UnidadeNeg[] }

export const ROTULO_RESULTADO: Record<string, string> = {
  REDUZIDO: 'Valor reduzido',
  MANTIDO: 'Valor mantido',
  DESCLASSIFICADO: 'Desclassificado (acima do máximo)',
}

export function dataHoraCurta(v?: string | null) {
  if (!v) return '-'
  return new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export const rotuloBase = (base: string) => (base === 'UNITARIO' ? 'valor unitário' : base === 'TOTAL_LOTE' ? 'valor global do lote' : 'valor total do item')

/** Conversa da negociação (agente ↔ licitante, acompanhada pelos demais). `eu` = quem está lendo. */
export function ConversaNegociacao({ mensagens, eu }: { mensagens: MensagemNegociacao[]; eu: 'AGENTE' | 'LICITANTE' | 'OBSERVADOR' }) {
  if (!mensagens.length) return <div className="py-2 text-center text-xs text-slate-400">Sem mensagens.</div>
  return (
    <ScrollArea className="h-44 pr-2">
      <div className="space-y-1.5">
        {mensagens.map((m) => {
          const minha = m.autor === eu
          const sistema = m.autor === 'SISTEMA'
          return (
            <div key={m.id} className={`flex ${sistema ? 'justify-center' : minha ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-2 py-1 text-xs ${
                  sistema ? 'bg-slate-100 text-slate-600' : minha ? 'bg-blue-600 text-white' : 'border border-slate-200 bg-white text-slate-800'
                }`}
              >
                {!sistema && (
                  <div className={`text-[10px] font-semibold ${minha ? 'text-blue-100' : 'text-slate-500'}`}>
                    {m.autor === 'AGENTE' ? 'Agente de contratação' : 'Licitante'} · {dataHoraCurta(m.dataHora)}
                  </div>
                )}
                <div className="whitespace-pre-wrap">{m.texto}</div>
              </div>
            </div>
          )
        })}
      </div>
    </ScrollArea>
  )
}

type Acao = { tipo: 'encerrar' | 'desclassificar'; negociacao: Negociacao; unidade: UnidadeNeg }

export function NegociacaoPanel({ sessaoId, versao = 0 }: { sessaoId: string; versao?: number }) {
  const [painel, setPainel] = useState<PainelNeg | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [mensagem, setMensagem] = useState<Record<string, string>>({})
  const [contra, setContra] = useState<Record<string, string>>({})
  const [acao, setAcao] = useState<Acao | null>(null)
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/negociacao`)
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        throw new Error(e?.message || 'Erro ao carregar a negociação')
      }
      setPainel(await res.json())
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar a negociação')
    } finally {
      setCarregando(false)
    }
  }, [sessaoId])

  useEffect(() => {
    carregar()
    const i = setInterval(carregar, 10000)
    return () => clearInterval(i)
  }, [carregar])

  // Eventos do socket (mensagem, contraproposta respondida, resultado)
  useEffect(() => {
    if (versao > 0) carregar()
  }, [versao, carregar])

  const executar = async (url: string, corpo: Record<string, unknown>) => {
    setOcupado(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/negociacao${url}`, { method: 'POST', body: JSON.stringify(corpo) })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        throw new Error(Array.isArray(e?.message) ? e.message.join('; ') : e?.message || 'Não foi possível concluir o ato')
      }
      await carregar()
      return true
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
      return false
    } finally {
      setOcupado(false)
    }
  }

  const abrir = (u: UnidadeNeg) => executar(`/unidade/${u.id}/abrir`, { mensagem: mensagem[u.id] || undefined }).then((ok) => ok && setMensagem((m) => ({ ...m, [u.id]: '' })))
  const enviarMensagem = (n: Negociacao) =>
    executar(`/${n.id}/mensagem`, { texto: mensagem[n.id] || '' }).then((ok) => ok && setMensagem((m) => ({ ...m, [n.id]: '' })))
  const enviarContraproposta = (n: Negociacao) =>
    executar(`/${n.id}/contraproposta`, { valor: Number(String(contra[n.id] || '').replace(',', '.')), mensagem: mensagem[n.id] || undefined }).then(
      (ok) => ok && (setContra((c) => ({ ...c, [n.id]: '' })), setMensagem((m) => ({ ...m, [n.id]: '' }))),
    )
  const confirmar = async () => {
    if (!acao) return
    const ok = await executar(`/${acao.negociacao.id}/${acao.tipo}`, { motivo: motivo || undefined })
    if (ok) {
      setAcao(null)
      setMotivo('')
    }
  }

  const unidades = (painel?.unidades || []).filter((u) => u.encerrada)

  return (
    <Card>
      <CardHeader className="border-b bg-blue-50">
        <CardTitle className="flex items-center justify-between gap-2 text-blue-900">
          <span className="flex items-center gap-2">
            <Handshake className="h-4 w-4" />
            Negociação (art. 61)
          </span>
          <Button size="sm" variant="ghost" onClick={carregar} disabled={carregando || ocupado} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
        <CardDescription>
          Lei 14.133/2021, art. 61; IN SEGES 73/2022, art. 30 — negocie com o licitante na vez antes do aceite. Acima do preço máximo a negociação é
          obrigatória; persistindo acima, desclassifique (art. 59 III) e o próximo é chamado. Os licitantes acompanham a negociação (§2º); o público vê o resultado.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {painel?.direcao === 'MAIOR' && (
          <div className="text-xs text-slate-500">Critério de maior lance: não há contraproposta de redução.</div>
        )}
        {carregando && !painel ? (
          <div className="py-6 text-center text-sm text-slate-400">
            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Carregando...
          </div>
        ) : !unidades.length ? (
          <div className="py-4 text-center text-sm text-slate-400">Nenhuma unidade com a etapa de lances encerrada.</div>
        ) : (
          unidades.map((u) => {
            const n = u.ativa
            const pendente = n?.contraproposta?.status === 'PENDENTE' || n?.contraproposta?.status === 'PROCESSANDO'
            return (
              <div key={u.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {u.tipo === 'LOTE' ? 'Lote' : 'Item'} {u.numero}
                    </div>
                    <div className="line-clamp-1 text-xs text-slate-500">{u.descricao}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {u.acimaDoPrecoMaximo && (
                      <Badge className="bg-red-100 text-red-700">
                        <AlertTriangle className="mr-1 h-3 w-3" />
                        Acima do estimado
                      </Badge>
                    )}
                    {u.negociacaoObrigatoria && <Badge className="bg-amber-100 text-amber-800">Negociação obrigatória</Badge>}
                    {n && <Badge className="bg-blue-100 text-blue-800">Em negociação</Badge>}
                  </div>
                </div>

                {u.atual && (
                  <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2 text-xs">
                    <div className="col-span-2 truncate">
                      <span className="font-medium">{u.atual.posicao ? `${u.atual.posicao}º` : ''}</span> {u.atual.razaoSocial}
                    </div>
                    <div>
                      <div className="text-slate-500">Valor atual</div>
                      <div className="font-semibold tabular-nums">{formatarMoeda(u.atual.valorAtualTotal)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Preço máximo (estimado)</div>
                      <div className={`font-semibold tabular-nums ${u.acimaDoPrecoMaximo ? 'text-red-700' : ''}`}>
                        {u.precoMaximoTotal != null ? formatarMoeda(u.precoMaximoTotal) : 'não informado'}
                      </div>
                    </div>
                  </div>
                )}

                {!n && u.podeAbrir && (
                  <div className="space-y-2 rounded-lg border border-dashed border-blue-200 p-2">
                    <Textarea
                      rows={2}
                      placeholder="Mensagem inicial ao licitante (opcional; os demais licitantes acompanham)"
                      value={mensagem[u.id] || ''}
                      onChange={(e) => setMensagem((m) => ({ ...m, [u.id]: e.target.value }))}
                    />
                    <Button size="sm" onClick={() => abrir(u)} disabled={ocupado}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Abrir negociação com {u.atual?.razaoSocial || 'o licitante na vez'}
                    </Button>
                  </div>
                )}
                {!n && !u.podeAbrir && u.motivoNaoAbre && <div className="text-xs text-slate-500">{u.motivoNaoAbre}</div>}

                {n && (
                  <div className="space-y-2 rounded-lg border border-blue-200 bg-blue-50/50 p-2">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <Eye className="h-3 w-3" />
                      Negociação acompanhada pelos licitantes — conversa com {n.razaoSocial || 'o licitante'} {n.origem === 'AUTOMATICA' && '(convocado após desclassificação do anterior)'}
                    </div>
                    <ConversaNegociacao mensagens={n.mensagens} eu="AGENTE" />
                    <div className="flex gap-2">
                      <Input
                        placeholder="Mensagem ao licitante"
                        value={mensagem[n.id] || ''}
                        onChange={(e) => setMensagem((m) => ({ ...m, [n.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && mensagem[n.id] && enviarMensagem(n)}
                      />
                      <Button size="sm" variant="outline" onClick={() => enviarMensagem(n)} disabled={ocupado || !mensagem[n.id]}>
                        <Send className="h-4 w-4" />
                      </Button>
                    </div>
                    {pendente ? (
                      <div className="rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        Contraproposta de {formatarMoeda(n.contraproposta!.valor)} aguardando a resposta do licitante.
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <div className="w-40">
                          <label className="text-xs text-slate-500">Contraproposta ({rotuloBase(n.baseLance)})</label>
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={contra[n.id] || ''}
                            onChange={(e) => setContra((c) => ({ ...c, [n.id]: e.target.value }))}
                          />
                        </div>
                        <Button size="sm" onClick={() => enviarContraproposta(n)} disabled={ocupado || !contra[n.id]}>
                          Enviar contraproposta
                        </Button>
                      </div>
                    )}
                    {n.rodadas.length > 0 && (
                      <div className="space-y-0.5 text-[11px] text-slate-600">
                        {n.rodadas.map((r, i) => (
                          <div key={i}>
                            {i + 1}ª contraproposta: {formatarMoeda(r.valor)} —{' '}
                            {r.status === 'RECUSADA' ? `recusada${r.motivo ? ` (${r.motivo})` : ''}` : r.status === 'ACEITA' ? 'aceita' : 'aguardando'}
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={ocupado || pendente} onClick={() => setAcao({ tipo: 'encerrar', negociacao: n, unidade: u })}>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Encerrar (manter valor)
                      </Button>
                      {u.acimaDoPrecoMaximo && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-700 hover:bg-red-50"
                          disabled={ocupado || pendente || !n.rodadas.length}
                          title={!n.rodadas.length ? 'Envie ao menos uma contraproposta antes' : undefined}
                          onClick={() => setAcao({ tipo: 'desclassificar', negociacao: n, unidade: u })}
                        >
                          <Ban className="mr-2 h-4 w-4" />
                          Desclassificar (acima do máximo)
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {u.historico.filter((h) => h.status !== 'EM_ANDAMENTO').length > 0 && (
                  <div className="space-y-1 border-t pt-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Histórico</div>
                    {u.historico
                      .filter((h) => h.status !== 'EM_ANDAMENTO')
                      .map((h) => (
                        <div key={h.id} className="flex items-center justify-between gap-2 text-xs text-slate-600">
                          <span className="truncate">
                            {h.razaoSocial || h.fornecedorId} · {dataHoraCurta(h.encerradaEm)}
                          </span>
                          <span className="shrink-0">
                            {h.status === 'CANCELADA' ? 'Cancelada' : ROTULO_RESULTADO[h.resultado || ''] || h.resultado}
                            {h.valorFinalTotal != null && ` · ${formatarMoeda(h.valorFinalTotal)}`}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>

      <Dialog open={!!acao} onOpenChange={(o) => !o && setAcao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{acao?.tipo === 'desclassificar' ? 'Desclassificar por preço acima do máximo' : 'Encerrar a negociação'}</DialogTitle>
            <DialogDescription>
              {acao?.tipo === 'desclassificar'
                ? 'A proposta permaneceu acima do preço máximo após a negociação (Lei 14.133 art. 59 III). O licitante sai do ranking e o próximo é chamado à negociação automaticamente (IN 73 art. 30 §1º).'
                : 'O valor atual do licitante é mantido e o resultado é divulgado a todos (art. 61 §1º).'}
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={3} placeholder="Motivo / observação (opcional)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmar} disabled={ocupado} className={acao?.tipo === 'desclassificar' ? 'bg-red-600 hover:bg-red-700' : ''}>
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
