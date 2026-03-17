'use client'

import { ModuleGuard } from '@/components/ModuleGuard'
import { ModuloSistema } from '@/hooks/useModulosOrgao'
import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Upload,
  Send,
  Loader2,
  FileText,
  Bot,
  User,
  X,
  MessageSquare,
  FileUp,
  Trash2
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface Mensagem {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

function AnalisarContratoPageContent() {
  const [file, setFile] = useState<File | null>(null)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [pdfBase64, setPdfBase64] = useState<string | null>(null)
  const [pdfTexto, setPdfTexto] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Scroll automático para última mensagem
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (!selectedFile) return

    if (selectedFile.type !== 'application/pdf') {
      setErro('Apenas arquivos PDF são aceitos')
      return
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setErro('Arquivo muito grande. Máximo 10MB')
      return
    }

    setFile(selectedFile)
    setErro(null)
    setIsUploading(true)

    try {
      // Converter para base64
      const base64 = await fileToBase64(selectedFile)
      setPdfBase64(base64)

      // Extrair texto do PDF (opcional, para preview)
      const formData = new FormData()
      formData.append('pdf', selectedFile)

      const res = await authFetch(`${API_URL}/api/ia/extrair-texto-pdf`, {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        setPdfTexto(data.texto)
        
        // Adicionar mensagem de sistema
        setMensagens([
          {
            id: 'system-1',
            role: 'assistant',
            content: `✅ PDF "${selectedFile.name}" carregado com sucesso!\n\n📄 **O que posso fazer por você:**\n• Extrair itens/serviços do contrato\n• Analisar cláusulas importantes\n• Verificar valores e vigência\n• Identificar obrigações do contratado\n• Responder perguntas sobre o documento\n\n💬 **Faça sua pergunta ou peça para extrair os itens!**`,
            timestamp: new Date(),
          },
        ])
      } else {
        throw new Error('Erro ao processar PDF')
      }
    } catch (error) {
      setErro('Erro ao processar o PDF. Tente novamente.')
      setFile(null)
      setPdfBase64(null)
    } finally {
      setIsUploading(false)
    }
  }

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const base64 = reader.result?.toString().split(',')[1]
        if (base64) resolve(base64)
        else reject(new Error('Erro ao converter arquivo'))
      }
      reader.onerror = reject
    })
  }

  const handleSendMessage = async () => {
    if (!input.trim() || !pdfBase64 || isLoading) return

    const userMessage: Mensagem = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    }

    setMensagens(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)
    setErro(null)

    try {
      const res = await authFetch(`${API_URL}/api/ia/analisar-contrato`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pergunta: input,
          pdfBase64,
          pdfTexto,
          historico: mensagens.map(m => ({ role: m.role, content: m.content })),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const assistantMessage: Mensagem = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.resposta,
          timestamp: new Date(),
        }
        setMensagens(prev => [...prev, assistantMessage])
      } else {
        throw new Error('Erro ao processar pergunta')
      }
    } catch (error) {
      setErro('Erro ao processar sua pergunta. Tente novamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const limparChat = () => {
    setMensagens([])
    setFile(null)
    setPdfBase64(null)
    setPdfTexto(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="w-7 h-7 text-blue-600" />
            Analisar Contrato com IA
          </h1>
          <p className="text-gray-600 mt-1">
            Envie um PDF de contrato e faça perguntas para a IA analisar
          </p>
        </div>
        {file && (
          <Button variant="outline" onClick={limparChat}>
            <Trash2 className="w-4 h-4 mr-2" />
            Limpar
          </Button>
        )}
      </div>

      {/* Upload Area */}
      {!file && (
        <Card className="border-dashed border-2 border-gray-300 hover:border-blue-400 transition-colors">
          <CardContent className="py-12">
            <div className="text-center">
              <FileUp className="w-16 h-16 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-medium mb-2">Envie um PDF de contrato</h3>
              <p className="text-gray-500 mb-4 max-w-md mx-auto">
                Arraste e solte um arquivo PDF ou clique para selecionar.
                A IA irá analisar o documento e responder suas perguntas.
              </p>
              <div className="flex justify-center">
                <label className="cursor-pointer">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button asChild>
                    <span>
                      <Upload className="w-4 h-4 mr-2" />
                      Selecionar PDF
                    </span>
                  </Button>
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-3">Máximo 10MB • Apenas PDF</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Erro */}
      {erro && (
        <Alert variant="destructive">
          <X className="w-4 h-4" />
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      {/* Upload em andamento */}
      {isUploading && (
        <Card>
          <CardContent className="py-8">
            <div className="flex flex-col items-center">
              <Loader2 className="w-10 h-10 animate-spin text-blue-600 mb-4" />
              <p className="text-gray-600">Processando PDF...</p>
              <p className="text-sm text-gray-400">Extraindo texto e preparando análise</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chat Interface */}
      {file && !isUploading && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Sidebar com info do PDF */}
          <div className="lg:col-span-1 space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Documento</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-start gap-3">
                  <FileText className="w-8 h-8 text-red-500 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                </div>
                {pdfTexto && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="text-xs text-gray-500 mb-1">
                      {pdfTexto.length.toLocaleString()} caracteres extraídos
                    </p>
                    <Badge variant="outline" className="text-xs">
                      Pronto para análise
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Sugestões</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-sm h-auto py-2"
                  onClick={() => setInput('Extraia todos os itens/serviços deste contrato')}
                >
                  📋 Extrair itens do contrato
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-sm h-auto py-2"
                  onClick={() => setInput('Quais são as cláusulas mais importantes?')}
                >
                  📑 Cláusulas importantes
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-sm h-auto py-2"
                  onClick={() => setInput('Qual o valor total e prazo de vigência?')}
                >
                  💰 Valor e vigência
                </Button>
                <Button 
                  variant="ghost" 
                  className="w-full justify-start text-sm h-auto py-2"
                  onClick={() => setInput('Quais as obrigações do contratado?')}
                >
                  ⚖️ Obrigações do contratado
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Chat Area */}
          <div className="lg:col-span-3">
            <Card className="h-[600px] flex flex-col">
              {/* Mensagens */}
              <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {mensagens.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400">
                    <MessageSquare className="w-12 h-12 mb-3" />
                    <p>Faça uma pergunta sobre o contrato</p>
                  </div>
                ) : (
                  mensagens.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                        msg.role === 'user' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'
                      }`}>
                        {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
                      </div>
                      <div className={`max-w-[80%] rounded-lg p-3 whitespace-pre-wrap ${
                        msg.role === 'user' 
                          ? 'bg-blue-600 text-white' 
                          : 'bg-gray-100 text-gray-900'
                      }`}>
                        {msg.content}
                      </div>
                    </div>
                  ))
                )}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div className="bg-gray-100 rounded-lg p-3 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-gray-600">Analisando...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </CardContent>

              {/* Input Area */}
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <Textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyPress}
                    placeholder="Faça uma pergunta sobre o contrato..."
                    className="min-h-[60px] resize-none"
                    disabled={isLoading}
                  />
                  <Button 
                    onClick={handleSendMessage}
                    disabled={!input.trim() || isLoading}
                    className="px-3"
                  >
                    {isLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Pressione Enter para enviar • Shift+Enter para nova linha
                </p>
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AnalisarContratoPage() {
  return (
    <ModuleGuard modulo={ModuloSistema.IA_CONTRATOS}>
      <AnalisarContratoPageContent />
    </ModuleGuard>
  )
}
