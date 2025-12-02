'use client'

import { useState, useRef, useCallback } from 'react'
import { 
  Upload, 
  FileSpreadsheet, 
  Package, 
  Wrench, 
  Trash2,
  CheckCircle2,
  XCircle,
  Loader2,
  FileUp,
  Info,
  ChevronRight,
  ChevronLeft,
  Save,
  AlertTriangle
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface ItemCSV {
  numero_item: number
  categoria: string
  catalogo_utilizado: string
  classificacao_catalogo: string
  codigo_classe: string
  nome_classe: string
  codigo_pdm: string
  nome_pdm: string
  codigo_item: string
  descricao: string
  unidade_medida: string
  quantidade: number
  valor_unitario: number
  valor_total: number
  valor_orcamentario: number
  renovacao_contrato: string
  data_desejada: string
  unidade_requisitante: string
  grupo_codigo: string
  grupo_nome: string
  selecionado: boolean
  erro?: string
}

interface ImportarCSVParaPCAProps {
  pcaId: string
  onImportSuccess?: (count: number) => void
}

// Mapeamento de categorias
const CATEGORIAS_MAP: Record<string, string> = {
  '1-material': 'MATERIAL',
  '2-serviço': 'SERVICO',
  '2-servico': 'SERVICO',
  '3-obras': 'OBRA',
  '4-serviços de engenharia': 'SERVICO_ENGENHARIA',
  '4-servicos de engenharia': 'SERVICO_ENGENHARIA',
  '5-soluções de tic': 'TIC',
  '5-solucoes de tic': 'TIC',
  '6-locação de imóveis': 'LOCACAO_IMOVEL',
  '6-locacao de imoveis': 'LOCACAO_IMOVEL',
  '7-alienação/concessão/permissão': 'ALIENACAO',
  '7-alienacao/concessao/permissao': 'ALIENACAO',
  '8-obras e serviços de engenharia': 'OBRA_ENGENHARIA',
  '8-obras e servicos de engenharia': 'OBRA_ENGENHARIA',
  'material': 'MATERIAL',
  'serviço': 'SERVICO',
  'servico': 'SERVICO',
}

function formatarMoeda(valor: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(valor)
}

function parseValorMonetario(valor: string): number {
  if (!valor) return 0
  // Remove R$, espaços e converte vírgula para ponto
  const limpo = valor
    .replace(/R\$\s*/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .trim()
  return parseFloat(limpo) || 0
}

function parseData(data: string): string {
  if (!data) return ''
  // Tenta converter dd/mm/yyyy para yyyy-mm-dd
  const match = data.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (match) {
    return `${match[3]}-${match[2]}-${match[1]}`
  }
  return data
}

export function ImportarCSVParaPCA({ pcaId, onImportSuccess }: ImportarCSVParaPCAProps) {
  const [open, setOpen] = useState(false)
  const [etapa, setEtapa] = useState<'upload' | 'preview' | 'importando' | 'concluido'>('upload')
  const [itens, setItens] = useState<ItemCSV[]>([])
  const [loading, setLoading] = useState(false)
  const [progresso, setProgresso] = useState(0)
  const [resultado, setResultado] = useState<{ 
    sucesso: number; 
    erro: number; 
    duplicados?: number;
    detalhes?: { item: string; status: string; motivo?: string }[]
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
    limpar()
    setOpen(false)
  }

  const processarCSV = async (file: File) => {
    setLoading(true)
    setErrosValidacao([])
    
    try {
      // Tentar ler como UTF-8 primeiro, se tiver caracteres inválidos, tentar Latin-1
      let text = await file.text()
      
      // Detectar se há caracteres corrompidos (geralmente aparecem como �)
      if (text.includes('�') || text.includes('Ã§') || text.includes('Ã£')) {
        // Ler como ArrayBuffer e decodificar como Latin-1 (ISO-8859-1)
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

      // Detectar delimitador (pode ser ; ou ,)
      const primeiraLinha = linhas[0]
      const delimitador = primeiraLinha.includes(';') ? ';' : ','
      
      // Pular cabeçalho
      const itensProcessados: ItemCSV[] = []
      const erros: string[] = []

      for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i].trim()
        if (!linha) continue

        const colunas = linha.split(delimitador)
        
        // Mapear colunas conforme modelo
        // 0: Numero Item*
        // 1: Categoria do Item*
        // 2: Catálogo Utilizado*
        // 3: Classificação do Catálogo*
        // 4: Código da Classificação Superior
        // 5: Classificacao Superior Nome
        // 6: Código do PDM do Item
        // 7: Nome do PDM do Item
        // 8: Código do Item
        // 9: Descrição do Item
        // 10: Unidade de Fornecimento
        // 11: Quantidade Estimada*
        // 12: Valor Unitário Estimado (R$)*
        // 13: Valor Total Estimado (R$)*
        // 14: Valor orçamentário estimado para o exercício (R$)*
        // 15: Renovação Contrato*
        // 16: Data Desejada*
        // 17: Unidade Requisitante
        // 18: Grupo Contratação Codigo
        // 19: Grupo Contratação Nome

        // Debug: mostrar colunas da primeira linha
        if (i === 1) {
          console.log('Colunas encontradas:', colunas.length)
          console.log('Coluna 9 (descrição):', colunas[9])
          console.log('Coluna 12 (valor unit):', colunas[12])
          console.log('Coluna 13 (valor total):', colunas[13])
        }

        const descricao = colunas[9]?.trim() || ''
        
        if (!descricao) {
          erros.push(`Linha ${i + 1}: Descrição do item é obrigatória`)
          continue
        }

        const item: ItemCSV = {
          numero_item: parseInt(colunas[0]) || i,
          categoria: colunas[1]?.trim() || '',
          catalogo_utilizado: colunas[2]?.trim() || '2-Outros',
          classificacao_catalogo: colunas[3]?.trim() || '',
          codigo_classe: colunas[4]?.trim() || '',
          nome_classe: colunas[5]?.trim() || '',
          codigo_pdm: colunas[6]?.trim() || '',
          nome_pdm: colunas[7]?.trim() || '',
          codigo_item: colunas[8]?.trim() || '',
          descricao: descricao,
          unidade_medida: colunas[10]?.trim() || 'UN',
          quantidade: parseFloat(colunas[11]?.replace(',', '.')) || 1,
          valor_unitario: parseValorMonetario(colunas[12] || '0'),
          valor_total: parseValorMonetario(colunas[13] || '0'),
          valor_orcamentario: parseValorMonetario(colunas[14] || '0'),
          renovacao_contrato: colunas[15]?.trim() || '2-Não',
          data_desejada: colunas[16]?.trim() || '',
          unidade_requisitante: colunas[17]?.trim() || '',
          grupo_codigo: colunas[18]?.trim() || '',
          grupo_nome: colunas[19]?.trim() || '',
          selecionado: true
        }

        // Validações básicas
        if (item.valor_total <= 0 && item.valor_unitario > 0 && item.quantidade > 0) {
          item.valor_total = item.valor_unitario * item.quantidade
        }

        itensProcessados.push(item)
      }

      if (erros.length > 0) {
        setErrosValidacao(erros)
      }

      setItens(itensProcessados)
      setEtapa('preview')
    } catch (error) {
      console.error('Erro ao processar CSV:', error)
      setErrosValidacao(['Erro ao processar arquivo CSV. Verifique o formato.'])
    } finally {
      setLoading(false)
    }
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

  const toggleItem = (index: number) => {
    setItens(prev => prev.map((item, i) => 
      i === index ? { ...item, selecionado: !item.selecionado } : item
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

    // Preparar todos os itens para importação em lote
    const itensParaImportar = itensSelecionados.map(item => {
      // Normalizar categoria
      const categoriaKey = item.categoria.toLowerCase()
      const categoriaNormalizada = CATEGORIAS_MAP[categoriaKey] || 'SERVICO'
      
      // Determinar se é renovação
      const isRenovacao = item.renovacao_contrato.toLowerCase().includes('sim') || 
                         item.renovacao_contrato === '1-Sim'

      return {
        categoria: categoriaNormalizada,
        descricao_objeto: item.descricao,
        codigo_item_catalogo: item.codigo_item || null,
        descricao_item_catalogo: item.descricao,
        quantidade_estimada: item.quantidade,
        valor_unitario_estimado: item.valor_unitario,
        valor_estimado: item.valor_total,
        unidade_medida: item.unidade_medida,
        trimestre_previsto: 1,
        prioridade: 3,
        unidade_requisitante: item.unidade_requisitante,
        justificativa: `Importado do PCA - ${item.descricao?.substring(0, 100)}`,
        catalogo_utilizado: item.catalogo_utilizado?.includes('Compras') ? 'COMPRASGOV' : 'OUTROS',
        classificacao_catalogo: item.classificacao_catalogo?.toLowerCase().includes('material') ? 'MATERIAL' : 'SERVICO',
        codigo_classe: item.codigo_classe || null,
        nome_classe: item.nome_classe || null,
        codigo_grupo: item.grupo_codigo || null,
        nome_grupo: item.grupo_nome || null,
        renovacao_contrato: isRenovacao ? 'SIM' : 'NAO',
        data_desejada_contratacao: parseData(item.data_desejada) || null,
        valor_orcamentario_exercicio: item.valor_orcamentario
      }
    })

    setProgresso(30)

    try {
      // Usar o novo endpoint de importação em lote com verificação de duplicidade
      const response = await fetch(`${API_URL}/api/pca/${pcaId}/importar-itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: itensParaImportar })
      })

      setProgresso(90)

      if (response.ok) {
        const resultado = await response.json()
        setResultado({ 
          sucesso: resultado.importados, 
          erro: resultado.erros,
          duplicados: resultado.duplicados,
          detalhes: resultado.detalhes
        })
        setEtapa('concluido')
        
        if (onImportSuccess && resultado.importados > 0) {
          onImportSuccess(resultado.importados)
        }
      } else {
        const errorData = await response.json().catch(() => ({}))
        console.error('Erro na importação:', errorData)
        setResultado({ sucesso: 0, erro: itensSelecionados.length })
        setEtapa('concluido')
      }
    } catch (e) {
      console.error('Erro na importação:', e)
      setResultado({ sucesso: 0, erro: itensSelecionados.length })
      setEtapa('concluido')
    }

    setProgresso(100)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 border-orange-300 text-orange-700 hover:bg-orange-50">
          <FileSpreadsheet className="w-4 h-4" />
          Catálogo Próprio (CSV)
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-orange-600" />
            Importar do Catálogo Próprio (CSV)
          </DialogTitle>
          <DialogDescription>
            Importe itens de uma planilha CSV com seu catálogo próprio de materiais e serviços
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 flex flex-col min-h-0">
          {/* ETAPA 1: Upload */}
          {etapa === 'upload' && (
            <div className="flex-1 flex flex-col space-y-4">
              <details className="bg-blue-50 rounded-lg p-4">
                <summary className="cursor-pointer font-medium text-blue-800 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Formato do arquivo CSV
                </summary>
                <div className="mt-3 text-sm text-blue-700 space-y-2">
                  <p>O arquivo deve conter as seguintes colunas separadas por <code>;</code>:</p>
                  <ol className="list-decimal list-inside space-y-1 text-xs">
                    <li>Numero Item*</li>
                    <li>Categoria do Item* (1-Material, 2-Serviço, etc.)</li>
                    <li>Catálogo Utilizado*</li>
                    <li>Classificação do Catálogo*</li>
                    <li>Código da Classificação Superior</li>
                    <li>Classificacao Superior Nome</li>
                    <li>Código do PDM do Item</li>
                    <li>Nome do PDM do Item</li>
                    <li>Código do Item</li>
                    <li>Descrição do Item*</li>
                    <li>Unidade de Fornecimento</li>
                    <li>Quantidade Estimada*</li>
                    <li>Valor Unitário Estimado (R$)*</li>
                    <li>Valor Total Estimado (R$)*</li>
                    <li>Valor orçamentário estimado*</li>
                    <li>Renovação Contrato* (1-Sim, 2-Não)</li>
                    <li>Data Desejada*</li>
                    <li>Unidade Requisitante</li>
                  </ol>
                </div>
              </details>

              {errosValidacao.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 text-red-800 font-medium mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    Erros encontrados
                  </div>
                  <ul className="text-sm text-red-700 list-disc list-inside">
                    {errosValidacao.slice(0, 5).map((erro, i) => (
                      <li key={i}>{erro}</li>
                    ))}
                    {errosValidacao.length > 5 && (
                      <li>... e mais {errosValidacao.length - 5} erros</li>
                    )}
                  </ul>
                </div>
              )}

              <div
                className={`
                  flex-1 relative border-2 border-dashed rounded-xl p-8 text-center transition-all min-h-[200px] flex items-center justify-center
                  ${dragActive ? 'border-green-500 bg-green-50 scale-[1.02]' : 'border-gray-300 hover:border-green-400 hover:bg-gray-50'}
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
                  <div className={`p-4 rounded-full ${dragActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                    <FileUp className={`w-12 h-12 ${dragActive ? 'text-green-600' : 'text-gray-400'}`} />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-gray-700">
                      {loading ? 'Processando arquivo...' : 'Arraste o arquivo CSV aqui'}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">ou clique para selecionar</p>
                  </div>
                  {loading && <Loader2 className="w-6 h-6 animate-spin text-green-600" />}
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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead className="w-24">Categoria</TableHead>
                      <TableHead className="w-16">Qtd</TableHead>
                      <TableHead className="w-28 text-right">Valor Unit.</TableHead>
                      <TableHead className="w-28 text-right">Valor Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((item, idx) => (
                      <TableRow 
                        key={idx}
                        className={item.selecionado ? 'bg-green-50' : ''}
                      >
                        <TableCell>
                          <Checkbox 
                            checked={item.selecionado}
                            onCheckedChange={() => toggleItem(idx)}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs">{item.numero_item}</TableCell>
                        <TableCell>
                          <div className="max-w-md">
                            <p className="truncate text-sm" title={item.descricao}>
                              {item.descricao}
                            </p>
                            {item.unidade_requisitante && (
                              <p className="text-xs text-gray-500 truncate">
                                {item.unidade_requisitante}
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              item.categoria.toLowerCase().includes('material') 
                                ? 'border-blue-300 text-blue-700' 
                                : 'border-purple-300 text-purple-700'
                            }`}
                          >
                            {item.categoria.toLowerCase().includes('material') ? (
                              <Package className="w-3 h-3 mr-1" />
                            ) : (
                              <Wrench className="w-3 h-3 mr-1" />
                            )}
                            {item.categoria.split('-')[1] || item.categoria}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {item.quantidade} {item.unidade_medida}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {formatarMoeda(item.valor_unitario)}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {formatarMoeda(item.valor_total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              <div className="flex justify-between pt-2 border-t">
                <Button variant="outline" onClick={limpar}>
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Voltar
                </Button>
                <Button 
                  onClick={importarItens} 
                  disabled={itensSelecionados.length === 0}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  Importar {itensSelecionados.length} itens para o PCA
                </Button>
              </div>
            </div>
          )}

          {/* ETAPA 3: Importando */}
          {etapa === 'importando' && (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4">
              <Loader2 className="w-12 h-12 animate-spin text-green-600" />
              <p className="text-lg font-medium">Importando itens para o PCA...</p>
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
                resultado.erro > 0 ? 'bg-red-100' : 
                resultado.duplicados && resultado.duplicados > 0 ? 'bg-yellow-100' : 'bg-green-100'
              }`}>
                {resultado.erro > 0 ? (
                  <XCircle className="w-16 h-16 text-red-600" />
                ) : resultado.duplicados && resultado.duplicados > 0 ? (
                  <AlertTriangle className="w-16 h-16 text-yellow-600" />
                ) : (
                  <CheckCircle2 className="w-16 h-16 text-green-600" />
                )}
              </div>
              
              <div className="text-center">
                <h3 className="text-xl font-semibold">
                  {resultado.erro > 0 ? 'Importação com Erros' : 
                   resultado.duplicados && resultado.duplicados > 0 ? 'Importação Parcial' : 
                   'Importação Concluída!'}
                </h3>
                <div className="mt-4 space-y-2">
                  <p className="text-green-600 font-medium">
                    ✓ {resultado.sucesso} item(ns) importado(s) com sucesso
                  </p>
                  {resultado.duplicados && resultado.duplicados > 0 && (
                    <p className="text-yellow-600 font-medium">
                      ⚠ {resultado.duplicados} item(ns) ignorado(s) (duplicados)
                    </p>
                  )}
                  {resultado.erro > 0 && (
                    <p className="text-red-600 font-medium">
                      ✗ {resultado.erro} erro(s) na importação
                    </p>
                  )}
                </div>
              </div>

              {/* Detalhes dos duplicados */}
              {resultado.detalhes && resultado.detalhes.filter(d => d.status === 'duplicado').length > 0 && (
                <details className="w-full max-w-md bg-yellow-50 rounded-lg p-4">
                  <summary className="cursor-pointer font-medium text-yellow-800">
                    Ver itens duplicados ignorados
                  </summary>
                  <ul className="mt-2 text-sm text-yellow-700 space-y-1 max-h-40 overflow-y-auto">
                    {resultado.detalhes
                      .filter(d => d.status === 'duplicado')
                      .slice(0, 20)
                      .map((d, i) => (
                        <li key={i} className="truncate">
                          • {d.item}... <span className="text-xs">({d.motivo})</span>
                        </li>
                      ))}
                    {resultado.detalhes.filter(d => d.status === 'duplicado').length > 20 && (
                      <li className="text-xs">... e mais {resultado.detalhes.filter(d => d.status === 'duplicado').length - 20}</li>
                    )}
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
