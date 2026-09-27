'use client'

/**
 * Seção 3 da demanda — Materiais/serviços: tabela dos itens (lista em telas
 * estreitas), filtro por tipo e texto, total estimado e a prévia de como os
 * itens entram no PCA (1 linha por classe).
 */
import { useState } from 'react'
import { Info, Package, Pencil, Plus, Search, Trash2, Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SecaoDemanda } from './SecaoDemanda'
import { PRIORIDADE_ITEM, fmtMoeda, totalDaDemanda, type ItemDemanda } from './tipos'

type FiltroTipo = 'TODOS' | 'MATERIAL' | 'SERVICO'

const fmtQtd = (v: number) => Number(v || 0).toLocaleString('pt-BR')

function Prioridade({ valor }: { valor: number }) {
  const p = PRIORIDADE_ITEM[valor]
  if (!p) return <span className="text-gray-400">—</span>
  return <span className={`inline-block whitespace-nowrap rounded border px-1.5 py-0.5 text-xs font-medium ${p.cor}`}>{p.label}</span>
}

/** Linha de detalhes do item: tipo · código · classe · trimestre. */
function DetalhesItem({ item }: { item: ItemDemanda }) {
  const partes = [
    item.categoria === 'MATERIAL' ? 'Material' : 'Serviço',
    item.codigo_item_catalogo ? `Cód. ${item.codigo_item_catalogo}` : null,
    item.trimestre_previsto ? `${item.trimestre_previsto}º trimestre` : null,
  ].filter(Boolean)
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
      <span>{partes.join(' · ')}</span>
      {item.nome_classe ? (
        <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-800" title={item.codigo_classe ? `Classe ${item.codigo_classe}` : undefined}>
          Classe: {item.nome_classe}
        </span>
      ) : (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-800">sem classe</span>
      )}
    </div>
  )
}

