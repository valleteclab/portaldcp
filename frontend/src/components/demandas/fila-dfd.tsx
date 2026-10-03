'use client'

/**
 * FILA DO DFD — peças da tela de DFD consolidado (unidade de planejamento)
 * reescrita como fila de pedidos aprovados aguardando DFD (mockup aprovado):
 * sugestões de junção por classe, a linha de cada pedido e a tabela compacta
 * de DFDs em andamento. Regras e dados continuam na página — aqui só a
 * apresentação.
 */
import Link from 'next/link'
import { ArrowRight, Check, Eye } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { COR_STATUS_DFD, formatarMoeda, type Parecido, AlertaParecidos } from '@/components/demandas/dfd-comum'
import { proximaAcaoDfd, rotaDoDfd, type DfdNaLista, type PermissoesGeraisDfd } from '@/lib/demandas/proxima-acao-dfd'

export const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/** "aprovado há N dias" a partir de `data_aprovacao` — null quando a demanda não tem a data (não mostra). */
export function diasDesde(data?: string | null): number | null {
  if (!data) return null
  const d = new Date(data)
  if (Number.isNaN(d.getTime())) return null
  const dias = Math.floor((Date.now() - d.getTime()) / 86400000)
  return dias < 0 ? 0 : dias
}

export const rotuloIdade = (dias: number) => (dias === 0 ? 'aprovado hoje' : `aprovado ${plural(dias, 'há 1 dia', `há ${dias} dias`)}`)

export interface Pedido {
  id: string
  objeto: string
  setor: string
  classe: { codigo: string; nome: string }
  nItens: number
  valor: number
  dias: number | null
}

export interface SugestaoJuncao {
  chave: string
  nome: string
  ids: string[]
  setores: number
  valor: number
}

/** Chips "Sugestões de junção": classes com 2+ pedidos — selecionar todos de uma vez. */
export function SugestoesJuncao({ sugestoes, onSelecionar }: { sugestoes: SugestaoJuncao[]; onSelecionar: (ids: string[]) => void }) {
  if (!sugestoes.length) return null
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Sugestões de junção (mesma classe)</p>
      <div className="flex flex-wrap gap-2">
        {sugestoes.map((s) => (
          <span key={s.chave} className="inline-flex items-center gap-2 rounded-full border bg-slate-50 pl-3 pr-1.5 py-1 text-xs">
            <span className="text-gray-800">
              <b className="text-gray-900">{s.nome}</b> · {plural(s.ids.length, 'pedido', 'pedidos')} · {plural(s.setores, 'setor', 'setores')} · {formatarMoeda(s.valor)}
            </span>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => onSelecionar(s.ids)}>
              Selecionar os {s.ids.length}
            </Button>
          </span>
        ))}
      </div>
    </div>
  )
}

/** Uma linha da fila: um PEDIDO (demanda), não uma classe. */
export function LinhaPedido({
  pedido, selecionado, podeMontar, onAlternar, onIniciarUm, onVerPedido,
}: {
  pedido: Pedido
  selecionado: boolean
  podeMontar: boolean
  onAlternar: () => void
  onIniciarUm: () => void
  onVerPedido: () => void
}) {
  return (
    <li className={`rounded-lg border p-3 flex flex-wrap items-start gap-3 min-w-0 ${selecionado ? 'border-blue-600 bg-blue-50/60' : 'bg-white'}`}>
      {podeMontar && (
        <input
          type="checkbox"
          aria-label={`Selecionar o pedido ${pedido.objeto}`}
          checked={selecionado}
          onChange={onAlternar}
          className="h-5 w-5 shrink-0 mt-0.5 cursor-pointer accent-blue-700"
        />
      )}
      <div className="min-w-0 flex-[1_1_240px]">
        <p className="font-semibold text-gray-900 break-words">{pedido.objeto}</p>
        <p className="text-xs text-gray-600 flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5">
          <span>{pedido.setor}</span>
          <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-medium text-gray-700">{pedido.classe.nome}</span>
          <span>{plural(pedido.nItens, 'item', 'itens')}</span>
          {pedido.dias !== null && <span>{rotuloIdade(pedido.dias)}</span>}
        </p>
      </div>
      <div className="text-right font-semibold text-gray-900 shrink-0">{formatarMoeda(pedido.valor)}</div>
      <div className="w-full flex gap-2 flex-wrap">
        {podeMontar && (
          <Button variant="outline" size="sm" onClick={onIniciarUm}>Iniciar contratação só com este</Button>
        )}
        <Button variant="ghost" size="sm" onClick={onVerPedido}>Ver pedido</Button>
      </div>
    </li>
  )
}

