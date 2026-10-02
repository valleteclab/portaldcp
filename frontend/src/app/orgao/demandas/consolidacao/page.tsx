'use client'

/**
 * DFD CONSOLIDADO — tela da UNIDADE DE PLANEJAMENTO, no padrão das telas do
 * órgão (trilha, cabeçalho, cartões e resumo lateral, como a Demanda).
 *
 *  - Guia de 3 passos: 1. Escolha as demandas → 2. Monte e confira o DFD →
 *    3. Abra o processo (aqui é o passo 1).
 *  - "DFDs em andamento" do ano: situação legível e a PRÓXIMA AÇÃO como botão
 *    (Abrir processo, Enviar para aprovação, Ver processo nº X…) — regra pura
 *    em lib/demandas/proxima-acao-dfd.ts.
 *  - "Demandas aprovadas prontas para o DFD": agrupadas por classe, com
 *    checkbox; o painel de seleção (lateral no desktop, barra fixa embaixo no
 *    celular) mostra a prévia resumida (itens somados + alerta de parecidos —
 *    art. 12, VII, e art. 75, §1º) e o botão Montar DFD, que leva à tela do
 *    DFD com a faixa de sucesso e o próximo passo.
 *  - "Contratações futuras (agrupamento antigo)" recolhido.
 * Regras e permissões inalteradas: /api/dfds-consolidados (+ /permissoes,
 * /demandas-disponiveis, /previa). Quem não monta só consulta.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, ArrowRight, Check, ChevronDown, ChevronRight, ClipboardList, Eye, FileText, Inbox, Loader2, Lock, Search, X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { API_URL, authFetch, formatarDataBR } from '@/lib/api'
import { toast } from 'sonner'
import { COR_STATUS_DFD, type Parecido, AlertaParecidos, GuiaDfd, formatarMoeda } from '@/components/demandas/dfd-comum'
import { ordemDaLista, proximaAcaoDfd, rotaDoDfd, type PermissoesGeraisDfd } from '@/lib/demandas/proxima-acao-dfd'
import { anoDoLink } from '@/lib/demandas/pendencia-dfd'

interface ItemDemanda {
  id: string
  categoria: 'MATERIAL' | 'SERVICO'
  codigo_classe?: string
  nome_classe?: string
  codigo_item_catalogo?: string
  descricao_objeto: string
  quantidade_estimada?: number | string
  unidade_medida?: string
  valor_total_estimado?: number | string
}

interface Demanda {
  id: string
  ano_referencia: number
  unidade_requisitante: string
  responsavel_nome?: string
  status: string
  descricao_sucinta_objeto?: string
  data_desejada_contratacao?: string
  itens: ItemDemanda[]
}

interface DfdResumo {
  id: string
  ano: number
  numero: number
  status: string
  origem: string
  objeto: string
  valor_total_estimado: number
  licitacao_id: string | null
  numero_processo: string | null
  n_itens: number
  n_demandas: number
  setores: string | null
}

interface ContratacaoFutura {
  id: string
  identificador: string
  titulo: string
  categoria: string
  valor_total_estimado: number
  demandas?: Array<{ id: string; unidade_requisitante: string }>
}

interface Permissoes extends PermissoesGeraisDfd {
  responsavel_dfd: string
  aprovador_dfd: string
}

interface Previa {
  itens: Array<{ chave: string; numero: number; descricao: string; unidade_medida: string; quantidade_somada: number; valor_total_estimado: number; origens: Array<{ setor: string; quantidade: number }> }>
  valor_total_estimado: number
  alertas: Parecido[]
  alerta: string | null
}

/** Uma demanda dentro de uma classe: o que ela pede DESTA classe. */
interface DemandaNaClasse {
  demanda: Demanda
  quantidade: number
  unidades: string[]
  valor: number
  outrasClasses: boolean
}

interface GrupoClasse {
  chave: string
  codigo: string
  nome: string
  categoria: 'MATERIAL' | 'SERVICO'
  linhas: DemandaNaClasse[]
  valor: number
  setores: number
}

const valorDaDemanda = (d: Demanda) => (d.itens || []).reduce((t, i) => t + (Number(i.valor_total_estimado) || 0), 0)
const chaveDaClasse = (i: ItemDemanda) => `${i.categoria}:${i.codigo_classe || 'SEM-CLASSE'}:${i.nome_classe || 'Sem classificação'}`.toUpperCase()
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const GRUPOS_POR_PAGINA = 20
const numeroBR = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

