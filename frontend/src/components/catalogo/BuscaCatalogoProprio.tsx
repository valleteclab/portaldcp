'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Package, Wrench, Loader2, Plus, X, Save } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Classificacao {
  id: string
  codigo: string
  nome: string
  tipo: 'MATERIAL' | 'SERVICO'
}

interface ItemCatalogo {
  id: string
  codigo: string
  descricao: string
  tipo: 'MATERIAL' | 'SERVICO'
  unidade_padrao?: string
  classificacao?: Classificacao
}

interface BuscaClassificacaoProps {
  value?: { codigo: string; nome: string } | null
  onChange: (classificacao: { codigo: string; nome: string } | null) => void
  tipo?: 'MATERIAL' | 'SERVICO'
  disabled?: boolean
  placeholder?: string
}

export function BuscaClassificacao({ 
  value, 
  onChange, 
  tipo, 
  disabled,
  placeholder = "Buscar classificação..." 
}: BuscaClassificacaoProps) {
  const [open, setOpen] = useState(false)
  const [termo, setTermo] = useState('')
  const [classificacoes, setClassificacoes] = useState<Classificacao[]>([])
  const [loading, setLoading] = useState(false)

  const buscar = useCallback(async (searchTermo: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTermo) params.append('termo', searchTermo)
      if (tipo) params.append('tipo', tipo)
      params.append('limite', '15')

      const response = await fetch(`${API_URL}/api/catalogo-proprio/classificacoes?${params}`)
      if (response.ok) {
        const data = await response.json()
        setClassificacoes(data)
      }
    } catch (error) {
      console.error('Erro ao buscar classificações:', error)
    } finally {
      setLoading(false)
    }
  }, [tipo])

  useEffect(() => {
    if (open) {
      buscar(termo)
    }
  }, [open, termo, buscar])

  const handleSelect = (classificacao: Classificacao) => {
    onChange({ codigo: classificacao.codigo, nome: classificacao.nome })
    setOpen(false)
  }

  const handleClear = () => {
    onChange(null)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
          disabled={disabled}
        >
          {value ? (
            <span className="truncate">
              <span className="font-mono text-xs mr-2">{value.codigo}</span>
              {value.nome}
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <Command>
          <CommandInput 
            placeholder="Digite para buscar..." 
            value={termo}
            onValueChange={setTermo}
          />
          <CommandList>
            {loading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : classificacoes.length === 0 ? (
              <CommandEmpty>Nenhuma classificação encontrada.</CommandEmpty>
            ) : (
              <CommandGroup>
                {classificacoes.map((c) => (
                  <CommandItem
                    key={c.id}
                    value={`${c.codigo} ${c.nome}`}
                    onSelect={() => handleSelect(c)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-center gap-2 w-full">
                      {c.tipo === 'MATERIAL' ? (
                        <Package className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Wrench className="h-4 w-4 text-purple-500" />
                      )}
                      <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                        {c.codigo}
                      </span>
                      <span className="truncate flex-1">{c.nome}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        {value && (
          <div className="border-t p-2">
            <Button variant="ghost" size="sm" onClick={handleClear} className="w-full">
              <X className="h-4 w-4 mr-2" />
              Limpar seleção
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}

interface BuscaItemCatalogoProprioProps {
  value?: ItemCatalogo | null
  onChange: (item: ItemCatalogo | null) => void
  tipo?: 'MATERIAL' | 'SERVICO'
  disabled?: boolean
  placeholder?: string
}

export function BuscaItemCatalogoProprio({ 
  value, 
  onChange, 
  tipo, 
  disabled,
  placeholder = "Buscar item do catálogo..." 
}: BuscaItemCatalogoProprioProps) {
  const [open, setOpen] = useState(false)
  const [termo, setTermo] = useState('')
  const [itens, setItens] = useState<ItemCatalogo[]>([])
  const [loading, setLoading] = useState(false)
  
  // Modal de cadastro de novo item
  const [showCadastro, setShowCadastro] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [classificacoes, setClassificacoes] = useState<Classificacao[]>([])
  const [novoItem, setNovoItem] = useState({
    descricao: '',
    tipo: tipo || 'SERVICO' as 'MATERIAL' | 'SERVICO',
    classificacaoId: '',
    unidade_padrao: 'UN'
  })

  const buscar = useCallback(async (searchTermo: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchTermo) params.append('termo', searchTermo)
      if (tipo) params.append('tipo', tipo)
      params.append('limite', '15')

      // Buscar nos itens do PCA existentes
      const response = await fetch(`${API_URL}/api/catalogo-proprio/buscar-itens-pca?${params}`)
      if (response.ok) {
        const data = await response.json()
        setItens(data)
      }
    } catch (error) {
      console.error('Erro ao buscar itens:', error)
    } finally {
      setLoading(false)
    }
  }, [tipo])

  const carregarClassificacoes = async (tipoItem: 'MATERIAL' | 'SERVICO') => {
    try {
      const response = await fetch(`${API_URL}/api/catalogo-proprio/classificacoes?tipo=${tipoItem}&limite=50`)
      if (response.ok) {
        const data = await response.json()
        setClassificacoes(data)
      }
    } catch (error) {
      console.error('Erro ao carregar classificações:', error)
    }
  }

  useEffect(() => {
    if (open) {
      buscar(termo)
    }
  }, [open, termo, buscar])

  useEffect(() => {
    if (showCadastro) {
      carregarClassificacoes(novoItem.tipo)
    }
  }, [showCadastro, novoItem.tipo])

  const handleSelect = (item: ItemCatalogo) => {
    onChange(item)
    setOpen(false)
  }

  const handleClear = () => {
    onChange(null)
  }

  const handleAbrirCadastro = () => {
    setNovoItem({
      descricao: termo, // Preenche com o termo buscado
      tipo: tipo || 'SERVICO',
      classificacaoId: '',
      unidade_padrao: 'UN'
    })
    setOpen(false)
    setShowCadastro(true)
  }

  const handleSalvarNovoItem = async () => {
    if (!novoItem.descricao || !novoItem.classificacaoId) {
      alert('Preencha a descrição e selecione uma classificação')
      return
    }

    setSalvando(true)
    try {
      const response = await fetch(`${API_URL}/api/catalogo-proprio/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(novoItem)
      })

      if (response.ok) {
        const itemCriado = await response.json()
        // Buscar a classificação selecionada para retornar completo
        const classificacao = classificacoes.find(c => c.id === novoItem.classificacaoId)
        
        onChange({
          id: itemCriado.id,
          codigo: itemCriado.codigo,
          descricao: itemCriado.descricao,
          tipo: itemCriado.tipo,
          unidade_padrao: itemCriado.unidade_padrao,
          classificacao: classificacao ? {
            id: classificacao.id,
            codigo: classificacao.codigo,
            nome: classificacao.nome,
            tipo: classificacao.tipo
          } : undefined
        })
        
        setShowCadastro(false)
        setNovoItem({
          descricao: '',
          tipo: tipo || 'SERVICO',
          classificacaoId: '',
          unidade_padrao: 'UN'
        })
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao cadastrar item')
      }
    } catch (error) {
      console.error('Erro ao salvar item:', error)
      alert('Erro ao cadastrar item')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
            disabled={disabled}
          >
            {value ? (
              <span className="truncate">
                <span className="font-mono text-xs mr-2">{value.codigo}</span>
                {value.descricao}
              </span>
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
            <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[500px] p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Digite para buscar..." 
              value={termo}
              onValueChange={setTermo}
            />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              ) : (
                <>
                  {itens.length === 0 ? (
                    <div className="py-6 text-center text-sm text-gray-500">
                      Nenhum item encontrado.
                    </div>
                  ) : (
                    <CommandGroup heading="Itens encontrados">
                      {itens.map((item) => (
                        <CommandItem
                          key={item.id}
                          value={`${item.codigo} ${item.descricao}`}
                          onSelect={() => handleSelect(item)}
                          className="cursor-pointer"
                        >
                          <div className="flex flex-col gap-1 w-full">
                            <div className="flex items-center gap-2">
                              {item.tipo === 'MATERIAL' ? (
                                <Package className="h-4 w-4 text-blue-500" />
                              ) : (
                                <Wrench className="h-4 w-4 text-purple-500" />
                              )}
                              <span className="font-mono text-xs bg-gray-100 px-1 rounded">
                                {item.codigo}
                              </span>
                              <span className="truncate flex-1 font-medium">{item.descricao}</span>
                            </div>
                            {item.classificacao && (
                              <div className="text-xs text-gray-500 ml-6">
                                Classe: {item.classificacao.codigo} - {item.classificacao.nome}
                              </div>
                            )}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
            </CommandList>
          </Command>
          
          {/* Botão para cadastrar novo item */}
          <div className="border-t p-2 space-y-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleAbrirCadastro} 
              className="w-full text-blue-600 border-blue-200 hover:bg-blue-50"
            >
              <Plus className="h-4 w-4 mr-2" />
              Cadastrar novo item
            </Button>
            {value && (
              <Button variant="ghost" size="sm" onClick={handleClear} className="w-full">
                <X className="h-4 w-4 mr-2" />
                Limpar seleção
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Modal de Cadastro de Novo Item */}
      <Dialog open={showCadastro} onOpenChange={setShowCadastro}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Cadastrar Novo Item
            </DialogTitle>
            <DialogDescription>
              Preencha os dados para cadastrar um novo item no catálogo próprio.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="block text-sm font-medium mb-1">Tipo *</label>
              <Select 
                value={novoItem.tipo} 
                onValueChange={(v: 'MATERIAL' | 'SERVICO') => {
                  setNovoItem({...novoItem, tipo: v, classificacaoId: ''})
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SERVICO">
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-purple-500" />
                      Serviço
                    </div>
                  </SelectItem>
                  <SelectItem value="MATERIAL">
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-blue-500" />
                      Material
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Classificação *</label>
              <Select 
                value={novoItem.classificacaoId} 
                onValueChange={(v) => setNovoItem({...novoItem, classificacaoId: v})}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma classificação..." />
                </SelectTrigger>
                <SelectContent>
                  {classificacoes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <span className="font-mono text-xs mr-2">{c.codigo}</span>
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                O código do item será gerado automaticamente com base na classificação.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Descrição do Item *</label>
              <Input
                value={novoItem.descricao}
                onChange={(e) => setNovoItem({...novoItem, descricao: e.target.value})}
                placeholder="Descreva o material ou serviço..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Unidade Padrão</label>
              <Select 
                value={novoItem.unidade_padrao} 
                onValueChange={(v) => setNovoItem({...novoItem, unidade_padrao: v})}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="UN">UN - Unidade</SelectItem>
                  <SelectItem value="MES">MES - Mensal</SelectItem>
                  <SelectItem value="KG">KG - Quilograma</SelectItem>
                  <SelectItem value="M">M - Metro</SelectItem>
                  <SelectItem value="M2">M² - Metro Quadrado</SelectItem>
                  <SelectItem value="L">L - Litro</SelectItem>
                  <SelectItem value="H">H - Hora</SelectItem>
                  <SelectItem value="DIA">DIA - Diária</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCadastro(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarNovoItem} disabled={salvando}>
              {salvando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Cadastrar Item
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
