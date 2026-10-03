"use client"

/**
 * KANBAN do andamento: as mesmas linhas da fila, em colunas. Agrupa por
 * SETOR (onde cada processo está) ou por ETAPA (em que ponto do caminho).
 * Só leitura: arrastar não tramita — a tramitação é feita na tela do
 * processo, com despacho.
 */
import { Button } from '@/components/ui/button'

export type AgrupamentoKanban = 'SETOR' | 'ETAPA'

interface LinhaKanban {
  id: string
  tipo: string
  rotulo_tipo: string
  numero: string
  objeto: string
  estado: 'OK' | 'LENTO' | 'PARADO' | 'CONCLUIDO'
  etapa_atual: string | null
  etapas: Array<{ chave: string; rotulo: string; estado: 'CONCLUIDA' | 'ATUAL' | 'FUTURA' }>
  esta_com: { setor_nome: string | null; usuario_nome: string | null; recebida: boolean; dias: number } | null
  prazo: { rotulo: string; data: string | null; vencido: boolean } | null
  link: string
}

const corBorda = (e: LinhaKanban['estado']) => (e === 'PARADO' ? 'border-l-red-500' : e === 'LENTO' ? 'border-l-amber-500' : e === 'CONCLUIDO' ? 'border-l-emerald-500' : 'border-l-[#1351b4]')
const corDias = (e: LinhaKanban['estado']) => (e === 'PARADO' ? 'text-red-700' : e === 'LENTO' ? 'text-amber-700' : 'text-gray-600')

/** Ordem natural das etapas no caminho (colunas por etapa), juntando os tipos. */
const ORDEM_ETAPAS = [
  'Pedido', 'Aprovação', 'Aprovado', 'DFD', 'Planejamento', 'TR', 'Pesquisa de preços', 'Vantajosidade', 'Reserva de recurso', 'Reserva', 'Dotação',
  'Autorização', 'Parecer', 'Parecer jurídico', 'Publicação', 'Publicado', 'Propostas', 'Disputa', 'Julgamento', 'Habilitação', 'Recurso', 'Adjudicação', 'Homologação',
  'Termo aditivo', 'Termo de renovação', 'Em andamento', 'Processo',
]

export function KanbanAndamento({ linhas, agrupar, onAbrir, onCobrar }: { linhas: LinhaKanban[]; agrupar: AgrupamentoKanban; onAbrir: (l: LinhaKanban) => void; onCobrar: (l: LinhaKanban) => void }) {
  const colunas = new Map<string, LinhaKanban[]>()
  for (const l of linhas) {
    const chave = agrupar === 'SETOR' ? l.esta_com?.setor_nome || (l.esta_com?.usuario_nome ? `Com ${l.esta_com.usuario_nome}` : 'Sem tramitação') : l.etapa_atual || (l.estado === 'CONCLUIDO' ? 'Concluído' : 'Sem etapa')
    if (!colunas.has(chave)) colunas.set(chave, [])
    colunas.get(chave)!.push(l)
  }
  const ordenadas = Array.from(colunas.entries()).sort((a, b) => {
    if (agrupar === 'ETAPA') {
      const ia = ORDEM_ETAPAS.indexOf(a[0])
      const ib = ORDEM_ETAPAS.indexOf(b[0])
      if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib)
    }
    const pa = a[1].filter((l) => l.estado === 'PARADO').length
    const pb = b[1].filter((l) => l.estado === 'PARADO').length
    return pb - pa || b[1].length - a[1].length || a[0].localeCompare(b[0], 'pt-BR')
  })

  if (!ordenadas.length) return <p className="text-sm text-gray-600 rounded-lg border border-dashed bg-slate-50 p-6 text-center">Nenhum processo com esse filtro.</p>

  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex gap-3 min-w-max" role="list" aria-label={agrupar === 'SETOR' ? 'Processos por setor' : 'Processos por etapa'}>
        {ordenadas.map(([nome, itens]) => {
          const parados = itens.filter((l) => l.estado === 'PARADO').length
          return (
            <section key={nome} role="listitem" aria-label={nome} className="w-72 shrink-0 rounded-lg border bg-slate-50 flex flex-col max-h-[70vh]">
              <header className="px-3 py-2 border-b bg-white rounded-t-lg sticky top-0">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-gray-900 truncate" title={nome}>{nome}</h3>
                  <span className="text-xs text-gray-600 whitespace-nowrap">{itens.length}{parados ? <span className="text-red-700 font-semibold"> · {parados} parado{parados === 1 ? '' : 's'}</span> : null}</span>
                </div>
              </header>
              <ul className="p-2 space-y-2 overflow-y-auto">
                {itens.map((l) => {
                  const feitas = l.etapas.filter((e) => e.estado === 'CONCLUIDA').length
                  return (
                    <li key={l.id} className={`rounded-md border border-l-4 ${corBorda(l.estado)} bg-white p-2.5 space-y-1.5 shadow-sm`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#1351b4] bg-blue-50 rounded px-1.5 py-0.5">{l.rotulo_tipo}</span>
                        <span className="text-xs font-semibold text-gray-900">{l.numero}</span>
                      </div>
                      <p className="text-sm text-gray-800 leading-snug line-clamp-2" title={l.objeto}>{l.objeto}</p>
                      <div className="h-1.5 rounded-full bg-gray-200 overflow-hidden" aria-label={`${feitas} de ${l.etapas.length} etapas`}>
                        <div className={`h-full ${l.estado === 'PARADO' ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${l.etapas.length ? Math.round((feitas / l.etapas.length) * 100) : 0}%` }} />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="text-gray-600 truncate" title={agrupar === 'SETOR' ? l.etapa_atual ?? '' : l.esta_com?.setor_nome ?? ''}>
                          {agrupar === 'SETOR' ? `Etapa: ${l.etapa_atual ?? '—'}` : `Com: ${[l.esta_com?.setor_nome, l.esta_com?.usuario_nome].filter(Boolean).join(' · ') || '—'}`}
                        </span>
                        {l.esta_com ? (
                          <span className={`font-semibold whitespace-nowrap ${corDias(l.estado)}`}>
                            {l.esta_com.dias}d{!l.esta_com.recebida ? ' · a receber' : ''}
                          </span>
                        ) : null}
                      </div>
                      {l.prazo?.data ? (
                        <div className={`text-xs ${l.prazo.vencido ? 'text-red-700' : 'text-gray-600'}`}>
                          {l.prazo.rotulo}: {new Date(l.prazo.data).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                        </div>
                      ) : null}
                      <div className="flex gap-1.5 pt-0.5">
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onAbrir(l)}>Abrir</Button>
                        {l.estado === 'PARADO' && l.tipo !== 'DEMANDA' ? (
                          <Button size="sm" className="h-7 text-xs bg-[#1351b4] hover:bg-[#0d3f8c]" onClick={() => onCobrar(l)}>Cobrar</Button>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
