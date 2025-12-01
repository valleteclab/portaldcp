'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Package, Wrench, Loader2, Check, X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface ItemCatalogo {
  id: string
  codigo: string
  descricao: string
  tipo: 'MATERIAL' | 'SERVICO'
  codigo_classe?: string
  unidade_padrao?: string
  classe?: {
    codigo: string
    nome: string
  }
}

interface ClasseCatalogo {
  id: string
  codigo: string
  nome: string
  tipo: 'MATERIAL' | 'SERVICO'
}

interface CatalogoBuscaProps {
  value?: ItemCatalogo | null
  onChange: (item: ItemCatalogo | null) => void
  tipo?: 'MATERIAL' | 'SERVICO'
  placeholder?: string
  disabled?: boolean
}

export function CatalogoBusca({
  value,
  onChange,
  tipo,
  placeholder = 'Buscar no catálogo...',
  disabled = false,
}: CatalogoBuscaProps) {
  const [open, setOpen] = useState(false)
  const [termo, setTermo] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'MATERIAL' | 'SERVICO' | 'all'>(tipo || 'all')
  const [classeFiltro, setClasseFiltro] = useState<string>('all')
  const [itens, setItens] = useState<ItemCatalogo[]>([])
  const [classes, setClasses] = useState<ClasseCatalogo[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingClasses, setLoadingClasses] = useState(false)

  // Carregar classes
  useEffect(() => {
    const carregarClasses = async () => {
      setLoadingClasses(true)
      try {
        const tipoParam = tipoFiltro !== 'all' ? `?tipo=${tipoFiltro}` : ''
        const res = await fetch(`${API_URL}/api/catalogo/classes${tipoParam}`)
        if (res.ok) {
          setClasses(await res.json())
        }
      } catch (error) {
        console.error('Erro ao carregar classes:', error)
      } finally {
        setLoadingClasses(false)
      }
    }
    
    if (open) {
      carregarClasses()
    }
  }, [open, tipoFiltro])

  // Buscar itens com debounce
  const buscarItens = useCallback(async () => {
    if (termo.length < 2) {
      setItens([])
      return
    }

    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.append('termo', termo)
      if (tipoFiltro !== 'all') params.append('tipo', tipoFiltro)
      if (classeFiltro !== 'all') params.append('codigo_classe', classeFiltro)
      params.append('limite', '50')

      const res = await fetch(`${API_URL}/api/catalogo/itens?${params}`)
      if (res.ok) {
        const data = await res.json()
        setItens(data.dados || [])
      }
    } catch (error) {
      console.error('Erro ao buscar itens:', error)
    } finally {
      setLoading(false)
    }
  }, [termo, tipoFiltro, classeFiltro])

  useEffect(() => {
    const timer = setTimeout(buscarItens, 300)
    return () => clearTimeout(timer)
  }, [buscarItens])

  const handleSelect = (item: ItemCatalogo) => {
    onChange(item)
    setOpen(false)
    setTermo('')
  }

  const handleClear = () => {
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            className={cn(
              'w-full justify-start text-left font-normal',
              !value && 'text-muted-foreground'
            )}
            disabled={disabled}
          >
            <Search className="mr-2 h-4 w-4" />
            {value ? (
              <span className="truncate">
                {value.codigo} - {value.descricao}
              </span>
            ) : (
              placeholder
            )}
          </Button>
        </DialogTrigger>

        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Catálogo de Materiais e Serviços
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Filtros */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Buscar por descrição ou código..."
                    className="pl-10"
                    value={termo}
                    onChange={(e) => setTermo(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>

              {!tipo && (
                <Select
                  value={tipoFiltro}
                  onValueChange={(v) => setTipoFiltro(v as any)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os tipos</SelectItem>
                    <SelectItem value="MATERIAL">
                      <div className="flex items-center gap-2">
                        <Package className="w-4 h-4" />
                        Material
                      </div>
                    </SelectItem>
                    <SelectItem value="SERVICO">
                      <div className="flex items-center gap-2">
                        <Wrench className="w-4 h-4" />
                        Serviço
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}

              <Select
                value={classeFiltro}
                onValueChange={setClasseFiltro}
                disabled={loadingClasses}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Classe/Grupo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as classes</SelectItem>
                  {classes.map((classe) => (
                    <SelectItem key={classe.id} value={classe.codigo}>
                      {classe.codigo} - {classe.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Resultados */}
            <ScrollArea className="h-[400px] border rounded-lg">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                </div>
              ) : termo.length < 2 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Search className="w-12 h-12 mb-4 text-gray-300" />
                  <p>Digite pelo menos 2 caracteres para buscar</p>
                </div>
              ) : itens.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                  <Package className="w-12 h-12 mb-4 text-gray-300" />
                  <p>Nenhum item encontrado</p>
                  <p className="text-sm">Tente outros termos de busca</p>
                </div>
              ) : (
                <div className="divide-y">
                  {itens.map((item) => (
                    <button
                      key={item.id}
                      className={cn(
                        'w-full p-4 text-left hover:bg-gray-50 transition-colors',
                        value?.id === item.id && 'bg-blue-50'
                      )}
                      onClick={() => handleSelect(item)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge
                              variant={item.tipo === 'MATERIAL' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {item.tipo === 'MATERIAL' ? (
                                <Package className="w-3 h-3 mr-1" />
                              ) : (
                                <Wrench className="w-3 h-3 mr-1" />
                              )}
                              {item.tipo}
                            </Badge>
                            <span className="text-sm font-mono text-gray-500">
                              {item.codigo}
                            </span>
                          </div>
                          <p className="font-medium text-gray-900">
                            {item.descricao}
                          </p>
                          {item.classe && (
                            <p className="text-sm text-gray-500 mt-1">
                              Classe: {item.classe.codigo} - {item.classe.nome}
                            </p>
                          )}
                          {item.unidade_padrao && (
                            <p className="text-xs text-gray-400 mt-1">
                              Unidade padrão: {item.unidade_padrao}
                            </p>
                          )}
                        </div>
                        {value?.id === item.id && (
                          <Check className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Rodapé */}
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>
                {itens.length > 0 && `${itens.length} item(s) encontrado(s)`}
              </span>
              <span className="text-xs">
                Fonte: Catálogo Compras.gov.br (CATMAT/CATSER)
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Item selecionado */}
      {value && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge
                variant={value.tipo === 'MATERIAL' ? 'default' : 'secondary'}
                className="text-xs"
              >
                {value.tipo}
              </Badge>
              <span className="font-mono text-sm">{value.codigo}</span>
            </div>
            <p className="text-sm font-medium mt-1">{value.descricao}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClear}
            disabled={disabled}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