function DfdConsolidadoContent() {
  const router = useRouter()
  const anoAtual = new Date().getFullYear()
  const [ano, setAno] = useState(anoAtual)
  // O aviso "demanda aprovada — monte o DFD" e a pendência em Minhas tarefas trazem o exercício no link (?ano=)
  const [anoDoAviso, setAnoDoAviso] = useState<number | null>(null)
  useEffect(() => {
    const a = anoDoLink(window.location.search)
    if (!a) return
    setAnoDoAviso(a)
    setAno(a)
  }, [])
  const anosDoSeletor = useMemo(
    () => [...new Set([...Array.from({ length: 6 }, (_, i) => anoAtual - 1 + i), ...(anoDoAviso ? [anoDoAviso] : [])])].sort((a, b) => a - b),
    [anoAtual, anoDoAviso],
  )
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [dfds, setDfds] = useState<DfdResumo[]>([])
  const [antigas, setAntigas] = useState<ContratacaoFutura[]>([])
  const [permissoes, setPermissoes] = useState<Permissoes | null>(null)
  const [loading, setLoading] = useState(true)
  const [termo, setTermo] = useState('')
  const [unidade, setUnidade] = useState('TODAS')
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set())
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [montando, setMontando] = useState(false)
  const [previaAberta, setPreviaAberta] = useState(false)
  const [verCancelados, setVerCancelados] = useState(false)
  const [antigasAbertas, setAntigasAbertas] = useState(false)

  const podeMontar = !!permissoes?.pode_montar

  useEffect(() => {
    let vivo = true
    const carregar = async () => {
      setLoading(true)
      try {
        const [dRes, fRes, cRes, pRes] = await Promise.all([
          authFetch(`${API_URL}/api/dfds-consolidados/demandas-disponiveis?ano=${ano}`),
          authFetch(`${API_URL}/api/dfds-consolidados?ano=${ano}`),
          authFetch(`${API_URL}/api/demandas/contratacoes-futuras?ano=${ano}`),
          authFetch(`${API_URL}/api/dfds-consolidados/permissoes`),
        ])
        const d = dRes.ok ? await dRes.json() : []
        const f = fRes.ok ? await fRes.json() : []
        const c = cRes.ok ? await cRes.json() : []
        const p = pRes.ok ? await pRes.json() : null
        if (!vivo) return
        setDemandas(Array.isArray(d) ? d : [])
        setDfds(Array.isArray(f) ? f : [])
        setAntigas(Array.isArray(c) ? c : [])
        if (p) setPermissoes(p)
      } finally {
        if (vivo) setLoading(false)
      }
    }
    carregar()
    setSelecionadas([])
    return () => {
      vivo = false
    }
  }, [ano])

  // Prévia (itens somados + alerta de parecidos) a cada mudança na seleção
  useEffect(() => {
    if (!selecionadas.length || !podeMontar) {
      setPrevia(null)
      return
    }
    const t = setTimeout(async () => {
      setCarregandoPrevia(true)
      try {
        const r = await authFetch(`${API_URL}/api/dfds-consolidados/previa`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ demanda_ids: selecionadas }),
        })
        const j = await r.json().catch(() => null)
        if (r.ok) setPrevia(j)
        else {
          setPrevia(null)
          toast.error(j?.message || 'Não foi possível consolidar')
        }
      } finally {
        setCarregandoPrevia(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [selecionadas, podeMontar])

  const unidades = useMemo(() => Array.from(new Set(demandas.map((d) => d.unidade_requisitante).filter(Boolean))).sort(), [demandas])
  // Lista grande (centenas de demandas): mostra por páginas de classes; busca e filtro continuam valendo sobre tudo
  const [gruposVisiveis, setGruposVisiveis] = useState(GRUPOS_POR_PAGINA)
  useEffect(() => setGruposVisiveis(GRUPOS_POR_PAGINA), [termo, unidade])

  const grupos = useMemo(() => {
    const mapa = new Map<string, GrupoClasse>()
    const busca = termo.trim().toLowerCase()
    for (const demanda of demandas) {
      if (unidade !== 'TODAS' && demanda.unidade_requisitante !== unidade) continue
      if (busca) {
        const ok =
          demanda.unidade_requisitante.toLowerCase().includes(busca) ||
          demanda.responsavel_nome?.toLowerCase().includes(busca) ||
          demanda.descricao_sucinta_objeto?.toLowerCase().includes(busca) ||
          demanda.itens.some((i) => i.descricao_objeto.toLowerCase().includes(busca) || i.nome_classe?.toLowerCase().includes(busca) || i.codigo_classe?.toLowerCase().includes(busca))
        if (!ok) continue
      }
      const porClasse = new Map<string, { codigo: string; nome: string; categoria: 'MATERIAL' | 'SERVICO'; quantidade: number; unidades: Set<string>; valor: number }>()
      for (const item of demanda.itens || []) {
        const chave = chaveDaClasse(item)
        const atual = porClasse.get(chave) || {
          codigo: item.codigo_classe || 'SEM-CLASSE', nome: item.nome_classe || 'Sem classificação', categoria: item.categoria, quantidade: 0, unidades: new Set<string>(), valor: 0,
        }
        atual.quantidade += Number(item.quantidade_estimada) || 0
        if (item.unidade_medida) atual.unidades.add(item.unidade_medida)
        atual.valor += Number(item.valor_total_estimado) || 0
        porClasse.set(chave, atual)
      }
      for (const [chave, dados] of porClasse) {
        const grupo = mapa.get(chave) || { chave, codigo: dados.codigo, nome: dados.nome, categoria: dados.categoria, linhas: [], valor: 0, setores: 0 }
        grupo.linhas.push({ demanda, quantidade: dados.quantidade, unidades: [...dados.unidades], valor: dados.valor, outrasClasses: porClasse.size > 1 })
        grupo.valor += dados.valor
        mapa.set(chave, grupo)
      }
    }
    for (const g of mapa.values()) g.setores = new Set(g.linhas.map((l) => l.demanda.unidade_requisitante)).size
    return Array.from(mapa.values()).sort((a, b) => `${a.categoria}${a.codigo}`.localeCompare(`${b.categoria}${b.codigo}`, 'pt-BR'))
  }, [demandas, termo, unidade])

  const alternar = (id: string) => setSelecionadas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
  const alternarGrupo = (g: GrupoClasse) => {
    const ids = g.linhas.map((l) => l.demanda.id)
    setSelecionadas((a) => (ids.every((id) => a.includes(id)) ? a.filter((x) => !ids.includes(x)) : Array.from(new Set([...a, ...ids]))))
  }
  const alternarRecolhido = (chave: string) =>
    setRecolhidos((s) => {
      const n = new Set(s)
      if (n.has(chave)) n.delete(chave)
      else n.add(chave)
      return n
    })

  const demandasSelecionadas = demandas.filter((d) => selecionadas.includes(d.id))
  const valorSelecionado = demandasSelecionadas.reduce((t, d) => t + valorDaDemanda(d), 0)
  const setoresSelecionados = Array.from(new Set(demandasSelecionadas.map((d) => d.unidade_requisitante)))

  const montarDfd = async () => {
    if (!selecionadas.length) return
    setMontando(true)
    try {
      const r = await authFetch(`${API_URL}/api/dfds-consolidados`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demanda_ids: selecionadas }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`)
      // A tela do DFD mostra a faixa de sucesso e o próximo passo em destaque
      router.push(rotaDoDfd(j.id, { montado: true }))
    } catch (e: unknown) {
      toast.error(`DFD não montado: ${e instanceof Error ? e.message : String(e)}`)
      setMontando(false)
    }
  }

  const livres = new Set(demandas.map((d) => d.id))
  const dfdsOrdenados = [...dfds].sort((a, b) => ordemDaLista(a.status) - ordemDaLista(b.status) || b.numero - a.numero)
  const dfdsAtivos = dfdsOrdenados.filter((f) => f.status !== 'CANCELADO')
  const dfdsCancelados = dfdsOrdenados.filter((f) => f.status === 'CANCELADO')
  const filtroAtivo = !!termo.trim() || unidade !== 'TODAS'

  const painel = (
    <PainelSelecao
      selecionadas={selecionadas.length}
      setores={setoresSelecionados}
      valor={valorSelecionado}
      previa={previa}
      carregando={carregandoPrevia}
      montando={montando}
      onMontar={montarDfd}
      onLimpar={() => setSelecionadas([])}
      onVerPrevia={() => setPreviaAberta(true)}
    />
  )

  return (
    <div className="max-w-7xl mx-auto py-2 sm:py-4 space-y-4 min-w-0 w-full">
      {/* Trilha */}
      <nav aria-label="Trilha" className="flex items-center gap-1 text-sm text-gray-600 min-w-0">
        <Link href="/orgao/demandas" className="text-blue-800 hover:underline shrink-0">Demandas</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-gray-800">DFD consolidado</span>
      </nav>

      {/* Cabeçalho */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-[1_1_320px]">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="h-6 w-6 shrink-0" aria-hidden="true" />
            DFD consolidado
          </h1>
          <p className="text-sm text-gray-700 mt-1 max-w-3xl">
            Junte as demandas parecidas dos setores num único Documento de Formalização da Demanda e abra <b>um</b> processo
            (Lei 14.133, art. 12, VII — evita o fracionamento do art. 75, §1º).
          </p>
          {permissoes && (
            <p className="text-xs text-gray-600 mt-1">
              Quem monta: {permissoes.responsavel_dfd}.{' '}
              {permissoes.exige_aprovacao_dfd ? `2ª aprovação do DFD ligada (${permissoes.aprovador_dfd}).` : '2ª aprovação do DFD desligada.'}{' '}
              <Link href="/orgao/configuracoes/fluxo" className="text-blue-800 underline">Configurações › Fluxo</Link>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="dfd-ano" className="text-sm text-gray-700">Exercício</label>
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger id="dfd-ano" className="w-28 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {anosDoSeletor.map((a) => (
                <SelectItem key={a} value={String(a)}>{a}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      <GuiaDfd atual={podeMontar ? 1 : null} />

      {permissoes && !podeMontar && (
        <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
          <Lock className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          Você pode consultar os DFDs, mas só a unidade de planejamento monta o DFD e abre o processo ({permissoes.responsavel_dfd}).
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-500" aria-label="Carregando" /></div>
      ) : (
        <div className={`grid gap-4 ${podeMontar ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          <div className="space-y-4 min-w-0">
            {/* DFDs em andamento */}
            <Card className="gap-4 min-w-0" aria-labelledby="dfds-titulo">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle id="dfds-titulo" className="text-base">DFDs em andamento — {ano}</CardTitle>
                <CardDescription className="text-gray-600">
                  Cada DFD mostra em que pé está e o próximo passo. Um DFD vira um processo.
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 space-y-2 min-w-0">
                {dfdsAtivos.length === 0 ? (
                  <p className="text-sm text-gray-600 rounded-lg border border-dashed bg-slate-50 p-4">
                    Nenhum DFD em andamento em {ano}.
                    {podeMontar && ' Escolha as demandas abaixo e clique em Montar DFD.'}
                  </p>
                ) : (
                  dfdsAtivos.map((f) => <LinhaDfd key={f.id} dfd={f} permissoes={permissoes} />)
                )}
                {dfdsCancelados.length > 0 && (
                  <div className="pt-1">
                    <Button variant="ghost" size="sm" className="text-gray-700" aria-expanded={verCancelados} onClick={() => setVerCancelados((v) => !v)}>
                      {verCancelados ? <ChevronDown className="h-4 w-4 mr-1" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 mr-1" aria-hidden="true" />}
                      {verCancelados ? 'Esconder' : 'Mostrar'} {plural(dfdsCancelados.length, 'DFD cancelado', 'DFDs cancelados')}
                    </Button>
                    {verCancelados && <div className="space-y-2 mt-2">{dfdsCancelados.map((f) => <LinhaDfd key={f.id} dfd={f} permissoes={permissoes} />)}</div>}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Demandas aprovadas prontas para o DFD */}
            <Card className="gap-4 min-w-0" aria-labelledby="demandas-titulo">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle id="demandas-titulo" className="text-base flex items-center gap-2 flex-wrap">
                  Demandas aprovadas prontas para o DFD
                  <Badge variant="outline">{demandas.length}</Badge>
                </CardTitle>
                <CardDescription className="text-gray-600">
                  {podeMontar
                    ? 'Agrupadas pela classe do catálogo. Marque as parecidas (de um ou mais setores) — a prévia aparece no painel de seleção.'
                    : 'Agrupadas pela classe do catálogo. A unidade de planejamento junta as parecidas num DFD.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 space-y-3 min-w-0">
                {demandas.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    <div className="relative flex-1 min-w-[min(240px,100%)]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
                      <Input
                        aria-label="Pesquisar demandas"
                        value={termo}
                        onChange={(e) => setTermo(e.target.value)}
                        placeholder="Pesquisar por classe, objeto, setor ou responsável…"
                        className="pl-10 bg-white"
                      />
                    </div>
                    <Select value={unidade} onValueChange={setUnidade}>
                      <SelectTrigger aria-label="Setor" className="w-full sm:w-56 bg-white"><SelectValue placeholder="Setor" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TODAS">Todos os setores</SelectItem>
                        {unidades.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {demandas.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center">
                    <Inbox className="h-10 w-10 mx-auto text-gray-400 mb-2" aria-hidden="true" />
                    <h3 className="font-semibold text-gray-800">Nenhuma demanda aprovada em {ano}</h3>
                    <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
                      As demandas aparecem aqui depois de aprovadas na Central de Aprovações. As que já estão num DFD ou num processo não aparecem.
                    </p>
                    <div className="flex justify-center gap-2 mt-3 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => router.push('/orgao/aprovacoes?tab=demandas')}>Central de Aprovações</Button>
                      <Button variant="outline" size="sm" onClick={() => router.push('/orgao/demandas')}>Ver todas as demandas</Button>
                    </div>
                  </div>
                ) : grupos.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center">
                    <FileText className="h-10 w-10 mx-auto text-gray-400 mb-2" aria-hidden="true" />
                    <p className="text-sm text-gray-700">Nenhuma demanda encontrada com esse filtro.</p>
                    {filtroAtivo && (
                      <Button variant="outline" size="sm" className="mt-3" onClick={() => { setTermo(''); setUnidade('TODAS') }}>Limpar filtro</Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {grupos.slice(0, gruposVisiveis).map((g) => (
                      <GrupoDemandas
                        key={g.chave}
                        grupo={g}
                        aberto={!recolhidos.has(g.chave)}
                        onAlternarAberto={() => alternarRecolhido(g.chave)}
                        podeMontar={podeMontar}
                        selecionadas={selecionadas}
                        onAlternar={alternar}
                        onAlternarGrupo={() => alternarGrupo(g)}
                      />
                    ))}
                    {grupos.length > gruposVisiveis && (
                      <div className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-white p-3 text-sm">
                        <span className="text-gray-700">Mostrando {gruposVisiveis} de {grupos.length} classes. Use a busca ou o filtro por unidade para achar mais rápido.</span>
                        <Button variant="outline" size="sm" onClick={() => setGruposVisiveis((n) => n + GRUPOS_POR_PAGINA)}>Mostrar mais {Math.min(GRUPOS_POR_PAGINA, grupos.length - gruposVisiveis)}</Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contratações futuras (agrupamento antigo) — recolhido */}
            {antigas.length > 0 && (
              <Card className="gap-3 min-w-0">
                <CardHeader className="px-4 sm:px-6">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left text-base font-semibold text-gray-900"
                    aria-expanded={antigasAbertas}
                    onClick={() => setAntigasAbertas((v) => !v)}
                  >
                    {antigasAbertas ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
                    Contratações futuras (agrupamento antigo)
                    <Badge variant="outline">{antigas.length}</Badge>
                  </button>
                </CardHeader>
                {antigasAbertas && (
                  <CardContent className="px-4 sm:px-6 space-y-2">
                    <p className="text-xs text-gray-600 flex gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      Agrupamentos feitos antes do DFD consolidado — ficam só para consulta. Para abrir processo, monte o DFD com as demandas.
                    </p>
                    {antigas.map((c) => {
                      const ids = (c.demandas || []).map((d) => d.id).filter((id) => livres.has(id))
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-white p-3">
                          <div className="min-w-0 flex-[1_1_220px]">
                            <div className="font-semibold break-words">{c.identificador} — {c.titulo}</div>
                            <div className="text-sm text-gray-600">{plural((c.demandas || []).length, 'demanda', 'demandas')} · {c.categoria}</div>
                          </div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-gray-900">{formatarMoeda(Number(c.valor_total_estimado) || 0)}</span>
                            {podeMontar && ids.length > 0 && (
                              <Button size="sm" variant="outline" onClick={() => setSelecionadas(ids)}>Selecionar para o DFD</Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </CardContent>
                )}
              </Card>
            )}

            {/* Celular/tablet: seleção fixa embaixo enquanto a lista está na tela */}
            {podeMontar && selecionadas.length > 0 && (
              <div className="xl:hidden sticky bottom-2 z-20 border border-blue-300 rounded-lg bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.08)] p-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-gray-900">{plural(selecionadas.length, 'demanda selecionada', 'demandas selecionadas')}</p>
                  <p className="text-gray-700 truncate">
                    {previa ? `${plural(previa.itens.length, 'item somado', 'itens somados')} · ${formatarMoeda(previa.valor_total_estimado)}` : formatarMoeda(valorSelecionado)}
                    {previa?.alertas?.length ? ' · atenção: parecidos' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPreviaAberta(true)} disabled={!previa}>
                    <Eye className="h-4 w-4 mr-1" aria-hidden="true" /> Prévia
                  </Button>
                  <Button size="sm" onClick={montarDfd} disabled={montando || carregandoPrevia || !previa}>
                    {montando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4 mr-1" aria-hidden="true" />}
                    Montar DFD
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Desktop: painel de seleção lateral fixo */}
          {podeMontar && (
            <aside aria-label="Seleção para o DFD" className="hidden xl:block min-w-0">
              <div className="xl:sticky xl:top-4">{painel}</div>
            </aside>
          )}
        </div>
      )}

      {/* Prévia completa (itens somados e de onde veio cada quantidade) */}
      <Dialog open={previaAberta} onOpenChange={setPreviaAberta}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Prévia do DFD</DialogTitle>
            <DialogDescription>
              {plural(selecionadas.length, 'demanda', 'demandas')} de {setoresSelecionados.join(', ') || '—'}. Os itens iguais são somados; depois de
              montar, você ainda pode ajustar quantidades e valores.
            </DialogDescription>
          </DialogHeader>
          {previa ? (
            <div className="space-y-3 min-w-0">
              <AlertaParecidos alertas={previa.alertas} />
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-slate-50">
                    <tr className="text-left text-xs text-gray-600 border-b">
                      <th scope="col" className="py-2 px-2">Nº</th>
                      <th scope="col" className="py-2 px-2">Item</th>
                      <th scope="col" className="py-2 px-2 text-right">Qtd. somada</th>
                      <th scope="col" className="py-2 px-2">De onde veio</th>
                      <th scope="col" className="py-2 px-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previa.itens.map((i) => (
                      <tr key={i.chave} className="border-b last:border-0 align-top">
                        <td className="py-2 px-2">{i.numero}</td>
                        <td className="py-2 px-2">{i.descricao}</td>
                        <td className="py-2 px-2 text-right whitespace-nowrap">{numeroBR(i.quantidade_somada)} {i.unidade_medida}</td>
                        <td className="py-2 px-2 text-xs text-gray-700">{i.origens.map((o) => `${o.setor}: ${numeroBR(o.quantidade)}`).join('; ')}</td>
                        <td className="py-2 px-2 text-right whitespace-nowrap">{formatarMoeda(i.valor_total_estimado)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-sm font-semibold text-right">Total estimado: {formatarMoeda(previa.valor_total_estimado)}</p>
              <div className="flex justify-end gap-2 flex-wrap">
                <Button variant="outline" onClick={() => setPreviaAberta(false)}>Voltar à seleção</Button>
                <Button onClick={montarDfd} disabled={montando || carregandoPrevia}>
                  {montando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4 mr-2" aria-hidden="true" />}
                  Montar DFD
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-600 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Somando os itens…</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Um DFD da lista: situação legível, resumo e a próxima ação como botão. */
function LinhaDfd({ dfd, permissoes }: { dfd: DfdResumo; permissoes: Permissoes | null }) {
  const router = useRouter()
  const acao = proximaAcaoDfd(dfd, permissoes)
  return (
    <div className="rounded-lg border bg-white p-3 flex items-start justify-between gap-3 flex-wrap min-w-0">
      <div className="min-w-0 flex-[1_1_260px]">
        <div className="font-semibold flex items-center gap-2 flex-wrap">
          <Link href={rotaDoDfd(dfd.id)} className="text-blue-800 hover:underline">DFD nº {dfd.numero}/{dfd.ano}</Link>
          <Badge className={`${COR_STATUS_DFD[dfd.status] ?? ''} hover:opacity-100`}>{acao.situacao}</Badge>
        </div>
        <p className="text-sm text-gray-800 break-words line-clamp-2">{dfd.objeto}</p>
        <p className="text-xs text-gray-600 break-words">
          {plural(dfd.n_demandas, 'demanda', 'demandas')}{dfd.setores ? ` (${dfd.setores})` : ''} · {plural(dfd.n_itens, 'item', 'itens')} · {formatarMoeda(dfd.valor_total_estimado)}
        </p>
        {acao.dica && <p className="text-xs text-gray-800 mt-1 flex items-center gap-1"><ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />{acao.dica}</p>}
      </div>
      <div className="flex gap-2 flex-wrap">
        {acao.secundaria && (
          <Button variant="outline" size="sm" onClick={() => router.push(acao.secundaria!.href)}>{acao.secundaria.rotulo}</Button>
        )}
        {acao.principal && (
          <Button size="sm" className={acao.principal.rotulo === 'Abrir processo' ? 'bg-green-700 hover:bg-green-800' : ''} onClick={() => router.push(acao.principal!.href)}>
            {acao.principal.rotulo}
          </Button>
        )}
      </div>
    </div>
  )
}

/** Checkbox nativo com o estado "parcial" (algumas demandas da classe marcadas). */
function CaixaSelecao({ marcado, parcial, rotulo, onChange }: { marcado: boolean; parcial?: boolean; rotulo: string; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!parcial && !marcado
  }, [parcial, marcado])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={rotulo}
      checked={marcado}
      onChange={onChange}
      onClick={(e) => e.stopPropagation()}
      className="h-5 w-5 shrink-0 cursor-pointer accent-blue-700"
    />
  )
}

function GrupoDemandas({
  grupo: g, aberto, onAlternarAberto, podeMontar, selecionadas, onAlternar, onAlternarGrupo,
}: {
  grupo: GrupoClasse
  aberto: boolean
  onAlternarAberto: () => void
  podeMontar: boolean
  selecionadas: string[]
  onAlternar: (id: string) => void
  onAlternarGrupo: () => void
}) {
  const marcadas = g.linhas.filter((l) => selecionadas.includes(l.demanda.id)).length
  const todas = marcadas === g.linhas.length
  const nomeClasse = `${g.codigo === 'SEM-CLASSE' ? '' : `${g.codigo} — `}${g.nome}`
  return (
    <section className="rounded-lg border bg-white min-w-0 overflow-hidden" aria-label={`Classe ${nomeClasse}`}>
      <div className={`p-3 flex items-center gap-3 flex-wrap ${marcadas ? 'bg-blue-50/60' : 'bg-slate-50'}`}>
        {podeMontar && <CaixaSelecao marcado={todas} parcial={marcadas > 0} rotulo={`Selecionar todas as demandas da classe ${nomeClasse}`} onChange={onAlternarGrupo} />}
        <button type="button" onClick={onAlternarAberto} aria-expanded={aberto} className="flex items-center gap-2 min-w-0 flex-[1_1_220px] text-left">
          {aberto ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden="true" />}
          <span className="min-w-0">
            <span className="block text-xs text-gray-600">{g.categoria === 'MATERIAL' ? 'Material' : 'Serviço'} · classe</span>
            <span className="block font-semibold text-gray-900 break-words">{nomeClasse}</span>
          </span>
        </button>
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <span className="text-gray-700">{plural(g.linhas.length, 'demanda', 'demandas')}{g.setores > 1 ? ` · ${g.setores} setores` : ''}</span>
          <span className="font-semibold text-gray-900">{formatarMoeda(g.valor)}</span>
        </div>
      </div>
      {g.setores > 1 && (
        <p className="px-3 py-1.5 text-xs text-amber-900 bg-amber-50 border-t border-amber-100 flex gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
          {g.setores} setores pedem esta classe: avalie juntá-las num único DFD (art. 12, VII — evita o fracionamento).
        </p>
      )}
      {aberto && (
        <ul className="divide-y">
          {g.linhas.map((l) => {
            const d = l.demanda
            const marcada = selecionadas.includes(d.id)
            const qtd = l.unidades.length === 1 ? `${numeroBR(l.quantidade)} ${l.unidades[0]}` : l.quantidade ? numeroBR(l.quantidade) : '—'
            const quando = d.data_desejada_contratacao ? formatarDataBR(String(d.data_desejada_contratacao)) : '—'
            return (
              <li key={d.id} className={`p-3 grid gap-x-3 gap-y-1 items-start ${podeMontar ? 'grid-cols-[20px_minmax(0,1fr)]' : 'grid-cols-1'} ${marcada ? 'bg-blue-50/40' : ''}`}>
                {podeMontar && (
                  <div className="pt-0.5">
                    <CaixaSelecao marcado={marcada} rotulo={`Selecionar a demanda de ${d.unidade_requisitante}`} onChange={() => onAlternar(d.id)} />
                  </div>
                )}
                <div className="min-w-0 grid gap-x-4 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="font-semibold text-gray-900">{d.unidade_requisitante}</span>
                      {d.responsavel_nome && <span className="text-gray-600"> · {d.responsavel_nome}</span>}
                    </p>
                    <p className="text-sm text-gray-800 break-words line-clamp-2">{d.descricao_sucinta_objeto || 'Sem descrição'}</p>
                    <Link href={`/orgao/demandas/${d.id}`} className="text-xs text-blue-800 hover:underline">Abrir a demanda</Link>
                    {l.outrasClasses && (
                      <span className="text-xs text-gray-600"> · também tem itens de outras classes (demanda inteira: {formatarMoeda(valorDaDemanda(d))})</span>
                    )}
                  </div>
                  <dl className="grid grid-cols-2 sm:grid-cols-[auto_auto_auto] gap-x-4 gap-y-1 text-xs sm:text-right">
                    <div><dt className="text-gray-600">Quantidade</dt><dd className="font-medium text-gray-900 sm:whitespace-nowrap break-words">{qtd}</dd></div>
                    <div><dt className="text-gray-600">Valor</dt><dd className="font-medium text-gray-900 sm:whitespace-nowrap break-words">{formatarMoeda(l.valor)}</dd></div>
                    <div><dt className="text-gray-600">Para quando</dt><dd className="font-medium text-gray-900 sm:whitespace-nowrap break-words">{quando}</dd></div>
                  </dl>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** Painel de seleção (lateral no desktop): prévia resumida e o botão Montar DFD. */
function PainelSelecao({
  selecionadas, setores, valor, previa, carregando, montando, onMontar, onLimpar, onVerPrevia,
}: {
  selecionadas: number
  setores: string[]
  valor: number
  previa: Previa | null
  carregando: boolean
  montando: boolean
  onMontar: () => void
  onLimpar: () => void
  onVerPrevia: () => void
}) {
  if (!selecionadas) {
    return (
      <section className="rounded-lg border bg-white p-4 space-y-2 text-sm" aria-labelledby="painel-titulo">
        <h2 id="painel-titulo" className="text-sm font-semibold text-gray-900">Seleção para o DFD</h2>
        <p className="text-gray-700">Nenhuma demanda marcada.</p>
        <p className="text-gray-600 text-xs">
          Marque na lista as demandas parecidas (ou a caixa da classe para marcar todas). A prévia com os itens somados aparece aqui.
        </p>
      </section>
    )
  }
  const itensVisiveis = previa?.itens.slice(0, 5) ?? []
  const resto = (previa?.itens.length ?? 0) - itensVisiveis.length
  return (
    <section className="rounded-lg border border-blue-300 bg-white p-4 space-y-3 text-sm shadow-sm" aria-labelledby="painel-titulo">
      <div className="flex items-start justify-between gap-2">
        <h2 id="painel-titulo" className="text-sm font-semibold text-gray-900">Seleção para o DFD</h2>
        <button type="button" onClick={onLimpar} className="text-xs text-gray-700 hover:underline inline-flex items-center gap-1">
          <X className="h-3 w-3" aria-hidden="true" /> Limpar
        </button>
      </div>
      <div>
        <p className="font-semibold text-gray-900">{plural(selecionadas, 'demanda', 'demandas')}</p>
        <p className="text-xs text-gray-700 break-words">{setores.join(', ')}</p>
      </div>
      <div className="rounded-md bg-slate-50 p-3 space-y-1.5">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Prévia</p>
        {carregando && !previa ? (
          <p className="text-gray-600 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Somando os itens…</p>
        ) : previa ? (
          <>
            <p className="text-xl font-semibold text-gray-900">{formatarMoeda(previa.valor_total_estimado)}</p>
            <p className="text-xs text-gray-700">{plural(previa.itens.length, 'item somado', 'itens somados')}</p>
            <ul className="text-xs text-gray-800 space-y-0.5">
              {itensVisiveis.map((i) => (
                <li key={i.chave} className="flex justify-between gap-2">
                  <span className="truncate" title={i.descricao}>{i.descricao}</span>
                  <span className="shrink-0 text-gray-600">{numeroBR(i.quantidade_somada)} {i.unidade_medida}</span>
                </li>
              ))}
              {resto > 0 && <li className="text-gray-600">e mais {plural(resto, 'item', 'itens')}</li>}
            </ul>
            <button type="button" onClick={onVerPrevia} className="text-xs text-blue-800 underline inline-flex items-center gap-1">
              <Eye className="h-3 w-3" aria-hidden="true" /> Ver prévia completa (de onde veio cada quantidade)
            </button>
          </>
        ) : (
          <p className="text-gray-700">{formatarMoeda(valor)} (estimado das demandas)</p>
        )}
      </div>
      {previa?.alertas?.length ? <AlertaParecidos alertas={previa.alertas} compacto /> : null}
      <Button className="w-full" size="lg" onClick={onMontar} disabled={montando || carregando || !previa}>
        {montando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4 mr-2" aria-hidden="true" />}
        Montar DFD
      </Button>
      <p className="text-xs text-gray-600">Depois de montar, você confere os itens na tela do DFD e abre o processo.</p>
    </section>
  )
}

export default function DfdConsolidadoPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.DEMANDAS}>
      <DfdConsolidadoContent />
    </ModuleGuard>
  )
}
