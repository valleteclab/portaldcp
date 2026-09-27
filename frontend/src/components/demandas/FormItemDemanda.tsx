'use client'

/**
 * Formulário do item da demanda (adicionar ou editar): classificação no
 * catálogo do órgão (obrigatória — agrupa no PCA), quantidade (obrigatória),
 * unidade, valor unitário com referência de compras públicas, trimestre e prioridade.
 */
import { useState, useEffect } from 'react'
import { BookOpen, Check, ChevronsUpDown, Loader2, Package, Plus, Save, Wrench, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { API_URL, authFetch } from '@/lib/api'
import { toast } from 'sonner'
import { PRIORIDADE_ITEM, UNIDADES_MEDIDA, fmtMoeda, type FormItemState, type ItemSelecionado } from './tipos'

export function FormItemDemanda({
  item,
  inicial,
  editando = false,
  onConfirm,
  onCancelar,
  loading,
}: {
  item: ItemSelecionado
  /** Valores já gravados (edição de um item da demanda). */
  inicial?: Partial<FormItemState>
  editando?: boolean
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
    ...inicial,
  })
  // Unidade fora da lista padrão (ex.: a do catálogo federal) continua visível e selecionada
  const unidades = UNIDADES_MEDIDA.some(u => u.sigla === form.unidade_medida) || !form.unidade_medida
    ? UNIDADES_MEDIDA
    : [{ sigla: form.unidade_medida, nome: 'unidade do catálogo' }, ...UNIDADES_MEDIDA]
  const [classes, setClasses] = useState<{ id: string; codigo: string; nome: string }[]>([])
  const [classeOpen, setClasseOpen] = useState(false)
  const [buscaClasse, setBuscaClasse] = useState(item.nome_classe || item.codigo_classe || '')
  const [criandoClasse, setCriandoClasse] = useState(false)

  // Preço de referência REAL (compras públicas — dados abertos Compras.gov.br)
  // para o servidor não estimar o valor unitário no chute
  const [precoRef, setPrecoRef] = useState<{ mediana: number; amostras: number } | null>(null)
  const [precoRefLoading, setPrecoRefLoading] = useState(false)
  useEffect(() => {
    if (!item.codigo || item.fonte !== 'COMPRASGOV') return
    setPrecoRefLoading(true)
    authFetch(`${API_URL}/api/fase-interna/preco-referencia?codigo=${encodeURIComponent(item.codigo)}&tipo=${item.tipo}`)
      .then(async (r) => {
        if (!r.ok) return
        const d = await r.json()
        if (d?.encontrado && d.mediana > 0) setPrecoRef({ mediana: d.mediana, amostras: d.amostras || 0 })
      })
      .catch(() => { /* referência é opcional */ })
      .finally(() => setPrecoRefLoading(false))
  }, [item.codigo, item.tipo, item.fonte])

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
      toast.error('Não foi possível criar a classificação agora. Tente novamente.')
    } finally {
      setCriandoClasse(false)
    }
  }

  const valor = parseFloat(form.valor_unitario_estimado) || 0
  const qtd = parseFloat(form.quantidade_estimada) || 0
  const total = valor * qtd

  const fonteLabel: Record<string, string> = {
    COMPRASGOV: 'CATMAT/CATSER',
    PROPRIO: 'Catálogo próprio',
    NOVO: 'Novo item',
  }
  const fonteCor: Record<string, string> = {
    COMPRASGOV: 'bg-green-50 text-green-700 border-green-200',
    PROPRIO: 'bg-blue-50 text-blue-700 border-blue-200',
    NOVO: 'bg-purple-50 text-purple-700 border-purple-200',
  }
  const labelCls = 'block text-sm font-medium text-gray-800 mb-1'

  return (
    <div className="space-y-4">
      {/* Item escolhido no catálogo */}
      <div className="flex items-start gap-3 rounded-lg border bg-slate-50 p-3">
        <div className="shrink-0 mt-0.5">
          {item.tipo === 'MATERIAL'
            ? <Package className="h-5 w-5 text-blue-600" aria-label="Material" />
            : <Wrench className="h-5 w-5 text-purple-600" aria-label="Serviço" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
            <span className="font-semibold text-sm break-words">{item.descricao}</span>
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${fonteCor[item.fonte]}`}>
              {fonteLabel[item.fonte]}
            </span>
          </div>
          {item.codigo && <div className="text-xs text-gray-500 font-mono">{item.codigo}</div>}
        </div>
        {!editando && (
          <button type="button" onClick={onCancelar} className="text-gray-400 hover:text-gray-600 shrink-0" aria-label="Escolher outro item" title="Escolher outro item">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Classificação — vincula o item ao catálogo do órgão e agrupa no PCA */}
      <div>
        <label className={`${labelCls} flex items-center gap-1.5 flex-wrap`}>
          <BookOpen className="h-4 w-4 text-blue-600" aria-hidden="true" />
          Classe do item *
          {!form.codigo_classe && (
            <span className="text-amber-700 font-normal text-xs">necessária para agrupar no PCA</span>
          )}
        </label>
        <Popover open={classeOpen} onOpenChange={setClasseOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`w-full flex items-center justify-between h-9 px-3 rounded-md border text-sm bg-white transition-colors
                ${classeOpen ? 'border-blue-500 ring-1 ring-blue-500' : 'border-input hover:border-gray-300'}
                ${!form.codigo_classe ? 'text-amber-800 border-amber-300 bg-amber-50' : 'text-gray-900'}`}
            >
              <span className="flex items-center gap-2 truncate">
                {form.codigo_classe ? (
                  <>
                    <span className="font-mono text-xs text-gray-500 shrink-0">{form.codigo_classe}</span>
                    <span className="truncate">{classeSelecionada?.nome || form.nome_classe || '—'}</span>
                  </>
                ) : (
                  <span>Selecione a classe…</span>
                )}
              </span>
              <ChevronsUpDown className="h-4 w-4 text-gray-400 shrink-0 ml-2" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-[min(400px,calc(100vw-2rem))] p-0" align="start">
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
                      <span className="font-mono text-xs text-gray-500 shrink-0 w-14">{c.codigo}</span>
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
                        Criar nova classificação: &quot;{termoNovaClasse}&quot;
                      </span>
                    </CommandItem>
                  )}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <p className={`mt-1 text-xs flex items-center gap-1 ${form.codigo_classe ? 'text-green-700' : 'text-gray-600'}`}>
          {form.codigo_classe && <Check className="h-3 w-3" aria-hidden="true" />}
          {form.codigo_classe
            ? 'Itens desta classe viram 1 linha no PCA.'
            : 'A classe junta itens parecidos numa linha do PCA (ex.: “Mobiliário”).'}
        </p>
      </div>

      {/* Quantidade, unidade, valor e prazo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="item-qtd" className={labelCls}>Quantidade *</label>
          <Input id="item-qtd" type="number" min="1" value={form.quantidade_estimada}
            onChange={e => setForm({ ...form, quantidade_estimada: e.target.value })}
            className="h-9 bg-white" />
        </div>
        <div>
          <label htmlFor="item-unidade" className={labelCls}>Unidade</label>
          <Select value={form.unidade_medida} onValueChange={v => setForm({ ...form, unidade_medida: v })}>
            <SelectTrigger id="item-unidade" className="h-9 w-full bg-white"><SelectValue placeholder="Selecione…" /></SelectTrigger>
            <SelectContent>
              {unidades.map(u => (
                <SelectItem key={u.sigla} value={u.sigla}>{u.sigla} — {u.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label htmlFor="item-valor" className={`${labelCls} flex items-center gap-2`}>
            Valor unitário estimado (R$)
            {precoRefLoading && <Loader2 className="h-3 w-3 animate-spin text-gray-400" aria-label="Buscando referência" />}
          </label>
          <Input id="item-valor" type="number" min="0" step="0.01" value={form.valor_unitario_estimado}
            onChange={e => setForm({ ...form, valor_unitario_estimado: e.target.value })}
            placeholder="0,00" className="h-9 bg-white" />
          {precoRef && (
            <button
              type="button"
              onClick={() => setForm({ ...form, valor_unitario_estimado: String(precoRef.mediana) })}
              className="mt-1 text-xs text-[#1351b4] hover:underline text-left"
              title="Mediana de compras públicas reais (dados abertos do Compras.gov.br) — clique para usar"
            >
              Referência: R$ {precoRef.mediana.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (mediana de {precoRef.amostras} compras públicas) — usar
            </button>
          )}
        </div>
        <div>
          <label htmlFor="item-trimestre" className={labelCls}>Para quando (trimestre)</label>
          <Select value={form.trimestre_previsto} onValueChange={v => setForm({ ...form, trimestre_previsto: v })}>
            <SelectTrigger id="item-trimestre" className="h-9 w-full bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1º trimestre (jan–mar)</SelectItem>
              <SelectItem value="2">2º trimestre (abr–jun)</SelectItem>
              <SelectItem value="3">3º trimestre (jul–set)</SelectItem>
              <SelectItem value="4">4º trimestre (out–dez)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <fieldset>
        <legend className={labelCls}>Prioridade</legend>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
          {[1, 2, 3, 4, 5].map(p => (
            <button key={p} type="button"
              aria-pressed={form.prioridade === String(p)}
              onClick={() => setForm({ ...form, prioridade: String(p) })}
              className={`py-1.5 rounded-md text-xs font-medium transition-colors border ${
                form.prioridade === String(p)
                  ? 'bg-blue-700 text-white border-blue-700'
                  : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
              }`}
            >
              {PRIORIDADE_ITEM[p]?.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-gray-700">
          Total estimado do item: <span className="font-semibold text-gray-900">{fmtMoeda(total)}</span>
        </p>
        <div className="flex gap-2 ml-auto">
          <Button type="button" variant="outline" onClick={onCancelar}>Cancelar</Button>
          <Button type="button" onClick={() => onConfirm(form)}
            disabled={loading || !form.codigo_classe || !form.quantidade_estimada || parseFloat(form.quantidade_estimada) <= 0}>
            {loading
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : editando ? <Save className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
            {editando ? 'Salvar alterações' : 'Adicionar à demanda'}
          </Button>
        </div>
      </div>
    </div>
  )
}

