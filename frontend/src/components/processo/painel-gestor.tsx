'use client'

/**
 * ANDAMENTO DOS PROCESSOS — painel do gestor (mockup aprovado).
 *
 * Uma fila só com todos os processos do órgão (licitações, aditivos,
 * renovações, avulsos) e os pedidos (demandas) aguardando DFD, cada um com o
 * seu caminho (etapas), com quem está e há quanto tempo. Vem de
 * `GET /api/processos/painel` (backend: PainelGestorService) — leitura, sem
 * nenhum POST novo. O botão "Cobrar" ainda não tem endpoint: por ora só abre
 * o processo (ver TODO abaixo).
 */
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { API_URL, authFetch } from '@/lib/api'
import { soData } from '@/lib/processo/processo'
import { pedirTextoAcao } from '@/components/DialogoGlobal'
import { toast } from 'sonner'

export interface EtapaPainel {
  chave: string
  rotulo: string
  estado: 'CONCLUIDA' | 'ATUAL' | 'FUTURA'
}

export interface EstaComPainel {
  setor_id: string | null
  setor_nome: string | null
  usuario_nome: string | null
  recebida: boolean
  desde: string | null
  dias: number
  despacho: string | null
  limite_dias: number | null
}

export interface PrazoPainel {
  rotulo: string
  data: string | null
  vencido: boolean
}

export interface LinhaPainel {
  id: string
  tipo: string
  rotulo_tipo: string
  numero: string
  objeto: string
  situacao: 'ABERTO' | 'ENCERRADO'
  estado: 'OK' | 'LENTO' | 'PARADO' | 'CONCLUIDO'
  etapas: EtapaPainel[]
  etapa_atual: string | null
  esta_com: EstaComPainel | null
  valor: number | null
  prazo: PrazoPainel | null
  link: string
  aberto_em: string | null
}

export interface GargaloPainel {
  setor_id: string | null
  setor_nome: string
  processos: number
  parados: number
  media_dias: number
}

export interface PrazoResumoPainel {
  id: string
  tipo: string
  numero: string
  objeto: string
  prazo: PrazoPainel | null
  esta_com: string | null
  link: string
}

export interface PainelGestor {
  gerado_em: string
  kpis: {
    em_andamento: number
    parados: number
    aguardando_recebimento: number
    pedidos_aguardando_dfd: number
    concluidos_mes: number
  }
  por_tipo: Record<string, number>
  gargalos: GargaloPainel[]
  prazos: PrazoResumoPainel[]
  linhas: LinhaPainel[]
}

type Kpi = 'TODOS' | 'PARADOS' | 'AGUARDANDO_RECEBIMENTO' | 'PEDIDOS_DFD' | 'CONCLUIDOS_MES'
type Ordem = 'PADRAO' | 'ANTIGOS' | 'VALOR' | 'SETOR'

const ABAS: Array<{ chave: string; label: string }> = [
  { chave: 'TODOS', label: 'Todos' },
  { chave: 'CONTRATACAO', label: 'Licitações' },
  { chave: 'ADITIVO', label: 'Aditivos' },
  { chave: 'RENOVACAO', label: 'Renovações' },
  { chave: 'AVULSO', label: 'Avulsos' },
  { chave: 'DEMANDA', label: 'Pedidos' },
]

const POR_PAGINA = 20
const LIMITE_PRAZO_DIAS = 7

const formatarMoeda = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

const plural = (n: number, singular: string, pluralForm: string) => `${n} ${n === 1 ? singular : pluralForm}`

/** Dias entre hoje e uma data ISO (pode ser negativo se já passou). */
function diasAteISO(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (isNaN(d.getTime())) return null
  const hoje = new Date()
  const hojeUtc = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  const dUtc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  return Math.round((dUtc - hojeUtc) / 86_400_000)
}

function textoPosse(c: EstaComPainel | null): string {
  if (!c) return 'Sem tramitação'
  return [c.setor_nome, c.usuario_nome].filter(Boolean).join(' · ') || 'Órgão'
}

function corDoEstado(estado: LinhaPainel['estado']): string {
  if (estado === 'PARADO') return 'border-l-4 border-l-red-500'
  if (estado === 'LENTO') return 'border-l-4 border-l-amber-500'
  return ''
}

