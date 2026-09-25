'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, FileText, RefreshCw, Send, TimerReset, XCircle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatarMoeda } from './utils'

/**
 * PAINEL DE ACEITAÇÃO DA PROPOSTA (agente de contratação) — IN SEGES 73/2022
 * art. 29; Lei 14.133/2021 art. 59. Por unidade (item ou lote): ranking único
 * (lances + situação do licitante), convocação do licitante na vez com prazo
 * (≥ 2 h), prorrogação única, proposta enviada (arquivo + valores por item),
 * aceite (com justificativa de exequibilidade quando houver alerta) ou recusa
 * com motivo — a recusa convoca o próximo automaticamente. A tela só pede o
 * ato; quem decide ordem, prazo e próximo é o backend (/api/julgamento).
 */

interface ValorItem { itemId: string; numero: number; quantidade: number; valorUnitario: number; valorTotal: number }
interface Aceitacao {
  id: string
  unidadeId: string
  fornecedorId: string
  razaoSocial?: string | null
  status: 'AGUARDANDO_ENVIO' | 'ENVIADA' | 'ACEITA' | 'RECUSADA' | 'CANCELADA'
  convocadaEm: string
  prazoHoras: number
  prazoAte: string
  prazoExpirado: boolean
  podeProrrogar: boolean
  prorrogadaEm?: string | null
  prorrogacaoOrigem?: string | null
  pedidoProrrogacaoEm?: string | null
  pedidoProrrogacaoMotivo?: string | null
  limites: { valorFinalTotal: number; itens: Array<{ itemId: string; numero: number; descricao?: string; quantidade: number; valorMaximoTotal: number | null }> }
  enviadaEm?: string | null
  valoresItens?: ValorItem[] | null
  valorTotalReadequado?: number | null
  observacaoFornecedor?: string | null
  arquivo?: { nome: string; mime: string; tamanho: number; sha256: string } | null
  alertaExequibilidade?: { mensagem: string; percentualDoOrcado: number; limitePercentual: number; baseLegal: string } | null
  justificativaExequibilidade?: string | null
  decididaEm?: string | null
  decisaoMotivo?: string | null
}
interface EntradaRanking {
  posicao: number | null
  fornecedorId: string
  razaoSocial: string
  cpfCnpj: string
  melhorValor: number
  situacao: string
  excluido: boolean
  empatado: boolean
}
interface Unidade {
  tipo: 'ITEM' | 'LOTE'
  id: string
  numero: number
  descricao: string
  encerrada: boolean
  resolvida: boolean
  podeConvocar: boolean
  statusResultado: string | null
  ranking: EntradaRanking[]
  atual: { fornecedorId: string; situacao: string } | null
  aceitacaoAtual: Aceitacao | null
  historico: Aceitacao[]
}
interface Painel {
  sessaoId: string
  etapa: string
  faseLicitacao: string | null
  prazoMinimoHoras: number
  todasResolvidas: boolean
  pendentes: string[]
  unidades: Unidade[]
}

const ROTULO_SITUACAO: Record<string, { label: string; cls: string }> = {
  CLASSIFICADO: { label: 'Classificado', cls: 'bg-slate-100 text-slate-700' },
  CONVOCADO_DESEMPATE: { label: 'Desempate ME/EPP', cls: 'bg-violet-100 text-violet-800' },
  CONVOCADO_ACEITACAO: { label: 'Convocado', cls: 'bg-blue-100 text-blue-800' },
  ACEITO: { label: 'Proposta aceita', cls: 'bg-emerald-100 text-emerald-800' },
  HABILITADO: { label: 'Habilitado', cls: 'bg-emerald-600 text-white' },
  VENCEDOR: { label: 'Vencedor', cls: 'bg-emerald-700 text-white' },
  RECUSADO: { label: 'Recusado', cls: 'bg-red-100 text-red-700' },
  DESCLASSIFICADO: { label: 'Desclassificado', cls: 'bg-red-100 text-red-700' },
  INABILITADO: { label: 'Inabilitado', cls: 'bg-red-100 text-red-700' },
}

const ROTULO_STATUS: Record<string, string> = {
  AGUARDANDO_ENVIO: 'Aguardando envio',
  ENVIADA: 'Proposta enviada',
  ACEITA: 'Aceita',
  RECUSADA: 'Recusada',
  CANCELADA: 'Cancelada',
}

