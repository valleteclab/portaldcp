'use client'

/**
 * CLASSIFICAÇÃO E LANCES AO VIVO do lote/item (dono, 09/11/2026: "os fornecedores
 * devem ver os lances e a posição de cada um, respeitando a anonimização" — quem
 * mira o 4º lugar precisa ver quanto vale o 4º). Colocação de todos os
 * participantes e os últimos lances; identidades em código (Fornecedor A, B…) até
 * o fim da etapa de lances, e o próprio licitante aparece como "Você".
 */
import { ListOrdered } from 'lucide-react'
import { API_URL } from '@/lib/api'
import { useConsultaAoVivo } from '@/hooks/useConsultaAoVivo'
import { formatarMoeda } from './utils'

export interface LancesAoVivoDados {
  identidades: boolean
  encerrada: boolean
  classificacao: Array<{ posicao: number; participante: string; souEu: boolean; melhorValor: number; me: boolean }>
  lances: Array<{ id: string; participante: string; souEu: boolean; valor: number; em: string; origem: string; posicaoAtual: number | null }>
}

const ROTULO_ORIGEM: Record<string, string> = {
  PROPOSTA: 'proposta inicial',
  LANCE_FECHADO: 'lance final fechado',
  DESEMPATE_MPE: 'desempate ME/EPP',
  NEGOCIACAO: 'negociação',
}

const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export function useLancesAoVivo(sessaoId: string | null | undefined, unidadeId: string | null | undefined, atualizacao?: unknown) {
  const url = sessaoId && unidadeId ? `${API_URL}/api/julgamento/sessao/${sessaoId}/lotes/${unidadeId}/lances` : null
  const [dados] = useConsultaAoVivo<LancesAoVivoDados & { unidade?: { id: string } }>(url, atualizacao, { intervaloMs: 10_000 })
  // Trocou de lote: a resposta do lote anterior não vale para este
  return url && dados && (!dados.unidade || dados.unidade.id === unidadeId) ? dados : null
}

/** Colocação de todos os participantes, com o melhor lance de cada um. `altura` limita a tabela (rola por dentro). */
export function TabelaColocacao({ dados, altura = '' }: { dados: LancesAoVivoDados; altura?: string }) {
  return (
    <div className={`overflow-auto rounded-lg border ${altura}`}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2">Posição</th>
            <th className="px-3 py-2">Participante</th>
            <th className="px-3 py-2 text-right">Melhor lance</th>
          </tr>
        </thead>
        <tbody>
          {dados.classificacao.map((c) => (
            <tr key={`${c.posicao}-${c.participante}`} className={`border-t ${c.souEu ? 'bg-emerald-50 font-semibold' : ''}`}>
              <td className="px-3 py-2">{c.posicao}º</td>
              <td className="px-3 py-2">
                {c.souEu ? 'Você' : c.participante}
                {c.me && <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800">ME/EPP</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatarMoeda(c.melhorValor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Últimos lances, do mais recente para o mais antigo. */
export function TabelaUltimosLances({ dados, altura = 'max-h-72' }: { dados: LancesAoVivoDados; altura?: string }) {
  return (
    <div className={`overflow-auto rounded-lg border ${altura}`}>
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-3 py-2">Hora</th>
            <th className="px-3 py-2">Participante</th>
            <th className="px-3 py-2 text-right">Valor</th>
          </tr>
        </thead>
        <tbody>
          {dados.lances.map((l) => (
            <tr key={l.id} className={`border-t ${l.souEu ? 'bg-emerald-50' : ''}`}>
              <td className="whitespace-nowrap px-3 py-2 tabular-nums text-slate-600">{hora(l.em)}</td>
              <td className="px-3 py-2">
                {l.souEu ? 'Você' : l.participante}
                {ROTULO_ORIGEM[l.origem] && <span className="ml-2 text-xs text-slate-400">{ROTULO_ORIGEM[l.origem]}</span>}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{formatarMoeda(l.valor)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Painel completo (sala da pregoeira): colocação e últimos lances lado a lado. */
export function LancesAoVivo({ sessaoId, unidadeId, atualizacao }: { sessaoId: string; unidadeId: string; atualizacao?: unknown }) {
  const dados = useLancesAoVivo(sessaoId, unidadeId, atualizacao)
  if (!dados || dados.classificacao.length === 0) return null

  return (
    <section aria-label="Classificação e lances" className="min-w-0 rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-slate-900">
          <ListOrdered className="h-4 w-4" /> Classificação e lances {dados.encerrada ? '' : 'ao vivo'}
        </h3>
        {!dados.identidades && <span className="text-xs text-slate-500">Participantes identificados por código até o fim da etapa de lances.</span>}
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Colocação</div>
          <TabelaColocacao dados={dados} />
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Últimos lances</div>
          <TabelaUltimosLances dados={dados} />
        </div>
      </div>
    </section>
  )
}
