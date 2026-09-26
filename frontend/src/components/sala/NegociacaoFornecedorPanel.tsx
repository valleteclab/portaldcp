'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Eye, Handshake, Send, XCircle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatarMoeda } from './utils'
import { ConversaNegociacao, MensagemNegociacao, ROTULO_RESULTADO, rotuloBase } from './NegociacaoPanel'

/**
 * NEGOCIAÇÃO — visão do LICITANTE (Lei 14.133 art. 61; IN SEGES 73/2022
 * art. 30). A negociação é feita no sistema e ACOMPANHADA pelos demais
 * licitantes (§2º): a própria (o backend identifica pelo token) com conversa,
 * contraproposta pendente, aceitar (o valor vira lance de negociação) ou
 * recusar com motivo; as dos outros licitantes em SOMENTE LEITURA. Preço
 * máximo só quando o orçamento do edital não é sigiloso. Não renderiza nada
 * enquanto não houver negociação na sessão.
 */

interface MinhaNegociacao {
  id: string
  minha: boolean
  somenteLeitura: boolean
  posicao: number | null
  precoMaximoTotal?: number | null
  status: 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'
  resultado: string | null
  baseLance: string
  valorInicial: number
  valorFinal: number | null
  contraproposta: { valor: number; em: string; status: string } | null
  podeResponder: boolean
  podeEnviarMensagem: boolean
  unidade: { tipo: 'ITEM' | 'LOTE'; numero: number; descricao: string } | null
  mensagens: MensagemNegociacao[]
}

export function NegociacaoFornecedorPanel({ sessaoId, versao = 0 }: { sessaoId: string; versao?: number }) {
  const [lista, setLista] = useState<MinhaNegociacao[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [texto, setTexto] = useState<Record<string, string>>({})
  const [recusando, setRecusando] = useState<MinhaNegociacao | null>(null)
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/negociacao`)
      if (!res.ok) return
      const dados = await res.json()
      setLista(Array.isArray(dados?.negociacoes) ? dados.negociacoes : [])
    } catch {
      /* sem negociação visível — o painel não aparece */
    }
  }, [sessaoId])

  useEffect(() => {
    carregar()
    const i = setInterval(carregar, 10000)
    return () => clearInterval(i)
  }, [carregar])

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
        throw new Error(Array.isArray(e?.message) ? e.message.join('; ') : e?.message || 'Não foi possível concluir')
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

  if (!lista.length) return null

  const rotulo = (n: MinhaNegociacao) => (n.unidade ? `${n.unidade.tipo === 'LOTE' ? 'Lote' : 'Item'} ${n.unidade.numero}` : 'Unidade')
  const ordenadas = [...lista].sort(
    (a, b) => Number(b.minha) - Number(a.minha) || Number(b.status === 'EM_ANDAMENTO') - Number(a.status === 'EM_ANDAMENTO'),
  )

  return (
    <Card className="border-blue-200">
      <CardHeader className="border-b bg-blue-50">
        <CardTitle className="flex items-center gap-2 text-blue-900">
          <Handshake className="h-4 w-4" />
          Negociação (art. 61)
        </CardTitle>
        <CardDescription>
          Lei 14.133/2021, art. 61; IN SEGES 73/2022, art. 30 §1º — a negociação é acompanhada por todos os licitantes. Só o licitante com quem ela foi
          aberta responde; as demais aparecem em modo leitura.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {ordenadas.map((n) => {
          const pendente = n.contraproposta?.status === 'PENDENTE'
          return (
            <div key={n.id} className="space-y-2 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">
                    {rotulo(n)}{' '}
                    <span className="text-xs font-normal text-slate-500">
                      {n.minha ? '· sua negociação' : `· acompanhando a negociação com o ${n.posicao ?? '?'}º colocado`}
                    </span>
                  </div>
                  <div className="line-clamp-1 text-xs text-slate-500">
                    {n.unidade?.descricao}
                    {n.precoMaximoTotal != null && ` · preço máximo ${formatarMoeda(n.precoMaximoTotal)}`}
                  </div>
                </div>
                {n.status === 'EM_ANDAMENTO' ? (
                  <Badge className="bg-blue-100 text-blue-800">Em negociação</Badge>
                ) : n.status === 'CANCELADA' ? (
                  <Badge variant="outline">Cancelada</Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800">
                    {ROTULO_RESULTADO[n.resultado || ''] || 'Concluída'}
                    {n.valorFinal != null && ` · ${formatarMoeda(n.valorFinal)}`}
                  </Badge>
                )}
              </div>

              {pendente && n.contraproposta && !n.minha && (
                <div className="rounded-lg bg-slate-50 px-2 py-1 text-xs text-slate-600">
                  Contraproposta de {formatarMoeda(n.contraproposta.valor)} aguardando a resposta do licitante.
                </div>
              )}
              {pendente && n.contraproposta && n.podeResponder && (
                <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <div className="text-sm text-amber-900">
                    Contraproposta do agente: <span className="font-bold">{formatarMoeda(n.contraproposta.valor)}</span> ({rotuloBase(n.baseLance)})
                  </div>
                  <div className="text-xs text-amber-800">Ao aceitar, este valor passa a ser o seu lance nesta unidade (não pode ser desfeito).</div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" disabled={ocupado} onClick={() => executar(`/${n.id}/responder`, { aceitar: true })}>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Aceitar
                    </Button>
                    <Button size="sm" variant="outline" className="border-red-200 text-red-700" disabled={ocupado} onClick={() => setRecusando(n)}>
                      <XCircle className="mr-2 h-4 w-4" />
                      Recusar
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-1 text-[11px] text-slate-500">
                {n.minha ? <Handshake className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                {n.minha ? 'Conversa com o agente (acompanhada pelos demais licitantes)' : 'Somente leitura'}
              </div>
              <ConversaNegociacao mensagens={n.mensagens} eu={n.minha ? 'LICITANTE' : 'OBSERVADOR'} />
              {n.podeEnviarMensagem && (
                <div className="flex gap-2">
                  <Input
                    placeholder="Mensagem ao agente"
                    value={texto[n.id] || ''}
                    onChange={(e) => setTexto((t) => ({ ...t, [n.id]: e.target.value }))}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={ocupado || !texto[n.id]}
                    onClick={() => executar(`/${n.id}/mensagem`, { texto: texto[n.id] }).then((ok) => ok && setTexto((t) => ({ ...t, [n.id]: '' })))}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </CardContent>

      <Dialog open={!!recusando} onOpenChange={(o) => !o && setRecusando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar a contraproposta</DialogTitle>
            <DialogDescription>Informe o motivo. O seu valor atual é mantido e o agente pode enviar nova contraproposta.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (mín. 5 caracteres)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusando(null)}>
              Cancelar
            </Button>
            <Button
              disabled={ocupado || motivo.trim().length < 5}
              onClick={async () => {
                if (!recusando) return
                const ok = await executar(`/${recusando.id}/responder`, { aceitar: false, motivo })
                if (ok) {
                  setRecusando(null)
                  setMotivo('')
                }
              }}
            >
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
