"use client"

import { useState, use } from "react"
import Link from "next/link"
import { ChevronRight, Home, Plus, AlertTriangle, Sparkles, Loader2, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { API_URL, authFetch } from "@/lib/api"

interface Risco {
  id: string
  descricao: string
  probabilidade: 1 | 2 | 3 | 4 | 5
  impacto: 1 | 2 | 3 | 4 | 5
  categoria: string
  mitigacao: string
}

const RISCOS_EXEMPLO: Risco[] = [
  { id: "1", descricao: "Direcionamento técnico na especificação do objeto", probabilidade: 3, impacto: 5, categoria: "Juridico", mitigacao: "Revisar especificações para garantir neutralidade tecnológica (Art. 42)" },
  { id: "2", descricao: "Pesquisa de preços com fontes insuficientes", probabilidade: 4, impacto: 3, categoria: "Financeiro", mitigacao: "Diversificar fontes conforme Art. 23, §1º (PNCP, Painel, cotações diretas)" },
  { id: "3", descricao: "Prazo insuficiente para análise jurídica", probabilidade: 2, impacto: 4, categoria: "Cronograma", mitigacao: "Encaminhar documentos à procuradoria com antecedência mínima de 15 dias" },
  { id: "4", descricao: "Recurso orçamentário não disponível no exercício", probabilidade: 2, impacto: 5, categoria: "Financeiro", mitigacao: "Confirmar dotação orçamentária antes de publicar o edital (Art. 18, §1º, VI)" },
]

const NIVEL = (p: number, i: number) => {
  const score = p * i
  if (score >= 15) return { label: "Crítico", bg: "bg-red-500", text: "text-white" }
  if (score >= 8) return { label: "Alto", bg: "bg-orange-400", text: "text-white" }
  if (score >= 4) return { label: "Médio", bg: "bg-yellow-300", text: "text-gray-800" }
  return { label: "Baixo", bg: "bg-green-300", text: "text-gray-800" }
}

const CELL_COLOR = (p: number, i: number) => {
  const score = p * i
  if (score >= 15) return "bg-red-100"
  if (score >= 8) return "bg-orange-100"
  if (score >= 4) return "bg-yellow-100"
  return "bg-green-100"
}

export default function MapaRiscosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [riscos, setRiscos] = useState<Risco[]>(RISCOS_EXEMPLO)
  const [novoRisco, setNovoRisco] = useState({ descricao: "", probabilidade: "3", impacto: "3", categoria: "Geral", mitigacao: "" })
  const [adicionando, setAdicionando] = useState(false)
  const [gerandoIA, setGerandoIA] = useState(false)

  const gerarRiscosIA = async () => {
    setGerandoIA(true)
    try {
      const res = await authFetch(`${API_URL}/api/ia/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{
            role: "user",
            content: `Liste 3 riscos adicionais típicos para processos licitatórios de serviços de TI, conforme a Lei 14.133/2021 (Art. 18, X). Para cada risco, informe: descrição, categoria e medida de mitigação. Formato JSON: [{descricao, categoria, mitigacao}]`
          }],
          system: "Especialista em gestão de riscos em licitações públicas (Lei 14.133/2021). Responda apenas com o JSON solicitado.",
          max_tokens: 600,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const texto = data.content?.[0]?.text || ""
        const jsonMatch = texto.match(/\[[\s\S]*\]/)
        if (jsonMatch) {
          const novos = JSON.parse(jsonMatch[0])
          setRiscos((prev) => [
            ...prev,
            ...novos.map((r: any, i: number) => ({
              id: `ia-${Date.now()}-${i}`,
              descricao: r.descricao,
              probabilidade: 3 as const,
              impacto: 3 as const,
              categoria: r.categoria,
              mitigacao: r.mitigacao,
            })),
          ])
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setGerandoIA(false)
    }
  }

  const removerRisco = (rid: string) => setRiscos((prev) => prev.filter((r) => r.id !== rid))

  const adicionarRisco = () => {
    setRiscos((prev) => [...prev, {
      id: `manual-${Date.now()}`,
      descricao: novoRisco.descricao,
      probabilidade: parseInt(novoRisco.probabilidade) as 1 | 2 | 3 | 4 | 5,
      impacto: parseInt(novoRisco.impacto) as 1 | 2 | 3 | 4 | 5,
      categoria: novoRisco.categoria,
      mitigacao: novoRisco.mitigacao,
    }])
    setNovoRisco({ descricao: "", probabilidade: "3", impacto: "3", categoria: "Geral", mitigacao: "" })
    setAdicionando(false)
  }

  return (
    <div className="p-6 pb-10 max-w-6xl">
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

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mapa de Riscos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Art. 18, X · Art. 22 · Lei 14.133/2021</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={gerarRiscosIA} disabled={gerandoIA} className="text-[#1351b4] border-[#c5d4eb]">
            {gerandoIA ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando…</> : <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Sugerir com IA</>}
          </Button>
          <Button size="sm" onClick={() => setAdicionando(true)} className="bg-[#1351b4] hover:bg-[#0c326f]">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar risco
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-5">
        {/* Matriz */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Matriz Probabilidade × Impacto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr>
                    <th className="w-32 text-left pb-2 text-gray-400 font-medium">P × I</th>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <th key={i} className="text-center pb-2 text-gray-500 font-medium w-14">
                        {i === 1 ? "Muito baixo" : i === 2 ? "Baixo" : i === 3 ? "Médio" : i === 4 ? "Alto" : "Muito alto"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[5, 4, 3, 2, 1].map((p) => (
                    <tr key={p}>
                      <td className="pr-2 py-1 text-gray-500 font-medium">
                        {p === 1 ? "Muito baixa" : p === 2 ? "Baixa" : p === 3 ? "Média" : p === 4 ? "Alta" : "Muito alta"}
                      </td>
                      {[1, 2, 3, 4, 5].map((i) => {
                        const riscosNaCelula = riscos.filter((r) => r.probabilidade === p && r.impacto === i)
                        return (
                          <td key={i} className={`border border-white rounded p-1 h-12 text-center align-middle ${CELL_COLOR(p, i)}`}>
                            {riscosNaCelula.length > 0 && (
                              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/80 text-gray-700 font-bold text-xs shadow">
                                {riscosNaCelula.length}
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Legenda */}
            <div className="flex gap-4 mt-4 text-xs">
              {[{ bg: "bg-green-300", label: "Baixo" }, { bg: "bg-yellow-300", label: "Médio" }, { bg: "bg-orange-400", label: "Alto" }, { bg: "bg-red-500", label: "Crítico" }].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded ${l.bg}`} />
                  <span className="text-gray-500">{l.label}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Resumo */}
        <div className="space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Resumo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {["Crítico", "Alto", "Médio", "Baixo"].map((nivel) => {
                const count = riscos.filter((r) => NIVEL(r.probabilidade, r.impacto).label === nivel).length
                const cor = nivel === "Crítico" ? "text-red-600" : nivel === "Alto" ? "text-orange-600" : nivel === "Médio" ? "text-yellow-600" : "text-green-600"
                return (
                  <div key={nivel} className="flex items-center justify-between">
                    <span className={`text-xs font-semibold ${cor}`}>{nivel}</span>
                    <span className="text-sm font-bold text-gray-800">{count} riscos</span>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Lista de riscos */}
      <Card className="border-0 shadow-sm mt-5">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Riscos identificados ({riscos.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Formulário de novo risco */}
          {adicionando && (
            <div className="p-5 bg-[#f6f9fd] border-b border-[#dbe8fb]">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                  <Input
                    placeholder="Descrição do risco…"
                    value={novoRisco.descricao}
                    onChange={(e) => setNovoRisco((p) => ({ ...p, descricao: e.target.value }))}
                  />
                </div>
                <Select value={novoRisco.probabilidade} onValueChange={(v) => setNovoRisco((p) => ({ ...p, probabilidade: v }))}>
                  <SelectTrigger><SelectValue placeholder="Probabilidade" /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} — {n === 1 ? "Muito baixa" : n === 2 ? "Baixa" : n === 3 ? "Média" : n === 4 ? "Alta" : "Muito alta"}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={novoRisco.impacto} onValueChange={(v) => setNovoRisco((p) => ({ ...p, impacto: v }))}>
                  <SelectTrigger><SelectValue placeholder="Impacto" /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n} — {n === 1 ? "Muito baixo" : n === 2 ? "Baixo" : n === 3 ? "Médio" : n === 4 ? "Alto" : "Muito alto"}</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="col-span-2">
                  <Input
                    placeholder="Medida de mitigação…"
                    value={novoRisco.mitigacao}
                    onChange={(e) => setNovoRisco((p) => ({ ...p, mitigacao: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={adicionarRisco} disabled={!novoRisco.descricao} className="bg-[#1351b4] hover:bg-[#0c326f]">Salvar risco</Button>
                <Button size="sm" variant="ghost" onClick={() => setAdicionando(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          <div className="divide-y divide-gray-50">
            {riscos.map((risco) => {
              const nivel = NIVEL(risco.probabilidade, risco.impacto)
              return (
                <div key={risco.id} className="flex items-start gap-4 px-5 py-4">
                  <AlertTriangle className={`w-4 h-4 mt-0.5 shrink-0 ${nivel.label === "Crítico" ? "text-red-500" : nivel.label === "Alto" ? "text-orange-500" : nivel.label === "Médio" ? "text-yellow-500" : "text-green-500"}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-900">{risco.descricao}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${nivel.bg} ${nivel.text}`}>{nivel.label}</span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{risco.categoria}</span>
                    </div>
                    <p className="text-xs text-gray-500">P{risco.probabilidade} × I{risco.impacto} · {risco.mitigacao}</p>
                  </div>
                  <button onClick={() => removerRisco(risco.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
