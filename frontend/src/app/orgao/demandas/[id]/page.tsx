'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Package, Wrench, Trash2, Send, Search, Loader2,
  CheckCircle, XCircle, Clock, FileText, AlertCircle, BookOpen,
  Plus, Check, X, ChevronRight, ChevronLeft, Info, Database, Globe,
  ChevronsUpDown, Pencil, Home, Lock, Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList
} from '@/components/ui/command'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BuscaItemCatalogoProprio } from '@/components/catalogo'
import { API_URL, authFetch } from '@/lib/api'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ItemDemanda {
  id: string
  categoria: 'MATERIAL' | 'SERVICO'
  codigo_classe?: string
  nome_classe?: string
  codigo_item_catalogo?: string
  descricao_objeto: string
  justificativa?: string
  quantidade_estimada: number
  unidade_medida: string
  valor_unitario_estimado?: number
  valor_total_estimado?: number
  trimestre_previsto?: number
  renovacao_contrato: boolean
  prioridade: number
  catalogo_utilizado: string
}

interface Demanda {
  id: string
  orgao_id: string
  ano_referencia: number
  unidade_requisitante: string
  responsavel_nome?: string
  responsavel_email?: string
  responsavel_telefone?: string
  status: 'RASCUNHO' | 'ENVIADA' | 'EM_ANALISE' | 'APROVADA' | 'REJEITADA' | 'CONSOLIDADA'
  observacoes?: string
  motivo_rejeicao?: string
  created_at: string
  itens: ItemDemanda[]
}

// Item normalizado — mesma forma para qualquer fonte
interface ItemSelecionado {
  codigo: string
  descricao: string
  tipo: 'MATERIAL' | 'SERVICO'
  unidade_padrao?: string
  codigo_classe?: string
  nome_classe?: string
  codigo_pdm?: string
  nome_pdm?: string
  descricao_detalhada?: string
  fonte: 'COMPRASGOV' | 'PROPRIO' | 'NOVO'
}

// ─── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cor: string; icon: any }> = {
  RASCUNHO:    { label: 'Rascunho',     cor: 'bg-gray-100 text-gray-700',     icon: FileText },
  ENVIADA:     { label: 'Enviada',      cor: 'bg-blue-100 text-blue-700',     icon: Send },
  EM_ANALISE:  { label: 'Em Análise',   cor: 'bg-yellow-100 text-yellow-700', icon: Clock },
  APROVADA:    { label: 'Aprovada',     cor: 'bg-green-100 text-green-700',   icon: CheckCircle },
  REJEITADA:   { label: 'Rejeitada',    cor: 'bg-red-100 text-red-700',       icon: XCircle },
  CONSOLIDADA: { label: 'Consolidada',  cor: 'bg-purple-100 text-purple-700', icon: CheckCircle },
}

const PRIORIDADE_CONFIG: Record<number, { label: string; cor: string }> = {
  1: { label: 'Muito Alta', cor: 'text-red-600' },
  2: { label: 'Alta',       cor: 'text-orange-500' },
  3: { label: 'Média',      cor: 'text-yellow-600' },
  4: { label: 'Baixa',      cor: 'text-blue-500' },
  5: { label: 'Muito Baixa', cor: 'text-gray-400' },
}

type FonteBusca = 'federal' | 'proprio'

// ─── Busca CATMAT/CATSER (catálogo federal) inline ────────────────────────────

interface PdmComprasGov {
  codigoPdm: number
  nomePdm: string
  codigoClasse?: number
  nomeClasse?: string
}

interface FiltroPdm {
  codigo: string
  nome: string
  obrigatoria: boolean
  valores: { codigo: string; nome: string }[]
}

