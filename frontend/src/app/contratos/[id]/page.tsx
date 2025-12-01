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
  MapPin,
  Phone,
  Mail,
  AlertCircle,
  CheckCircle,
  Clock,
  TrendingUp,
  TrendingDown
} from 'lucide-react'

interface TermoAditivo {
  id: string
  numero_termo: string
  tipo: string
  objeto: string
  valor_acrescimo: number
  valor_supressao: number
  data_assinatura: string
  status: string
}

interface Contrato {
  id: string
  numero_contrato: string
  ano: number
  tipo: string
  categoria: string
  status: string
  objeto: string
  objeto_detalhado: string
  valor_inicial: number | string
  valor_global: number | string
  valor_acrescimos: number | string
  valor_supressoes: number | string
  data_assinatura: string
  data_vigencia_inicio: string
  data_vigencia_fim: string
  data_publicacao: string
  fornecedor_cnpj: string
  fornecedor_razao_social: string
  numero_processo: string
  amparo_legal: string
  fiscal_nome: string
  gestor_nome: string
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
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function DetalheContratoPublicoPage() {
  const params = useParams()
  const id = params.id as string

  const [contrato, setContrato] = useState<Contrato | null>(null)
  const [termos, setTermos] = useState<TermoAditivo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      carregarDados()
    }
  }, [id])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const [contratoRes, termosRes] = await Promise.all([
        fetch(`${API_URL}/api/contratos/publicos/${id}`),
        fetch(`${API_URL}/api/contratos/${id}/termos`)
      ])

      if (contratoRes.ok) {
        setContrato(await contratoRes.json())
      }
      if (termosRes.ok) {
        setTermos(await termosRes.json())
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
      'ENCERRADO': 'bg-gray-100 text-gray-800',
      'RESCINDIDO': 'bg-red-100 text-red-800',
      'SUSPENSO': 'bg-yellow-100 text-yellow-800'
    }
    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${cores[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    )
  }

  const getTipoTermoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      'ADITIVO_PRAZO': 'Aditivo de Prazo',
      'ADITIVO_VALOR': 'Aditivo de Valor',
      'ADITIVO_PRAZO_VALOR': 'Aditivo de Prazo e Valor',
      'APOSTILAMENTO': 'Apostilamento',
      'RESCISAO': 'Rescisão',
      'REAJUSTE': 'Reajuste'
    }
    return labels[tipo] || tipo
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
          <p className="mt-4 text-gray-600">Carregando contrato...</p>
        </div>
      </div>
    )
  }

  if (!contrato) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="text-center py-12">
            <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Contrato não encontrado</h2>
            <p className="text-gray-600 mb-4">O contrato solicitado não existe ou não está disponível.</p>
            <Button asChild>
              <Link href="/contratos">Voltar para Contratos</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const diasRestantes = calcularDiasRestantes(contrato.data_vigencia_fim)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/contratos">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Contratos
            </Link>
          </Button>
          
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">{contrato.tipo}</Badge>
                {getStatusBadge(contrato.status)}
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                Contrato nº {contrato.numero_contrato}
              </h1>
              <p className="text-gray-600">Processo: {contrato.numero_processo}</p>
            </div>
            
            <Button>
              <Download className="w-4 h-4 mr-2" />
              Baixar Contrato
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
                <CardTitle>Objeto do Contrato</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">
                  {contrato.objeto_detalhado || contrato.objeto}
                </p>
              </CardContent>
            </Card>

            {/* Valores */}
            <Card>
              <CardHeader>
                <CardTitle>Valores</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500">Valor Inicial</p>
                    <p className="text-xl font-bold">{formatarMoeda(contrato.valor_inicial)}</p>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <p className="text-sm text-green-600 flex items-center gap-1">
                      <TrendingUp className="w-4 h-4" /> Acréscimos
                    </p>
                    <p className="text-xl font-bold text-green-600">
                      {formatarMoeda(contrato.valor_acrescimos)}
                    </p>
                  </div>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <p className="text-sm text-red-600 flex items-center gap-1">
                      <TrendingDown className="w-4 h-4" /> Supressões
                    </p>
                    <p className="text-xl font-bold text-red-600">
                      {formatarMoeda(contrato.valor_supressoes)}
                    </p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-600">Valor Global</p>
                    <p className="text-xl font-bold text-blue-600">
                      {formatarMoeda(contrato.valor_global)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Termos Aditivos */}
            <Card>
              <CardHeader>
                <CardTitle>Termos Aditivos e Apostilamentos</CardTitle>
                <CardDescription>
                  Histórico de alterações contratuais
                </CardDescription>
              </CardHeader>
              <CardContent>
                {termos.length === 0 ? (
                  <p className="text-gray-500 text-center py-8">
                    Nenhum termo aditivo registrado.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {termos.map((termo) => (
                      <div key={termo.id} className="p-4 border rounded-lg">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-500" />
                            <span className="font-medium">{termo.numero_termo}</span>
                            <Badge variant="outline">{getTipoTermoLabel(termo.tipo)}</Badge>
                          </div>
                          <span className="text-sm text-gray-500">
                            {formatarData(termo.data_assinatura)}
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-2">{termo.objeto}</p>
                        <div className="flex gap-4 text-sm">
                          {termo.valor_acrescimo > 0 && (
                            <span className="text-green-600">
                              + {formatarMoeda(termo.valor_acrescimo)}
                            </span>
                          )}
                          {termo.valor_supressao > 0 && (
                            <span className="text-red-600">
                              - {formatarMoeda(termo.valor_supressao)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
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
                  <p className="font-medium">{formatarData(contrato.data_assinatura)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Início da Vigência</p>
                  <p className="font-medium">{formatarData(contrato.data_vigencia_inicio)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Fim da Vigência</p>
                  <p className="font-medium">{formatarData(contrato.data_vigencia_fim)}</p>
                </div>
                
                {contrato.status === 'VIGENTE' && (
                  <div className={`p-3 rounded-lg ${diasRestantes <= 30 ? 'bg-yellow-50' : 'bg-green-50'}`}>
                    <div className="flex items-center gap-2">
                      <Clock className={`w-5 h-5 ${diasRestantes <= 30 ? 'text-yellow-600' : 'text-green-600'}`} />
                      <span className={`font-medium ${diasRestantes <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>
                        {diasRestantes > 0 ? `${diasRestantes} dias restantes` : 'Vencido'}
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contratado */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Contratado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{contrato.fornecedor_razao_social}</p>
                <p className="text-sm text-gray-500">CNPJ: {contrato.fornecedor_cnpj}</p>
              </CardContent>
            </Card>

            {/* Órgão */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Órgão Contratante
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-semibold">{contrato.orgao?.nome}</p>
                <p className="text-sm text-gray-500">CNPJ: {contrato.orgao?.cnpj}</p>
                <p className="text-sm text-gray-500 mt-2">
                  {contrato.orgao?.cidade}/{contrato.orgao?.uf}
                </p>
              </CardContent>
            </Card>

            {/* Responsáveis */}
            <Card>
              <CardHeader>
                <CardTitle>Responsáveis</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {contrato.fiscal_nome && (
                  <div>
                    <p className="text-sm text-gray-500">Fiscal do Contrato</p>
                    <p className="font-medium">{contrato.fiscal_nome}</p>
                  </div>
                )}
                {contrato.gestor_nome && (
                  <div>
                    <p className="text-sm text-gray-500">Gestor do Contrato</p>
                    <p className="font-medium">{contrato.gestor_nome}</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Licitação de Origem */}
            {contrato.licitacao && (
              <Card>
                <CardHeader>
                  <CardTitle>Licitação de Origem</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="font-medium">{contrato.licitacao.numero_processo}</p>
                  <p className="text-sm text-gray-500">{contrato.licitacao.modalidade}</p>
                  <Button variant="link" className="p-0 h-auto mt-2" asChild>
                    <Link href={`/licitacoes/${contrato.licitacao.id}`}>
                      Ver licitação →
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Amparo Legal */}
            {contrato.amparo_legal && (
              <Card>
                <CardHeader>
                  <CardTitle>Amparo Legal</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{contrato.amparo_legal}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
