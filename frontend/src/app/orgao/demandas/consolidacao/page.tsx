'use client'

/**
 * DFD CONSOLIDADO — a tela virou uma FILA de pedidos aprovados aguardando
 * DFD, em três passos na mesma tela (mockup aprovado, 02/10):
 *
 *  1. Escolha os pedidos — cada linha é um PEDIDO (demanda), com sugestões de
 *     junção por classe (2+ pedidos), busca, filtro por setor, ordem e
 *     paginação de 8 em 8.
 *  2. Confira o DFD — painel lateral fixo (barra no rodapé no celular): itens
 *     somados (prévia do backend), setores, valor, alerta de classes
 *     misturadas e o alerta de parecidos (art. 12, VII, e art. 75, §1º).
 *  3. Montar — "Montar DFD com N pedidos" ou, com 1 só, "Iniciar contratação
 *     deste pedido" (mesmo caminho: monta o DFD com essa única demanda e leva
 *     à tela do DFD, que já tem "Abrir processo").
 *
 * Abaixo: DFDs em andamento (tabela compacta, próximo passo de
 * proxima-acao-dfd.ts) e Agrupamentos antigos (contratacoes-futuras, só
 * consulta). Quem não monta DFD vê a fila sem botões de ação.
 * Regras e endpoints inalterados: /api/dfds-consolidados (+ /permissoes,
 * /demandas-disponiveis, /previa).
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertTriangle, Check, ChevronDown, ChevronRight, ClipboardList, Eye, FileText, Inbox, Loader2, Lock, Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { API_URL, authFetch } from '@/lib/api'
import { toast } from 'sonner'
import { AlertaParecidos, GuiaDfd, formatarMoeda, type Parecido } from '@/components/demandas/dfd-comum'
import { rotaDoDfd, type PermissoesGeraisDfd } from '@/lib/demandas/proxima-acao-dfd'
import { anoDoLink } from '@/lib/demandas/pendencia-dfd'
import {
  LinhaPedido, SugestoesJuncao, PainelFila, TabelaDfds, plural, diasDesde,
  type Pedido, type SugestaoJuncao,
} from '@/components/demandas/fila-dfd'

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
  data_aprovacao?: string | null
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

const valorDaDemanda = (d: Demanda) => (d.itens || []).reduce((t, i) => t + (Number(i.valor_total_estimado) || 0), 0)
/** Classe principal do pedido: a do item de maior valor (chip da linha e das sugestões de junção). */
const classePrincipal = (d: Demanda): { codigo: string; nome: string } => {
  const itens = d.itens || []
  if (!itens.length) return { codigo: 'SEM-CLASSE', nome: 'Sem classificação' }
  const maior = itens.reduce((a, b) => (Number(b.valor_total_estimado) || 0) > (Number(a.valor_total_estimado) || 0) ? b : a, itens[0])
  return { codigo: maior.codigo_classe || 'SEM-CLASSE', nome: maior.nome_classe || 'Sem classificação' }
}
const PEDIDOS_POR_PAGINA = 8
const numeroBR = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

