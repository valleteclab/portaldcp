"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, FileText, AlertTriangle, Check, Clock, Users,
  Home, ChevronRight, Sparkles, ExternalLink, Download,
  PenLine, BarChart2, Search, CheckSquare, Loader2
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { ProcessoTimeline, EtapaTimeline, ETAPAS_FASE_INTERNA } from "@/components/fase-interna/ProcessoTimeline"
import { API_URL, authFetch } from "@/lib/api"

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  fase: string
  modalidade: string
  valor_total_estimado: number | string
  created_at: string
  fase_interna_concluida?: boolean
}

interface Documento {
  id: string
  tipo: string
  titulo: string
  status: string
  created_at: string
}

const FASE_PARA_ETAPA: Record<string, string> = {
  PLANEJAMENTO: "dfd",
  TERMO_REFERENCIA: "tr",
  PESQUISA_PRECOS: "pp",
  ANALISE_JURIDICA: "pj",
  APROVACAO_INTERNA: "aut",
}

function fmtMoeda(v: number | string) {
  const n = typeof v === "string" ? parseFloat(v) : v
  if (!n || isNaN(n)) return "—"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

export default function ProcessoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [licitacao, setLicitacao] = useState<Licitacao | null>(null)
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    carregarDados()
  }, [id])

  const carregarDados = async () => {
    setCarregando(true)
    try {
      const [resLic, resDocs] = await Promise.all([
        authFetch(`${API_URL}/api/licitacoes/${id}`),
        authFetch(`${API_URL}/api/fase-interna/${id}/documentos`),
      ])
      if (resLic.ok) setLicitacao(await resLic.json())
      if (resDocs.ok) setDocumentos(await resDocs.json())
    } catch (e) {
      console.error(e)
    } finally {
      setCarregando(false)
    }
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-[#1351b4]" />
      </div>
    )
  }

  if (!licitacao) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Processo não encontrado.</p>
        <Link href="/orgao/fase-interna/processos">
          <Button variant="outline" className="mt-4">Voltar à lista</Button>
        </Link>
      </div>
    )
  }

  // Montar etapas com status baseado na fase atual
  const faseAtual = licitacao.fase
  const etapaAtualId = FASE_PARA_ETAPA[faseAtual] || "dfd"
  const etapas: EtapaTimeline[] = ETAPAS_FASE_INTERNA.map((e) => {
    const etapasOrdem = ["dfd", "etp", "mr", "pp", "tr", "aut", "ed", "pj"]
    const idxAtual = etapasOrdem.indexOf(etapaAtualId)
    const idxEtapa = etapasOrdem.indexOf(e.id)
    const status: EtapaTimeline["status"] =
      idxEtapa < idxAtual ? "concluida" :
      idxEtapa === idxAtual ? "em_andamento" : "pendente"
    return { ...e, status }
  })

  const tiposDocAnexados = documentos.map((d) => d.tipo)
  const progresso = etapas.filter((e) => e.status === "concluida").length

  return (
    <div className="p-6 pb-10 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Home className="w-3.5 h-3.5" />
        <ChevronRight className="w-3 h-3" />
        <Link href="/orgao/fase-interna" className="hover:text-[#1351b4]">Fase Interna</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/orgao/fase-interna/processos" className="hover:text-[#1351b4]">Processos</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#1351b4] font-medium">{licitacao.numero_processo || `#${id.slice(0, 8)}`}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-xl font-bold text-gray-900">{licitacao.numero_processo || `Processo #${id.slice(0, 8)}`}</h1>
            <Badge variant="secondary" className="bg-[#ecf3fc] text-[#1351b4] text-xs">{licitacao.fase?.replace(/_/g, " ")}</Badge>
          </div>
          <p className="text-sm text-gray-600 mt-0.5 max-w-2xl">{licitacao.objeto}</p>
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
            <span>Modalidade: <strong>{licitacao.modalidade?.replace(/_/g, " ") || "—"}</strong></span>
            <span>Valor estimado: <strong>{fmtMoeda(licitacao.valor_total_estimado)}</strong></span>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <Link href={`/orgao/licitacoes/${id}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
              Ver licitação
            </Button>
          </Link>
          <Link href={`/orgao/licitacoes/${id}/fase-interna`}>
            <Button size="sm" className="bg-[#1351b4] hover:bg-[#0c326f]">
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Gerenciar documentos
            </Button>
          </Link>
        </div>
      </div>

      {/* Progresso geral */}
      <Card className="border-0 shadow-sm mb-5">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Progresso da fase interna</h3>
            <span className="text-sm font-bold text-[#1351b4]">{progresso}/8 etapas</span>
          </div>
          <Progress value={(progresso / 8) * 100} className="h-2 mb-4" />
          <ProcessoTimeline
            etapas={etapas}
            onEtapaClick={(etapa) => {
              if (etapa.id === "mr") router.push(`/orgao/fase-interna/processos/${id}/riscos`)
              else if (etapa.id === "pp") router.push(`/orgao/fase-interna/processos/${id}/precos`)
              else router.push(`/orgao/fase-interna/processos/${id}/editor`)
            }}
          />
        </CardContent>
      </Card>

      {/* Grid: documentos + conformidade + ações */}
      <div className="grid grid-cols-[1fr_320px] gap-5">
        {/* Documentos */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Documentos da fase interna</CardTitle>
              <Link href={`/orgao/licitacoes/${id}/fase-interna`}>
                <Button variant="ghost" size="sm" className="text-[#1351b4] text-xs h-7">
                  Gerenciar <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {documentos.length === 0 ? (
              <div className="py-10 text-center">
                <FileText className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Nenhum documento anexado ainda.</p>
                <Link href={`/orgao/licitacoes/${id}/fase-interna`}>
                  <Button size="sm" variant="outline" className="mt-3">Adicionar documento</Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {documentos.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-lg bg-[#ecf3fc] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4 text-[#1351b4]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#1351b4]">{doc.tipo}</span>
                        <span className="text-sm font-medium text-gray-800 truncate">{doc.titulo}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        {new Date(doc.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <Badge
                      variant={doc.status === "APROVADO" ? "default" : "secondary"}
                      className={doc.status === "APROVADO" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}
                    >
                      {doc.status?.replace(/_/g, " ") || "—"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Ações rápidas */}
        <div className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Ações desta fase</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link href={`/orgao/fase-interna/processos/${id}/editor`}>
                <Button variant="outline" className="w-full justify-start text-sm h-9 border-gray-200">
                  <PenLine className="w-4 h-4 mr-2 text-[#1351b4]" />
                  Editar documentos
                </Button>
              </Link>
              <Link href={`/orgao/fase-interna/processos/${id}/riscos`}>
                <Button variant="outline" className="w-full justify-start text-sm h-9 border-gray-200">
                  <AlertTriangle className="w-4 h-4 mr-2 text-yellow-500" />
                  Mapa de riscos
                </Button>
              </Link>
              <Link href={`/orgao/fase-interna/processos/${id}/precos`}>
                <Button variant="outline" className="w-full justify-start text-sm h-9 border-gray-200">
                  <Search className="w-4 h-4 mr-2 text-green-600" />
                  Pesquisa de preços
                </Button>
              </Link>
              <Link href="/orgao/fase-interna/aprovacoes">
                <Button variant="outline" className="w-full justify-start text-sm h-9 border-gray-200">
                  <CheckSquare className="w-4 h-4 mr-2 text-purple-600" />
                  Fluxo de aprovação
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#1351b4]" />
                Conformidade IA
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-600">Lei 14.133/2021</span>
                <span className="text-sm font-bold text-[#168821]">
                  {documentos.length > 0 ? `${Math.min(40 + documentos.length * 10, 95)}%` : "—"}
                </span>
              </div>
              {documentos.length > 0 && (
                <Progress value={Math.min(40 + documentos.length * 10, 95)} className="h-2 mb-3" />
              )}
              <div className="space-y-1.5">
                {["Objeto definido (Art. 6º, XXIII)", "ETP elaborado (Art. 18, §1º)"].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-xs text-gray-600">
                    <Check className="w-3 h-3 text-green-500" />
                    {item}
                  </div>
                ))}
                <div className="flex items-center gap-2 text-xs text-yellow-600">
                  <AlertTriangle className="w-3 h-3" />
                  Pesquisa de preços pendente
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
