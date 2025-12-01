"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft, 
  CheckCircle, 
  XCircle, 
  AlertCircle,
  Loader2,
  FileText,
  User,
  Download,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Award,
  Building2,
  Clock,
  FileCheck,
  Upload
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Fornecedor {
  id: string
  razao_social: string
  cpf_cnpj: string
  email: string
}

interface DocumentoHabilitacao {
  tipo: string
  nome: string
  status: 'PENDENTE' | 'VALIDO' | 'INVALIDO' | 'VENCIDO'
  dataValidade?: string
  observacao?: string
}

interface Proposta {
  id: string
  fornecedor_id: string
  fornecedor: Fornecedor
  valor_total_proposta: number
  status: string
  posicao: number
}

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  fase: string
}

const DOCUMENTOS_OBRIGATORIOS = [
  { tipo: 'CONTRATO_SOCIAL', nome: 'Contrato Social ou Estatuto' },
  { tipo: 'CERTIDAO_NEGATIVA_FEDERAL', nome: 'Certidão Negativa de Débitos Federais' },
  { tipo: 'CERTIDAO_FGTS', nome: 'Certidão de Regularidade do FGTS' },
  { tipo: 'CERTIDAO_TRABALHISTA', nome: 'Certidão Negativa de Débitos Trabalhistas' },
  { tipo: 'CERTIDAO_ESTADUAL', nome: 'Certidão Negativa de Débitos Estaduais' },
  { tipo: 'CERTIDAO_MUNICIPAL', nome: 'Certidão Negativa de Débitos Municipais' },
]

