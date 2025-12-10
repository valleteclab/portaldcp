"use client"

import { useRef, useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { 
  Package, Plus, Trash2, Upload, Download, FileSpreadsheet, 
  CheckCircle2, AlertTriangle, Loader2, Search, ShoppingCart, Layers,
  Link2, Unlink
} from "lucide-react"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ItemLicitacao, ItemPCA, UNIDADES, ModoVinculacaoPCA, LoteLicitacao, ModoAplicacaoBeneficioMPE } from "./types"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface ItensTabProps {
  itens: ItemLicitacao[]
  onChange: (itens: ItemLicitacao[]) => void
  orgaoId?: string
  modoVinculacaoPca?: ModoVinculacaoPCA
  itemPcaSelecionado?: ItemPCA | null
  usaLotes?: boolean
  lotes?: LoteLicitacao[]
  modoBeneficioMpe?: ModoAplicacaoBeneficioMPE
  enviadoPncp?: boolean // Se true, bloqueia exclusão de itens (PNCP não permite deletar)
}

export function ItensTab({ 
  itens, 
  onChange, 
  orgaoId,
  modoVinculacaoPca = 'POR_ITEM',
  itemPcaSelecionado,
  usaLotes = false,
  lotes = [],
  modoBeneficioMpe = 'GERAL',
  enviadoPncp = false
}: ItensTabProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  
  // Estados para busca no catálogo
  const [showCatalogoModal, setShowCatalogoModal] = useState(false)
  const [buscaCatalogo, setBuscaCatalogo] = useState('')
  const [tipoCatalogo, setTipoCatalogo] = useState<'MATERIAL' | 'SERVICO'>('MATERIAL')
  const [itensCatalogo, setItensCatalogo] = useState<any[]>([])
  const [loadingCatalogo, setLoadingCatalogo] = useState(false)
  const [totalCatalogo, setTotalCatalogo] = useState(0)
  const [itemSelecionadoCatalogo, setItemSelecionadoCatalogo] = useState<any | null>(null)
  
  // Estados para formulário de item do catálogo
  const [quantidadeItem, setQuantidadeItem] = useState(1)
  const [valorUnitarioStr, setValorUnitarioStr] = useState('')
  const [unidadeItem, setUnidadeItem] = useState('UNIDADE')

  // Estados para modal de seleção de PCA (modo POR_ITEM)
  const [showPcaModal, setShowPcaModal] = useState(false)
  const [itemIndexParaPca, setItemIndexParaPca] = useState<number | null>(null)
  const [itensPca, setItensPca] = useState<ItemPCA[]>([])
  const [loadingPca, setLoadingPca] = useState(false)
  const [buscaPca, setBuscaPca] = useState('')
  const [anoPca, setAnoPca] = useState<number>(new Date().getFullYear())
  const [tipoPca, setTipoPca] = useState<string>('TODOS')

  // Paginação do catálogo
  const [paginaCatalogo, setPaginaCatalogo] = useState(1)
  const ITENS_POR_PAGINA = 50

  // Funções auxiliares
  const parseValor = (str: string): number => {
    if (!str) return 0
    return parseFloat(str.replace(',', '.')) || 0
  }

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const calcularValorTotal = () => {
    return itens.reduce((total, item) => total + (item.quantidade * item.valor_unitario), 0)
  }

  // === BUSCA NO CATÁLOGO ===
  const buscarNoCatalogo = async (termo?: string, pagina: number = 1) => {
    const termoBusca = termo ?? buscaCatalogo
    if (!termoBusca || termoBusca.length < 3) {
      setItensCatalogo([])
      setTotalCatalogo(0)
      return
    }
    
    setLoadingCatalogo(true)
    try {
      const params = new URLSearchParams({
        termo: termoBusca,
        tipo: tipoCatalogo,
        limite: String(ITENS_POR_PAGINA),
        offset: String((pagina - 1) * ITENS_POR_PAGINA)
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

  const carregarMaisCatalogo = () => {
    if (itensCatalogo.length < totalCatalogo && !loadingCatalogo) {
      buscarNoCatalogo(buscaCatalogo, paginaCatalogo + 1)
    }
  }

  // Debounce para busca automática no catálogo
  useEffect(() => {
    if (!showCatalogoModal) return
    
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
  }, [buscaCatalogo, tipoCatalogo, showCatalogoModal])

  // === BUSCA NO PCA ===
  const carregarItensPca = async () => {
    if (!orgaoId) return
    
    setLoadingPca(true)
    try {
      const res = await fetch(`${API_URL}/api/pca/itens?orgao_id=${orgaoId}&ano=${anoPca}`)
      if (res.ok) {
        const data = await res.json()
        setItensPca(data)
      }
    } catch (error) {
      console.error('Erro ao carregar itens PCA:', error)
    } finally {
      setLoadingPca(false)
    }
  }

  // Carregar PCA quando abrir modal ou mudar filtros
  useEffect(() => {
    if (showPcaModal) {
      carregarItensPca()
    }
  }, [showPcaModal, anoPca])

  // Filtrar itens PCA pela busca e tipo
  const itensPcaFiltrados = itensPca.filter(item => {
    if (buscaPca && !item.descricao_objeto.toLowerCase().includes(buscaPca.toLowerCase())) {
      return false
    }
    if (tipoPca !== 'TODOS' && item.categoria !== tipoPca) {
      return false
    }
    return true
  })

  // === AÇÕES ===
  const selecionarItemCatalogo = (item: any) => {
    setItemSelecionadoCatalogo(item)
    setQuantidadeItem(1)
    setValorUnitarioStr('')
    setUnidadeItem(item.unidade_padrao || 'UNIDADE')
  }

  const confirmarItemCatalogo = () => {
    if (!itemSelecionadoCatalogo) return
    
    const valorUnitario = parseValor(valorUnitarioStr)
    
    const novoItem: ItemLicitacao = {
      numero: itens.length + 1,
      descricao: itemSelecionadoCatalogo.descricao,
      quantidade: quantidadeItem,
      unidade: unidadeItem,
      valor_unitario: valorUnitario,
      codigo_catalogo: itemSelecionadoCatalogo.codigo,
      classe_catalogo: itemSelecionadoCatalogo.nome_classe,
      codigo_catmat: itemSelecionadoCatalogo.tipo === 'MATERIAL' ? itemSelecionadoCatalogo.codigo : undefined,
      codigo_catser: itemSelecionadoCatalogo.tipo === 'SERVICO' ? itemSelecionadoCatalogo.codigo : undefined,
      // Se modo POR_LICITACAO, herda o PCA selecionado
      item_pca_id: modoVinculacaoPca === 'POR_LICITACAO' ? itemPcaSelecionado?.id : undefined,
      item_pca_descricao: modoVinculacaoPca === 'POR_LICITACAO' ? itemPcaSelecionado?.descricao_objeto : undefined,
    }
    
    onChange([...itens, novoItem])
    
    // Limpar e fechar
    setItemSelecionadoCatalogo(null)
    setShowCatalogoModal(false)
    setBuscaCatalogo('')
    setItensCatalogo([])
    setValorUnitarioStr('')
  }

  const addItemManual = () => {
    const novoItem: ItemLicitacao = {
      numero: itens.length + 1,
      descricao: '',
      quantidade: 1,
      unidade: 'UNIDADE',
      valor_unitario: 0,
      item_pca_id: modoVinculacaoPca === 'POR_LICITACAO' ? itemPcaSelecionado?.id : undefined,
      item_pca_descricao: modoVinculacaoPca === 'POR_LICITACAO' ? itemPcaSelecionado?.descricao_objeto : undefined,
    }
    onChange([...itens, novoItem])
  }

  const updateItem = (index: number, field: keyof ItemLicitacao, value: any) => {
    const novosItens = itens.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    )
    onChange(novosItens)
  }

  // REGRA PNCP: Não permite excluir itens após envio ao PNCP
  const removeItem = (index: number) => {
    if (enviadoPncp) {
      alert('⚠️ Não é possível excluir itens de uma licitação já enviada ao PNCP.\n\nItens já publicados não podem ser removidos, apenas editados (descrição, quantidade, valor).')
      return
    }
    
    const item = itens[index]
    if (!confirm(`Deseja realmente excluir o item "${item.descricao}"?`)) return
    
    const novosItens = itens
      .filter((_, i) => i !== index)
      .map((item, i) => ({ ...item, numero: i + 1 }))
    onChange(novosItens)
  }

  // Vincular PCA a um item específico (modo POR_ITEM)
  const abrirModalPcaParaItem = (index: number) => {
    setItemIndexParaPca(index)
    setBuscaPca('')
    setShowPcaModal(true)
  }

  const vincularPcaAoItem = (pca: ItemPCA) => {
    if (itemIndexParaPca === null) return
    
    const novosItens = itens.map((item, i) => 
      i === itemIndexParaPca 
        ? { 
            ...item, 
            item_pca_id: pca.id, 
            item_pca_descricao: pca.descricao_objeto,
            item_pca_ano: pca.pca?.ano_exercicio,
            sem_pca: false,
            justificativa_sem_pca: undefined
          } 
        : item
    )
    onChange(novosItens)
    setShowPcaModal(false)
    setItemIndexParaPca(null)
  }

  const desvincularPcaDoItem = (index: number) => {
    const novosItens = itens.map((item, i) => 
      i === index 
        ? { 
            ...item, 
            item_pca_id: undefined, 
            item_pca_descricao: undefined,
            item_pca_ano: undefined
          } 
        : item
    )
    onChange(novosItens)
  }

  // === CSV ===
  const downloadModeloCSV = () => {
    const modelo = "numero;descricao;quantidade;unidade;valor_unitario;codigo_catmat\n1;Exemplo de item;10;UNIDADE;100.00;123456"
    const blob = new Blob([modelo], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'modelo_itens.csv'
    link.click()
  }

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const lines = text.split('\n').filter(line => line.trim())
      
      const novosItens: ItemLicitacao[] = []
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(';')
        if (cols.length >= 5) {
          novosItens.push({
            numero: itens.length + novosItens.length + 1,
            descricao: cols[1]?.trim() || '',
            quantidade: parseInt(cols[2]) || 1,
            unidade: cols[3]?.trim() || 'UNIDADE',
            valor_unitario: parseFloat(cols[4]?.replace(',', '.')) || 0,
            codigo_catmat: cols[5]?.trim() || undefined,
            item_pca_id: modoVinculacaoPca === 'POR_LICITACAO' ? itemPcaSelecionado?.id : undefined,
          })
        }
      }
      
      if (novosItens.length > 0) {
        onChange([...itens, ...novosItens])
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  // === RENDER ===

  // Se usa lotes e modo POR_LOTE, redirecionar para aba de lotes
  if (usaLotes && modoVinculacaoPca === 'POR_LOTE') {
    return (
      <div className="space-y-6">
        <Alert className="border-blue-200 bg-blue-50">
          <Layers className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Modo por Lote:</strong> Os itens devem ser cadastrados dentro de cada lote.
            Acesse a aba <strong>"Lotes"</strong> para gerenciar os itens.
          </AlertDescription>
        </Alert>

        {lotes.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Resumo dos Lotes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {lotes.map((lote, idx) => (
                  <div key={lote.id || idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <span className="font-medium">Lote {lote.numero}</span>
                      <span className="text-muted-foreground ml-2">- {lote.descricao}</span>
                      {lote.item_pca && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          PCA: {lote.item_pca.descricao_objeto?.substring(0, 30)}...
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <Badge variant="outline">{lote.itens?.length || 0} itens</Badge>
                      <span className="font-medium text-green-600">
                        {formatarMoeda(lote.valor_total_estimado || 0)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center text-muted-foreground">
              <Layers className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhum lote cadastrado</p>
              <p className="text-sm">Acesse a aba "Lotes" para criar lotes e adicionar itens</p>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Info do PCA quando modo POR_LICITACAO */}
      {modoVinculacaoPca === 'POR_LICITACAO' && itemPcaSelecionado && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            <strong>PCA vinculado a toda licitação:</strong> {itemPcaSelecionado.descricao_objeto}
            <span className="ml-2 text-sm">
              (Saldo: {formatarMoeda(itemPcaSelecionado.valor_estimado - itemPcaSelecionado.valor_utilizado)})
            </span>
          </AlertDescription>
        </Alert>
      )}

      {/* Aviso se modo POR_LICITACAO sem PCA */}
      {modoVinculacaoPca === 'POR_LICITACAO' && !itemPcaSelecionado && (
        <Alert className="border-orange-200 bg-orange-50">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertDescription className="text-orange-800">
            <strong>Atenção:</strong> Selecione o PCA na aba "Classificação" antes de adicionar itens.
          </AlertDescription>
        </Alert>
      )}

      {/* Info modo POR_ITEM */}
      {modoVinculacaoPca === 'POR_ITEM' && (
        <Alert className="border-blue-200 bg-blue-50">
          <Link2 className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-800">
            <strong>Modo por Item:</strong> Cada item deve ser vinculado individualmente a um PCA.
            Use o botão "Vincular PCA" em cada item.
          </AlertDescription>
        </Alert>
      )}

      {/* Formas de adicionar itens */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-green-200 hover:border-green-400 transition-colors cursor-pointer" onClick={() => setShowCatalogoModal(true)}>
          <CardContent className="pt-6 text-center">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-green-600" />
            <p className="font-medium">Catálogo ComprasGov</p>
            <p className="text-sm text-muted-foreground">Buscar CATMAT/CATSER</p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 hover:border-slate-400 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <CardContent className="pt-6 text-center">
            <FileSpreadsheet className="h-10 w-10 mx-auto mb-3 text-slate-600" />
            <p className="font-medium">Importar Planilha</p>
            <p className="text-sm text-muted-foreground">Arquivo CSV</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleImportCSV}
              className="hidden"
            />
          </CardContent>
        </Card>

        <Card className="border-blue-200 hover:border-blue-400 transition-colors cursor-pointer" onClick={addItemManual}>
          <CardContent className="pt-6 text-center">
            <Plus className="h-10 w-10 mx-auto mb-3 text-blue-600" />
            <p className="font-medium">Adicionar Manual</p>
            <p className="text-sm text-muted-foreground">Digitar item</p>
          </CardContent>
        </Card>
      </div>

      {/* Botão download modelo */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={downloadModeloCSV}>
          <Download className="h-4 w-4 mr-1" />
          Baixar modelo CSV
        </Button>
      </div>

      {/* Lista de Itens */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Package className="h-5 w-5" />
                Itens da Licitação
              </CardTitle>
              <CardDescription>{itens.length} item(s)</CardDescription>
            </div>
            <div className="text-right">
              <p className="text-sm text-muted-foreground">Valor Total Estimado</p>
              <p className="text-xl font-bold text-green-600">{formatarMoeda(calcularValorTotal())}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {itens.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed rounded-lg">
              <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium">Nenhum item cadastrado</p>
              <p className="text-sm">Use uma das opções acima para adicionar itens</p>
            </div>
          ) : (
            <div className="space-y-3">
              {itens.map((item, index) => (
                <div key={item.id || index} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Linha 1: Número, Descrição e PCA */}
                      <div className="flex items-center gap-3">
                        <Badge variant="outline" className="shrink-0">Item {item.numero}</Badge>
                        <Input
                          placeholder="Descrição do item *"
                          value={item.descricao}
                          onChange={(e) => updateItem(index, 'descricao', e.target.value)}
                          className="flex-1"
                        />
                      </div>

                      {/* Linha 2: Vinculação PCA (apenas modo POR_ITEM) */}
                      {modoVinculacaoPca === 'POR_ITEM' && (
                        <div className="flex items-center gap-2 bg-slate-50 p-2 rounded">
                          {item.item_pca_id ? (
                            <>
                              <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                              <span className="text-sm text-green-700 flex-1 truncate">
                                PCA: {item.item_pca_descricao}
                              </span>
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => desvincularPcaDoItem(index)}
                                className="text-red-600 hover:text-red-700 h-7"
                              >
                                <Unlink className="h-3 w-3 mr-1" />
                                Desvincular
                              </Button>
                            </>
                          ) : (
                            <>
                              <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
                              <span className="text-sm text-orange-600 flex-1">
                                Item sem PCA vinculado
                              </span>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => abrirModalPcaParaItem(index)}
                                className="border-blue-300 text-blue-700 hover:bg-blue-50 h-7"
                              >
                                <Link2 className="h-3 w-3 mr-1" />
                                Vincular PCA
                              </Button>
                            </>
                          )}
                        </div>
                      )}
                      
                      {/* Linha 3: Quantidade, Unidade, Valor */}
                      <div className="grid grid-cols-4 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Quantidade</Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantidade}
                            onChange={(e) => updateItem(index, 'quantidade', parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Unidade</Label>
                          <Select value={item.unidade} onValueChange={(v) => updateItem(index, 'unidade', v)}>
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
                          <Label className="text-xs text-muted-foreground">Valor Unit.</Label>
                          <Input
                            type="text"
                            inputMode="decimal"
                            placeholder="0,00"
                            value={item.valor_unitario || ''}
                            onChange={(e) => {
                              const val = e.target.value.replace(',', '.')
                              updateItem(index, 'valor_unitario', parseFloat(val) || 0)
                            }}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Subtotal</Label>
                          <div className="h-10 flex items-center px-3 bg-slate-100 rounded-md font-medium text-green-600">
                            {formatarMoeda(item.quantidade * item.valor_unitario)}
                          </div>
                        </div>
                      </div>

                      {/* Linha 4: Códigos CATMAT/CATSER */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Código CATMAT</Label>
                          <Input
                            placeholder="Opcional"
                            value={item.codigo_catmat || ''}
                            onChange={(e) => updateItem(index, 'codigo_catmat', e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Código CATSER</Label>
                          <Input
                            placeholder="Opcional"
                            value={item.codigo_catser || ''}
                            onChange={(e) => updateItem(index, 'codigo_catser', e.target.value)}
                          />
                        </div>
                      </div>

                      {/* Linha 5: Benefício ME/EPP - só aparece quando modo é POR_ITEM */}
                      {modoBeneficioMpe === 'POR_ITEM' && (
                        <div className="p-3 bg-orange-50 rounded-lg border border-orange-200">
                          <Label className="text-xs text-orange-700 font-medium mb-2 block">Benefício ME/EPP (LC 123/2006)</Label>
                          <Select
                            value={item.tipo_participacao || 'AMPLA'}
                            onValueChange={(v) => {
                              // Mapeia para o campo do backend (tipo_participacao)
                              const tipoParticipacao = v as 'AMPLA' | 'EXCLUSIVO_MPE' | 'COTA_RESERVADA'
                              const newItens = [...itens]
                              newItens[index] = { ...newItens[index], tipo_participacao: tipoParticipacao }
                              onChange(newItens)
                            }}
                          >
                            <SelectTrigger className="bg-white">
                              <SelectValue placeholder="Selecione o benefício" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AMPLA">
                                <div className="flex flex-col">
                                  <span>Sem Benefício</span>
                                  <span className="text-xs text-muted-foreground">Ampla participação</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="EXCLUSIVO_MPE">
                                <div className="flex flex-col">
                                  <span>Exclusivo ME/EPP</span>
                                  <span className="text-xs text-muted-foreground">Participação exclusiva para ME/EPP (até R$ 80.000)</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="COTA_RESERVADA">
                                <div className="flex flex-col">
                                  <span>Cota Reservada</span>
                                  <span className="text-xs text-muted-foreground">Reservar cota de até 25% para ME/EPP</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>

                    {/* Botão Remover */}
                    <Button
                      variant="ghost"
                      size="icon"
                      className={enviadoPncp ? "text-gray-300 cursor-not-allowed" : "text-red-500 hover:text-red-700 hover:bg-red-50"}
                      onClick={() => removeItem(index)}
                      disabled={enviadoPncp}
                      title={enviadoPncp ? 'Itens já enviados ao PNCP não podem ser excluídos' : 'Excluir item'}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Busca no Catálogo */}
      <Dialog open={showCatalogoModal} onOpenChange={setShowCatalogoModal}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-green-600" />
              Catálogo ComprasGov
            </DialogTitle>
            <DialogDescription>
              Busque itens no catálogo oficial CATMAT/CATSER
            </DialogDescription>
          </DialogHeader>

          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <Label>Buscar item</Label>
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
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={tipoCatalogo} onValueChange={(v: 'MATERIAL' | 'SERVICO') => setTipoCatalogo(v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="MATERIAL">Material</SelectItem>
                  <SelectItem value="SERVICO">Serviço</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto border rounded-lg min-h-[200px]">
            {loadingCatalogo ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
              </div>
            ) : itensCatalogo.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Digite para buscar itens</p>
              </div>
            ) : (
              <div className="divide-y">
                {itensCatalogo.map((item) => (
                  <div 
                    key={item.id}
                    className={`p-3 hover:bg-slate-50 cursor-pointer ${
                      itemSelecionadoCatalogo?.id === item.id ? 'bg-green-50 border-l-4 border-green-500' : ''
                    }`}
                    onClick={() => selecionarItemCatalogo(item)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <Badge variant="outline" className="text-xs mb-1">{item.codigo}</Badge>
                        <p className="text-sm line-clamp-2">{item.descricao}</p>
                      </div>
                      {itemSelecionadoCatalogo?.id === item.id && (
                        <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

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
                  {loadingCatalogo ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-1" />
                  ) : null}
                  Carregar mais
                </Button>
              )}
            </div>
          )}

          {itemSelecionadoCatalogo && (
            <div className="border-t pt-4 space-y-3">
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="font-medium text-green-800 text-sm">Item selecionado:</p>
                <p className="text-sm">{itemSelecionadoCatalogo.descricao}</p>
              </div>
              
              <div className="grid grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs">Quantidade *</Label>
                  <Input
                    type="number"
                    min="1"
                    value={quantidadeItem}
                    onChange={(e) => setQuantidadeItem(Number(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Unidade</Label>
                  <Select value={unidadeItem} onValueChange={setUnidadeItem}>
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
                    {formatarMoeda(quantidadeItem * parseValor(valorUnitarioStr))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setItemSelecionadoCatalogo(null)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={confirmarItemCatalogo}
                  className="bg-green-600 hover:bg-green-700"
                  disabled={quantidadeItem < 1 || parseValor(valorUnitarioStr) <= 0}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Item
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Seleção de PCA (modo POR_ITEM) */}
      <Dialog open={showPcaModal} onOpenChange={setShowPcaModal}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5 text-blue-600" />
              Vincular ao PCA
            </DialogTitle>
            <DialogDescription>
              Selecione o item do PCA para vincular a este item da licitação
            </DialogDescription>
          </DialogHeader>

          {/* Filtros */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Ano</Label>
              <Select value={String(anoPca)} onValueChange={(v) => setAnoPca(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map(ano => (
                    <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={tipoPca} onValueChange={setTipoPca}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="TODOS">Todos</SelectItem>
                  <SelectItem value="MATERIAL">Material</SelectItem>
                  <SelectItem value="SERVICO">Serviço</SelectItem>
                  <SelectItem value="OBRA">Obra</SelectItem>
                  <SelectItem value="SOLUCAO_TIC">TIC</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Buscar</Label>
              <div className="relative">
                <Input
                  placeholder="Filtrar por descrição..."
                  value={buscaPca}
                  onChange={(e) => setBuscaPca(e.target.value)}
                  className="pr-10"
                />
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
            </div>
          </div>

          {/* Contador */}
          <p className="text-sm text-muted-foreground">
            {itensPcaFiltrados.length} item(s) encontrado(s)
          </p>

          <div className="flex-1 overflow-y-auto border rounded-lg min-h-[250px]">
            {loadingPca ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              </div>
            ) : itensPcaFiltrados.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Nenhum item do PCA encontrado</p>
                <p className="text-sm">Verifique os filtros selecionados</p>
              </div>
            ) : (
              <div className="divide-y">
                {itensPcaFiltrados.map((pca) => (
                  <div 
                    key={pca.id}
                    className="p-3 hover:bg-blue-50 cursor-pointer"
                    onClick={() => vincularPcaAoItem(pca)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {pca.pca?.ano_exercicio || anoPca}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {pca.categoria}
                          </Badge>
                        </div>
                        <p className="text-sm font-medium">{pca.descricao_objeto}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Saldo: {formatarMoeda(pca.valor_estimado - (pca.valor_utilizado || 0))}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="text-blue-600">
                        Selecionar
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
