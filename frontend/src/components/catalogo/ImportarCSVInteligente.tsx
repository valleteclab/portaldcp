'use client'

import { useState, useRef, useCallback } from 'react'
import { 
  Upload, 
  FileSpreadsheet, 
  Sparkles,
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  FileUp,
  Info,
  Save,
  AlertTriangle,
  Link2,
  Plus
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import { API_URL, authFetch } from '@/lib/api'

interface ItemCSVSimplificado {
  numero_item: number
  descricao: string
  unidade: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  valor_orcamentario: number
  renovacao: string
  data_desejada: string
  selecionado: boolean
}

interface ImportarCSVInteligenteProps {
  pcaId: string
  onImportSuccess?: (count: number) => void
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor)
}

function parseValorMonetario(valor: string): number {
  if (!valor) return 0
  const limpo = valor
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim()
  return parseFloat(limpo) || 0
}

function parseData(data: string): string {
  if (!data) return ''
  
  // Tenta converter d/m/yyyy ou dd/mm/yyyy para yyyy-mm-dd
  // Formato brasileiro: dia/mês/ano
  const match = data.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (match) {
    const dia = match[1].padStart(2, '0')
    const mes = match[2].padStart(2, '0')
    const ano = match[3]
    return `${ano}-${mes}-${dia}`
  }
  
  // Tenta yyyy-mm-dd (já no formato correto)
  const matchIso = data.match(/(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (matchIso) {
    return `${matchIso[1]}-${matchIso[2].padStart(2, '0')}-${matchIso[3].padStart(2, '0')}`
  }
  
  return data
}

export function ImportarCSVInteligente({ pcaId, onImportSuccess }: ImportarCSVInteligenteProps) {
  const [open, setOpen] = useState(false)
  const [etapa, setEtapa] = useState<'upload' | 'preview' | 'importando' | 'concluido'>('upload')
  const [itens, setItens] = useState<ItemCSVSimplificado[]>([])
  const [loading, setLoading] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<{ 
    importados: number; 
    enriquecidos: number;
    novos: number;
    erros: number;
    anoPca?: number;
    itensDataForaAno?: { descricao: string; data: string }[];
    itensSemClassificacao?: { descricao: string; numero_item: number }[];
    detalhes?: { descricao: string; status: string; motivo?: string; itemBase?: string; numero_item?: number }[]
  } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [errosValidacao, setErrosValidacao] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const limpar = () => {
    setItens([])
    setEtapa('upload')
    setProgresso(0)
    setResultado(null)
    setErrosValidacao([])
  }

  const fechar = () => {
    // Chamar onImportSuccess apenas ao fechar, para não causar re-render durante exibição do resultado
    if (resultado && resultado.importados > 0 && onImportSuccess) {
      onImportSuccess(resultado.importados)
    }
    limpar()
    setOpen(false)
  }

  const processarCSV = async (file: File) => {
    setLoading(true)
    setErrosValidacao([])
    
    try {
      let text = await file.text()
      
      // Detectar encoding
      if (text.includes('�') || text.includes('Ã§') || text.includes('Ã£')) {
        const buffer = await file.arrayBuffer()
        const decoder = new TextDecoder('iso-8859-1')
        text = decoder.decode(buffer)
      }
      
      const linhas = text.split('\n').filter(l => l.trim())
      
      if (linhas.length < 2) {
        setErrosValidacao(['Arquivo CSV vazio ou sem dados'])
        setLoading(false)
        return
      }

      // Detectar delimitador
      const primeiraLinha = linhas[0]
      const delimitador = primeiraLinha.includes(';') ? ';' : ','
      
      // Detectar colunas pelo cabeçalho
      const cabecalho = primeiraLinha.split(delimitador).map(c => c.trim().toLowerCase())
      console.log('Colunas detectadas:', cabecalho)
      
      // Mapear índices das colunas
      const colDescricao = cabecalho.findIndex(c => c.includes('descrição') || c.includes('descricao'))
      const colUnidade = cabecalho.findIndex(c => c.includes('unidade') && c.includes('fornecimento'))
      const colQuantidade = cabecalho.findIndex(c => c.includes('quantidade'))
      const colValorUnit = cabecalho.findIndex(c => c.includes('unitário') || c.includes('unitario'))
      const colValorTotal = cabecalho.findIndex(c => c.includes('total') && !c.includes('orçamentário'))
      const colValorOrc = cabecalho.findIndex(c => c.includes('orçamentário') || c.includes('orcamentario'))
      const colRenovacao = cabecalho.findIndex(c => c.includes('renovação') || c.includes('renovacao'))
      const colData = cabecalho.findIndex(c => c.includes('data') && c.includes('desejada'))

      console.log('Índices das colunas:', { colDescricao, colUnidade, colQuantidade, colValorUnit, colValorTotal, colValorOrc, colRenovacao, colData })

      if (colDescricao === -1) {
        setErrosValidacao(['Coluna "Descrição do Item" não encontrada no CSV'])
        setLoading(false)
        return
      }

      const itensProcessados: ItemCSVSimplificado[] = []
      const erros: string[] = []

      for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i].trim()
        if (!linha) continue

        // Parse considerando aspas
        const colunas = parseCsvLine(linha, delimitador)
        
        const descricao = colunas[colDescricao]?.trim() || ''
        
        if (!descricao) {
          erros.push(`Linha ${i + 1}: Descrição vazia`)
          continue
        }

        const item: ItemCSVSimplificado = {
          numero_item: i, // Número da linha no CSV (1-indexed)
          descricao,
          unidade: colUnidade >= 0 ? (colunas[colUnidade]?.trim() || 'UN') : 'UN',
          quantidade: colQuantidade >= 0 ? parseFloat(colunas[colQuantidade]?.replace(',', '.')) || 1 : 1,
          valor_unitario: colValorUnit >= 0 ? parseValorMonetario(colunas[colValorUnit] || '0') : 0,
          valor_total: colValorTotal >= 0 ? parseValorMonetario(colunas[colValorTotal] || '0') : 0,
          valor_orcamentario: colValorOrc >= 0 ? parseValorMonetario(colunas[colValorOrc] || '0') : 0,
          renovacao: colRenovacao >= 0 ? (colunas[colRenovacao]?.trim() || '2-Não') : '2-Não',
          data_desejada: colData >= 0 ? (colunas[colData]?.trim() || '') : '',
          selecionado: true
        }

        // Calcular valor total se não informado
        if (item.valor_total <= 0 && item.valor_unitario > 0 && item.quantidade > 0) {
          item.valor_total = item.valor_unitario * item.quantidade
        }

        itensProcessados.push(item)
      }

      if (erros.length > 0) {
        setErrosValidacao(erros.slice(0, 10))
      }

      console.log(`${itensProcessados.length} itens processados do CSV`)
      setItens(itensProcessados)
      setEtapa('preview')
    } catch (error) {
      console.error('Erro ao processar CSV:', error)
      setErrosValidacao(['Erro ao processar arquivo CSV. Verifique o formato.'])
    } finally {
      setLoading(false)
    }
  }

  // Parser de CSV que respeita aspas
  const parseCsvLine = (linha: string, delimitador: string): string[] => {
    const resultado: string[] = []
    let atual = ''
    let dentroAspas = false

    for (let i = 0; i < linha.length; i++) {
      const char = linha[i]
      
      if (char === '"') {
        dentroAspas = !dentroAspas
      } else if (char === delimitador && !dentroAspas) {
        resultado.push(atual.trim())
        atual = ''
      } else {
        atual += char
      }
    }
    resultado.push(atual.trim())
    
    return resultado
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) await processarCSV(file)
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
    if (file && (file.name.endsWith('.csv') || file.name.endsWith('.CSV'))) {
      await processarCSV(file)
    }
  }, [])

  const toggleItem = (numeroItem: number) => {
    setItens(prev => prev.map(item => 
      item.numero_item === numeroItem ? { ...item, selecionado: !item.selecionado } : item
    ))
  }

  const toggleTodos = () => {
    const todosSelecionados = itens.every(i => i.selecionado)
    setItens(prev => prev.map(item => ({ ...item, selecionado: !todosSelecionados })))
  }

  const itensSelecionados = itens.filter(i => i.selecionado)

  const importarItens = async () => {
    if (itensSelecionados.length === 0) {
      alert('Selecione pelo menos um item para importar.')
      return
    }

    setEtapa('importando')
    setProgresso(10)

    console.log('=== INICIANDO IMPORTAÇÃO INTELIGENTE ===')
    console.log(`Total de itens selecionados: ${itensSelecionados.length}`)
    console.log(`PCA ID: ${pcaId}`)

    // Ordenar itens por numero_item antes de enviar
    const itensOrdenados = [...itensSelecionados].sort((a, b) => a.numero_item - b.numero_item)

    const itensParaImportar = itensOrdenados.map(item => {
      const dataOriginal = item.data_desejada
      const dataConvertida = parseData(item.data_desejada)
      console.log(`[DEBUG DATA] Item: "${item.descricao.substring(0, 30)}..." | Original: "${dataOriginal}" | Convertida: "${dataConvertida}"`)
      
      return {
        descricao: item.descricao,
        quantidade: item.quantidade,
        valor_unitario: item.valor_unitario,
        valor_total: item.valor_total,
        unidade: item.unidade,
        renovacao: item.renovacao,
        data_desejada: dataConvertida
      }
    })

    setProgresso(30)

    try {
      console.log(`Enviando para ${API_URL}/api/pca/${pcaId}/importar-inteligente`)
      
      const response = await authFetch(`${API_URL}/api/pca/${pcaId}/importar-inteligente`, {
        method: 'POST',
        body: JSON.stringify({ 
          itens: itensParaImportar 
        })
      })

      setProgresso(90)

      if (response.ok) {
        const resultado = await response.json()
        console.log('=== RESULTADO DA IMPORTAÇÃO INTELIGENTE ===')
        console.log('Importados:', resultado.importados)
        console.log('Enriquecidos:', resultado.enriquecidos)
        console.log('Novos:', resultado.novos)
        console.log('Erros:', resultado.erros)
        
        setResultado(resultado)
        setEtapa('concluido')
        // onImportSuccess será chamado ao fechar o modal para evitar re-render
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Erro na importação:', errorData)
        setResultado({ 
          importados: 0, 
          enriquecidos: 0,
          novos: 0,
          erros: itensSelecionados.length,
          detalhes: [{ descricao: 'Erro geral', status: 'erro', motivo: errorData.message || `HTTP ${response.status}` }]
        })
        setEtapa('concluido')
      }
    } catch (e) {
      console.error('Exceção na importação:', e)
      setResultado({ 
        importados: 0, 
        enriquecidos: 0,
        novos: 0,
        erros: itensSelecionados.length,
        detalhes: [{ descricao: 'Erro de conexão', status: 'erro', motivo: String(e) }]
      })
      setEtapa('concluido')
    }

    setProgresso(100)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-purple-300 text-purple-700 hover:bg-purple-50">
          <Sparkles className="w-4 h-4" />
          Importação Inteligente (CSV Simplificado)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Importação Inteligente de Itens
          </DialogTitle>
          <DialogDescription>
            Importe itens de um CSV simplificado. O sistema buscará automaticamente os dados de classificação 
            em itens já cadastrados no PCA anterior.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {/* ETAPA 1: Upload */}
          {etapa === 'upload' && (
            <div className="flex-1 flex flex-col space-y-4">
              <div className="bg-purple-50 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-purple-600 mt-0.5" />
                  <div className="text-sm text-purple-800">
                    <p className="font-medium mb-2">Como funciona a Importação Inteligente:</p>
                    <ol className="list-decimal list-inside space-y-1 text-purple-700">
                      <li>Você envia um CSV com apenas as colunas básicas (Descrição, Quantidade, Valor...)</li>
                      <li>O sistema compara cada item com os itens do PCA anterior</li>
                      <li>Se encontrar um item similar, copia automaticamente a classificação (Categoria, Código, Classe...)</li>
                      <li>Itens novos são criados com classificação padrão para você ajustar depois</li>
                    </ol>
                  </div>
                </div>
              </div>

              <details className="bg-blue-50 rounded-lg p-4">
                <summary className="cursor-pointer font-medium text-blue-800 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4" />
                  Colunas aceitas no CSV
                </summary>
                <div className="mt-3 text-sm text-blue-700 space-y-2">
                  <p>O CSV pode ter apenas estas colunas (mínimo: Descrição):</p>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li><strong>Descrição do Item</strong> (obrigatório)</li>
                    <li>Unidade de Fornecimento</li>
                    <li>Quantidade Estimada</li>
                    <li>Valor Unitário Estimado (R$)</li>
                    <li>Valor Total Estimado (R$)</li>
                    <li>Valor orçamentário estimado</li>
                    <li>Renovação Contrato (1-Sim, 2-Não)</li>
                    <li>Data Desejada</li>
                  </ul>
                </div>
              </details>

              {errosValidacao.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-800 font-medium mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    Erros encontrados
                  </div>
                  <ul className="text-sm text-red-700 list-disc list-inside">
                    {errosValidacao.map((erro, i) => (
                      <li key={i}>{erro}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div
                className={`
                  flex-1 relative border-2 border-dashed rounded-xl p-8 text-center transition-all min-h-[200px] flex items-center justify-center
                  ${dragActive ? 'border-purple-500 bg-purple-50 scale-[1.02]' : 'border-gray-300 hover:border-purple-400 hover:bg-gray-50'}
                `}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.CSV"
                  onChange={handleFileSelect}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center gap-3">
                  <div className={`p-4 rounded-full ${dragActive ? 'bg-purple-100' : 'bg-gray-100'}`}>
                    <FileUp className={`w-12 h-12 ${dragActive ? 'text-purple-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-gray-700">
                      {loading ? 'Processando arquivo...' : 'Arraste o arquivo CSV aqui'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">ou clique para selecionar</p>
                  </div>
                  {loading && <Loader2 className="w-6 h-6 animate-spin text-purple-600" />}
                </div>
              </div>
            </div>
          )}

          {/* ETAPA 2: Preview */}
          {etapa === 'preview' && (
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
                  <span className="text-sm text-gray-500">
                    | Total: {formatarMoeda(itensSelecionados.reduce((acc, i) => acc + i.valor_total, 0))}
                  </span>
                </div>
                <Button variant="ghost" size="sm" onClick={limpar}>
                  <Trash2 className="w-4 h-4 mr-1" />
                  Limpar
                </Button>
              </div>

              <ScrollArea className="flex-1 min-h-0 border rounded-lg">
                <Table className="table-fixed">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="w-12 text-center">#</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-16">Qtd</TableHead>
                      <TableHead className="w-28 text-right">Valor Unit.</TableHead>
                      <TableHead className="w-28 text-right">Valor Total</TableHead>
                      <TableHead className="w-20">Renovação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...itens].sort((a, b) => a.numero_item - b.numero_item).map((item, idx) => (
                      <TableRow 
                        key={idx}
                        className={item.selecionado ? 'bg-purple-50' : ''}
                      >
                        <TableCell>
                          <Checkbox 
                            checked={item.selecionado}
                            onCheckedChange={() => toggleItem(item.numero_item)}
                          />
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {item.numero_item}
                        </TableCell>
                        <TableCell>
                          <p className="text-sm whitespace-normal break-words" title={item.descricao}>
                            {item.descricao}
                          </p>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.quantidade} {item.unidade}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatarMoeda(item.valor_unitario)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {formatarMoeda(item.valor_total)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={item.renovacao.includes('Sim') || item.renovacao.includes('1') ? 'default' : 'secondary'}>
                            {item.renovacao.includes('Sim') || item.renovacao.includes('1') ? 'Sim' : 'Não'}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="flex justify-between pt-2 border-t">
                <Button variant="outline" onClick={limpar}>
                  Voltar
                </Button>
                <Button 
                  onClick={importarItens} 
                  disabled={itensSelecionados.length === 0}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
                  Importar {itensSelecionados.length} itens com matching inteligente
                </Button>
              </div>
            </div>
          )}

          {/* ETAPA 3: Importando */}
          {etapa === 'importando' && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
              <p className="text-lg font-medium">Processando importação inteligente...</p>
              <p className="text-sm text-gray-500">Buscando itens similares no PCA anterior...</p>
              <div className="w-full max-w-md">
                <Progress value={progresso} className="h-3" />
                <p className="text-center text-sm text-gray-500 mt-2">{progresso}%</p>
              </div>
            </div>
          )}

          {/* ETAPA 4: Concluído */}
          {etapa === 'concluido' && resultado && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-6">
              <div className={`p-4 rounded-full ${
                resultado.erros > 0 ? 'bg-red-100' : 'bg-green-100'
              }`}>
                {resultado.erros > 0 ? (
                  <XCircle className="w-16 h-16 text-red-600" />
                ) : (
                  <CheckCircle2 className="w-16 h-16 text-green-600" />
                )}
              </div>
              
              <div className="text-center">
                <h3 className="text-xl font-semibold">
                  {resultado.erros > 0 ? 'Importação com Erros' : 'Importação Concluída!'}
                </h3>
                <div className="mt-4 space-y-2">
                  <p className="text-green-600 font-medium flex items-center justify-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {resultado.importados} item(ns) importado(s)
                  </p>
                  {resultado.enriquecidos > 0 && (
                    <p className="text-purple-600 font-medium flex items-center justify-center gap-2">
                      <Link2 className="w-4 h-4" />
                      {resultado.enriquecidos} com dados do PCA anterior
                    </p>
                  )}
                  {resultado.novos > 0 && (
                    <p className="text-blue-600 font-medium flex items-center justify-center gap-2">
                      <Plus className="w-4 h-4" />
                      {resultado.novos} item(ns) novo(s)
                    </p>
                  )}
                  {resultado.erros > 0 && (
                    <p className="text-red-600 font-medium flex items-center justify-center gap-2">
                      <XCircle className="w-4 h-4" />
                      {resultado.erros} erro(s)
                    </p>
                  )}
                </div>
              </div>

              {/* Detalhes dos itens enriquecidos */}
              {resultado.detalhes && resultado.detalhes.filter(d => d.status === 'enriquecido').length > 0 && (
                <details className="w-full max-w-2xl bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <summary className="cursor-pointer font-medium text-purple-800 flex items-center gap-2">
                    <Link2 className="w-4 h-4" />
                    Ver {resultado.detalhes.filter(d => d.status === 'enriquecido').length} item(ns) enriquecido(s)
                  </summary>
                  <ul className="mt-2 text-sm text-purple-700 space-y-1 max-h-40 overflow-y-auto">
                    {resultado.detalhes
                      .filter(d => d.status === 'enriquecido')
                      .slice(0, 20)
                      .map((d, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="truncate flex-1">{d.descricao}...</span>
                          <span className="text-xs text-purple-500 shrink-0">← {d.itemBase}...</span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}

              {/* Detalhes dos itens novos */}
              {resultado.detalhes && resultado.detalhes.filter(d => d.status === 'novo').length > 0 && (
                <details className="w-full max-w-2xl bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <summary className="cursor-pointer font-medium text-blue-800 flex items-center gap-2">
                    <Plus className="w-4 h-4" />
                    Ver {resultado.detalhes.filter(d => d.status === 'novo').length} item(ns) novo(s)
                  </summary>
                  <ul className="mt-2 text-sm text-blue-700 space-y-1 max-h-40 overflow-y-auto">
                    {resultado.detalhes
                      .filter(d => d.status === 'novo')
                      .slice(0, 20)
                      .map((d, i) => (
                        <li key={i}>
                          • {d.descricao}... <span className="text-xs text-blue-500">(classificação padrão)</span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}

              {/* Aviso: Itens com data fora do ano do PCA */}
              {resultado.itensDataForaAno && resultado.itensDataForaAno.length > 0 && (
                <div className="w-full max-w-2xl bg-amber-50 rounded-lg p-4 border border-amber-300">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-amber-800">
                        ⚠️ {resultado.itensDataForaAno.length} item(ns) com data desejada fora do ano do PCA ({resultado.anoPca})
                      </p>
                      <p className="text-sm text-amber-700 mt-1">
                        Estes itens foram importados, mas a data desejada não corresponde ao ano do PCA. Verifique se está correto:
                      </p>
                      <ul className="mt-2 text-sm text-amber-700 space-y-1 max-h-32 overflow-y-auto">
                        {resultado.itensDataForaAno.slice(0, 10).map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="font-mono text-amber-600">{item.data}</span>
                            <span className="truncate">{item.descricao}...</span>
                          </li>
                        ))}
                        {resultado.itensDataForaAno.length > 10 && (
                          <li className="text-amber-500 italic">... e mais {resultado.itensDataForaAno.length - 10} item(ns)</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Aviso: Itens sem classificação (precisam ser classificados manualmente) */}
              {resultado.itensSemClassificacao && resultado.itensSemClassificacao.length > 0 && (
                <div className="w-full max-w-2xl bg-orange-50 rounded-lg p-4 border border-orange-300">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-orange-800">
                        📋 {resultado.itensSemClassificacao.length} item(ns) precisam de classificação manual
                      </p>
                      <p className="text-sm text-orange-700 mt-1">
                        Estes itens não foram encontrados no PCA anterior e receberam classificação padrão (Serviço). 
                        Edite-os para definir a categoria, código de classe e demais dados corretamente:
                      </p>
                      <ul className="mt-2 text-sm text-orange-700 space-y-1 max-h-32 overflow-y-auto">
                        {resultado.itensSemClassificacao.slice(0, 10).map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="font-mono text-orange-600 shrink-0">#{item.numero_item}</span>
                            <span className="truncate">{item.descricao}...</span>
                          </li>
                        ))}
                        {resultado.itensSemClassificacao.length > 10 && (
                          <li className="text-orange-500 italic">... e mais {resultado.itensSemClassificacao.length - 10} item(ns)</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Detalhes dos erros */}
              {resultado.detalhes && resultado.detalhes.filter(d => d.status === 'erro').length > 0 && (
                <details open className="w-full max-w-2xl bg-red-50 rounded-lg p-4 border border-red-200">
                  <summary className="cursor-pointer font-medium text-red-800 flex items-center gap-2">
                    <XCircle className="w-4 h-4" />
                    Ver {resultado.detalhes.filter(d => d.status === 'erro').length} erro(s)
                  </summary>
                  <ul className="mt-2 text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                    {resultado.detalhes
                      .filter(d => d.status === 'erro')
                      .map((d, i) => (
                        <li key={i}>
                          • {d.descricao}... <span className="text-xs text-red-500">({d.motivo})</span>
                        </li>
                      ))}
                  </ul>
                </details>
              )}

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
