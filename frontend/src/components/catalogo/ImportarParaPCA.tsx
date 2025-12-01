'use client'

import { useState, useRef, useCallback } from 'react'
import { 
  Upload, 
  FileJson, 
  Package, 
  Wrench, 
  ExternalLink,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  FileUp,
  Info,
  ChevronRight,
  ChevronLeft,
  Save,
  Calendar,
  RefreshCw,
  Clock
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { UnidadeMedidaSelect } from './UnidadeMedidaSelect'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const API_COMPRAS_GOV = 'https://dadosabertos.compras.gov.br'

interface ClassificacaoItem {
  codigoGrupo?: number
  nomeGrupo?: string
  codigoClasse?: number
  nomeClasse?: string
  codigoSecao?: number
  nomeSecao?: string
  codigoDivisao?: number
  nomeDivisao?: string
}

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
  selecionado?: boolean
  // Classificação (buscada da API)
  classificacao?: ClassificacaoItem
  carregandoClassificacao?: boolean
  // Campos do PCA
  quantidade_estimada?: string
  valor_unitario_estimado?: string
  unidade_medida?: string
  trimestre_previsto?: string
  prioridade?: string
  unidade_requisitante?: string
  justificativa?: string
  // Campos para serviços continuados
  duracao_meses?: string
  renovacao_contrato?: 'SIM' | 'NAO' | ''
  data_desejada_contratacao?: string
  preenchido?: boolean
}

interface ImportarParaPCAProps {
  pcaId: string
  onImportSuccess?: (count: number) => void
}

const PRIORIDADES = {
  1: { label: 'Muito Alta', cor: 'bg-red-100 text-red-800' },
  2: { label: 'Alta', cor: 'bg-orange-100 text-orange-800' },
  3: { label: 'Média', cor: 'bg-yellow-100 text-yellow-800' },
  4: { label: 'Baixa', cor: 'bg-blue-100 text-blue-800' },
  5: { label: 'Muito Baixa', cor: 'bg-gray-100 text-gray-800' }
}

