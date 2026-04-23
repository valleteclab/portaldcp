'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { API_URL, authFetch } from '@/lib/api'
import { AlertCircle, Printer } from 'lucide-react'

interface EmpenhoComposto {
  numero_empenho: string
  ano_exercicio?: number
  saldo_virtual?: number
  saldo_a_liquidar: number
}

interface ItemContrato {
  id: string
  numero_item: number
  descricao: string
  unidade_medida: string
  valor_unitario: number | string
  saldo_disponivel: number | string
}

interface Selecao {
  checked: boolean
  qty: number
}

interface Props {
  open: boolean
  onClose: () => void
  empenho: EmpenhoComposto
  contratoId: string
  contratoNumero: string
}

function fmtMoeda(valor: number) {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtMoedaInput(valor: number) {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtNum(valor: number | string) {
  const n = Number(valor)
  return (n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4, minimumFractionDigits: 0 })
}

function parseMoedaInput(valor: string) {
  const normalizado = valor.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '')
  const numero = Number(normalizado)
  return Number.isFinite(numero) ? numero : 0
}

const UNIDADES_METRO = ['METRO', 'M', 'ML', 'M²', 'M2', 'M³', 'M3']

function isPorMetro(unidade: string) {
  return UNIDADES_METRO.includes((unidade ?? '').toUpperCase().trim())
}

function gerarSugestao(items: ItemContrato[], saldoVirtual: number): Record<string, Selecao> {
  const sorted = [...items].sort(
    (a, b) => Number(b.saldo_disponivel) - Number(a.saldo_disponivel),
  )
  let remaining = saldoVirtual
  const result: Record<string, Selecao> = {}

  for (const item of sorted) {
    const max = Number(item.saldo_disponivel)
    const preco = Number(item.valor_unitario)
    if (preco <= 0 || remaining < preco) {
      result[item.id] = { checked: false, qty: 0 }
      continue
    }
    // Itens por metro permitem decimal (2 casas); demais são inteiros
    const qty = isPorMetro(item.unidade_medida)
      ? Math.min(Math.round((remaining / preco) * 100) / 100, max)
      : Math.min(Math.floor(remaining / preco), max)
    result[item.id] = { checked: qty > 0, qty }
    remaining -= qty * preco
  }
  return result
}

function gerarSugestaoExata(items: ItemContrato[], valorAlvo: number): Record<string, Selecao> | null {
  const alvoCentavos = Math.round(valorAlvo * 100)
  if (alvoCentavos <= 0) return {}

  const candidatos = items
    .filter(item => !isPorMetro(item.unidade_medida))
    .map(item => ({
      id: item.id,
      maxQty: Math.max(0, Math.floor(Number(item.saldo_disponivel))),
      valorCentavos: Math.round(Number(item.valor_unitario) * 100),
    }))
    .filter(item => item.maxQty > 0 && item.valorCentavos > 0 && item.valorCentavos <= alvoCentavos)

  const chunks: Array<{ id: string; qty: number; valorCentavos: number }> = []
  for (const item of candidatos) {
    let bloco = 1
    let restante = item.maxQty
    while (restante > 0) {
      const qty = Math.min(bloco, restante)
      chunks.push({
        id: item.id,
        qty,
        valorCentavos: item.valorCentavos * qty,
      })
      restante -= qty
      bloco *= 2
    }
  }

  const alcançavel = new Uint8Array(alvoCentavos + 1)
  const chunkPai = new Int32Array(alvoCentavos + 1)
  const somaAnterior = new Int32Array(alvoCentavos + 1)
  chunkPai.fill(-1)
  somaAnterior.fill(-1)
  alcançavel[0] = 1

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex]
    for (let soma = alvoCentavos; soma >= chunk.valorCentavos; soma -= 1) {
      if (alcançavel[soma] || !alcançavel[soma - chunk.valorCentavos]) continue
      alcançavel[soma] = 1
      chunkPai[soma] = chunkIndex
      somaAnterior[soma] = soma - chunk.valorCentavos
    }
  }

  if (!alcançavel[alvoCentavos]) return null

  const quantidades = new Map<string, number>()
  let somaAtual = alvoCentavos
  while (somaAtual > 0) {
    const indexChunk = chunkPai[somaAtual]
    if (indexChunk < 0) break
    const chunk = chunks[indexChunk]
    quantidades.set(chunk.id, (quantidades.get(chunk.id) ?? 0) + chunk.qty)
    somaAtual = somaAnterior[somaAtual]
  }

  const resultado: Record<string, Selecao> = {}
  for (const item of items) {
    const qty = quantidades.get(item.id) ?? 0
    resultado[item.id] = { checked: qty > 0, qty }
  }

  return resultado
}