type Ordem = 'ANTIGOS' | 'VALOR' | 'SETOR'

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
  const [ordem, setOrdem] = useState<Ordem>('ANTIGOS')
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

  // Todos os pedidos (sem filtro) — base do resumo do topo e das sugestões de junção
  const todosPedidos: Pedido[] = useMemo(() => demandas.map((d) => ({
    id: d.id,
    objeto: d.descricao_sucinta_objeto || 'Sem descrição',
    setor: d.unidade_requisitante,
    classe: classePrincipal(d),
    nItens: (d.itens || []).length,
    valor: valorDaDemanda(d),
    dias: diasDesde(d.data_aprovacao),
  })), [demandas])

  // Sugestões de junção: classes com 2+ pedidos
  const sugestoes: SugestaoJuncao[] = useMemo(() => {
    const mapa = new Map<string, { nome: string; ids: string[]; setores: Set<string>; valor: number }>()
    for (const p of todosPedidos) {
      const chave = `${p.classe.codigo}:${p.classe.nome}`.toUpperCase()
      const atual = mapa.get(chave) || { nome: p.classe.nome, ids: [], setores: new Set<string>(), valor: 0 }
      atual.ids.push(p.id)
      atual.setores.add(p.setor)
      atual.valor += p.valor
      mapa.set(chave, atual)
    }
    return Array.from(mapa.entries())
      .filter(([, v]) => v.ids.length >= 2)
      .map(([chave, v]) => ({ chave, nome: v.nome, ids: v.ids, setores: v.setores.size, valor: v.valor }))
      .sort((a, b) => b.ids.length - a.ids.length)
  }, [todosPedidos])

  // Lista filtrada/ordenada (busca, setor) — a fila visível, com paginação de 8 em 8
  const [visiveis, setVisiveis] = useState(PEDIDOS_POR_PAGINA)
  useEffect(() => setVisiveis(PEDIDOS_POR_PAGINA), [termo, unidade, ordem, ano])

  const pedidosFiltrados = useMemo(() => {
    const busca = termo.trim().toLowerCase()
    const porId = new Map(demandas.map((d) => [d.id, d]))
    let lista = todosPedidos.filter((p) => {
      if (unidade !== 'TODAS' && p.setor !== unidade) return false
      if (!busca) return true
      const d = porId.get(p.id)
      return (
        p.objeto.toLowerCase().includes(busca) ||
        p.setor.toLowerCase().includes(busca) ||
        p.classe.nome.toLowerCase().includes(busca) ||
        (d?.itens || []).some((i) => i.descricao_objeto.toLowerCase().includes(busca) || i.nome_classe?.toLowerCase().includes(busca))
      )
    })
    lista = [...lista].sort((a, b) => {
      if (ordem === 'VALOR') return b.valor - a.valor
      if (ordem === 'SETOR') return a.setor.localeCompare(b.setor, 'pt-BR') || a.objeto.localeCompare(b.objeto, 'pt-BR')
      // ANTIGOS: sem data de aprovação vai para o fim
      if (a.dias === null && b.dias === null) return 0
      if (a.dias === null) return 1
      if (b.dias === null) return -1
      return b.dias - a.dias
    })
    return lista
  }, [todosPedidos, demandas, termo, unidade, ordem])

  const filtroAtivo = !!termo.trim() || unidade !== 'TODAS'

  const alternar = (id: string) => setSelecionadas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]))

  const demandasSelecionadas = demandas.filter((d) => selecionadas.includes(d.id))
  const valorSelecionado = demandasSelecionadas.reduce((t, d) => t + valorDaDemanda(d), 0)
  const setoresSelecionados = Array.from(new Set(demandasSelecionadas.map((d) => d.unidade_requisitante)))
  const classesSelecionadas = new Set(demandasSelecionadas.map((d) => `${classePrincipal(d).codigo}:${classePrincipal(d).nome}`.toUpperCase()))

  const montarDfd = async (idsParaMontar?: string[]) => {
    const ids = idsParaMontar ?? selecionadas
    if (!ids.length) return
    setMontando(true)
    try {
      const r = await authFetch(`${API_URL}/api/dfds-consolidados`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demanda_ids: ids }),
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
  // "Iniciar contratação só com este pedido" (linha ou painel, com 1 só selecionado): monta o
  // DFD com essa única demanda e leva direto à tela do DFD — lá já existe "Abrir processo".
  const iniciarComUm = (id: string) => montarDfd([id])

  const livres = new Set(demandas.map((d) => d.id))
  const dfdsAtivos = dfds.filter((f) => f.status !== 'CANCELADO').sort((a, b) => b.numero - a.numero)
  const dfdsCancelados = dfds.filter((f) => f.status === 'CANCELADO')

  const setoresTodos = Array.from(new Set(demandas.map((d) => d.unidade_requisitante)))
  const valorTodos = demandas.reduce((t, d) => t + valorDaDemanda(d), 0)

  const painel = (
    <PainelFila
      selecionadas={selecionadas.length}
      setores={setoresSelecionados}
      valor={valorSelecionado}
      previa={previa}
      carregando={carregandoPrevia}
      montando={montando}
      classesMisturadas={classesSelecionadas.size > 1}
      onMontar={() => montarDfd()}
      onIniciarUm={() => selecionadas[0] && iniciarComUm(selecionadas[0])}
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
            Pedidos aprovados aguardando DFD
          </h1>
          <p className="text-sm text-gray-700 mt-1 max-w-3xl">
            Junte pedidos parecidos num DFD só (Lei 14.133, art. 12, VII — evita o fracionamento do art. 75, §1º) ou inicie a
            contratação de um pedido. Depois de montado, o DFD vira a primeira peça do processo.
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

      {/* Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { v: demandas.length, r: 'pedidos aguardando' },
          { v: setoresTodos.length, r: 'setores' },
          { v: formatarMoeda(valorTodos), r: 'valor estimado' },
          { v: dfdsAtivos.length, r: 'DFDs em andamento' },
        ].map((c, i) => (
          <div key={i} className="rounded-lg border bg-white p-3">
            <p className="text-lg sm:text-xl font-semibold text-gray-900">{c.v}</p>
            <p className="text-xs text-gray-600">{c.r}</p>
          </div>
        ))}
      </div>

      <GuiaDfd atual={podeMontar ? 1 : null} />

      {permissoes && !podeMontar && (
        <div role="note" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
          <Lock className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          Você vê a fila, mas quem monta o DFD e abre o processo é {permissoes.responsavel_dfd}.
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-gray-500" aria-label="Carregando" /></div>
      ) : (
        <div className={`grid gap-4 ${podeMontar ? 'xl:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          <div className="space-y-4 min-w-0">
            {/* Passo 1: escolher os pedidos */}
            <Card className="gap-4 min-w-0" aria-labelledby="pedidos-titulo">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle id="pedidos-titulo" className="text-base flex items-center gap-2 flex-wrap">
                  1. Escolha os pedidos
                  <Badge variant="outline">{demandas.length}</Badge>
                </CardTitle>
                <CardDescription className="text-gray-600">
                  {podeMontar ? 'Marque os pedidos parecidos (de um ou mais setores) — a prévia aparece no painel ao lado.' : 'Fila dos pedidos aprovados aguardando DFD.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 space-y-3 min-w-0">
                {demandas.length === 0 ? (
                  <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center">
                    <Inbox className="h-10 w-10 mx-auto text-gray-400 mb-2" aria-hidden="true" />
                    <h3 className="font-semibold text-gray-800">Nenhum pedido aprovado em {ano}</h3>
                    <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
                      Os pedidos aparecem aqui depois de aprovados na Central de Aprovações. Os que já estão num DFD ou num processo não aparecem.
                    </p>
                    <div className="flex justify-center gap-2 mt-3 flex-wrap">
                      <Button variant="outline" size="sm" onClick={() => router.push('/orgao/aprovacoes?tab=demandas')}>Central de Aprovações</Button>
                      <Button variant="outline" size="sm" onClick={() => router.push('/orgao/demandas')}>Ver todas as demandas</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    {podeMontar && <SugestoesJuncao sugestoes={sugestoes} onSelecionar={(ids) => setSelecionadas((a) => Array.from(new Set([...a, ...ids])))} />}

                    <div className="flex flex-wrap gap-2">
                      <div className="relative flex-1 min-w-[min(220px,100%)]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" aria-hidden="true" />
                        <Input
                          aria-label="Pesquisar pedidos"
                          value={termo}
                          onChange={(e) => setTermo(e.target.value)}
                          placeholder="Buscar por objeto, item, classe ou setor…"
                          className="pl-10 bg-white"
                        />
                      </div>
                      <Select value={unidade} onValueChange={setUnidade}>
                        <SelectTrigger aria-label="Setor" className="w-full sm:w-48 bg-white"><SelectValue placeholder="Setor" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="TODAS">Todos os setores</SelectItem>
                          {unidades.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={ordem} onValueChange={(v) => setOrdem(v as Ordem)}>
                        <SelectTrigger aria-label="Ordem" className="w-full sm:w-48 bg-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ANTIGOS">Mais antigos primeiro</SelectItem>
                          <SelectItem value="VALOR">Maior valor</SelectItem>
                          <SelectItem value="SETOR">Por setor</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {pedidosFiltrados.length === 0 ? (
                      <div className="rounded-lg border border-dashed bg-slate-50 p-6 text-center">
                        <FileText className="h-10 w-10 mx-auto text-gray-400 mb-2" aria-hidden="true" />
                        <p className="text-sm text-gray-700">Nenhum pedido encontrado com esse filtro.</p>
                        {filtroAtivo && (
                          <Button variant="outline" size="sm" className="mt-3" onClick={() => { setTermo(''); setUnidade('TODAS') }}>Limpar filtro</Button>
                        )}
                      </div>
                    ) : (
                      <>
                        <ul className="space-y-2">
                          {pedidosFiltrados.slice(0, visiveis).map((p) => (
                            <LinhaPedido
                              key={p.id}
                              pedido={p}
                              selecionado={selecionadas.includes(p.id)}
                              podeMontar={podeMontar}
                              onAlternar={() => alternar(p.id)}
                              onIniciarUm={() => iniciarComUm(p.id)}
                              onVerPedido={() => router.push(`/orgao/demandas/${p.id}`)}
                            />
                          ))}
                        </ul>
                        <div className="flex items-center justify-between gap-3 flex-wrap text-sm text-gray-600">
                          <span>Mostrando {Math.min(visiveis, pedidosFiltrados.length)} de {pedidosFiltrados.length} pedidos</span>
                          {pedidosFiltrados.length > visiveis && (
                            <Button variant="outline" size="sm" onClick={() => setVisiveis((n) => n + PEDIDOS_POR_PAGINA)}>
                              Mostrar mais {Math.min(PEDIDOS_POR_PAGINA, pedidosFiltrados.length - visiveis)}
                            </Button>
                          )}
                        </div>
                      </>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Acompanhamento: DFDs em andamento */}
            <Card className="gap-4 min-w-0" aria-labelledby="dfds-titulo">
              <CardHeader className="px-4 sm:px-6">
                <CardTitle id="dfds-titulo" className="text-base">DFDs em andamento — {ano}</CardTitle>
                <CardDescription className="text-gray-600">Cada DFD mostra em que pé está e o próximo passo. Um DFD vira um processo.</CardDescription>
              </CardHeader>
              <CardContent className="px-4 sm:px-6 space-y-2 min-w-0">
                {dfdsAtivos.length === 0 ? (
                  <p className="text-sm text-gray-600 rounded-lg border border-dashed bg-slate-50 p-4">
                    Nenhum DFD em andamento em {ano}.
                    {podeMontar && ' Escolha os pedidos acima e clique em Montar DFD.'}
                  </p>
                ) : (
                  <TabelaDfds dfds={dfdsAtivos} permissoes={permissoes} />
                )}
                {dfdsCancelados.length > 0 && (
                  <div className="pt-1">
                    <Button variant="ghost" size="sm" className="text-gray-700" aria-expanded={verCancelados} onClick={() => setVerCancelados((v) => !v)}>
                      {verCancelados ? <ChevronDown className="h-4 w-4 mr-1" aria-hidden="true" /> : <ChevronRight className="h-4 w-4 mr-1" aria-hidden="true" />}
                      {verCancelados ? 'Esconder' : 'Mostrar'} {plural(dfdsCancelados.length, 'DFD cancelado', 'DFDs cancelados')}
                    </Button>
                    {verCancelados && <div className="mt-2"><TabelaDfds dfds={dfdsCancelados} permissoes={permissoes} /></div>}
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
                    Agrupamentos antigos
                    <Badge variant="outline">{antigas.length}</Badge>
                  </button>
                </CardHeader>
                {antigasAbertas && (
                  <CardContent className="px-4 sm:px-6 space-y-2">
                    <p className="text-xs text-gray-600 flex gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
                      Feitos antes do DFD consolidado — ficam só para consulta. Para abrir processo, monte o DFD com os pedidos.
                    </p>
                    {antigas.map((c) => {
                      const ids = (c.demandas || []).map((d) => d.id).filter((id) => livres.has(id))
                      return (
                        <div key={c.id} className="flex items-center justify-between gap-3 flex-wrap rounded-lg border bg-white p-3">
                          <div className="min-w-0 flex-[1_1_220px]">
                            <div className="font-semibold break-words">{c.identificador} — {c.titulo}</div>
                            <div className="text-sm text-gray-600">{plural((c.demandas || []).length, 'pedido', 'pedidos')} · {c.categoria}</div>
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

            {/* Celular/tablet: seleção fixa embaixo enquanto a fila está na tela */}
            {podeMontar && selecionadas.length > 0 && (
              <div className="xl:hidden sticky bottom-2 z-20 border border-blue-300 rounded-lg bg-white shadow-[0_-4px_12px_rgba(0,0,0,0.08)] p-3 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-semibold text-gray-900">{plural(selecionadas.length, 'pedido selecionado', 'pedidos selecionados')}</p>
                  <p className="text-gray-700 truncate">
                    {previa ? `${plural(previa.itens.length, 'item somado', 'itens somados')} · ${formatarMoeda(previa.valor_total_estimado)}` : formatarMoeda(valorSelecionado)}
                    {previa?.alertas?.length ? ' · atenção: parecidos' : ''}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPreviaAberta(true)} disabled={!previa}>
                    <Eye className="h-4 w-4 mr-1" aria-hidden="true" /> Prévia
                  </Button>
                  <Button size="sm" onClick={() => montarDfd()} disabled={montando || carregandoPrevia || !previa}>
                    {montando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4 mr-1" aria-hidden="true" />}
                    Montar DFD
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Desktop: painel de seleção lateral fixo (passos 2 e 3) */}
          {podeMontar && (
            <aside aria-label="Confira e monte o DFD" className="hidden xl:block min-w-0">
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
              {plural(selecionadas.length, 'pedido', 'pedidos')} de {setoresSelecionados.join(', ') || '—'}. Os itens iguais são somados; depois de
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
                <Button onClick={() => montarDfd()} disabled={montando || carregandoPrevia}>
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

export default function DfdConsolidadoPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.DEMANDAS}>
      <DfdConsolidadoContent />
    </ModuleGuard>
  )
}
