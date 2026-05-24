'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Package, Wrench, Trash2, Send, Search, Loader2,
  CheckCircle, XCircle, Clock, FileText, AlertCircle, BookOpen,
  Plus, Check, X, ChevronRight, Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
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

interface ItemCatalogoFederal {
  id: string
  codigo: string
  descricao: string
  tipo: 'MATERIAL' | 'SERVICO'
  unidade_padrao?: string
  codigo_classe?: string
  nome_classe?: string
  classe?: { codigo: string; nome: string }
}

// ─── Config status ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cor: string; icon: any }> = {
  RASCUNHO:    { label: 'Rascunho',     cor: 'bg-gray-100 text-gray-700',   icon: FileText },
  ENVIADA:     { label: 'Enviada',      cor: 'bg-blue-100 text-blue-700',   icon: Send },
  EM_ANALISE:  { label: 'Em Análise',   cor: 'bg-yellow-100 text-yellow-700', icon: Clock },
  APROVADA:    { label: 'Aprovada',     cor: 'bg-green-100 text-green-700', icon: CheckCircle },
  REJEITADA:   { label: 'Rejeitada',    cor: 'bg-red-100 text-red-700',     icon: XCircle },
  CONSOLIDADA: { label: 'Consolidada',  cor: 'bg-purple-100 text-purple-700', icon: CheckCircle },
}

const PRIORIDADE_CONFIG: Record<number, { label: string; cor: string }> = {
  1: { label: 'Muito Alta', cor: 'text-red-600' },
  2: { label: 'Alta',       cor: 'text-orange-500' },
  3: { label: 'Média',      cor: 'text-yellow-600' },
  4: { label: 'Baixa',      cor: 'text-blue-500' },
  5: { label: 'Muito Baixa', cor: 'text-gray-400' },
}

// ─── Componente de busca CATMAT/CATSER inline ─────────────────────────────────

