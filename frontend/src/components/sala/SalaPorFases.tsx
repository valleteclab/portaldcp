'use client'

/**
 * SALA POR FASES (dono, 09/11/2026 — organização de referência: BLL): abas por
 * fase com o total de lotes/itens em cada uma e uma tabela por lote (início da
 * fase, tempo, fase, 1º colocado, melhor lance). Para o licitante, a tabela se
 * divide em "Vencendo" e "Perdendo". O troféu abre a classificação completa da
 * unidade, com os anexos visíveis a quem olha.
 */
import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Download, FileText, Loader2, Trophy } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { baixarArquivo } from './recursos-comum'
import type { DisputaV3ItemBoard } from './types'
import { formatarMoeda, textoCronometro } from './utils'

type Fase =
  | 'AGUARDANDO'
  | 'DISPUTA'
  | 'DESEMPATE'
  | 'JULGAMENTO'
  | 'HABILITACAO'
  | 'RECURSOS'
  | 'EM_ADJUDICACAO'
  | 'ADJUDICADO'
  | 'HOMOLOGADO'
  | 'SEM_RESULTADO'

interface LoteVisao {
  id: string
  tipo: 'ITEM' | 'LOTE'
  numero: number
  descricao: string
  fase: Fase
  faseRotulo: string
  inicioFase: string | null
  participantes: number
  primeiro: { nome: string; valor: number; souEu: boolean } | null
  melhorLance: number | null
  minhaPosicao?: number | null
  vencendo?: boolean
}

interface VisaoLotes {
  lancesEncerrados: boolean
  identidades: boolean
  fases: Array<{ fase: Fase; rotulo: string; total: number }>
  lotes: LoteVisao[]
}

const COR_FASE: Record<Fase, string> = {
  AGUARDANDO: 'bg-slate-100 text-slate-700',
  DISPUTA: 'bg-emerald-100 text-emerald-800',
  DESEMPATE: 'bg-amber-100 text-amber-800',
  JULGAMENTO: 'bg-indigo-100 text-indigo-800',
  HABILITACAO: 'bg-sky-100 text-sky-800',
  RECURSOS: 'bg-orange-100 text-orange-800',
  EM_ADJUDICACAO: 'bg-violet-100 text-violet-800',
  ADJUDICADO: 'bg-teal-100 text-teal-800',
  HOMOLOGADO: 'bg-green-100 text-green-800',
  SEM_RESULTADO: 'bg-slate-200 text-slate-600',
}

const dataHora = (d: string | null) =>
  d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'

