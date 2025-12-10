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
  Calendar,
  DollarSign,
  Eye,
  ThumbsUp,
  ThumbsDown,
  Play,
  Award,
  Building2,
  ChevronDown,
  ChevronUp,
  Download
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Proposta {
  id: string
  fornecedor_id: string
  fornecedor: {
    id: string
    razao_social: string
    cpf_cnpj: string
    email: string
  }
  valor_total_proposta: number
  status: 'ENVIADA' | 'CLASSIFICADA' | 'DESCLASSIFICADA' | 'VENCEDORA' | 'SEGUNDA_COLOCADA'
  motivo_desclassificacao?: string
  data_envio: string
  itens_proposta?: any[]
}

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  fase: string
  valor_total_estimado: number
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  ENVIADA: { label: 'Enviada', color: 'bg-blue-100 text-blue-800', icon: FileText },
  CLASSIFICADA: { label: 'Classificada', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  DESCLASSIFICADA: { label: 'Desclassificada', color: 'bg-red-100 text-red-800', icon: XCircle },
  VENCEDORA: { label: 'Vencedora', color: 'bg-emerald-100 text-emerald-800', icon: Award },
  SEGUNDA_COLOCADA: { label: '2ª Colocada', color: 'bg-amber-100 text-amber-800', icon: Award }
}

