'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, FileUp, RefreshCw, Send, XCircle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatarMoeda } from './utils'

/**
 * PROPOSTA ADEQUADA AO ÚLTIMO LANCE (licitante convocado) — IN SEGES 73/2022
 * art. 29. Mostra só as convocações do próprio licitante (o backend identifica
 * pelo token): prazo com contagem, envio do arquivo + valor unitário de cada
 * item (a soma não pode passar do último lance; no lote, nenhum item acima do
 * rateio), pedido justificado de prorrogação e o resultado (aceita/recusada).
 * Não renderiza nada enquanto o licitante não for convocado.
 */

interface ItemLimite { itemId: string; numero: number; descricao?: string; quantidade: number; valorMaximoTotal: number | null }
interface Convocacao {
  id: string
  tipoUnidade: 'ITEM' | 'LOTE'
  status: 'AGUARDANDO_ENVIO' | 'ENVIADA' | 'ACEITA' | 'RECUSADA' | 'CANCELADA'
  prazoAte: string
  prazoHoras: number
  prorrogadaEm?: string | null
  pedidoProrrogacaoEm?: string | null
  podeEnviar: boolean
  podePedirProrrogacao: boolean
  limites: { valorFinalTotal: number; itens: ItemLimite[] }
  valoresItens?: Array<{ itemId: string; valorUnitario: number; valorTotal: number }> | null
  valorTotalReadequado?: number | null
  arquivo?: { nome: string } | null
  decisaoMotivo?: string | null
  unidade: { tipo: 'ITEM' | 'LOTE'; numero: number; descricao: string } | null
}

const arred = (v: number, casas: number) => Math.round((v + Number.EPSILON) * 10 ** casas) / 10 ** casas

function contagem(prazoAte: string, agora: number) {
  const s = Math.max(0, Math.floor((new Date(prazoAte).getTime() - agora) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(seg).padStart(2, '0')}`
}

function FormularioProposta({ sessaoId, c, onEnviado }: { sessaoId: string; c: Convocacao; onEnviado: () => void }) {
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const iniciais: Record<string, string> = {}
    for (const i of c.limites.itens) {
      const anterior = c.valoresItens?.find((v) => v.itemId === i.itemId)?.valorUnitario
      const teto = i.valorMaximoTotal != null ? Math.floor((i.valorMaximoTotal / (i.quantidade || 1)) * 10000) / 10000 : ''
      iniciais[i.itemId] = String(anterior ?? teto)
    }
    return iniciais
  })
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [observacao, setObservacao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const linhas = c.limites.itens.map((i) => {
    const unit = Number(String(valores[i.itemId] ?? '').replace(',', '.'))
    const total = Number.isFinite(unit) ? arred(arred(unit, 4) * (i.quantidade || 1), 2) : 0
    const acima = i.valorMaximoTotal != null && total > i.valorMaximoTotal + 0.005
    return { ...i, unit, total, acima }
  })
  const soma = arred(linhas.reduce((s, l) => s + l.total, 0), 2)
  const somaAcima = soma > c.limites.valorFinalTotal + 0.005

  const enviar = async () => {
    setErro(null)
    if (!arquivo) {
      setErro('Anexe o arquivo da proposta (PDF, JPG ou PNG, até 10 MB).')
      return
    }
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('arquivo', arquivo)
      fd.append('valores', JSON.stringify(linhas.map((l) => ({ itemId: l.itemId, valorUnitario: l.unit }))))
      if (observacao.trim()) fd.append('observacao', observacao.trim())
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/aceitacao/${c.id}/proposta`, { method: 'POST', body: fd })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        throw new Error(e?.message || 'Não foi possível enviar a proposta')
      }
      onEnviado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-3">
      {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="py-1">Item</th>
              <th className="py-1 text-right">Qtd.</th>
              <th className="py-1 text-right">Valor unitário</th>
              <th className="py-1 text-right">Total</th>
              <th className="py-1 text-right">Limite</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.itemId} className="border-t">
                <td className="py-1">
                  <div className="font-medium">{l.numero}</div>
                  {l.descricao && <div className="line-clamp-1 text-xs text-slate-500">{l.descricao}</div>}
                </td>
                <td className="py-1 text-right">{l.quantidade}</td>
                <td className="py-1 text-right">
                  <Input
                    className="ml-auto w-32 text-right"
                    inputMode="decimal"
                    value={valores[l.itemId] ?? ''}
                    onChange={(e) => setValores((v) => ({ ...v, [l.itemId]: e.target.value }))}
                  />
                </td>
                <td className={`py-1 text-right tabular-nums ${l.acima ? 'text-red-700' : ''}`}>{formatarMoeda(l.total)}</td>
                <td className="py-1 text-right tabular-nums text-slate-500">{l.valorMaximoTotal != null ? formatarMoeda(l.valorMaximoTotal) : '-'}</td>
              </tr>
            ))}
            <tr className="border-t font-semibold">
              <td className="py-1" colSpan={3}>Total (último lance: {formatarMoeda(c.limites.valorFinalTotal)})</td>
              <td className={`py-1 text-right tabular-nums ${somaAcima ? 'text-red-700' : ''}`}>{formatarMoeda(soma)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Arquivo da proposta (PDF, JPG ou PNG, até 10 MB)</label>
        <Input type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
      </div>
      <Textarea rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} placeholder="Observações (opcional)" />
      <Button className="w-full" onClick={enviar} disabled={enviando || somaAcima || linhas.some((l) => l.acima || !(l.unit > 0))}>
        <FileUp className="mr-2 h-4 w-4" />
        {enviando ? 'Enviando...' : c.status === 'ENVIADA' ? 'Reenviar proposta adequada' : 'Enviar proposta adequada'}
      </Button>
    </div>
  )
}

