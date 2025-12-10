"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft, 
  HelpCircle, 
  Send,
  Loader2,
  FileText,
  CheckCircle,
  Clock,
  Upload,
  X,
  Download,
  MessageSquare
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Licitacao {
  id: string
  numero_processo: string
  numero_edital?: string
  objeto: string
  fase: string
}

interface MeuEsclarecimento {
  id: string
  texto_esclarecimento: string
  status: string
  resposta?: string
  created_at: string
  data_resposta?: string
  documento_nome?: string
  documento_caminho?: string
  item_edital_referencia?: string
}

export default function EsclarecimentosPage() {
  const params = useParams()
  const router = useRouter()
  const licitacaoId = params.id as string

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [meusEsclarecimentos, setMeusEsclarecimentos] = useState<MeuEsclarecimento[]>([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)

  // Formulário
  const [texto, setTexto] = useState('')
  const [itemEdital, setItemEdital] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)

  useEffect(() => {
    carregarDados()
  }, [licitacaoId])

  const carregarDados = async () => {
    try {
      const fornecedor = JSON.parse(localStorage.getItem('fornecedor') || '{}')
      
      const [licRes, escRes] = await Promise.all([
        fetch(`${API_URL}/api/licitacoes/${licitacaoId}`),
        fetch(`${API_URL}/api/esclarecimentos/licitacao/${licitacaoId}`)
      ])

      if (licRes.ok) {
        setLicitacao(await licRes.json())
      }
      if (escRes.ok) {
        const todos = await escRes.json()
        // Filtra apenas os meus esclarecimentos
        setMeusEsclarecimentos(todos.filter((e: any) => e.fornecedor_id === fornecedor.id))
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.type !== 'application/pdf') {
        alert('Apenas arquivos PDF são permitidos')
        e.target.value = ''
        return
      }
      if (file.size > 10 * 1024 * 1024) { // 10MB
        alert('O arquivo deve ter no máximo 10MB')
        e.target.value = ''
        return
      }
      setArquivo(file)
    }
  }

  const enviarEsclarecimento = async () => {
    if (!texto.trim()) {
      alert('Por favor, descreva sua dúvida ou pedido de esclarecimento')
      return
    }

    setEnviando(true)
    try {
      const fornecedor = JSON.parse(localStorage.getItem('fornecedor') || '{}')
      
      const formData = new FormData()
      formData.append('licitacao_id', licitacaoId)
      formData.append('fornecedor_id', fornecedor.id || '')
      formData.append('texto_esclarecimento', texto)
      formData.append('is_cidadao', 'false')
      if (itemEdital) formData.append('item_edital_referencia', itemEdital)
      if (arquivo) formData.append('documento', arquivo)

      const res = await fetch(`${API_URL}/api/esclarecimentos`, {
        method: 'POST',
        body: formData
      })

      if (res.ok) {
        alert('Pedido de esclarecimento enviado com sucesso!')
        setTexto('')
        setItemEdital('')
        setArquivo(null)
        carregarDados()
      } else {
        const error = await res.json()
        alert(`Erro ao enviar: ${error.message}`)
      }
    } catch (error) {
      console.error('Erro ao enviar esclarecimento:', error)
      alert('Erro ao enviar esclarecimento. Tente novamente.')
    } finally {
      setEnviando(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDENTE':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="h-3 w-3 mr-1" /> Aguardando Resposta</Badge>
      case 'RESPONDIDO':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="h-3 w-3 mr-1" /> Respondido</Badge>
      case 'ARQUIVADO':
        return <Badge className="bg-gray-100 text-gray-800">Arquivado</Badge>
      default:
        return <Badge>{status}</Badge>
    }
  }

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
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pedido de Esclarecimento</h1>
          <p className="text-muted-foreground">
            {licitacao?.numero_edital || licitacao?.numero_processo} - {licitacao?.objeto?.substring(0, 60)}...
          </p>
        </div>
      </div>

      {/* Informações */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <HelpCircle className="h-6 w-6 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Sobre Pedidos de Esclarecimento</p>
              <p className="text-sm text-blue-700 mt-1">
                Utilize este canal para solicitar esclarecimentos sobre o edital, especificações técnicas, 
                condições de participação ou qualquer dúvida relacionada à licitação. O pregoeiro responderá 
                sua solicitação e a resposta ficará disponível para todos os interessados.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Formulário */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Novo Pedido de Esclarecimento
          </CardTitle>
          <CardDescription>
            Descreva sua dúvida de forma clara e objetiva
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="itemEdital">Item do Edital (opcional)</Label>
            <Input
              id="itemEdital"
              placeholder="Ex: Item 5.2.1 - Qualificação Técnica"
              value={itemEdital}
              onChange={(e) => setItemEdital(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Indique o item do edital relacionado à sua dúvida
            </p>
          </div>

          <div>
            <Label htmlFor="texto">Descrição do Esclarecimento *</Label>
            <Textarea
              id="texto"
              placeholder="Descreva sua dúvida ou pedido de esclarecimento..."
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={6}
            />
          </div>

          {/* Upload de documento */}
          <div>
            <Label>Documento de Apoio (opcional)</Label>
            <div className="mt-2">
              {arquivo ? (
                <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <FileText className="h-8 w-8 text-blue-600" />
                  <div className="flex-1">
                    <p className="font-medium text-blue-800">{arquivo.name}</p>
                    <p className="text-xs text-blue-600">
                      {(arquivo.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setArquivo(null)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className="h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm text-gray-500">
                      <span className="font-medium text-blue-600">Clique para anexar</span> ou arraste o arquivo
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Apenas PDF (máx. 10MB)</p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,application/pdf"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
          </div>

          <Button 
            onClick={enviarEsclarecimento} 
            disabled={enviando || !texto.trim()}
            className="w-full"
          >
            {enviando ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Enviar Pedido de Esclarecimento
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Meus Esclarecimentos */}
      {meusEsclarecimentos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Meus Pedidos de Esclarecimento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {meusEsclarecimentos.map((esc) => (
              <div key={esc.id} className="border rounded-lg p-4">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    {esc.item_edital_referencia && (
                      <p className="text-sm text-muted-foreground mb-1">
                        Ref: {esc.item_edital_referencia}
                      </p>
                    )}
                    <p className="text-sm text-muted-foreground">
                      Enviado em {new Date(esc.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  {getStatusBadge(esc.status)}
                </div>
                
                <div className="bg-gray-50 p-3 rounded-lg mb-3">
                  <p className="text-sm font-medium text-gray-700 mb-1">Minha pergunta:</p>
                  <p className="text-gray-600 whitespace-pre-wrap">{esc.texto_esclarecimento}</p>
                </div>

                {esc.documento_nome && (
                  <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 rounded">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-blue-700">{esc.documento_nome}</span>
                    <a
                      href={`${API_URL}/api/esclarecimentos/${esc.id}/documento`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto"
                    >
                      <Button variant="ghost" size="sm">
                        <Download className="h-4 w-4" />
                      </Button>
                    </a>
                  </div>
                )}

                {esc.resposta && (
                  <div className="bg-green-50 p-3 rounded-lg border border-green-200">
                    <p className="text-sm font-medium text-green-700 mb-1">
                      Resposta do Pregoeiro ({esc.data_resposta ? new Date(esc.data_resposta).toLocaleDateString('pt-BR') : ''}):
                    </p>
                    <p className="text-green-800 whitespace-pre-wrap">{esc.resposta}</p>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
