"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft,
  Building2,
  Calendar,
  Clock,
  FileText,
  Download,
  Send,
  Gavel,
  AlertCircle,
  CheckCircle2,
  MapPin,
  Loader2,
  Users,
  HelpCircle
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Licitacao {
  id: string
  numero_processo: string
  numero_edital: string
  modalidade: string
  objeto: string
  objeto_detalhado?: string
  valor_total_estimado: number
  fase: string
  data_publicacao_edital?: string
  data_abertura_sessao?: string
  data_inicio_acolhimento?: string
  data_fim_acolhimento?: string
  criterio_julgamento?: string
  modo_disputa?: string
  orgao?: {
    nome: string
    cnpj: string
    logradouro?: string
    numero?: string
    bairro?: string
    cidade?: string
    uf?: string
  }
  pregoeiro_nome?: string
  pregoeiro_email?: string
  itens?: Item[]
}

interface Item {
  id: string
  numero_item: number
  numero_lote?: number
  descricao_resumida: string
  descricao_detalhada?: string
  quantidade: number
  unidade_medida: string
  valor_unitario_estimado: number
  valor_total_estimado: number
  codigo_catmat?: string
  codigo_catser?: string
}

interface Documento {
  id: string
  titulo: string
  nome_original: string
  nome_arquivo: string
  tipo: string
  mime_type: string
  tamanho_bytes: number
  data_publicacao?: string
  publico: boolean
}

