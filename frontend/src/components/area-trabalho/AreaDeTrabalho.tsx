'use client'

/**
 * ÁREA DE TRABALHO DO AGENTE DE CONTRATAÇÃO / PREGOEIRO.
 * Os processos do órgão em fase externa, cada um com a PRÓXIMA AÇÃO: primeiro
 * o que depende do agente ("Com você"), depois o que aguarda licitante ou prazo.
 * Fonte: GET /api/area-de-trabalho (regra no backend). Atualiza sozinha.
 * Duas visões, à escolha do usuário (fica gravada no navegador): LISTA paginada,
 * por urgência, e QUADRO (kanban) com uma coluna por fase do processo.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, ChevronLeft, ChevronRight, Clock3, Columns3, Hourglass, List, RefreshCw, Search, UserCheck } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface Acao {
  vez: 'VOCE' | 'AGUARDANDO'
  titulo: string
  detalhe: string | null
  prazo: string | null
  destino: 'SALA' | 'PROCESSO'
}
interface Processo {
  id: string
  numero_processo: string
  objeto: string
  modalidade: string
  fase: string
  situacao: string
  valor_estimado: number | null
  pregoeiro: { id: string; nome: string | null } | null
  meu: boolean
  unidades: { tipo: 'ITEM' | 'LOTE'; total: number }
  propostas: number
  acao: Acao
}
interface Resposta {
  gerado_em: string
  total: number
  com_voce: number
  aguardando: number
  processos: Processo[]
}

const MODALIDADE: Record<string, string> = {
  PREGAO_ELETRONICO: 'Pregão eletrônico',
  DISPENSA_ELETRONICA: 'Dispensa eletrônica',
  CONCORRENCIA: 'Concorrência',
  LEILAO: 'Leilão',
  CONCURSO: 'Concurso',
  DIALOGO_COMPETITIVO: 'Diálogo competitivo',
  INEXIGIBILIDADE: 'Inexigibilidade',
}
const FASE: Record<string, string> = {
  AGUARDANDO_DIVULGACAO: 'Aguardando divulgação',
  PUBLICADO: 'Publicado',
  IMPUGNACAO: 'Prazo de impugnação',
  ACOLHIMENTO_PROPOSTAS: 'Recebendo propostas',
  ANALISE_PROPOSTAS: 'Análise das propostas',
  EM_DISPUTA: 'Lances',
  JULGAMENTO: 'Julgamento',
  HABILITACAO: 'Habilitação',
  ADJUDICACAO: 'Adjudicação',
}
const moeda = (v: number | null) => (v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))
const dataHora = (iso: string) => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** "em 1 h 20 min" / "há 5 min" — o prazo que está correndo. */
function quanto(iso: string, agora: number): { texto: string; vencido: boolean } {
  const ms = new Date(iso).getTime() - agora
  const min = Math.round(Math.abs(ms) / 60000)
  const partes = min >= 1440 ? `${Math.floor(min / 1440)} d ${Math.floor((min % 1440) / 60)} h` : min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`
  return { texto: ms >= 0 ? `em ${partes}` : `há ${partes}`, vencido: ms < 0 }
}

/** Colunas do quadro: a fase externa na ordem em que o processo caminha. */
const COLUNAS: Array<{ chave: string; titulo: string; fases: string[] }> = [
  { chave: 'propostas', titulo: 'Recebendo propostas', fases: ['AGUARDANDO_DIVULGACAO', 'PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS'] },
  { chave: 'analise', titulo: 'Abertura e análise', fases: ['ANALISE_PROPOSTAS'] },
  { chave: 'lances', titulo: 'Lances', fases: ['EM_DISPUTA'] },
  { chave: 'julgamento', titulo: 'Julgamento', fases: ['JULGAMENTO'] },
  { chave: 'habilitacao', titulo: 'Habilitação e recursos', fases: ['HABILITACAO'] },
  { chave: 'homologacao', titulo: 'Adjudicação e homologação', fases: ['ADJUDICACAO'] },
]
const TAMANHOS_PAGINA = [10, 20, 50]
const CHAVE_VISAO = 'dcp.area-de-trabalho.visao'
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

const destinoDe = (p: Processo) => (p.acao.destino === 'SALA' ? `/orgao/processos/${p.id}/sessao` : `/orgao/processos/${p.id}?detalhes=1`)

export function AreaDeTrabalho() {
  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [soMeus, setSoMeus] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())
  const [visao, setVisao] = useState<'lista' | 'quadro'>('lista')
  const [busca, setBusca] = useState('')
  const [modalidade, setModalidade] = useState('')
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(10)

  // A visão escolhida fica gravada no navegador
  useEffect(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(CHAVE_VISAO) : null
    if (v === 'quadro' || v === 'lista') setVisao(v)
  }, [])
  const trocarVisao = (v: 'lista' | 'quadro') => {
    setVisao(v)
    try {
      window.localStorage.setItem(CHAVE_VISAO, v)
    } catch {
      /* navegador sem armazenamento: só não lembra a escolha */
    }
  }

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/area-de-trabalho${soMeus ? '?meus=1' : ''}`, { cache: 'no-store' })
      if (!res.ok) throw new Error('Não foi possível carregar a área de trabalho')
      setDados(await res.json())
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setCarregando(false)
    }
  }, [soMeus])

  useEffect(() => {
    setCarregando(true)
    void carregar()
    // A fila muda sozinha (proposta chega, prazo vence): relê a cada 30 s e ao voltar para a aba
    const t = setInterval(() => void carregar(), 30000)
    const foco = () => void carregar()
    window.addEventListener('focus', foco)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', foco)
    }
  }, [carregar])

  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  // Busca (número, objeto ou ação) e modalidade valem para as duas visões
  const termo = semAcento(busca.trim())
  const filtrados = (dados?.processos ?? []).filter(
    (p) =>
      (!modalidade || p.modalidade === modalidade) &&
      (!termo || semAcento(`${p.numero_processo} ${p.objeto} ${p.acao.titulo} ${p.pregoeiro?.nome ?? ''}`).includes(termo)),
  )
  const modalidades = [...new Set((dados?.processos ?? []).map((p) => p.modalidade))]
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / porPagina))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const daPagina = filtrados.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina)
  const comVoce = daPagina.filter((p) => p.acao.vez === 'VOCE')
  const aguardando = daPagina.filter((p) => p.acao.vez === 'AGUARDANDO')
  const totalComVoce = filtrados.filter((p) => p.acao.vez === 'VOCE').length

  const linha = (p: Processo) => {
    const prazo = p.acao.prazo ? quanto(p.acao.prazo, agora) : null
    const voce = p.acao.vez === 'VOCE'
    return (
      <li key={p.id} className={`rounded-xl border bg-white p-4 ${voce ? 'border-l-4 border-l-blue-600' : 'border-l-4 border-l-slate-300'}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{p.numero_processo}</span>
              <span>· {MODALIDADE[p.modalidade] ?? p.modalidade}</span>
              <Badge className="bg-slate-100 text-slate-700">{FASE[p.fase] ?? p.fase}</Badge>
              {p.situacao === 'SUSPENSA' && <Badge className="bg-amber-100 text-amber-800">Suspenso</Badge>}
              {p.meu && <Badge className="bg-blue-100 text-blue-800">Você é o agente</Badge>}
            </div>
            <div className="mt-1 line-clamp-2 text-sm text-slate-700">{p.objeto}</div>
            <div className={`mt-2 text-base font-semibold ${voce ? 'text-blue-900' : 'text-slate-700'}`}>{p.acao.titulo}</div>
            {p.acao.detalhe && <div className="text-sm text-slate-600">{p.acao.detalhe}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              <span>
                {p.unidades.total} {p.unidades.tipo === 'LOTE' ? (p.unidades.total === 1 ? 'lote' : 'lotes') : p.unidades.total === 1 ? 'item' : 'itens'}
              </span>
              <span>{p.propostas} {p.propostas === 1 ? 'proposta' : 'propostas'}</span>
              <span>Estimado {moeda(p.valor_estimado)}</span>
              {!p.meu && p.pregoeiro?.nome && <span>Agente: {p.pregoeiro.nome}</span>}
              {prazo && p.acao.prazo && (
                <span className={`inline-flex items-center gap-1 font-medium ${prazo.vencido ? 'text-red-700' : 'text-amber-700'}`}>
                  <Clock3 className="h-3.5 w-3.5" />
                  {dataHora(p.acao.prazo)} ({prazo.texto})
                </span>
              )}
            </div>
          </div>
          <Button asChild size="sm" variant={voce ? 'default' : 'outline'}>
            <Link href={destinoDe(p)}>
              {p.acao.destino === 'SALA' ? 'Abrir a sala' : 'Abrir o processo'}
              <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </li>
    )
  }

  const cartao = (p: Processo) => {
    const prazo = p.acao.prazo ? quanto(p.acao.prazo, agora) : null
    const voce = p.acao.vez === 'VOCE'
    return (
      <li key={p.id}>
        <Link
          href={destinoDe(p)}
          className={`block rounded-lg border bg-white p-3 text-sm shadow-sm transition hover:shadow ${voce ? 'border-l-4 border-l-blue-600' : 'border-l-4 border-l-slate-300'}`}
        >
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{p.numero_processo}</span>
            <span>{MODALIDADE[p.modalidade] ?? p.modalidade}</span>
          </div>
          <div className="mt-1 line-clamp-2 text-xs text-slate-600">{p.objeto}</div>
          <div className={`mt-2 font-semibold ${voce ? 'text-blue-900' : 'text-slate-700'}`}>{p.acao.titulo}</div>
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
            <Badge className={voce ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-600'}>{voce ? 'Com você' : 'Aguardando'}</Badge>
            {prazo && p.acao.prazo && (
              <span className={`inline-flex items-center gap-1 font-medium ${prazo.vencido ? 'text-red-700' : 'text-amber-700'}`}>
                <Clock3 className="h-3 w-3" />
                {prazo.texto}
              </span>
            )}
            {p.situacao === 'SUSPENSA' && <span className="font-medium text-amber-800">Suspenso</span>}
          </div>
        </Link>
      </li>
    )
  }

  return (
    <div className={`mx-auto space-y-5 p-4 sm:p-6 ${visao === 'quadro' ? 'max-w-[110rem]' : 'max-w-5xl'}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Área de trabalho</h1>
          <p className="text-sm text-slate-600">Processos em fase externa e a próxima ação de cada um. Primeiro o que depende de você.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={soMeus} onChange={(e) => setSoMeus(e.target.checked)} />
            Só os processos em que sou o agente
          </label>
          <Button size="sm" variant="ghost" onClick={() => void carregar()} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

      {dados && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Em fase externa</div><div className="text-2xl font-bold text-slate-900">{dados.total}</div></CardContent></Card>
          <Card className="border-blue-200"><CardContent className="p-4"><div className="text-xs text-blue-700">Com você</div><div className="text-2xl font-bold text-blue-900">{dados.com_voce}</div></CardContent></Card>
          <Card><CardContent className="p-4"><div className="text-xs text-slate-500">Aguardando licitante ou prazo</div><div className="text-2xl font-bold text-slate-900">{dados.aguardando}</div></CardContent></Card>
        </div>
      )}

      {dados && dados.total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[14rem] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input
              aria-label="Buscar por número, objeto ou ação"
              placeholder="Buscar por número, objeto ou ação"
              className="pl-8"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value)
                setPagina(1)
              }}
            />
          </div>
          {modalidades.length > 1 && (
            <select
              aria-label="Modalidade"
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-sm"
              value={modalidade}
              onChange={(e) => {
                setModalidade(e.target.value)
                setPagina(1)
              }}
            >
              <option value="">Todas as modalidades</option>
              {modalidades.map((m) => (
                <option key={m} value={m}>
                  {MODALIDADE[m] ?? m}
                </option>
              ))}
            </select>
          )}
          <div className="flex overflow-hidden rounded-md border border-slate-200" role="group" aria-label="Visão">
            <button
              type="button"
              aria-pressed={visao === 'lista'}
              onClick={() => trocarVisao('lista')}
              className={`flex items-center gap-1 px-3 py-2 text-sm ${visao === 'lista' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <List className="h-4 w-4" /> Lista
            </button>
            <button
              type="button"
              aria-pressed={visao === 'quadro'}
              onClick={() => trocarVisao('quadro')}
              className={`flex items-center gap-1 px-3 py-2 text-sm ${visao === 'quadro' ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
            >
              <Columns3 className="h-4 w-4" /> Quadro
            </button>
          </div>
        </div>
      )}

      {!dados && carregando && <div className="py-10 text-center text-sm text-slate-400">Carregando…</div>}

      {dados && dados.total === 0 && (
        <div className="rounded-xl border border-dashed bg-white px-4 py-10 text-center text-sm text-slate-500">
          Nenhum processo em fase externa{soMeus ? ' em que você é o agente' : ''} no momento.
        </div>
      )}

      {dados && dados.total > 0 && filtrados.length === 0 && (
        <div className="rounded-xl border border-dashed bg-white px-4 py-8 text-center text-sm text-slate-500">Nenhum processo corresponde à busca.</div>
      )}

      {visao === 'lista' && filtrados.length > 0 && (
        <>
          {comVoce.length > 0 && (
            <section aria-label="Com você" className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-800">
                <UserCheck className="h-4 w-4" /> Com você ({totalComVoce})
              </h2>
              <ul className="space-y-2">{comVoce.map(linha)}</ul>
            </section>
          )}
          {aguardando.length > 0 && (
            <section aria-label="Aguardando" className="space-y-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
                <Hourglass className="h-4 w-4" /> Aguardando licitante ou prazo ({filtrados.length - totalComVoce})
              </h2>
              <ul className="space-y-2">{aguardando.map(linha)}</ul>
            </section>
          )}
          <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span>
              {(paginaAtual - 1) * porPagina + 1}–{Math.min(paginaAtual * porPagina, filtrados.length)} de {filtrados.length}
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1">
                Por página
                <select
                  className="h-8 rounded-md border border-slate-200 bg-white px-1"
                  value={porPagina}
                  onChange={(e) => {
                    setPorPagina(Number(e.target.value))
                    setPagina(1)
                  }}
                >
                  {TAMANHOS_PAGINA.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <Button size="sm" variant="outline" disabled={paginaAtual <= 1} onClick={() => setPagina(paginaAtual - 1)}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              <span>
                Página {paginaAtual} de {totalPaginas}
              </span>
              <Button size="sm" variant="outline" disabled={paginaAtual >= totalPaginas} onClick={() => setPagina(paginaAtual + 1)}>
                Próxima <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </nav>
        </>
      )}

      {visao === 'quadro' && filtrados.length > 0 && (
        <div className="overflow-x-auto pb-2" aria-label="Quadro por fase">
          <div className="flex min-w-max gap-3">
            {COLUNAS.map((c) => {
              const itens = filtrados.filter((p) => c.fases.includes(p.fase))
              const meus = itens.filter((p) => p.acao.vez === 'VOCE').length
              return (
                <section key={c.chave} aria-label={c.titulo} className="flex w-72 shrink-0 flex-col rounded-xl border bg-slate-50">
                  <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
                    <h2 className="text-sm font-semibold text-slate-800">{c.titulo}</h2>
                    <div className="flex items-center gap-1 text-xs">
                      {meus > 0 && <Badge className="bg-blue-100 text-blue-800">{meus} com você</Badge>}
                      <Badge className="bg-slate-200 text-slate-700">{itens.length}</Badge>
                    </div>
                  </header>
                  {itens.length ? (
                    <ul className="max-h-[70vh] space-y-2 overflow-y-auto p-2">{itens.map(cartao)}</ul>
                  ) : (
                    <p className="px-3 py-6 text-center text-xs text-slate-400">Nenhum processo nesta fase.</p>
                  )}
                </section>
              )
            })}
          </div>
        </div>
      )}

      {dados && <p className="text-xs text-slate-400">Atualizado em {dataHora(dados.gerado_em)} · atualiza sozinho a cada 30 segundos.</p>}
    </div>
  )
}