function dataHora(v?: string | null) {
  if (!v) return '-'
  return new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function contagem(prazoAte: string, agora: number) {
  const s = Math.max(0, Math.floor((new Date(prazoAte).getTime() - agora) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}`
}

/** Prazo vencido pelo relógio da tela (o backend confere de novo no ato). */
function expirou(a: Aceitacao, agora: number) {
  return a.status === 'AGUARDANDO_ENVIO' && new Date(a.prazoAte).getTime() <= agora
}

type Acao =
  | { tipo: 'prorrogar'; aceitacao: Aceitacao }
  | { tipo: 'recusar'; aceitacao: Aceitacao }
  | { tipo: 'aceitar'; aceitacao: Aceitacao }

export function AceitacaoPanel({ sessaoId, onMudou }: { sessaoId: string; onMudou?: () => void }) {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  const [prazos, setPrazos] = useState<Record<string, string>>({})
  const [acao, setAcao] = useState<Acao | null>(null)
  const [texto, setTexto] = useState('')

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/aceitacao`)
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        throw new Error(e?.message || 'Erro ao carregar a aceitação')
      }
      setPainel(await res.json())
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar a aceitação')
    } finally {
      setCarregando(false)
    }
  }, [sessaoId])

  useEffect(() => {
    carregar()
    const i = setInterval(carregar, 15000)
    return () => clearInterval(i)
  }, [carregar])

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const executar = async (url: string, corpo: Record<string, unknown>) => {
    setOcupado(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}${url}`, { method: 'POST', body: JSON.stringify(corpo) })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        throw new Error(Array.isArray(e?.message) ? e.message.join('; ') : e?.message || 'Não foi possível concluir o ato')
      }
      await carregar()
      onMudou?.()
      return true
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
      return false
    } finally {
      setOcupado(false)
    }
  }

  const convocar = (u: Unidade) => {
    const horas = Number(prazos[u.id] || painel?.prazoMinimoHoras || 2)
    return executar(`/api/julgamento/sessao/${sessaoId}/aceitacao/unidade/${u.id}/convocar`, { prazoHoras: horas })
  }

  const confirmarAcao = async () => {
    if (!acao) return
    const base = `/api/julgamento/sessao/${sessaoId}/aceitacao/${acao.aceitacao.id}`
    let ok = false
    if (acao.tipo === 'prorrogar') ok = await executar(`${base}/prorrogar`, { motivo: texto })
    if (acao.tipo === 'recusar') ok = await executar(`${base}/recusar`, { motivo: texto })
    if (acao.tipo === 'aceitar') ok = await executar(`${base}/aceitar`, acao.aceitacao.alertaExequibilidade ? { justificativaExequibilidade: texto } : {})
    if (ok) {
      setAcao(null)
      setTexto('')
    }
  }

  const abrirArquivo = async (a: Aceitacao) => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/aceitacao/${a.id}/arquivo`)
      if (!res.ok) throw new Error('Arquivo indisponível')
      const blob = await res.blob()
      window.open(URL.createObjectURL(blob), '_blank', 'noopener')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao abrir o arquivo')
    }
  }

  const exigeTexto = acao?.tipo === 'recusar' || acao?.tipo === 'prorrogar' || (acao?.tipo === 'aceitar' && !!acao.aceitacao.alertaExequibilidade)

  return (
    <Card>
      <CardHeader className="border-b bg-indigo-50">
        <CardTitle className="flex items-center justify-between gap-2 text-indigo-900">
          <span className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Aceitação da proposta
          </span>
          <Button size="sm" variant="ghost" onClick={carregar} disabled={carregando || ocupado} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
        <CardDescription>
          IN SEGES 73/2022, art. 29 — convoque o licitante na vez a enviar a proposta adequada ao último lance (mín. {painel?.prazoMinimoHoras ?? 2} h, prorrogável uma vez).
          A recusa convoca o próximo pelo ranking de lances.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {painel?.todasResolvidas && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
            <CheckCircle2 className="mr-1 inline h-4 w-4" />
            Todas as unidades com proposta aceita (ou sem resultado). Siga para a habilitação.
          </div>
        )}
        {!!painel?.pendentes.length && (
          <div className="text-xs text-slate-500">Pendentes: {painel.pendentes.join(', ')}</div>
        )}

        {carregando && !painel ? (
          <div className="py-6 text-center text-sm text-slate-400">
            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
            Carregando...
          </div>
        ) : (
          (painel?.unidades || []).map((u) => {
            const a = u.aceitacaoAtual
            const naVez = u.ranking.find((e) => !e.excluido)
            return (
              <div key={u.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {u.tipo === 'LOTE' ? 'Lote' : 'Item'} {u.numero}
                    </div>
                    <div className="line-clamp-1 text-xs text-slate-500">{u.descricao}</div>
                  </div>
                  {u.statusResultado ? (
                    <Badge className="bg-slate-200 text-slate-700">{u.statusResultado}</Badge>
                  ) : !u.encerrada ? (
                    <Badge variant="outline">Em disputa</Badge>
                  ) : u.resolvida ? (
                    <Badge className="bg-emerald-100 text-emerald-800">Resolvida</Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800">Pendente</Badge>
                  )}
                </div>

                <div className="space-y-1">
                  {u.ranking.map((e) => {
                    const s = ROTULO_SITUACAO[e.situacao] || { label: e.situacao, cls: 'bg-slate-100 text-slate-700' }
                    return (
                      <div
                        key={e.fornecedorId}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-sm ${e.excluido ? 'bg-slate-50 text-slate-400 line-through' : 'bg-slate-50'}`}
                      >
                        <span className="min-w-0 truncate">
                          <span className="mr-1 font-medium">{e.posicao ? `${e.posicao}º` : '—'}</span>
                          {e.razaoSocial}
                          {e.empatado && <span className="ml-1 text-xs text-amber-700">(empate)</span>}
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums">{formatarMoeda(e.melhorValor)}</span>
                          <Badge className={`${s.cls} no-underline`}>{s.label}</Badge>
                        </span>
                      </div>
                    )
                  })}
                </div>

                {u.podeConvocar && naVez && (
                  <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-indigo-200 p-2">
                    <div className="w-28">
                      <label className="text-xs text-slate-500">Prazo (horas)</label>
                      <Input
                        type="number"
                        min={painel?.prazoMinimoHoras ?? 2}
                        step={1}
                        value={prazos[u.id] ?? String(painel?.prazoMinimoHoras ?? 2)}
                        onChange={(ev) => setPrazos((p) => ({ ...p, [u.id]: ev.target.value }))}
                      />
                    </div>
                    <Button size="sm" onClick={() => convocar(u)} disabled={ocupado}>
                      <Send className="mr-2 h-4 w-4" />
                      Convocar {naVez.razaoSocial}
                    </Button>
                  </div>
                )}

                {a && (
                  <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/60 p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-medium text-indigo-900">{a.razaoSocial || a.fornecedorId}</div>
                        <div className="text-xs text-slate-600">
                          {ROTULO_STATUS[a.status]} · convocado em {dataHora(a.convocadaEm)} · último lance {formatarMoeda(a.limites.valorFinalTotal)}
                        </div>
                      </div>
                      {a.status === 'AGUARDANDO_ENVIO' && (
                        <div className={`rounded-lg px-2 py-1 text-center ${expirou(a, agora) ? 'bg-red-100 text-red-700' : 'bg-white text-indigo-900'}`}>
                          <div className="text-[10px] uppercase tracking-wide">
                            <Clock3 className="mr-1 inline h-3 w-3" />
                            {expirou(a, agora) ? 'Prazo encerrado' : `até ${dataHora(a.prazoAte)}`}
                          </div>
                          <div className="font-mono text-lg font-bold tabular-nums">{contagem(a.prazoAte, agora)}</div>
                        </div>
                      )}
                    </div>

                    {a.prorrogadaEm && (
                      <div className="text-xs text-slate-600">
                        Prazo prorrogado {a.prorrogacaoOrigem === 'PEDIDO' ? 'a pedido' : 'de ofício'} em {dataHora(a.prorrogadaEm)}.
                      </div>
                    )}
                    {a.pedidoProrrogacaoEm && !a.prorrogadaEm && (
                      <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        Pedido de prorrogação do licitante: {a.pedidoProrrogacaoMotivo}
                      </div>
                    )}

                    {a.status === 'ENVIADA' && (
                      <div className="space-y-2">
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-left text-slate-500">
                                <th className="py-1">Item</th>
                                <th className="py-1 text-right">Qtd.</th>
                                <th className="py-1 text-right">Unitário</th>
                                <th className="py-1 text-right">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(a.valoresItens || []).map((v) => (
                                <tr key={v.itemId} className="border-t border-indigo-100">
                                  <td className="py-1">{v.numero}</td>
                                  <td className="py-1 text-right">{v.quantidade}</td>
                                  <td className="py-1 text-right tabular-nums">{formatarMoeda(v.valorUnitario)}</td>
                                  <td className="py-1 text-right tabular-nums">{formatarMoeda(v.valorTotal)}</td>
                                </tr>
                              ))}
                              <tr className="border-t border-indigo-200 font-semibold">
                                <td className="py-1" colSpan={3}>Total da proposta adequada</td>
                                <td className="py-1 text-right tabular-nums">{formatarMoeda(Number(a.valorTotalReadequado || 0))}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        {a.observacaoFornecedor && <div className="text-xs text-slate-600">Observação: {a.observacaoFornecedor}</div>}
                        {a.arquivo && (
                          <Button size="sm" variant="outline" onClick={() => abrirArquivo(a)}>
                            <FileText className="mr-2 h-4 w-4" />
                            Ver proposta ({a.arquivo.nome})
                          </Button>
                        )}
                        {a.alertaExequibilidade && (
                          <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                            <AlertTriangle className="mr-1 inline h-3 w-3" />
                            {a.alertaExequibilidade.mensagem} ({a.alertaExequibilidade.baseLegal})
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      {a.status === 'AGUARDANDO_ENVIO' && a.podeProrrogar && !expirou(a, agora) && (
                        <Button size="sm" variant="outline" disabled={ocupado} onClick={() => setAcao({ tipo: 'prorrogar', aceitacao: a })}>
                          <TimerReset className="mr-2 h-4 w-4" />
                          Prorrogar (+{a.prazoHoras} h)
                        </Button>
                      )}
                      {a.status === 'ENVIADA' && (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={ocupado} onClick={() => setAcao({ tipo: 'aceitar', aceitacao: a })}>
                          <CheckCircle2 className="mr-2 h-4 w-4" />
                          Aceitar proposta
                        </Button>
                      )}
                      {(a.status === 'ENVIADA' || expirou(a, agora)) && (
                        <Button size="sm" variant="destructive" disabled={ocupado} onClick={() => setAcao({ tipo: 'recusar', aceitacao: a })}>
                          <XCircle className="mr-2 h-4 w-4" />
                          Recusar e convocar o próximo
                        </Button>
                      )}
                    </div>
                  </div>
                )}

                {u.historico.filter((h) => h.status !== 'AGUARDANDO_ENVIO' && h.status !== 'ENVIADA').length > 0 && (
                  <div className="space-y-1 text-xs text-slate-500">
                    {u.historico
                      .filter((h) => h.status !== 'AGUARDANDO_ENVIO' && h.status !== 'ENVIADA')
                      .map((h) => (
                        <div key={h.id}>
                          {dataHora(h.decididaEm)} — {h.razaoSocial || h.fornecedorId}: {ROTULO_STATUS[h.status]}
                          {h.decisaoMotivo ? ` (${h.decisaoMotivo})` : ''}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )
          })
        )}
      </CardContent>

      <Dialog open={!!acao} onOpenChange={(o) => { if (!o) { setAcao(null); setTexto('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {acao?.tipo === 'prorrogar' ? 'Prorrogar o prazo' : acao?.tipo === 'recusar' ? 'Recusar a proposta' : 'Aceitar a proposta'}
            </DialogTitle>
            <DialogDescription>
              {acao?.tipo === 'prorrogar' && `Prorrogação única, pelo mesmo período (${acao.aceitacao.prazoHoras} h). Informe o motivo.`}
              {acao?.tipo === 'recusar' && 'O licitante sai do ranking desta unidade e o próximo classificado pelos lances é convocado automaticamente.'}
              {acao?.tipo === 'aceitar' &&
                (acao.aceitacao.alertaExequibilidade
                  ? 'Há indício de inexequibilidade: registre a justificativa do aceite (ex.: demonstração de exequibilidade — art. 59 §2º).'
                  : `Aceitar a proposta adequada de ${acao.aceitacao.razaoSocial || 'licitante'} (${formatarMoeda(Number(acao.aceitacao.valorTotalReadequado || 0))}).`)}
            </DialogDescription>
          </DialogHeader>
          {exigeTexto && (
            <Textarea
              rows={4}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={acao?.tipo === 'aceitar' ? 'Justificativa da exequibilidade...' : 'Motivo...'}
            />
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAcao(null); setTexto('') }} disabled={ocupado}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarAcao}
              disabled={ocupado || (exigeTexto && !texto.trim())}
              variant={acao?.tipo === 'recusar' ? 'destructive' : 'default'}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