export default function DetalheLicitacaoFornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const licitacaoId = resolvedParams.id

  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [loading, setLoading] = useState(true)
  const [minhaProposta] = useState<null | { valorTotal: number; status: string }>(null)

  useEffect(() => {
    carregarDados()
  }, [licitacaoId])

  const carregarDados = async () => {
    try {
      const [licRes, docRes] = await Promise.all([
        fetch(`${API_URL}/api/licitacoes/${licitacaoId}`),
        fetch(`${API_URL}/api/documentos/licitacao/${licitacaoId}?publicos=true`)
      ])

      if (licRes.ok) {
        const data = await licRes.json()
        setLicitacao(data)
      }

      if (docRes.ok) {
        setDocumentos(await docRes.json())
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const formatarMoeda = (valor: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
  }

  const formatarData = (data?: string) => {
    if (!data) return '-'
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const formatarDataHora = (data?: string) => {
    if (!data) return '-'
    return new Date(data).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatarTamanho = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getModalidadeLabel = (modalidade: string) => {
    const map: Record<string, string> = {
      PREGAO_ELETRONICO: 'Pregão Eletrônico',
      PREGAO_PRESENCIAL: 'Pregão Presencial',
      CONCORRENCIA: 'Concorrência',
      TOMADA_PRECOS: 'Tomada de Preços',
      CONVITE: 'Convite',
      DISPENSA: 'Dispensa',
      INEXIGIBILIDADE: 'Inexigibilidade',
      LEILAO: 'Leilão',
      DIALOGO_COMPETITIVO: 'Diálogo Competitivo'
    }
    return map[modalidade] || modalidade
  }

  const getCriterioLabel = (criterio?: string) => {
    const map: Record<string, string> = {
      MENOR_PRECO: 'Menor Preço',
      MAIOR_DESCONTO: 'Maior Desconto',
      MELHOR_TECNICA: 'Melhor Técnica',
      TECNICA_PRECO: 'Técnica e Preço',
      MAIOR_LANCE: 'Maior Lance',
      MAIOR_RETORNO_ECONOMICO: 'Maior Retorno Econômico'
    }
    return map[criterio || ''] || criterio || '-'
  }

  const getModoDisputaLabel = (modo?: string) => {
    const map: Record<string, string> = {
      ABERTO: 'Aberto',
      FECHADO: 'Fechado',
      ABERTO_FECHADO: 'Aberto e Fechado'
    }
    return map[modo || ''] || modo || '-'
  }

  const getFaseBadge = (fase: string) => {
    const map: Record<string, { label: string; className: string }> = {
      PLANEJAMENTO: { label: 'Planejamento', className: 'bg-gray-100 text-gray-800' },
      TERMO_REFERENCIA: { label: 'Termo de Referência', className: 'bg-gray-100 text-gray-800' },
      PESQUISA_PRECOS: { label: 'Pesquisa de Preços', className: 'bg-gray-100 text-gray-800' },
      ANALISE_JURIDICA: { label: 'Análise Jurídica', className: 'bg-gray-100 text-gray-800' },
      APROVACAO_INTERNA: { label: 'Aprovação Interna', className: 'bg-gray-100 text-gray-800' },
      PUBLICADO: { label: 'Publicado', className: 'bg-blue-100 text-blue-800' },
      IMPUGNACAO: { label: 'Impugnação', className: 'bg-yellow-100 text-yellow-800' },
      ACOLHIMENTO_PROPOSTAS: { label: 'Recebendo Propostas', className: 'bg-green-100 text-green-800' },
      ANALISE_PROPOSTAS: { label: 'Análise de Propostas', className: 'bg-purple-100 text-purple-800' },
      EM_DISPUTA: { label: 'Em Disputa', className: 'bg-red-100 text-red-800' },
      JULGAMENTO: { label: 'Julgamento', className: 'bg-orange-100 text-orange-800' },
      HABILITACAO: { label: 'Habilitação', className: 'bg-indigo-100 text-indigo-800' },
      RECURSO: { label: 'Recurso', className: 'bg-pink-100 text-pink-800' },
      ADJUDICACAO: { label: 'Adjudicação', className: 'bg-teal-100 text-teal-800' },
      HOMOLOGACAO: { label: 'Homologação', className: 'bg-emerald-100 text-emerald-800' },
      CONCLUIDO: { label: 'Concluído', className: 'bg-green-100 text-green-800' },
    }
    const config = map[fase] || { label: fase, className: 'bg-gray-100' }
    return <Badge className={config.className}>{config.label}</Badge>
  }

  const diasRestantes = () => {
    if (!licitacao?.data_fim_acolhimento) return 0
    const hoje = new Date()
    const fim = new Date(licitacao.data_fim_acolhimento)
    const diff = Math.ceil((fim.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  // Verifica se estamos no período de acolhimento baseado nas datas
  const estaNoPeriodoAcolhimento = () => {
    if (!licitacao?.data_inicio_acolhimento || !licitacao?.data_fim_acolhimento) return false
    const agora = new Date()
    const inicio = new Date(licitacao.data_inicio_acolhimento)
    const fim = new Date(licitacao.data_fim_acolhimento)
    return agora >= inicio && agora <= fim
  }

  // Verifica se o período de acolhimento ainda não começou
  const acolhimentoAindaNaoComecou = () => {
    if (!licitacao?.data_inicio_acolhimento) return true
    const agora = new Date()
    const inicio = new Date(licitacao.data_inicio_acolhimento)
    return agora < inicio
  }

  // Pode enviar proposta se: está no período OU fase é ACOLHIMENTO_PROPOSTAS
  const podeEnviarProposta = () => {
    if (minhaProposta) return false
    if (licitacao?.fase === 'ACOLHIMENTO_PROPOSTAS') return true
    if (estaNoPeriodoAcolhimento()) return true
    return false
  }

  const itens = licitacao?.itens || []

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  // Not found state
  if (!licitacao) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px]">
        <AlertCircle className="h-12 w-12 text-gray-400 mb-4" />
        <p className="text-lg text-gray-600">Licitação não encontrada</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
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
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">
                {licitacao.numero_edital || licitacao.numero_processo}
              </h1>
              {getFaseBadge(licitacao.fase)}
            </div>
            <p className="text-muted-foreground">{getModalidadeLabel(licitacao.modalidade)}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Esclarecimentos - disponível em várias fases */}
          {['PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS'].includes(licitacao.fase) && (
            <Link href={`/fornecedor/licitacoes/${licitacao.id}/esclarecimentos`}>
              <Button variant="outline">
                <HelpCircle className="mr-2 h-4 w-4" /> Esclarecimentos
              </Button>
            </Link>
          )}
          {/* Impugnação - apenas em fases iniciais */}
          {(licitacao.fase === 'PUBLICADO' || licitacao.fase === 'IMPUGNACAO') && (
            <Link href={`/fornecedor/licitacoes/${licitacao.id}/impugnar`}>
              <Button variant="outline" className="text-orange-600 border-orange-300 hover:bg-orange-50">
                <AlertCircle className="mr-2 h-4 w-4" /> Impugnar Edital
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Cronograma e Status da Proposta */}
      <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between gap-6">
            {/* Timeline do Cronograma */}
            <div className="flex-1">
              <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
                <Clock className="h-5 w-5 text-blue-600" /> Cronograma da Licitação
              </h3>
              <div className="flex items-center gap-2">
                {/* Publicação */}
                <div className={`flex-1 p-3 rounded-lg text-center ${
                  licitacao.fase === 'PUBLICADO' ? 'bg-blue-600 text-white' : 
                  ['IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS', 'EM_DISPUTA', 'HOMOLOGADO'].includes(licitacao.fase) ? 'bg-green-100 text-green-800' : 
                  'bg-gray-100 text-gray-600'
                }`}>
                  <p className="text-xs font-medium">Publicação</p>
                  <p className="text-sm font-bold">{formatarData(licitacao.data_publicacao_edital)}</p>
                </div>
                <div className="w-4 h-0.5 bg-gray-300" />
                
                {/* Acolhimento */}
                <div className={`flex-1 p-3 rounded-lg text-center ${
                  (licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' || estaNoPeriodoAcolhimento()) ? 'bg-green-600 text-white ring-2 ring-green-400 ring-offset-2' : 
                  ['EM_DISPUTA', 'HOMOLOGADO'].includes(licitacao.fase) ? 'bg-green-100 text-green-800' : 
                  'bg-gray-100 text-gray-600'
                }`}>
                  <p className="text-xs font-medium">Envio de Propostas</p>
                  <p className="text-sm font-bold">
                    {formatarData(licitacao.data_inicio_acolhimento)} - {formatarData(licitacao.data_fim_acolhimento)}
                  </p>
                </div>
                <div className="w-4 h-0.5 bg-gray-300" />
                
                {/* Abertura */}
                <div className={`flex-1 p-3 rounded-lg text-center ${
                  licitacao.fase === 'EM_DISPUTA' ? 'bg-red-600 text-white' : 
                  licitacao.fase === 'HOMOLOGADO' ? 'bg-green-100 text-green-800' : 
                  'bg-gray-100 text-gray-600'
                }`}>
                  <p className="text-xs font-medium">Abertura/Disputa</p>
                  <p className="text-sm font-bold">{formatarDataHora(licitacao.data_abertura_sessao)}</p>
                </div>
              </div>
            </div>

            {/* Status e Ação */}
            <div className="w-72 border-l pl-6">
              {/* Pode enviar proposta - baseado em fase OU datas */}
              {podeEnviarProposta() && (
                <div className="text-center">
                  <div className="mb-3">
                    <Badge className="bg-green-100 text-green-800 text-sm px-3 py-1">
                      Aceitando Propostas
                    </Badge>
                    {diasRestantes() > 0 && diasRestantes() <= 5 && (
                      <p className="text-orange-600 text-sm mt-2 font-medium">
                        ⚠️ Restam {diasRestantes()} dias
                      </p>
                    )}
                  </div>
                  <Link href={`/fornecedor/licitacoes/${licitacao.id}/proposta`}>
                    <Button size="lg" className="w-full bg-green-600 hover:bg-green-700">
                      <Send className="mr-2 h-5 w-5" /> Enviar Proposta
                    </Button>
                  </Link>
                </div>
              )}
              {/* Proposta já enviada */}
              {minhaProposta && (
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </div>
                  <p className="font-semibold text-green-700">Proposta Enviada</p>
                  <p className="text-sm text-muted-foreground">Aguardando abertura da sessão</p>
                </div>
              )}
              {/* Aguardando período - apenas se ainda não começou e não tem proposta */}
              {!minhaProposta && acolhimentoAindaNaoComecou() && !['EM_DISPUTA', 'HOMOLOGADO', 'ACOLHIMENTO_PROPOSTAS'].includes(licitacao.fase) && (
                <div className="text-center">
                  <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Clock className="h-8 w-8 text-yellow-600" />
                  </div>
                  <p className="font-semibold text-yellow-700">Aguardando Período</p>
                  <p className="text-sm text-muted-foreground">
                    Propostas a partir de {formatarDataHora(licitacao.data_inicio_acolhimento)}
                  </p>
                </div>
              )}
              {/* Em disputa */}
              {licitacao.fase === 'EM_DISPUTA' && (
                <div className="text-center">
                  <Link href={`/fornecedor/licitacoes/${licitacao.id}/sala`}>
                    <Button size="lg" className="w-full" variant="destructive">
                      <Gavel className="mr-2 h-5 w-5" /> Entrar na Disputa
                    </Button>
                  </Link>
                  <p className="text-sm text-muted-foreground mt-2">Sessão em andamento</p>
                </div>
              )}
              {/* Homologado */}
              {licitacao.fase === 'HOMOLOGADO' && (
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="h-8 w-8 text-green-600" />
                  </div>
                  <p className="font-semibold text-green-700">Licitação Homologada</p>
                  <p className="text-sm text-muted-foreground">Processo concluído</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Info Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Valor Estimado</p>
            <p className="text-xl font-bold">{formatarMoeda(licitacao.valor_total_estimado || 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Data de Abertura</p>
            <p className="text-xl font-bold">{formatarDataHora(licitacao.data_abertura_sessao)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Critério de Julgamento</p>
            <p className="text-xl font-bold">{getCriterioLabel(licitacao.criterio_julgamento)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Modo de Disputa</p>
            <p className="text-xl font-bold">{getModoDisputaLabel(licitacao.modo_disputa)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Orgao */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" /> Órgão Licitante
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 bg-blue-100 rounded-lg flex items-center justify-center">
              <Building2 className="h-8 w-8 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-lg">{licitacao.orgao?.nome || 'Órgão não informado'}</p>
              <p className="text-sm text-muted-foreground">CNPJ: {licitacao.orgao?.cnpj || '-'}</p>
              {(licitacao.orgao?.logradouro || licitacao.orgao?.cidade) && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <MapPin className="h-4 w-4" /> 
                  {licitacao.orgao?.logradouro && `${licitacao.orgao.logradouro}${licitacao.orgao.numero ? `, ${licitacao.orgao.numero}` : ''}`}
                  {licitacao.orgao?.bairro && ` - ${licitacao.orgao.bairro}`}
                  {licitacao.orgao?.cidade && ` - ${licitacao.orgao.cidade}`}
                  {licitacao.orgao?.uf && `/${licitacao.orgao.uf}`}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="objeto">
        <TabsList>
          <TabsTrigger value="objeto">Objeto</TabsTrigger>
          <TabsTrigger value="itens">Itens ({itens.length})</TabsTrigger>
          <TabsTrigger value="documentos">Documentos ({documentos.length})</TabsTrigger>
          <TabsTrigger value="participar">Como Participar</TabsTrigger>
        </TabsList>

        <TabsContent value="objeto">
          <Card>
            <CardHeader>
              <CardTitle>Descrição do Objeto</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-slate-700 leading-relaxed">{licitacao.objeto}</p>
              {licitacao.objeto_detalhado && (
                <p className="text-slate-600 leading-relaxed mt-4 text-sm">{licitacao.objeto_detalhado}</p>
              )}
              
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Users className="h-4 w-4" /> Pregoeiro Responsável
                  </p>
                  <p className="font-medium">{licitacao.pregoeiro_nome || 'Não informado'}</p>
                  {licitacao.pregoeiro_email && (
                    <p className="text-sm text-muted-foreground">{licitacao.pregoeiro_email}</p>
                  )}
                </div>
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-4 w-4" /> Data de Publicação
                  </p>
                  <p className="font-medium">{formatarData(licitacao.data_publicacao_edital)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="itens">
          <Card>
            <CardHeader>
              <CardTitle>Itens da Licitação</CardTitle>
              <CardDescription>Especificações e quantidades</CardDescription>
            </CardHeader>
            <CardContent>
              {itens.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum item cadastrado</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px]">Item</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-center">Qtd.</TableHead>
                        <TableHead className="text-center">Unid.</TableHead>
                        <TableHead className="text-right">Valor Unit.</TableHead>
                        <TableHead className="text-right">Valor Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.map((item) => {
                        const valorTotal = Number(item.valor_total_estimado) || (Number(item.quantidade) * Number(item.valor_unitario_estimado))
                        return (
                          <TableRow key={item.id}>
                            <TableCell>
                              <Badge variant="outline">
                                {item.numero_lote ? `L${item.numero_lote}-` : ''}{item.numero_item}
                              </Badge>
                            </TableCell>
                            <TableCell className="max-w-md">
                              <div className="space-y-1">
                                <p className="font-medium whitespace-pre-wrap break-words">{item.descricao_resumida}</p>
                                {item.descricao_detalhada && (
                                  <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words">{item.descricao_detalhada}</p>
                                )}
                                <div className="flex flex-wrap gap-2 mt-1">
                                  {item.codigo_catmat && (
                                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700">
                                      CATMAT: {item.codigo_catmat}
                                    </Badge>
                                  )}
                                  {item.codigo_catser && (
                                    <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700">
                                      CATSER: {item.codigo_catser}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">{Number(item.quantidade).toLocaleString('pt-BR')}</TableCell>
                            <TableCell className="text-center">{item.unidade_medida}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatarMoeda(item.valor_unitario_estimado)}
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium text-green-600">
                              {formatarMoeda(valorTotal)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg flex justify-between items-center">
                    <span className="font-medium">Valor Total Estimado</span>
                    <span className="text-xl font-bold text-green-600">
                      {formatarMoeda(licitacao.valor_total_estimado || 0)}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos">
          <Card>
            <CardHeader>
              <CardTitle>Documentos do Edital</CardTitle>
              <CardDescription>Baixe os documentos para elaborar sua proposta</CardDescription>
            </CardHeader>
            <CardContent>
              {documentos.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Nenhum documento disponível</p>
              ) : (
                <div className="space-y-3">
                  {documentos.map((doc) => {
                    const getTipoLabel = (tipo: string) => {
                      const map: Record<string, string> = {
                        EDITAL: 'Edital',
                        TERMO_REFERENCIA: 'Termo de Referência',
                        ANEXO: 'Anexo',
                        MINUTA_CONTRATO: 'Minuta de Contrato',
                        PESQUISA_PRECOS: 'Pesquisa de Preços',
                        ETP: 'Estudo Técnico Preliminar',
                        OUTROS: 'Outros'
                      }
                      return map[tipo] || tipo
                    }
                    
                    return (
                      <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                            <FileText className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{doc.titulo || doc.nome_original}</p>
                            <p className="text-sm text-muted-foreground">
                              {getTipoLabel(doc.tipo)} - {formatarTamanho(doc.tamanho_bytes)}
                            </p>
                          </div>
                        </div>
                        <a
                          href={`${API_URL}/api/documentos/publicos/${doc.id}/download`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-1" /> Baixar
                          </Button>
                        </a>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="participar">
          <Card>
            <CardHeader>
              <CardTitle>Como Participar desta Licitação</CardTitle>
              <CardDescription>Siga os passos abaixo para enviar sua proposta</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Cronograma */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Cronograma</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Início do Acolhimento</p>
                    <p className="font-medium">{formatarDataHora(licitacao.data_inicio_acolhimento)}</p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Fim do Acolhimento</p>
                    <p className="font-medium">{formatarDataHora(licitacao.data_fim_acolhimento)}</p>
                  </div>
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <p className="text-sm text-blue-600">Abertura da Sessão</p>
                    <p className="font-medium text-blue-800">{formatarDataHora(licitacao.data_abertura_sessao)}</p>
                  </div>
                </div>
              </div>

              {/* Passos */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Passos para Participar</h3>
                <div className="space-y-3">
                  <div className="flex gap-4 p-4 border rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">1</div>
                    <div>
                      <p className="font-medium">Leia o Edital e Anexos</p>
                      <p className="text-sm text-muted-foreground">Baixe todos os documentos na aba "Documentos" e leia atentamente as condições de participação.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 border rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">2</div>
                    <div>
                      <p className="font-medium">Verifique os Requisitos de Habilitação</p>
                      <p className="text-sm text-muted-foreground">Certifique-se de que sua empresa atende aos requisitos jurídicos, fiscais, técnicos e econômicos.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 border rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold">3</div>
                    <div>
                      <p className="font-medium">Prepare sua Proposta</p>
                      <p className="text-sm text-muted-foreground">Analise os itens na aba "Itens" e prepare os valores que pretende ofertar.</p>
                    </div>
                  </div>
                  <div className="flex gap-4 p-4 border rounded-lg">
                    <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">4</div>
                    <div>
                      <p className="font-medium">Envie sua Proposta</p>
                      <p className="text-sm text-muted-foreground">Clique no botão "Enviar Proposta" e preencha os valores para cada item.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Documentos de Habilitação */}
              <div>
                <h3 className="font-semibold text-lg mb-3">Documentos de Habilitação Típicos</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="font-medium text-sm">Habilitação Jurídica</p>
                    <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                      <li>• Contrato Social ou Estatuto</li>
                      <li>• Documento de identidade do representante</li>
                      <li>• Procuração (se aplicável)</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="font-medium text-sm">Regularidade Fiscal</p>
                    <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                      <li>• CND Federal (Receita e PGFN)</li>
                      <li>• CND Estadual e Municipal</li>
                      <li>• CRF do FGTS</li>
                      <li>• CNDT Trabalhista</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="font-medium text-sm">Qualificação Técnica</p>
                    <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                      <li>• Atestados de capacidade técnica</li>
                      <li>• Registro no conselho profissional</li>
                    </ul>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="font-medium text-sm">Qualificação Econômica</p>
                    <ul className="text-sm text-muted-foreground mt-2 space-y-1">
                      <li>• Balanço patrimonial</li>
                      <li>• Certidão negativa de falência</li>
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  * Consulte o edital para a lista completa de documentos exigidos nesta licitação.
                </p>
              </div>

              {/* Botão de Ação */}
              {licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' && (
                <div className="pt-4 border-t">
                  <Link href={`/fornecedor/licitacoes/${licitacao.id}/proposta`}>
                    <Button size="lg" className="w-full">
                      <Send className="mr-2 h-5 w-5" /> Enviar Minha Proposta
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* CTA */}
      {licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' && !minhaProposta && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900">Pronto para participar?</p>
                  <p className="text-sm text-blue-700">
                    Envie sua proposta até {formatarDataHora(licitacao.data_fim_acolhimento)}
                  </p>
                </div>
              </div>
              <Link href={`/fornecedor/licitacoes/${licitacao.id}/proposta`}>
                <Button size="lg">
                  <Send className="mr-2 h-5 w-5" /> Enviar Proposta
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