function ChipSituacao({ linha }: { linha: LinhaPainel }) {
  if (linha.situacao === 'ENCERRADO' || linha.estado === 'CONCLUIDO') {
    return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Concluído</Badge>
  }
  if (linha.esta_com && !linha.esta_com.recebida) {
    return <Badge className="bg-amber-100 text-amber-900 border-amber-200">Aguardando recebimento</Badge>
  }
  if (linha.estado === 'PARADO') {
    return <Badge className="bg-red-100 text-red-800 border-red-200">Parado há {plural(linha.esta_com?.dias ?? 0, 'dia', 'dias')}</Badge>
  }
  return <Badge variant="secondary">Em andamento</Badge>
}

/** A barra do caminho: etapas feitas em verde, atual em azul (vermelha se o processo está parado nela), futuras cinza. */
function Caminho({ linha }: { linha: LinhaPainel }) {
  return (
    <div className="flex items-end gap-1" role="img" aria-label={`Caminho: ${linha.etapas.map((e) => e.rotulo).join(', ')}`}>
      {linha.etapas.map((e, i) => {
        const parada = e.estado === 'ATUAL' && linha.estado === 'PARADO'
        const cor = e.estado === 'CONCLUIDA' ? 'bg-emerald-500' : parada ? 'bg-red-500' : e.estado === 'ATUAL' ? 'bg-[#1351b4]' : 'bg-gray-200'
        const textoCor = e.estado === 'FUTURA' ? 'text-gray-400' : parada || e.estado === 'ATUAL' ? 'text-gray-900 font-semibold' : 'text-gray-500'
        return (
          <div key={`${e.chave}-${i}`} className="flex-1 min-w-0 flex flex-col gap-0.5" title={e.rotulo}>
            <div className={`h-1.5 rounded-full ${cor}`} aria-hidden="true" />
            <span className={`hidden sm:block text-[10px] leading-tight truncate ${textoCor}`}>{e.rotulo}</span>
          </div>
        )
      })}
    </div>
  )
}

