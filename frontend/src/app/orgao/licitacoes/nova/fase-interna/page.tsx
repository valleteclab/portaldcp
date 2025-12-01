"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { 
  ArrowLeft, ArrowRight, FileText, Check, AlertCircle, Loader2, 
  ClipboardList, Search, Scale, CheckCircle2, PenLine, Save, Eye, Trash2,
  Sparkles, Bot, Send, RefreshCw, Wand2
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

// Etapas da Fase Interna conforme Lei 14.133/2021
const ETAPAS = [
  { 
    id: 'planejamento', 
    label: 'Planejamento', 
    icon: ClipboardList,
    descricao: 'Estudo Técnico Preliminar e Análise de Riscos',
    documentos: [
      { tipo: 'ETP', label: 'Estudo Técnico Preliminar', obrigatorio: true },
      { tipo: 'MR', label: 'Matriz de Riscos', obrigatorio: false },
    ]
  },
  { 
    id: 'termo_referencia', 
    label: 'Termo de Referência', 
    icon: FileText,
    descricao: 'Especificação do objeto e requisitos',
    documentos: [
      { tipo: 'TR', label: 'Termo de Referência', obrigatorio: true },
      { tipo: 'PB', label: 'Projeto Básico', obrigatorio: false },
    ]
  },
  { 
    id: 'pesquisa_precos', 
    label: 'Pesquisa de Preços', 
    icon: Search,
    descricao: 'Cotações e estimativa de valor',
    documentos: [
      { tipo: 'PP', label: 'Pesquisa de Preços', obrigatorio: true },
    ]
  },
  { 
    id: 'analise_juridica', 
    label: 'Análise Jurídica', 
    icon: Scale,
    descricao: 'Parecer jurídico e minuta do edital',
    documentos: [
      { tipo: 'PJ', label: 'Parecer Jurídico', obrigatorio: true },
      { tipo: 'ME', label: 'Minuta do Edital', obrigatorio: true },
    ]
  },
  { 
    id: 'aprovacao', 
    label: 'Aprovação', 
    icon: CheckCircle2,
    descricao: 'Autorizações e designações',
    documentos: [
      { tipo: 'AA', label: 'Autorização da Autoridade', obrigatorio: true },
      { tipo: 'DP', label: 'Designação do Pregoeiro', obrigatorio: true },
      { tipo: 'DO', label: 'Dotação Orçamentária', obrigatorio: true },
    ]
  },
]

interface Documento {
  id: string
  tipo: string
  titulo: string
  conteudo: string
  etapa: string
}

