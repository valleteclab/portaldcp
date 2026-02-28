'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Bot, ArrowRight } from 'lucide-react'

interface MapeamentoItem {
  produto_nf_index: number
  xProd_nf: string
  item_contrato_id: string | null
  descricao_of: string | null
  confianca: number
  justificativa: string
}

interface ProdutoXml {
  nItem: number
  xProd: string
  qCom: number
  uCom: string
  vUnCom: number
  vProd: number
}

interface ItemOf {
  item_contrato_id: string
  descricao: string
  unidade_medida: string
  quantidade: number
  valor_unitario: number
  tipo_item?: string
}

interface EtapaMapeamentoProps {
  mapeamento: MapeamentoItem[]
  produtosXml: ProdutoXml[]
  itensOf: ItemOf[]
  iaIndisponivel: boolean
  onConfirmar: (mapeamentoConfirmado: any[]) => void
  loading: boolean
}

export function EtapaMapeamento({
  mapeamento,
  produtosXml,
  itensOf,
  iaIndisponivel,
  onConfirmar,
  loading,
}: EtapaMapeamentoProps) {
  const [confirmados, setConfirmados] = useState<Record<number, boolean>>({})
  const [selecoes, setSelecoes] = useState<Record<number, string | null>>(() => {
    const initial: Record<number, string | null> = {}
    mapeamento.forEach(m => {
      initial[m.produto_nf_index] = m.item_contrato_id
    })
    return initial
  })

  const fmt = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

  const confiancaColor = (c: number) =>
    c >= 95 ? 'text-green-600' : c >= 80 ? 'text-amber-600' : 'text-red-500'

  const confiancaBg = (c: number) =>
    c >= 95 ? 'bg-green-500' : c >= 80 ? 'bg-amber-500' : 'bg-red-500'

  const confirmarItem = (index: number) => {
    setConfirmados(prev => ({ ...prev, [index]: true }))
  }

  const todosConfirmados = mapeamento.every(
    m => confirmados[m.produto_nf_index] || !m.item_contrato_id
  )

  const handleConfirmarTodos = () => {
    const result = mapeamento.map(m => ({
      produto_nf_index: m.produto_nf_index,
      xProd_nf: m.xProd_nf,
      item_contrato_id: selecoes[m.produto_nf_index] || m.item_contrato_id,
      descricao_of: m.descricao_of,
    }))
    onConfirmar(result)
  }

  const matchCount = mapeamento.filter(m => m.item_contrato_id).length
  const confirmedCount = Object.values(confirmados).filter(Boolean).length

  return (
    <div className="space-y-4">
      {iaIndisponivel && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-3">
          <Bot className="h-6 w-6 text-amber-600" />
          <div>
            <p className="font-semibold text-amber-800">IA indisponivel</p>
            <p className="text-sm text-amber-700">Mapeamento manual necessario. Selecione os itens correspondentes.</p>
          </div>
        </div>
      )}

      {!iaIndisponivel && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Bot className="h-6 w-6 text-blue-600" />
            <div>
              <p className="font-semibold text-blue-800">
                IA identificou {matchCount} de {mapeamento.length} produtos
              </p>
              <p className="text-sm text-blue-700">Revise e confirme os vinculos antes de prosseguir.</p>
            </div>
          </div>
          <div className="bg-white rounded-lg px-3 py-1.5 border border-blue-200 text-sm font-bold text-blue-700">
            {confirmedCount}/{mapeamento.length} confirmados
          </div>
        </div>
      )}

      <div className="grid grid-cols-[1fr_28px_1fr_100px_90px] gap-3 px-4 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
        <div>Produto da NF</div>
        <div />
        <div>Produto no Sistema</div>
        <div>Confianca</div>
        <div>Acao</div>
      </div>

      {mapeamento.map(item => {
        const prod = produtosXml.find(p => p.nItem === item.produto_nf_index)
        const ofItem = itensOf.find(i => i.item_contrato_id === item.item_contrato_id)
        const isConfirmed = confirmados[item.produto_nf_index]

        return (
          <Card
            key={item.produto_nf_index}
            className={isConfirmed ? 'border-green-200 bg-green-50/50' : ''}
          >
            <CardContent className="py-3 grid grid-cols-[1fr_28px_1fr_100px_90px] gap-3 items-center">
              <div>
                <p className="text-sm font-semibold">{item.xProd_nf}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-gray-500">
                    {prod?.qCom} {prod?.uCom} · {fmt(prod?.vUnCom || 0)}/un
                  </span>
                </div>
              </div>

              <div className="text-center text-gray-300 text-lg">→</div>

              <div>
                {item.item_contrato_id ? (
                  <div>
                    <p className="text-sm font-semibold">{item.descricao_of}</p>
                    <p className="text-xs text-gray-500 mt-0.5">ID: {item.item_contrato_id.substring(0, 8)}...</p>
                  </div>
                ) : (
                  <div className="border border-dashed border-red-300 bg-red-50 rounded-lg p-2 text-xs text-red-600">
                    Produto nao identificado — selecionar manualmente
                  </div>
                )}
              </div>

              <div>
                {item.item_contrato_id ? (
                  <div className="space-y-1">
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${confiancaBg(item.confianca)}`}
                        style={{ width: `${item.confianca}%` }}
                      />
                    </div>
                    <span className={`text-xs font-bold ${confiancaColor(item.confianca)}`}>
                      {item.confianca}% IA
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-red-300">—</span>
                )}
              </div>

              <div>
                {isConfirmed ? (
                  <span className="text-xs text-green-600 font-bold flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> OK
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant={item.item_contrato_id ? 'default' : 'outline'}
                    onClick={() => confirmarItem(item.produto_nf_index)}
                    disabled={!item.item_contrato_id}
                    className="text-xs h-7"
                  >
                    {item.item_contrato_id ? 'Confirmar' : 'Vincular'}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      <div className="flex items-center justify-between mt-4">
        <span className="text-sm text-gray-500">
          {mapeamento.length - confirmedCount > 0
            ? `${mapeamento.length - confirmedCount} item(ns) aguardando confirmacao`
            : 'Todos os vinculos confirmados'}
        </span>
        <Button
          onClick={handleConfirmarTodos}
          disabled={!todosConfirmados || loading}
          size="lg"
        >
          {loading ? 'Processando...' : 'Prosseguir para Recebimento'}
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}
