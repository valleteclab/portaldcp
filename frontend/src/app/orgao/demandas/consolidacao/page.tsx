'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  FileText,
  Loader2,
  Plus,
  Search,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { API_URL, authFetch } from '@/lib/api'

interface ItemDemanda {
  id: string
  categoria: 'MATERIAL' | 'SERVICO'
  codigo_classe?: string
  nome_classe?: string
  descricao_objeto: string
  valor_total_estimado?: number
  prioridade?: number
}

interface Demanda {
  id: string
  ano_referencia: number
  unidade_requisitante: string
  responsavel_nome?: string
  status: string
  descricao_sucinta_objeto?: string
  data_desejada_contratacao?: string
  renovacao_contrato?: boolean
  contratacao_futura_id?: string
  itens: ItemDemanda[]
}

interface ContratacaoFutura {
  id: string
  identificador: string
  titulo: string
  categoria: 'MATERIAL' | 'SERVICO' | 'OBRA' | 'OUTROS'
  descricao?: string
  valor_total_estimado: number
  status: string
  demandas?: Demanda[]
}

interface GrupoClasse {
  chave: string
  codigo: string
  nome: string
  categoria: 'MATERIAL' | 'SERVICO'
  demandas: Demanda[]
  valor: number
}

function ConsolidacaoDemandasContent() {
  const router = useRouter()
  const [orgaoId, setOrgaoId] = useState('')
  const [ano, setAno] = useState(new Date().getFullYear())
  const [demandas, setDemandas] = useState<Demanda[]>([])
  const [contratacoes, setContratacoes] = useState<ContratacaoFutura[]>([])
  const [loading, setLoading] = useState(true)
  const [termo, setTermo] = useState('')
  const [unidade, setUnidade] = useState('TODAS')
  const [grupoAberto, setGrupoAberto] = useState<string | null>(null)
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [showContratacao, setShowContratacao] = useState(false)
  const [modoContratacao, setModoContratacao] = useState<'nova' | 'existente'>('nova')
  const [contratacaoExistenteId, setContratacaoExistenteId] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    titulo: '',
    categoria: 'MATERIAL' as 'MATERIAL' | 'SERVICO' | 'OBRA' | 'OUTROS',
    descricao: '',
    data_inicio_processo: '',
    data_conclusao_processo: '',
    prazo_estimado_dias: '',
  })

  useEffect(() => {
    try {
      const orgaoData = localStorage.getItem('orgao')
      if (orgaoData) {
        const orgao = JSON.parse(orgaoData)
        setOrgaoId(orgao.id)
      }
    } catch {
      setOrgaoId('')
    }
  }, [])

  const carregar = async () => {
    if (!orgaoId) return
    setLoading(true)
    try {
      const [demandasRes, contratacoesRes] = await Promise.all([
        authFetch(`${API_URL}/api/demandas/para-consolidar?orgaoId=${orgaoId}&ano=${ano}`),
        authFetch(`${API_URL}/api/demandas/contratacoes-futuras?orgaoId=${orgaoId}&ano=${ano}`),
      ])

      if (demandasRes.ok) {
        const data = await demandasRes.json()
        setDemandas(Array.isArray(data) ? data : [])
      }
      if (contratacoesRes.ok) {
        const data = await contratacoesRes.json()
        setContratacoes(Array.isArray(data) ? data : [])
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [orgaoId, ano])

  const formatarMoeda = (valor: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)

  const unidades = useMemo(() => {
    return Array.from(new Set(demandas.map((d) => d.unidade_requisitante).filter(Boolean))).sort()
  }, [demandas])

  const grupos = useMemo(() => {
    const mapa = new Map<string, GrupoClasse>()
    for (const demanda of demandas) {
      if (unidade !== 'TODAS' && demanda.unidade_requisitante !== unidade) continue
      const busca = termo.trim().toLowerCase()
      if (busca) {
        const match =
          demanda.unidade_requisitante.toLowerCase().includes(busca) ||
          demanda.responsavel_nome?.toLowerCase().includes(busca) ||
          demanda.descricao_sucinta_objeto?.toLowerCase().includes(busca) ||
          demanda.itens.some((item) =>
            item.descricao_objeto.toLowerCase().includes(busca) ||
            item.nome_classe?.toLowerCase().includes(busca) ||
            item.codigo_classe?.toLowerCase().includes(busca)
          )
        if (!match) continue
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
        const grupo = mapa.get(chave) || {
          chave,
          codigo: dados.codigo,
          nome: dados.nome,
          categoria: dados.categoria,
          demandas: [],
          valor: 0,
        }
        grupo.demandas.push(demanda)
        grupo.valor += dados.valor
        mapa.set(chave, grupo)
      }
    }

    return Array.from(mapa.values()).sort((a, b) =>
      `${a.categoria}${a.codigo}`.localeCompare(`${b.categoria}${b.codigo}`, 'pt-BR')
    )
  }, [demandas, termo, unidade])

  const demandasSelecionadas = useMemo(() => {
    const ids = new Set(selecionadas)
    return demandas.filter((d) => ids.has(d.id))
  }, [demandas, selecionadas])

  const valorSelecionado = demandasSelecionadas.reduce((total, demanda) => (
    total + (demanda.itens || []).reduce((subtotal, item) => subtotal + (Number(item.valor_total_estimado) || 0), 0)
  ), 0)

  const alternarDemanda = (id: string) => {
    setSelecionadas((atuais) =>
      atuais.includes(id) ? atuais.filter((item) => item !== id) : [...atuais, id]
    )
  }

  const prepararContratacao = (grupo?: GrupoClasse) => {
    if (grupo) {
      const idsGrupo = grupo.demandas.map((d) => d.id)
      setSelecionadas((atuais) => Array.from(new Set([...atuais, ...idsGrupo])))
      setForm({
        titulo: `${grupo.categoria === 'SERVICO' ? 'Contratação de' : 'Aquisição de'} ${grupo.nome}`,
        categoria: grupo.categoria,
        descricao: `Contratação futura consolidada a partir de ${grupo.demandas.length} DFD(s) da classe ${grupo.codigo} - ${grupo.nome}.`,
        data_inicio_processo: '',
        data_conclusao_processo: '',
        prazo_estimado_dias: '',
      })
    }
    setShowContratacao(true)
  }

  const salvarContratacao = async () => {
    if (selecionadas.length === 0) {
      alert('Selecione ao menos uma DFD')
      return
    }
    setSalvando(true)
    try {
      const payload = { orgaoId, demandaIds: selecionadas }
      const res = modoContratacao === 'nova'
        ? await authFetch(`${API_URL}/api/demandas/contratacoes-futuras`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ...payload,
              ano_referencia: ano,
              titulo: form.titulo,
              categoria: form.categoria,
              descricao: form.descricao,
              data_inicio_processo: form.data_inicio_processo || undefined,
              data_conclusao_processo: form.data_conclusao_processo || undefined,
              prazo_estimado_dias: form.prazo_estimado_dias ? Number(form.prazo_estimado_dias) : undefined,
            }),
          })
        : await authFetch(`${API_URL}/api/demandas/contratacoes-futuras/${contratacaoExistenteId}/demandas`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        alert(err.message || 'Erro ao salvar contratação futura')
        return
      }

      setShowContratacao(false)
      setSelecionadas([])
      setContratacaoExistenteId('')
      await carregar()
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Button variant="ghost" className="mb-2" onClick={() => router.push('/orgao/demandas')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6" />
            Consolidação das Demandas
          </h1>
          <p className="text-gray-600">Agrupe DFDs por classe/grupo e forme contratações futuras para o PCA.</p>
        </div>
        <Select value={String(ano)} onValueChange={(value) => setAno(Number(value))}>
          <SelectTrigger className="w-32 bg-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 1 + i).map((item) => (
              <SelectItem key={item} value={String(item)}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{demandas.length}</div>
            <p className="text-sm text-gray-500">DFDs disponíveis</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{grupos.length}</div>
            <p className="text-sm text-gray-500">Classes/grupos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{contratacoes.length}</div>
            <p className="text-sm text-gray-500">Contratações futuras</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-700">{formatarMoeda(valorSelecionado)}</div>
            <p className="text-sm text-gray-500">{selecionadas.length} DFD(s) selecionada(s)</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[280px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="Pesquisar por classe, objeto, setor ou responsável..."
                className="pl-10 bg-white"
              />
            </div>
            <Select value={unidade} onValueChange={setUnidade}>
              <SelectTrigger className="w-64 bg-white">
                <SelectValue placeholder="Área requisitante" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODAS">Todas as áreas</SelectItem>
                {unidades.map((item) => (
                  <SelectItem key={item} value={item}>{item}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => prepararContratacao()} disabled={selecionadas.length === 0}>
              <Briefcase className="h-4 w-4 mr-2" />
              Contratação
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : grupos.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <h2 className="font-semibold text-gray-700">Nenhuma DFD aprovada para consolidar</h2>
            <p className="text-sm text-gray-500 mt-1">Aprove DFDs de {ano} para elas aparecerem nesta etapa.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {grupos.map((grupo) => {
            const aberto = grupoAberto === grupo.chave
            const selecionadasGrupo = grupo.demandas.filter((d) => selecionadas.includes(d.id)).length
            return (
              <Card key={grupo.chave} className="overflow-hidden">
                <button
                  className="w-full p-5 flex items-center justify-between gap-4 hover:bg-gray-50 text-left"
                  onClick={() => setGrupoAberto(aberto ? null : grupo.chave)}
                >
                  <div className="flex items-center gap-4">
                    {aberto ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
                    <Badge variant="outline">{grupo.categoria === 'MATERIAL' ? 'M' : 'S'}</Badge>
                    <div>
                      <div className="text-sm text-gray-500">Classe/Grupo</div>
                      <div className="font-semibold">{grupo.codigo} - {grupo.nome}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-8 text-right">
                    <div>
                      <div className="font-semibold">{grupo.demandas.length}</div>
                      <div className="text-sm text-gray-500">DFD(s)</div>
                    </div>
                    <div>
                      <div className="font-semibold">{formatarMoeda(grupo.valor)}</div>
                      <div className="text-sm text-gray-500">Valor estimado</div>
                    </div>
                    <Button
                      size="sm"
                      variant={selecionadasGrupo > 0 ? 'default' : 'outline'}
                      onClick={(e) => {
                        e.stopPropagation()
                        prepararContratacao(grupo)
                      }}
                    >
                      <Briefcase className="h-4 w-4 mr-2" />
                      Contratação
                    </Button>
                  </div>
                </button>

                {aberto && (
                  <div className="border-t bg-white p-5">
                    <div className="grid grid-cols-[36px_1fr_160px_150px_130px] gap-4 px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50 rounded">
                      <span />
                      <span>DFD / Objeto</span>
                      <span>Área requisitante</span>
                      <span>Data desejada</span>
                      <span className="text-right">Valor</span>
                    </div>
                    <div className="divide-y">
                      {grupo.demandas.map((demanda) => {
                        const valor = (demanda.itens || []).reduce((total, item) => total + (Number(item.valor_total_estimado) || 0), 0)
                        const vinculada = !!demanda.contratacao_futura_id
                        return (
                          <div key={demanda.id} className="grid grid-cols-[36px_1fr_160px_150px_130px] gap-4 px-3 py-3 items-center">
                            <button
                              type="button"
                              onClick={() => alternarDemanda(demanda.id)}
                              className={`h-5 w-5 rounded border flex items-center justify-center ${
                                selecionadas.includes(demanda.id)
                                  ? 'bg-blue-600 border-blue-600 text-white'
                                  : 'bg-white border-gray-300'
                              }`}
                            >
                              {selecionadas.includes(demanda.id) && <Check className="h-3.5 w-3.5" />}
                            </button>
                            <div>
                              <button
                                onClick={() => router.push(`/orgao/demandas/${demanda.id}`)}
                                className="font-medium text-blue-700 hover:underline text-left"
                              >
                                DFD - {demanda.unidade_requisitante}
                              </button>
                              <p className="text-sm text-gray-700 line-clamp-2">
                                {demanda.descricao_sucinta_objeto || 'Sem descrição sucinta informada'}
                              </p>
                              {vinculada && (
                                <Badge variant="outline" className="mt-1 bg-blue-50 text-blue-700 border-blue-200">
                                  Vinculada à contratação futura
                                </Badge>
                              )}
                            </div>
                            <span className="text-sm text-gray-700">{demanda.unidade_requisitante}</span>
                            <span className="text-sm text-gray-700">
                              {demanda.data_desejada_contratacao
                                ? new Date(demanda.data_desejada_contratacao).toLocaleDateString('pt-BR')
                                : '-'}
                            </span>
                            <span className="text-sm font-semibold text-right">{formatarMoeda(valor)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contratações futuras em elaboração</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {contratacoes.length === 0 ? (
            <p className="text-sm text-gray-500">Nenhuma contratação futura criada para {ano}.</p>
          ) : contratacoes.map((contratacao) => (
            <div key={contratacao.id} className="flex items-center justify-between rounded-lg border bg-white p-3">
              <div>
                <div className="font-semibold">{contratacao.identificador} - {contratacao.titulo}</div>
                <div className="text-sm text-gray-500">
                  {(contratacao.demandas || []).length} DFD(s) vinculada(s) • {contratacao.categoria}
                </div>
              </div>
              <div className="font-semibold text-blue-700">{formatarMoeda(Number(contratacao.valor_total_estimado) || 0)}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={showContratacao} onOpenChange={setShowContratacao}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Selecionar Contratação</DialogTitle>
            <DialogDescription>
              Vincule {selecionadas.length} DFD(s) a uma contratação futura nova ou existente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={modoContratacao === 'nova' ? 'default' : 'outline'}
                onClick={() => setModoContratacao('nova')}
              >
                <Plus className="h-4 w-4 mr-2" />
                Criar nova
              </Button>
              <Button
                type="button"
                variant={modoContratacao === 'existente' ? 'default' : 'outline'}
                onClick={() => setModoContratacao('existente')}
              >
                <Briefcase className="h-4 w-4 mr-2" />
                Usar existente
              </Button>
            </div>

            {modoContratacao === 'nova' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Título da contratação *</label>
                  <Input value={form.titulo} onChange={(e) => setForm({ ...form, titulo: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Categoria</label>
                  <Select
                    value={form.categoria}
                    onValueChange={(value) => setForm({
                      ...form,
                      categoria: value as 'MATERIAL' | 'SERVICO' | 'OBRA' | 'OUTROS',
                    })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MATERIAL">Material</SelectItem>
                      <SelectItem value="SERVICO">Serviço</SelectItem>
                      <SelectItem value="OBRA">Obra</SelectItem>
                      <SelectItem value="OUTROS">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Prazo estimado do processo</label>
                  <Input
                    type="number"
                    min="1"
                    value={form.prazo_estimado_dias}
                    onChange={(e) => setForm({ ...form, prazo_estimado_dias: e.target.value })}
                    placeholder="Dias"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Início estimado do processo</label>
                  <Input type="date" value={form.data_inicio_processo} onChange={(e) => setForm({ ...form, data_inicio_processo: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Conclusão estimada</label>
                  <Input type="date" value={form.data_conclusao_processo} onChange={(e) => setForm({ ...form, data_conclusao_processo: e.target.value })} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium mb-1">Descrição</label>
                  <Textarea value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} rows={4} />
                </div>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium mb-1">Contratação futura existente</label>
                <Select value={contratacaoExistenteId} onValueChange={setContratacaoExistenteId}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma contratação" /></SelectTrigger>
                  <SelectContent>
                    {contratacoes.map((contratacao) => (
                      <SelectItem key={contratacao.id} value={contratacao.id}>
                        {contratacao.identificador} - {contratacao.titulo}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rounded-lg bg-blue-50 border border-blue-100 p-3 text-sm text-blue-900 flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Valor selecionado: <strong>{formatarMoeda(valorSelecionado)}</strong>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowContratacao(false)}>Fechar</Button>
            <Button
              onClick={salvarContratacao}
              disabled={salvando || (modoContratacao === 'nova' ? !form.titulo.trim() : !contratacaoExistenteId)}
            >
              {salvando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ConsolidacaoDemandasPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.DEMANDAS}>
      <ConsolidacaoDemandasContent />
    </ModuleGuard>
  )
}
