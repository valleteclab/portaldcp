'use client'

import { useState, useRef, useCallback } from 'react'
import { 
  Upload, 
  FileJson, 
  Check, 
  AlertCircle, 
  Package, 
  Wrench, 
  ExternalLink,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  FileUp,
  Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface ItemCatalogoImportado {
  sequencial?: string
  id: string
  nome: string
  carrinhoNome?: string
  carrinhoCaracteristicas?: string
  tipo: string
  unidade?: {
    nomeUnidadeMedida?: string
    siglaUnidadeMedida?: string
  }
  codigoNcmNbs?: string
  aplicaMargemPreferencia?: boolean
  // Estado local
  selecionado?: boolean
  status?: 'pendente' | 'importando' | 'sucesso' | 'erro'
}

interface ImportarCatalogoProps {
  onImportSuccess?: (count: number) => void
}

export function ImportarCatalogo({ onImportSuccess }: ImportarCatalogoProps) {
  const [open, setOpen] = useState(false)
  const [itens, setItens] = useState<ItemCatalogoImportado[]>([])
  const [loading, setLoading] = useState(false)
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<{ sucesso: number; erro: number } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processarArquivo = async (file: File) => {
    setLoading(true)
    setResultado(null)

    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      const itensArray = Array.isArray(data) ? data : data.itens || []
      const itensComStatus = itensArray.map((item: ItemCatalogoImportado) => ({
        ...item,
        selecionado: true,
        status: 'pendente' as const
      }))
      setItens(itensComStatus)
    } catch (error) {
      console.error('Erro ao ler arquivo:', error)
      alert('Erro ao ler arquivo JSON. Verifique se o formato está correto.')
    } finally {
      setLoading(false)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await processarArquivo(file)
  }

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.json')) {
      await processarArquivo(file)
    }
  }, [])

  const toggleItem = (index: number) => {
    setItens(prev => prev.map((item, i) => 
      i === index ? { ...item, selecionado: !item.selecionado } : item
    ))
  }

  const toggleTodos = () => {
    const todosSelecionados = itens.every(i => i.selecionado)
    setItens(prev => prev.map(item => ({ ...item, selecionado: !todosSelecionados })))
  }

  const removerItem = (index: number) => {
    setItens(prev => prev.filter((_, i) => i !== index))
  }

  const importarItens = async () => {
    const itensSelecionados = itens.filter(i => i.selecionado)
    if (itensSelecionados.length === 0) return

    setImportando(true)
    setProgresso(0)
    let sucesso = 0
    let erro = 0

    for (let i = 0; i < itensSelecionados.length; i++) {
      const item = itensSelecionados[i]
      const itemIndex = itens.findIndex(it => it.id === item.id)
      
      // Atualizar status para importando
      setItens(prev => prev.map((it, idx) => 
        idx === itemIndex ? { ...it, status: 'importando' } : it
      ))

      try {
        const tipoNormalizado = item.tipo?.toUpperCase().includes('SERV') ? 'SERVICO' : 'MATERIAL'
        
        let unidadeSigla = item.unidade?.siglaUnidadeMedida || 'UN'
        if (!unidadeSigla && item.unidade?.nomeUnidadeMedida) {
          const match = item.unidade.nomeUnidadeMedida.match(/\b(UN|KG|L|M|M2|M3|PCT|CX|HR|MES|DIA|RESMA|ROLO|SV)\b/i)
          unidadeSigla = match ? match[1].toUpperCase() : 'UN'
        }

        const res = await fetch(`${API_URL}/api/catalogo/importar-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: item.id,
            descricao: item.nome,
            tipo: tipoNormalizado,
            unidade_padrao: unidadeSigla,
            origem: 'COMPRASGOV',
          }),
        })

        if (res.ok) {
          sucesso++
          setItens(prev => prev.map((it, idx) => 
            idx === itemIndex ? { ...it, status: 'sucesso' } : it
          ))
        } else {
          erro++
          setItens(prev => prev.map((it, idx) => 
            idx === itemIndex ? { ...it, status: 'erro' } : it
          ))
        }
      } catch {
        erro++
        setItens(prev => prev.map((it, idx) => 
          idx === itemIndex ? { ...it, status: 'erro' } : it
        ))
      }

      setProgresso(Math.round(((i + 1) / itensSelecionados.length) * 100))
    }

    setResultado({ sucesso, erro })
    setImportando(false)
    
    if (onImportSuccess && sucesso > 0) {
      onImportSuccess(sucesso)
    }
  }

  const limpar = () => {
    setItens([])
    setResultado(null)
    setProgresso(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const itensSelecionados = itens.filter(i => i.selecionado).length
  const itensImportados = itens.filter(i => i.status === 'sucesso').length

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) limpar() }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="w-4 h-4 mr-2" />
          Importar do Catálogo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileJson className="w-6 h-6 text-blue-600" />
            Importar do Catálogo Compras.gov.br
          </DialogTitle>
          <DialogDescription>
            Importe itens do catálogo oficial CATMAT/CATSER para usar no seu PCA
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col space-y-4">
          {/* Instruções colapsáveis */}
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100 hover:border-blue-200 transition-colors">
              <Info className="w-5 h-5 text-blue-600" />
              <span className="font-medium text-blue-800">Como importar itens do catálogo?</span>
              <span className="ml-auto text-blue-600 text-sm group-open:hidden">Clique para ver</span>
            </summary>
            <div className="mt-2 p-4 bg-blue-50/50 rounded-lg border border-blue-100">
              <ol className="space-y-2 text-sm text-blue-800">
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">1</span>
                  <span>Acesse o <a href="https://catalogo.compras.gov.br" target="_blank" rel="noopener noreferrer" className="font-medium underline inline-flex items-center gap-1 hover:text-blue-600">Catálogo Compras.gov.br <ExternalLink className="w-3 h-3" /></a></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">2</span>
                  <span>Busque os materiais ou serviços desejados e adicione à sua lista</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">3</span>
                  <span>Clique no ícone do carrinho <strong>&quot;Minha lista de Itens&quot;</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">4</span>
                  <span>Clique em <strong>&quot;Exportar&quot;</strong> → <strong>&quot;JSON&quot;</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">5</span>
                  <span>Arraste o arquivo para cá ou clique para selecionar</span>
                </li>
              </ol>
            </div>
          </details>

          {/* Área de Upload */}
          {itens.length === 0 && (
            <div
              className={`
                relative border-2 border-dashed rounded-xl p-8 text-center transition-all
                ${dragActive 
                  ? 'border-blue-500 bg-blue-50 scale-[1.02]' 
                  : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }
              `}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-3">
                <div className={`p-4 rounded-full ${dragActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <FileUp className={`w-10 h-10 ${dragActive ? 'text-blue-600' : 'text-gray-400'}`} />
                </div>
                <div>
                  <p className="text-lg font-medium text-gray-700">
                    {loading ? 'Processando arquivo...' : 'Arraste o arquivo JSON aqui'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    ou clique para selecionar
                  </p>
                </div>
                {loading && <Loader2 className="w-6 h-6 animate-spin text-blue-600" />}
              </div>
            </div>
          )}

          {/* Lista de itens */}
          {itens.length > 0 && (
            <div className="flex-1 flex flex-col min-h-0">
              {/* Header da lista */}
              <div className="flex items-center justify-between py-2 px-1 border-b">
                <div className="flex items-center gap-3">
                  <Checkbox 
                    checked={itens.every(i => i.selecionado)}
                    onCheckedChange={toggleTodos}
                    disabled={importando}
                  />
                  <span className="text-sm font-medium">
                    {itensSelecionados} de {itens.length} selecionado(s)
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={limpar} disabled={importando}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Limpar
                </Button>
              </div>

              {/* Lista scrollável */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2 p-2">
                  {itens.map((item, idx) => (
                    <div
                      key={idx}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg border transition-all
                        ${item.status === 'sucesso' ? 'bg-green-50 border-green-200' : ''}
                        ${item.status === 'erro' ? 'bg-red-50 border-red-200' : ''}
                        ${item.status === 'importando' ? 'bg-blue-50 border-blue-200' : ''}
                        ${!item.status || item.status === 'pendente' ? 'bg-white border-gray-200 hover:border-gray-300' : ''}
                      `}
                    >
                      <Checkbox 
                        checked={item.selecionado}
                        onCheckedChange={() => toggleItem(idx)}
                        disabled={importando || item.status === 'sucesso'}
                      />
                      
                      <div className={`
                        p-2 rounded-lg
                        ${item.tipo?.toUpperCase().includes('SERV') ? 'bg-purple-100' : 'bg-blue-100'}
                      `}>
                        {item.tipo?.toUpperCase().includes('SERV') ? (
                          <Wrench className="w-5 h-5 text-purple-600" />
                        ) : (
                          <Package className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate" title={item.nome}>
                          {item.nome}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-gray-500">
                            Código: <span className="font-mono">{item.id}</span>
                          </span>
                          <span className="text-gray-300">|</span>
                          <span className="text-xs text-gray-500">
                            {item.unidade?.nomeUnidadeMedida || item.unidade?.siglaUnidadeMedida || 'UN'}
                          </span>
                        </div>
                      </div>

                      <Badge 
                        variant="outline" 
                        className={`
                          text-xs shrink-0
                          ${item.tipo?.toUpperCase().includes('SERV') 
                            ? 'border-purple-300 text-purple-700 bg-purple-50' 
                            : 'border-blue-300 text-blue-700 bg-blue-50'
                          }
                        `}
                      >
                        {item.tipo?.toUpperCase().includes('SERV') ? 'Serviço' : 'Material'}
                      </Badge>

                      {/* Status */}
                      <div className="w-6 flex justify-center">
                        {item.status === 'importando' && (
                          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                        )}
                        {item.status === 'sucesso' && (
                          <CheckCircle2 className="w-5 h-5 text-green-600" />
                        )}
                        {item.status === 'erro' && (
                          <XCircle className="w-5 h-5 text-red-600" />
                        )}
                      </div>

                      {!importando && item.status !== 'sucesso' && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => removerItem(idx)}
                          className="text-gray-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Barra de progresso */}
          {importando && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Importando itens...</span>
                <span className="font-medium">{progresso}%</span>
              </div>
              <Progress value={progresso} className="h-2" />
            </div>
          )}

          {/* Resultado */}
          {resultado && (
            <div className={`
              p-4 rounded-lg flex items-center gap-3
              ${resultado.erro > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}
            `}>
              {resultado.erro > 0 ? (
                <AlertCircle className="w-6 h-6 text-yellow-600 shrink-0" />
              ) : (
                <CheckCircle2 className="w-6 h-6 text-green-600 shrink-0" />
              )}
              <div>
                <p className={`font-medium ${resultado.erro > 0 ? 'text-yellow-800' : 'text-green-800'}`}>
                  {resultado.sucesso} item(ns) importado(s) com sucesso!
                </p>
                {resultado.erro > 0 && (
                  <p className="text-sm text-yellow-700">
                    {resultado.erro} item(ns) não puderam ser importados
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Botões */}
          <div className="flex items-center justify-between pt-2 border-t">
            <div className="text-sm text-gray-500">
              {itensImportados > 0 && (
                <span className="text-green-600 font-medium">
                  ✓ {itensImportados} importado(s)
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {resultado ? 'Concluir' : 'Cancelar'}
              </Button>
              {itens.length > 0 && !resultado && (
                <Button 
                  onClick={importarItens} 
                  disabled={importando || itensSelecionados === 0}
                  className="min-w-[140px]"
                >
                  {importando ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Importar {itensSelecionados}
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
