'use client'

/**
 * Gerenciador de Lotes - Lei 14.133/2021, Art. 40, §3º
 * "O parcelamento será adotado quando técnica e economicamente viável"
 */

import { useState, useEffect, useMemo, useCallback, memo } from 'react'
import { 
  Package, Plus, Trash2, Edit2, ChevronDown, ChevronRight,
  Link2, AlertCircle, FileText, Building2, GripVertical, MoreVertical,
  Search, Loader2, X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Switch } from '@/components/ui/switch'
import { LoteLicitacao, ItemLicitacao, ItemPCA, UNIDADES } from './types'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Formatador de valor (fora do componente para evitar recriação)
const formatador = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const formatarValorGlobal = (valor: number) => formatador.format(valor)

// Input de valor com seleção automática ao focar
const InputValor = memo(function InputValor({ 
  value, onChange, label, className 
}: { 
  value: number
  onChange: (v: number) => void
  label?: string
  className?: string 
}) {
  return (
    <div className={className}>
      {label && <Label>{label}</Label>}
      <Input 
        type="number" 
        min={0} 
        step="0.01"
        value={value} 
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)} 
        onFocus={(e) => e.target.select()}
        className="mt-1" 
      />
    </div>
  )
})

// Componente isolado para o modal de adicionar item (evita re-renders do componente pai)
const ModalAdicionarItem = memo(function ModalAdicionarItem({
  open, onOpenChange, loteAtual, onAdicionar, proximoNumeroItem
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  loteAtual: LoteLicitacao | null
  onAdicionar: (item: ItemLicitacao) => void
  proximoNumeroItem: number
}) {
  const [modo, setModo] = useState<'manual' | 'catalogo'>('manual')
  const [descricao, setDescricao] = useState('')
  const [quantidade, setQuantidade] = useState(1)
  const [unidade, setUnidade] = useState('UNIDADE')
  const [valorUnitarioStr, setValorUnitarioStr] = useState('')
  
  // Estado para busca no catálogo via API
  const [itensCatalogo, setItensCatalogo] = useState<any[]>([])
  const [totalCatalogo, setTotalCatalogo] = useState(0)
  const [itemSelecionado, setItemSelecionado] = useState<any>(null)
  const [buscaCatalogo, setBuscaCatalogo] = useState('')
  const [tipoCatalogo, setTipoCatalogo] = useState<'MATERIAL' | 'SERVICO'>('MATERIAL')
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [paginaCatalogo, setPaginaCatalogo] = useState(1)

  const parseValor = (str: string): number => {
    if (!str) return 0
    return parseFloat(str.replace(',', '.')) || 0
  }
  const valorUnitario = parseValor(valorUnitarioStr)

  // Busca no catálogo via API
  const buscarNoCatalogo = async (termo: string, pagina: number = 1) => {
    if (!termo || termo.length < 3) {
      setItensCatalogo([])
      setTotalCatalogo(0)
      return
    }
    
    setLoadingCatalogo(true)
    try {
      const params = new URLSearchParams({
        termo,
        tipo: tipoCatalogo,
        limite: '50',
        offset: String((pagina - 1) * 50)
      })
      
      const res = await fetch(`${API_URL}/api/catalogo/buscar?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        if (pagina === 1) {
          setItensCatalogo(data.itens || [])
        } else {
          setItensCatalogo(prev => [...prev, ...(data.itens || [])])
        }
        setTotalCatalogo(data.total || 0)
        setPaginaCatalogo(pagina)
      }
    } catch (error) {
      console.error('Erro ao buscar no catálogo:', error)
    } finally {
      setLoadingCatalogo(false)
    }
  }

  // Debounce para busca automática
  useEffect(() => {
    if (modo !== 'catalogo') return
    
    const timer = setTimeout(() => {
      if (buscaCatalogo.length >= 3) {
        setPaginaCatalogo(1)
        buscarNoCatalogo(buscaCatalogo, 1)
      } else {
        setItensCatalogo([])
        setTotalCatalogo(0)
      }
    }, 400)

    return () => clearTimeout(timer)
  }, [buscaCatalogo, tipoCatalogo, modo])

  const carregarMaisCatalogo = () => {
    if (itensCatalogo.length < totalCatalogo && !loadingCatalogo) {
      buscarNoCatalogo(buscaCatalogo, paginaCatalogo + 1)
    }
  }

  const selecionarItemCatalogo = (item: any) => {
    setItemSelecionado(item)
    setDescricao(item.descricao || '')
    setUnidade(item.unidade_padrao || 'UNIDADE')
    setValorUnitarioStr('')
    setQuantidade(1)
  }

  const handleAdicionar = () => {
    if (!loteAtual || !descricao.trim()) return
    
    // Debug: log do item selecionado do catálogo
    if (itemSelecionado) {
      console.log('Item do catálogo selecionado:', {
        codigo: itemSelecionado.codigo,
        tipo: itemSelecionado.tipo,
        nome_classe: itemSelecionado.nome_classe,
        codigo_pdm: itemSelecionado.codigo_pdm,
        nome_pdm: itemSelecionado.nome_pdm,
        codigo_grupo: itemSelecionado.codigo_grupo,
        nome_grupo: itemSelecionado.nome_grupo
      })
    }
    
    const item: ItemLicitacao = {
      numero: proximoNumeroItem,
      descricao,
      quantidade,
      unidade,
      valor_unitario: valorUnitario,
      lote_id: loteAtual.id,
      lote_numero: loteAtual.numero,
      item_pca_id: loteAtual.item_pca_id,
      item_pca_descricao: loteAtual.item_pca?.descricao_objeto,
      item_pca_ano: loteAtual.item_pca?.pca?.ano_exercicio,
      item_pca_categoria: loteAtual.item_pca?.categoria,
      sem_pca: loteAtual.sem_pca,
      justificativa_sem_pca: loteAtual.justificativa_sem_pca,
      // Dados do catálogo (compras.gov.br)
      codigo_catalogo: itemSelecionado?.codigo,
      classe_catalogo: itemSelecionado?.nome_classe,
      codigo_catmat: itemSelecionado?.tipo === 'MATERIAL' ? itemSelecionado?.codigo : undefined,
      codigo_catser: itemSelecionado?.tipo === 'SERVICO' ? itemSelecionado?.codigo : undefined,
      codigo_pdm: itemSelecionado?.codigo_pdm,
      nome_pdm: itemSelecionado?.nome_pdm,
      codigo_grupo: itemSelecionado?.codigo_grupo,
      nome_grupo: itemSelecionado?.nome_grupo,
    }
    
    // Debug: log do item criado
    console.log('Item criado com campos do catálogo:', {
      codigo_catalogo: item.codigo_catalogo,
      codigo_catmat: item.codigo_catmat,
      codigo_catser: item.codigo_catser,
      classe_catalogo: item.classe_catalogo
    })
    
    onAdicionar(item)
    // Reset
    setDescricao('')
    setQuantidade(1)
    setUnidade('UNIDADE')
    setValorUnitarioStr('')
    setItemSelecionado(null)
    setItensCatalogo([])
    setBuscaCatalogo('')
    setModo('manual')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Adicionar Item ao Lote {loteAtual?.numero}</DialogTitle>
          <DialogDescription>
            {loteAtual?.item_pca ? (
              <span className="text-green-700">Este item herdará o PCA: {loteAtual.item_pca.descricao_objeto}</span>
            ) : (
              <span className="text-yellow-700">Atenção: Este lote ainda não tem PCA vinculado</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs: Manual ou Catálogo */}
        <div className="flex gap-2 border-b pb-2">
          <Button 
            variant={modo === 'manual' ? 'default' : 'ghost'} 
            size="sm"
            onClick={() => setModo('manual')}
          >
            Inserir Manualmente
          </Button>
          <Button 
            variant={modo === 'catalogo' ? 'default' : 'ghost'} 
            size="sm"
            onClick={() => setModo('catalogo')}
          >
            <Search className="h-4 w-4 mr-2" />
            Buscar no Catálogo
          </Button>
        </div>

        {modo === 'catalogo' ? (
          <div className="flex-1 flex flex-col space-y-3 overflow-hidden">
            {/* Busca */}
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <Label className="text-xs">Buscar item</Label>
                <div className="relative">
                  <Input
                    placeholder="Digite para buscar (mín. 3 caracteres)..."
                    value={buscaCatalogo}
                    onChange={(e) => setBuscaCatalogo(e.target.value)}
                    className="pr-10"
                    autoFocus
                  />
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {loadingCatalogo ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Search className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <Select value={tipoCatalogo} onValueChange={(v: 'MATERIAL' | 'SERVICO') => setTipoCatalogo(v)}>
                  <SelectTrigger className="w-[130px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MATERIAL">Material</SelectItem>
                    <SelectItem value="SERVICO">Serviço</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Resultados */}
            <div className="flex-1 overflow-y-auto border rounded-lg min-h-[200px]">
              {loadingCatalogo && itensCatalogo.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                </div>
              ) : itensCatalogo.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Digite para buscar itens no catálogo</p>
                  <p className="text-sm">Mínimo 3 caracteres</p>
                </div>
              ) : (
                <div className="divide-y">
                  {itensCatalogo.map((item) => (
                    <div 
                      key={item.id}
                      className={`p-3 hover:bg-slate-50 cursor-pointer ${
                        itemSelecionado?.id === item.id ? 'bg-green-50 border-l-4 border-green-500' : ''
                      }`}
                      onClick={() => selecionarItemCatalogo(item)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <Badge variant="outline" className="text-xs mb-1">{item.codigo}</Badge>
                          <p className="text-sm line-clamp-2">{item.descricao}</p>
                        </div>
                        {itemSelecionado?.id === item.id && (
                          <Package className="h-5 w-5 text-green-600 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Contador e carregar mais */}
            {totalCatalogo > 0 && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {itensCatalogo.length} de {totalCatalogo} resultados
                </p>
                {itensCatalogo.length < totalCatalogo && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={carregarMaisCatalogo}
                    disabled={loadingCatalogo}
                  >
                    {loadingCatalogo && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                    Carregar mais
                  </Button>
                )}
              </div>
            )}

            {/* Formulário quando item selecionado */}
            {itemSelecionado && (
              <div className="border-t pt-3 space-y-3">
                <div className="bg-green-50 p-2 rounded-lg">
                  <p className="font-medium text-green-800 text-sm">Selecionado: {itemSelecionado.codigo}</p>
                  <p className="text-xs text-green-700 line-clamp-1">{itemSelecionado.descricao}</p>
                </div>
                
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs">Quantidade *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={quantidade}
                      onChange={(e) => setQuantidade(Number(e.target.value) || 1)}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Unidade</Label>
                    <Select value={unidade} onValueChange={setUnidade}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {UNIDADES.map(u => (
                          <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Valor Unitário *</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={valorUnitarioStr}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val === '' || /^[\d.,]*$/.test(val)) {
                          setValorUnitarioStr(val)
                        }
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Total</Label>
                    <div className="h-10 flex items-center px-3 bg-slate-100 rounded-md font-medium text-green-600">
                      {formatarValorGlobal(quantidade * valorUnitario)}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <Label>Descrição do Item *</Label>
              <Input 
                value={descricao} 
                onChange={(e) => setDescricao(e.target.value)} 
                onFocus={(e) => e.target.select()}
                placeholder="Ex: Notebook Dell Latitude 5520" 
                className="mt-1" 
              />
              {itemSelecionado && (
                <p className="text-xs text-green-600 mt-1">
                  Importado do catálogo: {itemSelecionado.codigo}
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Quantidade *</Label>
                <Input 
                  type="number" 
                  min={1} 
                  value={quantidade} 
                  onChange={(e) => setQuantidade(parseInt(e.target.value) || 1)} 
                  onFocus={(e) => e.target.select()}
                  className="mt-1" 
                />
              </div>
              <div>
                <Label>Unidade</Label>
                <Select value={unidade} onValueChange={setUnidade}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {UNIDADES.map(u => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Valor Unitário (R$) *</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valorUnitarioStr}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '' || /^[\d.,]*$/.test(val)) {
                      setValorUnitarioStr(val)
                    }
                  }}
                  className="mt-1"
                />
              </div>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <span className="font-medium">Valor Total: </span>
                {formatarValorGlobal(quantidade * valorUnitario)}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button 
            onClick={handleAdicionar} 
            disabled={!descricao.trim() || valorUnitario <= 0}
            className="bg-green-600 hover:bg-green-700"
          >
            Adicionar Item
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
})

interface LotesManagerProps {
  lotes: LoteLicitacao[]
  itens: ItemLicitacao[]
  itensPca: ItemPCA[]
  onLotesChange: (lotes: LoteLicitacao[]) => void
  onItensChange: (itens: ItemLicitacao[]) => void
  onLoadItensPca: () => void
  orgaoId?: string
  disabled?: boolean
  enviadoPncp?: boolean // Se true, bloqueia exclusão de itens (PNCP não permite deletar)
}

export function LotesManager({
  lotes, itens, itensPca, onLotesChange, onItensChange, onLoadItensPca, orgaoId, disabled = false, enviadoPncp = false
}: LotesManagerProps) {
  const [modalNovoLote, setModalNovoLote] = useState(false)
  const [modalEditarLote, setModalEditarLote] = useState(false)
  const [modalVincularPca, setModalVincularPca] = useState(false)
  const [modalAdicionarItem, setModalAdicionarItem] = useState(false)
  const [modalEditarItem, setModalEditarItem] = useState(false)
  const [itemEmEdicao, setItemEmEdicao] = useState<ItemLicitacao | null>(null)
  const [loteAtual, setLoteAtual] = useState<LoteLicitacao | null>(null)
  const [lotesExpandidos, setLotesExpandidos] = useState<Set<number>>(new Set([1]))
  const [novoLote, setNovoLote] = useState({ descricao: '', exclusivo_mpe: false, percentual_cota_reservada: 0 })
  
  // Filtros do PCA no modal
  const [pcaFiltroAno, setPcaFiltroAno] = useState<number>(new Date().getFullYear())
  const [pcaFiltroTipo, setPcaFiltroTipo] = useState<string>('TODOS')
  const [pcaFiltroBusca, setPcaFiltroBusca] = useState('')
  const [itensPcaLocal, setItensPcaLocal] = useState<ItemPCA[]>([])
  const [loadingPca, setLoadingPca] = useState(false)

  // Memoizar cálculos para evitar recálculos desnecessários
  const proximoNumeroLote = useMemo(() => Math.max(...lotes.map(l => l.numero), 0) + 1, [lotes])
  const proximoNumeroItem = useMemo(() => Math.max(...itens.map(i => i.numero), 0) + 1, [itens])
  // Item sem lote = não tem lote_id E não tem lote_numero
  const itensSemLote = useMemo(() => itens.filter(item => !item.lote_id && !item.lote_numero), [itens])

  // Carregar itens do PCA
  const carregarItensPca = async () => {
    if (!orgaoId) return
    setLoadingPca(true)
    try {
      const res = await fetch(`${API_URL}/api/itens/pca/disponiveis/${orgaoId}`)
      if (res.ok) {
        const data = await res.json()
        setItensPcaLocal(data)
      }
    } catch (error) {
      console.error('Erro ao carregar itens do PCA:', error)
    } finally {
      setLoadingPca(false)
    }
  }

  // Filtrar itens do PCA (memoizado)
  const itensPcaFiltrados = useMemo(() => itensPcaLocal.filter(item => {
    if (pcaFiltroAno && item.pca?.ano_exercicio !== pcaFiltroAno) return false
    if (pcaFiltroTipo && pcaFiltroTipo !== 'TODOS' && item.categoria !== pcaFiltroTipo) return false
    if (pcaFiltroBusca) {
      const busca = pcaFiltroBusca.toLowerCase()
      if (!item.descricao_objeto.toLowerCase().includes(busca) && 
          !item.nome_classe?.toLowerCase().includes(busca)) return false
    }
    return true
  }), [itensPcaLocal, pcaFiltroAno, pcaFiltroTipo, pcaFiltroBusca])

  const toggleLoteExpandido = (numero: number) => {
    const novos = new Set(lotesExpandidos)
    novos.has(numero) ? novos.delete(numero) : novos.add(numero)
    setLotesExpandidos(novos)
  }

  const criarLote = () => {
    if (!novoLote.descricao?.trim()) return
    const lote: LoteLicitacao = {
      id: `temp-${Date.now()}`,
      numero: proximoNumeroLote,
      descricao: novoLote.descricao,
      exclusivo_mpe: novoLote.exclusivo_mpe,
      percentual_cota_reservada: novoLote.percentual_cota_reservada,
      valor_total_estimado: 0,
      quantidade_itens: 0,
      status: 'RASCUNHO',
      itens: []
    }
    onLotesChange([...lotes, lote])
    setModalNovoLote(false)
    setNovoLote({ descricao: '', exclusivo_mpe: false, percentual_cota_reservada: 0 })
    setLotesExpandidos(new Set([...lotesExpandidos, lote.numero]))
  }

  const editarLote = () => {
    if (!loteAtual) return
    onLotesChange(lotes.map(l => l.numero === loteAtual.numero ? loteAtual : l))
    setModalEditarLote(false)
    setLoteAtual(null)
  }

  // REGRA PNCP: Não permite excluir lotes com itens após envio ao PNCP
  const excluirLote = (lote: LoteLicitacao) => {
    const itensDoLote = itens.filter(i => i.lote_numero === lote.numero || i.lote_id === lote.id)
    
    if (enviadoPncp && itensDoLote.length > 0) {
      alert('⚠️ Não é possível excluir lotes com itens de uma licitação já enviada ao PNCP.\n\nA API do PNCP não permite exclusão de itens. Você pode apenas retificar os itens existentes.')
      return
    }
    
    if (!confirm(`Deseja realmente excluir o Lote ${lote.numero}?${itensDoLote.length > 0 ? `\n\nOs ${itensDoLote.length} item(ns) serão desvinculados do lote.` : ''}`)) return
    
    onItensChange(itens.map(item => 
      item.lote_id === lote.id ? { ...item, lote_id: undefined, lote_numero: undefined } : item
    ))
    onLotesChange(lotes.filter(l => l.numero !== lote.numero))
  }

  const adicionarItemAoLote = (item: ItemLicitacao, lote: LoteLicitacao) => {
    const itensAtualizados = itens.map(i => {
      if (i.numero === item.numero) {
        return { 
          ...i, lote_id: lote.id, lote_numero: lote.numero,
          item_pca_id: lote.item_pca_id || i.item_pca_id,
          item_pca_descricao: lote.item_pca?.descricao_objeto || i.item_pca_descricao,
          item_pca_ano: lote.item_pca?.pca?.ano_exercicio || i.item_pca_ano,
          sem_pca: lote.sem_pca || i.sem_pca,
          justificativa_sem_pca: lote.justificativa_sem_pca || i.justificativa_sem_pca,
        }
      }
      return i
    })
    onItensChange(itensAtualizados)
    recalcularTotaisLote(lote.numero, itensAtualizados)
  }

  const removerItemDoLote = (item: ItemLicitacao) => {
    const itensAtualizados = itens.map(i => 
      i.numero === item.numero ? { ...i, lote_id: undefined, lote_numero: undefined } : i
    )
    onItensChange(itensAtualizados)
    if (item.lote_numero) recalcularTotaisLote(item.lote_numero, itensAtualizados)
  }

  // Abrir modal para editar item
  const abrirModalEditarItem = (item: ItemLicitacao) => {
    setItemEmEdicao({ ...item })
    setModalEditarItem(true)
  }

  // Salvar edição do item
  const salvarEdicaoItem = () => {
    if (!itemEmEdicao) return
    const itensAtualizados = itens.map(i => 
      i.numero === itemEmEdicao.numero ? itemEmEdicao : i
    )
    onItensChange(itensAtualizados)
    if (itemEmEdicao.lote_numero) recalcularTotaisLote(itemEmEdicao.lote_numero, itensAtualizados)
    setModalEditarItem(false)
    setItemEmEdicao(null)
  }

  // Excluir item do lote E da licitação
  // REGRA PNCP: Não permite excluir itens após envio ao PNCP
  const excluirItemDoLote = (item: ItemLicitacao) => {
    if (enviadoPncp) {
      alert('⚠️ Não é possível excluir itens de uma licitação já enviada ao PNCP.\n\nItens já publicados não podem ser removidos, apenas editados (descrição, quantidade, valor).')
      return
    }
    
    if (!confirm(`Deseja realmente excluir o item "${item.descricao}"?`)) return
    
    const itensAtualizados = itens.filter(i => i.numero !== item.numero)
    onItensChange(itensAtualizados)
    if (item.lote_numero) recalcularTotaisLote(item.lote_numero, itensAtualizados)
  }

  const recalcularTotaisLote = (numeroLote: number, itensAtuais: ItemLicitacao[]) => {
    const itensDoLote = itensAtuais.filter(i => i.lote_numero === numeroLote)
    const valorTotal = itensDoLote.reduce((sum, i) => sum + (i.quantidade * i.valor_unitario), 0)
    onLotesChange(lotes.map(l => l.numero === numeroLote ? {
      ...l, valor_total_estimado: valorTotal, quantidade_itens: itensDoLote.length, itens: itensDoLote
    } : l))
  }

  const vincularPcaAoLote = (itemPca: ItemPCA) => {
    if (!loteAtual) return
    onLotesChange(lotes.map(l => l.numero === loteAtual.numero ? {
      ...l, item_pca_id: itemPca.id, item_pca: itemPca, sem_pca: false, justificativa_sem_pca: undefined
    } : l))
    onItensChange(itens.map(item => item.lote_numero === loteAtual.numero ? {
      ...item, item_pca_id: itemPca.id, item_pca_descricao: itemPca.descricao_objeto,
      item_pca_ano: itemPca.pca?.ano_exercicio, item_pca_categoria: itemPca.categoria,
      sem_pca: false, justificativa_sem_pca: undefined
    } : item))
    setModalVincularPca(false)
    setLoteAtual(null)
  }

  // Memoizar formatadores
  const formatarValor = useCallback((valor: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor), [])
  const getIconeCategoria = useCallback((cat?: string) => 
    ({ MATERIAL: '📦', SERVICO: '🔧', OBRA: '🏗️', SOLUCAO_TIC: '💻' }[cat || ''] || '📋'), [])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold">Lotes da Licitação <span className="ml-2 text-sm font-normal text-muted-foreground">(Lei 14.133/2021, Art. 40, §3º)</span></h3>
        </div>
        <Button onClick={() => setModalNovoLote(true)} disabled={disabled} size="sm">
          <Plus className="h-4 w-4 mr-2" /> Novo Lote
        </Button>
      </div>

      {/* Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5" />
          <div>
            <p className="font-medium text-blue-800">Parcelamento do Objeto</p>
            <p className="text-blue-700">Lei 14.133/2021, Art. 40, §3º: "O parcelamento será adotado quando técnica e economicamente viável."</p>
          </div>
        </div>
      </div>

      {/* Lista de Lotes */}
      {lotes.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Nenhum lote criado. Clique em "Novo Lote" para começar.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lotes.map((lote) => {
            const itensDoLote = itens.filter(i => i.lote_numero === lote.numero)
            const isExpandido = lotesExpandidos.has(lote.numero)
            return (
              <Card key={lote.numero} className="overflow-hidden">
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors py-3" onClick={() => toggleLoteExpandido(lote.numero)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isExpandido ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          Lote {lote.numero}: {lote.descricao}
                          {lote.exclusivo_mpe && <Badge variant="secondary" className="text-xs"><Building2 className="h-3 w-3 mr-1" />Exclusivo ME/EPP</Badge>}
                        </CardTitle>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span>{itensDoLote.length} item(ns)</span>
                          <span>{formatarValor(lote.valor_total_estimado || 0)}</span>
                          {lote.item_pca && <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">{getIconeCategoria(lote.item_pca.categoria)} PCA {lote.item_pca.pca?.ano_exercicio}</Badge>}
                          {lote.item_pca && <span className="text-xs text-green-700 ml-2">{lote.item_pca.descricao_objeto}</span>}
                          {lote.sem_pca && <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">⚠️ Sem PCA</Badge>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => { setLoteAtual(lote); setModalEditarLote(true) }}
                        title="Editar Lote"
                        className="h-8 px-2"
                      >
                        <Edit2 className="h-3 w-3 mr-1" />
                        <span className="text-xs">Editar</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => { setLoteAtual(lote); setModalAdicionarItem(true) }}
                        title="Adicionar Item"
                        className="h-8 px-2"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        <span className="text-xs">Item</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => { setLoteAtual(lote); carregarItensPca(); setModalVincularPca(true) }}
                        title="Vincular Classe PCA"
                        className="h-8 px-2"
                      >
                        <Link2 className="h-3 w-3 mr-1" />
                        <span className="text-xs">PCA</span>
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => excluirLote(lote)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                        title="Excluir Lote"
                      >
                        <Trash2 className="h-3 w-3 mr-1" />
                        <span className="text-xs">Excluir</span>
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {isExpandido && (
                  <CardContent className="pt-0 pb-4">
                    {/* Itens do lote */}
                    {itensDoLote.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground text-sm border rounded-lg border-dashed">
                        <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Nenhum item neste lote</p>
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="mt-3"
                          onClick={(e) => { e.stopPropagation(); setLoteAtual(lote); setModalAdicionarItem(true) }}
                        >
                          <Plus className="h-4 w-4 mr-2" /> Adicionar Item
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {itensDoLote.map((item) => (
                          <div key={item.numero} className="p-3 bg-muted/30 rounded-lg">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-2">
                                  <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                                  <div className="flex-1">
                                    <span className="font-medium">Item {item.numero}: </span>
                                    <span className="text-sm break-words">{item.descricao}</span>
                                  </div>
                                </div>
                                {/* Código do catálogo */}
                                {(item.codigo_catmat || item.codigo_catser || item.codigo_catalogo) && (
                                  <div className="ml-6 mt-2 flex flex-wrap items-center gap-2">
                                    {item.codigo_catmat && (
                                      <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                        CATMAT: {item.codigo_catmat}
                                      </Badge>
                                    )}
                                    {item.codigo_catser && (
                                      <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                                        CATSER: {item.codigo_catser}
                                      </Badge>
                                    )}
                                    {/* Fallback: mostrar codigo_catalogo se não tiver CATMAT/CATSER */}
                                    {!item.codigo_catmat && !item.codigo_catser && item.codigo_catalogo && (
                                      <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                                        Catálogo: {item.codigo_catalogo}
                                      </Badge>
                                    )}
                                    {item.classe_catalogo && (
                                      <span className="text-xs text-muted-foreground">{item.classe_catalogo}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <div className="text-right mr-2">
                                  <div className="text-sm text-muted-foreground">{item.quantidade} {item.unidade} x {formatarValor(item.valor_unitario)}</div>
                                  <div className="font-medium text-green-600">{formatarValor(item.quantidade * item.valor_unitario)}</div>
                                </div>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={(e) => { e.stopPropagation(); abrirModalEditarItem(item) }} 
                                  disabled={disabled}
                                  title="Editar item"
                                >
                                  <Edit2 className="h-4 w-4 text-muted-foreground hover:text-blue-600" />
                                </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={(e) => { e.stopPropagation(); excluirItemDoLote(item) }} 
                                  disabled={disabled || enviadoPncp}
                                  title={enviadoPncp ? 'Itens já enviados ao PNCP não podem ser excluídos' : 'Excluir item'}
                                >
                                  <Trash2 className={`h-4 w-4 ${enviadoPncp ? 'text-gray-300' : 'text-muted-foreground hover:text-red-600'}`} />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                        {/* Botão adicionar mais itens */}
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          className="w-full mt-2 border border-dashed"
                          onClick={(e) => { e.stopPropagation(); setLoteAtual(lote); setModalAdicionarItem(true) }}
                        >
                          <Plus className="h-4 w-4 mr-2" /> Adicionar Item ao Lote
                        </Button>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}

      {/* Itens sem lote */}
      {itensSemLote.length > 0 && lotes.length > 0 && (
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardHeader className="py-3">
            <CardTitle className="text-base flex items-center gap-2 text-yellow-800">
              <AlertCircle className="h-4 w-4" /> Itens sem Lote ({itensSemLote.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {itensSemLote.map((item) => (
                <div key={item.numero} className="flex items-center justify-between p-2 bg-white rounded-lg border">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Item {item.numero}:</span>
                    <span className="text-sm truncate max-w-md">{item.descricao}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{formatarValor(item.quantidade * item.valor_unitario)}</span>
                    <Select onValueChange={(value) => {
                      const lote = lotes.find(l => l.numero === parseInt(value))
                      if (lote) adicionarItemAoLote(item, lote)
                    }}>
                      <SelectTrigger className="w-[150px]"><SelectValue placeholder="Mover para lote..." /></SelectTrigger>
                      <SelectContent>
                        {lotes.map((lote) => (
                          <SelectItem key={lote.numero} value={lote.numero.toString()}>Lote {lote.numero}: {lote.descricao}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => abrirModalEditarItem(item)}
                      title="Editar item"
                    >
                      <Edit2 className="h-4 w-4 text-muted-foreground hover:text-blue-600" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                      disabled={enviadoPncp}
                      title={enviadoPncp ? 'Itens já enviados ao PNCP não podem ser excluídos' : 'Excluir item'}
                      onClick={() => {
                        if (enviadoPncp) {
                          alert('⚠️ Não é possível excluir itens de uma licitação já enviada ao PNCP.\n\nItens já publicados não podem ser removidos, apenas editados.')
                          return
                        }
                        if (!confirm(`Deseja realmente excluir o item "${item.descricao}"?`)) return
                        const novosItens = itens.filter(i => i.numero !== item.numero)
                        onItensChange(novosItens)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Modal Novo Lote */}
      <Dialog open={modalNovoLote} onOpenChange={setModalNovoLote}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar Novo Lote</DialogTitle>
            <DialogDescription>Lei 14.133/2021, Art. 40, §3º: O parcelamento será adotado quando técnica e economicamente viável.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Número do Lote</Label>
              <Input type="number" value={proximoNumeroLote} disabled className="mt-1" />
            </div>
            <div>
              <Label>Descrição do Lote *</Label>
              <Input value={novoLote.descricao} onChange={(e) => setNovoLote({ ...novoLote, descricao: e.target.value })} placeholder="Ex: Equipamentos de Informática" className="mt-1" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label>Exclusivo para ME/EPP</Label>
                <p className="text-xs text-muted-foreground">LC 123/2006, Art. 48, I: Até R$ 80.000,00</p>
              </div>
              <Switch checked={novoLote.exclusivo_mpe} onCheckedChange={(checked) => setNovoLote({ ...novoLote, exclusivo_mpe: checked })} />
            </div>
            {!novoLote.exclusivo_mpe && (
              <div>
                <Label>Cota Reservada ME/EPP (%)</Label>
                <Input type="number" min={0} max={25} value={novoLote.percentual_cota_reservada} onChange={(e) => setNovoLote({ ...novoLote, percentual_cota_reservada: Math.min(25, parseInt(e.target.value) || 0) })} className="mt-1" />
                <p className="text-xs text-muted-foreground mt-1">LC 123/2006, Art. 48, III: Até 25% do objeto</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNovoLote(false)}>Cancelar</Button>
            <Button onClick={criarLote} disabled={!novoLote.descricao?.trim()}>Criar Lote</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Lote */}
      <Dialog open={modalEditarLote} onOpenChange={setModalEditarLote}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Lote {loteAtual?.numero}</DialogTitle></DialogHeader>
          {loteAtual && (
            <div className="space-y-4">
              <div>
                <Label>Descrição do Lote *</Label>
                <Input value={loteAtual.descricao} onChange={(e) => setLoteAtual({ ...loteAtual, descricao: e.target.value })} className="mt-1" />
              </div>
              <div className="flex items-center justify-between">
                <div><Label>Exclusivo para ME/EPP</Label></div>
                <Switch checked={loteAtual.exclusivo_mpe || false} onCheckedChange={(checked) => setLoteAtual({ ...loteAtual, exclusivo_mpe: checked })} />
              </div>
              {!loteAtual.exclusivo_mpe && (
                <div>
                  <Label>Cota Reservada ME/EPP (%)</Label>
                  <Input type="number" min={0} max={25} value={loteAtual.percentual_cota_reservada || 0} onChange={(e) => setLoteAtual({ ...loteAtual, percentual_cota_reservada: Math.min(25, parseInt(e.target.value) || 0) })} className="mt-1" />
                </div>
              )}
              <div>
                <Label>Observações</Label>
                <Textarea value={loteAtual.observacoes || ''} onChange={(e) => setLoteAtual({ ...loteAtual, observacoes: e.target.value })} className="mt-1" rows={3} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEditarLote(false)}>Cancelar</Button>
            <Button onClick={editarLote}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Adicionar Item ao Lote */}
      {modalAdicionarItem && (
        <ModalAdicionarItem
          open={modalAdicionarItem}
          onOpenChange={setModalAdicionarItem}
          loteAtual={loteAtual}
          onAdicionar={(item: ItemLicitacao) => {
            if (!loteAtual) return
            const novosItens = [...itens, item]
            const itensDoLote = novosItens.filter(i => i.lote_numero === loteAtual.numero)
            const valorTotal = itensDoLote.reduce((sum, i) => sum + (i.quantidade * i.valor_unitario), 0)
            const novosLotes = lotes.map(l => l.numero === loteAtual.numero ? {
              ...l, valor_total_estimado: valorTotal, quantidade_itens: itensDoLote.length, itens: itensDoLote
            } : l)
            onItensChange(novosItens)
            onLotesChange(novosLotes)
            setModalAdicionarItem(false)
          }}
          proximoNumeroItem={proximoNumeroItem}
        />
      )}

      {/* Modal Vincular Classe PCA */}
      <Dialog open={modalVincularPca} onOpenChange={setModalVincularPca}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Vincular Classe do PCA ao Lote {loteAtual?.numero}</DialogTitle>
            <DialogDescription>
              Lei 14.133/2021, Art. 12, VII - Selecione a classe/categoria de contratação do PCA que corresponde a este lote
            </DialogDescription>
          </DialogHeader>
          
          {/* Filtros */}
          <div className="grid grid-cols-3 gap-2">
            <Select value={String(pcaFiltroAno)} onValueChange={(v) => setPcaFiltroAno(Number(v))}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026, 2027].map(ano => (
                  <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={pcaFiltroTipo} onValueChange={setPcaFiltroTipo}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TODOS">Todos</SelectItem>
                <SelectItem value="MATERIAL">📦 Material</SelectItem>
                <SelectItem value="SERVICO">🔧 Serviço</SelectItem>
                <SelectItem value="OBRA">🏗️ Obra</SelectItem>
                <SelectItem value="SOLUCAO_TIC">💻 TIC</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar..."
              value={pcaFiltroBusca}
              onChange={(e) => setPcaFiltroBusca(e.target.value)}
              className="h-9"
            />
          </div>

          {/* Lista de PCAs */}
          <div className="max-h-[350px] overflow-y-auto space-y-2">
            {loadingPca ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground mt-2">Carregando PCAs...</p>
              </div>
            ) : itensPcaFiltrados.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum PCA encontrado com esses filtros</p>
              </div>
            ) : (
              itensPcaFiltrados.map((itemPca) => {
                const saldo = itemPca.valor_estimado - (itemPca.valor_utilizado || 0)
                const pct = (itemPca.valor_utilizado || 0) / itemPca.valor_estimado * 100
                const isSelected = loteAtual?.item_pca_id === itemPca.id
                return (
                  <div 
                    key={itemPca.id} 
                    className={`p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                      isSelected ? 'border-green-500 bg-green-50' : ''
                    }`} 
                    onClick={() => vincularPcaAoLote(itemPca)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span>{getIconeCategoria(itemPca.categoria)}</span>
                          <span className="font-medium text-sm">{itemPca.descricao_objeto}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">{itemPca.nome_classe}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-xs mb-1">PCA {itemPca.pca?.ano_exercicio}</Badge>
                        <p className="font-medium text-sm">{formatarValor(saldo)}</p>
                        <div className="w-16 h-1 bg-gray-200 rounded-full mt-1">
                          <div 
                            className={`h-full rounded-full ${pct > 80 ? 'bg-red-500' : pct > 50 ? 'bg-yellow-500' : 'bg-green-500'}`} 
                            style={{ width: `${Math.min(pct, 100)}%` }} 
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalVincularPca(false)}>Cancelar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Item */}
      <Dialog open={modalEditarItem} onOpenChange={setModalEditarItem}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar Item {itemEmEdicao?.numero}</DialogTitle>
            <DialogDescription>
              Altere os dados do item. {enviadoPncp && '(As alterações serão enviadas ao PNCP na próxima atualização)'}
            </DialogDescription>
          </DialogHeader>
          {itemEmEdicao && (
            <div className="space-y-4">
              <div>
                <Label>Descrição</Label>
                <Textarea
                  value={itemEmEdicao.descricao}
                  onChange={(e) => setItemEmEdicao({ ...itemEmEdicao, descricao: e.target.value })}
                  className="mt-1"
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Quantidade</Label>
                  <Input
                    type="number"
                    min={1}
                    step="0.01"
                    value={itemEmEdicao.quantidade}
                    onChange={(e) => setItemEmEdicao({ ...itemEmEdicao, quantidade: parseFloat(e.target.value) || 1 })}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Unidade</Label>
                  <Select
                    value={itemEmEdicao.unidade}
                    onValueChange={(v) => setItemEmEdicao({ ...itemEmEdicao, unidade: v })}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNIDADES.map(u => (
                        <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor Unitário</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={itemEmEdicao.valor_unitario}
                    onChange={(e) => setItemEmEdicao({ ...itemEmEdicao, valor_unitario: parseFloat(e.target.value) || 0 })}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor Total:</span>
                  <span className="font-medium text-green-600">
                    {formatarValorGlobal(itemEmEdicao.quantidade * itemEmEdicao.valor_unitario)}
                  </span>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalEditarItem(false); setItemEmEdicao(null) }}>
              Cancelar
            </Button>
            <Button onClick={salvarEdicaoItem}>
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
