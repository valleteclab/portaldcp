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
  Plus, 
  FileText, 
  Calendar, 
  DollarSign,
  Search,
  AlertTriangle,
  CheckCircle,
  Clock,
  User,
  Building,
  Eye,
  Edit,
  Send
} from 'lucide-react'

interface Contrato {
  id: string
  numero_contrato: string
  ano: number
  tipo: string
  categoria: string
  status: string
  objeto: string
  valor_inicial: number
  valor_global: number
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  numero_processo: string
  enviado_pncp: boolean
  fiscal_nome: string
  gestor_nome: string
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const STATUS_CONTRATO = {
  'VIGENTE': { label: 'Vigente', cor: 'bg-green-100 text-green-800', icon: CheckCircle },
  'ENCERRADO': { label: 'Encerrado', cor: 'bg-gray-100 text-gray-800', icon: Clock },
  'RESCINDIDO': { label: 'Rescindido', cor: 'bg-red-100 text-red-800', icon: AlertTriangle },
  'SUSPENSO': { label: 'Suspenso', cor: 'bg-yellow-100 text-yellow-800', icon: AlertTriangle }
}

export default function ContratosOrgaoPage() {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [contratosAVencer, setContratosAVencer] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    busca: '',
    status: '',
    ano: ''
  })
  const [estatisticas, setEstatisticas] = useState({
    vigentes: 0,
    encerrados: 0,
    valorTotal: 0,
    aVencer30Dias: 0
  })

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const orgaoData = localStorage.getItem('orgao')
      if (!orgaoData) return

      const orgao = JSON.parse(orgaoData)

      const [contratosRes, aVencerRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/api/contratos?orgaoId=${orgao.id}`),
        fetch(`${API_URL}/api/contratos/estatisticas/a-vencer?orgaoId=${orgao.id}&dias=30`),
        fetch(`${API_URL}/api/contratos/estatisticas/status?orgaoId=${orgao.id}`)
      ])

      if (contratosRes.ok) {
        setContratos(await contratosRes.json())
      }
      if (aVencerRes.ok) {
        setContratosAVencer(await aVencerRes.json())
      }
      if (statsRes.ok) {
        const stats = await statsRes.json()
        setEstatisticas({
          vigentes: stats.VIGENTE || 0,
          encerrados: stats.ENCERRADO || 0,
          valorTotal: 0,
          aVencer30Dias: contratosAVencer.length
        })
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

  const contratosFiltrados = contratos.filter(contrato => {
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase()
      if (!contrato.objeto.toLowerCase().includes(busca) && 
          !contrato.numero_contrato.toLowerCase().includes(busca) &&
          !contrato.fornecedor_razao_social.toLowerCase().includes(busca)) {
        return false
      }
    }
    if (filtros.status && contrato.status !== filtros.status) return false
    if (filtros.ano && contrato.ano !== parseInt(filtros.ano)) return false
    return true
  })

  const anos = [...new Set(contratos.map(c => c.ano))].sort((a, b) => b - a)

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Gestão de Contratos</h1>
          <p className="text-gray-600">Gerencie os contratos do órgão</p>
        </div>
        <Button asChild>
          <Link href="/orgao/contratos/novo">
            <Plus className="w-4 h-4 mr-2" />
            Novo Contrato
          </Link>
        </Button>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Contratos Vigentes</p>
                <p className="text-2xl font-bold text-green-600">{estatisticas.vigentes}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Encerrados</p>
                <p className="text-2xl font-bold">{estatisticas.encerrados}</p>
              </div>
              <Clock className="w-8 h-8 text-gray-500" />
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
                <p className="text-sm text-gray-500">Total de Contratos</p>
                <p className="text-2xl font-bold">{contratos.length}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alertas de Vencimento */}
      {contratosAVencer.length > 0 && (
        <Card className="border-yellow-300 bg-yellow-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-700">
              <AlertTriangle className="w-5 h-5" />
              Contratos a Vencer nos Próximos 30 Dias
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {contratosAVencer.slice(0, 5).map(contrato => {
                const dias = calcularDiasRestantes(contrato.data_vigencia_fim)
                return (
                  <div key={contrato.id} className="flex items-center justify-between p-3 bg-white rounded-lg">
                    <div>
                      <p className="font-medium">{contrato.numero_contrato}</p>
                      <p className="text-sm text-gray-600">{contrato.fornecedor_razao_social}</p>
                    </div>
                    <div className="text-right">
                      <Badge variant={dias <= 7 ? 'destructive' : 'secondary'}>
                        {dias} dias restantes
                      </Badge>
                      <p className="text-sm text-gray-500 mt-1">
                        Vence em {formatarData(contrato.data_vigencia_fim)}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros e Lista */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Lista de Contratos</CardTitle>
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
              <Select value={filtros.ano || 'all'} onValueChange={(v) => setFiltros({ ...filtros, ano: v === 'all' ? '' : v })}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {anos.map(ano => (
                    <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
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
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left py-3 px-2">Contrato</th>
                    <th className="text-left py-3 px-2">Fornecedor</th>
                    <th className="text-left py-3 px-2">Objeto</th>
                    <th className="text-right py-3 px-2">Valor</th>
                    <th className="text-center py-3 px-2">Vigência</th>
                    <th className="text-center py-3 px-2">Status</th>
                    <th className="text-center py-3 px-2">PNCP</th>
                    <th className="text-center py-3 px-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {contratosFiltrados.map((contrato) => {
                    const StatusIcon = STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.icon || Clock
                    const diasRestantes = calcularDiasRestantes(contrato.data_vigencia_fim)
                    
                    return (
                      <tr key={contrato.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2">
                          <p className="font-medium">{contrato.numero_contrato}</p>
                          <p className="text-xs text-gray-500">{contrato.numero_processo}</p>
                        </td>
                        <td className="py-3 px-2">
                          <p className="font-medium">{contrato.fornecedor_razao_social}</p>
                          <p className="text-xs text-gray-500">{contrato.fornecedor_cnpj}</p>
                        </td>
                        <td className="py-3 px-2 max-w-xs truncate">{contrato.objeto}</td>
                        <td className="py-3 px-2 text-right font-medium">{formatarMoeda(contrato.valor_global)}</td>
                        <td className="py-3 px-2 text-center">
                          <p className="text-sm">{formatarData(contrato.data_vigencia_fim)}</p>
                          {contrato.status === 'VIGENTE' && diasRestantes <= 30 && (
                            <Badge variant="secondary" className="text-xs">
                              {diasRestantes}d
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <Badge className={STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.cor || ''}>
                            <StatusIcon className="w-3 h-3 mr-1" />
                            {STATUS_CONTRATO[contrato.status as keyof typeof STATUS_CONTRATO]?.label || contrato.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-center">
                          {contrato.enviado_pncp ? (
                            <CheckCircle className="w-5 h-5 text-green-500 mx-auto" />
                          ) : (
                            <Clock className="w-5 h-5 text-yellow-500 mx-auto" />
                          )}
                        </td>
                        <td className="py-3 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/orgao/contratos/${contrato.id}`}>
                                <Eye className="w-4 h-4" />
                              </Link>
                            </Button>
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/orgao/contratos/${contrato.id}/editar`}>
                                <Edit className="w-4 h-4" />
                              </Link>
                            </Button>
                            {!contrato.enviado_pncp && (
                              <Button variant="ghost" size="sm">
                                <Send className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
