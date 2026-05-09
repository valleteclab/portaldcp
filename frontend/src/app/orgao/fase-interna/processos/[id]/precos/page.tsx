"use client"

import { useState, use, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  ChevronRight, Home, Plus, Search, Loader2, Trash2,
  AlertTriangle, Check
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { API_URL, authFetch } from "@/lib/api"

interface FontePreco {
  fonte: string
  tipo: "PNCP" | "PAINEL_PRECOS" | "COTACAO_DIRETA" | "CATALOGO" | "ORCAMENTO"
  valor_unitario: number
  data_pesquisa: string
  fornecedor?: string
  url_referencia?: string
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

const TIPO_LABEL: Record<string, string> = {
  PNCP: "PNCP",
  PAINEL_PRECOS: "PAINEL",
  COTACAO_DIRETA: "COTAÇÃO",
  CATALOGO: "CATÁLOGO",
  ORCAMENTO: "ORÇAMENTO",
}

const TIPO_COR: Record<string, { bg: string; text: string }> = {
  PNCP: { bg: "bg-blue-50", text: "text-blue-700" },
  PAINEL_PRECOS: { bg: "bg-purple-50", text: "text-purple-700" },
  COTACAO_DIRETA: { bg: "bg-green-50", text: "text-green-700" },
  CATALOGO: { bg: "bg-gray-100", text: "text-gray-600" },
  ORCAMENTO: { bg: "bg-orange-50", text: "text-orange-700" },
}

function fmtMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })
}