/** Painel do passo 2/3: resumo da seleção, prévia do que o DFD vai ter e os botões de ação. */
export function PainelFila({
  selecionadas, setores, valor, previa, carregando, montando, classesMisturadas, onMontar, onIniciarUm, onLimpar, onVerPrevia,
}: {
  selecionadas: number
  setores: string[]
  valor: number
  previa: { itens: Array<{ chave: string; descricao: string; quantidade_somada: number; unidade_medida: string }>; valor_total_estimado: number; alertas: Parecido[] } | null
  carregando: boolean
  montando: boolean
  classesMisturadas: boolean
  onMontar: () => void
  onIniciarUm: () => void
  onLimpar: () => void
  onVerPrevia: () => void
}) {
  if (!selecionadas) {
    return (
      <section className="rounded-lg border bg-white p-4 space-y-2 text-sm" aria-labelledby="painel-fila-titulo">
        <h2 id="painel-fila-titulo" className="text-sm font-semibold text-gray-900">2. Confira o DFD</h2>
        <p className="text-gray-700">Marque pedidos na fila.</p>
        <p className="text-gray-600 text-xs">O DFD vai somar os itens por classe e listar os setores envolvidos.</p>
      </section>
    )
  }
  const itensVisiveis = previa?.itens.slice(0, 6) ?? []
  const resto = (previa?.itens.length ?? 0) - itensVisiveis.length
  return (
    <section className="rounded-lg border border-blue-300 bg-white p-4 space-y-3 text-sm shadow-sm" aria-labelledby="painel-fila-titulo">
      <div className="flex items-start justify-between gap-2">
        <h2 id="painel-fila-titulo" className="text-sm font-semibold text-gray-900">2. Confira o DFD</h2>
        <button type="button" onClick={onLimpar} className="text-xs text-gray-700 hover:underline shrink-0">Limpar seleção</button>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <dt className="text-gray-600">Pedidos</dt><dd className="text-right font-semibold text-gray-900">{selecionadas}</dd>
        <dt className="text-gray-600">Setores</dt><dd className="text-right font-medium text-gray-900 break-words">{setores.join(', ') || '—'}</dd>
        <dt className="text-gray-600">Valor estimado</dt>
        <dd className="text-right font-semibold text-gray-900">{formatarMoeda(previa?.valor_total_estimado ?? valor)}</dd>
      </dl>
      <div className="rounded-md bg-slate-50 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">O que o DFD vai ter</p>
        {carregando && !previa ? (
          <p className="text-gray-600 flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-gray-400 border-t-transparent animate-spin" aria-hidden="true" /> Somando os itens…</p>
        ) : previa ? (
          <>
            <ul className="text-xs text-gray-800 space-y-0.5">
              {itensVisiveis.map((i) => (
                <li key={i.chave} className="flex justify-between gap-2">
                  <span className="truncate" title={i.descricao}>{i.descricao}</span>
                  <span className="shrink-0 text-gray-600">{i.quantidade_somada} {i.unidade_medida}</span>
                </li>
              ))}
              {resto > 0 && <li className="text-gray-600">e mais {plural(resto, 'item', 'itens')}</li>}
            </ul>
            <button type="button" onClick={onVerPrevia} className="text-xs text-blue-800 underline inline-flex items-center gap-1">
              <Eye className="h-3 w-3" aria-hidden="true" /> Ver prévia completa
            </button>
          </>
        ) : (
          <p className="text-gray-700">Somando os itens…</p>
        )}
      </div>
      {classesMisturadas && (
        <p role="note" className="rounded-md bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900">
          Pedidos de classes diferentes: considere DFDs separados, um por contratação.
        </p>
      )}
      <AlertaParecidos alertas={previa?.alertas} compacto />
      <div className="flex flex-col gap-2">
        <Button className="w-full" size="lg" onClick={onMontar} disabled={montando || carregando || !previa}>
          {montando ? <span className="h-4 w-4 mr-2 rounded-full border-2 border-white border-t-transparent animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4 mr-2" aria-hidden="true" />}
          Montar DFD com {plural(selecionadas, 'este pedido', `estes ${selecionadas} pedidos`)}
        </Button>
        {selecionadas === 1 && (
          <Button variant="outline" className="w-full" onClick={onIniciarUm} disabled={montando}>
            Iniciar contratação deste pedido
          </Button>
        )}
      </div>
    </section>
  )
}

/** "DFDs em andamento" como tabela compacta: nº/ano, objeto, pedidos·setores, situação, próximo passo. */
export function TabelaDfds({ dfds, permissoes }: { dfds: DfdNaLista[]; permissoes: PermissoesGeraisDfd | null }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm min-w-[520px]">
        <thead className="bg-slate-50">
          <tr className="text-left text-xs text-gray-600 border-b">
            <th scope="col" className="py-2 px-3">DFD</th>
            <th scope="col" className="py-2 px-3">Pedidos</th>
            <th scope="col" className="py-2 px-3">Situação</th>
            <th scope="col" className="py-2 px-3">Próximo passo</th>
          </tr>
        </thead>
        <tbody>
          {dfds.map((dfd) => {
            const acao = proximaAcaoDfd(dfd, permissoes)
            const d = dfd as DfdNaLista & { numero: number; ano: number; objeto: string; n_demandas: number; setores: string | null }
            return (
              <tr key={dfd.id} className="border-b last:border-0 align-top">
                <td className="py-2 px-3 min-w-0">
                  <Link href={rotaDoDfd(dfd.id)} className="font-semibold text-blue-800 hover:underline whitespace-nowrap">DFD {d.numero}/{d.ano}</Link>
                  <p className="text-xs text-gray-600 break-words line-clamp-1 max-w-[220px]">{d.objeto}</p>
                </td>
                <td className="py-2 px-3 whitespace-nowrap text-gray-800">{d.n_demandas}{d.setores ? ` · ${d.setores}` : ''}</td>
                <td className="py-2 px-3"><Badge className={`${COR_STATUS_DFD[dfd.status] ?? ''} hover:opacity-100`}>{acao.situacao}</Badge></td>
                <td className="py-2 px-3">
                  {acao.principal ? (
                    <Link href={acao.principal.href} className="text-blue-800 hover:underline inline-flex items-center gap-1 whitespace-nowrap">
                      {acao.principal.rotulo}<ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  ) : acao.secundaria ? (
                    <Link href={acao.secundaria.href} className="text-gray-700 hover:underline whitespace-nowrap">{acao.secundaria.rotulo}</Link>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