export function ImportarParaPCA({ pcaId, onImportSuccess }: ImportarParaPCAProps) {
  const [open, setOpen] = useState(false)
  const [etapa, setEtapa] = useState<'upload' | 'selecao' | 'preenchimento' | 'importando' | 'concluido'>('upload')
  const [itens, setItens] = useState<ItemCatalogoImportado[]>([])
  const [itemAtualIndex, setItemAtualIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<{ sucesso: number; erro: number } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Buscar classificação na API do Compras.gov.br
  const buscarClassificacao = async (codigo: string, tipo: string): Promise<ClassificacaoItem | null> => {
    try {
      const isServico = tipo?.toUpperCase().includes('SERV')
      
      if (isServico) {
        // Buscar serviço
        const response = await fetch(
          `${API_COMPRAS_GOV}/modulo-servico/6_consultarItemServico?pagina=1&tamanhoPagina=1&codigoServico=${codigo}`
        )
        if (response.ok) {
          const data = await response.json()
          if (data.resultado && data.resultado.length > 0) {
            const item = data.resultado[0]
            return {
              codigoGrupo: item.codigoGrupo,
              nomeGrupo: item.nomeGrupo,
              codigoClasse: item.codigoClasse,
              nomeClasse: item.nomeClasse || item.nomeGrupo, // Se não tiver classe, usa grupo
              codigoSecao: item.codigoSecao,
              nomeSecao: item.nomeSecao,
              codigoDivisao: item.codigoDivisao,
              nomeDivisao: item.nomeDivisao
            }
          }
        }
      } else {
        // Buscar material
        const response = await fetch(
          `${API_COMPRAS_GOV}/modulo-material/4_consultarItemMaterial?pagina=1&tamanhoPagina=1&codigoItem=${codigo}&bps=false`
        )
        if (response.ok) {
          const data = await response.json()
          if (data.resultado && data.resultado.length > 0) {
            const item = data.resultado[0]
            return {
              codigoGrupo: item.codigoGrupo,
              nomeGrupo: item.nomeGrupo,
              codigoClasse: item.codigoClasse,
              nomeClasse: item.nomeClasse
            }
          }
        }
      }
    } catch (error) {
      console.error('Erro ao buscar classificação:', error)
    }
    return null
  }

  const processarArquivo = async (file: File) => {
    setLoading(true)
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      
      const itensArray = Array.isArray(data) ? data : data.itens || []
      const isServico = (tipo: string) => tipo?.toUpperCase().includes('SERV')
      
      const itensComCampos = itensArray.map((item: ItemCatalogoImportado) => ({
        ...item,
        selecionado: true,
        quantidade_estimada: '1',
        valor_unitario_estimado: '',
        // Usar unidade do JSON
        unidade_medida: item.unidade?.siglaUnidadeMedida || item.unidade?.nomeUnidadeMedida?.split(' ')[0] || 'UN',
        trimestre_previsto: '1',
        prioridade: '3',
        unidade_requisitante: '',
        justificativa: '',
        // Campos para serviços
        duracao_meses: isServico(item.tipo) ? '12' : '',
        renovacao_contrato: '' as const,
        data_desejada_contratacao: '',
        carregandoClassificacao: true,
        preenchido: false
      }))
      
      setItens(itensComCampos)
      setEtapa('selecao')
      
      // Buscar classificação para cada item em background
      for (let i = 0; i < itensComCampos.length; i++) {
        const item = itensComCampos[i]
        const classificacao = await buscarClassificacao(item.id, item.tipo)
        
        setItens(prev => prev.map((it, idx) => 
          idx === i ? { 
            ...it, 
            classificacao: classificacao || undefined,
            carregandoClassificacao: false 
          } : it
        ))
      }
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

  const itensSelecionados = itens.filter(i => i.selecionado)
  const itemAtual = itensSelecionados[itemAtualIndex]

  const atualizarItemAtual = (campo: string, valor: string) => {
    const indexReal = itens.findIndex(i => i.id === itemAtual?.id)
    if (indexReal >= 0) {
      setItens(prev => prev.map((item, i) => 
        i === indexReal ? { ...item, [campo]: valor } : item
      ))
    }
  }

  const isServico = (tipo?: string) => tipo?.toUpperCase().includes('SERV')

  const validarItemAtual = () => {
    if (!itemAtual) return false
    const validacaoBasica = (
      itemAtual.quantidade_estimada && 
      parseFloat(itemAtual.quantidade_estimada) > 0 &&
      itemAtual.valor_unitario_estimado && 
      parseFloat(itemAtual.valor_unitario_estimado) > 0 &&
      itemAtual.trimestre_previsto &&
      itemAtual.prioridade &&
      itemAtual.justificativa?.trim()
    )
    
    // Para serviços, duração é obrigatória
    if (isServico(itemAtual.tipo)) {
      return validacaoBasica && 
        itemAtual.duracao_meses && 
        parseInt(itemAtual.duracao_meses) > 0
    }
    
    return validacaoBasica
  }

  const marcarPreenchido = () => {
    const indexReal = itens.findIndex(i => i.id === itemAtual?.id)
    if (indexReal >= 0) {
      setItens(prev => prev.map((item, i) => 
        i === indexReal ? { ...item, preenchido: true } : item
      ))
    }
  }

  const proximoItem = () => {
    if (validarItemAtual()) {
      marcarPreenchido()
      if (itemAtualIndex < itensSelecionados.length - 1) {
        setItemAtualIndex(itemAtualIndex + 1)
      }
    } else {
      alert('Preencha todos os campos obrigatórios antes de continuar.')
    }
  }

  const itemAnterior = () => {
    if (itemAtualIndex > 0) {
      setItemAtualIndex(itemAtualIndex - 1)
    }
  }

  const iniciarPreenchimento = () => {
    if (itensSelecionados.length === 0) {
      alert('Selecione pelo menos um item para importar.')
      return
    }
    setItemAtualIndex(0)
    setEtapa('preenchimento')
  }

  const importarItens = async () => {
    if (!validarItemAtual()) {
      alert('Preencha todos os campos obrigatórios.')
      return
    }
    marcarPreenchido()

    setEtapa('importando')
    setProgresso(0)
    let sucesso = 0
    let erro = 0

    const itensParaImportar = itensSelecionados.filter(i => i.preenchido || i.id === itemAtual?.id)

    for (let i = 0; i < itensParaImportar.length; i++) {
      const item = itensParaImportar[i]
      
      try {
        const tipoNormalizado = item.tipo?.toUpperCase().includes('SERV') ? 'SERVICO' : 'MATERIAL'
        const quantidade = parseFloat(item.quantidade_estimada || '1')
        const valorUnitario = parseFloat(item.valor_unitario_estimado || '0')
        const duracaoMeses = parseInt(item.duracao_meses || '0')
        
        // Para serviços, valor total considera a duração
        const valorTotal = isServico(item.tipo) && duracaoMeses > 0
          ? quantidade * valorUnitario * duracaoMeses
          : quantidade * valorUnitario

        // Primeiro, salvar no catálogo
        await fetch(`${API_URL}/api/catalogo/importar-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: item.id,
            descricao: item.nome,
            tipo: tipoNormalizado,
            unidade_padrao: item.unidade_medida || 'UN',
            origem: 'COMPRASGOV',
            codigo_classe: item.classificacao?.codigoClasse || item.classificacao?.codigoGrupo,
            nome_classe: item.classificacao?.nomeClasse || item.classificacao?.nomeGrupo,
          }),
        })

        // Depois, adicionar ao PCA
        const response = await fetch(`${API_URL}/api/pca/${pcaId}/itens`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            categoria: tipoNormalizado,
            descricao_objeto: item.nome,
            codigo_item_catalogo: item.id,
            descricao_item_catalogo: item.nome,
            quantidade_estimada: quantidade,
            valor_unitario_estimado: valorUnitario,
            valor_estimado: valorTotal,
            unidade_medida: item.unidade_medida || 'UN',
            trimestre_previsto: parseInt(item.trimestre_previsto || '1'),
            prioridade: parseInt(item.prioridade || '3'),
            unidade_requisitante: item.unidade_requisitante || '',
            justificativa: item.justificativa || '',
            catalogo_utilizado: 'COMPRASGOV',
            classificacao_catalogo: tipoNormalizado,
            // Classificação
            codigo_classe: item.classificacao?.codigoClasse || item.classificacao?.codigoGrupo,
            nome_classe: item.classificacao?.nomeClasse || item.classificacao?.nomeGrupo,
            codigo_grupo: item.classificacao?.codigoGrupo,
            nome_grupo: item.classificacao?.nomeGrupo,
            // Campos para serviços continuados
            duracao_meses: duracaoMeses || null,
            renovacao_contrato: item.renovacao_contrato || null,
            data_desejada_contratacao: item.data_desejada_contratacao || null
          })
        })

        if (response.ok) {
          sucesso++
        } else {
          erro++
        }
      } catch {
        erro++
      }

      setProgresso(Math.round(((i + 1) / itensParaImportar.length) * 100))
    }

    setResultado({ sucesso, erro })
    setEtapa('concluido')
    
    if (onImportSuccess && sucesso > 0) {
      onImportSuccess(sucesso)
    }
  }

  const limpar = () => {
    setItens([])
    setEtapa('upload')
    setItemAtualIndex(0)
    setResultado(null)
    setProgresso(0)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const fechar = () => {
    setOpen(false)
    setTimeout(limpar, 300)
  }

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setTimeout(limpar, 300) }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="w-4 h-4 mr-2" />
          Importar do Catálogo
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <FileJson className="w-6 h-6 text-blue-600" />
            Importar Itens para o PCA
          </DialogTitle>
          <DialogDescription>
            Importe itens do catálogo oficial e adicione diretamente ao seu PCA
          </DialogDescription>
        </DialogHeader>

        {/* Indicador de etapas */}
        <div className="flex items-center justify-center gap-2 py-2">
          {['Upload', 'Seleção', 'Preenchimento', 'Concluído'].map((label, idx) => {
            const etapas = ['upload', 'selecao', 'preenchimento', 'concluido']
            const etapaAtual = etapas.indexOf(etapa === 'importando' ? 'preenchimento' : etapa)
            const isAtiva = idx <= etapaAtual
            const isConcluida = idx < etapaAtual
            
            return (
              <div key={label} className="flex items-center">
                <div className={`
                  flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium
                  ${isAtiva ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-500'}
                  ${isConcluida ? 'bg-green-600' : ''}
                `}>
                  {isConcluida ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                </div>
                <span className={`ml-2 text-sm ${isAtiva ? 'text-gray-900 font-medium' : 'text-gray-500'}`}>
                  {label}
                </span>
                {idx < 3 && <ChevronRight className="w-4 h-4 mx-2 text-gray-400" />}
              </div>
            )
          })}
        </div>

        <div className="flex-1 overflow-hidden flex flex-col">
          {/* ETAPA 1: Upload */}
          {etapa === 'upload' && (
            <div className="flex-1 flex flex-col space-y-4">
              <details className="group" open>
                <summary className="flex items-center gap-2 cursor-pointer p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-100">
                  <Info className="w-5 h-5 text-blue-600" />
                  <span className="font-medium text-blue-800">Como importar itens do catálogo?</span>
                </summary>
                <div className="mt-2 p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                  <ol className="space-y-2 text-sm text-blue-800">
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">1</span>
                      <span>Acesse o <a href="https://catalogo.compras.gov.br" target="_blank" rel="noopener noreferrer" className="font-medium underline inline-flex items-center gap-1">Catálogo Compras.gov.br <ExternalLink className="w-3 h-3" /></a></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">2</span>
                      <span>Busque e adicione os itens desejados à sua lista</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">3</span>
                      <span>Clique em <strong>&quot;Minha lista de Itens&quot;</strong> → <strong>&quot;Exportar&quot;</strong> → <strong>&quot;JSON&quot;</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">4</span>
                      <span>Arraste o arquivo para cá ou clique para selecionar</span>
                    </li>
                  </ol>
                </div>
              </details>

              <div
                className={`
                  flex-1 relative border-2 border-dashed rounded-xl p-8 text-center transition-all min-h-[200px] flex items-center justify-center
                  ${dragActive ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'}
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
                    <FileUp className={`w-12 h-12 ${dragActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-gray-700">
                      {loading ? 'Processando arquivo...' : 'Arraste o arquivo JSON aqui'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">ou clique para selecionar</p>
                  </div>
                  {loading && <Loader2 className="w-6 h-6 animate-spin text-blue-600" />}
                </div>
              </div>
            </div>
          )}

          {/* ETAPA 2: Seleção */}
          {etapa === 'selecao' && (
            <div className="flex-1 flex flex-col min-h-0 space-y-4">
              <div className="flex items-center justify-between py-2 px-1 border-b">
                <div className="flex items-center gap-3">
                  <Checkbox 
                    checked={itens.every(i => i.selecionado)}
                    onCheckedChange={toggleTodos}
                  />
                  <span className="text-sm font-medium">
                    {itensSelecionados.length} de {itens.length} selecionado(s)
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={limpar}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Limpar
                </Button>
              </div>

              <ScrollArea className="flex-1 min-h-0">
                <div className="space-y-2 p-2">
                  {itens.map((item, idx) => (
                    <div
                      key={idx}
                      className={`
                        flex items-center gap-3 p-3 rounded-lg border transition-all
                        ${item.selecionado ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200'}
                      `}
                    >
                      <Checkbox 
                        checked={item.selecionado}
                        onCheckedChange={() => toggleItem(idx)}
                      />
                      
                      <div className={`p-2 rounded-lg ${item.tipo?.toUpperCase().includes('SERV') ? 'bg-purple-100' : 'bg-blue-100'}`}>
                        {item.tipo?.toUpperCase().includes('SERV') ? (
                          <Wrench className="w-5 h-5 text-purple-600" />
                        ) : (
                          <Package className="w-5 h-5 text-blue-600" />
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{item.nome}</p>
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <span>Código: <span className="font-mono">{item.id}</span></span>
                          <span>| {item.unidade?.siglaUnidadeMedida || item.unidade?.nomeUnidadeMedida || 'UN'}</span>
                          {item.carregandoClassificacao && (
                            <span className="flex items-center gap-1 text-blue-500">
                              <Loader2 className="w-3 h-3 animate-spin" />
                            </span>
                          )}
                          {item.classificacao && (
                            <span className="text-green-600">
                              | {item.classificacao.nomeClasse || item.classificacao.nomeGrupo}
                            </span>
                          )}
                        </div>
                      </div>

                      <Badge variant="outline" className={`text-xs ${isServico(item.tipo) ? 'border-purple-300 text-purple-700' : 'border-blue-300 text-blue-700'}`}>
                        {isServico(item.tipo) ? 'Serviço' : 'Material'}
                      </Badge>

                      <Button variant="ghost" size="sm" onClick={() => removerItem(idx)} className="text-gray-400 hover:text-red-600">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex justify-between pt-2 border-t">
                <Button variant="outline" onClick={limpar}>Voltar</Button>
                <Button onClick={iniciarPreenchimento} disabled={itensSelecionados.length === 0}>
                  Continuar ({itensSelecionados.length} itens)
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* ETAPA 3: Preenchimento */}
          {etapa === 'preenchimento' && itemAtual && (
            <div className="flex-1 flex flex-col space-y-4">
              {/* Header do item */}
              <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                <div className={`p-3 rounded-lg ${isServico(itemAtual.tipo) ? 'bg-purple-100' : 'bg-blue-100'}`}>
                  {isServico(itemAtual.tipo) ? (
                    <Wrench className="w-6 h-6 text-purple-600" />
                  ) : (
                    <Package className="w-6 h-6 text-blue-600" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{itemAtual.nome}</p>
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <span>Código: {itemAtual.id}</span>
                    {itemAtual.carregandoClassificacao ? (
                      <span className="flex items-center gap-1 text-blue-600">
                        <Loader2 className="w-3 h-3 animate-spin" /> Buscando classificação...
                      </span>
                    ) : itemAtual.classificacao && (
                      <span className="text-green-600">
                        | Classe: {itemAtual.classificacao.nomeClasse || itemAtual.classificacao.nomeGrupo}
                      </span>
                    )}
                  </div>
                </div>
                <Badge className="text-sm">
                  Item {itemAtualIndex + 1} de {itensSelecionados.length}
                </Badge>
              </div>

              {/* Classificação (somente leitura) */}
              {itemAtual.classificacao && (
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs font-medium text-blue-800 mb-1">Classificação do Catálogo</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-blue-600">Código Classe/Grupo:</span>{' '}
                      <span className="font-mono">{itemAtual.classificacao.codigoClasse || itemAtual.classificacao.codigoGrupo}</span>
                    </div>
                    <div>
                      <span className="text-blue-600">Nome:</span>{' '}
                      {itemAtual.classificacao.nomeClasse || itemAtual.classificacao.nomeGrupo}
                    </div>
                  </div>
                </div>
              )}

              {/* Formulário */}
              <ScrollArea className="flex-1">
                <div className="space-y-4 p-1">
                  {/* Campos para SERVIÇOS CONTINUADOS */}
                  {isServico(itemAtual.tipo) && (
                    <div className="p-4 bg-purple-50 rounded-lg border border-purple-200 space-y-4">
                      <div className="flex items-center gap-2 text-purple-800 font-medium">
                        <Clock className="w-4 h-4" />
                        Serviço Continuado
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <Label className="text-purple-800">Duração (meses) *</Label>
                          <Input
                            type="number"
                            min="1"
                            max="60"
                            value={itemAtual.duracao_meses}
                            onChange={(e) => atualizarItemAtual('duracao_meses', e.target.value)}
                            placeholder="Ex: 12"
                            className="mt-1"
                          />
                          <p className="text-xs text-purple-600 mt-1">
                            Ex: Licença anual = 12, Contrato 2 anos = 24
                          </p>
                        </div>
                        <div>
                          <Label className="text-purple-800">Renovação de Contrato</Label>
                          <Select 
                            value={itemAtual.renovacao_contrato} 
                            onValueChange={(v) => atualizarItemAtual('renovacao_contrato', v)}
                          >
                            <SelectTrigger className="mt-1">
                              <SelectValue placeholder="Selecione..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="NAO">Não - Nova Contratação</SelectItem>
                              <SelectItem value="SIM">Sim - Renovação</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-purple-800">Data Desejada</Label>
                          <Input
                            type="date"
                            value={itemAtual.data_desejada_contratacao}
                            onChange={(e) => atualizarItemAtual('data_desejada_contratacao', e.target.value)}
                            className="mt-1"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>
                        {isServico(itemAtual.tipo) ? 'Quantidade (unidades/licenças) *' : 'Quantidade *'}
                      </Label>
                      <Input
                        type="number"
                        min="1"
                        value={itemAtual.quantidade_estimada}
                        onChange={(e) => atualizarItemAtual('quantidade_estimada', e.target.value)}
                        placeholder={isServico(itemAtual.tipo) ? "Ex: 15 impressoras" : "Ex: 100"}
                        className="mt-1"
                      />
                      {isServico(itemAtual.tipo) && (
                        <p className="text-xs text-gray-500 mt-1">
                          Ex: 15 impressoras, 50 licenças
                        </p>
                      )}
                    </div>
                    <div>
                      <Label>Unidade de Medida</Label>
                      <div className="mt-1">
                        <UnidadeMedidaSelect
                          value={itemAtual.unidade_medida || 'UN'}
                          onChange={(v) => atualizarItemAtual('unidade_medida', v)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>
                        {isServico(itemAtual.tipo) ? 'Valor Unitário Mensal (R$) *' : 'Valor Unitário (R$) *'}
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={itemAtual.valor_unitario_estimado}
                        onChange={(e) => atualizarItemAtual('valor_unitario_estimado', e.target.value)}
                        placeholder="Ex: 25.50"
                        className="mt-1"
                      />
                    </div>
                  </div>

                  {/* Valor total calculado */}
                  {itemAtual.quantidade_estimada && itemAtual.valor_unitario_estimado && (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="text-sm text-green-800">
                        {isServico(itemAtual.tipo) && itemAtual.duracao_meses ? (
                          <>
                            <p>
                              <strong>Valor Mensal:</strong>{' '}
                              {formatarMoeda(
                                parseFloat(itemAtual.quantidade_estimada) * parseFloat(itemAtual.valor_unitario_estimado)
                              )}
                              {' '}({itemAtual.quantidade_estimada} x {formatarMoeda(parseFloat(itemAtual.valor_unitario_estimado))})
                            </p>
                            <p className="mt-1">
                              <strong>Valor Total ({itemAtual.duracao_meses} meses):</strong>{' '}
                              <span className="text-lg font-bold">
                                {formatarMoeda(
                                  parseFloat(itemAtual.quantidade_estimada) * 
                                  parseFloat(itemAtual.valor_unitario_estimado) * 
                                  parseInt(itemAtual.duracao_meses)
                                )}
                              </span>
                            </p>
                          </>
                        ) : (
                          <p>
                            <strong>Valor Total Estimado:</strong>{' '}
                            {formatarMoeda(
                              parseFloat(itemAtual.quantidade_estimada) * parseFloat(itemAtual.valor_unitario_estimado)
                            )}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Trimestre Previsto *</Label>
                      <Select value={itemAtual.trimestre_previsto} onValueChange={(v) => atualizarItemAtual('trimestre_previsto', v)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1º Trimestre (Jan-Mar)</SelectItem>
                          <SelectItem value="2">2º Trimestre (Abr-Jun)</SelectItem>
                          <SelectItem value="3">3º Trimestre (Jul-Set)</SelectItem>
                          <SelectItem value="4">4º Trimestre (Out-Dez)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Prioridade *</Label>
                      <Select value={itemAtual.prioridade} onValueChange={(v) => atualizarItemAtual('prioridade', v)}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Selecione..." />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(PRIORIDADES).map(([key, val]) => (
                            <SelectItem key={key} value={key}>{val.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>Unidade Requisitante</Label>
                    <Input
                      value={itemAtual.unidade_requisitante}
                      onChange={(e) => atualizarItemAtual('unidade_requisitante', e.target.value)}
                      placeholder="Ex: Secretaria de Administração"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Justificativa *</Label>
                    <Textarea
                      value={itemAtual.justificativa}
                      onChange={(e) => atualizarItemAtual('justificativa', e.target.value)}
                      placeholder="Justifique a necessidade desta contratação..."
                      rows={3}
                      className="mt-1"
                    />
                  </div>
                </div>
              </ScrollArea>

              {/* Navegação */}
              <div className="flex justify-between pt-2 border-t">
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEtapa('selecao')}>
                    <ChevronLeft className="w-4 h-4 mr-1" />
                    Voltar
                  </Button>
                  {itemAtualIndex > 0 && (
                    <Button variant="outline" onClick={itemAnterior}>
                      <ChevronLeft className="w-4 h-4 mr-1" />
                      Anterior
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {itemAtualIndex < itensSelecionados.length - 1 ? (
                    <Button onClick={proximoItem}>
                      Próximo
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  ) : (
                    <Button onClick={importarItens} className="bg-green-600 hover:bg-green-700">
                      <Save className="w-4 h-4 mr-2" />
                      Importar para o PCA
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ETAPA 4: Importando */}
          {etapa === 'importando' && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              <p className="text-lg font-medium">Importando itens para o PCA...</p>
              <div className="w-full max-w-md">
                <Progress value={progresso} className="h-3" />
                <p className="text-center text-sm text-gray-500 mt-2">{progresso}%</p>
              </div>
            </div>
          )}

          {/* ETAPA 5: Concluído */}
          {etapa === 'concluido' && resultado && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-6">
              <div className={`p-4 rounded-full ${resultado.erro > 0 ? 'bg-yellow-100' : 'bg-green-100'}`}>
                {resultado.erro > 0 ? (
                  <XCircle className="w-16 h-16 text-yellow-600" />
                ) : (
                  <CheckCircle2 className="w-16 h-16 text-green-600" />
                )}
              </div>
              
              <div className="text-center">
                <h3 className="text-xl font-semibold">
                  {resultado.erro > 0 ? 'Importação Parcial' : 'Importação Concluída!'}
                </h3>
                <p className="text-gray-600 mt-2">
                  {resultado.sucesso} item(ns) adicionado(s) ao PCA com sucesso
                  {resultado.erro > 0 && `, ${resultado.erro} erro(s)`}
                </p>
              </div>

              <Button onClick={fechar} size="lg">
                Concluir
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
