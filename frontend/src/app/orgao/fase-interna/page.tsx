"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  FileText, Clock, CheckCircle2, DollarSign, AlertTriangle,
  Sparkles, Plus, ArrowRight, ArrowUpRight, Flag, TrendingUp,
  Home, ChevronRight, Loader2, RefreshCw
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { API_URL, authFetch } from "@/lib/api"

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  fase: string
  valor_total_estimado: number | string
  created_at: string
  updated_at: string
}

interface AlertaIA {
  tipo: "aviso" | "sugestao" | "risco"
  titulo: string
  descricao: string
}

const FASES_INTERNAS = ["PLANEJAMENTO", "TERMO_REFERENCIA", "PESQUISA_PRECOS", "ANALISE_JURIDICA", "APROVACAO_INTERNA"]

const FASE_LABELS: Record<string, string> = {
  PLANEJAMENTO: "Planejamento",
  TERMO_REFERENCIA: "Termo de Referência",
  PESQUISA_PRECOS: "Pesquisa de Preços",
  ANALISE_JURIDICA: "Análise Jurídica",
  APROVACAO_INTERNA: "Aprovação Interna",
}

const FASE_PROGRESSO: Record<string, number> = {
  PLANEJAMENTO: 1,
  TERMO_REFERENCIA: 2,
  PESQUISA_PRECOS: 3,
  ANALISE_JURIDICA: 4,
  APROVACAO_INTERNA: 5,
}

const FASE_COR: Record<string, { bg: string; text: string }> = {
  PLANEJAMENTO: { bg: "bg-blue-50", text: "text-blue-700" },
  TERMO_REFERENCIA: { bg: "bg-purple-50", text: "text-purple-700" },
  PESQUISA_PRECOS: { bg: "bg-yellow-50", text: "text-yellow-700" },
  ANALISE_JURIDICA: { bg: "bg-orange-50", text: "text-orange-700" },
  APROVACAO_INTERNA: { bg: "bg-green-50", text: "text-green-700" },
}

