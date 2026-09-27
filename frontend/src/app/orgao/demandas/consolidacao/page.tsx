'use client'

/**
 * DFD CONSOLIDADO — tela da UNIDADE DE PLANEJAMENTO.
 * As demandas (pedidos dos setores) aprovadas e livres aparecem agrupadas por
 * classe; o planejamento escolhe as parecidas, vê a prévia (itens somados e o
 * alerta de pedidos parecidos no exercício — art. 12, VII, e art. 75, §1º) e
 * monta o DFD, que abre UM processo. As "contratações futuras" antigas ficam
 * legíveis no fim da página.
 * Fonte: /api/dfds-consolidados (+ /demandas-disponiveis, /previa, /permissoes).
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowLeft, Check, ChevronDown, ChevronRight, ClipboardList, FileText, Loader2, Lock, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { API_URL, authFetch, formatarDataBR } from '@/lib/api'
import { toast } from 'sonner'
import { ROTULO_STATUS_DFD, COR_STATUS_DFD, type Parecido, AlertaParecidos, formatarMoeda } from '@/components/demandas/dfd-comum'

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

interface Permissoes {
  pode_montar: boolean
  exige_aprovacao_dfd: boolean
  responsavel_dfd: string
  aprovador_dfd: string
}

interface Previa {
  itens: Array<{ chave: string; numero: number; descricao: string; unidade_medida: string; quantidade_somada: number; valor_total_estimado: number; origens: Array<{ setor: string; quantidade: number }> }>
  valor_total_estimado: number
  alertas: Parecido[]
  alerta: string | null
}

interface GrupoClasse {
  chave: string
  codigo: string
  nome: string
  categoria: 'MATERIAL' | 'SERVICO'
  demandas: Demanda[]
  valor: number
}

const valorDaDemanda = (d: Demanda) => (d.itens || []).reduce((t, i) => t + (Number(i.valor_total_estimado) || 0), 0)

function DfdConsolidadoContent() {
  const router = useRouter()
  const [ano, setAno] = useState(new Date().getFullYear())
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [dfds, setDfds] = useState<DfdResumo[]>([])
  const [antigas, setAntigas] = useState<ContratacaoFutura[]>([])
  const [permissoes, setPermissoes] = useState<Permissoes | null>(null)
  const [loading, setLoading] = useState(true)
  const [termo, setTermo] = useState('')
  const [unidade, setUnidade] = useState('TODAS')
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null)
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [montando, setMontando] = useState(false)

  const carregar = async () => {
    setLoading(true)
    try {
      const [dRes, fRes, cRes, pRes] = await Promise.all([
        authFetch(`${API_URL}/api/dfds-consolidados/demandas-disponiveis?ano=${ano}`),
        authFetch(`${API_URL}/api/dfds-consolidados?ano=${ano}`),
        authFetch(`${API_URL}/api/demandas/contratacoes-futuras?ano=${ano}`),
        authFetch(`${API_URL}/api/dfds-consolidados/permissoes`),
      ])
      setDemandas(dRes.ok ? await dRes.json() : [])
      setDfds(fRes.ok ? await fRes.json() : [])
      const c = cRes.ok ? await cRes.json() : []
      setAntigas(Array.isArray(c) ? c : [])
      if (pRes.ok) setPermissoes(await pRes.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    setSelecionadas([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ano])

  // Prévia (itens somados + alerta de parecidos) a cada mudança na seleção
  useEffect(() => {
    if (!selecionadas.length || !permissoes?.pode_montar) {
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
  }, [selecionadas, permissoes?.pode_montar])

  const unidades = useMemo(() => Array.from(new Set(demandas.map((d) => d.unidade_requisitante).filter(Boolean))).sort(), [demandas])

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
      const chaves = new Map<string, { codigo: string; nome: string; categoria: 'MATERIAL' | 'SERVICO'; valor: number }>()
      for (const item of demanda.itens || []) {
        const codigo = item.codigo_classe || 'SEM-CLASSE'
        const nome = item.nome_classe || 'Sem classificação'
        const chave = `${item.categoria}:${codigo}:${nome}`.toUpperCase()
        const atual = chaves.get(chave) || { codigo, nome, categoria: item.categoria, valor: 0 }
        atual.valor += Number(item.valor_total_estimado) || 0
        chaves.set(chave, atual)
      }
      for (const [chave, dados] of chaves) {
        const grupo = mapa.get(chave) || { chave, codigo: dados.codigo, nome: dados.nome, categoria: dados.categoria, demandas: [], valor: 0 }
        grupo.demandas.push(demanda)
        grupo.valor += dados.valor
        mapa.set(chave, grupo)
      }
    }
    return Array.from(mapa.values()).sort((a, b) => `${a.categoria}${a.codigo}`.localeCompare(`${b.categoria}${b.codigo}`, 'pt-BR'))
  }, [demandas, termo, unidade])

  const alternar = (id: string) => setSelecionadas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))
  const selecionarGrupo = (g: GrupoClasse) => setSelecionadas((a) => Array.from(new Set([...a, ...g.demandas.map((d) => d.id)])))
  const valorSelecionado = demandas.filter((d) => selecionadas.includes(d.id)).reduce((t, d) => t + valorDaDemanda(d), 0)

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
      toast.success(`${j.rotulo} montado — revise os campos e os itens.`)
      router.push(`/orgao/demandas/dfd/${j.id}`)
    } catch (e: any) {
      toast.error(`DFD não montado: ${e.message}`)
    } finally {
      setMontando(false)
    }
  }

  const livres = new Set(demandas.map((d) => d.id))

  return (
    // w-full/min-w-0: a página não rola para o lado (1366px e celular) — tabela rola por dentro
    <div className="p-3 sm:p-6 space-y-6 bg-gray-50 min-h-screen w-full min-w-0 max-w-full overflow-x-hidden">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-[1_1_280px]">
          <Button variant="ghost" className="mb-2" onClick={() => router.push('/orgao/demandas')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Demandas
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            DFD consolidado
          </h1>
          <p className="text-gray-600 max-w-3xl">
            A unidade de planejamento junta as demandas parecidas dos setores num único Documento de Formalização da Demanda
            (Lei 14.133, art. 12, VII — evita o fracionamento, art. 75, §1º) e abre um processo.
          </p>
          {permissoes && (
            <p className="text-xs text-gray-500 mt-1">
              Quem monta: {permissoes.responsavel_dfd}.{' '}
              {permissoes.exige_aprovacao_dfd ? `2ª aprovação do DFD ligada (${permissoes.aprovador_dfd}).` : '2ª aprovação do DFD desligada.'}{' '}
              <Link href="/orgao/configuracoes/fluxo" className="text-blue-700 underline">Configurações › Fluxo</Link>
            </p>
          )}
        </div>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-32 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i).map((a) => (
              <SelectItem key={a} value={String(a)}>{a}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {permissoes && !permissoes.pode_montar && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
          <Lock className="h-4 w-4 shrink-0 mt-0.5" />
          Você pode consultar os DFDs, mas só a unidade de planejamento monta o DFD e abre o processo ({permissoes.responsavel_dfd}).
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 [&>*]:min-w-0">
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{demandas.length}</div><p className="text-sm text-gray-500">Demandas aprovadas livres</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{grupos.length}</div><p className="text-sm text-gray-500">Classes/grupos</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold">{dfds.filter((f) => f.status !== 'CANCELADO').length}</div><p className="text-sm text-gray-500">DFDs em {ano}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-2xl font-bold text-blue-700">{formatarMoeda(valorSelecionado)}</div><p className="text-sm text-gray-500">{selecionadas.length} demanda(s) selecionada(s)</p></CardContent></Card>
      </div>

      {/* Seleção + prévia */}
      {permissoes?.pode_montar && selecionadas.length > 0 && (
        <Card className="border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
              <span>Prévia do DFD ({selecionadas.length} demanda(s))</span>
              <span className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelecionadas([])}>Limpar</Button>
                <Button size="sm" onClick={montarDfd} disabled={montando || carregandoPrevia || !previa}>
                  {montando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                  Montar DFD
                </Button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 min-w-0">
            {carregandoPrevia && <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Somando os itens…</p>}
            {previa && (
              <>
                <AlertaParecidos alertas={previa.alertas} />
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-gray-500 border-b">
                        <th className="py-1 pr-2">Nº</th>
                        <th className="py-1 pr-2">Item</th>
                        <th className="py-1 pr-2 text-right">Qtd. somada</th>
                        <th className="py-1 pr-2">De onde veio</th>
                        <th className="py-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previa.itens.map((i) => (
                        <tr key={i.chave} className="border-b last:border-0">
                          <td className="py-1 pr-2">{i.numero}</td>
                          <td className="py-1 pr-2">{i.descricao}</td>
                          <td className="py-1 pr-2 text-right">{Number(i.quantidade_somada).toLocaleString('pt-BR')} {i.unidade_medida}</td>
                          <td className="py-1 pr-2 text-xs text-gray-600">{i.origens.map((o) => `${o.setor}: ${Number(o.quantidade).toLocaleString('pt-BR')}`).join('; ')}</td>
                          <td className="py-1 text-right">{formatarMoeda(i.valor_total_estimado)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-sm font-semibold text-right">Total estimado: {formatarMoeda(previa.valor_total_estimado)}</p>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[min(260px,100%)]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input value={termo} onChange={(e) => setTermo(e.target.value)} placeholder="Pesquisar por classe, objeto, setor ou responsável..." className="pl-10 bg-white" />
            </div>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger className="w-full sm:w-64 bg-white"><SelectValue placeholder="Setor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todos os setores</SelectItem>
                {unidades.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
      ) : grupos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <h2 className="font-semibold text-gray-700">Nenhuma demanda aprovada livre em {ano}</h2>
            <p className="text-sm text-gray-500 mt-1">As demandas aparecem aqui depois de aprovadas na Central de Aprovações.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => {
            const aberto = grupoAberto === g.chave
            const selGrupo = g.demandas.filter((d) => selecionadas.includes(d.id)).length
            return (
              <Card key={g.chave} className="overflow-hidden">
                <div className="w-full p-3 sm:p-4 flex items-center justify-between gap-3 sm:gap-4 flex-wrap hover:bg-gray-50 cursor-pointer" onClick={() => setGrupoAberto(aberto ? null : g.chave)}>
                  <div className="flex items-center gap-3 min-w-0 flex-[1_1_240px]">
                    {aberto ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <Badge variant="outline">{g.categoria === 'MATERIAL' ? 'M' : 'S'}</Badge>
                    <div className="min-w-0">
                      <div className="text-xs text-gray-500">Classe/grupo</div>
                      <div className="font-semibold break-words">{g.codigo} — {g.nome}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:gap-6 text-right flex-wrap">
                    <div><div className="font-semibold">{g.demandas.length}</div><div className="text-xs text-gray-500">demanda(s)</div></div>
                    <div><div className="font-semibold">{formatarMoeda(g.valor)}</div><div className="text-xs text-gray-500">estimado</div></div>
                    {permissoes?.pode_montar && (
                      <Button size="sm" variant={selGrupo === g.demandas.length ? 'default' : 'outline'} onClick={(e) => { e.stopPropagation(); selecionarGrupo(g) }}>
                        Juntar a classe
                      </Button>
                    )}
                  </div>
                </div>
                {aberto && (
                  <div className="border-t bg-white p-3 sm:p-4 divide-y">
                    {g.demandas.map((d) => (
                      <div key={d.id} className="grid grid-cols-[32px_minmax(0,1fr)_auto] sm:grid-cols-[32px_minmax(0,1fr)_140px_100px_110px] gap-3 py-2 items-center">
                        {permissoes?.pode_montar ? (
                          <button
                            type="button"
                            aria-label={selecionadas.includes(d.id) ? 'Tirar da seleção' : 'Selecionar'}
                            onClick={() => alternar(d.id)}
                            className={`h-5 w-5 rounded border flex items-center justify-center ${selecionadas.includes(d.id) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-300'}`}
                          >
                            {selecionadas.includes(d.id) && <Check className="h-3.5 w-3.5" />}
                          </button>
                        ) : <span />}
                        <div className="min-w-0">
                          <Link href={`/orgao/demandas/${d.id}`} className="font-medium text-blue-700 hover:underline break-words">Demanda — {d.unidade_requisitante}</Link>
                          <p className="text-sm text-gray-700 line-clamp-2 break-words">{d.descricao_sucinta_objeto || 'Sem descrição'}</p>
                          <p className="text-xs text-gray-600 sm:hidden">Para quando: {d.data_desejada_contratacao ? formatarDataBR(String(d.data_desejada_contratacao)) : '—'}</p>
                        </div>
                        <span className="hidden sm:block text-sm text-gray-700 break-words">{d.unidade_requisitante}</span>
                        <span className="hidden sm:block text-sm text-gray-700">{d.data_desejada_contratacao ? formatarDataBR(String(d.data_desejada_contratacao)) : '—'}</span>
                        <span className="text-sm font-semibold text-right">{formatarMoeda(valorDaDemanda(d))}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">DFDs de {ano}</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {dfds.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhum DFD montado em {ano}.</p>
          ) : (
            dfds.map((f) => (
              <Link key={f.id} href={`/orgao/demandas/dfd/${f.id}`} className="flex items-center justify-between gap-3 rounded-lg border bg-white p-3 hover:bg-gray-50">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold flex items-center gap-2 flex-wrap">
                    DFD nº {f.numero}/{f.ano}
                    <Badge className={COR_STATUS_DFD[f.status]}>{ROTULO_STATUS_DFD[f.status] ?? f.status}</Badge>
                    {f.numero_processo && <Badge variant="outline">Processo {f.numero_processo}</Badge>}
                  </div>
                  <div className="text-sm text-gray-700 truncate">{f.objeto}</div>
                  <div className="text-xs text-gray-500">{f.n_demandas} demanda(s){f.setores ? ` — ${f.setores}` : ''} • {f.n_itens} item(ns)</div>
                </div>
                <div className="font-semibold text-blue-700 shrink-0">{formatarMoeda(f.valor_total_estimado)}</div>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      {antigas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contratações futuras (agrupamento antigo)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-xs text-gray-500 flex gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Agrupamentos feitos antes do DFD consolidado — ficam só para consulta. Para abrir processo, monte o DFD com as demandas.
            </p>
            {antigas.map((c) => {
              const ids = (c.demandas || []).map((d) => d.id).filter((id) => livres.has(id))
              return (
                <div key={c.id} className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-white p-3">
                  <div className="min-w-0 flex-[1_1_220px]">
                    <div className="font-semibold">{c.identificador} — {c.titulo}</div>
                    <div className="text-sm text-gray-500">{(c.demandas || []).length} demanda(s) • {c.categoria}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-blue-700">{formatarMoeda(Number(c.valor_total_estimado) || 0)}</span>
                    {permissoes?.pode_montar && ids.length > 0 && (
                      <Button size="sm" variant="outline" onClick={() => setSelecionadas(ids)}>Selecionar para o DFD</Button>
                    )}
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function DfdConsolidadoPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.DEMANDAS}>
      <DfdConsolidadoContent />
    </ModuleGuard>
  )
}
