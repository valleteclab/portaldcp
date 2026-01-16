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

import { API_URL, authFetch } from '@/lib/api'

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
  sigilo_orcamento?: 'PUBLICO' | 'SIGILOSO'
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
  const [minhaProposta, setMinhaProposta] = useState<null | { id: string; valorTotal: number; status: string }>(null)
  const [sessaoAtiva, setSessaoAtiva] = useState<{ id: string; status: string; etapa: string } | null>(null)

  useEffect(() => {
    carregarDados()
  }, [licitacaoId])

  const carregarDados = async () => {
    try {
      const [licRes, docRes] = await Promise.all([
        authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`),
        authFetch(`${API_URL}/api/documentos/licitacao/${licitacaoId}?publicos=true`)
      ])

      if (licRes.ok) {
        const data = await licRes.json()
        setLicitacao(data)
      }

      if (docRes.ok) {
        setDocumentos(await docRes.json())
      }

      const fornecedorStr = localStorage.getItem('fornecedor')
      if (fornecedorStr) {
        const fornecedor = JSON.parse(fornecedorStr)
        const resPropostas = await authFetch(`${API_URL}/api/propostas/fornecedor/${fornecedor.id}`)
        if (resPropostas.ok) {
          const propostas = await resPropostas.json()
          const existente = propostas.find((p: any) => p.licitacao_id === licitacaoId)
          if (existente) {
            setMinhaProposta({
              id: existente.id,
              valorTotal: existente.valor_total_proposta,
              status: existente.status,
            })
          }
        }
      }

      // Verificar se existe sessão ativa
      try {
        const resSessao = await authFetch(`${API_URL}/api/sessao/licitacao/${licitacaoId}`)
        if (resSessao.ok) {
          const sessao = await resSessao.json()
          if (sessao && (sessao.status === 'EM_ANDAMENTO' || sessao.status === 'MODO_ABERTO' || sessao.status === 'AGUARDANDO_INICIO')) {
            setSessaoAtiva({
              id: sessao.id,
              status: sessao.status,
              etapa: sessao.etapa,
            })
          }
        }
      } catch (e) {
        // Sessão não existe, ok
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

  const parseIsoLocal = (value?: string) => {
    if (!value) return undefined
    const match = value.match(/^\s*(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?\s*$/)
    if (!match) return undefined
    const [, ano, mes, dia, hora, min, seg = '00'] = match
    const date = new Date(
      parseInt(ano),
      parseInt(mes) - 1,
      parseInt(dia),
      parseInt(hora),
      parseInt(min),
      parseInt(seg)
    )
    return isNaN(date.getTime()) ? undefined : date
  }

  const formatarData = (data?: string) => {
    if (!data) return '-'
    const d = parseIsoLocal(data)
    if (!d) return '-'
    return d.toLocaleDateString('pt-BR')
  }

  const formatarDataHora = (data?: string) => {
    if (!data) return '-'
    const d = parseIsoLocal(data)
    if (!d) return '-'
    return d.toLocaleString('pt-BR', {
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
    if (!licitacao?.data_abertura_sessao) return 0
    const hoje = new Date()
    const abertura = parseIsoLocal(licitacao.data_abertura_sessao)
    if (!abertura) return 0
    const diff = Math.ceil((abertura.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
    return diff
  }

  // Verifica se estamos no período de acolhimento baseado nas datas
  const estaNoPeriodoAcolhimento = () => {
    if (!licitacao?.data_inicio_acolhimento || !licitacao?.data_abertura_sessao) return false
    const agora = new Date()
    const inicio = parseIsoLocal(licitacao.data_inicio_acolhimento)
    const abertura = parseIsoLocal(licitacao.data_abertura_sessao)
    if (!inicio || !abertura) return false
    return agora >= inicio && agora < abertura
  }

  // Verifica se o período de acolhimento ainda não começou
  const acolhimentoAindaNaoComecou = () => {
    if (!licitacao?.data_inicio_acolhimento) return true
    const agora = new Date()
    const inicio = parseIsoLocal(licitacao.data_inicio_acolhimento)
    if (!inicio) return true
    return agora < inicio
  }

  // Pode enviar proposta se: está no período OU fase é ACOLHIMENTO_PROPOSTAS
  const podeEnviarProposta = () => {
    if (minhaProposta) return false
    const abertura = parseIsoLocal(licitacao?.data_abertura_sessao)
    if (abertura && new Date() >= abertura) return false
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

      {/* Cronograma Visual em Etapas */}
      <Card className="border-2 border-slate-200">
        <CardContent className="pt-6 pb-4">
          <h3 className="font-semibold text-lg mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" /> Acompanhe o Processo
          </h3>
          
          {/* Timeline de Fases */}
          <div className="relative">
            {/* Linha de conexão */}
            <div className="absolute top-6 left-0 right-0 h-1 bg-gray-200 z-0" />
            
            {/* Fases */}
            <div className="relative z-10 flex justify-between">
              {/* 1. Publicação */}
              <div className="flex flex-col items-center w-1/6">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 ${
                  licitacao.fase === 'PUBLICADO' 
                    ? 'bg-blue-600 border-blue-600 text-white' 
                    : ['IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS', 'EM_DISPUTA', 'JULGAMENTO', 'HABILITACAO', 'ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'].includes(licitacao.fase)
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  <FileText className="h-5 w-5" />
                </div>
                <p className={`text-xs font-medium mt-2 text-center ${licitacao.fase === 'PUBLICADO' ? 'text-blue-600' : ''}`}>
                  Publicação
                </p>
                <p className="text-[10px] text-muted-foreground">{formatarData(licitacao.data_publicacao_edital)}</p>
              </div>

              {/* 2. Impugnação */}
              <div className="flex flex-col items-center w-1/6">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 ${
                  licitacao.fase === 'IMPUGNACAO' 
                    ? 'bg-yellow-500 border-yellow-500 text-white' 
                    : ['ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS', 'EM_DISPUTA', 'JULGAMENTO', 'HABILITACAO', 'ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'].includes(licitacao.fase)
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  <AlertCircle className="h-5 w-5" />
                </div>
                <p className={`text-xs font-medium mt-2 text-center ${licitacao.fase === 'IMPUGNACAO' ? 'text-yellow-600' : ''}`}>
                  Impugnação
                </p>
                <p className="text-[10px] text-muted-foreground">Até {formatarData(licitacao.data_fim_acolhimento)}</p>
              </div>

              {/* 3. Propostas */}
              <div className="flex flex-col items-center w-1/6">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 ${
                  (licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' || estaNoPeriodoAcolhimento())
                    ? 'bg-green-600 border-green-600 text-white ring-4 ring-green-200' 
                    : ['ANALISE_PROPOSTAS', 'EM_DISPUTA', 'JULGAMENTO', 'HABILITACAO', 'ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'].includes(licitacao.fase)
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  <Send className="h-5 w-5" />
                </div>
                <p className={`text-xs font-medium mt-2 text-center ${(licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' || estaNoPeriodoAcolhimento()) ? 'text-green-600 font-bold' : ''}`}>
                  Propostas
                </p>
                <p className="text-[10px] text-muted-foreground">{formatarData(licitacao.data_inicio_acolhimento)}</p>
              </div>

              {/* 4. Disputa */}
              <div className="flex flex-col items-center w-1/6">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 ${
                  licitacao.fase === 'EM_DISPUTA' 
                    ? 'bg-red-600 border-red-600 text-white animate-pulse' 
                    : ['JULGAMENTO', 'HABILITACAO', 'ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'].includes(licitacao.fase)
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  <Gavel className="h-5 w-5" />
                </div>
                <p className={`text-xs font-medium mt-2 text-center ${licitacao.fase === 'EM_DISPUTA' ? 'text-red-600 font-bold' : ''}`}>
                  Disputa
                </p>
                <p className="text-[10px] text-muted-foreground">{formatarDataHora(licitacao.data_abertura_sessao)}</p>
              </div>

              {/* 5. Habilitação */}
              <div className="flex flex-col items-center w-1/6">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 ${
                  ['JULGAMENTO', 'HABILITACAO'].includes(licitacao.fase)
                    ? 'bg-purple-600 border-purple-600 text-white' 
                    : ['ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'].includes(licitacao.fase)
                      ? 'bg-green-500 border-green-500 text-white'
                      : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  <FileText className="h-5 w-5" />
                </div>
                <p className={`text-xs font-medium mt-2 text-center ${['JULGAMENTO', 'HABILITACAO'].includes(licitacao.fase) ? 'text-purple-600' : ''}`}>
                  Habilitação
                </p>
                <p className="text-[10px] text-muted-foreground">Após disputa</p>
              </div>

              {/* 6. Resultado */}
              <div className="flex flex-col items-center w-1/6">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center border-4 ${
                  ['ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'].includes(licitacao.fase)
                    ? 'bg-emerald-600 border-emerald-600 text-white' 
                    : 'bg-white border-gray-300 text-gray-400'
                }`}>
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <p className={`text-xs font-medium mt-2 text-center ${['ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'].includes(licitacao.fase) ? 'text-emerald-600' : ''}`}>
                  Resultado
                </p>
                <p className="text-[10px] text-muted-foreground">Final</p>
              </div>
            </div>
          </div>

          {/* Indicador de fase atual */}
          <div className="mt-6 p-3 rounded-lg bg-slate-50 border">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${
                  licitacao.fase === 'EM_DISPUTA' ? 'bg-red-500 animate-pulse' :
                  (licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' || estaNoPeriodoAcolhimento()) ? 'bg-green-500' :
                  'bg-blue-500'
                }`} />
                <div>
                  <p className="text-sm font-medium">
                    Fase Atual: <span className="text-blue-600">{getFaseBadge(licitacao.fase)}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {licitacao.fase === 'EM_DISPUTA' && 'Sessão de disputa em andamento'}
                    {(licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' || estaNoPeriodoAcolhimento()) && 'Período aberto para envio de propostas'}
                    {licitacao.fase === 'PUBLICADO' && 'Edital publicado, aguardando período de propostas'}
                    {licitacao.fase === 'IMPUGNACAO' && 'Período para impugnações e esclarecimentos'}
                    {['JULGAMENTO', 'HABILITACAO'].includes(licitacao.fase) && 'Análise de documentos e habilitação'}
                    {['ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'].includes(licitacao.fase) && 'Processo em fase de conclusão'}
                  </p>
                </div>
              </div>
              {diasRestantes() > 0 && diasRestantes() <= 7 && (
                <Badge className="bg-orange-100 text-orange-800">
                  ⏰ {diasRestantes()} dias para abertura
                </Badge>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Status da Proposta e Ações */}
      <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-white">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center">
            {/* Status e Ação */}
            <div className="w-full max-w-md">
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
                  <div className="mt-4">
                    <Link href={`/fornecedor/propostas/${minhaProposta.id}`}>
                      <Button size="lg" className="w-full" variant="outline">
                        Ver / Editar Proposta
                      </Button>
                    </Link>
                  </div>
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
              {/* Proposta Desclassificada - não pode participar da disputa */}
              {minhaProposta && minhaProposta.status === 'DESCLASSIFICADA' && ['ANALISE_PROPOSTAS', 'EM_DISPUTA', 'JULGAMENTO'].includes(licitacao.fase) && (
                <div className="text-center">
                  <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <AlertCircle className="h-8 w-8 text-red-600" />
                  </div>
                  <p className="font-semibold text-red-700">Proposta Desclassificada</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Você não pode participar da disputa
                  </p>
                  {minhaProposta.motivo_desclassificacao && (
                    <div className="mt-3 p-3 bg-red-50 rounded-lg text-left">
                      <p className="text-xs font-medium text-red-800">Motivo:</p>
                      <p className="text-sm text-red-700">{minhaProposta.motivo_desclassificacao}</p>
                    </div>
                  )}
                </div>
              )}
              {/* Sala de Disputa - mostrar quando proposta enviada, classificada e fase permite */}
              {minhaProposta && minhaProposta.status !== 'DESCLASSIFICADA' && ['ANALISE_PROPOSTAS', 'EM_DISPUTA', 'JULGAMENTO'].includes(licitacao.fase) && (
                <div className="text-center">
                  {licitacao.fase === 'EM_DISPUTA' || sessaoAtiva ? (
                    <>
                      <div className="mb-3">
                        <Badge className="bg-red-100 text-red-800 text-sm px-3 py-1 animate-pulse">
                          🔴 Sessão em Andamento
                        </Badge>
                      </div>
                      <Button 
                        size="lg" 
                        className="w-full bg-red-600 hover:bg-red-700"
                        onClick={() => {
                          window.location.href = `/fornecedor/licitacoes/${licitacao.id}/sala`
                        }}
                      >
                        <Gavel className="mr-2 h-5 w-5" /> Entrar na Sala de Disputa
                      </Button>
                      <p className="text-sm text-muted-foreground mt-2">
                        {sessaoAtiva?.etapa === 'DISPUTA_LANCES' 
                          ? 'Etapa de lances em andamento' 
                          : 'Aguardando início dos lances'}
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="mb-3">
                        <Badge variant="outline" className="text-sm px-3 py-1">
                          ⏳ Aguardando Abertura
                        </Badge>
                      </div>
                      <Button 
                        size="lg" 
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          window.location.href = `/fornecedor/licitacoes/${licitacao.id}/sala`
                        }}
                      >
                        <Gavel className="mr-2 h-5 w-5" /> Acessar Sala de Disputa
                      </Button>
                      <p className="text-sm text-muted-foreground mt-2">
                        Abertura prevista: {formatarDataHora(licitacao.data_abertura_sessao)}
                      </p>
                    </>
                  )}
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
            <p className="text-xl font-bold">
              {licitacao.sigilo_orcamento === 'SIGILOSO' ? (
                <span className="text-amber-600">Sigiloso</span>
              ) : (
                formatarMoeda(licitacao.valor_total_estimado || 0)
              )}
            </p>
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
                        {licitacao.sigilo_orcamento !== 'SIGILOSO' && (
                          <>
                            <TableHead className="text-right">Valor Unit.</TableHead>
                            <TableHead className="text-right">Valor Total</TableHead>
                          </>
                        )}
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
                            {licitacao.sigilo_orcamento !== 'SIGILOSO' && (
                              <>
                                <TableCell className="text-right font-mono">
                                  {formatarMoeda(item.valor_unitario_estimado)}
                                </TableCell>
                                <TableCell className="text-right font-mono font-medium text-green-600">
                                  {formatarMoeda(valorTotal)}
                                </TableCell>
                              </>
                            )}
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                  
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg flex justify-between items-center">
                    <span className="font-medium">Valor Total Estimado</span>
                    <span className="text-xl font-bold text-green-600">
                      {licitacao.sigilo_orcamento === 'SIGILOSO' ? (
                        <span className="text-amber-600">Sigiloso</span>
                      ) : (
                        formatarMoeda(licitacao.valor_total_estimado || 0)
                      )}
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
                    <p className="text-sm text-muted-foreground">Prazo Final para Envio</p>
                    <p className="font-medium">{formatarDataHora(licitacao.data_abertura_sessao)}</p>
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
              {podeEnviarProposta() && (
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
      {podeEnviarProposta() && !minhaProposta && (
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900">Pronto para participar?</p>
                  <p className="text-sm text-blue-700">
                    Envie sua proposta até {formatarDataHora(licitacao.data_abertura_sessao)}
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