export default function NovaLicitacaoFaseInternaPage() {
  const router = useRouter()
  const [etapaAtiva, setEtapaAtiva] = useState(0)
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [showForm, setShowForm] = useState(false)
  const [docEditando, setDocEditando] = useState<Documento | null>(null)
  
  // Form
  const [tipoDoc, setTipoDoc] = useState('')
  const [tituloDoc, setTituloDoc] = useState('')
  const [conteudoDoc, setConteudoDoc] = useState('')
  const [objetoLicitacao, setObjetoLicitacao] = useState('')

  // IA
  const [showIA, setShowIA] = useState(false)
  const [iaLoading, setIaLoading] = useState(false)
  const [iaPrompt, setIaPrompt] = useState('')
  const [iaMensagens, setIaMensagens] = useState<Array<{ role: string; content: string }>>([])

  const etapaAtual = ETAPAS[etapaAtiva]

  // Função para gerar conteúdo com IA
  const gerarComIA = async (tipo: string, contexto: string) => {
    setIaLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ia/gerar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoDocumento: tipo,
          contexto: contexto,
          objeto: objetoLicitacao,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setConteudoDoc(data.conteudo)
        setIaMensagens(prev => [
          ...prev,
          { role: 'user', content: contexto },
          { role: 'assistant', content: data.conteudo },
        ])
      }
    } catch (e) {
      console.error('Erro ao gerar com IA:', e)
    } finally {
      setIaLoading(false)
    }
  }

  // Chat com IA
  const enviarMensagemIA = async () => {
    if (!iaPrompt.trim()) return
    
    const novaMensagem = { role: 'user', content: iaPrompt }
    setIaMensagens(prev => [...prev, novaMensagem])
    setIaPrompt('')
    setIaLoading(true)

    try {
      const res = await fetch(`${API_URL}/api/ia/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mensagens: [...iaMensagens, novaMensagem],
          tipoDocumento: tipoDoc,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setIaMensagens(prev => [...prev, { role: 'assistant', content: data.resposta }])
      }
    } catch (e) {
      console.error('Erro no chat IA:', e)
    } finally {
      setIaLoading(false)
    }
  }

  // Sugerir melhorias
  const sugerirMelhorias = async () => {
    if (!conteudoDoc.trim()) return
    setIaLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/ia/sugerir-melhorias`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipoDocumento: tipoDoc,
          conteudoAtual: conteudoDoc,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setIaMensagens(prev => [
          ...prev,
          { role: 'user', content: 'Analise e sugira melhorias para este documento.' },
          { role: 'assistant', content: data.sugestoes },
        ])
        setShowIA(true)
      }
    } catch (e) {
      console.error('Erro ao sugerir melhorias:', e)
    } finally {
      setIaLoading(false)
    }
  }

  // Aplicar sugestão da IA ao conteúdo
  const aplicarSugestaoIA = (texto: string) => {
    setConteudoDoc(texto)
    setShowIA(false)
  }

  // Documentos da etapa atual
  const docsEtapaAtual = documentos.filter(d => d.etapa === etapaAtual.id)

  // Verificar se etapa está completa
  const etapaCompleta = (etapaId: string) => {
    const etapa = ETAPAS.find(e => e.id === etapaId)
    if (!etapa) return false
    const docsObrigatorios = etapa.documentos.filter(d => d.obrigatorio)
    const docsFeitos = documentos.filter(d => d.etapa === etapaId)
    return docsObrigatorios.every(ob => docsFeitos.some(df => df.tipo === ob.tipo))
  }

  // Progresso geral
  const totalObrigatorios = ETAPAS.reduce((acc, e) => acc + e.documentos.filter(d => d.obrigatorio).length, 0)
  const totalFeitos = ETAPAS.reduce((acc, e) => {
    const obrigatorios = e.documentos.filter(d => d.obrigatorio)
    const feitos = documentos.filter(d => d.etapa === e.id)
    return acc + obrigatorios.filter(ob => feitos.some(f => f.tipo === ob.tipo)).length
  }, 0)
  const progresso = Math.round((totalFeitos / totalObrigatorios) * 100)

  // Salvar documento
  const salvarDocumento = () => {
    if (!tipoDoc || !tituloDoc) return

    if (docEditando) {
      setDocumentos(prev => prev.map(d => 
        d.id === docEditando.id 
          ? { ...d, tipo: tipoDoc, titulo: tituloDoc, conteudo: conteudoDoc }
          : d
      ))
    } else {
      const novoDoc: Documento = {
        id: Date.now().toString(),
        tipo: tipoDoc,
        titulo: tituloDoc,
        conteudo: conteudoDoc,
        etapa: etapaAtual.id,
      }
      setDocumentos(prev => [...prev, novoDoc])
    }

    limparForm()
  }

  const limparForm = () => {
    setShowForm(false)
    setDocEditando(null)
    setTipoDoc('')
    setTituloDoc('')
    setConteudoDoc('')
  }

  const editarDocumento = (doc: Documento) => {
    setDocEditando(doc)
    setTipoDoc(doc.tipo)
    setTituloDoc(doc.titulo)
    setConteudoDoc(doc.conteudo)
    setShowForm(true)
  }

  const excluirDocumento = (id: string) => {
    if (confirm('Excluir este documento?')) {
      setDocumentos(prev => prev.filter(d => d.id !== id))
    }
  }

  const novoDocumento = (tipo: string, label: string) => {
    setTipoDoc(tipo)
    setTituloDoc(label)
    setConteudoDoc('')
    setShowForm(true)
  }

  // Avançar para próxima etapa
  const avancarEtapa = () => {
    if (etapaAtiva < ETAPAS.length - 1) {
      setEtapaAtiva(etapaAtiva + 1)
      setShowForm(false)
    }
  }

  // Voltar etapa
  const voltarEtapa = () => {
    if (etapaAtiva > 0) {
      setEtapaAtiva(etapaAtiva - 1)
      setShowForm(false)
    }
  }

  // Concluir fase interna e ir para cadastro
  const concluirFaseInterna = () => {
    // Salvar documentos no localStorage para usar no cadastro
    localStorage.setItem('fase_interna_docs', JSON.stringify(documentos))
    localStorage.setItem('fase_interna_modo', 'elaborar')
    localStorage.setItem('fase_interna_concluida', 'true')
    router.push('/orgao/licitacoes/nova?modo=elaborar')
  }

  const todasEtapasCompletas = ETAPAS.every(e => etapaCompleta(e.id))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => router.push('/orgao/licitacoes/nova')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Fase Interna - Elaboração</h1>
            <p className="text-muted-foreground">Elabore os documentos da fase preparatória</p>
          </div>
        </div>
        {todasEtapasCompletas && (
          <Button onClick={concluirFaseInterna} className="bg-green-600 hover:bg-green-700">
            <Check className="mr-2 h-4 w-4" />Concluir e Cadastrar Licitação
          </Button>
        )}
      </div>

      {/* Progresso */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">Progresso da Fase Interna</span>
            <span className="text-lg font-bold text-blue-600">{progresso}%</span>
          </div>
          <Progress value={progresso} className="h-3" />
          <p className="text-sm text-muted-foreground mt-2">{totalFeitos} de {totalObrigatorios} documentos obrigatórios</p>
        </CardContent>
      </Card>

      {/* Timeline de Etapas */}
      <div className="flex items-center justify-between bg-white p-4 rounded-lg border">
        {ETAPAS.map((etapa, index) => {
          const Icon = etapa.icon
          const completa = etapaCompleta(etapa.id)
          const ativa = index === etapaAtiva
          
          return (
            <div key={etapa.id} className="flex items-center">
              <button
                onClick={() => { setEtapaAtiva(index); setShowForm(false) }}
                className={`flex flex-col items-center transition-all ${ativa ? 'scale-110' : ''}`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 ${
                  completa ? 'bg-green-100 border-green-500 text-green-600' :
                  ativa ? 'bg-blue-100 border-blue-500 text-blue-600' :
                  'bg-slate-50 border-slate-200 text-slate-400'
                }`}>
                  {completa ? <Check className="h-6 w-6" /> : <Icon className="h-6 w-6" />}
                </div>
                <span className={`text-xs mt-2 font-medium ${ativa ? 'text-blue-600' : completa ? 'text-green-600' : 'text-slate-500'}`}>
                  {etapa.label}
                </span>
              </button>
              {index < ETAPAS.length - 1 && (
                <div className={`w-16 h-1 mx-2 ${completa ? 'bg-green-400' : 'bg-slate-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Conteúdo da Etapa */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {(() => { const Icon = etapaAtual.icon; return <Icon className="h-6 w-6 text-blue-600" /> })()}
              <div>
                <CardTitle>{etapaAtual.label}</CardTitle>
                <CardDescription>{etapaAtual.descricao}</CardDescription>
              </div>
            </div>
            {etapaCompleta(etapaAtual.id) && (
              <Badge className="bg-green-100 text-green-700"><Check className="w-3 h-3 mr-1" />Completa</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Documentos necessários */}
          <div className="grid grid-cols-2 gap-3">
            {etapaAtual.documentos.map(doc => {
              const jaFeito = docsEtapaAtual.find(d => d.tipo === doc.tipo)
              return (
                <div 
                  key={doc.tipo}
                  className={`p-4 border rounded-lg ${jaFeito ? 'bg-green-50 border-green-200' : 'bg-slate-50 border-slate-200'}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {jaFeito ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <FileText className="h-5 w-5 text-slate-400" />
                      )}
                      <div>
                        <p className="font-medium">{doc.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {doc.obrigatorio ? 'Obrigatório' : 'Opcional'}
                        </p>
                      </div>
                    </div>
                    {jaFeito ? (
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" onClick={() => editarDocumento(jaFeito)}>
                          <PenLine className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-600" onClick={() => excluirDocumento(jaFeito.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" onClick={() => novoDocumento(doc.tipo, doc.label)}>
                        <PenLine className="mr-1 h-4 w-4" />Elaborar
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Formulário de elaboração com IA */}
          {showForm && (
            <div className="mt-6 grid grid-cols-2 gap-4">
              {/* Coluna Esquerda - Formulário */}
              <div className="p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <PenLine className="h-5 w-5 text-blue-600" />
                  {docEditando ? 'Editar Documento' : 'Elaborar Documento'}
                </h4>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Tipo</Label>
                      <Input value={etapaAtual.documentos.find(d => d.tipo === tipoDoc)?.label || tipoDoc} disabled className="bg-white" />
                    </div>
                    <div className="space-y-2">
                      <Label>Título *</Label>
                      <Input value={tituloDoc} onChange={e => setTituloDoc(e.target.value)} placeholder="Título do documento" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Objeto da Licitação (para contexto da IA)</Label>
                    <Input 
                      value={objetoLicitacao} 
                      onChange={e => setObjetoLicitacao(e.target.value)} 
                      placeholder="Ex: Aquisição de computadores para o setor administrativo"
                      className="bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Conteúdo *</Label>
                      <div className="flex gap-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => gerarComIA(tipoDoc, `Gere um modelo completo de ${tituloDoc} para uma licitação.`)}
                          disabled={iaLoading}
                          className="text-purple-600 border-purple-300 hover:bg-purple-50"
                        >
                          {iaLoading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}
                          Gerar com IA
                        </Button>
                        {conteudoDoc && (
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={sugerirMelhorias}
                            disabled={iaLoading}
                            className="text-amber-600 border-amber-300 hover:bg-amber-50"
                          >
                            <Sparkles className="mr-1 h-4 w-4" />
                            Revisar
                          </Button>
                        )}
                      </div>
                    </div>
                    <Textarea 
                      value={conteudoDoc} 
                      onChange={e => setConteudoDoc(e.target.value)} 
                      placeholder="Elabore o conteúdo do documento aqui ou use a IA para gerar..."
                      rows={12}
                      className="bg-white"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={limparForm}>Cancelar</Button>
                    <Button onClick={salvarDocumento} disabled={!tituloDoc || !conteudoDoc}>
                      <Save className="mr-2 h-4 w-4" />Salvar Documento
                    </Button>
                  </div>
                </div>
              </div>

              {/* Coluna Direita - Assistente IA */}
              <div className="p-4 border-2 border-purple-200 rounded-lg bg-purple-50">
                <h4 className="font-medium mb-4 flex items-center gap-2">
                  <Bot className="h-5 w-5 text-purple-600" />
                  Assistente IA - Lei 14.133/2021
                  <Badge className="bg-purple-100 text-purple-700 text-xs ml-auto">Especialista em Licitações</Badge>
                </h4>

                {/* Mensagens do Chat */}
                <div className="bg-white rounded-lg border h-[300px] overflow-y-auto p-3 mb-3 space-y-3">
                  {iaMensagens.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">
                      <Bot className="h-12 w-12 mx-auto mb-2 opacity-20" />
                      <p className="text-sm">Olá! Sou seu assistente especializado na Lei 14.133/2021.</p>
                      <p className="text-xs mt-1">Posso ajudar a elaborar documentos, tirar dúvidas e revisar conteúdos.</p>
                      <div className="flex flex-wrap gap-2 justify-center mt-4">
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => gerarComIA(tipoDoc, `Explique o que deve conter um ${tituloDoc} conforme a Lei 14.133/2021.`)}
                          disabled={iaLoading}
                        >
                          O que deve conter?
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => gerarComIA(tipoDoc, `Gere um modelo completo de ${tituloDoc} para uma licitação.`)}
                          disabled={iaLoading}
                        >
                          Gerar modelo
                        </Button>
                      </div>
                    </div>
                  ) : (
                    iaMensagens.map((msg, i) => (
                      <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[90%] p-3 rounded-lg text-sm ${
                          msg.role === 'user' 
                            ? 'bg-blue-100 text-blue-800' 
                            : 'bg-purple-100 text-purple-800'
                        }`}>
                          <p className="whitespace-pre-wrap">{msg.content.substring(0, 500)}{msg.content.length > 500 ? '...' : ''}</p>
                          {msg.role === 'assistant' && (
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="mt-2 text-xs"
                              onClick={() => aplicarSugestaoIA(msg.content)}
                            >
                              <Check className="mr-1 h-3 w-3" />Usar este conteúdo
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                  {iaLoading && (
                    <div className="flex items-center gap-2 text-purple-600">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Processando...</span>
                    </div>
                  )}
                </div>

                {/* Input do Chat */}
                <div className="flex gap-2">
                  <Input 
                    value={iaPrompt}
                    onChange={e => setIaPrompt(e.target.value)}
                    placeholder="Pergunte sobre a Lei 14.133/2021..."
                    onKeyDown={e => e.key === 'Enter' && enviarMensagemIA()}
                    className="bg-white"
                  />
                  <Button onClick={enviarMensagemIA} disabled={iaLoading || !iaPrompt.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Navegação entre etapas */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={voltarEtapa} disabled={etapaAtiva === 0}>
              <ArrowLeft className="mr-2 h-4 w-4" />Etapa Anterior
            </Button>
            {etapaAtiva < ETAPAS.length - 1 ? (
              <Button onClick={avancarEtapa}>
                Próxima Etapa<ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button 
                onClick={concluirFaseInterna} 
                disabled={!todasEtapasCompletas}
                className="bg-green-600 hover:bg-green-700"
              >
                <Check className="mr-2 h-4 w-4" />Concluir Fase Interna
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
