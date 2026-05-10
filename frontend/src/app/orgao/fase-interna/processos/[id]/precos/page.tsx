"use client"

import { useState, use, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ChevronRight, Home, Plus, Search, Loader2, Eye, AlertTriangle, Check, Sparkles
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { API_URL, authFetch } from "@/lib/api"

interface FontePreco {
  fonte: string
  orgao?: string
  fornecedor?: string
  tipo: "PNCP" | "PAINEL_PRECOS" | "COTACAO_DIRETA" | "CATALOGO" | "SITE_OFICIAL"
  valor_unitario: number
  data_pesquisa: string
  qtd?: number
  valida?: boolean
}

interface ItemPreco {
  numero: number
  descricao: string
  unidade: string
  quantidade: number
  cotacoes: FontePreco[]
  valor_estimado_unitario?: number
}

interface DadosPrecos {
  itens: ItemPreco[]
  metodologia: string
}

interface Estatisticas {
  media: number
  mediana: number
  min: number
  max: number
  n: number
}

const FONTES_MOCK: FontePreco[] = [
  { fonte: "PNCP", orgao: "Min. da Saúde", data_pesquisa: "2026-03-11", qtd: 250, valor_unitario: 4250, tipo: "PNCP" },
  { fonte: "Painel Preços", orgao: "TRT 4ª Região", data_pesquisa: "2026-02-17", qtd: 180, valor_unitario: 4180, tipo: "PAINEL_PRECOS" },
  { fonte: "PNCP", orgao: "Pref. de São Bernardo", data_pesquisa: "2026-01-29", qtd: 320, valor_unitario: 4380, tipo: "PNCP" },
  { fonte: "Cotação direta", orgao: "TechCorp Soluções", data_pesquisa: "2026-04-21", qtd: 250, valor_unitario: 4500, tipo: "COTACAO_DIRETA" },
  { fonte: "Cotação direta", orgao: "DocFlow Sistemas", data_pesquisa: "2026-04-24", qtd: 250, valor_unitario: 4150, tipo: "COTACAO_DIRETA" },
  { fonte: "Site oficial", orgao: "Catálogo do fabricante", data_pesquisa: "2026-04-27", qtd: 250, valor_unitario: 4690, tipo: "CATALOGO" },
]

function calcMedia(fontes: FontePreco[]) {
  if (!fontes.length) return 0
  return fontes.reduce((s, f) => s + f.valor_unitario, 0) / fontes.length
}

function calcMediana(fontes: FontePreco[]) {
  if (!fontes.length) return 0
  const sorted = [...fontes].map((f) => f.valor_unitario).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function calcMin(fontes: FontePreco[]) {
  if (!fontes.length) return 0
  return Math.min(...fontes.map((f) => f.valor_unitario))
}

function calcMax(fontes: FontePreco[]) {
  if (!fontes.length) return 0
  return Math.max(...fontes.map((f) => f.valor_unitario))
}

const TIPO_LABEL: Record<string, string> = {
  PNCP: "PNCP",
  PAINEL_PRECOS: "Painel Preços",
  COTACAO_DIRETA: "Cotação direta",
  CATALOGO: "Catálogo",
  SITE_OFICIAL: "Site oficial",
}

const TIPO_BADGE: Record<string, string> = {
  PNCP: "bg-blue-100 text-blue-700",
  PAINEL_PRECOS: "bg-green-100 text-green-700",
  COTACAO_DIRETA: "bg-gray-100 text-gray-600",
  CATALOGO: "bg-gray-100 text-gray-600",
  SITE_OFICIAL: "bg-gray-100 text-gray-600",
}

function fmtMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })
}

function fmtData(d: string) {
  const date = new Date(d + "T12:00:00")
  return date.toLocaleDateString("pt-BR")
}

function buildHistogram(fontes: FontePreco[], buckets = 6) {
  if (!fontes.length) return []
  const vals = fontes.map((f) => f.valor_unitario)
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (min === max) return [{ count: fontes.length, label: fmtMoeda(min) }]
  const size = (max - min) / buckets
  return Array.from({ length: buckets }, (_, i) => {
    const lo = min + i * size
    const hi = lo + size
    return {
      count: vals.filter((v) => v >= lo && (i === buckets - 1 ? v <= hi : v < hi)).length,
      label: fmtMoeda(lo),
    }
  })
}

