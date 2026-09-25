'use client'

import { useCallback, useEffect, useState } from 'react'
import { Scale, Send, ShieldCheck } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatarMoeda } from './utils'

/**
 * DISPUTA FINAL (licitante) — Lei 14.133/2021 art. 60, I: quando o licitante
 * está empatado e é convocado, envia UMA nova proposta, sigilosa até o
 * encerramento, melhor que o seu valor atual, dentro do prazo. Também mostra
 * o resultado do desempate (critérios e sorteio, com semente conferível).
 * Só aparece para quem participa de algum desempate.
 */

interface MeuDesempate {
  id: string
  status: string
  unidadeNumero: number | null
  tipoUnidade: 'ITEM' | 'LOTE'
  chave: 'VALOR' | 'PONTUACAO'
  valorEmpatado: number
  convocadoDisputaFinal: boolean
  disputaFinal: {
    aplicada: boolean
    prazoAte: string | null
    encerradaEm: string | null
    minhaOferta?: { valor: number; enviadaEm: string } | null
    ofertas: Array<{ razaoSocial: string | null; valor: number }> | null
  }
  ordemFinal: Array<{ posicao: number; fornecedorId: string; razaoSocial: string | null }> | null
  criterioDecisivo: string | null
  sorteio: { atoEm: string; algoritmo: string; registros: Array<{ entrada: string; semente: string }> } | null
}

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'

function restante(ate: string | null, agora: number) {
  if (!ate) return ''
  const s = Math.max(0, Math.floor((new Date(ate).getTime() - agora) / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function DisputaFinalPanel({ sessaoId }: { sessaoId: string }) {
  const [lista, setLista] = useState<MeuDesempate[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [valores, setValores] = useState<Record<string, string>>({})
  const [confirmar, setConfirmar] = useState<MeuDesempate | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  const [conferido, setConferido] = useState<Record<string, boolean>>({})

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/desempate`)
      if (!res.ok) return
      const r = await res.json()
      setLista(Array.isArray(r?.desempates) ? r.desempates : [])
    } catch {
      /* sala segue sem o painel */
    }
  }, [sessaoId])

  useEffect(() => {
    carregar()
    const i = setInterval(carregar, 5000)
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => {
      clearInterval(i)
      clearInterval(t)
    }
  }, [carregar])

  const enviar = async () => {
    if (!confirmar) return
    setOcupado(true)
    setErro(null)
    try {
      const valor = Number(String(valores[confirmar.id] ?? '').replace(',', '.'))
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/desempate/${confirmar.id}/oferta`, {
        method: 'POST',
        body: JSON.stringify({ valor }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        throw new Error(e?.message || 'Não foi possível enviar a nova proposta')
      }
      setConfirmar(null)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  const conferir = async (d: MeuDesempate) => {
    const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/desempate/${d.id}/conferir`).catch(() => null)
    const r = res && res.ok ? await res.json() : null
    setConferido((c) => ({ ...c, [d.id]: !!r?.conferido }))
  }

  if (!lista.length) return null

  return (
    <Card className="border-amber-300">
      <CardHeader className="border-b bg-amber-50">
        <CardTitle className="flex items-center gap-2 text-amber-900">
          <Scale className="h-4 w-4" />
          Desempate (Lei 14.133/2021, art. 60)
        </CardTitle>
        <CardDescription>
          Sua proposta está empatada. Na disputa final você pode enviar UMA nova proposta, sigilosa até o encerramento. Persistindo o empate,
          há sorteio em ato público, conferível por qualquer participante.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {lista.map((d) => (
          <div key={d.id} className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">
                {d.tipoUnidade === 'LOTE' ? 'Lote' : 'Item'} {d.unidadeNumero ?? ''} — empate em{' '}
                {d.chave === 'VALOR' ? formatarMoeda(d.valorEmpatado) : `pontuação ${Number(d.valorEmpatado).toFixed(4)}`}
              </span>
              <Badge variant="outline">{d.status.replace(/_/g, ' ').toLowerCase()}</Badge>
            </div>

            {d.convocadoDisputaFinal && (
              <div className="flex flex-wrap items-end gap-2 rounded bg-blue-50 p-2">
                <div className="w-40">
                  <label className="text-xs text-slate-600">Nova proposta (R$)</label>
                  <Input
                    inputMode="decimal"
                    value={valores[d.id] ?? ''}
                    onChange={(e) => setValores((v) => ({ ...v, [d.id]: e.target.value }))}
                    placeholder="0,00"
                  />
                </div>
                <Button size="sm" disabled={!valores[d.id]} onClick={() => setConfirmar(d)}>
                  <Send className="mr-1 h-4 w-4" />
                  Enviar nova proposta
                </Button>
                <span className="text-xs text-blue-900">Prazo: {restante(d.disputaFinal.prazoAte, agora)} (até {dataHora(d.disputaFinal.prazoAte)})</span>
              </div>
            )}
            {d.disputaFinal.minhaOferta && !d.disputaFinal.encerradaEm && (
              <div className="text-xs text-slate-600">
                Sua nova proposta: {formatarMoeda(d.disputaFinal.minhaOferta.valor)} (enviada em {dataHora(d.disputaFinal.minhaOferta.enviadaEm)}) — sigilosa até o encerramento.
              </div>
            )}
            {d.disputaFinal.ofertas && d.disputaFinal.ofertas.length > 0 && (
              <div className="text-xs text-slate-600">
                Disputa final: {d.disputaFinal.ofertas.map((o) => `${o.razaoSocial ?? '-'} ${formatarMoeda(o.valor)}`).join(' · ')}
              </div>
            )}
            {d.ordemFinal && (
              <div className="rounded bg-emerald-50 px-2 py-1 text-emerald-900">
                Resultado{d.criterioDecisivo ? ` (${d.criterioDecisivo.replace(/_/g, ' ').toLowerCase()})` : ''}:{' '}
                {d.ordemFinal.map((o) => `${o.posicao}º ${o.razaoSocial ?? '-'}`).join(', ')}
              </div>
            )}
            {d.sorteio && (
              <div className="space-y-1 rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
                <div>Sorteio em {dataHora(d.sorteio.atoEm)} · {d.sorteio.algoritmo}</div>
                {d.sorteio.registros.map((r, i) => (
                  <div key={i} className="break-all">
                    entrada: {r.entrada}
                    <br />
                    semente: {r.semente}
                  </div>
                ))}
                <div className="flex items-center gap-2 font-sans">
                  <Button size="sm" variant="ghost" onClick={() => conferir(d)}>
                    <ShieldCheck className="mr-1 h-4 w-4" />
                    Conferir sorteio
                  </Button>
                  {d.id in conferido && (
                    <span className={conferido[d.id] ? 'text-emerald-700' : 'text-red-700'}>{conferido[d.id] ? 'Conferido' : 'Divergência!'}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>

      <Dialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar nova proposta</DialogTitle>
            <DialogDescription>
              A nova proposta da disputa final é única e não pode ser alterada: {formatarMoeda(Number(String(valores[confirmar?.id ?? ''] ?? '').replace(',', '.')) || 0)}.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(null)}>
              Cancelar
            </Button>
            <Button disabled={ocupado} onClick={enviar}>
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
