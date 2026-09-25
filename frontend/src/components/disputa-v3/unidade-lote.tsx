'use client'

import type { DisputaV3ItemBoard } from './types'
import { formatarMoeda } from './utils'

/**
 * Unidade de disputa na sala V3: ITEM ou LOTE (licitação com base de lance
 * TOTAL_LOTE — os lances são pelo valor GLOBAL do lote e o valor de cada item
 * sai do rateio proporcional sobre a proposta do licitante).
 */
export function ehLote(item?: Pick<DisputaV3ItemBoard, 'tipoUnidade'> | null): boolean {
  return item?.tipoUnidade === 'LOTE'
}

/** "Lote 2" / "Item 3". */
export function rotuloUnidade(item?: Pick<DisputaV3ItemBoard, 'tipoUnidade' | 'numero'> | null): string {
  if (!item) return ''
  return `${ehLote(item) ? 'Lote' : 'Item'} ${item.numero}`
}

/**
 * Itens de um lote em disputa: referência de cada item e o total do lote; na
 * visão do fornecedor, a própria cotação por item e o aviso de inelegibilidade
 * (quem não cotou todos os itens do lote não disputa o lote).
 */
export function ItensDoLote({ item, visao }: { item: DisputaV3ItemBoard | null; visao: 'FORNECEDOR' | 'PREGOEIRO' }) {
  if (!item || !ehLote(item) || !item.itensDoLote?.length) return null
  const minhaCotacao = visao === 'FORNECEDOR' && item.itensDoLote.some((i) => i.minhaProposta?.valorTotal != null)
  return (
    <div className="space-y-2">
      {visao === 'FORNECEDOR' && item.elegivel === false && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Sua proposta não cotou todos os itens deste lote
          {item.itensNaoCotados?.length ? ` (faltam os itens ${item.itensNaoCotados.join(', ')})` : ''}. O edital exige a
          cotação de todos os itens do grupo: você não participa da disputa deste lote.
        </div>
      )}
      <div className="rounded-xl border border-slate-200">
        <div className="flex items-center justify-between border-b bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Itens do lote — lance pelo valor global</span>
          <span>{item.itensDoLote.length} item(ns)</span>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500">
              <th className="px-3 py-2">Item</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2 text-right">Qtd.</th>
              <th className="px-3 py-2 text-right">Referência</th>
              {minhaCotacao && <th className="px-3 py-2 text-right">Minha cotação</th>}
            </tr>
          </thead>
          <tbody>
            {item.itensDoLote.map((i) => (
              <tr key={i.id} className="border-t">
                <td className="px-3 py-2 font-medium">{i.numero}</td>
                <td className="px-3 py-2 text-slate-600">{i.descricao}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {i.quantidade} {i.unidade}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{i.valorReferencia == null ? 'Sigiloso' : formatarMoeda(i.valorReferencia)}</td>
                {minhaCotacao && <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(i.minhaProposta?.valorTotal ?? null)}</td>}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-slate-50 font-semibold">
              <td className="px-3 py-2" colSpan={3}>
                Total do lote
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{item.valorReferencia == null ? 'Sigiloso' : formatarMoeda(item.valorReferencia)}</td>
              {minhaCotacao && <td className="px-3 py-2 text-right tabular-nums">{formatarMoeda(item.minhaPropostaInicial ?? null)}</td>}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-xs text-slate-500">
        Adjudicação por lote: o valor de cada item é o rateio proporcional do lance vencedor sobre a proposta do licitante
        (centavos arredondados, resíduo no último item); o vencedor apresenta a proposta readequada na aceitação.
      </p>
    </div>
  )
}
