"use client"

import { useState, use, useEffect, useCallback } from "react"
import Link from "next/link"
import { ChevronRight, Home, Plus, Sparkles, Loader2, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { API_URL, authFetch } from "@/lib/api"

interface Risco {
  id: string
  descricao: string
  probabilidade: 1 | 2 | 3
  impacto: 1 | 2 | 3
  categoria: string
  mitigacao: string
  responsavel?: string
  nivel?: string
}

const RISCOS_MOCK: Risco[] = [
  {
    id: "R-001",
    descricao: "Direcionamento técnico na especificação",
    categoria: "Jurídico",
    probabilidade: 2,
    impacto: 3,
    mitigacao: "Revisão multidisciplinar das especificações técnicas",
    responsavel: "Pregoeiro",
    nivel: "Alto",
  },
  {
    id: "R-002",
    descricao: "Pesquisa de preços com fontes insuficientes",
    categoria: "Financeiro",
    probabilidade: 3,
    impacto: 2,
    mitigacao: "Diversificar fontes conforme Art. 23, §1º",
    responsavel: "Requisitante",
    nivel: "Médio",
  },
  {
    id: "R-003",
    descricao: "Prazo insuficiente para análise jurídica",
    categoria: "Cronograma",
    probabilidade: 1,
    impacto: 2,
    mitigacao: "Encaminhar com antecedência mínima de 15 dias",
    responsavel: "Pregoeiro",
    nivel: "Baixo",
  },
  {
    id: "R-004",
    descricao: "Recurso orçamentário não disponível no exercício",
    categoria: "Financeiro",
    probabilidade: 1,
    impacto: 3,
    mitigacao: "Confirmar dotação antes de publicar (Art. 18, §1º, VI)",
    responsavel: "Autoridade",
    nivel: "Alto",
  },
]

// 3×3 matrix: score = (impacto) × (probabilidade), row_idx 0-2 = impact 1-3, col_idx 0-2 = prob 1-3
function cellColor(rowIdx: number, colIdx: number): string {
  const score = (rowIdx + 1) * (colIdx + 1)
  if (score >= 6) return "bg-[#fcdedc]"
  if (score >= 3) return "bg-[#fff5d9]"
  return "bg-[#e3f5e1]"
}

function nivelLabel(p: number, i: number): string {
  const score = p * i
  if (score >= 6) return "Alto"
  if (score >= 3) return "Médio"
  return "Baixo"
}

function nivelChip(nivel: string): string {
  if (nivel === "Alto") return "bg-red-100 text-red-700"
  if (nivel === "Médio") return "bg-yellow-100 text-yellow-700"
  return "bg-green-100 text-green-700"
}

const PROB_LABEL: Record<number, string> = { 1: "Baixa", 2: "Média", 3: "Alta" }
const IMP_LABEL: Record<number, string> = { 1: "Baixo", 2: "Médio", 3: "Alto" }

export default function MapaRiscosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [riscos, setRiscos] = useState<Risco[]>([])
  const [loading, setLoading] = useState(true)
  const [isMock, setIsMock] = useState(false)
  const [adicionando, setAdicionando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [gerandoIA, setGerandoIA] = useState(false)
  const [novoRisco, setNovoRisco] = useState({
    descricao: "",
    categoria: "Jurídico",
    probabilidade: "2",
    impacto: "2",
    mitigacao: "",
    responsavel: "",
  })

  const carregarRiscos = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/riscos`)
      if (res.ok) {
        const data = await res.json()
        const lista = data.riscos || []
        if (lista.length > 0) {
          setRiscos(lista)
          setIsMock(false)
        } else {
          setRiscos(RISCOS_MOCK)
          setIsMock(true)
        }
      } else {
        setRiscos(RISCOS_MOCK)
        setIsMock(true)
      }
    } catch {
      setRiscos(RISCOS_MOCK)
      setIsMock(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    carregarRiscos()
  }, [carregarRiscos])

  const gerarRiscosIA = async () => {
    setGerandoIA(true)
    try {
      const prompt = `Liste 3 riscos adicionais típicos para processos licitatórios de serviços de TI, conforme a Lei 14.133/2021 (Art. 18, X). Para cada risco, informe: descrição, categoria e medida de mitigação. Retorne APENAS JSON: [{descricao, categoria, mitigacao}]`
      const res = await authFetch(API_URL + "/api/ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensagens: [{ role: "user", content: prompt }],
          tipoDocumento: "mapa_riscos",
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const texto = data.resposta || ""
        const jsonMatch = texto.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const novos: { descricao: string; categoria: string; mitigacao: string }[] =
            JSON.parse(jsonMatch[0])
          const gerados: Risco[] = novos.map((r, idx) => ({
            id: `R-IA-${Date.now()}-${idx}`,
            descricao: r.descricao,
            categoria: r.categoria,
            probabilidade: 2,
            impacto: 2,
            mitigacao: r.mitigacao,
            responsavel: "",
            nivel: "Médio",
          }))
          setRiscos((prev) => [...prev, ...gerados])
          setIsMock(false)
          // Persist each generated risk
          for (const r of gerados) {
            try {
              await authFetch(`${API_URL}/api/fase-interna/${id}/riscos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  descricao: r.descricao,
                  categoria: r.categoria,
                  probabilidade: r.probabilidade,
                  impacto: r.impacto,
                  mitigacao: r.mitigacao,
                  responsavel: r.responsavel,
                }),
              })
            } catch {
              // silencia
            }
          }
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setGerandoIA(false)
    }
  }

  const adicionarRisco = async () => {
    setSalvando(true)
    try {
      const body = {
        descricao: novoRisco.descricao,
        categoria: novoRisco.categoria,
        probabilidade: parseInt(novoRisco.probabilidade) as 1 | 2 | 3,
        impacto: parseInt(novoRisco.impacto) as 1 | 2 | 3,
        mitigacao: novoRisco.mitigacao,
        responsavel: novoRisco.responsavel,
      }
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/riscos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        await carregarRiscos()
      } else {
        // Optimistic add
        const id_local = `R-${String(riscos.length + 1).padStart(3, "0")}`
        setRiscos((prev) => [
          ...prev,
          { ...body, id: id_local, nivel: nivelLabel(body.probabilidade, body.impacto) },
        ])
        setIsMock(false)
      }
      setNovoRisco({
        descricao: "",
        categoria: "Jurídico",
        probabilidade: "2",
        impacto: "2",
        mitigacao: "",
        responsavel: "",
      })
      setAdicionando(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSalvando(false)
    }
  }

  const removerRisco = async (riscoId: string) => {
    setRiscos((prev) => prev.filter((r) => r.id !== riscoId))
    try {
      await authFetch(`${API_URL}/api/fase-interna/${id}/riscos/${riscoId}`, {
        method: "DELETE",
      })
    } catch {
      carregarRiscos()
    }
  }

  // Build 3×3 matrix counts: [impact 1-3][prob 1-3]
  const matrixCounts: number[][] = Array.from({ length: 3 }, () => Array(3).fill(0))
  riscos.forEach((r) => {
    const iIdx = (r.impacto ?? 1) - 1
    const pIdx = (r.probabilidade ?? 1) - 1
    if (iIdx >= 0 && iIdx < 3 && pIdx >= 0 && pIdx < 3) {
      matrixCounts[iIdx][pIdx]++
    }
  })

  const totalRiscos = riscos.length
  const iaRiscosAdicionais = 3

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando mapa de riscos…
      </div>
    )
  }

  return (
    <div className="p-6 pb-10 max-w-7xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Home className="w-3.5 h-3.5" />
        <ChevronRight className="w-3 h-3" />
        <Link href="/orgao/fase-interna" className="hover:text-[#1351b4]">Fase Interna</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href={`/orgao/fase-interna/processos/${id}`} className="hover:text-[#1351b4]">Processo</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#1351b4] font-medium">Mapa de Riscos</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mapa de Riscos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Análise de riscos da contratação · Art. 18, X e Art. 22 da Lei 14.133/2021
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={gerarRiscosIA}
            disabled={gerandoIA}
            className="text-[#1351b4] border-[#c5d4eb]"
          >
            {gerandoIA ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando…
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 mr-1.5" /> Gerar com IA
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => setAdicionando(true)}
            className="bg-[#1351b4] hover:bg-[#0c326f]"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Novo risco
          </Button>
        </div>
      </div>

      {/* Main grid: matrix left, table right */}
      <div className="grid grid-cols-[380px_1fr] gap-5 mb-5">
        {/* Left: Matriz de risco 3×3 */}
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Matriz de risco</CardTitle>
            <p className="text-xs text-gray-400 mt-0.5">Probabilidade × Impacto</p>
          </CardHeader>
          <CardContent>
            {/* Table: rows = impact (top=high), cols = probability (left=low) */}
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    {/* corner */}
                    <th className="w-16 pb-2" />
                    {[1, 2, 3].map((p) => (
                      <th key={p} className="text-center pb-2 text-gray-500 font-medium px-1">
                        {PROB_LABEL[p]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Rows from top: impact 3 (Alto) → 1 (Baixo) */}
                  {[3, 2, 1].map((imp) => {
                    const rowIdx = imp - 1
                    return (
                      <tr key={imp}>
                        <td className="pr-2 py-1 text-gray-500 font-medium text-[11px] w-16">
                          {IMP_LABEL[imp]}
                        </td>
                        {[1, 2, 3].map((prob) => {
                          const colIdx = prob - 1
                          const count = matrixCounts[rowIdx][colIdx]
                          return (
                            <td
                              key={prob}
                              className={`border border-white rounded-md h-14 text-center align-middle px-1 ${cellColor(rowIdx, colIdx)}`}
                            >
                              {count > 0 ? (
                                <div className="flex flex-col items-center justify-center gap-0.5">
                                  <span className="text-sm font-bold text-gray-700">{count}</span>
                                  <span className="text-[10px] text-gray-500">risco{count !== 1 ? "s" : ""}</span>
                                </div>
                              ) : null}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div className="flex gap-3 mt-4">
              {[
                { bg: "bg-[#e3f5e1]", label: "Baixo" },
                { bg: "bg-[#fff5d9]", label: "Médio" },
                { bg: "bg-[#fcdedc]", label: "Alto" },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded ${l.bg} border border-gray-200`} />
                  <span className="text-xs text-gray-500">{l.label}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400 mt-3">Total: {totalRiscos} riscos</p>
          </CardContent>
        </Card>

        {/* Right: Riscos identificados table */}
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Riscos identificados</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="text-xs text-gray-600 border-gray-200">
                Filtrar
              </Button>
              <Button variant="outline" size="sm" className="text-xs text-gray-600 border-gray-200">
                Exportar
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {/* Formulário de novo risco */}
            {adicionando && (
              <div className="mx-5 mb-4 p-4 bg-[#f6f9fd] border border-[#dbe8fb] rounded-lg">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2">
                    <Input
                      placeholder="Descrição do risco…"
                      value={novoRisco.descricao}
                      onChange={(e) => setNovoRisco((p) => ({ ...p, descricao: e.target.value }))}
                    />
                  </div>
                  <Select
                    value={novoRisco.categoria}
                    onValueChange={(v) => setNovoRisco((p) => ({ ...p, categoria: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Jurídico">Jurídico</SelectItem>
                      <SelectItem value="Financeiro">Financeiro</SelectItem>
                      <SelectItem value="Cronograma">Cronograma</SelectItem>
                      <SelectItem value="Técnico">Técnico</SelectItem>
                      <SelectItem value="Mercado">Mercado</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={novoRisco.probabilidade}
                    onValueChange={(v) => setNovoRisco((p) => ({ ...p, probabilidade: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Probabilidade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — Baixa</SelectItem>
                      <SelectItem value="2">2 — Média</SelectItem>
                      <SelectItem value="3">3 — Alta</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={novoRisco.impacto}
                    onValueChange={(v) => setNovoRisco((p) => ({ ...p, impacto: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Impacto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — Baixo</SelectItem>
                      <SelectItem value="2">2 — Médio</SelectItem>
                      <SelectItem value="3">3 — Alto</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="col-span-2">
                    <Input
                      placeholder="Mitigação / tratamento…"
                      value={novoRisco.mitigacao}
                      onChange={(e) => setNovoRisco((p) => ({ ...p, mitigacao: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2">
                    <Input
                      placeholder="Responsável"
                      value={novoRisco.responsavel}
                      onChange={(e) => setNovoRisco((p) => ({ ...p, responsavel: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={adicionarRisco}
                    disabled={!novoRisco.descricao || salvando}
                    className="bg-[#1351b4] hover:bg-[#0c326f]"
                  >
                    {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setAdicionando(false)}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {riscos.length === 0 && !adicionando ? (
              <div className="py-12 text-center text-sm text-gray-400">
                Nenhum risco identificado. Adicione manualmente ou use a IA.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">ID</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Categoria</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 max-w-[280px]">Descrição</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Nível</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3 max-w-[240px]">Tratamento / Mitigação</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Resp.</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {riscos.map((risco) => {
                      const nivel =
                        risco.nivel ??
                        nivelLabel(risco.probabilidade ?? 2, risco.impacto ?? 2)
                      const chipCls = nivelChip(nivel)
                      return (
                        <tr key={risco.id} className="border-b border-gray-50 hover:bg-gray-50/70">
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-bold font-mono text-gray-700">
                              {risco.id}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                              {risco.categoria}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 max-w-[280px]">
                            <span className="text-xs text-gray-700 leading-snug line-clamp-2">
                              {risco.descricao}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${chipCls}`}>
                              {nivel}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 max-w-[240px]">
                            <span className="text-xs text-gray-500 leading-snug line-clamp-2">
                              {risco.mitigacao}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="text-xs text-gray-500">{risco.responsavel ?? "—"}</span>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            {!isMock && (
                              <button
                                onClick={() => removerRisco(risco.id)}
                                className="text-gray-300 hover:text-red-400 transition-colors"
                                title="Remover risco"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* IA alert box at bottom */}
      <div className="flex items-center justify-between gap-4 bg-blue-50 border border-blue-200 rounded-lg px-5 py-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-4 h-4 text-blue-600 shrink-0" />
          <p className="text-sm text-blue-700">
            <span className="font-semibold">Procura+ AI</span> identificou {iaRiscosAdicionais} riscos adicionais com base em processos similares.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="text-blue-700 border-blue-300 hover:bg-blue-100 shrink-0"
          onClick={gerarRiscosIA}
          disabled={gerandoIA}
        >
          {gerandoIA ? (
            <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando…</>
          ) : (
            "Revisar sugestões"
          )}
        </Button>
      </div>
    </div>
  )
}
