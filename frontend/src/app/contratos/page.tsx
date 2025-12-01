'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Search, 
  FileText, 
  Calendar, 
  Building2, 
  DollarSign,
  Filter,
  ExternalLink,
  Download,
  User,
  AlertCircle
} from 'lucide-react'

interface Contrato {
  id: string
  numero_contrato: string
  ano: number
  tipo: string
  categoria: string
  status: string
  objeto: string
  valor_inicial: number | string
  valor_global: number | string
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  numero_processo: string
  orgao: {
    id: string
    nome: string
    cnpj: string
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const STATUS_CONTRATO = [
  { value: 'VIGENTE', label: 'Vigente', cor: 'bg-green-100 text-green-800' },
  { value: 'ENCERRADO', label: 'Encerrado', cor: 'bg-gray-100 text-gray-800' },
  { value: 'RESCINDIDO', label: 'Rescindido', cor: 'bg-red-100 text-red-800' },
  { value: 'SUSPENSO', label: 'Suspenso', cor: 'bg-yellow-100 text-yellow-800' }
]

const TIPOS_CONTRATO = [
  { value: 'CONTRATO', label: 'Contrato' },
  { value: 'NOTA_EMPENHO', label: 'Nota de Empenho' },
  { value: 'ORDEM_SERVICO', label: 'Ordem de Serviço' },
  { value: 'ORDEM_FORNECIMENTO', label: 'Ordem de Fornecimento' },
  { value: 'ATA_REGISTRO_PRECO', label: 'Ata de Registro de Preço' }
]

export default function ContratosPublicosPage() {
  const [contratos, setContratos] = useState<Contrato[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    busca: '',
    status: '',
    tipo: '',
    ano: ''
  })

  useEffect(() => {
    carregarContratos()
  }, [])

  const carregarContratos = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/contratos/publicos/lista`)
      if (response.ok) {
        const data = await response.json()
        setContratos(data)
      }
    } catch (error) {
      console.error('Erro ao carregar contratos:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatarMoeda = (valor: number | string) => {
    const numero = typeof valor === 'string' ? parseFloat(valor) : valor
    return (numero || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarData = (data: string) => {
    if (!data) return '-'
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const getStatusBadge = (status: string) => {
    const statusConfig = STATUS_CONTRATO.find(s => s.value === status)
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig?.cor || 'bg-gray-100 text-gray-800'}`}>
        {statusConfig?.label || status}
      </span>
    )
  }

  const getTipoLabel = (tipo: string) => {
    const tipoConfig = TIPOS_CONTRATO.find(t => t.value === tipo)
    return tipoConfig?.label || tipo
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
    if (filtros.tipo && contrato.tipo !== filtros.tipo) return false
    if (filtros.ano && contrato.ano !== parseInt(filtros.ano)) return false
    return true
  })

  const anos = [...new Set(contratos.map(c => c.ano))].sort((a, b) => b - a)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Portal de Contratos</h1>
              <p className="text-gray-600 mt-1">
                Consulte os contratos públicos e seus termos aditivos
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href="/licitacoes">
                  <FileText className="w-4 h-4 mr-2" />
                  Licitações
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/atas">
                  <FileText className="w-4 h-4 mr-2" />
                  Atas de Registro
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Filtros */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros de Pesquisa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <Input
                    placeholder="Buscar por objeto, número ou fornecedor..."
                    className="pl-10"
                    value={filtros.busca}
                    onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
                  />
                </div>
              </div>
              <Select
                value={filtros.status}
                onValueChange={(value) => setFiltros({ ...filtros, status: value === 'all' ? '' : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {STATUS_CONTRATO.map(status => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={filtros.ano}
                onValueChange={(value) => setFiltros({ ...filtros, ano: value === 'all' ? '' : value })}
              >
                <SelectTrigger>
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
          </CardContent>
        </Card>

        {/* Resultados */}
        <div className="mb-4 flex items-center justify-between">
          <p className="text-gray-600">
            {contratosFiltrados.length} contrato(s) encontrado(s)
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Carregando contratos...</p>
          </div>
        ) : contratosFiltrados.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">Nenhum contrato encontrado com os filtros selecionados.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {contratosFiltrados.map((contrato) => (
              <Card key={contrato.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge variant="outline">{getTipoLabel(contrato.tipo)}</Badge>
                        {getStatusBadge(contrato.status)}
                      </div>
                      
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">
                        Contrato nº {contrato.numero_contrato}
                      </h3>
                      
                      <p className="text-gray-600 mb-4 line-clamp-2">
                        {contrato.objeto}
                      </p>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-500">
                          <User className="w-4 h-4" />
                          <span className="truncate">{contrato.fornecedor_razao_social}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <Building2 className="w-4 h-4" />
                          <span className="truncate">{contrato.orgao?.nome}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <Calendar className="w-4 h-4" />
                          <span>Vigência: {formatarData(contrato.data_vigencia_fim)}</span>
                        </div>
                        <div className="flex items-center gap-2 text-gray-500">
                          <DollarSign className="w-4 h-4" />
                          <span>{formatarMoeda(contrato.valor_global)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 lg:items-end">
                      <Button asChild>
                        <Link href={`/contratos/${contrato.id}`}>
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Ver Detalhes
                        </Link>
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Baixar Contrato
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-gray-800 text-white py-8 mt-12">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <h4 className="font-semibold mb-4">LicitaFácil</h4>
              <p className="text-gray-400 text-sm">
                Plataforma de licitações eletrônicas conforme Lei 14.133/2021
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Links Úteis</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/licitacoes" className="hover:text-white">Licitações</Link></li>
                <li><Link href="/contratos" className="hover:text-white">Contratos</Link></li>
                <li><Link href="/atas" className="hover:text-white">Atas de Registro de Preço</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Acesso</h4>
              <ul className="space-y-2 text-sm text-gray-400">
                <li><Link href="/login" className="hover:text-white">Portal do Fornecedor</Link></li>
                <li><Link href="/orgao-login" className="hover:text-white">Portal do Órgão</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-gray-400 text-sm">
            © {new Date().getFullYear()} LicitaFácil. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  )
}