export default function PesquisaPrecosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [dados, setDados] = useState<DadosPrecos | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [estatisticas, setEstatisticas] = useState<Record<number, Estatisticas>>({})
  const [loading, setLoading] = useState(true)
  const [adicionando, setAdicionando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [buscandoPNCP, setBuscandoPNCP] = useState(false)
  const [isMock, setIsMock] = useState(false)
  const [iaAnalise, setIaAnalise] = useState<string | null>(null)
  const [gerandoIA, setGerandoIA] = useState(false)
  const [novaFonte, setNovaFonte] = useState({
    fonte: "",
    tipo: "COTACAO_DIRETA",
    valor: "",
    fornecedor: "",
    data: new Date().toISOString().split("T")[0],
    qtd: "1",
  })

  const carregarPrecos = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/precos`)
      if (res.ok) {
        const data = await res.json()
        const temDados =
          data.dados?.itens?.length > 0 &&
          data.dados.itens.some((i: ItemPreco) => i.cotacoes?.length > 0)
        if (temDados) {
          setDados(data.dados)
          setEstatisticas(data.estatisticas || {})
          setIsMock(false)
        } else {
          setIsMock(true)
          setDados(null)
        }
      } else {
        setIsMock(true)
        setDados(null)
      }
    } catch {
      setIsMock(true)
      setDados(null)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    carregarPrecos()
  }, [carregarPrecos])

  const fontes: FontePreco[] = isMock ? FONTES_MOCK : (dados?.itens?.[0]?.cotacoes ?? [])

  const media = calcMedia(fontes)
  const mediana = calcMediana(fontes)
  const minVal = calcMin(fontes)
  const maxVal = calcMax(fontes)
  const quantidade = dados?.itens?.[0]?.quantidade ?? 1
  const valorEstimado = mediana * quantidade
  const diff = maxVal - minVal
  const pct = media > 0 ? ((diff / media) * 100).toFixed(1) : "0"
  const fontesPublicas = fontes.filter((f) => f.tipo === "PNCP" || f.tipo === "PAINEL_PRECOS").length

  const gerarAnaliseIA = useCallback(
    async (fontesParam: FontePreco[]) => {
      setGerandoIA(true)
      setIaAnalise(null)
      try {
        const prompt = `Analise a pesquisa de preços a seguir e gere: (1) avaliação de conformidade com IN 65/2021, (2) recomendação do método (média ou mediana), (3) lista de 3 recomendações. Fontes: ${JSON.stringify(fontesParam)}. Responda em texto corrido, máximo 150 palavras.`
        const res = await authFetch(API_URL + "/api/ia/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mensagens: [{ role: "user", content: prompt }],
            tipoDocumento: "pesquisa_precos",
          }),
        })
        if (res.ok) {
          const data = await res.json()
          setIaAnalise(data.resposta || null)
        }
      } catch {
        // silencia
      } finally {
        setGerandoIA(false)
      }
    },
    []
  )

  useEffect(() => {
    if (!loading && fontes.length > 0 && !iaAnalise && !gerandoIA) {
      gerarAnaliseIA(fontes)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading])

  const buscarNoPNCP = async () => {
    setBuscandoPNCP(true)
    try {
      // Determina o objeto/descrição da pesquisa a partir dos itens já carregados
      const descricao = dados?.itens?.[0]?.descricao || "Licença de software"
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/precos/pesquisar-e-salvar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itens: [
            {
              descricao,
              quantidade: dados?.itens?.[0]?.quantidade ?? 1,
              unidade: dados?.itens?.[0]?.unidade ?? "UN",
            },
          ],
        }),
      })
      if (res.ok) {
        await carregarPrecos()
      }
    } catch (e) {
      console.error(e)
    } finally {
      setBuscandoPNCP(false)
    }
  }

  const adicionarFonte = async () => {
    setSalvando(true)
    try {
      await authFetch(`${API_URL}/api/fase-interna/${id}/precos/fonte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemNumero: 1,
          cotacao: {
            fonte: novaFonte.fonte,
            tipo: novaFonte.tipo,
            valor_unitario: parseFloat(novaFonte.valor.replace(",", ".")) || 0,
            data_pesquisa: novaFonte.data,
            fornecedor: novaFonte.fornecedor || undefined,
            qtd: parseInt(novaFonte.qtd) || 1,
            valida: true,
          },
        }),
      })
      await carregarPrecos()
      setNovaFonte({
        fonte: "",
        tipo: "COTACAO_DIRETA",
        valor: "",
        fornecedor: "",
        data: new Date().toISOString().split("T")[0],
        qtd: "1",
      })
      setAdicionando(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSalvando(false)
    }
  }

  const removerFonte = async (index: number) => {
    try {
      await authFetch(
        `${API_URL}/api/fase-interna/${id}/precos/fonte?item=1&index=${index}`,
        { method: "DELETE" }
      )
      await carregarPrecos()
    } catch (e) {
      console.error(e)
    }
  }

  const histBars = buildHistogram(fontes)
  const maxCount = Math.max(...histBars.map((b) => b.count), 1)

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando pesquisa de preços…
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
        <span className="text-[#1351b4] font-medium">Pesquisa de Preços</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pesquisa de preços</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Estimativa do valor da contratação · Art. 23 da Lei 14.133/2021 · IN SEGES/ME 65/2021
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={buscarNoPNCP}
            disabled={buscandoPNCP}
            className="text-[#1351b4] border-[#c5d4eb]"
          >
            {buscandoPNCP ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Buscando…
              </>
            ) : (
              <>
                <Search className="w-3.5 h-3.5 mr-1.5" /> Buscar no PNCP
              </>
            )}
          </Button>
          <Button
            size="sm"
            onClick={() => setAdicionando(true)}
            className="bg-[#1351b4] hover:bg-[#0c326f]"
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar fonte
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Card className="border border-gray-100 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Valor unitário médio</p>
            <p className="text-xl font-bold text-gray-900">{fmtMoeda(media)}</p>
            <p className="text-[10px] text-gray-400 mt-1">Aritmético simples · {fontes.length} fontes</p>
          </CardContent>
        </Card>

        <Card className="border border-gray-100 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Valor unitário mediano</p>
            <p className="text-xl font-bold text-gray-900">{fmtMoeda(mediana)}</p>
            <p className="text-[10px] text-gray-400 mt-1">Recomendado pela IN 65</p>
          </CardContent>
        </Card>

        <Card className="border border-gray-100 shadow-sm">
          <CardContent className="p-4">
            <p className="text-xs text-gray-500 mb-1">Variação (mín–máx)</p>
            <p className="text-xl font-bold text-gray-900">
              {fmtMoeda(minVal)} – {fmtMoeda(maxVal)}
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Δ {fmtMoeda(diff)} ({pct}%)
            </p>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm bg-gradient-to-br from-[#1351b4] to-[#0c326f] text-white">
          <CardContent className="p-4">
            <p className="text-xs text-blue-200 mb-1">Valor estimado total</p>
            <p className="text-xl font-bold">{fmtMoeda(valorEstimado)}</p>
            <p className="text-[10px] text-blue-200 mt-1">Mediana × {quantidade} un.</p>
          </CardContent>
        </Card>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-[1fr_360px] gap-5">
        {/* Left: Fontes consultadas */}
        <Card className="border border-gray-100 shadow-sm">
          <CardHeader className="pb-3 flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">Fontes consultadas</CardTitle>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                fontes.length >= 3
                  ? "bg-green-100 text-green-700"
                  : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {fontes.length >= 3 ? "✓" : "!"} {fontes.length} fontes (mín. 3, IN 65)
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {/* Mock badge */}
            {isMock && (
              <div className="mx-5 mb-3">
                <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  dados de exemplo
                </span>
              </div>
            )}

            {/* Formulário de nova fonte */}
            {adicionando && (
              <div className="mx-5 mb-4 p-4 bg-[#f6f9fd] border border-[#dbe8fb] rounded-lg">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="col-span-2">
                    <Input
                      placeholder="Fonte / descrição…"
                      value={novaFonte.fonte}
                      onChange={(e) => setNovaFonte((p) => ({ ...p, fonte: e.target.value }))}
                    />
                  </div>
                  <Input
                    placeholder="Órgão / Fornecedor"
                    value={novaFonte.fornecedor}
                    onChange={(e) => setNovaFonte((p) => ({ ...p, fornecedor: e.target.value }))}
                  />
                  <Input
                    type="date"
                    value={novaFonte.data}
                    onChange={(e) => setNovaFonte((p) => ({ ...p, data: e.target.value }))}
                  />
                  <Input
                    type="number"
                    placeholder="Qtd"
                    value={novaFonte.qtd}
                    onChange={(e) => setNovaFonte((p) => ({ ...p, qtd: e.target.value }))}
                  />
                  <Input
                    placeholder="Valor unitário (R$)"
                    value={novaFonte.valor}
                    onChange={(e) => setNovaFonte((p) => ({ ...p, valor: e.target.value }))}
                  />
                  <div className="col-span-2">
                    <Select
                      value={novaFonte.tipo}
                      onValueChange={(v) => setNovaFonte((p) => ({ ...p, tipo: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PNCP">PNCP</SelectItem>
                        <SelectItem value="PAINEL_PRECOS">Painel Preços</SelectItem>
                        <SelectItem value="COTACAO_DIRETA">Cotação direta</SelectItem>
                        <SelectItem value="SITE_OFICIAL">Site oficial</SelectItem>
                        <SelectItem value="CATALOGO">Catálogo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={adicionarFonte}
                    disabled={!novaFonte.fonte || !novaFonte.valor || salvando}
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

            {fontes.length === 0 && !adicionando && (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400 mb-3">Nenhuma fonte cadastrada ainda.</p>
                <Button
                  size="sm"
                  onClick={() => setAdicionando(true)}
                  className="bg-[#1351b4] hover:bg-[#0c326f]"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar primeira fonte
                </Button>
              </div>
            )}

            {fontes.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Fonte</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Órgão / Fornecedor</th>
                      <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Data</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">Qtd.</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">Unitário</th>
                      <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">Total</th>
                      <th className="w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {fontes.map((f, idx) => {
                      const badge = TIPO_BADGE[f.tipo] ?? "bg-gray-100 text-gray-600"
                      const isOutlier =
                        f.valor_unitario > media * 1.05 || f.valor_unitario < media * 0.95
                      const qtdF = f.qtd ?? 1
                      return (
                        <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/70">
                          <td className="px-5 py-3.5">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge}`}>
                              {TIPO_LABEL[f.tipo] ?? f.tipo}
                            </span>
                          </td>
                          <td className="px-3 py-3.5">
                            <div className="text-xs text-gray-700">{f.orgao ?? f.fornecedor ?? "—"}</div>
                          </td>
                          <td className="px-3 py-3.5">
                            <span className="text-xs text-gray-500">{fmtData(f.data_pesquisa)}</span>
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            <span className="text-xs text-gray-600">{qtdF}</span>
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            <span className="text-sm font-bold text-gray-800">
                              {fmtMoeda(f.valor_unitario)}
                            </span>
                            {isOutlier && (
                              <AlertTriangle className="w-3.5 h-3.5 text-yellow-500 inline ml-1.5" />
                            )}
                          </td>
                          <td className="px-3 py-3.5 text-right">
                            <span className="text-xs text-gray-600">
                              {fmtMoeda(f.valor_unitario * qtdF)}
                            </span>
                          </td>
                          <td className="px-3 py-3.5 text-center">
                            <button
                              onClick={() => !isMock && removerFonte(idx)}
                              className="text-gray-300 hover:text-gray-500 transition-colors"
                              title={isMock ? "Dado de exemplo" : "Visualizar"}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
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

        {/* Right sidebar */}
        <div className="flex flex-col gap-4">
          {/* Análise da IA */}
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#1351b4]" />
                Análise da IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Conformidade */}
              {fontes.length >= 3 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />
                    <p className="text-xs font-semibold text-green-700">Pesquisa em conformidade</p>
                  </div>
                  <p className="text-[11px] text-green-600 leading-snug">
                    {fontes.length} fontes válidas · {fontesPublicas} fontes públicas (PNCP/Painel) atendem IN 65/2021.
                  </p>
                </div>
              )}

              {/* Texto da IA */}
              {gerandoIA && (
                <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> Gerando análise…
                </div>
              )}
              {iaAnalise && !gerandoIA && (
                <p className="text-xs text-gray-600 leading-relaxed">{iaAnalise}</p>
              )}
              {!iaAnalise && !gerandoIA && (
                <p className="text-xs text-gray-500 leading-relaxed">
                  A mediana é o método recomendado pela IN 65/2021 pois é mais robusta a valores extremos,
                  representando com maior fidelidade o preço de mercado praticado.
                </p>
              )}

              <hr className="border-gray-100" />

              <div>
                <p className="text-xs font-semibold text-gray-700 mb-2">Recomendações:</p>
                <ul className="text-xs text-gray-500 space-y-1.5 list-disc list-inside">
                  <li>Usar o valor mediano como referência para o orçamento</li>
                  <li>Manter a pesquisa válida por até 12 meses (IN 65, art. 5º)</li>
                  <li>Anexar pareceres e comprovantes das fontes consultadas</li>
                </ul>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full text-[#1351b4] border-[#c5d4eb]"
                onClick={() => gerarAnaliseIA(fontes)}
                disabled={gerandoIA}
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Gerar relatório justificativo
              </Button>
            </CardContent>
          </Card>

          {/* Histograma */}
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Histograma</CardTitle>
            </CardHeader>
            <CardContent>
              {histBars.length === 0 ? (
                <p className="text-xs text-gray-400">Sem dados suficientes.</p>
              ) : (
                <div>
                  <div className="flex items-end gap-1.5 h-24">
                    {histBars.map((bar, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center justify-end">
                        <div
                          className="w-full bg-[#1351b4] rounded-t opacity-80"
                          style={{
                            height: `${(bar.count / maxCount) * 100}%`,
                            minHeight: bar.count > 0 ? 4 : 0,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-gray-400">{fmtMoeda(minVal)}</span>
                    <span className="text-[10px] text-gray-400">{fmtMoeda(maxVal)}</span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