export function PropostaAdequadaPanel({ sessaoId }: { sessaoId: string }) {
  const [convocacoes, setConvocacoes] = useState<Convocacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [agora, setAgora] = useState(() => Date.now())
  const [pedido, setPedido] = useState<Convocacao | null>(null)
  const [motivo, setMotivo] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/aceitacao`)
      if (res.ok) {
        const data = await res.json()
        setConvocacoes(data.convocacoes || [])
      }
    } catch {
      /* painel opcional: sem convocação, nada a mostrar */
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

  const visiveis = useMemo(() => convocacoes.filter((c) => c.status !== 'CANCELADA'), [convocacoes])

  const pedirProrrogacao = async () => {
    if (!pedido) return
    setOcupado(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/aceitacao/${pedido.id}/pedir-prorrogacao`, {
        method: 'POST',
        body: JSON.stringify({ motivo }),
      })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        throw new Error(e?.message || 'Não foi possível registrar o pedido')
      }
      setPedido(null)
      setMotivo('')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  if (carregando || visiveis.length === 0) return null

  return (
    <Card className="border-indigo-200">
      <CardHeader className="border-b bg-indigo-50">
        <CardTitle className="flex items-center justify-between gap-2 text-indigo-900">
          <span className="flex items-center gap-2">
            <Send className="h-4 w-4" />
            Enviar proposta adequada ao último lance
          </span>
          <Button size="sm" variant="ghost" onClick={carregar} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardTitle>
        <CardDescription>
          IN SEGES 73/2022, art. 29 — você foi convocado a enviar a proposta adequada ao seu último lance dentro do prazo.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {visiveis.map((c) => {
          const expirado = c.status === 'AGUARDANDO_ENVIO' && new Date(c.prazoAte).getTime() <= agora
          const aberta = (c.status === 'AGUARDANDO_ENVIO' || c.status === 'ENVIADA') && new Date(c.prazoAte).getTime() > agora
          return (
            <div key={c.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">
                    {c.unidade ? `${c.unidade.tipo === 'LOTE' ? 'Lote' : 'Item'} ${c.unidade.numero}` : 'Unidade'}
                  </div>
                  {c.unidade?.descricao && <div className="line-clamp-1 text-xs text-slate-500">{c.unidade.descricao}</div>}
                </div>
                {c.status === 'ACEITA' ? (
                  <Badge className="bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Proposta aceita
                  </Badge>
                ) : c.status === 'RECUSADA' ? (
                  <Badge className="bg-red-100 text-red-700">
                    <XCircle className="mr-1 h-3 w-3" />
                    Proposta recusada
                  </Badge>
                ) : (
                  <div className={`rounded-lg px-2 py-1 text-center ${expirado ? 'bg-red-100 text-red-700' : 'bg-indigo-50 text-indigo-900'}`}>
                    <div className="text-[10px] uppercase tracking-wide">
                      <Clock3 className="mr-1 inline h-3 w-3" />
                      {expirado ? 'Prazo encerrado' : 'Prazo restante'}
                    </div>
                    <div className="font-mono text-lg font-bold tabular-nums">{contagem(c.prazoAte, agora)}</div>
                  </div>
                )}
              </div>

              {c.status === 'RECUSADA' && c.decisaoMotivo && <div className="text-sm text-red-700">Motivo: {c.decisaoMotivo}</div>}
              {c.status === 'ENVIADA' && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                  Proposta enviada ({formatarMoeda(Number(c.valorTotalReadequado || 0))}{c.arquivo ? ` — ${c.arquivo.nome}` : ''}). Aguardando a análise do agente de contratação.
                </div>
              )}
              {c.prorrogadaEm && <div className="text-xs text-slate-500">Prazo prorrogado pelo agente de contratação.</div>}
              {c.pedidoProrrogacaoEm && !c.prorrogadaEm && (
                <div className="text-xs text-amber-700">
                  <AlertTriangle className="mr-1 inline h-3 w-3" />
                  Pedido de prorrogação enviado — aguardando decisão.
                </div>
              )}

              {aberta && <FormularioProposta key={`${c.id}-${c.status}`} sessaoId={sessaoId} c={c} onEnviado={carregar} />}

              {c.podePedirProrrogacao && !expirado && (
                <Button size="sm" variant="outline" onClick={() => setPedido(c)}>
                  Pedir prorrogação do prazo
                </Button>
              )}
            </div>
          )
        })}
      </CardContent>

      <Dialog open={!!pedido} onOpenChange={(o) => { if (!o) { setPedido(null); setMotivo('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pedir prorrogação do prazo</DialogTitle>
            <DialogDescription>
              A prorrogação é única, pelo mesmo período, e depende da decisão do agente de contratação. Justifique o pedido.
            </DialogDescription>
          </DialogHeader>
          <Textarea rows={4} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Justificativa (mín. 10 caracteres)..." />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setPedido(null); setMotivo('') }} disabled={ocupado}>
              Cancelar
            </Button>
            <Button onClick={pedirProrrogacao} disabled={ocupado || motivo.trim().length < 10}>
              Enviar pedido
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