export function SalaPorFases({
  sessaoId,
  area,
  itensAoVivo = [],
  selecionadoId,
  onSelecionar,
  atualizacao,
}: {
  sessaoId: string
  area: 'orgao' | 'fornecedor'
  /** Itens do quadro em tempo real (relógio e melhor lance da disputa). */
  itensAoVivo?: DisputaV3ItemBoard[]
  selecionadoId?: string | null
  onSelecionar?: (id: string) => void
  /** Muda a cada evento da sala: recarrega a visão por fases. */
  atualizacao?: unknown
}) {
  const [visao, setVisao] = useState<VisaoLotes | null>(null)
  const [aba, setAba] = useState<Fase | 'TODOS'>('TODOS')
  const [classificacaoDe, setClassificacaoDe] = useState<LoteVisao | null>(null)

  useEffect(() => {
    let vivo = true
    const buscar = () =>
      authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/lotes`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: VisaoLotes | null) => {
          if (vivo && j) setVisao(j)
        })
        .catch(() => {})
    buscar()
    const t = setInterval(buscar, 20_000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [sessaoId, atualizacao])

  const aoVivo = useMemo(() => new Map(itensAoVivo.map((i) => [i.id, i])), [itensAoVivo])
  const lotes = useMemo(() => (visao?.lotes ?? []).filter((l) => aba === 'TODOS' || l.fase === aba), [visao, aba])

  if (!visao) {
    return (
      <div className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando os lotes da sessão...
      </div>
    )
  }

  const tabela = (lista: LoteVisao[], titulo?: string) => (
    <div className="space-y-1">
      {titulo && <div className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>}
      <div className="w-0 min-w-full overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-800 text-left text-xs text-white">
            <tr>
              <th className="px-3 py-2">{lista[0]?.tipo === 'ITEM' ? 'Item' : 'Lote'}</th>
              <th className="px-3 py-2">Descrição</th>
              <th className="px-3 py-2">Início da fase</th>
              <th className="px-3 py-2">Tempo</th>
              <th className="px-3 py-2">Fase</th>
              <th className="px-3 py-2">1º colocado</th>
              <th className="px-3 py-2 text-right">Melhor lance</th>
              {area === 'fornecedor' && <th className="px-3 py-2 text-center">Minha posição</th>}
              <th className="px-3 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 ? (
              <tr>
                <td colSpan={area === 'fornecedor' ? 9 : 8} className="px-3 py-3 text-slate-400">
                  Sem lotes nesta fase.
                </td>
              </tr>
            ) : (
              lista.map((l) => {
                const vivo = aoVivo.get(l.id)
                const emDisputa = l.fase === 'DISPUTA' && vivo
                const melhor = emDisputa ? vivo.melhorLance?.valor ?? l.melhorLance : l.melhorLance
                const ativo = selecionadoId === l.id
                return (
                  <tr key={l.id} className={`border-t ${ativo ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <td className="px-3 py-2 font-medium">{l.numero}</td>
                    <td className="max-w-[280px] px-3 py-2">
                      <div className="line-clamp-2">{l.descricao}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-slate-600">{dataHora(l.inicioFase)}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums">{emDisputa ? textoCronometro(vivo) : '—'}</td>
                    <td className="px-3 py-2">
                      <Badge className={`${COR_FASE[l.fase]} border-0`}>{l.faseRotulo}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      {l.primeiro ? (
                        <span className={l.primeiro.souEu ? 'font-semibold text-emerald-700' : ''}>{l.primeiro.souEu ? 'Você' : l.primeiro.nome}</span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{melhor != null ? formatarMoeda(melhor) : '—'}</td>
                    {area === 'fornecedor' && (
                      <td className="px-3 py-2 text-center">
                        {l.minhaPosicao ? (
                          <span className={`font-semibold ${l.vencendo ? 'text-emerald-700' : 'text-amber-700'}`}>{l.minhaPosicao}º</span>
                        ) : (
                          '—'
                        )}
                      </td>
                    )}
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      <Button size="sm" variant="outline" className="mr-1 h-8 px-2" title="Classificação e documentos" onClick={() => setClassificacaoDe(l)}>
                        <Trophy className="h-4 w-4 text-amber-600" />
                      </Button>
                      {onSelecionar && (
                        <Button size="sm" variant={ativo ? 'default' : 'outline'} className="h-8 px-2" title="Abrir o lote" onClick={() => onSelecionar(l.id)}>
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  return (
    <section aria-label="Lotes da sessão por fase" className="min-w-0 space-y-3 rounded-xl border bg-white p-3">
      <div className="flex w-0 min-w-full gap-1 overflow-x-auto pb-1" role="tablist">
        {[{ fase: 'TODOS' as const, rotulo: 'Todos', total: visao.lotes.length }, ...visao.fases].map((f) => (
          <button
            key={f.fase}
            type="button"
            role="tab"
            aria-selected={aba === f.fase}
            onClick={() => setAba(f.fase)}
            className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition ${
              aba === f.fase ? 'border-slate-800 bg-slate-800 text-white' : f.total ? 'bg-white text-slate-700 hover:bg-slate-50' : 'bg-white text-slate-300'
            }`}
          >
            {f.rotulo}
            <span className={`ml-1 rounded px-1 ${aba === f.fase ? 'bg-white/20' : 'bg-slate-100'}`}>{f.total}</span>
          </button>
        ))}
      </div>
      {area === 'fornecedor' ? (
        <div className="space-y-3">
          {tabela(lotes.filter((l) => l.vencendo), 'Vencendo')}
          {tabela(lotes.filter((l) => !l.vencendo), 'Perdendo')}
        </div>
      ) : (
        tabela(lotes)
      )}
      {!visao.identidades && <p className="px-1 text-xs text-slate-500">Identidades em sigilo até o fim da etapa de lances (participantes por código).</p>}
      <ClassificacaoDialog sessaoId={sessaoId} lote={classificacaoDe} onFechar={() => setClassificacaoDe(null)} />
    </section>
  )
}

interface Participante {
  posicao: number | null
  participante: string | null
  nome: string
  souEu: boolean
  melhorValor: number
  me: boolean
  situacao: string
  propostaAdequada: { aceitacaoId: string; nome: string; status: string } | null
  documentos: Array<{ id: string; nome: string; exigencia: string; analise: string }>
  documentosOcultos: number
}

const ROTULO_SITUACAO: Record<string, string> = {
  CLASSIFICADO: 'Classificado',
  CONVOCADO_DESEMPATE: 'Convocado (desempate)',
  CONVOCADO_ACEITACAO: 'Convocado (proposta)',
  ACEITO: 'Proposta aceita',
  RECUSADO: 'Proposta recusada',
  DESCLASSIFICADO: 'Desclassificado',
  HABILITADO: 'Habilitado',
  INABILITADO: 'Inabilitado',
  VENCEDOR: 'Vencedor',
}

function ClassificacaoDialog({ sessaoId, lote, onFechar }: { sessaoId: string; lote: LoteVisao | null; onFechar: () => void }) {
  return (
    <Dialog open={!!lote} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-600" /> Classificação — {lote?.tipo === 'ITEM' ? 'Item' : 'Lote'} {lote?.numero}
          </DialogTitle>
          <DialogDescription>{lote?.descricao}</DialogDescription>
        </DialogHeader>
        {lote && <ConteudoClassificacao key={lote.id} sessaoId={sessaoId} loteId={lote.id} />}
      </DialogContent>
    </Dialog>
  )
}

function ConteudoClassificacao({ sessaoId, loteId }: { sessaoId: string; loteId: string }) {
  const [dados, setDados] = useState<{ classificados: Participante[]; inabilitados: Participante[]; desclassificados: Participante[] } | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/lotes/${loteId}/classificacao`, { cache: 'no-store' })
      .then(async (r) => {
        if (!vivo) return
        if (r.ok) setDados(await r.json())
        else setErro('Não foi possível carregar a classificação.')
      })
      .catch(() => vivo && setErro('Não foi possível carregar a classificação.'))
    return () => {
      vivo = false
    }
  }, [sessaoId, loteId])

  const baixar = (url: string, nome: string) => baixarArquivo(url, nome).catch(() => setErro(`Arquivo indisponível: ${nome}`))

  const grupo = (titulo: string, lista: Participante[]) => (
    <div className="space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{titulo}</div>
      {lista.length === 0 ? (
        <div className="rounded border border-dashed px-3 py-2 text-xs text-slate-400">Nenhum.</div>
      ) : (
        <div className="divide-y rounded border">
          {lista.map((p) => (
            <div key={`${p.participante}-${p.nome}`} className={`space-y-2 p-3 text-sm ${p.souEu ? 'bg-emerald-50/60' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <span className="mr-2 font-semibold">{p.posicao ? `${p.posicao}º` : '—'}</span>
                  <span className="font-medium">{p.souEu ? `${p.nome} (você)` : p.nome}</span>
                  {p.participante && p.participante !== p.nome && <span className="ml-2 text-xs text-slate-500">{p.participante}</span>}
                  {p.me && <Badge className="ml-2 border-0 bg-blue-100 text-blue-800">ME/EPP</Badge>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="tabular-nums font-semibold">{formatarMoeda(p.melhorValor)}</span>
                  <Badge variant="outline">{ROTULO_SITUACAO[p.situacao] ?? p.situacao}</Badge>
                </div>
              </div>
              {(p.propostaAdequada || p.documentos.length > 0 || p.documentosOcultos > 0) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {p.propostaAdequada && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded border bg-white px-2 py-1 text-blue-700 hover:bg-blue-50"
                      onClick={() => baixar(`${API_URL}/api/julgamento/sessao/${sessaoId}/aceitacao/${p.propostaAdequada!.aceitacaoId}/arquivo`, p.propostaAdequada!.nome)}
                    >
                      <FileText className="h-3.5 w-3.5" /> Proposta adequada
                    </button>
                  )}
                  {p.documentos.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      title={d.exigencia}
                      className="inline-flex max-w-[260px] items-center gap-1 rounded border bg-white px-2 py-1 text-slate-700 hover:bg-slate-50"
                      onClick={() => baixar(`${API_URL}/api/habilitacao/documentos/${d.id}/arquivo`, d.nome)}
                    >
                      <Download className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{d.exigencia}</span>
                      {d.analise === 'NAO_ATENDE' && <span className="ml-1 shrink-0 rounded bg-red-100 px-1 text-[10px] font-semibold text-red-700">não atende</span>}
                    </button>
                  ))}
                  {p.documentosOcultos > 0 && (
                    <span className="rounded bg-slate-100 px-2 py-1 text-slate-500">
                      {p.documentosOcultos} documento(s) de habilitação — visíveis a todos depois do resultado da habilitação
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <>
      {erro && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
      {!dados && !erro ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : dados ? (
        <div className="space-y-4">
          {grupo('Classificados', dados.classificados)}
          {grupo('Inabilitados', dados.inabilitados)}
          {grupo('Desclassificados / propostas recusadas', dados.desclassificados)}
        </div>
      ) : null}
    </>
  )
}