function LinhaProcesso({ linha, aberto, onAlternar, onAbrir, onCobrar }: {
  linha: LinhaPainel
  aberto: boolean
  onAlternar: () => void
  onAbrir: () => void
  onCobrar: () => void
}) {
  const proximaEtapa = linha.etapas.find((e) => e.estado === 'ATUAL')?.rotulo ?? linha.etapas.find((e) => e.estado === 'FUTURA')?.rotulo ?? '—'
  const etapasFeitas = linha.etapas.filter((e) => e.estado === 'CONCLUIDA').map((e) => e.rotulo)
  const diasCor = linha.estado === 'PARADO' ? 'text-red-700' : linha.estado === 'LENTO' ? 'text-amber-700' : 'text-gray-600'
  return (
    <li
      className={`rounded-lg border bg-white p-3 space-y-2 cursor-pointer min-w-0 ${corDoEstado(linha.estado)}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button')) return
        onAlternar()
      }}
      tabIndex={0}
      role="button"
      aria-expanded={aberto}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onAlternar()
        }
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
        <span className={`text-[11px] font-bold uppercase tracking-wide rounded px-1.5 py-0.5 ${linha.tipo === 'DEMANDA' ? 'bg-gray-100 text-gray-600' : 'bg-blue-50 text-[#1351b4]'}`}>
          {linha.rotulo_tipo}
        </span>
        <span className="font-bold text-gray-900">{linha.numero}</span>
        <span className="text-gray-600 truncate flex-1 min-w-[120px]">{linha.objeto}</span>
        <ChipSituacao linha={linha} />
      </div>

      {linha.etapas.length > 0 && <Caminho linha={linha} />}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-600">
        <span>Está com <b className="text-gray-900">{textoPosse(linha.esta_com)}</b></span>
        {linha.situacao !== 'ENCERRADO' && (
          <span className={`font-semibold ${diasCor}`}>há {plural(linha.esta_com?.dias ?? 0, 'dia', 'dias')}</span>
        )}
        <span>Etapa: <b className="text-gray-900">{linha.situacao === 'ENCERRADO' ? 'concluído' : proximaEtapa}</b></span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={onAbrir}>Abrir</Button>
          {linha.estado === 'PARADO' && (
            <Button size="sm" className="bg-[#1351b4] hover:bg-[#0d3f8c]" onClick={onCobrar}>Cobrar</Button>
          )}
        </span>
      </div>

      {aberto && (
        <dl className="border-t border-dashed pt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Despacho atual</dt>
            <dd className="text-gray-900">{linha.esta_com?.despacho || '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Está com desde</dt>
            <dd className="text-gray-900">{linha.esta_com?.desde ? soData(linha.esta_com.desde) : '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Valor</dt>
            <dd className="text-gray-900">{formatarMoeda(linha.valor)}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Prazo</dt>
            <dd className="text-gray-900">{linha.prazo ? `${linha.prazo.rotulo}${linha.prazo.data ? ` — ${soData(linha.prazo.data)}` : ''}${linha.prazo.vencido ? ' (vencido)' : ''}` : '—'}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Etapas feitas</dt>
            <dd className="text-gray-900">{etapasFeitas.length ? etapasFeitas.join(' → ') : '—'}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Próxima</dt>
            <dd className="text-gray-900">{linha.situacao === 'ENCERRADO' ? '—' : proximaEtapa}</dd>
          </div>
        </dl>
      )}
    </li>
  )
}

export function PainelGestorAndamento() {
  const router = useRouter()
  const [dados, setDados] = useState<PainelGestor | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [kpi, setKpi] = useState<Kpi>('TODOS')
  const [tipo, setTipo] = useState('TODOS')
  const [termo, setTermo] = useState('')
  const [setor, setSetor] = useState('TODOS')
  const [ordem, setOrdem] = useState<Ordem>('PADRAO')
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [visiveis, setVisiveis] = useState(POR_PAGINA)

  useEffect(() => {
    let vivo = true
    const carregar = async () => {
      setCarregando(true)
      setErro(null)
      try {
        const r = await authFetch(`${API_URL}/api/processos/painel`)
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const j = (await r.json()) as PainelGestor
        if (vivo) setDados(j)
      } catch {
        if (vivo) setErro('Não foi possível carregar o painel. Tente novamente.')
      } finally {
        if (vivo) setCarregando(false)
      }
    }
    carregar()
    return () => {
      vivo = false
    }
  }, [])

  useEffect(() => setVisiveis(POR_PAGINA), [kpi, tipo, termo, setor, ordem])

  const setoresOpcoes = useMemo(() => {
    const nomes = new Set<string>()
    for (const g of dados?.gargalos ?? []) nomes.add(g.setor_nome)
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [dados])

  const linhasFiltradas = useMemo(() => {
    if (!dados) return []
    const base = dados.linhas.filter((l) => (kpi === 'CONCLUIDOS_MES' ? l.situacao === 'ENCERRADO' : l.situacao === 'ABERTO'))
    const porKpi = base.filter((l) => {
      switch (kpi) {
        case 'PARADOS':
          return l.estado === 'PARADO'
        case 'AGUARDANDO_RECEBIMENTO':
          return !!l.esta_com && !l.esta_com.recebida
        case 'PEDIDOS_DFD':
          return l.tipo === 'DEMANDA' && l.etapa_atual === 'DFD'
        default:
          return true
      }
    })
    const porTipo = tipo === 'TODOS' ? porKpi : porKpi.filter((l) => l.tipo === tipo)
    const porSetor = setor === 'TODOS' ? porTipo : porTipo.filter((l) => (l.esta_com?.setor_nome ?? '') === setor)
    const busca = termo.trim().toLowerCase()
    const porBusca = !busca
      ? porSetor
      : porSetor.filter((l) =>
          l.numero.toLowerCase().includes(busca) ||
          l.objeto.toLowerCase().includes(busca) ||
          (l.esta_com?.setor_nome ?? '').toLowerCase().includes(busca) ||
          (l.esta_com?.usuario_nome ?? '').toLowerCase().includes(busca),
        )
    const lista = [...porBusca]
    if (ordem === 'ANTIGOS') {
      lista.sort((a, b) => (a.aberto_em ?? '').localeCompare(b.aberto_em ?? ''))
    } else if (ordem === 'VALOR') {
      lista.sort((a, b) => (b.valor ?? -1) - (a.valor ?? -1))
    } else if (ordem === 'SETOR') {
      lista.sort((a, b) => (a.esta_com?.setor_nome ?? '').localeCompare(b.esta_com?.setor_nome ?? '', 'pt-BR'))
    }
    // PADRAO: mantém a ordem vinda do backend (parados primeiro, depois mais dias parados)
    return lista
  }, [dados, kpi, tipo, setor, termo, ordem])

  const prazosProximos = useMemo(() => {
    if (!dados) return []
    return dados.prazos.filter((p) => {
      if (!p.prazo) return false
      if (p.prazo.vencido) return true
      const dias = diasAteISO(p.prazo.data)
      return dias !== null && dias <= LIMITE_PRAZO_DIAS
    })
  }, [dados])

  const maiorGargalo = useMemo(() => Math.max(1, ...(dados?.gargalos ?? []).map((g) => g.processos)), [dados])

  const alternarKpi = (k: Kpi) => setKpi((atual) => (atual === k ? 'TODOS' : k))

  const abrir = (link: string) => router.push(link)
  // TODO: ainda não existe endpoint de cobrança (aviso ao setor/pessoa). Por ora, "Cobrar" só abre o processo.
  // Cobrança: avisa quem está com o processo (sino, e-mail e WhatsApp), sem mudar a posse
  const cobrar = async (l: { id: string; numero: string; esta_com: { setor_nome: string | null; usuario_nome: string | null; dias: number } | null }) => {
    const com = [l.esta_com?.setor_nome, l.esta_com?.usuario_nome].filter(Boolean).join(' · ') || 'quem está com o processo'
    const mensagem = await pedirTextoAcao({
      titulo: `Cobrar o processo ${l.numero}`,
      mensagem: `A cobrança vai para ${com} (está há ${l.esta_com?.dias ?? 0} dias). Escreva o que precisa, se quiser.`,
      rotulo: 'Mensagem (opcional)',
      placeholder: 'Ex.: Precisamos publicar até sexta. Dá para concluir o parecer hoje?',
      confirmarRotulo: 'Enviar cobrança',
    })
    if (mensagem === null) return
    try {
      const r = await authFetch(`${API_URL}/api/processos/${l.id}/cobrar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mensagem }) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`)
      toast.success(`Cobrança enviada para ${j?.nomes?.length ? j.nomes.join(', ') : com}.`)
    } catch (e) {
      toast.error(`Não foi possível cobrar: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  if (carregando) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" aria-label="Carregando" />
      </div>
    )
  }

  if (erro || !dados) {
    return (
      <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center">
        <AlertTriangle className="h-8 w-8 mx-auto text-amber-500 mb-2" aria-hidden="true" />
        <p className="text-sm text-gray-700">{erro || 'Painel indisponível.'}</p>
      </div>
    )
  }

  const totalAbertos = Object.values(dados.por_tipo).reduce((t, n) => t + n, 0)

  return (
    <div className="max-w-7xl mx-auto py-2 sm:py-4 space-y-4 min-w-0 w-full">
      <header className="min-w-0">
        <div className="text-xs font-bold uppercase tracking-wide text-gray-500">Gestão</div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Andamento dos processos</h1>
        <p className="text-sm text-gray-700 mt-1 max-w-3xl">
          Onde cada processo está, com quem e há quanto tempo. Vermelho = parado além do combinado; laranja = perto do limite.
        </p>
      </header>

      {/* KPIs — também filtram a fila */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2" role="group" aria-label="Resumo">
        {([
          { k: 'TODOS' as Kpi, v: dados.kpis.em_andamento, label: 'em andamento', cor: '' },
          { k: 'PARADOS' as Kpi, v: dados.kpis.parados, label: 'parados', cor: 'text-red-700' },
          { k: 'AGUARDANDO_RECEBIMENTO' as Kpi, v: dados.kpis.aguardando_recebimento, label: 'aguardando recebimento', cor: 'text-amber-700' },
          { k: 'PEDIDOS_DFD' as Kpi, v: dados.kpis.pedidos_aguardando_dfd, label: 'pedidos aguardando DFD', cor: '' },
          { k: 'CONCLUIDOS_MES' as Kpi, v: dados.kpis.concluidos_mes, label: 'concluídos no mês', cor: '' },
        ]).map((c) => (
          <button
            key={c.k}
            type="button"
            aria-pressed={kpi === c.k}
            onClick={() => alternarKpi(c.k)}
            className={`text-left rounded-lg border bg-white p-3 ${kpi === c.k ? 'border-[#1351b4] bg-blue-50' : 'border-gray-200'}`}
          >
            <p className={`text-xl font-bold ${c.cor || 'text-gray-900'}`}>{c.v}</p>
            <p className="text-xs text-gray-600">{c.label}</p>
          </button>
        ))}
      </div>

      {/* Abas por tipo */}
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo">
        {ABAS.map((a) => {
          const contagem = a.chave === 'TODOS' ? totalAbertos : dados.por_tipo[a.chave] ?? 0
          return (
            <button
              key={a.chave}
              type="button"
              aria-pressed={tipo === a.chave}
              onClick={() => setTipo(a.chave)}
              className={`rounded-full border px-3 py-1.5 text-sm ${tipo === a.chave ? 'border-[#1351b4] bg-blue-50 text-[#1351b4]' : 'border-gray-200 bg-white text-gray-700'}`}
            >
              {a.label} ({contagem})
            </button>
          )
        })}
      </div>

      {/* Busca, setor e ordem */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[min(240px,100%)]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
          <Input
            aria-label="Buscar"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar por número, objeto, setor ou pessoa"
            className="pl-10 bg-white"
          />
        </div>
        <Select value={setor} onValueChange={setSetor}>
          <SelectTrigger aria-label="Está com" className="w-full sm:w-56 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="TODOS">Está com: todos os setores</SelectItem>
            {setoresOpcoes.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={ordem} onValueChange={(v) => setOrdem(v as Ordem)}>
          <SelectTrigger aria-label="Ordem" className="w-full sm:w-56 bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="PADRAO">Mais tempo parado primeiro</SelectItem>
            <SelectItem value="ANTIGOS">Mais antigos</SelectItem>
            <SelectItem value="VALOR">Maior valor</SelectItem>
            <SelectItem value="SETOR">Por setor</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px] items-start">
        <div className="min-w-0">
          {linhasFiltradas.length === 0 ? (
            <p className="text-sm text-gray-600 rounded-lg border border-dashed bg-slate-50 p-6 text-center">Nenhum processo com esse filtro.</p>
          ) : (
            <>
              <ul className="space-y-2.5">
                {linhasFiltradas.slice(0, visiveis).map((l) => (
                  <LinhaProcesso
                    key={l.id}
                    linha={l}
                    aberto={abertoId === l.id}
                    onAlternar={() => setAbertoId((v) => (v === l.id ? null : l.id))}
                    onAbrir={() => abrir(l.link)}
                    onCobrar={() => cobrar(l)}
                  />
                ))}
              </ul>
              <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-gray-600 mt-3">
                <span>Mostrando {Math.min(visiveis, linhasFiltradas.length)} de {linhasFiltradas.length}</span>
                {linhasFiltradas.length > visiveis && (
                  <Button variant="outline" size="sm" onClick={() => setVisiveis((n) => n + POR_PAGINA)}>
                    Mostrar mais {Math.min(POR_PAGINA, linhasFiltradas.length - visiveis)}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>

        <aside className="space-y-4 min-w-0">
          <section className="rounded-lg border bg-white p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Gargalos</div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Onde os processos param</h2>
            {dados.gargalos.length === 0 ? (
              <p className="text-sm text-gray-600">Sem processos em tramitação.</p>
            ) : (
              <ul className="space-y-2">
                {dados.gargalos.map((g) => (
                  <li key={g.setor_id ?? g.setor_nome}>
                    <button
                      type="button"
                      onClick={() => setSetor((v) => (v === g.setor_nome ? 'TODOS' : g.setor_nome))}
                      className={`w-full text-left rounded-md p-1.5 -m-1.5 ${setor === g.setor_nome ? 'bg-blue-50' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-gray-900 truncate">{g.setor_nome}</span>
                        <span className="text-gray-600 shrink-0">{plural(g.processos, 'processo', 'processos')}</span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 overflow-hidden mt-1">
                        <div className={`h-full ${g.parados > 0 ? 'bg-red-500' : 'bg-[#1351b4]'}`} style={{ width: `${Math.round((g.processos / maiorGargalo) * 100)}%` }} />
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        tempo médio {plural(g.media_dias, 'dia', 'dias')}{g.parados > 0 ? ` · ${plural(g.parados, 'parado', 'parados')}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-gray-500 mt-3">Tempo médio desde o envio até o envio seguinte. Clique num setor para filtrar a fila.</p>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Prazos</div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">Vencendo em 7 dias</h2>
            {prazosProximos.length === 0 ? (
              <p className="text-sm text-gray-600">Nenhum prazo nos próximos 7 dias.</p>
            ) : (
              <ul className="space-y-2">
                {prazosProximos.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => router.push(p.link)} className="w-full text-left rounded-md p-1.5 -m-1.5 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-semibold text-gray-900 truncate">{p.numero} · {p.prazo?.rotulo}</span>
                        <Badge className={p.prazo?.vencido ? 'bg-red-100 text-red-800 border-red-200' : 'bg-amber-100 text-amber-900 border-amber-200'}>
                          {p.prazo?.vencido ? 'vencido' : soData(p.prazo?.data ?? null)}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">
                        {p.objeto}{p.esta_com ? ` · ${p.esta_com}` : ''}
                      </p>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
