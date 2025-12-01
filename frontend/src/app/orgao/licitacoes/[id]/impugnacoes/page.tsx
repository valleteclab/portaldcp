"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft, 
  AlertCircle, 
  Clock, 
  CheckCircle, 
  XCircle, 
  MessageSquare,
  Send,
  Loader2,
  FileText,
  User,
  Calendar,
  ChevronDown,
  ChevronUp
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Impugnacao {
  id: string
  licitacao_id: string
  fornecedor_id?: string
  fornecedor?: {
    razao_social: string
    cpf_cnpj: string
  }
  nome_impugnante?: string
  cpf_cnpj_impugnante?: string
  email_impugnante?: string
  is_cidadao: boolean
  texto_impugnacao: string
  item_edital_impugnado?: string
  fundamentacao_legal?: string
  status: 'PENDENTE' | 'EM_ANALISE' | 'DEFERIDA' | 'INDEFERIDA' | 'PARCIALMENTE_DEFERIDA'
  resposta?: string
  respondido_por?: string
  data_resposta?: string
  altera_edital: boolean
  alteracoes_edital?: string
  created_at: string
}

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  fase: string
}

const STATUS_CONFIG = {
  PENDENTE: { label: 'Pendente', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
  EM_ANALISE: { label: 'Em Análise', color: 'bg-blue-100 text-blue-800', icon: MessageSquare },
  DEFERIDA: { label: 'Deferida', color: 'bg-green-100 text-green-800', icon: CheckCircle },
  INDEFERIDA: { label: 'Indeferida', color: 'bg-red-100 text-red-800', icon: XCircle },
  PARCIALMENTE_DEFERIDA: { label: 'Parcialmente Deferida', color: 'bg-orange-100 text-orange-800', icon: AlertCircle }
}

export default function ImpugnacoesPage() {
  const params = useParams()
  const router = useRouter()
  const licitacaoId = params.id as string

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [impugnacoes, setImpugnacoes] = useState<Impugnacao[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [respondendo, setRespondendo] = useState<string | null>(null)
  const [resposta, setResposta] = useState('')
  const [statusResposta, setStatusResposta] = useState<string>('INDEFERIDA')
  const [alteraEdital, setAlteraEdital] = useState(false)
  const [alteracoesEdital, setAlteracoesEdital] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    carregarDados()
  }, [licitacaoId])

  const carregarDados = async () => {
    try {
      const [licRes, impRes] = await Promise.all([
        fetch(`${API_URL}/api/licitacoes/${licitacaoId}`),
        fetch(`${API_URL}/api/impugnacoes/licitacao/${licitacaoId}`)
      ])

      if (licRes.ok) {
        setLicitacao(await licRes.json())
      }
      if (impRes.ok) {
        setImpugnacoes(await impRes.json())
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const marcarEmAnalise = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/impugnacoes/${id}/em-analise`, {
        method: 'PUT'
      })
      if (res.ok) {
        carregarDados()
      }
    } catch (error) {
      console.error('Erro:', error)
    }
  }

  const enviarResposta = async (id: string) => {
    if (!resposta.trim()) {
      alert('Digite a resposta')
      return
    }

    setEnviando(true)
    try {
      const orgao = JSON.parse(localStorage.getItem('orgao') || '{}')
      
      const res = await fetch(`${API_URL}/api/impugnacoes/${id}/responder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resposta,
          status: statusResposta,
          respondido_por: orgao.nome || 'Pregoeiro',
          altera_edital: alteraEdital,
          alteracoes_edital: alteraEdital ? alteracoesEdital : null
        })
      })

      if (res.ok) {
        setRespondendo(null)
        setResposta('')
        setStatusResposta('INDEFERIDA')
        setAlteraEdital(false)
        setAlteracoesEdital('')
        carregarDados()
        alert('Resposta enviada com sucesso!')
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao enviar resposta')
    } finally {
      setEnviando(false)
    }
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

  const getNomeImpugnante = (imp: Impugnacao) => {
    if (imp.fornecedor) {
      return imp.fornecedor.razao_social
    }
    return imp.nome_impugnante || 'Cidadão'
  }

  const getCpfCnpjImpugnante = (imp: Impugnacao) => {
    if (imp.fornecedor) {
      return imp.fornecedor.cpf_cnpj
    }
    return imp.cpf_cnpj_impugnante || '-'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  const pendentes = impugnacoes.filter(i => i.status === 'PENDENTE').length
  const emAnalise = impugnacoes.filter(i => i.status === 'EM_ANALISE').length

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
          <h1 className="text-2xl font-bold text-slate-800">Impugnações</h1>
          <p className="text-muted-foreground">
            {licitacao?.numero_processo} - {licitacao?.objeto?.substring(0, 60)}...
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{impugnacoes.length}</div>
            <p className="text-sm text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className={pendentes > 0 ? 'border-yellow-300 bg-yellow-50' : ''}>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-yellow-600">{pendentes}</div>
            <p className="text-sm text-muted-foreground">Pendentes</p>
          </CardContent>
        </Card>
        <Card className={emAnalise > 0 ? 'border-blue-300 bg-blue-50' : ''}>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-blue-600">{emAnalise}</div>
            <p className="text-sm text-muted-foreground">Em Análise</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">
              {impugnacoes.filter(i => ['DEFERIDA', 'INDEFERIDA', 'PARCIALMENTE_DEFERIDA'].includes(i.status)).length}
            </div>
            <p className="text-sm text-muted-foreground">Respondidas</p>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Impugnações */}
      {impugnacoes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-slate-300" />
            <p className="text-muted-foreground">Nenhuma impugnação recebida</p>
            <p className="text-sm text-muted-foreground mt-1">
              As impugnações aparecerão aqui quando forem enviadas pelos interessados
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {impugnacoes.map((imp) => {
            const config = STATUS_CONFIG[imp.status]
            const Icon = config.icon
            const isExpanded = expandedId === imp.id

            return (
              <Card key={imp.id} className={imp.status === 'PENDENTE' ? 'border-yellow-300' : ''}>
                <CardHeader 
                  className="cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : imp.id)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className={config.color}>
                          <Icon className="h-3 w-3 mr-1" />
                          {config.label}
                        </Badge>
                        {imp.is_cidadao && (
                          <Badge variant="outline">Cidadão</Badge>
                        )}
                      </div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <User className="h-4 w-4" />
                        {getNomeImpugnante(imp)}
                      </CardTitle>
                      <CardDescription className="flex items-center gap-4 mt-1">
                        <span>{getCpfCnpjImpugnante(imp)}</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatarData(imp.created_at)}
                        </span>
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      {imp.status === 'PENDENTE' && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            marcarEmAnalise(imp.id)
                          }}
                        >
                          Iniciar Análise
                        </Button>
                      )}
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                </CardHeader>

                {isExpanded && (
                  <CardContent className="border-t pt-4 space-y-4">
                    {/* Texto da Impugnação */}
                    <div>
                      <Label className="text-sm text-muted-foreground">Texto da Impugnação</Label>
                      <div className="mt-1 p-4 bg-slate-50 rounded-lg whitespace-pre-wrap">
                        {imp.texto_impugnacao}
                      </div>
                    </div>

                    {imp.item_edital_impugnado && (
                      <div>
                        <Label className="text-sm text-muted-foreground">Item do Edital Impugnado</Label>
                        <p className="mt-1">{imp.item_edital_impugnado}</p>
                      </div>
                    )}

                    {imp.fundamentacao_legal && (
                      <div>
                        <Label className="text-sm text-muted-foreground">Fundamentação Legal</Label>
                        <p className="mt-1">{imp.fundamentacao_legal}</p>
                      </div>
                    )}

                    {/* Resposta existente */}
                    {imp.resposta && (
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <MessageSquare className="h-4 w-4 text-blue-600" />
                          <span className="font-medium text-blue-800">Resposta do Órgão</span>
                          <span className="text-sm text-blue-600">
                            por {imp.respondido_por} em {imp.data_resposta && formatarData(imp.data_resposta)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap">{imp.resposta}</p>
                        
                        {imp.altera_edital && imp.alteracoes_edital && (
                          <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded">
                            <p className="text-sm font-medium text-orange-800">Alterações no Edital:</p>
                            <p className="text-sm text-orange-700 mt-1">{imp.alteracoes_edital}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Formulário de Resposta */}
                    {(imp.status === 'PENDENTE' || imp.status === 'EM_ANALISE') && (
                      <div className="border-t pt-4">
                        {respondendo === imp.id ? (
                          <div className="space-y-4">
                            <div>
                              <Label>Resposta *</Label>
                              <Textarea
                                value={resposta}
                                onChange={(e) => setResposta(e.target.value)}
                                placeholder="Digite a resposta à impugnação..."
                                rows={4}
                                className="mt-1"
                              />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <Label>Decisão *</Label>
                                <Select value={statusResposta} onValueChange={setStatusResposta}>
                                  <SelectTrigger className="mt-1">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="DEFERIDA">Deferida</SelectItem>
                                    <SelectItem value="INDEFERIDA">Indeferida</SelectItem>
                                    <SelectItem value="PARCIALMENTE_DEFERIDA">Parcialmente Deferida</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              <div className="flex items-center gap-2 pt-6">
                                <input
                                  type="checkbox"
                                  id="alteraEdital"
                                  checked={alteraEdital}
                                  onChange={(e) => setAlteraEdital(e.target.checked)}
                                  className="rounded"
                                />
                                <Label htmlFor="alteraEdital">Altera o Edital</Label>
                              </div>
                            </div>

                            {alteraEdital && (
                              <div>
                                <Label>Descrição das Alterações no Edital</Label>
                                <Textarea
                                  value={alteracoesEdital}
                                  onChange={(e) => setAlteracoesEdital(e.target.value)}
                                  placeholder="Descreva as alterações que serão feitas no edital..."
                                  rows={3}
                                  className="mt-1"
                                />
                              </div>
                            )}

                            <div className="flex gap-2">
                              <Button
                                onClick={() => enviarResposta(imp.id)}
                                disabled={enviando}
                              >
                                {enviando ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Send className="h-4 w-4 mr-2" />
                                )}
                                Enviar Resposta
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setRespondendo(null)
                                  setResposta('')
                                }}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <Button onClick={() => setRespondendo(imp.id)}>
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Responder Impugnação
                          </Button>
                        )}
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
