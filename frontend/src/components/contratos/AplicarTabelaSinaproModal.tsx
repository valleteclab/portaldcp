'use client'

import { useState, useEffect, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Search, Calculator } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface ItemTabela {
  id: string
  categoria_nome?: string | null
  codigo?: string | null
  descricao: string
  valor_criacao?: number | null
  valor_finalizacao?: number | null
  valor_total?: number | null
  sob_orcamento?: boolean
}

type Base = 'total' | 'criacao' | 'finalizacao'

interface Selecao {
  base: Base
  quantidade: number
}

interface Props {
  contratoId: string
  tabelaId: string
  descontoPct: number
  open: boolean
  onOpenChange: (o: boolean) => void
  onApplied?: (qtd: number) => void
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

export default function AplicarTabelaSinaproModal({ contratoId, tabelaId, descontoPct, open, onOpenChange, onApplied }: Props) {
  const [itens, setItens] = useState<ItemTabela[]>([])
  const [loading, setLoading] = useState(false)
  const [busca, setBusca] = useState('')
  const [sel, setSel] = useState<Record<string, Selecao>>({})
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    if (!open || !tabelaId) return
    setLoading(true)
    setSel({})
    authFetch(`${API_URL}/api/contratos/tabelas-referencia/${tabelaId}/itens`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItens(data))
      .finally(() => setLoading(false))
  }, [open, tabelaId])

  const valorBase = (it: ItemTabela, base: Base) =>
    base === 'criacao' ? it.valor_criacao : base === 'finalizacao' ? it.valor_finalizacao : it.valor_total

  const precoComDesconto = (it: ItemTabela, base: Base) => {
    const vb = valorBase(it, base)
    if (vb == null) return null
    return Math.round(Number(vb) * (1 - (descontoPct || 0) / 100) * 100) / 100
  }

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return itens
    return itens.filter(
      (it) =>
        it.descricao.toLowerCase().includes(q) ||
        (it.codigo || '').toLowerCase().includes(q) ||
        (it.categoria_nome || '').toLowerCase().includes(q),
    )
  }, [itens, busca])

  const toggle = (it: ItemTabela) => {
    setSel((prev) => {
      const next = { ...prev }
      if (next[it.id]) delete next[it.id]
      else next[it.id] = { base: 'total', quantidade: 1 }
      return next
    })
  }

  const atualizar = (id: string, patch: Partial<Selecao>) =>
    setSel((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const selecionados = Object.keys(sel)
  const totalGeral = selecionados.reduce((acc, id) => {
    const it = itens.find((x) => x.id === id)
    if (!it) return acc
    const p = precoComDesconto(it, sel[id].base)
    return acc + (p == null ? 0 : p * (sel[id].quantidade || 1))
  }, 0)

  const aplicar = async () => {
    const selecoes = selecionados
      .map((id) => ({ item_tabela_id: id, base: sel[id].base, quantidade: sel[id].quantidade || 1 }))
      .filter((s) => {
        const it = itens.find((x) => x.id === s.item_tabela_id)
        return it && valorBase(it, s.base) != null
      })
    if (selecoes.length === 0) return
    setSalvando(true)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/tabelas-referencia/contrato/${contratoId}/aplicar`, {
        method: 'POST',
        body: JSON.stringify({ selecoes }),
      })
      const data = await res.json()
      if (res.ok) {
        onApplied?.(data.total)
        onOpenChange(false)
      } else {
        alert(data.message || 'Erro ao aplicar itens.')
      }
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[88vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Calculator className="w-5 h-5" /> Gerar itens do contrato a partir da tabela SINAPRO</DialogTitle>
          <DialogDescription>
            Selecione os serviços. O sistema aplica o desconto de <strong>{descontoPct}%</strong> sobre o valor de tabela e cria os itens do contrato,
            que a Ordem de Serviço consome normalmente.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input className="pl-9" placeholder="Buscar por descrição, código ou categoria…" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>

        <div className="flex-1 overflow-y-auto border rounded-md">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="w-8 p-2"></th>
                  <th className="text-left p-2">Serviço</th>
                  <th className="text-left p-2 w-28">Base</th>
                  <th className="text-right p-2 w-24">Valor tabela</th>
                  <th className="text-right p-2 w-28">Com −{descontoPct}%</th>
                  <th className="text-center p-2 w-20">Qtd</th>
                  <th className="text-right p-2 w-28">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((it) => {
                  const s = sel[it.id]
                  const marcado = !!s
                  const base = s?.base || 'total'
                  const preco = precoComDesconto(it, base)
                  const vb = valorBase(it, base)
                  const qtd = s?.quantidade || 1
                  return (
                    <tr key={it.id} className={`border-t ${marcado ? 'bg-indigo-50/50' : ''}`}>
                      <td className="p-2 text-center">
                        <input type="checkbox" checked={marcado} onChange={() => toggle(it)} disabled={it.sob_orcamento} className="h-4 w-4" />
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{it.descricao}</div>
                        <div className="text-gray-400">{[it.categoria_nome, it.codigo].filter(Boolean).join(' · ')}{it.sob_orcamento && ' · sob orçamento'}</div>
                      </td>
                      <td className="p-2">
                        {marcado && (
                          <select value={base} onChange={(e) => atualizar(it.id, { base: e.target.value as Base })} className="border rounded px-1 py-0.5 text-xs w-full">
                            <option value="total">Total</option>
                            {it.valor_criacao != null && <option value="criacao">Criação</option>}
                            {it.valor_finalizacao != null && <option value="finalizacao">Finalização</option>}
                          </select>
                        )}
                      </td>
                      <td className="p-2 text-right text-gray-500">{fmtBRL(vb)}</td>
                      <td className="p-2 text-right font-medium text-indigo-700">{fmtBRL(preco)}</td>
                      <td className="p-2 text-center">
                        {marcado && (
                          <Input type="number" min="1" step="1" value={qtd} onChange={(e) => atualizar(it.id, { quantidade: parseInt(e.target.value) || 1 })} className="h-7 w-16 text-center text-xs px-1" />
                        )}
                      </td>
                      <td className="p-2 text-right font-semibold">{marcado && preco != null ? fmtBRL(preco * qtd) : '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <DialogFooter className="flex items-center justify-between gap-4 sm:justify-between">
          <div className="text-sm">
            <span className="text-gray-500">{selecionados.length} selecionado(s) · Total: </span>
            <span className="font-bold text-indigo-700">{fmtBRL(totalGeral)}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={aplicar} disabled={salvando || selecionados.length === 0}>
              {salvando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              Gerar {selecionados.length} item(ns) no contrato
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