export default function SimuladorPedidoModal({
  open,
  onClose,
  empenho,
  contratoId,
  contratoNumero,
}: Props) {
  const saldoVirtual = empenho.saldo_virtual ?? empenho.saldo_a_liquidar

  const [items, setItems] = useState<ItemContrato[]>([])
  const [loading, setLoading] = useState(false)
  const [selections, setSelections] = useState<Record<string, Selecao>>({})
  const [valorAlvo, setValorAlvo] = useState('')
  const [mensagemSugestao, setMensagemSugestao] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    async function carregarItens() {
      setLoading(true)
      setMensagemSugestao(null)
      setValorAlvo(fmtMoedaInput(saldoVirtual))
      try {
        const resposta = await authFetch(`${API_URL}/api/almoxarifado/contratos/${contratoId}/itens/disponiveis`)
        const data = await resposta.json()
        setItems(data)
        setSelections(gerarSugestao(data, saldoVirtual))
      } catch {
        setItems([])
      } finally {
        setLoading(false)
      }
    }

    void carregarItens()
  }, [open, contratoId, saldoVirtual])

  const totalSelecionado = useMemo(() => {
    return items.reduce((soma, item) => {
      const sel = selections[item.id]
      if (!sel?.checked || !sel.qty) return soma
      return soma + sel.qty * Number(item.valor_unitario)
    }, 0)
  }, [items, selections])

  const excedeSaldo = totalSelecionado > saldoVirtual + 0.01

  function toggleItem(id: string, checked: boolean) {
    setSelections(prev => ({ ...prev, [id]: { ...prev[id], checked } }))
  }

  function setQty(id: string, raw: string, porMetro: boolean) {
    const n = Number(raw) || 0
    const qty = porMetro ? Math.max(0, Math.round(n * 100) / 100) : Math.max(0, Math.floor(n))
    setSelections(prev => ({ ...prev, [id]: { ...prev[id], qty } }))
  }

  function limparSelecao() {
    setMensagemSugestao(null)
    setSelections(prev => {
      const next: Record<string, Selecao> = {}
      for (const id of Object.keys(prev)) next[id] = { checked: false, qty: 0 }
      return next
    })
  }

  function aplicarSugestaoAutomatica() {
    setMensagemSugestao(null)
    setSelections(gerarSugestao(items, saldoVirtual))
  }

  function aplicarSugestaoExata() {
    const alvo = parseMoedaInput(valorAlvo)
    if (alvo <= 0) {
      setMensagemSugestao('Informe um valor-alvo maior que zero.')
      return
    }
    if (alvo > saldoVirtual + 0.01) {
      setMensagemSugestao(`O valor-alvo não pode ultrapassar o saldo do empenho (${fmtMoeda(saldoVirtual)}).`)
      return
    }

    const sugestao = gerarSugestaoExata(items, alvo)
    if (!sugestao) {
      setMensagemSugestao('Não encontrei combinação exata com os itens inteiros disponíveis. Tente outro valor ou ajuste manualmente.')
      return
    }

    setMensagemSugestao(`Combinação exata aplicada para ${fmtMoeda(alvo)}.`)
    setSelections(sugestao)
  }

  function imprimirSimulacao() {
    const itensSelecionados = items.filter(
      item => selections[item.id]?.checked && selections[item.id]?.qty > 0,
    )
    const linhas = itensSelecionados
      .map(item => {
        const qty = selections[item.id].qty
        const subtotal = qty * Number(item.valor_unitario)
        return `<tr>
          <td>${item.numero_item}</td>
          <td>${item.descricao}</td>
          <td style="text-align:center">${item.unidade_medida}</td>
          <td style="text-align:right">${fmtMoeda(Number(item.valor_unitario))}</td>
          <td style="text-align:right">${fmtNum(Number(item.saldo_disponivel))}</td>
          <td style="text-align:right">${fmtNum(qty)}</td>
          <td style="text-align:right">${fmtMoeda(subtotal)}</td>
        </tr>`
      })
      .join('')

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<title>Simulação de Pedido – Empenho ${empenhoLabel}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 11px; color: #1a1a1a; padding: 20px; }
  h1 { font-size: 14px; text-align: center; color: #1351B4; margin-bottom: 4px; text-transform: uppercase; }
  .sub { text-align: center; font-size: 10px; color: #666; margin-bottom: 16px; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { background: #1351B4; color: #fff; }
  th { padding: 5px 6px; text-align: left; }
  td { padding: 4px 6px; border-bottom: 1px solid #e5e7eb; }
  tfoot tr { background: #e8eeff; font-weight: bold; }
  tfoot td { padding: 5px 6px; border-top: 2px solid #1351B4; }
  .footer { margin-top: 12px; font-size: 9px; color: #888; display: flex; justify-content: space-between; }
  @media print { @page { size: A4 landscape; margin: 12mm; } }
</style>
</head>
<body>
<h1>Simulação de Pedido</h1>
<div class="sub">
  Contrato nº ${contratoNumero} &nbsp;|&nbsp; Empenho: ${empenhoLabel}
  &nbsp;|&nbsp; Saldo disponível: ${fmtMoeda(saldoVirtual)}
</div>
<table>
  <thead>
    <tr><th>Nº</th><th>Descrição</th><th>Unid.</th><th style="text-align:right">Val. Unit.</th><th style="text-align:right">Saldo Disp.</th><th style="text-align:right">Qtd. Desejada</th><th style="text-align:right">Subtotal</th></tr>
  </thead>
  <tbody>${linhas}</tbody>
  <tfoot>
    <tr>
      <td colspan="6" style="text-align:right">Total simulado:</td>
      <td style="text-align:right">${fmtMoeda(totalSelecionado)}</td>
    </tr>
    <tr>
      <td colspan="6" style="text-align:right">Saldo restante após pedido:</td>
      <td style="text-align:right">${fmtMoeda(Math.max(0, saldoVirtual - totalSelecionado))}</td>
    </tr>
  </tfoot>
</table>
<div class="footer">
  <span>Gerado em: ${new Date().toLocaleString('pt-BR')}</span>
  <span>Este documento é apenas uma simulação e não constitui pedido formal.</span>
</div>
<script>window.onload = () => { window.print() }<\/script>
</body>
</html>`

    const w = window.open('', '_blank')
    if (w) { w.document.write(html); w.document.close() }
  }

  const percentual = saldoVirtual > 0 ? Math.min(100, (totalSelecionado / saldoVirtual) * 100) : 0
  const empenhoLabel = empenho.ano_exercicio
    ? `${empenho.numero_empenho}/${empenho.ano_exercicio}`
    : empenho.numero_empenho

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>
            Simulador de Pedido · Empenho Nº {empenhoLabel}
          </DialogTitle>
          <DialogDescription>
            Saldo disponível: <span className="font-semibold text-blue-700">{fmtMoeda(saldoVirtual)}</span>
            {empenho.ano_exercicio ? ` · Exercício ${empenho.ano_exercicio}` : ''}
            {' · '}<span className="text-gray-500">Empenho {empenhoLabel}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-500">Carregando itens disponíveis...</div>
          ) : items.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-500">Nenhum item com saldo disponível neste contrato.</div>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b sticky top-0">
                  <th className="px-2 py-2 w-8">
                    <Checkbox
                      checked={items.every(i => selections[i.id]?.checked)}
                      onCheckedChange={v => {
                        setSelections(prev => {
                          const next = { ...prev }
                          for (const item of items) next[item.id] = { ...next[item.id], checked: !!v }
                          return next
                        })
                      }}
                    />
                  </th>
                  <th className="px-2 py-2 text-left text-gray-600 font-medium w-10">Nº</th>
                  <th className="px-2 py-2 text-left text-gray-600 font-medium">Descrição</th>
                  <th className="px-2 py-2 text-center text-gray-600 font-medium w-16">Unid.</th>
                  <th className="px-2 py-2 text-right text-gray-600 font-medium w-24">Val. Unit.</th>
                  <th className="px-2 py-2 text-right text-gray-600 font-medium w-20">Saldo Disp.</th>
                  <th className="px-2 py-2 text-right text-gray-600 font-medium w-24">Qtd. Desejada</th>
                  <th className="px-2 py-2 text-right text-gray-600 font-medium w-24">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const porMetro = isPorMetro(item.unidade_medida)
                  const sel = selections[item.id] ?? { checked: false, qty: 0 }
                  const subtotal = sel.checked && sel.qty > 0
                    ? sel.qty * Number(item.valor_unitario)
                    : 0
                  const exceedsItem = sel.qty > Number(item.saldo_disponivel)
                  return (
                    <tr key={item.id} className={`border-b ${sel.checked ? 'bg-blue-50/40' : ''}`}>
                      <td className="px-2 py-1.5 text-center">
                        <Checkbox
                          checked={sel.checked}
                          onCheckedChange={v => toggleItem(item.id, !!v)}
                        />
                      </td>
                      <td className="px-2 py-1.5 text-gray-500">{item.numero_item}</td>
                      <td className="px-2 py-1.5 font-medium text-gray-800">{item.descricao}</td>
                      <td className="px-2 py-1.5 text-center text-gray-500">{item.unidade_medida}</td>
                      <td className="px-2 py-1.5 text-right text-gray-700">
                        {fmtMoeda(Number(item.valor_unitario))}
                      </td>
                      <td className="px-2 py-1.5 text-right text-gray-700">
                        {fmtNum(item.saldo_disponivel)}
                      </td>
                      <td className="px-2 py-1.5">
                        <Input
                          type="number"
                          min={0}
                          step={porMetro ? 0.01 : 1}
                          max={Number(item.saldo_disponivel)}
                          value={sel.qty || ''}
                          onChange={e => setQty(item.id, e.target.value, porMetro)}
                          className={`h-7 text-right text-xs w-full ${exceedsItem ? 'border-red-400 focus-visible:ring-red-400' : ''}`}
                          disabled={!sel.checked}
                        />
                        {exceedsItem && (
                          <p className="text-red-500 text-[10px] mt-0.5">
                            Máx: {fmtNum(item.saldo_disponivel)}
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium text-blue-700">
                        {subtotal > 0 ? fmtMoeda(subtotal) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Barra de total */}
        {!loading && items.length > 0 && (
          <div className="border-t pt-3 space-y-2">
            <div className="rounded-lg border bg-slate-50 p-3 space-y-3">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <div className="flex-1 space-y-1">
                  <label className="text-xs font-medium text-slate-700">
                    Valor-alvo da simulação
                  </label>
                  <Input
                    value={valorAlvo}
                    onChange={e => setValorAlvo(e.target.value)}
                    placeholder="0,00"
                    className="text-sm"
                  />
                  <p className="text-[11px] text-slate-500">
                    Monte uma combinação exata com base no valor desejado, respeitando o saldo disponível de cada item.
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={aplicarSugestaoAutomatica}>
                    Sugestão automática
                  </Button>
                  <Button onClick={aplicarSugestaoExata}>
                    Buscar valor exato
                  </Button>
                </div>
              </div>
              {mensagemSugestao && (
                <div className="text-xs text-slate-600">
                  {mensagemSugestao}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600">Total simulado:</span>
              <span className={`font-bold text-base ${excedeSaldo ? 'text-red-600' : 'text-blue-700'}`}>
                {fmtMoeda(totalSelecionado)}
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${excedeSaldo ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${percentual}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>{percentual.toFixed(1)}% do saldo utilizado</span>
              <span>
                Saldo disponível: {fmtMoeda(saldoVirtual)}
              </span>
            </div>
            {excedeSaldo && (
              <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                O valor simulado excede o saldo disponível do empenho em {fmtMoeda(totalSelecionado - saldoVirtual)}.
              </div>
            )}
          </div>
        )}

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={limparSelecao} disabled={loading}>
            Limpar Seleção
          </Button>
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
          <Button
            onClick={imprimirSimulacao}
            disabled={loading || totalSelecionado <= 0}
          >
            <Printer className="w-4 h-4 mr-1.5" />
            Imprimir Simulação
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
