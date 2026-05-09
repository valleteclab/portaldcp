"use client"

import { useState, use } from "react"
import Link from "next/link"
import {
  ChevronRight, Home, Plus, Search, ExternalLink, Sparkles, Loader2, Trash2,
  TrendingUp, AlertTriangle, Check
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { API_URL, authFetch } from "@/lib/api"

interface FontePreco {
  id: string
  fonte: string
  tipo: "PNCP" | "PAINEL" | "COTACAO" | "CATALOGO"
  valor: number
  data: string
  fornecedor?: string
  valido: boolean
}

const FONTES_EXEMPLO: FontePreco[] = [
  { id: "1", fonte: "PNCP — PE 2025/0412 — Prefeitura de SP", tipo: "PNCP", valor: 4200, data: "2025-03-15", valido: true },
  { id: "2", fonte: "PNCP — PE 2025/0287 — Governo do Estado RJ", tipo: "PNCP", valor: 4350, data: "2025-02-20", valido: true },
  { id: "3", fonte: "Painel de Preços Gov — GED Enterprise", tipo: "PAINEL", valor: 4480, data: "2025-01-10", valido: true },
  { id: "4", fonte: "Cotação direta — Fornecedor A", tipo: "COTACAO", valor: 3900, data: "2025-04-01", fornecedor: "TechSoft Ltda.", valido: true },
  { id: "5", fonte: "Cotação direta — Fornecedor B", tipo: "COTACAO", valor: 4100, data: "2025-04-02", fornecedor: "DocSystem S.A.", valido: true },
  { id: "6", fonte: "Catálogo de preços INDE", tipo: "CATALOGO", valor: 6800, data: "2024-12-01", valido: false },
]

const TIPO_COR: Record<string, { bg: string; text: string }> = {
  PNCP: { bg: "bg-blue-50", text: "text-blue-700" },
  PAINEL: { bg: "bg-purple-50", text: "text-purple-700" },
  COTACAO: { bg: "bg-green-50", text: "text-green-700" },
  CATALOGO: { bg: "bg-gray-100", text: "text-gray-600" },
}

function fmtMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 })
}

function calcEstatisticas(fontes: FontePreco[]) {
  const validas = fontes.filter((f) => f.valido).map((f) => f.valor)
  if (validas.length === 0) return null
  const sorted = [...validas].sort((a, b) => a - b)
  const media = validas.reduce((a, b) => a + b, 0) / validas.length
  const mediana = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)]
  const min = sorted[0]
  const max = sorted[sorted.length - 1]
  return { media, mediana, min, max, n: validas.length }
}

export default function PesquisaPrecosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [fontes, setFontes] = useState<FontePreco[]>(FONTES_EXEMPLO)
  const [adicionando, setAdicionando] = useState(false)
  const [buscandoPNCP, setBuscandoPNCP] = useState(false)
  const [novaFonte, setNovaFonte] = useState({ fonte: "", tipo: "COTACAO", valor: "", fornecedor: "" })

  const stats = calcEstatisticas(fontes)
  const fontesPNCP = fontes.filter((f) => f.tipo === "PNCP" || f.tipo === "PAINEL")
  const fontesCotacao = fontes.filter((f) => f.tipo === "COTACAO")

  const buscarNoPNCP = async () => {
    setBuscandoPNCP(true)
    try {
      await new Promise((r) => setTimeout(r, 1500)) // simula busca
    } finally {
      setBuscandoPNCP(false)
    }
  }

  const adicionarFonte = () => {
    setFontes((prev) => [...prev, {
      id: `manual-${Date.now()}`,
      fonte: novaFonte.fonte,
      tipo: novaFonte.tipo as FontePreco["tipo"],
      valor: parseFloat(novaFonte.valor.replace(",", ".")) || 0,
      data: new Date().toISOString().split("T")[0],
      fornecedor: novaFonte.fornecedor,
      valido: true,
    }])
    setNovaFonte({ fonte: "", tipo: "COTACAO", valor: "", fornecedor: "" })
    setAdicionando(false)
  }

  const removerFonte = (fid: string) => setFontes((prev) => prev.filter((f) => f.id !== fid))

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

      {/* Estatísticas */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-5">
          {[
            { label: "Mediana (referência)", valor: stats.mediana, destaque: true },
            { label: "Média", valor: stats.media, destaque: false },
            { label: "Menor preço", valor: stats.min, destaque: false },
            { label: "Maior preço", valor: stats.max, destaque: false },
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
        fontes.filter((f) => f.valido).length >= 3
          ? "bg-green-50 border-green-200"
          : "bg-yellow-50 border-yellow-200"
      }`}>
        {fontes.filter((f) => f.valido).length >= 3 ? (
          <Check className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
        ) : (
          <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5 shrink-0" />
        )}
        <div>
          <p className={`text-sm font-semibold ${fontes.filter((f) => f.valido).length >= 3 ? "text-green-700" : "text-yellow-700"}`}>
            {fontes.filter((f) => f.valido).length >= 3
              ? `${fontes.filter((f) => f.valido).length} fontes válidas — Conformidade com Art. 23`
              : `Apenas ${fontes.filter((f) => f.valido).length} fonte(s) válida(s) — Art. 23, §1º requer pelo menos 3`}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            PNCP: {fontesPNCP.length} · Cotações diretas: {fontesCotacao.length}
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
                    <SelectItem value="PAINEL">Painel de Preços Gov</SelectItem>
                    <SelectItem value="COTACAO">Cotação direta</SelectItem>
                    <SelectItem value="CATALOGO">Catálogo</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Valor unitário (R$)…"
                  value={novaFonte.valor}
                  onChange={(e) => setNovaFonte((p) => ({ ...p, valor: e.target.value }))}
                />
                {novaFonte.tipo === "COTACAO" && (
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
                <Button size="sm" onClick={adicionarFonte} disabled={!novaFonte.fonte || !novaFonte.valor} className="bg-[#1351b4] hover:bg-[#0c326f]">Salvar fonte</Button>
                <Button size="sm" variant="ghost" onClick={() => setAdicionando(false)}>Cancelar</Button>
              </div>
            </div>
          )}

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
              {fontes.map((f) => {
                const cor = TIPO_COR[f.tipo]
                return (
                  <tr key={f.id} className="border-b border-gray-50 hover:bg-gray-50/70">
                    <td className="px-5 py-3.5">
                      <div className="text-sm font-medium text-gray-800">{f.fonte}</div>
                      {f.fornecedor && <div className="text-xs text-gray-400 mt-0.5">{f.fornecedor}</div>}
                    </td>
                    <td className="px-3 py-3.5">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cor.bg} ${cor.text}`}>{f.tipo}</span>
                    </td>
                    <td className="px-3 py-3.5 text-right">
                      <span className="text-sm font-bold text-gray-800">{fmtMoeda(f.valor)}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      <span className="text-xs text-gray-500">{new Date(f.data).toLocaleDateString("pt-BR")}</span>
                    </td>
                    <td className="px-3 py-3.5">
                      {f.valido ? (
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
                      <button onClick={() => removerFonte(f.id)} className="text-gray-300 hover:text-red-400 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}