export function ItensDemanda({
  itens,
  podeEditar,
  onAdicionar,
  onEditar,
  onRemover,
}: {
  itens: ItemDemanda[]
  podeEditar: boolean
  onAdicionar: () => void
  onEditar: (item: ItemDemanda) => void
  onRemover: (itemId: string) => void
}) {
  const [filtro, setFiltro] = useState('')
  const [tipo, setTipo] = useState<FiltroTipo>('TODOS')

  const total = totalDaDemanda(itens)
  const nMateriais = itens.filter(i => i.categoria === 'MATERIAL').length
  const nServicos = itens.filter(i => i.categoria === 'SERVICO').length
  const termo = filtro.trim().toLowerCase()
  const filtrados = itens.filter(item => {
    const textoOk = !termo ||
      item.descricao_objeto.toLowerCase().includes(termo) ||
      (item.codigo_item_catalogo || '').toLowerCase().includes(termo) ||
      (item.nome_classe || '').toLowerCase().includes(termo)
    return textoOk && (tipo === 'TODOS' || item.categoria === tipo)
  })

  // Prévia do PCA: o nome da classe normalizado consolida itens de origens
  // diferentes (CATMAT usa "7060", o catálogo próprio "1000" — mesmo nome de classe)
  const gruposPCA = (() => {
    const map = new Map<string, { nome: string; valor: number; itens: number }>()
    for (const item of itens) {
      const nome = item.nome_classe || item.descricao_objeto || ''
      const chave = nome.trim().toUpperCase() || item.codigo_classe || `sem-classe:${item.id}`
      const atual = map.get(chave) || { nome, valor: 0, itens: 0 }
      atual.valor += Number(item.valor_total_estimado) || 0
      atual.itens += 1
      map.set(chave, atual)
    }
    return Array.from(map.values())
  })()

  const acoesItem = (item: ItemDemanda) => (
    <div className="flex items-center justify-end gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEditar(item)}
        aria-label={`Editar o item ${item.descricao_objeto}`} title="Editar">
        <Pencil className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button variant="ghost" size="icon" className="h-8 w-8 text-red-700 hover:text-red-800 hover:bg-red-50" onClick={() => onRemover(item.id)}
        aria-label={`Remover o item ${item.descricao_objeto}`} title="Remover">
        <Trash2 className="h-4 w-4" aria-hidden="true" />
      </Button>
    </div>
  )

  return (
    <SecaoDemanda
      id="secao-3"
      numero={3}
      titulo="Materiais e serviços"
      completa={itens.length > 0}
      descricao="O que o setor precisa e quanto. Procure no catálogo; o valor é só uma estimativa — a pesquisa de preços vem depois."
      acoes={podeEditar && itens.length > 0 ? (
        <Button size="sm" onClick={onAdicionar}>
          <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" /> Adicionar item
        </Button>
      ) : undefined}
    >
      {itens.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 px-4 text-center">
          <Package className="h-10 w-10 mx-auto text-gray-300 mb-3" aria-hidden="true" />
          <p className="font-medium text-gray-700">Nenhum item adicionado ainda</p>
          {podeEditar && (
            <>
              <p className="text-sm text-gray-600 mt-1">A demanda só pode ser enviada com pelo menos um item.</p>
              <Button size="sm" className="mt-4" onClick={onAdicionar}>
                <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" /> Adicionar item
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px] max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" aria-hidden="true" />
              <Input
                value={filtro}
                onChange={e => setFiltro(e.target.value)}
                placeholder="Filtrar por descrição, código ou classe…"
                aria-label="Filtrar itens"
                className="pl-9 h-9"
              />
            </div>
            <div role="tablist" aria-label="Tipo de item" className="flex gap-1.5 flex-wrap">
              {([
                ['TODOS', `Todos (${itens.length})`],
                ['MATERIAL', `Materiais (${nMateriais})`],
                ['SERVICO', `Serviços (${nServicos})`],
              ] as const).map(([valor, rotulo]) => (
                <Button key={valor} role="tab" aria-selected={tipo === valor} size="sm"
                  variant={tipo === valor ? 'default' : 'outline'} onClick={() => setTipo(valor)}>
                  {rotulo}
                </Button>
              ))}
            </div>
          </div>

          {filtrados.length === 0 ? (
            <p className="rounded-md border bg-slate-50 py-6 text-center text-sm text-gray-600">Nenhum item com esse filtro.</p>
          ) : (
            <>
              {/* Telas largas: tabela */}
              <div className="hidden lg:block overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-700">
                    <tr>
                      <th scope="col" className="px-3 py-2 text-left w-10">Nº</th>
                      <th scope="col" className="px-3 py-2 text-left">Item</th>
                      <th scope="col" className="px-3 py-2 text-right">Qtde</th>
                      <th scope="col" className="px-3 py-2 text-left">Unid.</th>
                      <th scope="col" className="px-3 py-2 text-right whitespace-nowrap">Valor unit.</th>
                      <th scope="col" className="px-3 py-2 text-right">Total</th>
                      <th scope="col" className="px-3 py-2 text-left">Prioridade</th>
                      {podeEditar && <th scope="col" className="px-3 py-2 text-right"><span className="sr-only">Ações</span></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((item) => (
                      <tr key={item.id} className="border-t align-top hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-gray-600">{String(itens.indexOf(item) + 1).padStart(2, '0')}</td>
                        <td className="px-3 py-2 min-w-[220px]">
                          <p className="font-medium text-gray-900 leading-snug break-words">{item.descricao_objeto}</p>
                          <DetalhesItem item={item} />
                        </td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmtQtd(item.quantidade_estimada)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{item.unidade_medida}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{fmtMoeda(Number(item.valor_unitario_estimado) || 0)}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{fmtMoeda(Number(item.valor_total_estimado) || 0)}</td>
                        <td className="px-3 py-2"><Prioridade valor={item.prioridade} /></td>
                        {podeEditar && <td className="px-3 py-1.5">{acoesItem(item)}</td>}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-gray-50">
                      <td colSpan={5} className="px-3 py-2 text-right text-sm font-semibold text-gray-800">Total estimado da demanda</td>
                      <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">{fmtMoeda(total)}</td>
                      <td colSpan={podeEditar ? 2 : 1} />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Telas estreitas: lista */}
              <ul className="lg:hidden divide-y rounded-md border">
                {filtrados.map((item) => (
                  <li key={item.id} className="p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      {item.categoria === 'MATERIAL'
                        ? <Package className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" aria-hidden="true" />
                        : <Wrench className="h-4 w-4 mt-0.5 shrink-0 text-purple-600" aria-hidden="true" />}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 text-sm leading-snug break-words">{item.descricao_objeto}</p>
                        <DetalhesItem item={item} />
                      </div>
                      {podeEditar && acoesItem(item)}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm pl-6">
                      <span className="text-gray-700">
                        {fmtQtd(item.quantidade_estimada)} {item.unidade_medida} × {fmtMoeda(Number(item.valor_unitario_estimado) || 0)}
                      </span>
                      <span className="flex items-center gap-2">
                        <Prioridade valor={item.prioridade} />
                        <span className="font-semibold text-gray-900">{fmtMoeda(Number(item.valor_total_estimado) || 0)}</span>
                      </span>
                    </div>
                  </li>
                ))}
                <li className="flex items-center justify-between gap-2 bg-gray-50 p-3 text-sm font-semibold">
                  <span>Total estimado da demanda</span>
                  <span>{fmtMoeda(total)}</span>
                </li>
              </ul>
            </>
          )}

          {/* Prévia do PCA */}
          {gruposPCA.length > 0 && (
            <div className="rounded-md border bg-slate-50 p-3">
              <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                <Info className="h-4 w-4 text-blue-700" aria-hidden="true" />
                Como entra no PCA
              </p>
              <p className="text-xs text-gray-600 mt-0.5">Cada classe vira 1 linha do Plano de Contratações Anual (Lei 14.133, art. 12, VII).</p>
              <ul className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {gruposPCA.map((g, i) => (
                  <li key={i} className="flex items-center gap-2 rounded border bg-white px-2.5 py-1.5 text-xs">
                    <span className="font-medium text-gray-800 truncate flex-1 min-w-0" title={g.nome}>{g.nome}</span>
                    <span className="text-gray-600 shrink-0">{g.itens} {g.itens === 1 ? 'item' : 'itens'}</span>
                    <span className="font-semibold text-gray-900 whitespace-nowrap">{fmtMoeda(g.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </SecaoDemanda>
  )
}