export default function HabilitacaoPage() {
  const params = useParams()
  const router = useRouter()
  const licitacaoId = params.id as string

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [loading, setLoading] = useState(true)
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<string | null>(null)
  const [documentos, setDocumentos] = useState<DocumentoHabilitacao[]>([])
  const [processando, setProcessando] = useState(false)
  const [motivoInabilitacao, setMotivoInabilitacao] = useState('')

  useEffect(() => {
    carregarDados()
  }, [licitacaoId])

  const carregarDados = async () => {
    try {
      const [licRes, propRes] = await Promise.all([
        fetch(`${API_URL}/api/licitacoes/${licitacaoId}`),
        fetch(`${API_URL}/api/propostas/licitacao/${licitacaoId}`)
      ])

      if (licRes.ok) {
        setLicitacao(await licRes.json())
      }
      if (propRes.ok) {
        const data = await propRes.json()
        // Ordena por valor e filtra apenas classificadas/vencedoras
        const classificadas = data
          .filter((p: Proposta) => ['CLASSIFICADA', 'VENCEDORA', 'SEGUNDA_COLOCADA'].includes(p.status))
          .sort((a: Proposta, b: Proposta) => a.valor_total_proposta - b.valor_total_proposta)
          .map((p: Proposta, i: number) => ({ ...p, posicao: i + 1 }))
        setPropostas(classificadas)
        
        // Seleciona o primeiro (vencedor provisório)
        if (classificadas.length > 0) {
          setFornecedorSelecionado(classificadas[0].fornecedor_id)
          carregarDocumentos(classificadas[0].fornecedor_id)
        }
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const carregarDocumentos = async (fornecedorId: string) => {
    // Simula documentos do fornecedor
    // Em produção, buscaria do backend
    const docs: DocumentoHabilitacao[] = DOCUMENTOS_OBRIGATORIOS.map(doc => ({
      ...doc,
      status: Math.random() > 0.2 ? 'VALIDO' : (Math.random() > 0.5 ? 'PENDENTE' : 'VENCIDO'),
      dataValidade: new Date(Date.now() + Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
    }))
    setDocumentos(docs)
  }

  const selecionarFornecedor = (fornecedorId: string) => {
    setFornecedorSelecionado(fornecedorId)
    carregarDocumentos(fornecedorId)
  }

  const validarDocumento = (tipo: string, valido: boolean) => {
    setDocumentos(prev => prev.map(doc => 
      doc.tipo === tipo ? { ...doc, status: valido ? 'VALIDO' : 'INVALIDO' } : doc
    ))
  }

  const habilitarFornecedor = async () => {
    const todosValidos = documentos.every(d => d.status === 'VALIDO')
    if (!todosValidos) {
      alert('Todos os documentos devem estar válidos para habilitar o fornecedor')
      return
    }

    setProcessando(true)
    try {
      // Em produção, chamaria o backend
      alert('Fornecedor habilitado com sucesso!')
      router.push(`/orgao/licitacoes/${licitacaoId}`)
    } catch (error) {
      alert('Erro ao habilitar fornecedor')
    } finally {
      setProcessando(false)
    }
  }

  const inabilitarFornecedor = async () => {
    if (!motivoInabilitacao.trim()) {
      alert('Informe o motivo da inabilitação')
      return
    }

    setProcessando(true)
    try {
      // Em produção, chamaria o backend e passaria para o próximo classificado
      alert('Fornecedor inabilitado. Convocando próximo classificado...')
      
      // Passa para o próximo
      const propostaAtual = propostas.find(p => p.fornecedor_id === fornecedorSelecionado)
      if (propostaAtual && propostaAtual.posicao < propostas.length) {
        const proxima = propostas.find(p => p.posicao === propostaAtual.posicao + 1)
        if (proxima) {
          selecionarFornecedor(proxima.fornecedor_id)
        }
      }
      setMotivoInabilitacao('')
    } catch (error) {
      alert('Erro ao inabilitar fornecedor')
    } finally {
      setProcessando(false)
    }
  }

  const formatarMoeda = (valor: number | string) => {
    const numero = typeof valor === 'string' ? parseFloat(valor) : valor
    return (numero || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; color: string; icon: any }> = {
      VALIDO: { label: 'Válido', color: 'bg-green-100 text-green-800', icon: CheckCircle },
      INVALIDO: { label: 'Inválido', color: 'bg-red-100 text-red-800', icon: XCircle },
      PENDENTE: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      VENCIDO: { label: 'Vencido', color: 'bg-orange-100 text-orange-800', icon: AlertCircle }
    }
    const c = config[status] || config.PENDENTE
    const Icon = c.icon
    return (
      <Badge className={c.color}>
        <Icon className="h-3 w-3 mr-1" />
        {c.label}
      </Badge>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const fornecedorAtual = propostas.find(p => p.fornecedor_id === fornecedorSelecionado)
  const documentosValidos = documentos.filter(d => d.status === 'VALIDO').length
  const totalDocumentos = documentos.length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/orgao/licitacoes/${licitacaoId}`}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Habilitação</h1>
          <p className="text-muted-foreground">
            {licitacao?.numero_processo} - Verificação de documentos
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Lista de Classificados */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ordem de Classificação</CardTitle>
            <CardDescription>Selecione para verificar documentos</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {propostas.map((proposta) => (
              <div
                key={proposta.id}
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  fornecedorSelecionado === proposta.fornecedor_id
                    ? 'border-blue-500 bg-blue-50'
                    : 'hover:bg-slate-50'
                }`}
                onClick={() => selecionarFornecedor(proposta.fornecedor_id)}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg font-bold text-slate-400">#{proposta.posicao}</span>
                  {proposta.posicao === 1 && (
                    <Badge className="bg-green-100 text-green-800">
                      <Award className="h-3 w-3 mr-1" />
                      Menor Preço
                    </Badge>
                  )}
                </div>
                <p className="font-medium text-sm">{proposta.fornecedor?.razao_social}</p>
                <p className="text-sm text-green-600 font-medium">
                  {formatarMoeda(proposta.valor_total_proposta)}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Verificação de Documentos */}
        <div className="col-span-2 space-y-4">
          {fornecedorAtual && (
            <>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center gap-2">
                        <Building2 className="h-5 w-5" />
                        {fornecedorAtual.fornecedor?.razao_social}
                      </CardTitle>
                      <CardDescription>
                        CNPJ: {fornecedorAtual.fornecedor?.cpf_cnpj}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted-foreground">Proposta</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatarMoeda(fornecedorAtual.valor_total_proposta)}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Documentos Verificados</span>
                        <span>{documentosValidos}/{totalDocumentos}</span>
                      </div>
                      <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${(documentosValidos / totalDocumentos) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileCheck className="h-5 w-5" />
                    Documentos de Habilitação
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {documentos.map((doc) => (
                    <div 
                      key={doc.tipo}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-slate-400" />
                        <div>
                          <p className="font-medium text-sm">{doc.nome}</p>
                          {doc.dataValidade && (
                            <p className="text-xs text-muted-foreground">
                              Validade: {formatarData(doc.dataValidade)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(doc.status)}
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0"
                            title="Visualizar"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-green-600"
                            onClick={() => validarDocumento(doc.tipo, true)}
                            title="Validar"
                          >
                            <ThumbsUp className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-red-600"
                            onClick={() => validarDocumento(doc.tipo, false)}
                            title="Invalidar"
                          >
                            <ThumbsDown className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Ações */}
              <Card>
                <CardContent className="pt-6">
                  <div className="flex gap-4">
                    <Button
                      className="flex-1 bg-green-600 hover:bg-green-700"
                      onClick={habilitarFornecedor}
                      disabled={processando || documentosValidos < totalDocumentos}
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Habilitar Fornecedor
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => {
                        const motivo = prompt('Informe o motivo da inabilitação:')
                        if (motivo) {
                          setMotivoInabilitacao(motivo)
                          inabilitarFornecedor()
                        }
                      }}
                      disabled={processando}
                    >
                      <XCircle className="h-4 w-4 mr-2" />
                      Inabilitar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground text-center mt-2">
                    Ao inabilitar, o próximo classificado será convocado automaticamente
                  </p>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
