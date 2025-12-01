"use client"

import { useState, useEffect, use } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { 
  ArrowLeft, FileText, Upload, Check, Clock, AlertCircle, Play, Pause,
  Users, Gavel, Award, CheckCircle2, XCircle, FileCheck, Scale, Loader2, Settings, Eye, EyeOff
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

const FASES_INTERNAS = [
  { id: 'PLANEJAMENTO', label: 'Planejamento', icon: FileText },
  { id: 'TERMO_REFERENCIA', label: 'Termo de Referência', icon: FileText },
  { id: 'PESQUISA_PRECOS', label: 'Pesquisa de Preços', icon: FileText },
  { id: 'ANALISE_JURIDICA', label: 'Análise Jurídica', icon: Scale },
  { id: 'APROVACAO_INTERNA', label: 'Aprovação', icon: CheckCircle2 },
]

const FASES_EXTERNAS = [
  { id: 'PUBLICADO', label: 'Publicação', icon: FileText },
  { id: 'IMPUGNACAO', label: 'Impugnação', icon: AlertCircle },
  { id: 'ACOLHIMENTO_PROPOSTAS', label: 'Propostas', icon: Users },
  { id: 'ANALISE_PROPOSTAS', label: 'Análise', icon: FileCheck },
  { id: 'EM_DISPUTA', label: 'Disputa', icon: Gavel },
  { id: 'JULGAMENTO', label: 'Julgamento', icon: Scale },
  { id: 'HABILITACAO', label: 'Habilitação', icon: FileCheck },
  { id: 'RECURSO', label: 'Recursos', icon: AlertCircle },
  { id: 'ADJUDICACAO', label: 'Adjudicação', icon: Award },
  { id: 'HOMOLOGACAO', label: 'Homologação', icon: CheckCircle2 },
]

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  modalidade: string
  fase: string
  fase_interna_concluida: boolean
  valor_total_estimado: number
  data_abertura_sessao: string
  pregoeiro_nome: string
  sigilo_orcamento: string
}

