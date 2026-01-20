'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { 
  Upload, 
  FileSpreadsheet, 
  Save,
  X,
  Edit,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  ArrowLeft,
  FileText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { API_URL, authFetch } from '@/lib/api'
import { toast } from 'sonner'

interface ItemCSV {
  numero_item: number
  descricao: string
  marca: string
  unidade_medida: string
  quantidade_contratada: number
  valor_unitario: number
  valor_total: number
  erro?: string
  editando?: boolean
}

interface DadosContrato {
  numero_contrato: string
  ano: number
  licitacao_numero?: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  objeto?: string
  valor_inicial: number
  data_assinatura?: string
  data_vigencia_inicio?: string
  data_vigencia_fim?: string
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

function formatarCnpj(valor: string): string {
  const numeros = valor.replace(/\D/g, '')
  if (numeros.length <= 14) {
    return numeros
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d)/, '$1-$2')
  }
  return valor
}

function MigracaoContratosContent() {
  const router = useRouter()
  const [etapa, setEtapa] = useState<'upload' | 'preview' | 'importando' | 'concluido'>('upload')
  const [itens, setItens] = useState<ItemCSV[]>([])
  const [dadosContrato, setDadosContrato] = useState<DadosContrato>({
    numero_contrato: '',
    ano: new Date().getFullYear(),
    fornecedor_cnpj: '',
    fornecedor_razao_social: '',
    valor_inicial: 0,
  })
  const [loading, setLoading] = useState(false)
  const [resultado, setResultado] = useState<{
    sucesso: boolean
    mensagem: string
    contrato_id?: string
    estatisticas?: {
      total_itens: number
      itens_importados: number
      itens_com_erro: number
      erros: Array<{ linha: number; campo: string; mensagem: string; valor?: string }>
    }
  } | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [errosValidacao, setErrosValidacao] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [itemEditando, setItemEditando] = useState<number | null>(null)
  const [consultandoCnpj, setConsultandoCnpj] = useState(false)
  const [itemEditado, setItemEditado] = useState<Partial<ItemCSV>>({})

  const processarCSV = async (file: File) => {
    setLoading(true)
    setErrosValidacao([])

    try {
      const text = await file.text()
      const linhas = text.split('\n').map(l => l.trim()).filter(l => l)

      if (linhas.length < 2) {
        setErrosValidacao(['Arquivo CSV deve ter pelo menos cabeçalho e uma linha de dados'])
        return
      }

      // Parse do cabeçalho
      const cabecalho = linhas[0].split(',').map(c => c.trim())
      const indiceDescricao = cabecalho.findIndex(c => c.toLowerCase().includes('descri'))
      const indiceMarca = cabecalho.findIndex(c => c.toLowerCase().includes('marca'))
      const indiceUnd = cabecalho.findIndex(c => c.toLowerCase().includes('und'))
      const indicePreco = cabecalho.findIndex(c => c.toLowerCase().includes('preço') || c.toLowerCase().includes('preco'))
      const indiceQtdade = cabecalho.findIndex(c => c.toLowerCase().includes('qtdade') || c.toLowerCase().includes('quantidade'))
      const indiceValorInicial = cabecalho.findIndex(c => c.toLowerCase().includes('valor inicial'))

      if (indiceDescricao === -1 || indicePreco === -1 || indiceQtdade === -1 || indiceValorInicial === -1) {
        setErrosValidacao(['CSV deve conter colunas: Descrição, Preço R$, Qtdade, Valor Inicial R$'])
        return
      }

      const itensProcessados: ItemCSV[] = []
      const erros: string[] = []

      // Parse das linhas
      for (let i = 1; i < linhas.length; i++) {
        const linha = linhas[i]
        if (!linha.trim()) continue

        try {
          // Parse simples (considerando vírgulas dentro de aspas)
          const campos = parseCSVLine(linha)

          const descricao = campos[indiceDescricao]?.trim()
          const marca = campos[indiceMarca]?.trim() || ''
          const unidade = campos[indiceUnd]?.trim() || 'UNIDADE'
          const precoStr = campos[indicePreco]?.trim().replace(/[^\d,.-]/g, '').replace(',', '.')
          const qtdadeStr = campos[indiceQtdade]?.trim().replace(/[^\d,.-]/g, '').replace(',', '.')
          const valorInicialStr = campos[indiceValorInicial]?.trim().replace(/[^\d,.-]/g, '').replace(',', '.')

          if (!descricao) {
            erros.push(`Linha ${i + 1}: Descrição é obrigatória`)
            continue
          }

          const preco = parseFloat(precoStr)
          const qtdade = parseFloat(qtdadeStr)
          const valorInicial = parseFloat(valorInicialStr)

          if (isNaN(preco) || preco <= 0) {
            erros.push(`Linha ${i + 1}: Preço inválido`)
            continue
          }

          if (isNaN(qtdade) || qtdade <= 0) {
            erros.push(`Linha ${i + 1}: Quantidade inválida`)
            continue
          }

          itensProcessados.push({
            numero_item: i,
            descricao: descricao.substring(0, 500),
            marca: marca.substring(0, 100),
            unidade_medida: unidade,
            quantidade_contratada: qtdade,
            valor_unitario: preco,
            valor_total: valorInicial || preco * qtdade,
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido'
          erros.push(`Linha ${i + 1}: Erro ao processar - ${errorMessage}`)
        }
      }

      if (erros.length > 0) {
        setErrosValidacao(erros)
      }

      setItens(itensProcessados)
      
      // Calcula valor total do contrato
      const valorTotal = itensProcessados.reduce((sum, item) => sum + item.valor_total, 0)
      setDadosContrato(prev => ({ ...prev, valor_inicial: valorTotal }))
      
      setEtapa('preview')
    } catch (error) {
      console.error('Erro ao processar CSV:', error)
      setErrosValidacao(['Erro ao processar arquivo CSV. Verifique o formato.'])
    } finally {
      setLoading(false)
    }
  }

  const parseCSVLine = (linha: string): string[] => {
    const campos: string[] = []
    let campoAtual = ''
    let dentroAspas = false

    for (let i = 0; i < linha.length; i++) {
      const char = linha[i]

      if (char === '"') {
        dentroAspas = !dentroAspas
      } else if (char === ',' && !dentroAspas) {
        campos.push(campoAtual.trim())
        campoAtual = ''
      } else {
        campoAtual += char
      }
    }

    campos.push(campoAtual.trim())
    return campos
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.name.endsWith('.csv')) {
      await processarCSV(file)
    }
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
    if (file && file.name.endsWith('.csv')) {
      await processarCSV(file)
    }
  }, [])

  const iniciarEdicao = (index: number) => {
    setItemEditando(index)
    setItemEditado({ ...itens[index] })
  }

  const salvarEdicao = (index: number) => {
    const novosItens = [...itens]
    novosItens[index] = { ...novosItens[index], ...itemEditado }
    
    // Recalcula valor total se necessário
    if (itemEditado.valor_unitario !== undefined || itemEditado.quantidade_contratada !== undefined) {
      novosItens[index].valor_total = 
        (itemEditado.valor_unitario ?? novosItens[index].valor_unitario) * 
        (itemEditado.quantidade_contratada ?? novosItens[index].quantidade_contratada)
    }
    
    setItens(novosItens)
    
    // Recalcula valor total do contrato
    const valorTotal = novosItens.reduce((sum, item) => sum + item.valor_total, 0)
    setDadosContrato(prev => ({ ...prev, valor_inicial: valorTotal }))
    
    setItemEditando(null)
    setItemEditado({})
  }

  const cancelarEdicao = () => {
    setItemEditando(null)
    setItemEditado({})
  }

  const removerItem = (index: number) => {
    const novosItens = itens.filter((_, i) => i !== index)
    setItens(novosItens)
    
    // Recalcula valor total do contrato
    const valorTotal = novosItens.reduce((sum, item) => sum + item.valor_total, 0)
    setDadosContrato(prev => ({ ...prev, valor_inicial: valorTotal }))
  }

  const validarDados = (): string[] => {
    const erros: string[] = []

    if (!dadosContrato.numero_contrato.trim()) {
      erros.push('Número do contrato é obrigatório')
    }

    if (!dadosContrato.fornecedor_cnpj.trim()) {
      erros.push('CNPJ do fornecedor é obrigatório')
    }

    if (!dadosContrato.fornecedor_razao_social.trim()) {
      erros.push('Razão social do fornecedor é obrigatória')
    }

    if (dadosContrato.valor_inicial <= 0) {
      erros.push('Valor inicial deve ser maior que zero')
    }

    if (itens.length === 0) {
      erros.push('Deve haver pelo menos um item no contrato')
    }

    return erros
  }

  const importar = async () => {
    const erros = validarDados()
    if (erros.length > 0) {
      setErrosValidacao(erros)
      return
    }

    setLoading(true)
    setEtapa('importando')

    try {
      // Criar arquivo CSV temporário com os dados editados
      const linhasCSV = [
        'Ítem,Descrição,Marca,Und,Preço R$,Qtdade,Valor Inicial R$',
        ...itens.map(item => 
          `,${item.descricao},${item.marca},${item.unidade_medida},${item.valor_unitario.toFixed(2)},${item.quantidade_contratada.toFixed(2)},${item.valor_total.toFixed(2)}`
        )
      ]
      
      const csvBlob = new Blob([linhasCSV.join('\n')], { type: 'text/csv' })
      const csvFile = new File([csvBlob], 'import.csv', { type: 'text/csv' })

      const formData = new FormData()
      formData.append('arquivo', csvFile)
      formData.append('numero_contrato', dadosContrato.numero_contrato)
      formData.append('ano', dadosContrato.ano.toString())
      formData.append('fornecedor_cnpj', dadosContrato.fornecedor_cnpj.replace(/\D/g, ''))
      formData.append('fornecedor_razao_social', dadosContrato.fornecedor_razao_social)
      formData.append('valor_inicial', dadosContrato.valor_inicial.toString())
      
      if (dadosContrato.licitacao_numero) {
        formData.append('licitacao_numero', dadosContrato.licitacao_numero)
      }
      
      if (dadosContrato.objeto) {
        formData.append('objeto', dadosContrato.objeto)
      }
      
      if (dadosContrato.data_assinatura) {
        formData.append('data_assinatura', dadosContrato.data_assinatura)
      }
      
      if (dadosContrato.data_vigencia_inicio) {
        formData.append('data_vigencia_inicio', dadosContrato.data_vigencia_inicio)
      }
      
      if (dadosContrato.data_vigencia_fim) {
        formData.append('data_vigencia_fim', dadosContrato.data_vigencia_fim)
      }

      const response = await authFetch(`${API_URL}/api/almoxarifado/migracao/contratos/importar-csv`, {
        method: 'POST',
        body: formData,
      })

      if (response.ok) {
        const resultado = await response.json()
        setResultado(resultado)
        setEtapa('concluido')
      } else {
        const error = await response.json().catch(() => ({ message: 'Erro ao importar contrato' }))
        setErrosValidacao([error.message || 'Erro ao importar contrato'])
        setEtapa('preview')
      }
    } catch (error) {
      console.error('Erro ao importar:', error)
      const errorMessage = error instanceof Error ? error.message : 'Erro ao importar contrato'
      setErrosValidacao([errorMessage])
      setEtapa('preview')
    } finally {
      setLoading(false)
    }
  }

  const voltar = () => {
    router.push('/orgao/almoxarifado')
  }

  const novoImport = () => {
    setEtapa('upload')
    setItens([])
    setDadosContrato({
      numero_contrato: '',
      ano: new Date().getFullYear(),
      fornecedor_cnpj: '',
      fornecedor_razao_social: '',
      valor_inicial: 0,
    })
    setResultado(null)
    setErrosValidacao([])
  }

  // Busca automática de CNPJ
  const buscarCnpj = async (cnpj: string) => {
    const cnpjLimpo = cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      return // Não busca se não tiver 14 dígitos
    }

    setConsultandoCnpj(true)
    try {
      // Primeiro verifica se já existe no sistema
      const verificaRes = await authFetch(`${API_URL}/api/fornecedores/verificar-cnpj/${cnpjLimpo}`)
      const verificaData = await verificaRes.json()

      if (verificaData.existe && verificaData.fornecedor) {
        // Fornecedor já existe, preenche com os dados do sistema
        setDadosContrato(prev => ({
          ...prev,
          fornecedor_cnpj: formatarCnpj(verificaData.fornecedor.cpf_cnpj),
          fornecedor_razao_social: verificaData.fornecedor.razao_social || '',
        }))
        toast.success('Fornecedor encontrado no sistema')
        setConsultandoCnpj(false)
        return
      }

      // Se não existe, consulta a API externa
      const res = await authFetch(`${API_URL}/api/fornecedores/consultar-cnpj/${cnpjLimpo}`)
      
      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || 'Erro ao consultar CNPJ')
      }

      const dados = await res.json()
      
      // Preenche automaticamente a razão social
      setDadosContrato(prev => ({
        ...prev,
        fornecedor_cnpj: formatarCnpj(cnpjLimpo),
        fornecedor_razao_social: dados.razao_social || '',
      }))
      
      toast.success('Dados do CNPJ consultados com sucesso')
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao consultar CNPJ'
      toast.error(errorMessage)
      console.error('Erro ao buscar CNPJ:', error)
    } finally {
      setConsultandoCnpj(false)
    }
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <FileText className="h-7 w-7 text-blue-600" />
            Migração de Contratos
          </h1>
          <p className="text-gray-500 mt-1">
            Importe contratos e itens a partir de arquivo CSV
          </p>
        </div>
        <Button variant="outline" onClick={voltar}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
      </div>

      {/* Etapa: Upload */}
      {etapa === 'upload' && (
        <Card>
          <CardHeader>
            <CardTitle>Upload do Arquivo CSV</CardTitle>
            <CardDescription>
              Selecione ou arraste o arquivo CSV com os itens do contrato
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300'
              }`}
            >
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <p className="text-lg font-medium mb-2">
                Arraste o arquivo CSV aqui ou clique para selecionar
              </p>
              <p className="text-sm text-gray-500 mb-4">
                Formato esperado: Descrição, Marca, Und, Preço R$, Qtdade, Valor Inicial R$
              </p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Selecionar Arquivo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>

            {loading && (
              <div className="mt-4 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-blue-600 mr-2" />
                <span>Processando arquivo...</span>
              </div>
            )}

            {errosValidacao.length > 0 && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <h3 className="font-medium text-red-900">Erros encontrados:</h3>
                </div>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {errosValidacao.map((erro, idx) => (
                    <li key={idx}>{erro}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Etapa: Preview e Edição */}
      {etapa === 'preview' && (
        <div className="space-y-6">
          {/* Formulário de Dados do Contrato */}
          <Card>
            <CardHeader>
              <CardTitle>Dados do Contrato</CardTitle>
              <CardDescription>
                Preencha as informações do contrato antes de importar
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="numero_contrato">Número do Contrato *</Label>
                  <Input
                    id="numero_contrato"
                    value={dadosContrato.numero_contrato}
                    onChange={(e) => setDadosContrato(prev => ({ ...prev, numero_contrato: e.target.value }))}
                    placeholder="Ex: 31/2025"
                  />
                </div>
                <div>
                  <Label htmlFor="ano">Ano *</Label>
                  <Input
                    id="ano"
                    type="number"
                    value={dadosContrato.ano}
                    onChange={(e) => setDadosContrato(prev => ({ ...prev, ano: parseInt(e.target.value) || new Date().getFullYear() }))}
                  />
                </div>
                <div>
                  <Label htmlFor="fornecedor_cnpj">CNPJ do Fornecedor *</Label>
                  <div className="relative">
                    <Input
                      id="fornecedor_cnpj"
                      value={dadosContrato.fornecedor_cnpj}
                      onChange={(e) => {
                        const valorFormatado = formatarCnpj(e.target.value)
                        setDadosContrato(prev => ({ ...prev, fornecedor_cnpj: valorFormatado }))
                      }}
                      onBlur={(e) => {
                        const cnpjLimpo = e.target.value.replace(/\D/g, '')
                        if (cnpjLimpo.length === 14) {
                          buscarCnpj(e.target.value)
                        }
                      }}
                      placeholder="00.000.000/0000-00"
                      maxLength={18}
                      disabled={consultandoCnpj}
                    />
                    {consultandoCnpj && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Digite o CNPJ e aguarde para buscar automaticamente
                  </p>
                </div>
                <div>
                  <Label htmlFor="fornecedor_razao_social">Razão Social do Fornecedor *</Label>
                  <Input
                    id="fornecedor_razao_social"
                    value={dadosContrato.fornecedor_razao_social}
                    onChange={(e) => setDadosContrato(prev => ({ ...prev, fornecedor_razao_social: e.target.value }))}
                    placeholder="Nome da empresa"
                  />
                </div>
                <div>
                  <Label htmlFor="licitacao_numero">Número da Licitação</Label>
                  <Input
                    id="licitacao_numero"
                    value={dadosContrato.licitacao_numero || ''}
                    onChange={(e) => setDadosContrato(prev => ({ ...prev, licitacao_numero: e.target.value }))}
                    placeholder="Ex: 16/2025"
                  />
                </div>
                <div>
                  <Label htmlFor="valor_inicial">Valor Inicial (R$) *</Label>
                  <Input
                    id="valor_inicial"
                    type="number"
                    step="0.01"
                    value={dadosContrato.valor_inicial}
                    onChange={(e) => setDadosContrato(prev => ({ ...prev, valor_inicial: parseFloat(e.target.value) || 0 }))}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="objeto">Objeto do Contrato</Label>
                  <Input
                    id="objeto"
                    value={dadosContrato.objeto || ''}
                    onChange={(e) => setDadosContrato(prev => ({ ...prev, objeto: e.target.value }))}
                    placeholder="Descrição do objeto do contrato"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Itens */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Itens do Contrato ({itens.length})</CardTitle>
                  <CardDescription>
                    Revise e edite os itens antes de importar. Valor total: {formatarMoeda(dadosContrato.valor_inicial)}
                  </CardDescription>
                </div>
                <Button onClick={() => setEtapa('upload')} variant="outline">
                  <X className="h-4 w-4 mr-2" />
                  Voltar
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Marca</TableHead>
                      <TableHead>Unidade</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Valor Unitário</TableHead>
                      <TableHead className="text-right">Valor Total</TableHead>
                      <TableHead className="text-center">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {itens.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-medium">{item.numero_item}</TableCell>
                        <TableCell className="max-w-xs">
                          {itemEditando === index ? (
                            <Input
                              value={itemEditado.descricao ?? item.descricao}
                              onChange={(e) => setItemEditado(prev => ({ ...prev, descricao: e.target.value }))}
                              className="w-full"
                            />
                          ) : (
                            <span className="truncate block" title={item.descricao}>
                              {item.descricao}
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          {itemEditando === index ? (
                            <Input
                              value={itemEditado.marca ?? item.marca}
                              onChange={(e) => setItemEditado(prev => ({ ...prev, marca: e.target.value }))}
                              className="w-full"
                            />
                          ) : (
                            item.marca || '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {itemEditando === index ? (
                            <Input
                              value={itemEditado.unidade_medida ?? item.unidade_medida}
                              onChange={(e) => setItemEditado(prev => ({ ...prev, unidade_medida: e.target.value }))}
                              className="w-full"
                            />
                          ) : (
                            item.unidade_medida
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {itemEditando === index ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={itemEditado.quantidade_contratada ?? item.quantidade_contratada}
                              onChange={(e) => setItemEditado(prev => ({ ...prev, quantidade_contratada: parseFloat(e.target.value) || 0 }))}
                              className="w-24 ml-auto"
                            />
                          ) : (
                            item.quantidade_contratada.toFixed(2)
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {itemEditando === index ? (
                            <Input
                              type="number"
                              step="0.01"
                              value={itemEditado.valor_unitario ?? item.valor_unitario}
                              onChange={(e) => setItemEditado(prev => ({ ...prev, valor_unitario: parseFloat(e.target.value) || 0 }))}
                              className="w-24 ml-auto"
                            />
                          ) : (
                            formatarMoeda(item.valor_unitario)
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatarMoeda(itemEditando === index ? 
                            ((itemEditado.valor_unitario ?? item.valor_unitario) * (itemEditado.quantidade_contratada ?? item.quantidade_contratada)) :
                            item.valor_total
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          {itemEditando === index ? (
                            <div className="flex gap-2 justify-center">
                              <Button size="sm" onClick={() => salvarEdicao(index)}>
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelarEdicao}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex gap-2 justify-center">
                              <Button size="sm" variant="outline" onClick={() => iniciarEdicao(index)}>
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => removerItem(index)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>

              {errosValidacao.length > 0 && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-5 w-5 text-red-600" />
                    <h3 className="font-medium text-red-900">Erros de validação:</h3>
                  </div>
                  <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                    {errosValidacao.map((erro, idx) => (
                      <li key={idx}>{erro}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 flex justify-end gap-4">
                <Button variant="outline" onClick={() => setEtapa('upload')}>
                  Cancelar
                </Button>
                <Button onClick={importar} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Importar Contrato
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Etapa: Importando */}
      {etapa === 'importando' && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
              <p className="text-lg font-medium">Importando contrato...</p>
              <p className="text-sm text-gray-500 mt-2">Aguarde enquanto processamos os dados</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Etapa: Concluído */}
      {etapa === 'concluido' && resultado && (
        <Card>
          <CardContent className="py-12">
            <div className="flex flex-col items-center justify-center">
              {resultado.sucesso ? (
                <>
                  <CheckCircle2 className="h-16 w-16 text-green-600 mb-4" />
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Importação Concluída!</h2>
                  <p className="text-gray-600 mb-6">{resultado.mensagem}</p>
                  
                  {resultado.estatisticas && (
                    <div className="w-full max-w-md space-y-2 mb-6">
                      <div className="flex justify-between p-3 bg-gray-50 rounded">
                        <span>Total de itens:</span>
                        <span className="font-medium">{resultado.estatisticas.total_itens}</span>
                      </div>
                      <div className="flex justify-between p-3 bg-green-50 rounded">
                        <span>Itens importados:</span>
                        <span className="font-medium text-green-600">{resultado.estatisticas.itens_importados}</span>
                      </div>
                      {resultado.estatisticas.itens_com_erro > 0 && (
                        <div className="flex justify-between p-3 bg-red-50 rounded">
                          <span>Itens com erro:</span>
                          <span className="font-medium text-red-600">{resultado.estatisticas.itens_com_erro}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-4">
                    <Button onClick={() => router.push(`/orgao/contratos/${resultado.contrato_id}`)}>
                      Ver Contrato
                    </Button>
                    <Button variant="outline" onClick={novoImport}>
                      Importar Outro
                    </Button>
                    <Button variant="outline" onClick={voltar}>
                      Voltar ao Almoxarifado
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="h-16 w-16 text-red-600 mb-4" />
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Erro na Importação</h2>
                  <p className="text-gray-600 mb-6">{resultado.mensagem}</p>
                  <Button onClick={() => setEtapa('preview')}>
                    Tentar Novamente
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default function MigracaoContratosPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.ALMOXARIFADO}>
      <MigracaoContratosContent />
    </ModuleGuard>
  )
}
