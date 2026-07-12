'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Loader2, Inbox, CheckCircle2, Undo2 } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface LinhaPreOs {
  tipo: 'SINAPRO' | 'TERCEIROS' | 'MIDIA'
  quantidade?: number
  base?: string
  descricao?: string
  custo?: number
  valor_midia?: number
  honorario_pct?: number
  desconto_pct?: number
  desconto_agencia_pct?: number
  preco_unit?: number
}

interface PreOs {
  id: string
  sequencial: number
  titulo: string
  justificativa?: string | null
  linhas: LinhaPreOs[]
  valor_total_estimado: number
  status: 'RASCUNHO' | 'ENVIADA' | 'DEVOLVIDA' | 'ACEITA' | 'CONVERTIDA'
  motivo_devolucao?: string | null
  enviada_em?: string | null
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

const STATUS_BADGE: Record<PreOs['status'], { label: string; cls: string }> = {
  RASCUNHO: { label: 'Rascunho do fornecedor', cls: 'bg-gray-100 text-gray-600' },
  ENVIADA: { label: 'Aguardando análise', cls: 'bg-blue-100 text-blue-700' },
  DEVOLVIDA: { label: 'Devolvida ao fornecedor', cls: 'bg-amber-100 text-amber-800' },
  ACEITA: { label: 'Aceita — itens gerados', cls: 'bg-emerald-100 text-emerald-700' },
  CONVERTIDA: { label: 'OS emitida', cls: 'bg-indigo-100 text-indigo-700' },
}

export default function PreOsOrgaoSection({ contratoId }: { contratoId: string }) {
  const [lista, setLista] = useState<PreOs[]>([])
  const [loading, setLoading] = useState(true)
  const [revisando, setRevisando] = useState<PreOs | null>(null)
  const [motivo, setMotivo] = useState('')
  const [acao, setAcao] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/pre-os`)
      if (res.ok) setLista(await res.json())
    } finally {
      setLoading(false)
    }
  }, [contratoId])

  useEffect(() => { carregar() }, [carregar])

  if (loading || lista.length === 0) return null

  const pendentes = lista.filter((p) => p.status === 'ENVIADA').length

  const devolver = async () => {
    if (!revisando || !motivo.trim()) { alert('Informe o motivo da devolução.'); return }
    setAcao(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/pre-os/${revisando.id}/devolver`, {
        method: 'POST',
        body: JSON.stringify({ motivo: motivo.trim() }),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.message || 'Erro ao devolver.'); return }
      setRevisando(null); setMotivo('')
      await carregar()
    } finally {
      setAcao(false)
    }
  }

  const aceitar = async () => {
    if (!revisando) return
    if (!confirm(`Aceitar a pré-OS #${revisando.sequencial} e gerar ${revisando.linhas.length} item(ns) no contrato? O fornecedor será notificado da aprovação prévia.`)) return
    setAcao(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/pre-os/${revisando.id}/aceitar`, {
        method: 'POST',
        body: JSON.stringify({}),
      })
      const d = await res.json()
      if (!res.ok) { alert(d.message || 'Erro ao aceitar.'); return }
      alert(`Pré-OS aceita — ${d.itens_gerados_ids?.length || revisando.linhas.length} item(ns) gerados no contrato.\nAgora crie a Ordem de Serviço em Requisições selecionando esses itens.`)
      setRevisando(null)
      await carregar()
    } finally {
      setAcao(false)
    }
  }

  return (
    <Card className="border-blue-200 bg-blue-50/30">
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Inbox className="w-4 h-4 text-blue-600" />
          Pré-OS do fornecedor
          {pendentes > 0 && <Badge className="bg-blue-600 text-white">{pendentes} aguardando análise</Badge>}
        </div>
        <div className="space-y-1.5">
          {lista.map((p) => (
            <div key={p.id} className="bg-white border rounded-md px-3 py-2 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">#{p.sequencial} — {p.titulo}</p>
                <p className="text-xs text-gray-500">{p.linhas?.length || 0} serviço(s) · {fmtBRL(Number(p.valor_total_estimado))}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge className={STATUS_BADGE[p.status].cls}>{STATUS_BADGE[p.status].label}</Badge>
                <Button variant="outline" size="sm" onClick={() => { setRevisando(p); setMotivo('') }}>Revisar</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>

      {/* Diálogo de revisão */}
      <Dialog open={!!revisando} onOpenChange={(o) => !o && setRevisando(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pré-OS #{revisando?.sequencial} — {revisando?.titulo}</DialogTitle>
            <DialogDescription>
              {revisando?.justificativa || 'Proposta enviada pelo fornecedor para aprovação prévia (cláusula 3.6).'}
            </DialogDescription>
          </DialogHeader>

          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50"><tr>
                <th className="text-left p-2">Tipo</th><th className="text-left p-2">Serviço</th>
                <th className="text-right p-2">Unit.</th><th className="text-center p-2">Qtd</th><th className="text-right p-2">Total</th>
              </tr></thead>
              <tbody>
                {revisando?.linhas.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-2"><span className="px-1.5 py-0.5 rounded bg-gray-100">{l.tipo}</span></td>
                    <td className="p-2">
                      {l.descricao || '(item da tabela)'}
                      <span className="block text-gray-400">
                        {l.tipo === 'SINAPRO' && `base ${l.base || 'total'} · desconto ${l.desconto_pct ?? '-'}%`}
                        {l.tipo === 'TERCEIROS' && `custo ${fmtBRL(Number(l.custo || 0))} + honorário ${l.honorario_pct ?? '-'}%`}
                        {l.tipo === 'MIDIA' && `verba ${fmtBRL(Number(l.valor_midia || 0))} − ${l.desconto_agencia_pct ?? '-'}% agência`}
                      </span>
                    </td>
                    <td className="p-2 text-right">{fmtBRL(Number(l.preco_unit || 0))}</td>
                    <td className="p-2 text-center">{l.quantidade || 1}</td>
                    <td className="p-2 text-right font-medium">{fmtBRL(Number(l.preco_unit || 0) * (Number(l.quantidade) || 1))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-right"><span className="text-gray-500">Total estimado:</span> <strong>{fmtBRL(Number(revisando?.valor_total_estimado))}</strong></p>

          {revisando?.status === 'ENVIADA' && (
            <div className="space-y-2 border-t pt-3">
              <Label className="text-xs">Motivo (obrigatório para devolver)</Label>
              <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} className="h-16 text-sm" placeholder="Ex.: honorário de gestão de tráfego sem base contratual — reenquadrar como 4.1.4 (8%)" />
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setRevisando(null)}>Fechar</Button>
            {revisando?.status === 'ENVIADA' && (
              <>
                <Button variant="outline" onClick={devolver} disabled={acao || !motivo.trim()} className="border-amber-300 text-amber-700 hover:bg-amber-50">
                  <Undo2 className="w-4 h-4 mr-1" /> Devolver
                </Button>
                <Button onClick={aceitar} disabled={acao} className="bg-emerald-600 hover:bg-emerald-700">
                  {acao ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                  Aceitar e gerar itens
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
