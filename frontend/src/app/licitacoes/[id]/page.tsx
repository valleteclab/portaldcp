'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  ArrowLeft,
  FileText, 
  Calendar, 
  Building2, 
  DollarSign,
  Download,
  Clock,
  User,
  MapPin,
  Phone,
  Mail,
  ExternalLink,
  Package,
  AlertCircle,
  CheckCircle
} from 'lucide-react'

interface Documento {
  id: string
  tipo: string
  titulo: string
  nome_original: string
  tamanho_bytes: number
  data_publicacao: string
}

interface Item {
  id: string
  numero: number
  descricao: string
  unidade_medida: string
  quantidade: number
  valor_unitario_estimado: number
  valor_total: number
}

interface Licitacao {
  id: string
  numero_processo: string
  numero_edital: string
  objeto: string
  objeto_detalhado: string
  modalidade: string
  tipo_contratacao: string
  criterio_julgamento: string
  modo_disputa: string
  fase: string
  valor_total_estimado: number | string
  data_publicacao_edital: string
  data_abertura_sessao: string
  data_limite_impugnacao: string
  data_inicio_acolhimento: string
  data_fim_acolhimento: string
  pregoeiro_nome: string
  exclusivo_mpe: boolean
  tratamento_diferenciado_mpe: boolean
  srp: boolean
  orgao: {
    id: string
    nome: string
    cnpj: string
    cidade: string
    uf: string
    logradouro: string
    numero: string
    bairro: string
    cep: string
    telefone: string
    email: string
  }
  itens: Item[]
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function DetalheLicitacaoPublicaPage() {
  const params = useParams()
  const id = params.id as string

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      carregarDados()
    }
  }, [id])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const [licRes, docsRes] = await Promise.all([
        fetch(`${API_URL}/api/licitacoes/${id}`),
        fetch(`${API_URL}/api/documentos/licitacao/${id}?publicos=true`)
      ])

      if (licRes.ok) {
        setLicitacao(await licRes.json())
      }
      if (docsRes.ok) {
        setDocumentos(await docsRes.json())
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
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatarTamanho = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getModalidadeLabel = (modalidade: string) => {
    const labels: Record<string, string> = {
      'PREGAO_ELETRONICO': 'Pregão Eletrônico',
      'CONCORRENCIA': 'Concorrência',
      'DISPENSA_ELETRONICA': 'Dispensa Eletrônica',
      'INEXIGIBILIDADE': 'Inexigibilidade',
      'CONCURSO': 'Concurso',
      'LEILAO': 'Leilão',
      'DIALOGO_COMPETITIVO': 'Diálogo Competitivo'
    }
    return labels[modalidade] || modalidade
  }

  const getTipoDocumentoLabel = (tipo: string) => {
    const labels: Record<string, string> = {
      'EDITAL': 'Edital',
      'TERMO_REFERENCIA': 'Termo de Referência',
      'ETP': 'Estudo Técnico Preliminar',
      'ANEXO': 'Anexo',
      'MINUTA_CONTRATO': 'Minuta do Contrato',
      'ESCLARECIMENTO': 'Esclarecimento',
      'EDITAL_RETIFICADO': 'Edital Retificado'
    }
    return labels[tipo] || tipo
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando licitação...</p>
        </div>
      </div>
    )
  }

  if (!licitacao) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="text-center py-12">
            <AlertCircle className="w-12 h-12 mx-auto text-red-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Licitação não encontrada</h2>
            <p className="text-gray-600 mb-4">A licitação solicitada não existe ou não está disponível.</p>
            <Button asChild>
              <Link href="/licitacoes">Voltar para Licitações</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" asChild className="mb-4">
            <Link href="/licitacoes">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar para Licitações
            </Link>
          </Button>
          
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">{getModalidadeLabel(licitacao.modalidade)}</Badge>
                <Badge>{licitacao.fase}</Badge>
                {licitacao.srp && <Badge variant="secondary">SRP</Badge>}
              </div>
              <h1 className="text-2xl font-bold text-gray-900">
                {licitacao.numero_processo}
              </h1>
              {licitacao.numero_edital && (
                <p className="text-gray-600">Edital nº {licitacao.numero_edital}</p>
              )}
            </div>
            
            <div className="flex gap-2">
              <Button variant="outline" asChild>
                <Link href={`/fornecedor/licitacoes/${id}/proposta`}>
                  Enviar Proposta
                </Link>
              </Button>
              <Button>
                <Download className="w-4 h-4 mr-2" />
                Baixar Edital
              </Button>
            </div>
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
                <CardTitle>Objeto da Licitação</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700 whitespace-pre-wrap">
                  {licitacao.objeto_detalhado || licitacao.objeto}
                </p>
              </CardContent>
            </Card>

            {/* Tabs */}
            <Tabs defaultValue="documentos">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="documentos">
                  <FileText className="w-4 h-4 mr-2" />
                  Documentos
                </TabsTrigger>
                <TabsTrigger value="itens">
                  <Package className="w-4 h-4 mr-2" />
                  Itens ({licitacao.itens?.length || 0})
                </TabsTrigger>
                <TabsTrigger value="cronograma">
                  <Calendar className="w-4 h-4 mr-2" />
                  Cronograma
                </TabsTrigger>
              </TabsList>

              {/* Documentos */}
              <TabsContent value="documentos">
                <Card>
                  <CardHeader>
                    <CardTitle>Documentos da Licitação</CardTitle>
                    <CardDescription>
                      Edital, anexos e demais documentos disponíveis para download
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {documentos.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">
                        Nenhum documento disponível no momento.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {documentos.map((doc) => (
                          <div 
                            key={doc.id}
                            className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="w-8 h-8 text-red-500" />
                              <div>
                                <p className="font-medium">{doc.titulo}</p>
                                <p className="text-sm text-gray-500">
                                  {getTipoDocumentoLabel(doc.tipo)} • {formatarTamanho(doc.tamanho_bytes)}
                                </p>
                              </div>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                              <a href={`${API_URL}/api/documentos/publicos/${doc.id}/download`} target="_blank">
                                <Download className="w-4 h-4 mr-2" />
                                Baixar
                              </a>
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Itens */}
              <TabsContent value="itens">
                <Card>
                  <CardHeader>
                    <CardTitle>Itens da Licitação</CardTitle>
                    <CardDescription>
                      Lista de itens/lotes que compõem esta licitação
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!licitacao.itens || licitacao.itens.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">
                        Nenhum item cadastrado.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-3 px-2">Item</th>
                              <th className="text-left py-3 px-2">Descrição</th>
                              <th className="text-center py-3 px-2">Unid.</th>
                              <th className="text-right py-3 px-2">Qtd.</th>
                              <th className="text-right py-3 px-2">Valor Unit.</th>
                              <th className="text-right py-3 px-2">Valor Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {licitacao.itens.map((item) => (
                              <tr key={item.id} className="border-b hover:bg-gray-50">
                                <td className="py-3 px-2 font-medium">{item.numero}</td>
                                <td className="py-3 px-2">{item.descricao}</td>
                                <td className="py-3 px-2 text-center">{item.unidade_medida}</td>
                                <td className="py-3 px-2 text-right">{item.quantidade}</td>
                                <td className="py-3 px-2 text-right">{formatarMoeda(item.valor_unitario_estimado)}</td>
                                <td className="py-3 px-2 text-right font-medium">{formatarMoeda(item.valor_total)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50">
                              <td colSpan={5} className="py-3 px-2 text-right font-semibold">Total Estimado:</td>
                              <td className="py-3 px-2 text-right font-bold text-lg">
                                {formatarMoeda(licitacao.valor_total_estimado)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Cronograma */}
              <TabsContent value="cronograma">
                <Card>
                  <CardHeader>
                    <CardTitle>Cronograma</CardTitle>
                    <CardDescription>
                      Datas importantes desta licitação
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center gap-4 p-4 border rounded-lg">
                        <Calendar className="w-8 h-8 text-blue-500" />
                        <div>
                          <p className="font-medium">Publicação do Edital</p>
                          <p className="text-gray-600">{formatarData(licitacao.data_publicacao_edital)}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 p-4 border rounded-lg">
                        <AlertCircle className="w-8 h-8 text-yellow-500" />
                        <div>
                          <p className="font-medium">Limite para Impugnações</p>
                          <p className="text-gray-600">{formatarData(licitacao.data_limite_impugnacao)}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 p-4 border rounded-lg">
                        <Clock className="w-8 h-8 text-green-500" />
                        <div>
                          <p className="font-medium">Início do Acolhimento de Propostas</p>
                          <p className="text-gray-600">{formatarData(licitacao.data_inicio_acolhimento)}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 p-4 border rounded-lg">
                        <Clock className="w-8 h-8 text-red-500" />
                        <div>
                          <p className="font-medium">Fim do Acolhimento de Propostas</p>
                          <p className="text-gray-600">{formatarData(licitacao.data_fim_acolhimento)}</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4 p-4 border rounded-lg bg-blue-50">
                        <CheckCircle className="w-8 h-8 text-blue-600" />
                        <div>
                          <p className="font-medium">Abertura da Sessão Pública</p>
                          <p className="text-blue-600 font-semibold">{formatarData(licitacao.data_abertura_sessao)}</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Informações */}
            <Card>
              <CardHeader>
                <CardTitle>Informações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Valor Estimado</p>
                  <p className="text-xl font-bold text-green-600">
                    {formatarMoeda(licitacao.valor_total_estimado)}
                  </p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Critério de Julgamento</p>
                  <p className="font-medium">{licitacao.criterio_julgamento?.replace(/_/g, ' ')}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Modo de Disputa</p>
                  <p className="font-medium">{licitacao.modo_disputa?.replace(/_/g, ' ')}</p>
                </div>
                
                <div>
                  <p className="text-sm text-gray-500">Tipo de Contratação</p>
                  <p className="font-medium">{licitacao.tipo_contratacao?.replace(/_/g, ' ')}</p>
                </div>

                {licitacao.pregoeiro_nome && (
                  <div>
                    <p className="text-sm text-gray-500">Pregoeiro(a)</p>
                    <p className="font-medium">{licitacao.pregoeiro_nome}</p>
                  </div>
                )}

                <div className="pt-4 border-t space-y-2">
                  {licitacao.exclusivo_mpe && (
                    <Badge variant="secondary" className="w-full justify-center">
                      Exclusivo ME/EPP
                    </Badge>
                  )}
                  {licitacao.tratamento_diferenciado_mpe && (
                    <Badge variant="outline" className="w-full justify-center">
                      Tratamento Diferenciado ME/EPP
                    </Badge>
                  )}
                  {licitacao.srp && (
                    <Badge className="w-full justify-center">
                      Sistema de Registro de Preços
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Órgão */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="w-5 h-5" />
                  Órgão Responsável
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="font-semibold">{licitacao.orgao?.nome}</p>
                  <p className="text-sm text-gray-500">CNPJ: {licitacao.orgao?.cnpj}</p>
                </div>
                
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="w-4 h-4 mt-0.5 text-gray-400" />
                  <span>
                    {licitacao.orgao?.logradouro}, {licitacao.orgao?.numero}<br />
                    {licitacao.orgao?.bairro} - {licitacao.orgao?.cidade}/{licitacao.orgao?.uf}<br />
                    CEP: {licitacao.orgao?.cep}
                  </span>
                </div>
                
                {licitacao.orgao?.telefone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-gray-400" />
                    <span>{licitacao.orgao.telefone}</span>
                  </div>
                )}
                
                {licitacao.orgao?.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <a href={`mailto:${licitacao.orgao.email}`} className="text-blue-600 hover:underline">
                      {licitacao.orgao.email}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Ações */}
            <Card>
              <CardHeader>
                <CardTitle>Ações</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" asChild>
                  <Link href={`/fornecedor/licitacoes/${id}/proposta`}>
                    Enviar Proposta
                  </Link>
                </Button>
                <Button variant="outline" className="w-full" asChild>
                  <Link href={`/fornecedor/licitacoes/${id}/impugnar`}>
                    Impugnar Edital
                  </Link>
                </Button>
                <Button variant="outline" className="w-full">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Solicitar Esclarecimento
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  )
}