function fmtMoeda(v: number | string) {
  const n = typeof v === "string" ? parseFloat(v) : v
  if (!n || isNaN(n)) return "—"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

const ALERTA_STYLE: Record<AlertaIA["tipo"], { bg: string; border: string; icon: any; iconColor: string; titleColor: string }> = {
  aviso: { bg: "bg-yellow-50", border: "border-yellow-100", icon: AlertTriangle, iconColor: "text-yellow-600", titleColor: "text-yellow-800" },
  sugestao: { bg: "bg-blue-50", border: "border-blue-100", icon: Sparkles, iconColor: "text-[#1351b4]", titleColor: "text-blue-900" },
  risco: { bg: "bg-red-50", border: "border-red-100", icon: Flag, iconColor: "text-red-500", titleColor: "text-red-800" },
}

export default function FaseInternaDashboard() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [alertas, setAlertas] = useState<AlertaIA[]>([])
  const [gerandoAlertas, setGerandoAlertas] = useState(false)

  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes?limit=50`)
      if (res.ok) {
        const dados = await res.json()
        const lista = Array.isArray(dados) ? dados : (dados.data || dados.items || [])
        const fasesInternas = lista.filter((l: Licitacao) => FASES_INTERNAS.includes(l.fase))
        setLicitacoes(fasesInternas)
        gerarAlertasIA(fasesInternas)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregarDados() }, [carregarDados])

  const gerarAlertasIA = async (processos: Licitacao[]) => {
    setGerandoAlertas(true)
    setAlertas([])
    try {
      const resumo = processos.map((l) =>
        `- Processo ${l.numero_processo || l.id.slice(0, 8)}: "${l.objeto}" — fase: ${FASE_LABELS[l.fase] || l.fase}`
      ).join("\n")

      const res = await authFetch(`${API_URL}/api/ia/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: processos.length > 0
              ? `Analise os processos licitatórios abaixo e gere 3 alertas relevantes para o gestor, conforme a Lei 14.133/2021. Para cada alerta, classifique como "aviso", "sugestao" ou "risco". Retorne JSON: [{tipo, titulo, descricao}]\n\nProcessos:\n${resumo}`
              : `Gere 3 alertas gerais para um gestor de licitações que está iniciando a fase interna, conforme a Lei 14.133/2021. Para cada alerta, classifique como "aviso", "sugestao" ou "risco". Retorne JSON: [{tipo, titulo, descricao}]`,
          }],
          system: "Você é o Procura+ AI, especialista na Lei nº 14.133/2021. Responda apenas com o JSON solicitado, sem texto adicional.",
          max_tokens: 600,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const texto = data.content?.[0]?.text || ""
        const jsonMatch = texto.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const parsed: AlertaIA[] = JSON.parse(jsonMatch[0])
          setAlertas(parsed.slice(0, 3))
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setGerandoAlertas(false)
    }
  }

  const total = licitacoes.length
  const emAndamento = licitacoes.filter((l) => l.fase !== "APROVACAO_INTERNA").length
  const emAprovacao = licitacoes.filter((l) => l.fase === "APROVACAO_INTERNA").length
  const valorTotal = licitacoes.reduce((acc, l) => acc + (parseFloat(String(l.valor_total_estimado)) || 0), 0)
  const prioritarios = [...licitacoes].slice(0, 5)

  return (
    <div className="p-6 pb-10 max-w-6xl">
      {/* Breadcrumb + Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
            <Home className="w-3.5 h-3.5" />
            <ChevronRight className="w-3 h-3" />
            <span className="text-[#1351b4] font-medium">Fase Interna</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Painel de processos licitatórios</h1>
          <p className="text-sm text-gray-500 mt-1">Visão geral da fase interna · Lei nº 14.133/2021</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="text-gray-600">
            Exportar
          </Button>
          <Link href="/orgao/fase-interna/processos/novo">
            <Button className="bg-[#1351b4] hover:bg-[#0c326f] rounded-full">
              <Plus className="w-4 h-4 mr-2" />
              Novo processo
            </Button>
          </Link>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Processos em fase interna</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{carregando ? "—" : total}</p>
                <p className="text-xs text-[#168821] mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Fase preparatória
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#ecf3fc] flex items-center justify-center">
                <FileText className="w-5 h-5 text-[#1351b4]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Em andamento</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{carregando ? "—" : emAndamento}</p>
                <p className="text-xs text-gray-400 mt-1">Elaboração de documentos</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-yellow-50 flex items-center justify-center">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Em aprovação</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{carregando ? "—" : emAprovacao}</p>
                <p className="text-xs text-[#168821] mt-1 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Aguardando assinatura
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Valor estimado total</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{carregando ? "—" : fmtMoeda(valorTotal)}</p>
                <p className="text-xs text-gray-400 mt-1">{total} processos</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Grid 2 colunas */}
      <div className="grid grid-cols-[1.6fr_1fr] gap-5">
        {/* Processos prioritários */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-800">Processos em andamento</CardTitle>
              <Link href="/orgao/fase-interna/processos">
                <Button variant="ghost" size="sm" className="text-[#1351b4] text-xs h-7">
                  Ver todos <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {carregando ? (
              <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
              </div>
            ) : prioritarios.length === 0 ? (
              <div className="py-12 text-center">
                <FileText className="w-8 h-8 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500">Nenhum processo em fase interna</p>
                <Link href="/orgao/fase-interna/processos/novo" className="mt-3 inline-block">
                  <Button size="sm" className="bg-[#1351b4] hover:bg-[#0c326f] mt-3">
                    <Plus className="w-3 h-3 mr-1" /> Criar primeiro processo
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {prioritarios.map((l) => {
                  const progresso = FASE_PROGRESSO[l.fase] || 1
                  const cor = FASE_COR[l.fase] || { bg: "bg-gray-50", text: "text-gray-700" }
                  return (
                    <Link
                      key={l.id}
                      href={`/orgao/fase-interna/processos/${l.id}`}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50/80 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-gray-900">{l.numero_processo || `#${l.id.slice(0, 8)}`}</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cor.bg} ${cor.text}`}>
                            {FASE_LABELS[l.fase] || l.fase}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 truncate">{l.objeto}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <Progress value={(progresso / 5) * 100} className="h-1.5 flex-1" />
                          <span className="text-[10px] text-gray-400 shrink-0">{progresso}/5 etapas</span>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-[#1351b4] transition-colors shrink-0" />
                    </Link>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Alertas + Atalhos */}
        <div className="space-y-4">
          {/* Alertas da IA */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-[#1351b4]" />
                  Alertas da IA
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                    Procura+ AI
                  </span>
                  <button
                    onClick={() => gerarAlertasIA(licitacoes)}
                    disabled={gerandoAlertas}
                    className="text-gray-400 hover:text-[#1351b4] transition-colors"
                    title="Atualizar alertas"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${gerandoAlertas ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {gerandoAlertas && alertas.length === 0 && (
                <div className="py-6 text-center text-xs text-gray-400 flex items-center justify-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando processos…
                </div>
              )}
              {alertas.map((alerta, idx) => {
                const style = ALERTA_STYLE[alerta.tipo]
                const Icon = style.icon
                return (
                  <div key={idx} className={`flex gap-2.5 p-3 rounded-lg border ${style.bg} ${style.border}`}>
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${style.iconColor}`} />
                    <div>
                      <p className={`text-xs font-semibold ${style.titleColor}`}>{alerta.titulo}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{alerta.descricao}</p>
                    </div>
                  </div>
                )
              })}
              {!gerandoAlertas && alertas.length === 0 && (
                <div className="py-4 text-center text-xs text-gray-400">
                  Nenhum alerta gerado.
                </div>
              )}
            </CardContent>
          </Card>

          {/* Atalhos */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-gray-800">Ações rápidas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <Link href="/orgao/fase-interna/processos/novo">
                <Button variant="outline" className="w-full justify-start text-sm h-9 border-[#c5d4eb] text-[#1351b4] hover:bg-[#ecf3fc]">
                  <Plus className="w-4 h-4 mr-2" />
                  Iniciar novo processo
                </Button>
              </Link>
              <Link href="/orgao/fase-interna/aprovacoes">
                <Button variant="outline" className="w-full justify-start text-sm h-9 border-gray-200">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                  Processos em aprovação
                </Button>
              </Link>
              <Link href="/orgao/licitacoes">
                <Button variant="outline" className="w-full justify-start text-sm h-9 border-gray-200">
                  <ArrowUpRight className="w-4 h-4 mr-2 text-gray-500" />
                  Ver todas as licitações
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
