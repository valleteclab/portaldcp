"use client"

import { useState, useEffect, useCallback, type ReactElement } from "react"
import Link from "next/link"
import {
  FileText, Clock, CheckCircle2, DollarSign,
  Sparkles, Plus, ArrowRight, AlertTriangle, Flag, TrendingUp,
  Home, ChevronRight, Loader2, RefreshCw,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { API_URL, authFetch } from "@/lib/api"

// ─── Types ────────────────────────────────────────────────────────────────────

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  fase: string
  valor_total_estimado: number | string
  prazo?: string
  created_at?: string
  updated_at?: string
}

interface AlertaIA {
  tipo: "warn" | "info" | "danger"
  titulo: string
  descricao: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const FASES_INTERNAS = [
  "PLANEJAMENTO",
  "TERMO_REFERENCIA",
  "PESQUISA_PRECOS",
  "ANALISE_JURIDICA",
  "APROVACAO_INTERNA",
]

const MOCK: Licitacao[] = [
  { id: "1", numero_processo: "2026/0142", objeto: "Aquisição de licenças de GED", fase: "ANALISE_JURIDICA", valor_total_estimado: 1095000, prazo: "2026-05-20" },
  { id: "2", numero_processo: "2026/0138", objeto: "Serviços de limpeza e conservação predial", fase: "APROVACAO_INTERNA", valor_total_estimado: 480000, prazo: "2026-05-12" },
  { id: "3", numero_processo: "2026/0151", objeto: "Fornecimento de combustível — frota municipal", fase: "PESQUISA_PRECOS", valor_total_estimado: 320000, prazo: "2026-05-08" },
  { id: "4", numero_processo: "2026/0155", objeto: "Aquisição de microcomputadores e periféricos", fase: "TERMO_REFERENCIA", valor_total_estimado: 295000, prazo: "2026-06-01" },
]

// Maps fase → { sigla, nome, progresso (1-8), status }
const FASE_MAP: Record<string, { sigla: string; nome: string; progresso: number; status: string }> = {
  PLANEJAMENTO:      { sigla: "DFD", nome: "Formalização da Demanda",   progresso: 1, status: "rascunho" },
  TERMO_REFERENCIA:  { sigla: "ETP", nome: "Estudo Técnico Preliminar",  progresso: 2, status: "andamento" },
  PESQUISA_PRECOS:   { sigla: "PP",  nome: "Pesquisa de Preços",         progresso: 3, status: "andamento" },
  ANALISE_JURIDICA:  { sigla: "TR",  nome: "Termo de Referência",        progresso: 5, status: "juridico" },
  APROVACAO_INTERNA: { sigla: "PJ",  nome: "Parecer Jurídico",           progresso: 7, status: "revisao" },
}

// Status chip colors
const STATUS_CHIP: Record<string, { bg: string; text: string }> = {
  rascunho:  { bg: "bg-[#f3f4f6]", text: "text-gray-600" },
  andamento: { bg: "bg-[#dbe8fb]", text: "text-[#1351b4]" },
  juridico:  { bg: "bg-[#efe7fd]", text: "text-purple-700" },
  revisao:   { bg: "bg-[#fff5d9]", text: "text-yellow-700" },
  aprovado:  { bg: "bg-[#e3f5e1]", text: "text-[#168821]" },
  concluido: { bg: "bg-[#e3f5e1]", text: "text-[#168821]" },
}

// IA alert styles
type IconComponent = (props: { className?: string }) => ReactElement | null
const ALERTA_STYLE: Record<AlertaIA["tipo"], {
  bg: string; border: string; icon: IconComponent; iconColor: string; titleColor: string
}> = {
  warn:   { bg: "bg-yellow-50", border: "border-yellow-100", icon: AlertTriangle, iconColor: "text-yellow-600", titleColor: "text-yellow-800" },
  info:   { bg: "bg-blue-50",   border: "border-blue-100",   icon: Sparkles,      iconColor: "text-[#1351b4]",  titleColor: "text-blue-900" },
  danger: { bg: "bg-red-50",    border: "border-red-100",    icon: Flag,          iconColor: "text-red-500",    titleColor: "text-red-800" },
}

// Recent activity (static)
const ATIVIDADES = [
  { acao: "Você editou",            alvo: "TR — seção 4. Requisitos",        tempo: "agora" },
  { acao: "Procuradoria aprovou",   alvo: "Parecer jurídico — 2026/0138",    tempo: "2h" },
  { acao: "Procura+ AI gerou",      alvo: "Mapa de Riscos — rascunho",       tempo: "4h" },
  { acao: "Ricardo T. comentou em", alvo: "ETP — 2026/0151",                 tempo: "ontem" },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoeda(v: number | string) {
  const n = typeof v === "string" ? parseFloat(v) : v
  if (!n || isNaN(n)) return "—"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtData(iso?: string) {
  if (!iso) return "—"
  const d = new Date(iso + "T00:00:00")
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

function diasRestantes(iso?: string): number | null {
  if (!iso) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const prazo = new Date(iso + "T00:00:00")
  return Math.ceil((prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function FaseInternaDashboard() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [alertas, setAlertas] = useState<AlertaIA[]>([])
  const [gerandoAlertas, setGerandoAlertas] = useState(false)

  // ── IA alerts ────────────────────────────────────────────────────────────────

  const gerarAlertasIA = useCallback(async (processos: Licitacao[]) => {
    setGerandoAlertas(true)
    setAlertas([])
    try {
      const resumo = processos.map((l) => {
        const m = FASE_MAP[l.fase]
        return `- Processo ${l.numero_processo}: "${l.objeto}" — fase: ${m?.nome ?? l.fase}, prazo: ${l.prazo ?? "não informado"}, valor: ${fmtMoeda(l.valor_total_estimado)}`
      }).join("\n")

      const prompt =
        `Analise estes processos licitatórios em fase interna e gere 3 alertas para o gestor conforme Lei 14.133/2021. Retorne APENAS JSON: [{"tipo":"warn"|"info"|"danger","titulo":"...","descricao":"..."}]\n\nProcessos:\n${resumo}`

      const res = await authFetch(`${API_URL}/api/ia/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagens: [{ role: "user", content: prompt }],
          tipoDocumento: "alertas_dashboard",
        }),
      })

      if (res.ok) {
        const data = await res.json()
        const texto: string = data.resposta ?? data.content ?? ""
        const match = texto.match(/\[[\s\S]*\]/)
        if (match) {
          const parsed: AlertaIA[] = JSON.parse(match[0])
          setAlertas(parsed.slice(0, 3))
        }
      }
    } catch (e) {
      console.error("Erro ao gerar alertas IA:", e)
    } finally {
      setGerandoAlertas(false)
    }
  }, [])

  // ── Data loading ─────────────────────────────────────────────────────────────

  const carregarDados = useCallback(async () => {
    setCarregando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes?limit=50`)
      if (res.ok) {
        const dados = await res.json()
        const lista: Licitacao[] = Array.isArray(dados) ? dados : (dados.data ?? dados.items ?? [])
        const internas = lista.filter((l) => FASES_INTERNAS.includes(l.fase))
        const final = internas.length > 0 ? internas : MOCK
        setLicitacoes(final)
        gerarAlertasIA(final)
        return
      }
    } catch (e) {
      console.error("Erro ao carregar licitações:", e)
    }
    // fallback to mock
    setLicitacoes(MOCK)
    gerarAlertasIA(MOCK)
  }, [gerarAlertasIA])

  useEffect(() => {
    carregarDados().finally(() => setCarregando(false))
  }, [carregarDados])

  // ── Derived stats ─────────────────────────────────────────────────────────────

  const total = licitacoes.length
  const emAndamento = licitacoes.filter((l) =>
    ["PLANEJAMENTO", "TERMO_REFERENCIA", "PESQUISA_PRECOS"].includes(l.fase)
  ).length
  const pendentes = licitacoes.filter((l) => {
    const dias = diasRestantes(l.prazo)
    return dias !== null && dias <= 7
  }).length
  const aprovadosMes = licitacoes.filter((l) => l.fase === "APROVACAO_INTERNA").length
  const valorTotal = licitacoes.reduce(
    (acc, l) => acc + (parseFloat(String(l.valor_total_estimado)) || 0),
    0
  )
  const prioritarios = licitacoes.slice(0, 5)
  const prazosCriticos = licitacoes.filter((l) => {
    const d = diasRestantes(l.prazo)
    return d !== null && d < 14
  }).length

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 pb-10 max-w-screen-xl">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          {/* Breadcrumb */}
          <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
            <Home className="w-3.5 h-3.5" />
            <span>Home</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[#1351b4] font-medium">Fase Interna</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Painel de processos licitatórios</h1>
          <p className="text-sm text-gray-500 mt-1">Visão geral da fase interna · Lei nº 14.133/2021</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="text-gray-600 border border-gray-200">
            Exportar
          </Button>
          <Link href="/orgao/fase-interna/processos/novo">
            <Button className="bg-[#1351b4] hover:bg-[#0c326f] text-white rounded-full">
              <Plus className="w-4 h-4 mr-1.5" />
              Novo processo
            </Button>
          </Link>
        </div>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4 mb-8">

        {/* 1. Processos ativos */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Processos ativos</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{carregando ? "—" : total}</p>
                <p className="text-xs text-[#168821] mt-1.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  +12% vs. trimestre anterior
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#dbe8fb] flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-[#1351b4]" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Em andamento */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Em andamento</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">
                  {carregando ? "—" : emAndamento}
                  {!carregando && pendentes > 0 && (
                    <span className="text-lg text-gray-400 font-normal ml-1">/{pendentes}</span>
                  )}
                </p>
                <p className="text-xs text-gray-400 mt-1.5">
                  {!carregando && `${prazosCriticos} com prazo crítico`}
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#fff5d9] flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 3. Aprovados este mês */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Aprovados este mês</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{carregando ? "—" : aprovadosMes}</p>
                <p className="text-xs text-[#168821] mt-1.5 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  +2 a mais que abril
                </p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#e3f5e1] flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5 text-[#168821]" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 4. Valor estimado total */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Valor estimado total</p>
                <p className="text-xl font-bold text-gray-900 mt-1 leading-tight">
                  {carregando ? "—" : fmtMoeda(valorTotal)}
                </p>
                <p className="text-xs text-gray-400 mt-1.5">{total} processos</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-[#efe7fd] flex items-center justify-center shrink-0">
                <DollarSign className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Main grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-[1.6fr_1fr] gap-20">

        {/* LEFT: Processos prioritários */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-800">Processos prioritários</CardTitle>
              <Link
                href="/orgao/fase-interna/processos"
                className="text-xs text-[#1351b4] hover:underline flex items-center gap-0.5"
              >
                Ver todos <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0 pt-1">
            {carregando ? (
              <div className="py-12 flex items-center justify-center gap-2 text-sm text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando…
              </div>
            ) : (
              <>
                {/* Table header */}
                <div className="grid grid-cols-[2fr_1.4fr_1fr_1fr_auto] gap-3 px-4 py-2 text-[11px] font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                  <span>Processo</span>
                  <span>Etapa atual</span>
                  <span>Progresso</span>
                  <span>Prazo</span>
                  <span>Status</span>
                </div>

                {/* Table rows */}
                <div className="divide-y divide-gray-50">
                  {prioritarios.map((l) => {
                    const m = FASE_MAP[l.fase] ?? { sigla: "?", nome: l.fase, progresso: 1, status: "rascunho" }
                    const chip = STATUS_CHIP[m.status] ?? STATUS_CHIP.rascunho
                    const dias = diasRestantes(l.prazo)
                    const prazoUrgente = dias !== null && dias < 14

                    return (
                      <Link
                        key={l.id}
                        href={`/orgao/fase-interna/processos/${l.id}`}
                        className="grid grid-cols-[2fr_1.4fr_1fr_1fr_auto] gap-3 items-center px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        {/* Processo */}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900">{l.numero_processo}</p>
                          <p className="text-[11px] text-gray-500 truncate">{l.objeto}</p>
                        </div>

                        {/* Etapa atual */}
                        <div>
                          <p className="text-[11px] font-bold text-gray-800">{m.sigla}</p>
                          <p className="text-[11px] text-gray-400">{m.nome}</p>
                        </div>

                        {/* Progresso */}
                        <div className="flex flex-col gap-1">
                          <Progress value={(m.progresso / 8) * 100} className="h-1" />
                          <span className="text-[10px] text-gray-400">{m.progresso}/8 etapas</span>
                        </div>

                        {/* Prazo */}
                        <div>
                          <p className="text-[11px] text-gray-700">{fmtData(l.prazo)}</p>
                          {dias !== null && (
                            <p className={`text-[10px] font-medium ${prazoUrgente ? "text-red-500" : "text-gray-400"}`}>
                              {dias < 0 ? `${Math.abs(dias)}d vencido` : `${dias}d restantes`}
                            </p>
                          )}
                        </div>

                        {/* Status chip */}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${chip.bg} ${chip.text}`}>
                          {m.status}
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* RIGHT: vstack gap-16 */}
        <div className="flex flex-col gap-16">

          {/* Alertas da IA */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-[#1351b4]" />
                  Alertas da IA
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold bg-[#fff5d9] text-yellow-700 px-2 py-0.5 rounded-full">
                    {gerandoAlertas ? "…" : `${alertas.length} ativos`}
                  </span>
                  <button
                    onClick={() => gerarAlertasIA(licitacoes)}
                    disabled={gerandoAlertas}
                    className="text-gray-400 hover:text-[#1351b4] transition-colors disabled:opacity-40"
                    title="Regenerar alertas"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${gerandoAlertas ? "animate-spin" : ""}`} />
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-0">
              {gerandoAlertas && alertas.length === 0 && (
                <div className="py-6 flex items-center justify-center gap-2 text-xs text-gray-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analisando processos…
                </div>
              )}
              {alertas.map((alerta, idx) => {
                const s = ALERTA_STYLE[alerta.tipo] ?? ALERTA_STYLE.info
                const Icon = s.icon
                return (
                  <div key={idx} className={`flex gap-2.5 p-3 rounded-lg border ${s.bg} ${s.border}`}>
                    <Icon className={`w-4 h-4 shrink-0 mt-0.5 ${s.iconColor}`} />
                    <div>
                      <p className={`text-xs font-semibold ${s.titleColor}`}>{alerta.titulo}</p>
                      <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{alerta.descricao}</p>
                    </div>
                  </div>
                )
              })}
              {!gerandoAlertas && alertas.length === 0 && (
                <p className="py-4 text-center text-xs text-gray-400">Nenhum alerta gerado.</p>
              )}
            </CardContent>
          </Card>

          {/* Atividade recente */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold text-gray-800">Atividade recente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              {ATIVIDADES.map((a, idx) => (
                <div key={idx} className="flex items-start gap-2.5">
                  <div className="w-6 h-6 rounded bg-[#dbe8fb] flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-3 h-3 text-[#1351b4]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-700 leading-snug">
                      <span className="font-semibold">{a.acao}</span>{" "}
                      {a.alvo}
                    </p>
                  </div>
                  <span className="text-[11px] text-gray-400 shrink-0">{a.tempo}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
