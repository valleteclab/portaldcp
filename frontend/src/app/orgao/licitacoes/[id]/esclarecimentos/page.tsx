"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft, 
  HelpCircle, 
  Send,
  Loader2,
  FileText,
  CheckCircle,
  Clock,
  Download,
  MessageSquare,
  User,
  Building2,
  Archive
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Esclarecimento {
  id: string
  texto_esclarecimento: string
  item_edital_referencia?: string
  status: string
  resposta?: string
  created_at: string
  data_resposta?: string
  documento_nome?: string
  documento_tamanho?: number
  fornecedor?: {
    razao_social: string
    cnpj: string
  }
  nome_solicitante?: string
  is_cidadao: boolean
}

interface Licitacao {
  id: string
  numero_processo: string
  numero_edital?: string
  objeto: string
}

export default function EsclarecimentosPregoeiro({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const licitacaoId = resolvedParams.id

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [esclarecimentos, setEsclarecimentos] = useState<Esclarecimento[]>([])
  const [loading, setLoading] = useState(true)
  const [respondendo, setRespondendo] = useState(false)

  // Modal de resposta
  const [modalAberto, setModalAberto] = useState(false)
  const [esclarecimentoSelecionado, setEsclarecimentoSelecionado] = useState<Esclarecimento | null>(null)
  const [resposta, setResposta] = useState('')

  useEffect(() => {
    carregarDados()
  }, [licitacaoId])

  const carregarDados = async () => {
    try {
      const [licRes, escRes] = await Promise.all([
        fetch(`${API_URL}/api/licitacoes/${licitacaoId}`),
        fetch(`${API_URL}/api/esclarecimentos/licitacao/${licitacaoId}`)
      ])

      if (licRes.ok) {
        setLicitacao(await licRes.json())
      }
      if (escRes.ok) {
        setEsclarecimentos(await escRes.json())
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const abrirModalResposta = (esc: Esclarecimento) => {
    setEsclarecimentoSelecionado(esc)
    setResposta(esc.resposta || '')
    setModalAberto(true)
  }

  const enviarResposta = async () => {
    if (!esclarecimentoSelecionado || !resposta.trim()) return

    setRespondendo(true)
    try {
      const orgao = JSON.parse(localStorage.getItem('orgao') || '{}')
      
      const res = await fetch(`${API_URL}/api/esclarecimentos/${esclarecimentoSelecionado.id}/responder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resposta: resposta,
          respondido_por: orgao.responsavel_nome || 'Pregoeiro'
        })
      })

      if (res.ok) {
        setModalAberto(false)
        setResposta('')
        setEsclarecimentoSelecionado(null)
        carregarDados()
      } else {
        alert('Erro ao enviar resposta')
      }
    } catch (error) {
      console.error('Erro:', error)
      alert('Erro ao enviar resposta')
    } finally {
      setRespondendo(false)
    }
  }

  const arquivar = async (id: string) => {
    if (!confirm('Deseja arquivar este esclarecimento?')) return

    try {
      const res = await fetch(`${API_URL}/api/esclarecimentos/${id}/arquivar`, {
        method: 'PUT'
      })
      if (res.ok) {
        carregarDados()
      }
    } catch (error) {
      console.error('Erro:', error)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDENTE':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" /> Pendente</Badge>
      case 'RESPONDIDO':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" /> Respondido</Badge>
      case 'ARQUIVADO':
        return <Badge className="bg-gray-100 text-gray-800"><Archive className="h-3 w-3 mr-1" /> Arquivado</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

  const pendentes = esclarecimentos.filter(e => e.status === 'PENDENTE')
  const respondidos = esclarecimentos.filter(e => e.status === 'RESPONDIDO')
  const arquivados = esclarecimentos.filter(e => e.status === 'ARQUIVADO')

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Pedidos de Esclarecimento</h1>
            <p className="text-muted-foreground">
              {licitacao?.numero_edital || licitacao?.numero_processo}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {pendentes.length > 0 && (
            <Badge className="bg-yellow-100 text-yellow-800 text-lg px-4 py-2">
              {pendentes.length} pendente{pendentes.length > 1 ? 's' : ''}
            </Badge>
          )}
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <Clock className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendentes.length}</p>
                <p className="text-sm text-muted-foreground">Pendentes</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{respondidos.length}</p>
                <p className="text-sm text-muted-foreground">Respondidos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Archive className="h-5 w-5 text-gray-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{arquivados.length}</p>
                <p className="text-sm text-muted-foreground">Arquivados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Esclarecimentos */}
      {esclarecimentos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <HelpCircle className="h-12 w-12 mx-auto text-gray-300 mb-4" />
            <p className="text-muted-foreground">Nenhum pedido de esclarecimento recebido</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {esclarecimentos.map((esc) => (
            <Card key={esc.id} className={esc.status === 'PENDENTE' ? 'border-yellow-300' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${esc.is_cidadao ? 'bg-purple-100' : 'bg-blue-100'}`}>
                      {esc.is_cidadao ? (
                        <User className={`h-5 w-5 text-purple-600`} />
                      ) : (
                        <Building2 className={`h-5 w-5 text-blue-600`} />
                      )}
                    </div>
                    <div>
                      <CardTitle className="text-base">
                        {esc.is_cidadao 
                          ? esc.nome_solicitante || 'Cidadão'
                          : esc.fornecedor?.razao_social || 'Fornecedor'
                        }
                      </CardTitle>
                      <CardDescription>
                        {esc.is_cidadao ? 'Cidadão' : `CNPJ: ${esc.fornecedor?.cnpj || '-'}`}
                        {' • '}
                        {new Date(esc.created_at).toLocaleDateString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(esc.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {esc.item_edital_referencia && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Referência: </span>
                    <span className="font-medium">{esc.item_edital_referencia}</span>
                  </div>
                )}

                <div className="bg-gray-50 p-4 rounded-lg">
                  <Label className="text-sm text-muted-foreground">Pergunta</Label>
                  <p className="mt-1 whitespace-pre-wrap">{esc.texto_esclarecimento}</p>
                </div>

                {esc.documento_nome && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <FileText className="h-8 w-8 text-blue-600" />
                    <div className="flex-1">
                      <p className="font-medium text-blue-800">{esc.documento_nome}</p>
                      {esc.documento_tamanho && (
                        <p className="text-xs text-blue-600">
                          {esc.documento_tamanho < 1024 * 1024 
                            ? `${(esc.documento_tamanho / 1024).toFixed(1)} KB`
                            : `${(esc.documento_tamanho / (1024 * 1024)).toFixed(1)} MB`
                          }
                        </p>
                      )}
                    </div>
                    <a
                      href={`${API_URL}/api/esclarecimentos/${esc.id}/documento`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Download className="h-4 w-4" />
                      Baixar
                    </a>
                  </div>
                )}

                {esc.resposta && (
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <Label className="text-sm text-green-700">Resposta</Label>
                    <p className="mt-1 text-green-800 whitespace-pre-wrap">{esc.resposta}</p>
                    {esc.data_resposta && (
                      <p className="text-xs text-green-600 mt-2">
                        Respondido em {new Date(esc.data_resposta).toLocaleDateString('pt-BR')}
                      </p>
                    )}
                  </div>
                )}

                {/* Ações */}
                <div className="flex gap-2 pt-2">
                  {esc.status === 'PENDENTE' && (
                    <>
                      <Button onClick={() => abrirModalResposta(esc)}>
                        <MessageSquare className="mr-2 h-4 w-4" />
                        Responder
                      </Button>
                      <Button variant="outline" onClick={() => arquivar(esc.id)}>
                        <Archive className="mr-2 h-4 w-4" />
                        Arquivar
                      </Button>
                    </>
                  )}
                  {esc.status === 'RESPONDIDO' && (
                    <Button variant="outline" onClick={() => abrirModalResposta(esc)}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Editar Resposta
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal de Resposta */}
      <Dialog open={modalAberto} onOpenChange={setModalAberto}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Responder Esclarecimento</DialogTitle>
            <DialogDescription>
              Sua resposta será visível para todos os interessados na licitação
            </DialogDescription>
          </DialogHeader>
          
          {esclarecimentoSelecionado && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <Label className="text-sm text-muted-foreground">Pergunta</Label>
                <p className="mt-1 whitespace-pre-wrap">{esclarecimentoSelecionado.texto_esclarecimento}</p>
              </div>

              <div>
                <Label htmlFor="resposta">Sua Resposta</Label>
                <Textarea
                  id="resposta"
                  value={resposta}
                  onChange={(e) => setResposta(e.target.value)}
                  rows={6}
                  placeholder="Digite sua resposta ao esclarecimento..."
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setModalAberto(false)}>
                  Cancelar
                </Button>
                <Button onClick={enviarResposta} disabled={respondendo || !resposta.trim()}>
                  {respondendo ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Enviar Resposta
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
