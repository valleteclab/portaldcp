"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Search, Plus, FileText, ChevronRight, Home, Filter } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { API_URL, authFetch } from "@/lib/api"

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  fase: string
  modalidade: string
  valor_total_estimado: number | string
  created_at: string
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

const FASE_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  PLANEJAMENTO: "secondary",
  TERMO_REFERENCIA: "secondary",
  PESQUISA_PRECOS: "secondary",
  ANALISE_JURIDICA: "secondary",
  APROVACAO_INTERNA: "default",
}

function fmtMoeda(v: number | string) {
  const n = typeof v === "string" ? parseFloat(v) : v
  if (!n || isNaN(n)) return "—"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtData(d: string) {
  return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

export default function ProcessosPage() {
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState("")
  const [filtroFase, setFiltroFase] = useState("todas")

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setCarregando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes?limit=100`)
      if (res.ok) {
        const dados = await res.json()
        const lista = Array.isArray(dados) ? dados : (dados.data || dados.items || [])
        setLicitacoes(lista.filter((l: Licitacao) => FASES_INTERNAS.includes(l.fase)))
      }
    } catch (e) {
      console.error(e)
    } finally {
      setCarregando(false)
    }
  }

  const filtradas = licitacoes.filter((l) => {
    const matchBusca =
      !busca ||
      l.numero_processo?.toLowerCase().includes(busca.toLowerCase()) ||
      l.objeto?.toLowerCase().includes(busca.toLowerCase())
    const matchFase = filtroFase === "todas" || l.fase === filtroFase
    return matchBusca && matchFase
  })

  return (
    <div className="p-6 pb-10 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-2">
            <Home className="w-3.5 h-3.5" />
            <ChevronRight className="w-3 h-3" />
            <Link href="/orgao/fase-interna" className="hover:text-[#1351b4]">Fase Interna</Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-[#1351b4] font-medium">Processos</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Processos em fase interna</h1>
          <p className="text-sm text-gray-500 mt-1">
            {carregando ? "Carregando..." : `${filtradas.length} processos encontrados`}
          </p>
        </div>
        <Link href="/orgao/fase-interna/processos/novo">
          <Button className="bg-[#1351b4] hover:bg-[#0c326f] rounded-full">
            <Plus className="w-4 h-4 mr-2" />
            Novo processo
          </Button>
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="Buscar por número ou objeto…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>
        <Select value={filtroFase} onValueChange={setFiltroFase}>
          <SelectTrigger className="w-52 bg-white">
            <Filter className="w-4 h-4 mr-2 text-gray-400" />
            <SelectValue placeholder="Filtrar por etapa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas as etapas</SelectItem>
            {FASES_INTERNAS.map((f) => (
              <SelectItem key={f} value={f}>{FASE_LABELS[f]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tabela */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-0">
          {carregando ? (
            <div className="py-16 text-center text-gray-400 text-sm">Carregando processos...</div>
          ) : filtradas.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">Nenhum processo encontrado</p>
              <p className="text-xs text-gray-400 mt-1">
                {busca || filtroFase !== "todas"
                  ? "Tente ajustar os filtros de busca"
                  : "Inicie criando um novo processo de licitação"}
              </p>
              {!busca && filtroFase === "todas" && (
                <Link href="/orgao/fase-interna/processos/novo" className="mt-4 inline-block">
                  <Button className="bg-[#1351b4] hover:bg-[#0c326f]">
                    <Plus className="w-4 h-4 mr-2" /> Novo processo
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Processo</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Etapa atual</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 w-44">Progresso</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Valor estimado</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Criado em</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((l) => {
                  const progresso = FASE_PROGRESSO[l.fase] || 1
                  return (
                    <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/70 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-sm text-gray-900">
                          {l.numero_processo || `#${l.id.slice(0, 8)}`}
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 max-w-xs truncate">{l.objeto}</div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="text-xs font-semibold text-gray-700">{FASE_LABELS[l.fase]}</div>
                        <div className="text-[10px] text-gray-400 mt-0.5">{progresso}ª etapa de 5</div>
                      </td>
                      <td className="px-3 py-4 w-44">
                        <Progress value={(progresso / 5) * 100} className="h-2 mb-1" />
                        <div className="text-[10px] text-gray-400">{progresso}/5 etapas</div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="text-sm font-medium text-gray-800">
                          {fmtMoeda(l.valor_total_estimado)}
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <div className="text-xs text-gray-500">{fmtData(l.created_at)}</div>
                      </td>
                      <td className="px-3 py-4">
                        <Link href={`/orgao/fase-interna/processos/${l.id}`}>
                          <Button variant="ghost" size="icon" className="w-7 h-7 hover:bg-[#ecf3fc] hover:text-[#1351b4]">
                            <ChevronRight className="w-4 h-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
