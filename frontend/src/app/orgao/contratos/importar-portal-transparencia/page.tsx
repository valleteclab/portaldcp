'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { 
  ArrowLeft,
  Search,
  Download,
  Loader2,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  Building2,
  Check,
  X,
  AlertCircle,
  RotateCcw
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface ContratoAPI {
  contratoNumero: string
  documento: string
  favorecido: string
  contratoObjeto: string
  vigencia: string
  vigencia_inicio?: string
  aditivos_valor_total?: string | null
  valor_contrato?: string
  importStatus?: 'idle' | 'loading' | 'success' | 'already_exists' | 'error'
  importMessage?: string
}

interface ResultadoImportacao {
  importados: number
  erros: number
  detalhes: Array<{ numero: string; status: 'sucesso' | 'erro'; mensagem?: string }>
}

export default function ImportarPortalTransparenciaPage() {
  const [buscando, setBuscando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [contratos, setContratos] = useState<ContratoAPI[]>([])
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [numeroBusca, setNumeroBusca] = useState('')
  const [limite, setLimite] = useState(50)
  const [apenasVigentes, setApenasVigentes] = useState(true)

  const buscarContratos = async () => {
    setBuscando(true)
    setErro(null)
    setResultado(null)
    
    try {
      const params = new URLSearchParams()
      if (numeroBusca) params.append('numero', numeroBusca)
      params.append('limit', limite.toString())
      params.append('apenas_vigentes', apenasVigentes.toString())
      
      const res = await authFetch(`${API_URL}/api/contratos/portal-transparencia/buscar?${params}`)
      
      if (res.ok) {
        const data = await res.json()
        setContratos(data.data || [])
      } else {
        const errorData = await res.json().catch(() => ({}))
        setErro(errorData.message || 'Erro ao buscar contratos')
      }
    } catch (error) {
      setErro('Erro ao conectar com a API do Portal de Transparência')
    } finally {
      setBuscando(false)
    }
  }

  const importarContratos = async () => {
    if (contratos.length === 0) return
    
    setImportando(true)
    setErro(null)
    setResultado(null)
    
    try {
      const params = new URLSearchParams()
      if (numeroBusca) params.append('numero', numeroBusca)
      params.append('limit', limite.toString())
      params.append('apenas_vigentes', apenasVigentes.toString())
      
      const res = await authFetch(`${API_URL}/api/contratos/portal-transparencia/importar?${params}`, {
        method: 'POST'
      })
      
      if (res.ok) {
        const data = await res.json()
        setResultado(data)
      } else {
        const errorData = await res.json().catch(() => ({}))
        setErro(errorData.message || 'Erro ao importar contratos')
      }
    } catch (error) {
      setErro('Erro ao importar contratos')
    } finally {
      setImportando(false)
    }
  }

  const importarContratoIndividual = async (contrato: ContratoAPI, index: number) => {
    console.log('[Importar Individual] Iniciando importação:', contrato.contratoNumero)
    
    // Atualizar status para loading
    const novosContratos = [...contratos]
    novosContratos[index].importStatus = 'loading'
    setContratos(novosContratos)
    
    try {
      const url = `${API_URL}/api/contratos/portal-transparencia/importar-individual`
      console.log('[Importar Individual] URL:', url)
      console.log('[Importar Individual] Contrato:', contrato)
      
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contrato)
      })
      
      console.log('[Importar Individual] Resposta status:', res.status)
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error('[Importar Individual] Erro na resposta:', res.status, errorText)
        throw new Error(`Erro ${res.status}: ${errorText}`)
      }
      
      const data = await res.json()
      console.log('[Importar Individual] Dados recebidos:', data)
      
      const atualizados = [...contratos]
      if (data.ja_existe) {
        atualizados[index].importStatus = 'already_exists'
        atualizados[index].importMessage = data.mensagem
      } else if (data.sucesso) {
        atualizados[index].importStatus = 'success'
        atualizados[index].importMessage = data.mensagem
      } else {
        atualizados[index].importStatus = 'error'
        atualizados[index].importMessage = data.mensagem || 'Erro ao importar'
      }
      setContratos(atualizados)
    } catch (error) {
      console.error('[Importar Individual] Erro catch:', error)
      const atualizados = [...contratos]
      atualizados[index].importStatus = 'error'
      atualizados[index].importMessage = error instanceof Error ? error.message : 'Erro de conexão'
      setContratos(atualizados)
    }
  }

  const renderBotaoImportar = (contrato: ContratoAPI, index: number) => {
    switch (contrato.importStatus) {
      case 'loading':
        return (
          <Button size="sm" disabled variant="outline" className="bg-gray-50">
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Importando...
          </Button>
        )
      case 'success':
        return (
          <Button size="sm" disabled variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <Check className="w-4 h-4 mr-2" />
            Importado
          </Button>
        )
      case 'already_exists':
        return (
          <Button size="sm" disabled variant="outline" className="bg-gray-100 text-gray-600 border-gray-300">
            <X className="w-4 h-4 mr-2" />
            Já existe
          </Button>
        )
      case 'error':
        return (
          <Button 
            size="sm" 
            variant="outline" 
            className="bg-red-50 text-red-700 border-red-200 hover:bg-red-100"
            onClick={() => importarContratoIndividual(contrato, index)}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            Erro — Tentar
          </Button>
        )
      default:
        return (
          <Button 
            size="sm" 
            variant="outline" 
            className="bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
            onClick={() => importarContratoIndividual(contrato, index)}
          >
            <Download className="w-4 h-4 mr-2" />
            Importar
          </Button>
        )
    }
  }

  const formatarValor = (contrato: ContratoAPI) => {
    // Tentar usar aditivos_valor_total primeiro, senão valor_contrato
    if (contrato.aditivos_valor_total) {
      const num = parseFloat(contrato.aditivos_valor_total)
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num)
    } else if (contrato.valor_contrato) {
      return contrato.valor_contrato
    }
    return 'R$ 0,00'
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="sm" asChild>
            <Link href="/orgao/contratos">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="w-6 h-6 text-blue-600" />
              Importar do Portal de Transparência
            </h1>
            <p className="text-gray-600">
              Importe contratos diretamente da API do Portal da Transparência da CMLem
            </p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <a href="https://portaldatransparencia.cmlem.ba.gov.br" target="_blank" rel="noopener noreferrer">
            <ExternalLink className="w-4 h-4 mr-2" />
            Ver Portal
          </a>
        </Button>
      </div>

      {/* Busca */}
      <Card>
        <CardHeader>
          <CardTitle>Buscar Contratos</CardTitle>
          <CardDescription>
            Busque contratos na API do Portal de Transparência. Deixe em branco para buscar todos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <div className="flex gap-4">
              <div className="flex-[2]">
                <Input
                  placeholder="Número do contrato (ex: 001/2024) - opcional"
                  value={numeroBusca}
                  onChange={(e) => setNumeroBusca(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  min={1}
                  max={200}
                  placeholder="Limite"
                  value={limite}
                  onChange={(e) => setLimite(parseInt(e.target.value) || 50)}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="vigentes" 
                  checked={apenasVigentes}
                  onCheckedChange={(checked) => setApenasVigentes(checked as boolean)}
                />
                <Label htmlFor="vigentes" className="cursor-pointer">
                  Apenas contratos vigentes (vigência {'>='} hoje)
                </Label>
              </div>
              <Button onClick={buscarContratos} disabled={buscando}>
                {buscando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Erro */}
      {erro && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* Resultado da Importação */}
      {resultado && (
        <Alert className={resultado.erros === 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}>
          <CheckCircle className={`w-4 h-4 ${resultado.erros === 0 ? 'text-green-600' : 'text-yellow-600'}`} />
          <AlertDescription className="space-y-2">
            <p className="font-medium">
              Importação concluída: {resultado.importados} contratos importados com sucesso
              {resultado.erros > 0 && `, ${resultado.erros} erros`}
            </p>
            {resultado.detalhes.filter(d => d.status === 'erro').length > 0 && (
              <div className="text-sm">
                <p className="font-medium mt-2">Erros:</p>
                <ul className="list-disc list-inside mt-1">
                  {resultado.detalhes
                    .filter(d => d.status === 'erro')
                    .map((d, i) => (
                      <li key={i} className="text-red-600">{d.numero}: {d.mensagem}</li>
                    ))}
                </ul>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Lista de Contratos */}
      {contratos.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Contratos Encontrados</CardTitle>
                <CardDescription>
                  {contratos.length} contratos encontrados no Portal de Transparência
                </CardDescription>
              </div>
              <Button 
                onClick={importarContratos} 
                disabled={importando}
                className="bg-green-600 hover:bg-green-700"
              >
                {importando ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Importar Todos
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-2">Número</th>
                    <th className="text-left py-3 px-2">Fornecedor</th>
                    <th className="text-left py-3 px-2">Objeto</th>
                    <th className="text-right py-3 px-2">Valor</th>
                    <th className="text-center py-3 px-2">Vigência</th>
                    <th className="text-center py-3 px-2">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {contratos.map((contrato, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-2 font-medium">
                        {contrato.contratoNumero}
                      </td>
                      <td className="py-3 px-2">
                        <p className="font-medium">{contrato.favorecido}</p>
                        <p className="text-sm text-gray-500">{contrato.documento}</p>
                      </td>
                      <td className="py-3 px-2 max-w-md">
                        <p className="text-sm text-gray-700 line-clamp-2">
                          {contrato.contratoObjeto}
                        </p>
                      </td>
                      <td className="py-3 px-2 text-right font-medium">
                        {formatarValor(contrato)}
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Badge variant="outline">
                          {contrato.vigencia}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-center">
                        {renderBotaoImportar(contrato, index)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Estado vazio */}
      {contratos.length === 0 && !buscando && !erro && (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p className="text-gray-500">
              Clique em "Buscar" para carregar os contratos do Portal de Transparência
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
