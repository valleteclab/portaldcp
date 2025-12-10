"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft, 
  AlertCircle, 
  Send,
  Loader2,
  FileText,
  CheckCircle,
  Clock,
  Upload,
  X,
  Download
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
  objeto: string
  fase: string
  data_limite_impugnacao?: string
}

interface MinhaImpugnacao {
  id: string
  texto_impugnacao: string
  status: string
  resposta?: string
  created_at: string
  data_resposta?: string
  documento_nome?: string
  documento_caminho?: string
}

export default function ImpugnarPage() {
  const params = useParams()
  const router = useRouter()
  const licitacaoId = params.id as string

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [minhasImpugnacoes, setMinhasImpugnacoes] = useState<MinhaImpugnacao[]>([])
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState(false)

  // Formulário
  const [texto, setTexto] = useState('')
  const [itemEdital, setItemEdital] = useState('')
  const [fundamentacao, setFundamentacao] = useState('')
  const [arquivo, setArquivo] = useState<File | null>(null)

  useEffect(() => {
    carregarDados()
  }, [licitacaoId])

  const carregarDados = async () => {
    try {
      const fornecedor = JSON.parse(localStorage.getItem('fornecedor') || '{}')
      
      const [licRes, impRes] = await Promise.all([
        fetch(`${API_URL}/api/licitacoes/${licitacaoId}`),
        fetch(`${API_URL}/api/impugnacoes/licitacao/${licitacaoId}`)
      ])

      if (licRes.ok) {
        setLicitacao(await licRes.json())
      }
      if (impRes.ok) {
        const todas = await impRes.json()
        // Filtra apenas as minhas impugnações
        setMinhasImpugnacoes(todas.filter((i: any) => i.fornecedor_id === fornecedor.id))
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

  const removerArquivo = () => {
    setArquivo(null)
    // Limpar o input file
    const input = document.getElementById('arquivo-impugnacao') as HTMLInputElement
    if (input) input.value = ''
  }

  const formatarTamanho = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const enviarImpugnacao = async () => {
    if (!texto.trim()) {
      alert('Digite o texto da impugnação')
      return
    }

    if (!arquivo) {
      alert('Anexe o documento PDF da impugnação')
      return
    }

    setEnviando(true)
    try {
      const fornecedor = JSON.parse(localStorage.getItem('fornecedor') || '{}')
      
      // Usar FormData para enviar arquivo
      const formData = new FormData()
      formData.append('licitacao_id', licitacaoId)
      formData.append('fornecedor_id', fornecedor.id || '')
      formData.append('texto_impugnacao', texto)
      formData.append('is_cidadao', 'false')
      if (itemEdital) formData.append('item_edital_impugnado', itemEdital)
      if (fundamentacao) formData.append('fundamentacao_legal', fundamentacao)
      formData.append('documento', arquivo)

      const res = await fetch(`${API_URL}/api/impugnacoes`, {
        method: 'POST',
        body: formData
      })

      if (res.ok) {
        alert('Impugnação enviada com sucesso!')
        setTexto('')
        setItemEdital('')
        setFundamentacao('')
        setArquivo(null)
        carregarDados()
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      alert('Erro ao enviar impugnação')
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

  const podeImpugnar = () => {
    if (!licitacao) return false
    const fasesPermitidas = ['PUBLICADO', 'IMPUGNACAO']
    return fasesPermitidas.includes(licitacao.fase)
  }

  const getStatusBadge = (status: string) => {
    const config: Record<string, { label: string; color: string; icon: any }> = {
      PENDENTE: { label: 'Aguardando Análise', color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      EM_ANALISE: { label: 'Em Análise', color: 'bg-blue-100 text-blue-800', icon: FileText },
      DEFERIDA: { label: 'Deferida', color: 'bg-green-100 text-green-800', icon: CheckCircle },
      INDEFERIDA: { label: 'Indeferida', color: 'bg-red-100 text-red-800', icon: AlertCircle },
      PARCIALMENTE_DEFERIDA: { label: 'Parcialmente Deferida', color: 'bg-orange-100 text-orange-800', icon: AlertCircle }
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/fornecedor/licitacoes/${licitacaoId}`}>
          <Button variant="outline" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Impugnar Edital</h1>
          <p className="text-muted-foreground">
            {licitacao?.numero_processo} - {licitacao?.objeto?.substring(0, 60)}...
          </p>
        </div>
      </div>

      {/* Informações */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-medium">Sobre a Impugnação</p>
              <p className="mt-1">
                A impugnação é o instrumento pelo qual qualquer pessoa pode questionar os termos do edital.
                O prazo para impugnação é de até 3 dias úteis antes da data de abertura da sessão (Art. 164, Lei 14.133/2021).
              </p>
              {licitacao?.data_limite_impugnacao && (
                <p className="mt-2 font-medium">
                  Prazo limite: {formatarData(licitacao.data_limite_impugnacao)}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Formulário de Nova Impugnação */}
      {podeImpugnar() ? (
        <Card>
          <CardHeader>
            <CardTitle>Nova Impugnação</CardTitle>
            <CardDescription>
              Preencha os campos abaixo para enviar sua impugnação ao edital
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Texto da Impugnação *</Label>
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Descreva detalhadamente os pontos do edital que você deseja impugnar e os motivos..."
                rows={6}
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Item do Edital Impugnado</Label>
                <Input
                  value={itemEdital}
                  onChange={(e) => setItemEdital(e.target.value)}
                  placeholder="Ex: Item 5.2.1"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Fundamentação Legal</Label>
                <Input
                  value={fundamentacao}
                  onChange={(e) => setFundamentacao(e.target.value)}
                  placeholder="Ex: Art. 164 da Lei 14.133/2021"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Upload de Documento PDF */}
            <div>
              <Label>Documento da Impugnação (PDF) *</Label>
              <div className="mt-1">
                {!arquivo ? (
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                    <input
                      type="file"
                      id="arquivo-impugnacao"
                      accept=".pdf,application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <label htmlFor="arquivo-impugnacao" className="cursor-pointer">
                      <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm text-gray-600">
                        Clique para selecionar ou arraste o arquivo PDF
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Apenas PDF, máximo 10MB
                      </p>
                    </label>
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="flex items-center gap-3">
                      <FileText className="h-8 w-8 text-green-600" />
                      <div>
                        <p className="font-medium text-sm text-green-800">{arquivo.name}</p>
                        <p className="text-xs text-green-600">{formatarTamanho(arquivo.size)}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={removerArquivo}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            <Button onClick={enviarImpugnacao} disabled={enviando || !arquivo}>
              {enviando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar Impugnação
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-50">
          <CardContent className="py-8 text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 text-slate-400" />
            <p className="text-muted-foreground">
              O prazo para impugnação já encerrou ou a licitação não está mais na fase de impugnação.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Minhas Impugnações */}
      {minhasImpugnacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Minhas Impugnações</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {minhasImpugnacoes.map((imp) => (
              <div key={imp.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  {getStatusBadge(imp.status)}
                  <span className="text-sm text-muted-foreground">
                    Enviada em {formatarData(imp.created_at)}
                  </span>
                </div>
                
                <p className="text-sm mb-3 whitespace-pre-wrap">{imp.texto_impugnacao}</p>

                {/* Documento anexado */}
                {imp.documento_nome && (
                  <div className="flex items-center gap-2 mb-3 p-2 bg-gray-50 rounded">
                    <FileText className="h-4 w-4 text-blue-600" />
                    <span className="text-sm text-gray-700">{imp.documento_nome}</span>
                    <a
                      href={`${API_URL}/api/impugnacoes/${imp.id}/documento`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-auto text-blue-600 hover:text-blue-800"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </div>
                )}

                {imp.resposta && (
                  <div className="bg-blue-50 border border-blue-200 rounded p-3 mt-3">
                    <p className="text-sm font-medium text-blue-800 mb-1">Resposta do Órgão:</p>
                    <p className="text-sm text-blue-700 whitespace-pre-wrap">{imp.resposta}</p>
                    {imp.data_resposta && (
                      <p className="text-xs text-blue-600 mt-2">
                        Respondida em {formatarData(imp.data_resposta)}
                      </p>
                    )}
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
