'use client'

/**
 * ÁREA DE TRABALHO DO AGENTE DE CONTRATAÇÃO / PREGOEIRO.
 * Os processos do órgão em fase externa, cada um com a PRÓXIMA AÇÃO: primeiro
 * o que depende do agente ("Com você"), depois o que aguarda licitante ou prazo.
 * Fonte: GET /api/area-de-trabalho (regra no backend). Atualiza sozinha.
 */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowRight, Clock3, Hourglass, RefreshCw, UserCheck } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

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

const destinoDe = (p: Processo) => (p.acao.destino === 'SALA' ? `/orgao/processos/${p.id}/sessao` : `/orgao/processos/${p.id}?detalhes=1`)

export function AreaDeTrabalho() {
  const [dados, setDados] = useState<Resposta | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [soMeus, setSoMeus] = useState(false)
  const [agora, setAgora] = useState(() => Date.now())

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

  const comVoce = (dados?.processos ?? []).filter((p) => p.acao.vez === 'VOCE')
  const aguardando = (dados?.processos ?? []).filter((p) => p.acao.vez === 'AGUARDANDO')

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

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
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

      {!dados && carregando && <div className="py-10 text-center text-sm text-slate-400">Carregando…</div>}

      {dados && dados.total === 0 && (
        <div className="rounded-xl border border-dashed bg-white px-4 py-10 text-center text-sm text-slate-500">
          Nenhum processo em fase externa{soMeus ? ' em que você é o agente' : ''} no momento.
        </div>
      )}

      {comVoce.length > 0 && (
        <section aria-label="Com você" className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-blue-800">
            <UserCheck className="h-4 w-4" /> Com você ({comVoce.length})
          </h2>
          <ul className="space-y-2">{comVoce.map(linha)}</ul>
        </section>
      )}

      {aguardando.length > 0 && (
        <section aria-label="Aguardando" className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-600">
            <Hourglass className="h-4 w-4" /> Aguardando licitante ou prazo ({aguardando.length})
          </h2>
          <ul className="space-y-2">{aguardando.map(linha)}</ul>
        </section>
      )}

      {dados && <p className="text-xs text-slate-400">Atualizado em {dataHora(dados.gerado_em)} · atualiza sozinho a cada 30 segundos.</p>}
    </div>
  )
}
