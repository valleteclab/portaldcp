'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  FileText, 
  Calendar, 
  DollarSign,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  Building,
  Eye,
  Download,
  Bell
} from 'lucide-react'

interface Contrato {
  id: string
  numero_contrato: string
  ano: number
  tipo: string
  status: string
  objeto: string
  valor_global: number
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  numero_processo: string
  orgao: {
    id: string
    nome: string
    cidade: string
    uf: string
  }
}

interface Ata {
  id: string
  numero_ata: string
  ano: number
  status: string
  objeto: string
  valor_total: number
  valor_saldo: number
  data_vigencia_fim: string
  orgao: {
    id: string
    nome: string
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const STATUS_CONTRATO = {
  'VIGENTE': { label: 'Vigente', cor: 'bg-green-100 text-green-800' },
  'ENCERRADO': { label: 'Encerrado', cor: 'bg-gray-100 text-gray-800' },
  'RESCINDIDO': { label: 'Rescindido', cor: 'bg-red-100 text-red-800' },
  'SUSPENSO': { label: 'Suspenso', cor: 'bg-yellow-100 text-yellow-800' }
}

export default function ContratosFornecedorPage() {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [atas, setAtas] = useState<Ata[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    busca: '',
    status: ''
  })

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const fornecedorData = localStorage.getItem('fornecedor')
      if (!fornecedorData) return

      const fornecedor = JSON.parse(fornecedorData)

      const [contratosRes, atasRes] = await Promise.all([
        fetch(`${API_URL}/api/contratos?fornecedorId=${fornecedor.id}`),
        fetch(`${API_URL}/api/atas?fornecedorId=${fornecedor.id}`)
      ])

      if (contratosRes.ok) {
        setContratos(await contratosRes.json())
      }
      if (atasRes.ok) {
        setAtas(await atasRes.json())
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatarMoeda = (valor: number) => {
    return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarData = (data: string) => {
    if (!data) return '-'
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const calcularDiasRestantes = (dataFim: string) => {
    const fim = new Date(dataFim)
    const hoje = new Date()
    return Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  }

  const contratosVigentes = contratos.filter(c => c.status === 'VIGENTE')
  const contratosAVencer = contratosVigentes.filter(c => calcularDiasRestantes(c.data_vigencia_fim) <= 30)
  const valorTotalContratos = contratosVigentes.reduce((sum, c) => sum + Number(c.valor_global), 0)

  const contratosFiltrados = contratos.filter(contrato => {
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase()
      if (!contrato.objeto.toLowerCase().includes(busca) && 
          !contrato.numero_contrato.toLowerCase().includes(busca) &&
          !contrato.orgao?.nome.toLowerCase().includes(busca)) {
        return false
      }
    }
    if (filtros.status && contrato.status !== filtros.status) return false
    return true
  })

  if (loading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Carregando contratos...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Meus Contratos</h1>
        <p className="text-gray-600">Acompanhe seus contratos e atas de registro de preço</p>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Contratos Vigentes</p>
                <p className="text-2xl font-bold text-green-600">{contratosVigentes.length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Atas Vigentes</p>
                <p className="text-2xl font-bold text-blue-600">
                  {atas.filter(a => a.status === 'VIGENTE').length}
                </p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card className={contratosAVencer.length > 0 ? 'border-yellow-300 bg-yellow-50' : ''}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">A Vencer (30 dias)</p>
                <p className="text-2xl font-bold text-yellow-600">{contratosAVencer.length}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Valor Total Vigente</p>
                <p className="text-lg font-bold">{formatarMoeda(valorTotalContratos)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas */}
      {contratosAVencer.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700">
              <Bell className="w-5 h-5" />
              Atenção: Contratos a Vencer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {contratosAVencer.map(contrato => {
                const dias = calcularDiasRestantes(contrato.data_vigencia_fim)
                return (
                  <div key={contrato.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <div>
                      <p className="font-medium">{contrato.numero_contrato}</p>
                      <p className="text-sm text-gray-600">{contrato.orgao?.nome}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={dias <= 7 ? 'destructive' : 'secondary'}>
                        {dias} dias restantes
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="contratos">
        <TabsList>
          <TabsTrigger value="contratos">
            <FileText className="w-4 h-4 mr-2" />
            Contratos ({contratos.length})
          </TabsTrigger>
          <TabsTrigger value="atas">
            <FileText className="w-4 h-4 mr-2" />
            Atas de Registro ({atas.length})
          </TabsTrigger>
        </TabsList>

        {/* Contratos */}
        <TabsContent value="contratos">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Meus Contratos</CardTitle>
                <div className="flex gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                      placeholder="Buscar..."
                      className="pl-10 w-64"
                      value={filtros.busca}
                      onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                    />
                  </div>
                  <Select value={filtros.status || 'all'} onValueChange={(v) => setFiltros({ ...filtros, status: v === 'all' ? '' : v })}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {Object.entries(STATUS_CONTRATO).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{val.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {contratosFiltrados.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>Nenhum contrato encontrado.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {contratosFiltrados.map((contrato) => {
                    const diasRestantes = calcularDiasRestantes(contrato.data_vigencia_fim)
                    
                    return (
                      <div key={contrato.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.cor || ''}>
                                {STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.label || contrato.status}
                              </Badge>
                              {contrato.status === 'VIGENTE' && diasRestantes <= 30 && (
                                <Badge variant="secondary">
                                  <Clock className="w-3 h-3 mr-1" />
                                  {diasRestantes} dias
                                </Badge>
                              )}
                            </div>
                            
                            <h3 className="font-semibold text-lg">{contrato.numero_contrato}</h3>
                            <p className="text-gray-600 text-sm mb-2">{contrato.objeto}</p>
                            
                            <div className="flex items-center gap-4 text-sm text-gray-500">
                              <span className="flex items-center gap-1">
                                <Building className="w-4 h-4" />
                                {contrato.orgao?.nome}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                Vigência: {formatarData(contrato.data_vigencia_fim)}
                              </span>
                              <span className="flex items-center gap-1">
                                <DollarSign className="w-4 h-4" />
                                {formatarMoeda(contrato.valor_global)}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 ml-4">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/fornecedor/contratos/${contrato.id}`}>
                                <Eye className="w-4 h-4 mr-1" />
                                Detalhes
                              </Link>
                            </Button>
                            <Button variant="outline" size="sm">
                              <Download className="w-4 h-4 mr-1" />
                              PDF
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Atas */}
        <TabsContent value="atas">
          <Card>
            <CardHeader>
              <CardTitle>Minhas Atas de Registro de Preço</CardTitle>
            </CardHeader>
            <CardContent>
              {atas.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                  <p>Nenhuma ata encontrada.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {atas.map((ata) => {
                    const percentualSaldo = ata.valor_total ? Math.round((Number(ata.valor_saldo) / Number(ata.valor_total)) * 100) : 0
                    
                    return (
                      <div key={ata.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge className={ata.status === 'VIGENTE' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                                {ata.status}
                              </Badge>
                            </div>
                            
                            <h3 className="font-semibold text-lg">{ata.numero_ata}</h3>
                            <p className="text-gray-600 text-sm mb-2">{ata.objeto}</p>
                            
                            <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                              <span className="flex items-center gap-1">
                                <Building className="w-4 h-4" />
                                {ata.orgao?.nome}
                              </span>
                              <span className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                Vigência: {formatarData(ata.data_vigencia_fim)}
                              </span>
                            </div>

                            {/* Barra de Saldo */}
                            <div>
                              <div className="flex justify-between text-sm mb-1">
                                <span>Saldo: {formatarMoeda(ata.valor_saldo)} ({percentualSaldo}%)</span>
                                <span>Total: {formatarMoeda(ata.valor_total)}</span>
                              </div>
                              <div className="bg-gray-200 rounded-full h-2">
                                <div 
                                  className={`h-2 rounded-full ${
                                    percentualSaldo > 50 ? 'bg-green-500' : 
                                    percentualSaldo > 20 ? 'bg-yellow-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${percentualSaldo}%` }}
                                />
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 ml-4">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/fornecedor/atas/${ata.id}`}>
                                <Eye className="w-4 h-4 mr-1" />
                                Detalhes
                              </Link>
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