function BuscaCatalogoFederal({
  onSelectItem,
}: {
  onSelectItem: (item: ItemCatalogoFederal) => void
}) {
  const [termo, setTermo] = useState('')
  const [tipo, setTipo] = useState<'all' | 'MATERIAL' | 'SERVICO'>('all')
  const [resultados, setResultados] = useState<ItemCatalogoFederal[]>([])
  const [loading, setLoading] = useState(false)
  const [buscado, setBuscado] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const buscar = useCallback(async (t: string, tp: string) => {
    if (t.trim().length < 2) { setResultados([]); setBuscado(false); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ termo: t, limite: '30' })
      if (tp !== 'all') params.set('tipo', tp)
      const res = await authFetch(`${API_URL}/api/catalogo/itens?${params}`)
      if (res.ok) {
        const data = await res.json()
        setResultados(Array.isArray(data) ? data : (data.dados ?? []))
      }
    } catch { /* silencioso */ } finally {
      setLoading(false)
      setBuscado(true)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => buscar(termo, tipo), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [termo, tipo, buscar])

  return (
    <div className="space-y-3">
      {/* Campo de busca */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={termo}
            onChange={e => setTermo(e.target.value)}
            placeholder="Buscar no CATMAT/CATSER (código ou descrição)..."
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

      {/* Resultados */}
      {buscado && resultados.length === 0 && !loading && (
        <div className="text-center py-6 text-gray-400 bg-gray-50 rounded-lg text-sm">
          Nenhum item encontrado. Tente outro termo ou categoria.
        </div>
      )}

      {resultados.length > 0 && (
        <div className="border rounded-lg divide-y max-h-72 overflow-y-auto bg-white shadow-sm">
          {resultados.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectItem(item)}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 text-left transition-colors group"
            >
              <div className="shrink-0">
                {item.tipo === 'MATERIAL'
                  ? <Package className="h-5 w-5 text-blue-500" />
                  : <Wrench className="h-5 w-5 text-purple-500" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-900 truncate">{item.descricao}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono text-xs text-gray-400">{item.codigo}</span>
                  {item.classe?.nome && (
                    <span className="text-xs text-gray-400">· {item.classe.nome}</span>
                  )}
                  {item.unidade_padrao && (
                    <Badge variant="outline" className="text-xs py-0">{item.unidade_padrao}</Badge>
                  )}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-blue-500 shrink-0" />
            </button>
          ))}
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
  justificativa: string
  renovacao_contrato: boolean
}

function FormAdicionarItem({
  itemSelecionado,
  onConfirm,
  onCancelar,
  loading,
}: {
  itemSelecionado: ItemCatalogoFederal
  onConfirm: (form: FormItemState) => void
  onCancelar: () => void
  loading: boolean
}) {
  const [form, setForm] = useState<FormItemState>({
    quantidade_estimada: '1',
    unidade_medida: itemSelecionado.unidade_padrao || 'UN',
    valor_unitario_estimado: '',
    trimestre_previsto: '1',
    prioridade: '3',
    justificativa: '',
    renovacao_contrato: false,
  })

  const valor = parseFloat(form.valor_unitario_estimado) || 0
  const qtd = parseFloat(form.quantidade_estimada) || 0
  const total = valor * qtd

  const formatarMoeda = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  return (
    <div className="border-2 border-blue-200 rounded-xl p-5 bg-blue-50 space-y-4">
      {/* Item selecionado */}
      <div className="flex items-start gap-3 bg-white rounded-lg p-3 border border-blue-100">
        <div className="shrink-0 mt-0.5">
          {itemSelecionado.tipo === 'MATERIAL'
            ? <Package className="h-5 w-5 text-blue-500" />
            : <Wrench className="h-5 w-5 text-purple-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm">{itemSelecionado.descricao}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            <span className="font-mono">{itemSelecionado.codigo}</span>
            {itemSelecionado.classe?.nome && (
              <span> · {itemSelecionado.classe.nome}</span>
            )}
          </div>
        </div>
        <button onClick={onCancelar} className="text-gray-400 hover:text-gray-600">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Campos do item */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Quantidade *</label>
          <Input
            type="number"
            min="1"
            step="1"
            value={form.quantidade_estimada}
            onChange={e => setForm({ ...form, quantidade_estimada: e.target.value })}
            className="h-9 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Unidade</label>
          <Select value={form.unidade_medida} onValueChange={v => setForm({ ...form, unidade_medida: v })}>
            <SelectTrigger className="h-9 bg-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['UN', 'MES', 'HR', 'KG', 'M', 'M2', 'M3', 'L', 'CX', 'PCT', 'RL', 'SV'].map(u => (
                <SelectItem key={u} value={u}>{u}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Valor Unitário (R$)</label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.valor_unitario_estimado}
            onChange={e => setForm({ ...form, valor_unitario_estimado: e.target.value })}
            placeholder="0,00"
            className="h-9 bg-white"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Trimestre Previsto</label>
          <Select value={form.trimestre_previsto} onValueChange={v => setForm({ ...form, trimestre_previsto: v })}>
            <SelectTrigger className="h-9 bg-white">
              <SelectValue />
            </SelectTrigger>
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
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map(p => (
            <button
              key={p}
              type="button"
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

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Justificativa <span className="text-gray-400">(Art. 6º, XXIII — necessidade da contratação)</span>
        </label>
        <Textarea
          value={form.justificativa}
          onChange={e => setForm({ ...form, justificativa: e.target.value })}
          placeholder="Descreva a necessidade e justificativa para esta contratação..."
          rows={3}
          className="bg-white text-sm"
        />
      </div>

      {/* Total calculado */}
      {total > 0 && (
        <div className="bg-white rounded-lg p-3 border border-blue-100 flex justify-between items-center">
          <span className="text-sm text-gray-600">Valor Total Estimado</span>
          <span className="font-bold text-blue-700 text-lg">{formatarMoeda(total)}</span>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onCancelar} className="flex-1" size="sm">
          Cancelar
        </Button>
        <Button
          onClick={() => onConfirm(form)}
          disabled={loading || !form.justificativa.trim()}
          className="flex-1 bg-blue-600 hover:bg-blue-700"
          size="sm"
        >
          {loading
            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            : <Plus className="h-4 w-4 mr-2" />}
          Adicionar à Demanda
        </Button>
      </div>
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

  const [itemSelecionado, setItemSelecionado] = useState<ItemCatalogoFederal | null>(null)

  // ── Carregar demanda ───────────────────────────────────────────────────────

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
      // 1. Registrar no catálogo próprio automaticamente
      await authFetch(`${API_URL}/api/catalogo/importar-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo: itemSelecionado.codigo,
          descricao: itemSelecionado.descricao,
          tipo: itemSelecionado.tipo,
          unidade_padrao: itemSelecionado.unidade_padrao,
          codigo_classe: itemSelecionado.codigo_classe || itemSelecionado.classe?.codigo,
          origem: 'COMPRASGOV',
        }),
      })

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
          codigo_classe: itemSelecionado.codigo_classe || itemSelecionado.classe?.codigo,
          nome_classe: itemSelecionado.classe?.nome || itemSelecionado.nome_classe,
          quantidade_estimada: quantidade,
          unidade_medida: form.unidade_medida,
          valor_unitario_estimado: valorUnitario,
          valor_total_estimado: valorUnitario * quantidade,
          trimestre_previsto: parseInt(form.trimestre_previsto),
          prioridade: parseInt(form.prioridade),
          justificativa: form.justificativa,
          renovacao_contrato: form.renovacao_contrato,
          catalogo_utilizado: 'COMPRASGOV',
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

  // ── Helpers ────────────────────────────────────────────────────────────────

  const formatarMoeda = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

  const totalDemanda = (demanda?.itens ?? []).reduce(
    (acc, item) => acc + (Number(item.valor_total_estimado) || 0), 0
  )

  const podeEditar = demanda?.status === 'RASCUNHO'

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Cabeçalho ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/orgao/demandas')}
              className="flex items-center gap-1.5 text-gray-500 hover:text-gray-800 transition-colors text-sm"
            >
              <ArrowLeft className="h-4 w-4" />
              Demandas
            </button>
            <div className="h-4 w-px bg-gray-200" />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-gray-900">{demanda.unidade_requisitante}</h1>
                <Badge className={`${STATUS_CONFIG[demanda.status]?.cor} text-xs`}>
                  <StatusIcon className="h-3 w-3 mr-1" />
                  {STATUS_CONFIG[demanda.status]?.label}
                </Badge>
              </div>
              <p className="text-xs text-gray-400">
                Demanda para o PCA {demanda.ano_referencia}
                {demanda.responsavel_nome && ` · ${demanda.responsavel_nome}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Totalizadores */}
            <div className="hidden sm:flex items-center gap-4 text-sm text-right pr-4 border-r">
              <div>
                <div className="text-gray-400 text-xs">Itens</div>
                <div className="font-bold text-gray-900">{demanda.itens.length}</div>
              </div>
              <div>
                <div className="text-gray-400 text-xs">Valor Total</div>
                <div className="font-bold text-blue-600">{formatarMoeda(totalDemanda)}</div>
              </div>
            </div>

            {podeEditar && (
              <Button
                onClick={enviarParaAprovacao}
                disabled={enviando || demanda.itens.length === 0}
                className="bg-blue-700 hover:bg-blue-800 text-white"
                size="sm"
              >
                {enviando
                  ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  : <Send className="h-4 w-4 mr-2" />}
                Enviar para Aprovação
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Alerta de rejeição ────────────────────────────────────────── */}
      {demanda.status === 'REJEITADA' && demanda.motivo_rejeicao && (
        <div className="max-w-7xl mx-auto px-6 pt-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-red-800">Demanda Rejeitada</div>
              <p className="text-sm text-red-700">{demanda.motivo_rejeicao}</p>
            </div>
          </div>
        </div>
      )}

      {/* ── Conteúdo principal ───────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Coluna esquerda: Itens da demanda ─────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Itens da Demanda
            </h2>
            {!podeEditar && (
              <Badge className={STATUS_CONFIG[demanda.status]?.cor}>
                {STATUS_CONFIG[demanda.status]?.label}
              </Badge>
            )}
          </div>

          {demanda.itens.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border-2 border-dashed border-gray-200">
              <Package className="h-12 w-12 mx-auto text-gray-300 mb-3" />
              <h3 className="font-medium text-gray-500">Nenhum item adicionado</h3>
              <p className="text-sm text-gray-400 mt-1">
                {podeEditar
                  ? 'Busque itens no CATMAT/CATSER ao lado para adicionar à demanda'
                  : 'Esta demanda não possui itens'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {demanda.itens.map((item, idx) => (
                <div key={item.id} className="bg-white rounded-xl border p-4 shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center text-xs font-bold text-blue-600">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            {item.categoria === 'MATERIAL'
                              ? <Package className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                              : <Wrench className="h-3.5 w-3.5 text-purple-500 shrink-0" />}
                            <span className="text-xs font-mono text-gray-400">{item.codigo_item_catalogo}</span>
                            {item.nome_classe && (
                              <span className="text-xs text-gray-400">· {item.nome_classe}</span>
                            )}
                          </div>
                          <p className="font-medium text-sm text-gray-900 leading-snug">
                            {item.descricao_objeto}
                          </p>
                          {item.justificativa && (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.justificativa}</p>
                          )}
                        </div>
                        {podeEditar && (
                          <button
                            onClick={() => removerItem(item.id)}
                            className="text-gray-300 hover:text-red-500 transition-colors shrink-0 p-1"
                            title="Remover item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
                        <span>{item.quantidade_estimada} {item.unidade_medida}</span>
                        <span className="font-medium text-gray-700">
                          {formatarMoeda(Number(item.valor_unitario_estimado) || 0)}/{item.unidade_medida}
                        </span>
                        <span className="font-bold text-blue-600">
                          = {formatarMoeda(Number(item.valor_total_estimado) || 0)}
                        </span>
                        {item.trimestre_previsto && (
                          <Badge variant="outline" className="text-xs py-0">
                            {item.trimestre_previsto}º Trim.
                          </Badge>
                        )}
                        <span className={`font-medium ${PRIORIDADE_CONFIG[item.prioridade]?.cor}`}>
                          {PRIORIDADE_CONFIG[item.prioridade]?.label}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {/* Total */}
              <div className="bg-blue-700 text-white rounded-xl p-4 flex justify-between items-center">
                <span className="font-medium">Valor Total da Demanda</span>
                <span className="text-xl font-bold">{formatarMoeda(totalDemanda)}</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Coluna direita: Busca CATMAT/CATSER ───────────────────── */}
        {podeEditar ? (
          <div>
            <h2 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
              <Search className="h-4 w-4" />
              Adicionar Item
              <span className="font-normal text-xs text-gray-400 ml-1">via CATMAT / CATSER</span>
            </h2>

            {itemSelecionado ? (
              <FormAdicionarItem
                itemSelecionado={itemSelecionado}
                onConfirm={adicionarItem}
                onCancelar={() => setItemSelecionado(null)}
                loading={salvando}
              />
            ) : (
              <div className="bg-white rounded-xl border p-5 shadow-sm space-y-4">
                <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>
                    Busque pelo código ou descrição do item no catálogo federal.
                    O item será automaticamente cadastrado no catálogo do órgão.
                  </span>
                </div>

                <BuscaCatalogoFederal onSelectItem={setItemSelecionado} />
              </div>
            )}

            {/* Dica legal */}
            <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-500 flex gap-2">
              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>
                A utilização do CATMAT/CATSER é obrigatória para padronização conforme
                Art. 4º do Decreto 9.488/2018. A justificativa de cada item integra o DFD
                (Art. 18, I da Lei 14.133/2021).
              </span>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-400 py-16">
              <Check className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">Demanda {STATUS_CONFIG[demanda.status]?.label}</p>
              <p className="text-sm mt-1">Esta demanda não está mais em edição.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
