'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  ArrowLeft,
  FileText, 
  Calendar, 
  Building2, 
  DollarSign,
  Download,
  User,
  AlertCircle,
  Package,
  Clock,
  CheckCircle
} from 'lucide-react'

interface ItemAta {
  id: string
  numero_item: number
  descricao: string
  descricao_detalhada: string
  unidade_medida: string
  quantidade_registrada: number
  quantidade_utilizada: number
  quantidade_saldo: number
  valor_unitario: number
  marca: string
  modelo: string
}

interface Ata {
  id: string
  numero_ata: string
  ano: number
  status: string
  objeto: string
  valor_total: number | string
  valor_utilizado: number | string
  valor_saldo: number | string
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  permite_adesao: boolean
  limite_adesao_percentual: number
  orgao: {
    id: string
    nome: string
    cnpj: string
    cidade: string
    uf: string
  }
  licitacao: {
    id: string
    numero_processo: string
    modalidade: string
  }
  itens: ItemAta[]
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function DetalheAtaPublicaPage() {
  const params = useParams()
  const id = params.id as string

  const [ata, setAta] = useState<Ata | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      carregarDados()
    }
  }, [id])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/atas/publicas/${id}`)
      if (response.ok) {
        setAta(await response.json())
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
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
    const cores: Record<string, string> = {
      'VIGENTE': 'bg-green-100 text-green-800',
      'ENCERRADA': 'bg-gray-100 text-gray-800',
      'ESGOTADA': 'bg-yellow-100 text-yellow-800',
      'CANCELADA': 'bg-red-100 text-red-800'
    }
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${cores[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    )
  }

  const calcularPercentualSaldo = (total: number, saldo: number) => {
    if (!total) return 0
    return Math.round((saldo / total) * 100)
  }

  const calcularDiasRestantes = (dataFim: string) => {
    const fim = new Date(dataFim)
    const hoje = new Date()
    const diff = Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando ata...</p>
        </div>
      </div>
    )
  }

  if (!ata) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="text-center py-12">
            <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ata não encontrada</h2>
            <p className="text-gray-600 mb-4">A ata solicitada não existe ou não está disponível.</p>
            <Button asChild>
              <Link href="/atas">Voltar para Atas</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const diasRestantes = calcularDiasRestantes(ata.data_vigencia_fim)
  const valorTotal = typeof ata.valor_total === 'string' ? parseFloat(ata.valor_total) : ata.valor_total
  const valorSaldo = typeof ata.valor_saldo === 'string' ? parseFloat(ata.valor_saldo) : ata.valor_saldo
  const percentualSaldo = calcularPercentualSaldo(valorTotal, valorSaldo)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/atas">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Atas
            </Link>
          </Button>
          
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                {getStatusBadge(ata.status)}
                {ata.permite_adesao && (
                  <Badge variant="secondary">Permite Adesão (Carona)</Badge>
                )}
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                Ata de Registro de Preço nº {ata.numero_ata}
              </h1>
            </div>
            
            <Button>
              <Download className="w-4 h-4 mr-2" />
              Baixar Ata
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Principal */}
          <div className="lg:col-span-2 space-y-6">
            {/* Objeto */}
            <Card>
              <CardHeader>
                <CardTitle>Objeto</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">{ata.objeto}</p>
              </CardContent>
            </Card>

            {/* Saldo */}
            <Card>
              <CardHeader>
                <CardTitle>Saldo da Ata</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="p-4 bg-gray-50 rounded-lg text-center">
                    <p className="text-sm text-gray-500">Valor Total</p>
                    <p className="text-xl font-bold">{formatarMoeda(ata.valor_total)}</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg text-center">
                    <p className="text-sm text-blue-600">Utilizado</p>
                    <p className="text-xl font-bold text-blue-600">{formatarMoeda(ata.valor_utilizado)}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg text-center">
                    <p className="text-sm text-green-600">Saldo Disponível</p>
                    <p className="text-xl font-bold text-green-600">{formatarMoeda(ata.valor_saldo)}</p>
                  </div>
                </div>

                {/* Barra de Progresso */}
                <div className="bg-gray-200 rounded-full h-4 mb-2">
                  <div 
                    className={`h-4 rounded-full transition-all ${
                      percentualSaldo > 50 ? 'bg-green-500' : 
                      percentualSaldo > 20 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${percentualSaldo}%` }}
                  />
                </div>
                <p className="text-center text-sm text-gray-500">
                  {percentualSaldo}% do saldo disponível
                </p>
              </CardContent>
            </Card>

            {/* Itens */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="w-5 h-5" />
                  Itens Registrados ({ata.itens?.length || 0})
                </CardTitle>
                <CardDescription>
                  Lista de itens com preços registrados nesta ata
                </CardDescription>
              </CardHeader>
              <CardContent>
                {!ata.itens || ata.itens.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    Nenhum item registrado.
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left py-3 px-2">Item</th>
                          <th className="text-left py-3 px-2">Descrição</th>
                          <th className="text-center py-3 px-2">Unid.</th>
                          <th className="text-right py-3 px-2">Qtd. Reg.</th>
                          <th className="text-right py-3 px-2">Saldo</th>
                          <th className="text-right py-3 px-2">Valor Unit.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ata.itens.map((item) => {
                          const saldoPercentual = calcularPercentualSaldo(
                            item.quantidade_registrada, 
                            item.quantidade_saldo
                          )
                          
                          return (
                            <tr key={item.id} className="border-b hover:bg-gray-50">
                              <td className="py-3 px-2 font-medium">{item.numero_item}</td>
                              <td className="py-3 px-2">
                                <p className="font-medium">{item.descricao}</p>
                                {item.marca && (
                                  <p className="text-xs text-gray-500">
                                    Marca: {item.marca} {item.modelo && `| Modelo: ${item.modelo}`}
                                  </p>
                                )}
                              </td>
                              <td className="py-3 px-2 text-center">{item.unidade_medida}</td>
                              <td className="py-3 px-2 text-right">{item.quantidade_registrada}</td>
                              <td className="py-3 px-2 text-right">
                                <span className={`font-medium ${
                                  saldoPercentual > 50 ? 'text-green-600' : 
                                  saldoPercentual > 20 ? 'text-yellow-600' : 'text-red-600'
                                }`}>
                                  {item.quantidade_saldo}
                                </span>
                                <span className="text-xs text-gray-400 ml-1">
                                  ({saldoPercentual}%)
                                </span>
                              </td>
                              <td className="py-3 px-2 text-right font-medium">
                                {formatarMoeda(item.valor_unitario)}
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

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Vigência */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="w-5 h-5" />
                  Vigência
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Data de Assinatura</p>
                  <p className="font-medium">{formatarData(ata.data_assinatura)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Início da Vigência</p>
                  <p className="font-medium">{formatarData(ata.data_vigencia_inicio)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fim da Vigência</p>
                  <p className="font-medium">{formatarData(ata.data_vigencia_fim)}</p>
                </div>
                
                {ata.status === 'VIGENTE' && (
                  <div className={`p-3 rounded-lg ${diasRestantes <= 30 ? 'bg-yellow-50' : 'bg-green-50'}`}>
                    <div className="flex items-center gap-2">
                      <Clock className={`w-5 h-5 ${diasRestantes <= 30 ? 'text-yellow-600' : 'text-green-600'}`} />
                      <span className={`font-medium ${diasRestantes <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {diasRestantes > 0 ? `${diasRestantes} dias restantes` : 'Vencida'}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Fornecedor */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Fornecedor Registrado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{ata.fornecedor_razao_social}</p>
                <p className="text-sm text-gray-500">CNPJ: {ata.fornecedor_cnpj}</p>
              </CardContent>
            </Card>

            {/* Órgão Gerenciador */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Órgão Gerenciador
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{ata.orgao?.nome}</p>
                <p className="text-sm text-gray-500">CNPJ: {ata.orgao?.cnpj}</p>
                <p className="text-sm text-gray-500 mt-2">
                  {ata.orgao?.cidade}/{ata.orgao?.uf}
                </p>
              </CardContent>
            </Card>

            {/* Adesão */}
            {ata.permite_adesao && (
              <Card className="border-blue-200 bg-blue-50">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-blue-700">
                    <CheckCircle className="w-5 h-5" />
                    Adesão (Carona)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-blue-700">
                    Esta ata permite adesão por outros órgãos.
                  </p>
                  {ata.limite_adesao_percentual && (
                    <p className="text-sm text-blue-600 mt-2">
                      Limite: até {ata.limite_adesao_percentual}% do quantitativo registrado
                    </p>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Licitação de Origem */}
            {ata.licitacao && (
              <Card>
                <CardHeader>
                  <CardTitle>Licitação de Origem</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{ata.licitacao.numero_processo}</p>
                  <p className="text-sm text-gray-500">{ata.licitacao.modalidade}</p>
                  <Button variant="link" className="p-0 h-auto mt-2" asChild>
                    <Link href={`/licitacoes/${ata.licitacao.id}`}>
                      Ver licitação →
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