export default function PropostasPage() {
  const params = useParams()
  const router = useRouter()
  const licitacaoId = params.id as string

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [propostas, setPropostas] = useState<Proposta[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [desclassificando, setDesclassificando] = useState<string | null>(null)
  const [motivoDesclassificacao, setMotivoDesclassificacao] = useState('')
  const [processando, setProcessando] = useState(false)

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
        // Ordena por valor (menor primeiro)
        setPropostas(data.sort((a: Proposta, b: Proposta) => a.valor_total_proposta - b.valor_total_proposta))
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const classificarProposta = async (id: string) => {
    setProcessando(true)
    try {
      const res = await fetch(`${API_URL}/api/propostas/${id}/classificar`, {
        method: 'PUT'
      })
      if (res.ok) {
        carregarDados()
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao classificar proposta')
    } finally {
      setProcessando(false)
    }
  }

  const desclassificarProposta = async (id: string) => {
    if (!motivoDesclassificacao.trim()) {
      alert('Informe o motivo da desclassificação')
      return
    }

    setProcessando(true)
    try {
      const res = await fetch(`${API_URL}/api/propostas/${id}/desclassificar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoDesclassificacao })
      })
      if (res.ok) {
        setDesclassificando(null)
        setMotivoDesclassificacao('')
        carregarDados()
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao desclassificar proposta')
    } finally {
      setProcessando(false)
    }
  }

  const iniciarDisputa = async () => {
    const classificadas = propostas.filter(p => p.status === 'CLASSIFICADA')
    if (classificadas.length < 2) {
      alert('É necessário ter pelo menos 2 propostas classificadas para iniciar a disputa')
      return
    }

    if (!confirm('Deseja iniciar a sessão de disputa? Esta ação não pode ser desfeita.')) {
      return
    }

    setProcessando(true)
    try {
      const res = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}/avancar-fase`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ observacao: 'Iniciando fase de disputa' })
      })
      if (res.ok) {
        router.push(`/orgao/licitacoes/${licitacaoId}/sala`)
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao iniciar disputa')
    } finally {
      setProcessando(false)
    }
  }

  const formatarMoeda = (valor: number | string) => {
    const numero = typeof valor === 'string' ? parseFloat(valor) : valor
    return (numero || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  const formatarData = (data: string) => {
    return new Date(data).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const calcularEconomia = (valorProposta: number) => {
    if (!licitacao?.valor_total_estimado) return 0
    const estimado = typeof licitacao.valor_total_estimado === 'string' 
      ? parseFloat(licitacao.valor_total_estimado) 
      : licitacao.valor_total_estimado
    return ((estimado - valorProposta) / estimado) * 100
  }

  // Verifica se pode revelar identidade do fornecedor
  // Só revela após a fase de disputa (julgamento, habilitação, etc)
  const podeRevelarFornecedor = () => {
    if (!licitacao) return false
    const fasesReveladas = ['JULGAMENTO', 'HABILITACAO', 'RECURSO', 'ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO']
    return fasesReveladas.includes(licitacao.fase)
  }

  // Anonimiza o nome do fornecedor
  const anonimizarNome = (index: number) => {
    return `Fornecedor ${String.fromCharCode(65 + index)}` // A, B, C, D...
  }

  // Anonimiza o CNPJ
  const anonimizarCnpj = () => {
    return '**.***.***/****-**'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const classificadas = propostas.filter(p => p.status === 'CLASSIFICADA')
  const desclassificadas = propostas.filter(p => p.status === 'DESCLASSIFICADA')
  const pendentes = propostas.filter(p => p.status === 'ENVIADA')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href={`/orgao/licitacoes/${licitacaoId}`}>
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Análise de Propostas</h1>
            <p className="text-muted-foreground">
              {licitacao?.numero_processo} - {licitacao?.objeto?.substring(0, 50)}...
            </p>
          </div>
        </div>

        {classificadas.length >= 2 && licitacao?.fase === 'ANALISE_PROPOSTAS' && (
          <Button onClick={iniciarDisputa} disabled={processando} className="bg-green-600 hover:bg-green-700">
            <Play className="h-4 w-4 mr-2" />
            Iniciar Sessão de Disputa
          </Button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{propostas.length}</div>
            <p className="text-sm text-muted-foreground">Total de Propostas</p>
          </CardContent>
        </Card>
        <Card className={pendentes.length > 0 ? 'border-blue-300 bg-blue-50' : ''}>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{pendentes.length}</div>
            <p className="text-sm text-muted-foreground">Aguardando Análise</p>
          </CardContent>
        </Card>
        <Card className={classificadas.length > 0 ? 'border-green-300 bg-green-50' : ''}>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{classificadas.length}</div>
            <p className="text-sm text-muted-foreground">Classificadas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-red-600">{desclassificadas.length}</div>
            <p className="text-sm text-muted-foreground">Desclassificadas</p>
          </CardContent>
        </Card>
      </div>

      {/* Valor Estimado */}
      <Card className="bg-slate-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Valor Total Estimado</p>
              <p className="text-xl font-bold">{formatarMoeda(licitacao?.valor_total_estimado || 0)}</p>
            </div>
            {propostas.length > 0 && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Menor Proposta</p>
                <p className="text-xl font-bold text-green-600">
                  {formatarMoeda(propostas[0]?.valor_total_proposta || 0)}
                </p>
                <p className="text-sm text-green-600">
                  Economia de {calcularEconomia(propostas[0]?.valor_total_proposta || 0).toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Propostas */}
      {propostas.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="text-muted-foreground">Nenhuma proposta recebida</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {propostas.map((proposta, index) => {
            const config = STATUS_CONFIG[proposta.status] || STATUS_CONFIG.ENVIADA
            const Icon = config.icon
            const isExpanded = expandedId === proposta.id

            return (
              <Card 
                key={proposta.id} 
                className={`${proposta.status === 'ENVIADA' ? 'border-blue-300' : ''} ${index === 0 ? 'ring-2 ring-green-200' : ''}`}
              >
                <CardHeader 
                  className="cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : proposta.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg font-bold text-slate-400">#{index + 1}</span>
                        <Badge className={config.color}>
                          <Icon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                        {index === 0 && proposta.status !== 'DESCLASSIFICADA' && (
                          <Badge className="bg-green-600 text-white">Menor Preço</Badge>
                        )}
                      </div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Building2 className="h-4 w-4" />
                        {podeRevelarFornecedor() 
                          ? proposta.fornecedor?.razao_social 
                          : anonimizarNome(index)}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-1">
                        <span>
                          {podeRevelarFornecedor() 
                            ? proposta.fornecedor?.cpf_cnpj 
                            : anonimizarCnpj()}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatarData(proposta.data_envio)}
                        </span>
                        {!podeRevelarFornecedor() && (
                          <Badge variant="outline" className="text-xs">
                            <Eye className="h-3 w-3 mr-1" />
                            Identificação sigilosa
                          </Badge>
                        )}
                      </CardDescription>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold text-green-600">
                        {formatarMoeda(proposta.valor_total_proposta)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {calcularEconomia(proposta.valor_total_proposta).toFixed(1)}% de economia
                      </p>
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground inline mt-2" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground inline mt-2" />
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="border-t pt-4 space-y-4">
                    {/* Motivo de desclassificação */}
                    {proposta.motivo_desclassificacao && (
                      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                        <p className="text-sm font-medium text-red-800">Motivo da Desclassificação:</p>
                        <p className="text-sm text-red-700 mt-1">{proposta.motivo_desclassificacao}</p>
                      </div>
                    )}

                    {/* Ações */}
                    {proposta.status === 'ENVIADA' && (
                      <div className="flex gap-2">
                        <Button 
                          onClick={() => classificarProposta(proposta.id)}
                          disabled={processando}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <ThumbsUp className="h-4 w-4 mr-2" />
                          Classificar
                        </Button>
                        
                        {desclassificando === proposta.id ? (
                          <div className="flex-1 space-y-2">
                            <Textarea
                              value={motivoDesclassificacao}
                              onChange={(e) => setMotivoDesclassificacao(e.target.value)}
                              placeholder="Informe o motivo da desclassificação..."
                              rows={2}
                            />
                            <div className="flex gap-2">
                              <Button 
                                variant="destructive"
                                onClick={() => desclassificarProposta(proposta.id)}
                                disabled={processando}
                              >
                                Confirmar Desclassificação
                              </Button>
                              <Button 
                                variant="outline"
                                onClick={() => {
                                  setDesclassificando(null)
                                  setMotivoDesclassificacao('')
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button 
                            variant="outline"
                            className="text-red-600 border-red-300"
                            onClick={() => setDesclassificando(proposta.id)}
                          >
                            <ThumbsDown className="h-4 w-4 mr-2" />
                            Desclassificar
                          </Button>
                        )}
                      </div>
                    )}

                    {/* Dados do Fornecedor */}
                    {podeRevelarFornecedor() ? (
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <Label className="text-muted-foreground">Email</Label>
                          <p>{proposta.fornecedor?.email}</p>
                        </div>
                        <div>
                          <Label className="text-muted-foreground">CNPJ/CPF</Label>
                          <p>{proposta.fornecedor?.cpf_cnpj}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                        <p className="text-sm text-amber-800 flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          <strong>Identificação sigilosa:</strong> Os dados do fornecedor serão revelados após a fase de disputa.
                        </p>
                      </div>
                    )}

                    {/* Itens da Proposta */}
                    {proposta.itens_proposta && proposta.itens_proposta.length > 0 && (
                      <div>
                        <Label className="text-muted-foreground">Itens da Proposta ({proposta.itens_proposta.length} itens)</Label>
                        <div className="mt-2 border rounded-lg overflow-hidden">
                          <table className="w-full text-sm">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="text-left p-2 w-12">#</th>
                                <th className="text-left p-2">Descrição</th>
                                <th className="text-left p-2">Marca/Modelo</th>
                                <th className="text-center p-2">Qtd</th>
                                <th className="text-right p-2">Valor Unit.</th>
                                <th className="text-right p-2">Total</th>
                              </tr>
                            </thead>
                            <tbody>
                              {proposta.itens_proposta.map((item: any, i: number) => (
                                <tr key={i} className="border-t align-top">
                                  <td className="p-2 text-slate-500">{i + 1}</td>
                                  <td className="p-2 max-w-md">
                                    <p className="whitespace-pre-wrap break-words">{item.descricao}</p>
                                  </td>
                                  <td className="p-2">
                                    {item.marca ? (
                                      <Badge variant="outline">{item.marca}</Badge>
                                    ) : (
                                      <span className="text-muted-foreground">-</span>
                                    )}
                                  </td>
                                  <td className="text-center p-2">{item.quantidade} {item.unidade}</td>
                                  <td className="text-right p-2">{formatarMoeda(item.valor_unitario)}</td>
                                  <td className="text-right p-2 font-medium">{formatarMoeda(item.quantidade * item.valor_unitario)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="bg-slate-100 font-medium">
                              <tr>
                                <td colSpan={5} className="p-2 text-right">Total da Proposta:</td>
                                <td className="p-2 text-right text-green-600">{formatarMoeda(proposta.valor_total_proposta)}</td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
