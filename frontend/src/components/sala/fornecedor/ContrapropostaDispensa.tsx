'use client'

/**
 * Contraproposta do órgão na dispensa (IN SEGES 67/2021, art. 16): o vencedor
 * aceita (o valor vira o adjudicado) ou recusa — homologação 08/11/2026: o
 * valor combinado no chat não tinha onde ser registrado.
 */
import { useCallback, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface Contraproposta { id: string; numero_item: number; descricao: string; quantidade: string; valor_unitario: string; valor_anterior: string; mensagem: string | null; status: string }

const moeda = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function ContrapropostaDispensa({ licitacaoId, atualizacao }: { licitacaoId: string; atualizacao?: number }) {
  const [lista, setLista] = useState<Contraproposta[]>([])
  const [ocupado, setOcupado] = useState<string | null>(null)
  const carregar = useCallback(async () => {
    const r = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/negociacao/minhas`, { cache: 'no-store' }).catch(() => null)
    if (r?.ok) setLista(await r.json())
  }, [licitacaoId])
  useEffect(() => { carregar() }, [carregar, atualizacao])
  useEffect(() => { const t = setInterval(carregar, 15000); return () => clearInterval(t) }, [carregar])

  const responder = async (c: Contraproposta, aceitar: boolean) => {
    let motivo: string | undefined
    if (!aceitar) motivo = window.prompt('Motivo da recusa (opcional):') ?? undefined
    setOcupado(c.id)
    try {
      const r = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/dispensa/negociacao/${c.id}/responder`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aceitar, motivo }),
      })
      if (!r.ok) { const e = await r.json().catch(() => ({})); toast.error(e?.message || 'Não foi possível responder'); return }
      toast.success(aceitar ? 'Contraproposta aceita: o novo valor foi registrado.' : 'Contraproposta recusada.')
      await carregar()
    } finally { setOcupado(null) }
  }

  const pendentes = lista.filter((c) => c.status === 'PENDENTE')
  if (!pendentes.length) return null
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3" role="status">
      <p className="font-semibold text-amber-900">Contraproposta do órgão (negociação — IN SEGES 67/2021, art. 16)</p>
      {pendentes.map((c) => (
        <div key={c.id} className="space-y-2">
          <p className="text-sm text-amber-900">
            Item {c.numero_item} — {c.descricao}: o órgão propõe <b>{moeda(Number(c.valor_unitario))}</b> por unidade
            (seu valor atual: {moeda(Number(c.valor_anterior))}; total {moeda(Number(c.valor_unitario) * Number(c.quantidade))}).
            {c.mensagem ? ` ${c.mensagem}` : ''}
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => responder(c, true)} disabled={ocupado === c.id}>
              {ocupado === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aceitar'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => responder(c, false)} disabled={ocupado === c.id}>Recusar</Button>
          </div>
        </div>
      ))}
    </div>
  )
}
