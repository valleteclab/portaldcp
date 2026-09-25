'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, XCircle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatarMoeda } from './utils'

/**
 * DESEMPATE ME/EPP — visão da ME/EPP convocada (LC 123/2006 art. 45). Só
 * aparece quando ESTE licitante (identificado pelo token no backend) foi
 * convocado: valor a cobrir, contagem regressiva do prazo (5 min), oferta de
 * valor ESTRITAMENTE inferior à melhor oferta ou recusa. Ninguém responde por
 * ela — nem o pregoeiro.
 */

interface Convocacao {
  id: string
  unidadeId: string
  tipoUnidade: 'ITEM' | 'LOTE'
  ordem: number
  status: 'AGUARDANDO' | 'PROCESSANDO' | 'EXERCIDA' | 'DECLINADA' | 'EXPIRADA' | 'CANCELADA'
  valorACobrir: number
  valorProprio: number | null
  prazoAte: string
  prazoMinutos: number
  /** Sessão/licitação suspensa: o prazo está pausado (volta a correr na retomada). */
  prazoPausado?: boolean
  segundosRestantes?: number
  valorOfertado: number | null
  podeResponder: boolean
  unidade: { tipo: 'ITEM' | 'LOTE'; id: string; numero: number; descricao: string } | null
}

function contagem(prazoAte: string, agora: number) {
  const s = Math.max(0, Math.floor((new Date(prazoAte).getTime() - agora) / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function DesempateMeEppFornecedorPanel({ sessaoId }: { sessaoId: string }) {
  const [convocacoes, setConvocacoes] = useState<Convocacao[]>([])
  const [valores, setValores] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  const [declinar, setDeclinar] = useState<Convocacao | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/me-epp`)
      if (!res.ok) return
      const dados = await res.json()
      setConvocacoes(Array.isArray(dados?.convocacoes) ? dados.convocacoes : [])
    } catch {
      /* silencioso: o painel só aparece quando há convocação */
    }
  }, [sessaoId])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 5000)
    const r = setInterval(() => setAgora(Date.now()), 1000)
    return () => {
      clearInterval(t)
      clearInterval(r)
    }
  }, [carregar])

  const responder = async (c: Convocacao, acao: 'exercer' | 'declinar') => {
    setErro(null)
    setOcupado(true)
    try {
      const corpo = acao === 'exercer' ? { valor: Number(String(valores[c.id] ?? '').replace(',', '.')) } : {}
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/me-epp/${c.id}/${acao}`, {
        method: 'POST',
        body: JSON.stringify(corpo),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        throw new Error(e?.message || 'Não foi possível registrar a resposta')
      }
      setDeclinar(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  // Mostra as convocações abertas e as respondidas há pouco (resultado)
  const visiveis = convocacoes.filter((c) => c.status === 'AGUARDANDO' || c.status === 'PROCESSANDO' || c.status === 'EXERCIDA')
  if (visiveis.length === 0) return null

  return (
    <Card className="border-amber-300">
      <CardHeader className="border-b bg-amber-50">
        <CardTitle className="flex items-center justify-between gap-2 text-amber-900">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Você foi convocado para o desempate ME/EPP
          </span>
          <Button size="sm" variant="ghost" onClick={carregar} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardTitle>
        <CardDescription>
          LC 123/2006, art. 45 — sua oferta ficou no intervalo do empate ficto. Você pode apresentar um valor MENOR que a melhor
          oferta dentro do prazo; se não responder ou recusar, a próxima ME/EPP do intervalo é convocada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {visiveis.map((c) => {
          const pausado = !!c.prazoPausado
          const aberta = c.status === 'AGUARDANDO' && !pausado && new Date(c.prazoAte).getTime() > agora
          const rotulo = c.unidade ? `${c.unidade.tipo === 'LOTE' ? 'Lote' : 'Item'} ${c.unidade.numero}` : 'Unidade'
          const valor = Number(String(valores[c.id] ?? '').replace(',', '.'))
          const valido = Number.isFinite(valor) && valor > 0 && valor < c.valorACobrir
          return (
            <div key={c.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">{rotulo}</div>
                  {c.unidade?.descricao && <div className="line-clamp-1 text-xs text-slate-500">{c.unidade.descricao}</div>}
                </div>
                {c.status === 'EXERCIDA' ? (
                  <Badge className="bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Oferta registrada: {formatarMoeda(Number(c.valorOfertado || 0))} — você passou a 1ª colocada
                  </Badge>
                ) : pausado ? (
                  <div className="rounded-lg bg-slate-100 px-2 py-1 text-center text-slate-700">
                    <div className="text-[10px] uppercase tracking-wide">
                      <Clock3 className="mr-1 inline h-3 w-3" />
                      Prazo pausado — sessão suspensa
                    </div>
                    <div className="font-mono text-lg font-bold tabular-nums">
                      {String(Math.floor((c.segundosRestantes ?? 0) / 60)).padStart(2, '0')}:{String((c.segundosRestantes ?? 0) % 60).padStart(2, '0')}
                    </div>
                  </div>
                ) : (
                  <div className={`rounded-lg px-2 py-1 text-center ${aberta ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-700'}`}>
                    <div className="text-[10px] uppercase tracking-wide">
                      <Clock3 className="mr-1 inline h-3 w-3" />
                      {aberta ? 'Prazo restante' : 'Prazo encerrado'}
                    </div>
                    <div className="font-mono text-lg font-bold tabular-nums">{contagem(c.prazoAte, agora)}</div>
                  </div>
                )}
              </div>
              {c.status !== 'EXERCIDA' && (
                <>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-xs text-slate-500">Melhor oferta (a cobrir)</div>
                      <div className="font-semibold">{formatarMoeda(c.valorACobrir)}</div>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <div className="text-xs text-slate-500">Sua oferta atual</div>
                      <div className="font-semibold">{c.valorProprio != null ? formatarMoeda(c.valorProprio) : '—'}</div>
                    </div>
                  </div>
                  {aberta && (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <label className="text-xs text-slate-600" htmlFor={`mpe-${c.id}`}>
                          Nova oferta ({c.tipoUnidade === 'LOTE' ? 'valor global do lote' : 'valor do item'}) — menor que {formatarMoeda(c.valorACobrir)}
                        </label>
                        <Input
                          id={`mpe-${c.id}`}
                          inputMode="decimal"
                          value={valores[c.id] ?? ''}
                          onChange={(e) => setValores((v) => ({ ...v, [c.id]: e.target.value }))}
                          placeholder="0,00"
                        />
                      </div>
                      <Button onClick={() => responder(c, 'exercer')} disabled={ocupado || !valido}>
                        Enviar oferta
                      </Button>
                      <Button variant="outline" onClick={() => setDeclinar(c)} disabled={ocupado}>
                        <XCircle className="mr-1 h-4 w-4" />
                        Recusar
                      </Button>
                    </div>
                  )}
                  {aberta && valores[c.id] && !valido && (
                    <div className="text-xs text-red-600">A oferta precisa ser menor que {formatarMoeda(c.valorACobrir)} (LC 123/2006, art. 45, I).</div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </CardContent>

      <Dialog open={!!declinar} onOpenChange={(o) => { if (!o) setDeclinar(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar o desempate?</DialogTitle>
            <DialogDescription>
              Ao recusar, você mantém a sua oferta atual e perde o direito de preferência nesta unidade; a próxima ME/EPP do intervalo é convocada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeclinar(null)} disabled={ocupado}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={() => declinar && responder(declinar, 'declinar')} disabled={ocupado}>
              Recusar o desempate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