function BuscaCatalogoFederal({ onSelect }: { onSelect: (item: ItemSelecionado) => void }) {
  const [termo, setTermo] = useState('')
  const [tipo, setTipo] = useState<'all' | 'MATERIAL' | 'SERVICO'>('all')
  const [resultados, setResultados] = useState<any[]>([])
  const [pdms, setPdms] = useState<PdmComprasGov[]>([])
  const [pdmSelecionado, setPdmSelecionado] = useState<PdmComprasGov | null>(null)
  const [filtros, setFiltros] = useState<FiltroPdm[]>([])
  const [filtrosSelecionados, setFiltrosSelecionados] = useState<Record<string, string>>({})
  const [totalFederal, setTotalFederal] = useState(0)
  const [unidadePdm, setUnidadePdm] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const normalizarBusca = (valor: string) =>
    valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

  const parseCaracteristicas = (item: any): { nome: string; valor: string }[] => {
    let caracts: { nome: string; valor: string }[] = []
    if (item.descricao_detalhada) {
      try { caracts = JSON.parse(item.descricao_detalhada) } catch { /* ignore */ }
    }
    if (caracts.length === 0 && item.descricao) {
      const dashIdx = item.descricao.indexOf(' - ')
      if (dashIdx > -1) {
        const caractsStr = item.descricao.slice(dashIdx + 3)
        caracts = caractsStr.split(', ')
          .map((c: string) => {
            const colonIdx = c.indexOf(': ')
            if (colonIdx > -1) return { nome: c.slice(0, colonIdx).trim(), valor: c.slice(colonIdx + 2).trim() }
            return null
          })
          .filter((c: { nome: string; valor: string } | null): c is { nome: string; valor: string } =>
            c !== null && c.nome.length > 0 && c.valor.length > 0
          )
      }
    }
    return caracts
  }

  const carregarItensPdm = useCallback(async (pdm: PdmComprasGov, filtrosAtuais: Record<string, string>) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limite: '100',
        filtros: JSON.stringify(filtrosAtuais),
      })
      const res = await authFetch(`${API_URL}/api/catalogo/comprasgov/pdm/${pdm.codigoPdm}/itens?${params}`)
      if (res.ok) {
        const data = await res.json()
        setResultados(data.itens ?? [])
        setFiltros(data.filtros ?? [])
        setUnidadePdm(data.unidade ?? null)
        setTotalFederal(data.total ?? data.itens?.length ?? 0)
      }
    } catch { /* silencioso */ } finally {
      setLoading(false)
      setBuscado(true)
    }
  }, [])

  const selecionarPdm = useCallback((pdm: PdmComprasGov) => {
    setPdmSelecionado(pdm)
    setFiltrosSelecionados({})
    carregarItensPdm(pdm, {})
  }, [carregarItensPdm])

  const buscar = useCallback(async (t: string, tp: string) => {
    if (t.trim().length < 2) {
      setResultados([])
      setPdms([])
      setPdmSelecionado(null)
      setFiltros([])
      setBuscado(false)
      return
    }
    setLoading(true)
    try {
      setPdmSelecionado(null)
      setFiltros([])
      setFiltrosSelecionados({})
      setUnidadePdm(null)
      setTotalFederal(0)

      if (tp !== 'SERVICO') {
        const paramsPdm = new URLSearchParams({ termo: t, limite: '12' })
        const resPdm = await authFetch(`${API_URL}/api/catalogo/comprasgov/pdms?${paramsPdm}`)
        const pdmsData = resPdm.ok ? await resPdm.json() : []
        setPdms(pdmsData)

        const pdmExato = pdmsData.find((pdm: PdmComprasGov) =>
          normalizarBusca(pdm.nomePdm) === normalizarBusca(t)
        )

        if (pdmExato) {
          setPdmSelecionado(pdmExato)
          await carregarItensPdm(pdmExato, {})
          return
        }
      } else {
        setPdms([])
      }

      const params = new URLSearchParams({ termo: t, limite: '30' })
      if (tp !== 'all') params.set('tipo', tp)
      const res = await authFetch(`${API_URL}/api/catalogo/itens?${params}`)
      if (res.ok) {
        const data = await res.json()
        const itens = Array.isArray(data) ? data : (data.dados ?? [])
        setResultados(itens)
        setTotalFederal(itens.length)
      }
    } catch { /* silencioso */ } finally {
      setLoading(false)
      setBuscado(true)
    }
  }, [carregarItensPdm])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscar(termo, tipo), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [termo, tipo, buscar])

  useEffect(() => {
    if (!pdmSelecionado) return
    carregarItensPdm(pdmSelecionado, filtrosSelecionados)
  }, [filtrosSelecionados, pdmSelecionado, carregarItensPdm])

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={termo}
            onChange={e => setTermo(e.target.value)}
            placeholder="Buscar pelo código ou descrição (ex: 446820, computador...)"
            className="pl-9 h-10"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-gray-400" />
          )}
        </div>
        <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
          <SelectTrigger className="w-36 h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="MATERIAL">Material</SelectItem>
            <SelectItem value="SERVICO">Serviço</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {pdms.length > 0 && !pdmSelecionado && (
        <div className="border rounded-lg bg-white divide-y max-h-56 overflow-y-auto">
          {pdms.map(pdm => (
            <button
              key={pdm.codigoPdm}
              type="button"
              onClick={() => selecionarPdm(pdm)}
              className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm text-gray-900">PDM: {pdm.codigoPdm} - {pdm.nomePdm}</p>
                  {pdm.nomeClasse && <p className="text-xs text-gray-500 mt-0.5">Classe: {pdm.codigoClasse} - {pdm.nomeClasse}</p>}
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 mt-0.5" />
              </div>
            </button>
          ))}
        </div>
      )}

      {pdmSelecionado && (
        <div className="border rounded-lg bg-gray-50 p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500">PDM selecionado</p>
              <p className="text-sm font-semibold text-gray-900">{pdmSelecionado.codigoPdm} - {pdmSelecionado.nomePdm}</p>
              {unidadePdm?.siglaUnidadeFornecimento && (
                <p className="text-xs text-gray-500 mt-1">Unidade: {unidadePdm.nomeUnidadeFornecimento || unidadePdm.siglaUnidadeFornecimento}</p>
              )}
            </div>
            {Object.keys(filtrosSelecionados).length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setFiltrosSelecionados({})}>
                Limpar filtros
              </Button>
            )}
          </div>

          {filtros.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {filtros.map(filtro => (
                <div key={filtro.codigo} className="space-y-1">
                  <label className="text-xs font-medium text-gray-700">
                    {filtro.nome}{filtro.obrigatoria ? ' *' : ''}
                  </label>
                  <Select
                    value={filtrosSelecionados[filtro.codigo] ?? 'all'}
                    onValueChange={(value) => {
                      setFiltrosSelecionados(prev => {
                        const next = { ...prev }
                        if (value === 'all') delete next[filtro.codigo]
                        else next[filtro.codigo] = value
                        return next
                      })
                    }}
                  >
                    <SelectTrigger className="h-9 bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {filtro.valores.map(valor => (
                        <SelectItem key={valor.codigo} value={valor.codigo}>{valor.nome}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {buscado && resultados.length === 0 && !loading && pdms.length === 0 && (
        <div className="text-center py-5 text-gray-400 bg-gray-50 rounded-lg text-sm">
          Nenhum item encontrado. Tente outro termo ou use "Catálogo Próprio".
        </div>
      )}

      {resultados.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-1.5">
            Foram encontrados <strong>{totalFederal || resultados.length}</strong> {resultados.length === 1 ? 'resultado' : 'resultados'}
          </p>
          {/* Cabeçalho da tabela */}
          <div className="bg-gray-50 border border-b-0 rounded-t-lg grid grid-cols-[80px_1fr_32px] px-4 py-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Código</span>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome do Material / Serviço</span>
            <span />
          </div>
          <div className="border rounded-b-lg divide-y max-h-96 overflow-y-auto bg-white shadow-sm">
            {resultados.map(item => {
              // Parsear características: podem vir como JSON em descricao_detalhada ou como parte do objeto
              let caracts: { nome: string; valor: string }[] = parseCaracteristicas(item)
              if (item.descricao_detalhada) {
                try { caracts = JSON.parse(item.descricao_detalhada) } catch { /* ignore */ }
              }
              // Fallback: parsear string "PDM - Car1: Val1, Car2: Val2, ..." quando descricao_detalhada nulo
              if (caracts.length === 0 && item.descricao) {
                const dashIdx = item.descricao.indexOf(' - ')
                if (dashIdx > -1) {
                  const caractsStr = item.descricao.slice(dashIdx + 3)
                  caracts = caractsStr.split(', ')
                    .map((c: string) => {
                      const colonIdx = c.indexOf(': ')
                      if (colonIdx > -1) return { nome: c.slice(0, colonIdx).trim(), valor: c.slice(colonIdx + 2).trim() }
                      return null
                    })
                    .filter((c: { nome: string; valor: string } | null): c is { nome: string; valor: string } =>
                      c !== null && c.nome.length > 0 && c.valor.length > 0
                    )
                }
              }
              const nomePdm = item.nome_pdm || (item.descricao?.indexOf(' - ') > -1 ? item.descricao.split(' - ')[0] : item.descricao)
              const nomeCls = item.classe?.nome || item.nome_classe || ''

              return (
                <button
                  key={item.id || item.codigo}
                  type="button"
                  onClick={() => onSelect({
                    codigo: item.codigo,
                    descricao: item.descricao,
                    tipo: item.tipo,
                    unidade_padrao: item.unidade_padrao,
                    codigo_classe: item.codigo_classe || item.classe?.codigo,
                    nome_classe: item.classe?.nome || item.nome_classe,
                    codigo_pdm: item.codigo_pdm,
                    nome_pdm: item.nome_pdm,
                    descricao_detalhada: item.descricao_detalhada,
                    fonte: 'COMPRASGOV',
                  })}
                  className="w-full grid grid-cols-[80px_1fr_32px] items-start px-4 py-3 hover:bg-blue-50 text-left transition-colors group gap-3"
                >
                  {/* Código */}
                  <div className="pt-0.5">
                    <span className="font-mono text-sm font-semibold text-gray-700">{item.codigo}</span>
                  </div>

                  {/* Descrição estruturada */}
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-gray-900 leading-snug">
                      {nomePdm}
                    </p>
                    {caracts.length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        {caracts.map((c, i) => (
                          <p key={i} className="text-xs text-gray-600">
                            <span className="text-gray-400">{c.nome}:</span>{' '}
                            <span>{c.valor}</span>
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      {nomeCls && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded">
                          {nomeCls}
                        </span>
                      )}
                      {item.unidade_padrao && (
                        <Badge variant="outline" className="text-xs py-0">{item.unidade_padrao}</Badge>
                      )}
                      {item.sustentavel && (
                        <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">♻ Sustentável</span>
                      )}
                    </div>
                  </div>

                  {/* Ação */}
                  <div className="pt-0.5 flex justify-center">
                    <Plus className="h-4 w-4 text-gray-300 group-hover:text-blue-500 transition-colors" />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Formulário de item selecionado ──────────────────────────────────────────

interface FormItemState {
  quantidade_estimada: string
  unidade_medida: string
  valor_unitario_estimado: string
  trimestre_previsto: string
  prioridade: string
  renovacao_contrato: boolean
  codigo_classe?: string
  nome_classe?: string
}

function FormAdicionarItem({
  item,
  onConfirm,
  onCancelar,
  loading,
}: {
  item: ItemSelecionado
  onConfirm: (form: FormItemState) => void
  onCancelar: () => void
  loading: boolean
}) {
  const [form, setForm] = useState<FormItemState>({
    quantidade_estimada: '1',
    unidade_medida: item.unidade_padrao || 'UN',
    valor_unitario_estimado: '',
    trimestre_previsto: '1',
    prioridade: '3',
    renovacao_contrato: false,
    codigo_classe: item.codigo_classe,
    nome_classe: item.nome_classe,
  })
  const [classes, setClasses] = useState<{ id: string; codigo: string; nome: string }[]>([])
  const [classeOpen, setClasseOpen] = useState(false)
  const [buscaClasse, setBuscaClasse] = useState(item.nome_classe || item.codigo_classe || '')
  const [criandoClasse, setCriandoClasse] = useState(false)

  // Sempre carregar classes — usa as classificações do nosso catálogo próprio
  useEffect(() => {
    const params = new URLSearchParams({ limite: '200' })
    if (item.tipo) params.set('tipo', item.tipo)
    authFetch(`${API_URL}/api/catalogo-proprio/classificacoes?${params}`)
      .then(r => r.json())
      .then(data => setClasses(Array.isArray(data) ? data : (data.dados ?? [])))
      .catch(() => {})
  }, [item.tipo])

  // Nome da classe selecionada (do formulário ou do item)
  const classeSelecionada = form.codigo_classe
    ? classes.find(c => c.codigo === form.codigo_classe)
    : null
  const termoNovaClasse = buscaClasse.trim()
  const existeClasseNaBusca = termoNovaClasse.length > 0 && classes.some(c =>
    c.codigo.toLowerCase() === termoNovaClasse.toLowerCase() ||
    c.nome.trim().toLowerCase() === termoNovaClasse.toLowerCase()
  )
  const podeCriarClasse = termoNovaClasse.length >= 3 && !existeClasseNaBusca

  const criarClassificacao = async () => {
    if (!podeCriarClasse || criandoClasse) return
    setCriandoClasse(true)
    try {
      const res = await authFetch(`${API_URL}/api/catalogo-proprio/classificacoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: termoNovaClasse,
          tipo: item.tipo,
          palavras_chave: termoNovaClasse.split(/\s+/).filter(Boolean),
        }),
      })
      if (!res.ok) throw new Error('Erro ao criar classificacao')
      const nova = await res.json()
      setClasses(prev => [...prev, nova].sort((a, b) => a.codigo.localeCompare(b.codigo)))
      setForm(prev => ({ ...prev, codigo_classe: nova.codigo, nome_classe: nova.nome }))
      setBuscaClasse('')
      setClasseOpen(false)
    } catch {
      alert('Não foi possível criar a classificação agora. Tente novamente.')
    } finally {
      setCriandoClasse(false)
    }
  }

  const valor = parseFloat(form.valor_unitario_estimado) || 0
  const qtd = parseFloat(form.quantidade_estimada) || 0
  const total = valor * qtd

  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  const fonteLabel: Record<string, string> = {
    COMPRASGOV: 'CATMAT/CATSER',
    PROPRIO: 'Catálogo Próprio',
    NOVO: 'Novo Item',
  }
  const fonteCor: Record<string, string> = {
    COMPRASGOV: 'bg-green-50 text-green-700 border-green-200',
    PROPRIO: 'bg-blue-50 text-blue-700 border-blue-200',
    NOVO: 'bg-purple-50 text-purple-700 border-purple-200',
  }

  return (
    <div className="border-2 border-blue-200 rounded-xl p-5 bg-blue-50 space-y-4">
      {/* Item selecionado */}
      <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-blue-100">
        <div className="shrink-0 mt-0.5">
          {item.tipo === 'MATERIAL'
            ? <Package className="h-5 w-5 text-blue-500" />
            : <Wrench className="h-5 w-5 text-purple-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-semibold text-sm">{item.descricao}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${fonteCor[item.fonte]}`}>
              {fonteLabel[item.fonte]}
            </span>
          </div>
          <div className="text-xs text-gray-500 font-mono">{item.codigo}</div>
        </div>
        <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600 shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Classificação — sempre visível para vincular ao nosso sistema */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1.5 flex items-center gap-1.5">
          <BookOpen className="h-3.5 w-3.5 text-blue-500" />
          Classificação no nosso sistema
          {!form.codigo_classe && (
            <span className="text-amber-600 font-normal ml-1">* necessária para agrupar no PCA</span>
          )}
        </label>
        <Popover open={classeOpen} onOpenChange={setClasseOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`w-full flex items-center justify-between h-9 px-3 rounded-md border text-sm bg-white transition-colors
                ${classeOpen ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}
                ${!form.codigo_classe ? 'text-amber-700 border-amber-300 bg-amber-50' : 'text-gray-900'}`}
            >
              <span className="flex items-center gap-2 truncate">
                {form.codigo_classe ? (
                  <>
                    <span className="font-mono text-xs text-gray-400 shrink-0">{form.codigo_classe}</span>
                    <span className="truncate">{classeSelecionada?.nome || form.nome_classe || '—'}</span>
                  </>
                ) : (
                  <span className="text-amber-600">Selecione a classificação...</span>
                )}
              </span>
              <ChevronsUpDown className="h-4 w-4 text-gray-400 shrink-0 ml-2" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[400px] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput
                placeholder={`Buscar por código ou nome${item.codigo_classe ? ` (ex: ${item.codigo_classe})` : ''}...`}
                value={buscaClasse}
                onValueChange={setBuscaClasse}
              />
              <CommandList>
                <CommandEmpty className="py-4 text-center text-sm text-gray-500">
                  Nenhuma classificação encontrada
                </CommandEmpty>
                <CommandGroup>
                  {classes.map(c => (
                    <CommandItem
                      key={c.id}
                      value={`${c.codigo} ${c.nome}`}
                      onSelect={() => {
                        setForm({ ...form, codigo_classe: c.codigo, nome_classe: c.nome })
                        setClasseOpen(false)
                      }}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <Check className={`h-4 w-4 shrink-0 ${form.codigo_classe === c.codigo ? 'opacity-100 text-blue-600' : 'opacity-0'}`} />
                      <span className="font-mono text-xs text-gray-400 shrink-0 w-14">{c.codigo}</span>
                      <span className="truncate text-sm">{c.nome}</span>
                    </CommandItem>
                  ))}
                  {podeCriarClasse && (
                    <CommandItem
                      value={`criar ${termoNovaClasse}`}
                      onSelect={criarClassificacao}
                      className="flex items-center gap-2 cursor-pointer border-t mt-1 pt-2 text-blue-700"
                    >
                      {criandoClasse ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 shrink-0" />
                      )}
                      <span className="truncate text-sm font-medium">
                        Criar nova classificação: "{termoNovaClasse}"
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {form.codigo_classe && (
          <p className="mt-1 text-xs text-green-600 flex items-center gap-1">
            <Check className="h-3 w-3" />
            Itens desta classificação serão agrupados em 1 linha no PCA
          </p>
        )}
      </div>

      {/* Campos */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Quantidade *</label>
          <Input type="number" min="1" value={form.quantidade_estimada}
            onChange={e => setForm({ ...form, quantidade_estimada: e.target.value })}
            className="h-9 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Unidade</label>
          <Select value={form.unidade_medida} onValueChange={v => setForm({ ...form, unidade_medida: v })}>
            <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['UN', 'MES', 'HR', 'KG', 'M', 'M2', 'M3', 'L', 'CX', 'PCT', 'RL', 'SV'].map(u => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Valor Unitário (R$)</label>
          <Input type="number" min="0" step="0.01" value={form.valor_unitario_estimado}
            onChange={e => setForm({ ...form, valor_unitario_estimado: e.target.value })}
            placeholder="0,00" className="h-9 bg-white" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Trimestre Previsto</label>
          <Select value={form.trimestre_previsto} onValueChange={v => setForm({ ...form, trimestre_previsto: v })}>
            <SelectTrigger className="h-9 bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1º Trimestre (Jan–Mar)</SelectItem>
              <SelectItem value="2">2º Trimestre (Abr–Jun)</SelectItem>
              <SelectItem value="3">3º Trimestre (Jul–Set)</SelectItem>
              <SelectItem value="4">4º Trimestre (Out–Dez)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Prioridade</label>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4, 5].map(p => (
            <button key={p} type="button"
              onClick={() => setForm({ ...form, prioridade: String(p) })}
              className={`flex-1 py-1 rounded text-xs font-medium transition-colors border ${
                form.prioridade === String(p)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300'
              }`}
            >
              {PRIORIDADE_CONFIG[p]?.label}
            </button>
          ))}
        </div>
      </div>

      {total > 0 && (
        <div className="bg-white rounded-lg p-3 border border-blue-100 flex justify-between items-center">
          <span className="text-sm text-gray-600">Valor Total Estimado</span>
          <span className="font-bold text-blue-700 text-lg">{fmt(total)}</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onCancelar} className="flex-1" size="sm">Cancelar</Button>
        <Button onClick={() => onConfirm(form)}
          disabled={loading || !form.codigo_classe || !form.quantidade_estimada || parseFloat(form.quantidade_estimada) <= 0}
          className="flex-1 bg-blue-600 hover:bg-blue-700" size="sm">
          {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
          Adicionar à Demanda
        </Button>
      </div>
    </div>
  )
}

// ─── Justificativa da Demanda (nível demanda, salva em observacoes) ───────────

function JustificativaDemanda({
  demandaId,
  justificativa,
  podeEditar,
  onSalvo,
}: {
  demandaId: string
  justificativa: string
  podeEditar: boolean
  onSalvo: (texto: string) => void
}) {
  const [texto, setTexto] = useState(justificativa)
  const [salvando, setSalvando] = useState(false)
  const [salvo, setSalvo] = useState(true)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sincroniza quando a prop muda (ex.: reload)
  useEffect(() => { setTexto(justificativa) }, [justificativa])

  const salvar = useCallback(async (valor: string) => {
    setSalvando(true)
    try {
      await authFetch(`${API_URL}/api/demandas/${demandaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacoes: valor }),
      })
      onSalvo(valor)
      setSalvo(true)
    } finally {
      setSalvando(false)
    }
  }, [demandaId, onSalvo])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setTexto(val)
    setSalvo(false)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => salvar(val), 1200)
  }

  return (
    <div className="bg-white rounded-xl border p-4 shadow-sm space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-gray-400" />
          Justificativa da Necessidade
          <span className="text-xs font-normal text-gray-400">(Art. 18, I — Lei 14.133/2021)</span>
        </label>
        {podeEditar && (
          <span className={`text-xs ${salvando ? 'text-amber-500' : salvo ? 'text-green-600' : 'text-gray-400'}`}>
            {salvando ? '● Salvando…' : salvo && texto ? '✓ Salvo' : ''}
          </span>
        )}
      </div>
      {podeEditar ? (
        <Textarea
          value={texto}
          onChange={handleChange}
          placeholder="Descreva a necessidade que justifica esta demanda de contratação. Ex.: A contratação se faz necessária para garantir o funcionamento adequado das atividades do setor, conforme Art. 18, I da Lei 14.133/2021..."
          rows={4}
          className="text-sm resize-none border-gray-200 focus:border-blue-400"
        />
      ) : (
        <p className="text-sm text-gray-700 whitespace-pre-wrap">
          {texto || <span className="text-gray-400 italic">Sem justificativa informada.</span>}
        </p>
      )}
    </div>
  )
}

// ─── Painel de busca com 2 fontes ─────────────────────────────────────────────

function PainelBusca({
  orgaoId,
  onSelect,
}: {
  orgaoId: string
  onSelect: (item: ItemSelecionado) => void
}) {
  const [fonte, setFonte] = useState<FonteBusca>('federal')

  return (
    <div className="space-y-4">
      {/* Seletor de fonte */}
      <div className="flex rounded-lg border bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setFonte('federal')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            fonte === 'federal'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Globe className="h-4 w-4" />
          CATMAT / CATSER
          <span className={`text-xs px-1 rounded ${fonte === 'federal' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
            ComprasGov
          </span>
        </button>
        <div className="w-px bg-gray-200" />
        <button
          type="button"
          onClick={() => setFonte('proprio')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
            fonte === 'proprio'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Database className="h-4 w-4" />
          Catálogo Próprio
          <span className={`text-xs px-1 rounded ${fonte === 'proprio' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
            + Novo
          </span>
        </button>
      </div>

      {/* Conteúdo da busca */}
      {fonte === 'federal' ? (
        <div className="space-y-3">
          <BuscaCatalogoFederal onSelect={onSelect} />
          <BuscaItemCatalogoProprio
            orgaoId={orgaoId}
            manualOnly
            onChange={(item) => {
              if (item) {
                onSelect({
                  codigo: item.codigo,
                  descricao: item.descricao,
                  tipo: item.tipo,
                  unidade_padrao: item.unidade_padrao,
                  codigo_classe: item.classificacao?.codigo,
                  nome_classe: item.classificacao?.nome,
                  fonte: 'PROPRIO',
                })
              }
            }}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-gray-500">
            Busque no catálogo do órgão ou clique em <strong>"Cadastrar novo item"</strong> para criar um novo.
          </p>
          <BuscaItemCatalogoProprio
            orgaoId={orgaoId}
            placeholder="Buscar no catálogo próprio ou criar novo..."
            onChange={(item) => {
              if (item) {
                onSelect({
                  codigo: item.codigo,
                  descricao: item.descricao,
                  tipo: item.tipo,
                  unidade_padrao: item.unidade_padrao,
                  codigo_classe: item.classificacao?.codigo,
                  nome_classe: item.classificacao?.nome,
                  fonte: 'PROPRIO',
                })
              }
            }}
          />
          <p className="text-xs text-blue-600 flex items-center gap-1">
            <Info className="h-3 w-3" />
            O botão "Cadastrar novo item" no campo acima abre um formulário completo de criação.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DetalheDemandaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [demanda, setDemanda] = useState<Demanda | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [orgaoId, setOrgaoId] = useState('')

  const [itemSelecionado, setItemSelecionado] = useState<ItemSelecionado | null>(null)

  // ── Estado do layout DFD ──────────────────────────────────────────────────
  const [secaoAtiva, setSecaoAtiva] = useState<1 | 2 | 3 | 4>(3)
  const [dialogAdicionar, setDialogAdicionar] = useState(false)
  const [filtroItens, setFiltroItens] = useState('')
  const [tabTipo, setTabTipo] = useState<'MATERIAL' | 'SERVICO'>('MATERIAL')

  // ── Carregar orgaoId e demanda ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const d = localStorage.getItem('orgao')
      if (d) setOrgaoId(JSON.parse(d).id || '')
    } catch { /* ignore */ }
  }, [])

  const carregarDemanda = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/demandas/${id}`)
      if (res.ok) {
        const data = await res.json()
        setDemanda({ ...data, itens: data.itens ?? [] })
      } else {
        router.push('/orgao/demandas')
      }
    } catch {
      router.push('/orgao/demandas')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { carregarDemanda() }, [carregarDemanda])

  // ── Adicionar item ─────────────────────────────────────────────────────────
  const adicionarItem = async (form: FormItemState) => {
    if (!demanda || !itemSelecionado) return
    setSalvando(true)
    try {
      // Classe efetiva: preferir classificação própria selecionada no formulário;
      // fallback para o código do item (pode ser código federal CATMAT/CATSER)
      const codigoClasse = form.codigo_classe || itemSelecionado.codigo_classe
      const nomeClasse = form.nome_classe || itemSelecionado.nome_classe

      // 1. Registrar no catálogo federal se origem = COMPRASGOV
      if (itemSelecionado.fonte === 'COMPRASGOV') {
        await authFetch(`${API_URL}/api/catalogo/importar-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: itemSelecionado.codigo,
            descricao: itemSelecionado.descricao,
            tipo: itemSelecionado.tipo,
            unidade_padrao: itemSelecionado.unidade_padrao,
            codigo_classe: codigoClasse,
            nome_classe: nomeClasse,
            codigo_pdm: itemSelecionado.codigo_pdm,
            nome_pdm: itemSelecionado.nome_pdm,
            descricao_detalhada: itemSelecionado.descricao_detalhada,
            origem: 'COMPRASGOV',
          }),
        })
      }

      // 2. Adicionar item à demanda
      const valorUnitario = parseFloat(form.valor_unitario_estimado) || 0
      const quantidade = parseFloat(form.quantidade_estimada) || 1

      const res = await authFetch(`${API_URL}/api/demandas/${demanda.id}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria: itemSelecionado.tipo,
          codigo_item_catalogo: itemSelecionado.codigo,
          descricao_objeto: itemSelecionado.descricao,
          codigo_classe: codigoClasse,
          nome_classe: nomeClasse,
          quantidade_estimada: quantidade,
          unidade_medida: form.unidade_medida,
          valor_unitario_estimado: valorUnitario,
          valor_total_estimado: valorUnitario * quantidade,
          trimestre_previsto: parseInt(form.trimestre_previsto),
          prioridade: parseInt(form.prioridade),
          renovacao_contrato: form.renovacao_contrato,
          catalogo_utilizado: itemSelecionado.fonte === 'COMPRASGOV' ? 'COMPRASGOV' : 'OUTROS',
        }),
      })

      if (res.ok) {
        setItemSelecionado(null)
        carregarDemanda()
      }
    } finally {
      setSalvando(false)
    }
  }

  // ── Remover item ───────────────────────────────────────────────────────────
  const removerItem = async (itemId: string) => {
    if (!confirm('Remover este item da demanda?')) return
    await authFetch(`${API_URL}/api/demandas/itens/${itemId}`, { method: 'DELETE' })
    carregarDemanda()
  }

  // ── Enviar para aprovação ──────────────────────────────────────────────────
  const enviarParaAprovacao = async () => {
    if (!demanda) return
    setEnviando(true)
    try {
      const res = await authFetch(`${API_URL}/api/demandas/${demanda.id}/enviar`, { method: 'PATCH' })
      if (res.ok) {
        carregarDemanda()
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.message || 'Erro ao enviar demanda')
      }
    } finally {
      setEnviando(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }
  if (!demanda) return null

  const StatusIcon = STATUS_CONFIG[demanda.status]?.icon || FileText
  const podeEditar = demanda.status === 'RASCUNHO'
  const fmt = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
  const totalDemanda = (demanda.itens ?? []).reduce(
    (acc, item) => acc + (Number(item.valor_total_estimado) || 0), 0
  )

  // Seções com status de completude
  const SECOES = [
    { id: 1 as const, titulo: 'Informações Gerais',        icon: Home,      completa: true },
    { id: 2 as const, titulo: 'Justificativa de Necessidade', icon: FileText, completa: !!(demanda.observacoes?.trim()) },
    { id: 3 as const, titulo: 'Materiais/Serviços',        icon: Package,   completa: demanda.itens.length > 0 },
    { id: 4 as const, titulo: 'Responsáveis',              icon: Users,     completa: !!(demanda.responsavel_nome?.trim()) },
  ]

  // Itens filtrados para a tabela
  const itensFiltrados = demanda.itens.filter(item => {
    const filtroOk = !filtroItens || item.descricao_objeto.toLowerCase().includes(filtroItens.toLowerCase()) ||
      (item.codigo_item_catalogo || '').toLowerCase().includes(filtroItens.toLowerCase()) ||
      (item.nome_classe || '').toLowerCase().includes(filtroItens.toLowerCase())
    const tipoOk = item.categoria === tabTipo
    return filtroOk && tipoOk
  })
  const nMateriais = demanda.itens.filter(i => i.categoria === 'MATERIAL').length
  const nServicos  = demanda.itens.filter(i => i.categoria === 'SERVICO').length

  // Agrupamento para prévia do PCA
  // Usa nome_classe normalizado como chave para consolidar itens de origens diferentes
  // (CATMAT federal usa código "7060", catálogo próprio usa "1000" — mas mesmo nome de classe)
  const gruposPCA = (() => {
    const map = new Map<string, { nome: string; valor: number; itens: number }>()
    for (const item of demanda.itens) {
      const nome  = item.nome_classe || item.descricao_objeto || ''
      const chave = nome.trim().toUpperCase() || item.codigo_classe || `sem-classe:${item.id}`
      const atual = map.get(chave) || { nome, valor: 0, itens: 0 }
      atual.valor += Number(item.valor_total_estimado) || 0
      atual.itens += 1
      map.set(chave, atual)
    }
    return Array.from(map.values())
  })()

  const irParaSecao = (s: 1 | 2 | 3 | 4) => setSecaoAtiva(s)
  const secaoAnterior = () => secaoAtiva > 1 && irParaSecao((secaoAtiva - 1) as any)
  const proximaSecao  = () => secaoAtiva < 4 && irParaSecao((secaoAtiva + 1) as any)

  return (
    <div className="flex min-h-screen bg-gray-100">

      {/* ══ SIDEBAR ══════════════════════════════════════════════════════════ */}
      <aside className="w-64 bg-white border-r shadow-sm flex flex-col fixed top-0 left-0 h-full z-20">
        {/* Cabeçalho azul */}
        <div className="bg-blue-700 text-white p-4">
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-3.5 w-3.5 opacity-70" />
            <Users className="h-3.5 w-3.5 opacity-70" />
          </div>
          <h2 className="font-bold text-sm leading-tight">
            Documento de Formalização da Demanda
          </h2>
          <div className="mt-2">
            <span className={`text-xs font-semibold uppercase px-2 py-0.5 rounded ${
              demanda.status === 'RASCUNHO' ? 'bg-blue-600 text-blue-100' :
              demanda.status === 'APROVADA' ? 'bg-green-600 text-white' :
              demanda.status === 'REJEITADA' ? 'bg-red-600 text-white' :
              'bg-blue-500 text-white'
            }`}>
              {STATUS_CONFIG[demanda.status]?.label}
            </span>
          </div>
        </div>

        {/* Navegação de seções */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-400 uppercase px-4 mb-2 tracking-wide">
            Seções do Documento
          </p>
          <div className="space-y-0.5 px-2">
            {SECOES.map(s => {
              const Icon = s.icon
              const ativa = secaoAtiva === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => irParaSecao(s.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors text-left ${
                    ativa
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 ${
                    ativa
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : s.completa
                        ? 'border-green-400 bg-green-50 text-green-600'
                        : 'border-gray-300 text-gray-400'
                  }`}>
                    {s.completa && !ativa ? <Check className="h-3 w-3" /> : s.id}
                  </span>
                  <span className="flex-1 leading-tight">{s.titulo}</span>
                  {s.completa && !ativa && (
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Rodapé: PCA + estimativa */}
        <div className="border-t p-4 bg-gray-50 space-y-1">
          <p className="text-xs text-gray-500">
            PCA <span className="font-semibold text-gray-700">{demanda.ano_referencia}</span>
          </p>
          <p className="text-xs text-gray-500">Estimativa Preliminar deste DFD</p>
          <p className="text-base font-bold text-blue-700">{fmt(totalDemanda)}</p>
        </div>
      </aside>

      {/* ══ CONTEÚDO PRINCIPAL ═══════════════════════════════════════════════ */}
      <main className="ml-64 flex-1 flex flex-col min-h-screen">

        {/* Breadcrumb */}
        <div className="bg-white border-b px-6 py-2.5 flex items-center gap-1.5 text-xs text-gray-500">
          <button onClick={() => router.push('/orgao/demandas')}
            className="hover:text-blue-600 flex items-center gap-1">
            <Home className="h-3.5 w-3.5" />
            Demandas
          </button>
          <ChevronRight className="h-3 w-3" />
          <span className="text-gray-700 font-medium">
            DFD — {demanda.unidade_requisitante}
          </span>
        </div>

        {/* Alerta de rejeição */}
        {demanda.status === 'REJEITADA' && demanda.motivo_rejeicao && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div>
              <span className="font-medium text-red-800 text-sm">Demanda Rejeitada: </span>
              <span className="text-sm text-red-700">{demanda.motivo_rejeicao}</span>
            </div>
          </div>
        )}

        {/* ── Header da seção: navegação + ações ───────────────────────── */}
        <div className="bg-white border-b px-6 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="flex gap-1">
              <button
                onClick={secaoAnterior}
                disabled={secaoAtiva === 1}
                className="w-7 h-7 border rounded flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={proximaSecao}
                disabled={secaoAtiva === 4}
                className="w-7 h-7 border rounded flex items-center justify-center text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <h1 className="font-semibold text-gray-900 text-base">
              {secaoAtiva}. {SECOES[secaoAtiva - 1].titulo}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => router.push('/orgao/demandas')}>
              Voltar
            </Button>
            {podeEditar && (
              <Button
                size="sm"
                onClick={enviarParaAprovacao}
                disabled={enviando || demanda.itens.length === 0}
                className="bg-blue-700 hover:bg-blue-800"
              >
                {enviando
                  ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  : <Send className="h-4 w-4 mr-1.5" />}
                Enviar DFD
              </Button>
            )}
          </div>
        </div>

        {/* ── Conteúdo da seção ────────────────────────────────────────── */}
        <div className="flex-1 p-6">

          {/* ── Seção 1: Informações Gerais ─────────────────────────────── */}
          {secaoAtiva === 1 && (
            <div className="max-w-2xl space-y-4">
              <div className="bg-white rounded-xl border shadow-sm divide-y">
                {[
                  { label: 'Unidade Requisitante', valor: demanda.unidade_requisitante },
                  { label: 'Ano de Referência (PCA)', valor: String(demanda.ano_referencia) },
                  { label: 'Status', valor: STATUS_CONFIG[demanda.status]?.label },
                  { label: 'Data de Criação', valor: new Date(demanda.created_at).toLocaleDateString('pt-BR') },
                ].map(row => (
                  <div key={row.label} className="flex items-center px-5 py-3.5">
                    <span className="text-sm text-gray-500 w-48 shrink-0">{row.label}</span>
                    <span className="text-sm font-medium text-gray-900">{row.valor}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Seção 2: Justificativa ──────────────────────────────────── */}
          {secaoAtiva === 2 && (
            <div className="max-w-2xl">
              <JustificativaDemanda
                demandaId={demanda.id}
                justificativa={demanda.observacoes || ''}
                podeEditar={podeEditar}
                onSalvo={(texto) => setDemanda(d => d ? { ...d, observacoes: texto } : d)}
              />
              <p className="mt-3 text-xs text-gray-400">
                A justificativa fundamenta a necessidade de contratação conforme Art. 18, I — Lei 14.133/2021.
              </p>
            </div>
          )}

          {/* ── Seção 3: Materiais/Serviços ─────────────────────────────── */}
          {secaoAtiva === 3 && (
            <div className="space-y-4">

              {/* Barra superior: busca + adicionar */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1 max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    value={filtroItens}
                    onChange={e => setFiltroItens(e.target.value)}
                    placeholder="Pesquisar por descrição, código ou classe..."
                    className="pl-9 h-9 text-sm"
                  />
                </div>
                {podeEditar && (
                  <Button
                    size="sm"
                    onClick={() => { setItemSelecionado(null); setDialogAdicionar(true) }}
                    className="bg-blue-700 hover:bg-blue-800 whitespace-nowrap"
                  >
                    <Plus className="h-4 w-4 mr-1.5" />
                    Adicionar
                  </Button>
                )}
              </div>

              {/* Tabs Materiais / Serviços */}
              <div className="flex border-b">
                {(['MATERIAL', 'SERVICO'] as const).map(tipo => (
                  <button
                    key={tipo}
                    onClick={() => setTabTipo(tipo)}
                    className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                      tabTipo === tipo
                        ? 'border-blue-600 text-blue-700'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tipo === 'MATERIAL' ? 'Materiais' : 'Serviços'}
                    <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                      tabTipo === tipo ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {tipo === 'MATERIAL' ? nMateriais : nServicos}
                    </span>
                  </button>
                ))}
              </div>

              {/* Tabela de itens */}
              {itensFiltrados.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-200">
                  <Package className="h-10 w-10 mx-auto text-gray-300 mb-3" />
                  <p className="font-medium text-gray-500">
                    {demanda.itens.length === 0
                      ? 'Nenhum item adicionado ainda'
                      : 'Nenhum item encontrado'}
                  </p>
                  {demanda.itens.length === 0 && podeEditar && (
                    <Button size="sm" variant="outline" className="mt-4"
                      onClick={() => { setItemSelecionado(null); setDialogAdicionar(true) }}>
                      <Plus className="h-4 w-4 mr-1.5" /> Adicionar primeiro item
                    </Button>
                  )}
                </div>
              ) : (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-xs text-gray-500 uppercase tracking-wide">
                        <th className="px-4 py-3 text-left font-semibold w-12">Nº</th>
                        <th className="px-4 py-3 text-left font-semibold">Classe</th>
                        <th className="px-4 py-3 text-left font-semibold">Código</th>
                        <th className="px-4 py-3 text-left font-semibold">Descrição</th>
                        <th className="px-4 py-3 text-right font-semibold w-16">Qtd</th>
                        <th className="px-4 py-3 text-right font-semibold w-28">Val. Unit.</th>
                        <th className="px-4 py-3 text-right font-semibold w-28">Val. Total</th>
                        {podeEditar && <th className="px-4 py-3 text-center font-semibold w-20">Ações</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {itensFiltrados.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-400 text-xs">{idx + 1}</td>
                          <td className="px-4 py-3">
                            {item.nome_classe ? (
                              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                                {item.nome_classe}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-400">
                            {item.codigo_item_catalogo || '—'}
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <p className="font-medium text-gray-900 line-clamp-2 text-sm leading-snug">
                              {item.descricao_objeto}
                            </p>
                            {item.trimestre_previsto && (
                              <span className="text-xs text-gray-400">{item.trimestre_previsto}º Trimestre</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {item.quantidade_estimada} {item.unidade_medida}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-700">
                            {fmt(Number(item.valor_unitario_estimado) || 0)}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-blue-700">
                            {fmt(Number(item.valor_total_estimado) || 0)}
                          </td>
                          {podeEditar && (
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => removerItem(item.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                  title="Remover"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                    {/* Rodapé com total */}
                    <tfoot>
                      <tr className="bg-gray-50 border-t-2 border-gray-200">
                        <td colSpan={podeEditar ? 6 : 5} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">
                          Total da Demanda
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-blue-700 text-base">
                          {fmt(totalDemanda)}
                        </td>
                        {podeEditar && <td />}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Prévia PCA */}
              {gruposPCA.length > 0 && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-purple-700 mb-2 flex items-center gap-1.5">
                    <Info className="h-3.5 w-3.5" />
                    Como será consolidado no PCA
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {gruposPCA.map((g, i) => (
                      <div key={i} className="flex justify-between items-center text-xs bg-white rounded-lg p-2.5 border border-purple-100">
                        <span className="font-medium text-gray-700 truncate flex-1 mr-2">{g.nome}</span>
                        <span className="text-gray-400 mr-2 shrink-0">{g.itens} {g.itens === 1 ? 'item' : 'itens'}</span>
                        <span className="font-bold text-purple-700 whitespace-nowrap">{fmt(g.valor)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-purple-500 mt-2">
                    Cada classificação gera 1 linha no PCA — Art. 12, VII — Lei 14.133/2021
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Seção 4: Responsáveis ────────────────────────────────────── */}
          {secaoAtiva === 4 && (
            <div className="max-w-2xl space-y-4">
              <div className="bg-white rounded-xl border shadow-sm p-5 space-y-4">
                <h3 className="font-semibold text-gray-800 text-sm">Dados do Responsável pela Demanda</h3>
                <div className="grid grid-cols-1 gap-3">
                  {[
                    { label: 'Nome', valor: demanda.responsavel_nome },
                    { label: 'E-mail', valor: demanda.responsavel_email },
                    { label: 'Telefone', valor: demanda.responsavel_telefone },
                  ].map(row => (
                    <div key={row.label} className="flex items-center border rounded-lg px-4 py-3 bg-gray-50">
                      <span className="text-xs text-gray-500 w-24 shrink-0">{row.label}</span>
                      <span className="text-sm font-medium text-gray-900">
                        {row.valor || <span className="text-gray-400 italic">Não informado</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </div>{/* /conteudo seção */}
      </main>{/* /main */}

      {/* ══ DIALOG: Adicionar Item ═══════════════════════════════════════════ */}
      <Dialog open={dialogAdicionar} onOpenChange={(open) => {
        setDialogAdicionar(open)
        if (!open) setItemSelecionado(null)
      }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-blue-600" />
              Adicionar Material ou Serviço
            </DialogTitle>
          </DialogHeader>

          {itemSelecionado ? (
            <FormAdicionarItem
              item={itemSelecionado}
              onConfirm={async (form) => {
                await adicionarItem(form)
                setDialogAdicionar(false)
              }}
              onCancelar={() => setItemSelecionado(null)}
              loading={salvando}
            />
          ) : (
            <div className="space-y-4">
              <PainelBusca orgaoId={orgaoId} onSelect={setItemSelecionado} />
              <p className="text-xs text-gray-400 flex gap-1.5">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                Itens com classificação são agrupados no PCA. Itens sem classificação geram item individual.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
