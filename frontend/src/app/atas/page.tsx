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
  AlertCircle,
  Package,
  CheckCircle
} from 'lucide-react'

interface ItemAta {
  id: string
  numero_item: number
  descricao: string
  unidade_medida: string
  quantidade_registrada: number
  quantidade_saldo: number
  valor_unitario: number
}

interface Ata {
  id: string
  numero_ata: string
  ano: number
  status: string
  objeto: string
  valor_total: number | string
  valor_saldo: number | string
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  permite_adesao: boolean
  orgao: {
    id: string
    nome: string
    cnpj: string
  }
  itens: ItemAta[]
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const STATUS_ATA = [
  { value: 'VIGENTE', label: 'Vigente', cor: 'bg-green-100 text-green-800' },
  { value: 'ENCERRADA', label: 'Encerrada', cor: 'bg-gray-100 text-gray-800' },
  { value: 'ESGOTADA', label: 'Esgotada', cor: 'bg-yellow-100 text-yellow-800' },
  { value: 'CANCELADA', label: 'Cancelada', cor: 'bg-red-100 text-red-800' }
]

export default function AtasPublicasPage() {
  const [atas, setAtas] = useState<Ata[]>([])
  const [loading, setLoading] = useState(true)
  const [filtros, setFiltros] = useState({
    busca: '',
    status: '',
    ano: '',
    apenasVigentes: false
  })

  useEffect(() => {
    carregarAtas()
  }, [])

  const carregarAtas = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/atas/publicas/lista`)
      if (response.ok) {
        const data = await response.json()
        setAtas(data)
      }
    } catch (error) {
      console.error('Erro ao carregar atas:', error)
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
    const statusConfig = STATUS_ATA.find(s => s.value === status)
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig?.cor || 'bg-gray-100 text-gray-800'}`}>
        {statusConfig?.label || status}
      </span>
    )
  }

  const calcularPercentualSaldo = (total: number | string, saldo: number | string) => {
    const t = typeof total === 'string' ? parseFloat(total) : total
    const s = typeof saldo === 'string' ? parseFloat(saldo) : saldo
    if (!t) return 0
    return Math.round((s / t) * 100)
  }

  const atasFiltradas = atas.filter(ata => {
    if (filtros.busca) {
      const busca = filtros.busca.toLowerCase()
      if (!ata.objeto.toLowerCase().includes(busca) && 
          !ata.numero_ata.toLowerCase().includes(busca) &&
          !ata.fornecedor_razao_social.toLowerCase().includes(busca)) {
        return false
      }
    }
    if (filtros.status && ata.status !== filtros.status) return false
    if (filtros.ano && ata.ano !== parseInt(filtros.ano)) return false
    if (filtros.apenasVigentes && ata.status !== 'VIGENTE') return false
    return true
  })

  const anos = [...new Set(atas.map(a => a.ano))].sort((a, b) => b - a)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Atas de Registro de Preço</h1>
              <p className="text-gray-600 mt-1">
                Consulte as atas vigentes e seus itens registrados
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
                <Link href="/contratos">
                  <FileText className="w-4 h-4 mr-2" />
                  Contratos
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
                  {STATUS_ATA.map(status => (
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
            {atasFiltradas.length} ata(s) encontrada(s)
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Carregando atas...</p>
          </div>
        ) : atasFiltradas.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">Nenhuma ata encontrada com os filtros selecionados.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {atasFiltradas.map((ata) => {
              const percentualSaldo = calcularPercentualSaldo(ata.valor_total, ata.valor_saldo)
              
              return (
                <Card key={ata.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          {getStatusBadge(ata.status)}
                          {ata.permite_adesao && (
                            <Badge variant="secondary">Permite Adesão</Badge>
                          )}
                        </div>
                        
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                          Ata nº {ata.numero_ata}
                        </h3>
                        
                        <p className="text-gray-600 mb-4 line-clamp-2">
                          {ata.objeto}
                        </p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                          <div className="flex items-center gap-2 text-gray-500">
                            <User className="w-4 h-4" />
                            <span className="truncate">{ata.fornecedor_razao_social}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <Building2 className="w-4 h-4" />
                            <span className="truncate">{ata.orgao?.nome}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <Calendar className="w-4 h-4" />
                            <span>Vigência: {formatarData(ata.data_vigencia_fim)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-500">
                            <Package className="w-4 h-4" />
                            <span>{ata.itens?.length || 0} itens</span>
                          </div>
                        </div>

                        {/* Barra de Saldo */}
                        <div className="bg-gray-100 rounded-full h-2 mb-2">
                          <div 
                            className={`h-2 rounded-full ${percentualSaldo > 50 ? 'bg-green-500' : percentualSaldo > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${percentualSaldo}%` }}
                          />
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">
                            Saldo: {formatarMoeda(ata.valor_saldo)} ({percentualSaldo}%)
                          </span>
                          <span className="text-gray-500">
                            Total: {formatarMoeda(ata.valor_total)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col gap-2 lg:items-end">
                        <Button asChild>
                          <Link href={`/atas/${ata.id}`}>
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Ver Detalhes
                          </Link>
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="w-4 h-4 mr-2" />
                          Baixar Ata
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
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