export default function GestaoLicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const router = useRouter()
  const licitacaoId = resolvedParams.id

  const [loading, setLoading] = useState(true)
  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [documentos, setDocumentos] = useState<any[]>([])
  const [resumoFaseInterna, setResumoFaseInterna] = useState<any>(null)

  useEffect(() => {
    carregarDados()
  }, [licitacaoId])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const resLic = await fetch(`${API_URL}/api/licitacoes/${licitacaoId}`)
      if (resLic.ok) setLicitacao(await resLic.json())

      const resDocs = await fetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos`)
      if (resDocs.ok) setDocumentos(await resDocs.json())

      const resResumo = await fetch(`${API_URL}/api/fase-interna/${licitacaoId}/resumo`)
      if (resResumo.ok) setResumoFaseInterna(await resResumo.json())
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const getFaseIndex = (fase: string) => FASES_EXTERNAS.findIndex(f => f.id === fase)
  
  const progressoFaseExterna = () => {
    if (!licitacao) return 0
    const index = getFaseIndex(licitacao.fase)
    return index >= 0 ? ((index + 1) / FASES_EXTERNAS.length) * 100 : 0
  }

  const formatarMoeda = (valor: number) => (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const formatarData = (data: string) => data ? new Date(data).toLocaleDateString('pt-BR') : '-'

  const getStatusDocumento = (status: string) => {
    const map: Record<string, { label: string; className: string; icon: any }> = {
      APROVADO: { label: 'Aprovado', className: 'bg-green-100 text-green-800', icon: Check },
      AGUARDANDO_APROVACAO: { label: 'Aguardando', className: 'bg-yellow-100 text-yellow-800', icon: Clock },
      EM_ELABORACAO: { label: 'Em Elaboração', className: 'bg-blue-100 text-blue-800', icon: FileText },
      REPROVADO: { label: 'Reprovado', className: 'bg-red-100 text-red-800', icon: XCircle },
      PENDENTE: { label: 'Pendente', className: 'bg-slate-100 text-slate-800', icon: Clock },
    }
    return map[status] || { label: status, className: 'bg-gray-100', icon: FileText }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  if (!licitacao) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Licitação não encontrada</p>
        <Button variant="outline" onClick={() => router.back()} className="mt-4">
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
              <h1 className="text-2xl font-bold text-slate-800">{licitacao.numero_processo}</h1>
              {licitacao.sigilo_orcamento === 'SIGILOSO' && (
                <Badge className="bg-amber-100 text-amber-700">
                  <EyeOff className="w-3 h-3 mr-1" /> Orçamento Sigiloso
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">{licitacao.objeto}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!licitacao.fase_interna_concluida && (
            <Link href={`/orgao/licitacoes/${licitacao.id}/fase-interna`}>
              <Button variant="outline">
                <Settings className="mr-2 h-4 w-4" />
                Gerenciar Fase Interna
              </Button>
            </Link>
          )}
          {licitacao.fase === 'ACOLHIMENTO_PROPOSTAS' && (
            <Link href={`/orgao/licitacoes/${licitacao.id}/sessao`}>
              <Button><Play className="mr-2 h-4 w-4" />Iniciar Sessão</Button>
            </Link>
          )}
          {licitacao.fase === 'EM_DISPUTA' && (
            <Link href={`/orgao/licitacoes/${licitacao.id}/sala`}>
              <Button variant="destructive"><Gavel className="mr-2 h-4 w-4" />Sala de Disputa</Button>
            </Link>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Valor Estimado</p>
            {licitacao.sigilo_orcamento === 'SIGILOSO' ? (
              <p className="text-xl font-bold text-amber-600 flex items-center gap-1">
                <EyeOff className="h-4 w-4" /> Sigiloso
              </p>
            ) : (
              <p className="text-xl font-bold">{formatarMoeda(licitacao.valor_total_estimado)}</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Fase Atual</p>
            <p className="text-xl font-bold text-blue-600">
              {FASES_EXTERNAS.find(f => f.id === licitacao.fase)?.label || 
               FASES_INTERNAS.find(f => f.id === licitacao.fase)?.label || licitacao.fase}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Data Abertura</p>
            <p className="text-xl font-bold">{formatarData(licitacao.data_abertura_sessao)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Pregoeiro</p>
            <p className="text-xl font-bold">{licitacao.pregoeiro_nome || '-'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="fases">
        <TabsList>
          <TabsTrigger value="fases">Fases do Processo</TabsTrigger>
          <TabsTrigger value="documentos">Documentos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="fases" className="space-y-6">
          {/* Fase Interna */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />Fase Interna (Preparatória)
                  </CardTitle>
                  <CardDescription>Art. 18 da Lei 14.133/2021</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {licitacao.fase_interna_concluida ? (
                    <Badge className="bg-green-100 text-green-800">
                      <Check className="w-4 h-4 mr-1" /> Concluída
                    </Badge>
                  ) : (
                    <Link href={`/orgao/licitacoes/${licitacao.id}/fase-interna`}>
                      <Button size="sm"><Settings className="mr-2 h-4 w-4" /> Gerenciar</Button>
                    </Link>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                {FASES_INTERNAS.map((fase, index) => {
                  const Icon = fase.icon
                  const isConcluida = licitacao.fase_interna_concluida
                  return (
                    <div key={fase.id} className="flex items-center">
                      <div className={`flex flex-col items-center ${isConcluida ? 'text-green-600' : 'text-slate-400'}`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isConcluida ? 'bg-green-100' : 'bg-slate-100'}`}>
                          {isConcluida ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                        </div>
                        <span className="text-xs mt-1 text-center max-w-[80px]">{fase.label}</span>
                      </div>
                      {index < FASES_INTERNAS.length - 1 && (
                        <div className={`w-12 h-1 mx-2 ${isConcluida ? 'bg-green-400' : 'bg-slate-200'}`} />
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* Fase Externa */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Gavel className="h-5 w-5" />Fase Externa</CardTitle>
                  <CardDescription>Processo licitatório</CardDescription>
                </div>
                <Badge className="bg-blue-100 text-blue-800">
                  {FASES_EXTERNAS.find(f => f.id === licitacao.fase)?.label || licitacao.fase}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Progresso</span>
                  <span>{Math.round(progressoFaseExterna())}%</span>
                </div>
                <Progress value={progressoFaseExterna()} className="h-2" />
              </div>
              <div className="grid grid-cols-5 gap-2">
                {FASES_EXTERNAS.map((fase) => {
                  const Icon = fase.icon
                  const faseIndex = getFaseIndex(fase.id)
                  const faseAtualIndex = getFaseIndex(licitacao.fase)
                  const isConcluida = faseIndex < faseAtualIndex
                  const isAtual = faseIndex === faseAtualIndex
                  return (
                    <div key={fase.id} className={`p-3 rounded-lg border text-center ${
                      isAtual ? 'border-blue-500 bg-blue-50' : isConcluida ? 'border-green-300 bg-green-50' : 'border-slate-200 bg-slate-50'
                    }`}>
                      <div className={`w-8 h-8 mx-auto rounded-full flex items-center justify-center mb-1 ${
                        isAtual ? 'bg-blue-500 text-white' : isConcluida ? 'bg-green-500 text-white' : 'bg-slate-200 text-slate-500'
                      }`}>
                        {isConcluida ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                      </div>
                      <p className={`text-xs font-medium ${isAtual ? 'text-blue-700' : isConcluida ? 'text-green-700' : 'text-slate-500'}`}>
                        {fase.label}
                      </p>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="documentos">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Documentos do Processo</CardTitle>
                <Link href={`/orgao/licitacoes/${licitacao.id}/fase-interna`}>
                  <Button size="sm"><Upload className="mr-2 h-4 w-4" /> Gerenciar Documentos</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {documentos.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">Nenhum documento cadastrado</p>
              ) : (
                <div className="space-y-3">
                  {documentos.map((doc) => {
                    const statusConfig = getStatusDocumento(doc.status)
                    const StatusIcon = statusConfig.icon
                    return (
                      <div key={doc.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 rounded flex items-center justify-center">
                            <FileText className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium">{doc.titulo}</p>
                            <p className="text-sm text-muted-foreground">Tipo: {doc.tipo}</p>
                          </div>
                        </div>
                        <Badge className={statusConfig.className}>
                          <StatusIcon className="w-3 h-3 mr-1" />{statusConfig.label}
                        </Badge>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="historico">
          <Card>
            <CardHeader><CardTitle>Histórico do Processo</CardTitle></CardHeader>
            <CardContent>
              <p className="text-center py-8 text-muted-foreground">Histórico será exibido aqui</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