export default function PesquisaPrecosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [dados, setDados] = useState<DadosPrecos | null>(null)
  const [estatisticas, setEstatisticas] = useState<Record<number, Estatisticas>>({})
  const [loading, setLoading] = useState(true)
  const [adicionando, setAdicionando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [buscandoPNCP, setBuscandoPNCP] = useState(false)
  const [itemSelecionado, setItemSelecionado] = useState(1)
  const [novaFonte, setNovaFonte] = useState({ fonte: "", tipo: "COTACAO_DIRETA", valor: "", fornecedor: "" })

  const carregarPrecos = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/precos`)
      if (res.ok) {
        const data = await res.json()
        setDados(data.dados || null)
        setEstatisticas(data.estatisticas || {})
        if (data.dados?.itens?.length > 0) {
          setItemSelecionado(data.dados.itens[0].numero)
        }
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { carregarPrecos() }, [carregarPrecos])

  const itemAtual = dados?.itens.find((i) => i.numero === itemSelecionado)
  const statsAtual = estatisticas[itemSelecionado]
  const fontesValidas = itemAtual?.cotacoes.filter((c) => c.valida !== false) ?? []

  const buscarNoPNCP = async () => {
    setBuscandoPNCP(true)
    await new Promise((r) => setTimeout(r, 1500))
    setBuscandoPNCP(false)
  }

  const adicionarFonte = async () => {
    setSalvando(true)
    try {
      await authFetch(`${API_URL}/api/fase-interna/${id}/precos/fonte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemNumero: itemSelecionado,
          cotacao: {
            fonte: novaFonte.fonte,
            tipo: novaFonte.tipo,
            valor_unitario: parseFloat(novaFonte.valor.replace(",", ".")) || 0,
            data_pesquisa: new Date().toISOString().split("T")[0],
            fornecedor: novaFonte.fornecedor || undefined,
            valida: true,
          },
        }),
      })
      await carregarPrecos()
      setNovaFonte({ fonte: "", tipo: "COTACAO_DIRETA", valor: "", fornecedor: "" })
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
        `${API_URL}/api/fase-interna/${id}/precos/fonte?item=${itemSelecionado}&index=${index}`,
        { method: "DELETE" }
      )
      await carregarPrecos()
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando pesquisa de preços…
      </div>
    )
  }

  const fontes = itemAtual?.cotacoes ?? []

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
        <span className="text-[#1351b4] font-medium">Pesquisa de Preços</span>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Pesquisa de Preços</h1>
          <p className="text-sm text-gray-500 mt-0.5">Art. 23 · IN SEGES/ME 65/2021</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={buscarNoPNCP} disabled={buscandoPNCP} className="text-[#1351b4] border-[#c5d4eb]">
            {buscandoPNCP ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Buscando…</> : <><Search className="w-3.5 h-3.5 mr-1.5" /> Buscar no PNCP</>}
          </Button>
          <Button size="sm" onClick={() => setAdicionando(true)} className="bg-[#1351b4] hover:bg-[#0c326f]">
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar fonte
          </Button>
        </div>
      </div>

      {/* Seletor de item (se houver múltiplos) */}
      {dados && dados.itens.length > 1 && (
        <div className="flex gap-2 mb-4">
          {dados.itens.map((item) => (
            <button
              key={item.numero}
              onClick={() => setItemSelecionado(item.numero)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                itemSelecionado === item.numero
                  ? "bg-[#1351b4] text-white"
                  : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
              }`}
            >
              Item {item.numero} — {item.descricao}
            </button>
          ))}
        </div>
      )}

      {/* Estatísticas */}
      {statsAtual && (
        <div className="grid grid-cols-4 gap-4 mb-5">
          {[
            { label: "Mediana (referência)", valor: statsAtual.mediana, destaque: true },
            { label: "Média", valor: statsAtual.media, destaque: false },
            { label: "Menor preço", valor: statsAtual.min, destaque: false },
            { label: "Maior preço", valor: statsAtual.max, destaque: false },
          ].map((s) => (
            <Card key={s.label} className={`border-0 shadow-sm ${s.destaque ? "ring-2 ring-[#1351b4] ring-offset-1" : ""}`}>
              <CardContent className="p-4">
                <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                <p className={`text-xl font-bold ${s.destaque ? "text-[#1351b4]" : "text-gray-800"}`}>
                  {fmtMoeda(s.valor)}
                </p>
                {s.destaque && (
                  <p className="text-[10px] text-gray-400 mt-1">Base para o valor estimado</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Conformidade */}
      <div className={`mb-5 p-4 rounded-xl border flex items-start gap-3 ${
        fontesValidas.length >= 3 ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"
      }`}>
        {fontesValidas.length >= 3 ? (
          <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
        )}
        <div>
          <p className={`text-sm font-semibold ${fontesValidas.length >= 3 ? "text-green-700" : "text-yellow-700"}`}>
            {fontesValidas.length >= 3
              ? `${fontesValidas.length} fontes válidas — Conformidade com Art. 23`
              : `Apenas ${fontesValidas.length} fonte(s) válida(s) — Art. 23, §1º requer pelo menos 3`}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            PNCP/Painel: {fontes.filter((f) => f.tipo === "PNCP" || f.tipo === "PAINEL_PRECOS").length} ·
            Cotações diretas: {fontes.filter((f) => f.tipo === "COTACAO_DIRETA").length}
          </p>
        </div>
      </div>

      {/* Fontes */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Fontes de pesquisa ({fontes.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {/* Formulário de nova fonte */}
          {adicionando && (
            <div className="p-5 bg-[#f6f9fd] border-b border-[#dbe8fb]">
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                  <Input
                    placeholder="Descrição da fonte…"
                    value={novaFonte.fonte}
                    onChange={(e) => setNovaFonte((p) => ({ ...p, fonte: e.target.value }))}
                  />
                </div>
                <Select value={novaFonte.tipo} onValueChange={(v) => setNovaFonte((p) => ({ ...p, tipo: v }))}>
                  <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PNCP">PNCP</SelectItem>
                    <SelectItem value="PAINEL_PRECOS">Painel de Preços Gov</SelectItem>
                    <SelectItem value="COTACAO_DIRETA">Cotação direta</SelectItem>
                    <SelectItem value="CATALOGO">Catálogo</SelectItem>
                    <SelectItem value="ORCAMENTO">Orçamento</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Valor unitário (R$)…"
                  value={novaFonte.valor}
                  onChange={(e) => setNovaFonte((p) => ({ ...p, valor: e.target.value }))}
                />
                {novaFonte.tipo === "COTACAO_DIRETA" && (
                  <div className="col-span-2">
                    <Input
                      placeholder="Nome do fornecedor…"
                      value={novaFonte.fornecedor}
                      onChange={(e) => setNovaFonte((p) => ({ ...p, fornecedor: e.target.value }))}
                    />
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={adicionarFonte} disabled={!novaFonte.fonte || !novaFonte.valor || salvando} className="bg-[#1351b4] hover:bg-[#0c326f]">
                  {salvando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar fonte"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAdicionando(false)}>Cancelar</Button>
              </div>
            </div>
          )}

          {fontes.length === 0 && !adicionando && (
            <div className="py-12 text-center text-sm text-gray-400">
              Nenhuma fonte cadastrada. Adicione manualmente ou busque no PNCP.
            </div>
          )}

          {fontes.length > 0 && (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-semibold text-gray-500 px-5 py-3">Fonte</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Tipo</th>
                  <th className="text-right text-xs font-semibold text-gray-500 px-3 py-3">Valor unit.</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Data</th>
                  <th className="text-left text-xs font-semibold text-gray-500 px-3 py-3">Status</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {fontes.map((f, idx) => {
                  const cor = TIPO_COR[f.tipo] ?? { bg: "bg-gray-100", text: "text-gray-600" }
                  const valida = f.valida !== false
                  return (
                    <tr key={idx} className="border-b border-gray-50 hover:bg-gray-50/70">
                      <td className="px-5 py-3.5">
                        <div className="text-sm font-medium text-gray-800">{f.fonte}</div>
                        {f.fornecedor && <div className="text-xs text-gray-400 mt-0.5">{f.fornecedor}</div>}
                      </td>
                      <td className="px-3 py-3.5">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cor.bg} ${cor.text}`}>
                          {TIPO_LABEL[f.tipo] ?? f.tipo}
                        </span>
                      </td>
                      <td className="px-3 py-3.5 text-right">
                        <span className="text-sm font-bold text-gray-800">{fmtMoeda(f.valor_unitario)}</span>
                      </td>
                      <td className="px-3 py-3.5">
                        <span className="text-xs text-gray-500">{new Date(f.data_pesquisa).toLocaleDateString("pt-BR")}</span>
                      </td>
                      <td className="px-3 py-3.5">
                        {valida ? (
                          <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                            <Check className="w-3 h-3" /> Válida
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-red-500 font-medium">
                            <AlertTriangle className="w-3 h-3" /> Desconsiderada
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3.5">
                        <button onClick={() => removerFonte(idx)} className="text-gray-300 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
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
