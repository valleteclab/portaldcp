"use client"

import React, { useState, use, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import {
  ChevronRight,
  Home,
  Plus,
  Loader2,
  Trash2,
  ExternalLink,
  FileCheck,
  Upload,
  FileDown,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { API_URL, authFetch } from "@/lib/api"
import { CatalogoBusca } from "@/components/catalogo"

// ─── Tipos ────────────────────────────────────────────────────────────────────

type FontePesquisaTipo =
  | "PAINEL_DE_PRECOS"
  | "PNCP"
  | "CONTRATO_VIGENTE_SISTEMA"
  | "MIDIA_ESPECIALIZADA"
  | "FORNECEDOR_DIRETO"
  | "NOTA_FISCAL_ELETRONICA"
  | "OUTRA"

type Metodologia = "MEDIA" | "MEDIANA" | "MENOR_VALOR" | "OUTRA"

interface CotacaoPorFonte {
  fonte: FontePesquisaTipo
  descricao_fonte: string
  url_referencia?: string
  data_pesquisa: string
  fornecedor_cnpj?: string
  fornecedor_razao_social?: string
  valor_unitario: number
  observacao?: string
  documento_comprobatorio_path?: string
}

interface ItemPesquisaPrecos {
  item_numero: number
  descricao: string
  quantidade: number
  unidade: string
  cotacoes: CotacaoPorFonte[]
  valor_minimo?: number
  valor_maximo?: number
  valor_medio?: number
  valor_mediano?: number
  desvio_padrao?: number
  cv_percent?: number
  metodologia: Metodologia
  justificativa_metodologia?: string
  valor_referencial: number
  outliers_descartados?: Array<{ cotacao_index: number; motivo: string }>
  codigo_catalogo?: string
  codigo_catmat?: string
  codigo_catser?: string
  tipo_catalogo?: "MATERIAL" | "SERVICO"
}

interface ItemCatalogoSelecionado {
  id: string
  codigo: string
  descricao: string
  tipo: "MATERIAL" | "SERVICO"
  unidade_padrao?: string
}

interface Responsavel {
  nome: string
  cargo: string
  matricula?: string
  data_pesquisa: string
  observacoes?: string
}

interface DadosPrecos {
  itens: ItemPesquisaPrecos[]
  responsavel?: Responsavel
  metodologia_global?: Metodologia
  justificativa_metodologia_global?: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const FONTE_LABELS: Record<FontePesquisaTipo, string> = {
  PNCP: "PNCP",
  PAINEL_DE_PRECOS: "Painel de Preços",
  CONTRATO_VIGENTE_SISTEMA: "Contrato Vigente",
  MIDIA_ESPECIALIZADA: "Mídia Especializada",
  FORNECEDOR_DIRETO: "Fornecedor Direto",
  NOTA_FISCAL_ELETRONICA: "NF-e",
  OUTRA: "Outra",
}

const FONTE_BADGE_CLASS: Record<FontePesquisaTipo, string> = {
  PNCP: "bg-blue-100 text-blue-700 border-blue-200",
  PAINEL_DE_PRECOS: "bg-green-100 text-green-700 border-green-200",
  MIDIA_ESPECIALIZADA: "bg-purple-100 text-purple-700 border-purple-200",
  FORNECEDOR_DIRETO: "bg-orange-100 text-orange-700 border-orange-200",
  CONTRATO_VIGENTE_SISTEMA: "bg-teal-100 text-teal-700 border-teal-200",
  NOTA_FISCAL_ELETRONICA: "bg-pink-100 text-pink-700 border-pink-200",
  OUTRA: "bg-gray-100 text-gray-600 border-gray-200",
}

// ─── Utilitários ──────────────────────────────────────────────────────────────

function fmtMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function fmtData(d: string) {
  if (!d) return "—"
  return new Date(d + "T12:00:00").toLocaleDateString("pt-BR")
}

function calcMedia(vals: number[]) {
  if (!vals.length) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function calcMediana(vals: number[]) {
  if (!vals.length) return 0
  const sorted = [...vals].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function calcDesvio(vals: number[], media: number) {
  if (vals.length < 2) return 0
  const variancia = vals.reduce((acc, v) => acc + Math.pow(v - media, 2), 0) / vals.length
  return Math.sqrt(variancia)
}

function buildHistogram(vals: number[], buckets = 6) {
  if (!vals.length) return []
  const min = Math.min(...vals)
  const max = Math.max(...vals)
  if (min === max) return [{ count: vals.length, label: fmtMoeda(min) }]
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

function statsItem(item: ItemPesquisaPrecos) {
  const vals = item.cotacoes.map((c) => c.valor_unitario)
  const media = calcMedia(vals)
  const mediana = calcMediana(vals)
  const desvio = calcDesvio(vals, media)
  const cv = media > 0 ? (desvio / media) * 100 : 0
  const min = vals.length ? Math.min(...vals) : 0
  const max = vals.length ? Math.max(...vals) : 0
  const ref =
    item.metodologia === "MEDIANA"
      ? mediana
      : item.metodologia === "MENOR_VALOR"
      ? min
      : media
  return { media, mediana, desvio, cv, min, max, ref }
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

function StatusBadge({ count }: { count: number }) {
  if (count >= 3)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
        <Check className="w-3 h-3" /> {count}/3 fontes
      </span>
    )
  if (count > 0)
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">
        <AlertTriangle className="w-3 h-3" /> {count}/3 fontes
      </span>
    )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
      <X className="w-3 h-3" /> 0/3 fontes
    </span>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PesquisaPrecosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)

  const [dados, setDados] = useState<DadosPrecos | null>(null)
  const [loading, setLoading] = useState(true)

  // Aba 1 — Itens
  const [adicionandoItem, setAdicionandoItem] = useState(false)
  const [novoItem, setNovoItem] = useState({
    descricao: "",
    quantidade: "1",
    unidade: "UN",
    codigo_catalogo: "",
    codigo_catmat: "",
    codigo_catser: "",
    tipo_catalogo: "" as "" | "MATERIAL" | "SERVICO",
  })
  const [catalogoSelecionado, setCatalogoSelecionado] = useState<ItemCatalogoSelecionado | null>(null)
  const [salvandoItem, setSalvandoItem] = useState(false)
  const [removendoItem, setRemovendoItem] = useState<number | null>(null)

  // Aba 2 — Cotações
  const [expandidosCards, setExpandidosCards] = useState<Record<number, boolean>>({})
  const [adicionandoCotacao, setAdicionandoCotacao] = useState<Record<number, boolean>>({})
  const [novaCotacao, setNovaCotacao] = useState<
    Record<
      number,
      {
        fonte: FontePesquisaTipo
        descricao_fonte: string
        valor_unitario: string
        data_pesquisa: string
        url_referencia: string
        observacao: string
      }
    >
  >({})
  const [salvandoCotacao, setSalvandoCotacao] = useState<Record<number, boolean>>({})
  const [removendoCotacao, setRemovendoCotacao] = useState<string | null>(null)
  const [uploadingComprovante, setUploadingComprovante] = useState<string | null>(null)
  const [buscandoAuto, setBuscandoAuto] = useState<Record<number, boolean>>({})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // Aba 3 — Estatísticas
  const [metodologia, setMetodologia] = useState<Metodologia>("MEDIANA")
  const [justMetodologia, setJustMetodologia] = useState("")
  const [justCv, setJustCv] = useState("")
  const [outliersDescartados, setOutliersDescartados] = useState<
    Record<string, { marcado: boolean; motivo: string }>
  >({})
  const [salvandoMetodologia, setSalvandoMetodologia] = useState(false)

  // Aba 4 — Responsável
  const [responsavel, setResponsavel] = useState<Responsavel>({
    nome: "",
    cargo: "",
    matricula: "",
    data_pesquisa: new Date().toISOString().split("T")[0],
    observacoes: "",
  })
  const [salvandoResponsavel, setSalvandoResponsavel] = useState(false)

  // Aba 5 — Documento
  const [gerandoDoc, setGerandoDoc] = useState(false)
  const [urlDocumento, setUrlDocumento] = useState<string | null>(null)

  // ─── Carregar dados ──────────────────────────────────────────────────────

  const carregarDados = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/precos`)
      if (res.ok) {
        const data = await res.json()
        const d: DadosPrecos = data.dados ?? { itens: [] }
        setDados(d)
        if (d.responsavel) setResponsavel(d.responsavel)
        if (d.metodologia_global) setMetodologia(d.metodologia_global)
        if (d.justificativa_metodologia_global) setJustMetodologia(d.justificativa_metodologia_global)
      } else {
        setDados({ itens: [] })
      }
    } catch {
      setDados({ itens: [] })
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    carregarDados()
  }, [carregarDados])

  const itens = dados?.itens ?? []

  // ─── Aba 1 — Itens ───────────────────────────────────────────────────────

  const adicionarItem = async () => {
    setSalvandoItem(true)
    try {
      await authFetch(`${API_URL}/api/fase-interna/${id}/precos/item`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          descricao: novoItem.descricao,
          quantidade: parseFloat(novoItem.quantidade) || 1,
          unidade: novoItem.unidade,
          codigo_catalogo: novoItem.codigo_catalogo || undefined,
          codigo_catmat: novoItem.codigo_catmat || undefined,
          codigo_catser: novoItem.codigo_catser || undefined,
          tipo_catalogo: novoItem.tipo_catalogo || undefined,
        }),
      })
      await carregarDados()
      setNovoItem({
        descricao: "",
        quantidade: "1",
        unidade: "UN",
        codigo_catalogo: "",
        codigo_catmat: "",
        codigo_catser: "",
        tipo_catalogo: "",
      })
      setCatalogoSelecionado(null)
      setAdicionandoItem(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSalvandoItem(false)
    }
  }

  const removerItem = async (itemNumero: number) => {
    setRemovendoItem(itemNumero)
    try {
      await authFetch(`${API_URL}/api/fase-interna/${id}/precos/item/${itemNumero}`, {
        method: "DELETE",
      })
      await carregarDados()
    } catch (e) {
      console.error(e)
    } finally {
      setRemovendoItem(null)
    }
  }

  // ─── Aba 2 — Cotações ────────────────────────────────────────────────────

  const toggleCard = (itemNumero: number) => {
    setExpandidosCards((prev) => ({ ...prev, [itemNumero]: !prev[itemNumero] }))
  }

  const initNovaCotacao = (itemNumero: number) => {
    setNovaCotacao((prev) => ({
      ...prev,
      [itemNumero]: {
        fonte: "PNCP",
        descricao_fonte: "",
        valor_unitario: "",
        data_pesquisa: new Date().toISOString().split("T")[0],
        url_referencia: "",
        observacao: "",
      },
    }))
    setAdicionandoCotacao((prev) => ({ ...prev, [itemNumero]: true }))
  }

  const salvarCotacao = async (itemNumero: number) => {
    const c = novaCotacao[itemNumero]
    if (!c) return
    setSalvandoCotacao((prev) => ({ ...prev, [itemNumero]: true }))
    try {
      await authFetch(`${API_URL}/api/fase-interna/${id}/precos/fonte`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemNumero,
          cotacao: {
            fonte: c.fonte,
            descricao_fonte: c.descricao_fonte,
            valor_unitario: parseFloat(c.valor_unitario.replace(",", ".")) || 0,
            data_pesquisa: c.data_pesquisa,
            url_referencia: c.url_referencia || undefined,
            observacao: c.observacao || undefined,
          },
        }),
      })
      await carregarDados()
      setAdicionandoCotacao((prev) => ({ ...prev, [itemNumero]: false }))
    } catch (e) {
      console.error(e)
    } finally {
      setSalvandoCotacao((prev) => ({ ...prev, [itemNumero]: false }))
    }
  }

  const removerCotacao = async (itemNumero: number, cotacaoIndex: number) => {
    const key = `${itemNumero}-${cotacaoIndex}`
    setRemovendoCotacao(key)
    try {
      await authFetch(
        `${API_URL}/api/fase-interna/${id}/precos/fonte?item=${itemNumero}&index=${cotacaoIndex}`,
        { method: "DELETE" }
      )
      await carregarDados()
    } catch (e) {
      console.error(e)
    } finally {
      setRemovendoCotacao(null)
    }
  }

  const buscarAutomatico = async (item: ItemPesquisaPrecos) => {
    setBuscandoAuto((prev) => ({ ...prev, [item.item_numero]: true }))
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/precos/agente/executar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemNumeros: [item.item_numero],
          fontes: ["PNCP", "PAINEL_DE_PRECOS", "CONTRATO_VIGENTE_SISTEMA", "MIDIA_ESPECIALIZADA"],
          maxPorFonte: 5,
          autoAprovar: true,
          usarBrowserFallback: true,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        // resposta agora é getPrecos() — atualiza state direto
        const d: DadosPrecos = data.dados ?? { itens: [] }
        setDados(d)
        if (d.responsavel) setResponsavel(d.responsavel)
        if (d.metodologia_global) setMetodologia(d.metodologia_global)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setBuscandoAuto((prev) => ({ ...prev, [item.item_numero]: false }))
    }
  }

  const uploadComprovante = async (
    e: React.ChangeEvent<HTMLInputElement>,
    itemNumero: number,
    cotacaoIndex: number
  ) => {
    const file = e.target.files?.[0]
    if (!file) return
    const key = `${itemNumero}-${cotacaoIndex}`
    setUploadingComprovante(key)
    try {
      const form = new FormData()
      form.append("file", file)
      form.append("itemNumero", String(itemNumero))
      form.append("cotacaoIndex", String(cotacaoIndex))
      await authFetch(`${API_URL}/api/fase-interna/${id}/precos/comprovante`, {
        method: "POST",
        body: form,
      })
      await carregarDados()
    } catch (e) {
      console.error(e)
    } finally {
      setUploadingComprovante(null)
    }
  }

  // ─── Aba 3 — Estatísticas ────────────────────────────────────────────────

  const salvarMetodologia = async () => {
    setSalvandoMetodologia(true)
    try {
      await authFetch(`${API_URL}/api/fase-interna/${id}/precos/metodologia`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          metodologia,
          justificativa: justMetodologia || undefined,
        }),
      })
      await carregarDados()
    } catch (e) {
      console.error(e)
    } finally {
      setSalvandoMetodologia(false)
    }
  }

  // ─── Aba 4 — Responsável ─────────────────────────────────────────────────

  const salvarResponsavel = async () => {
    setSalvandoResponsavel(true)
    try {
      await authFetch(`${API_URL}/api/fase-interna/${id}/precos/responsavel`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(responsavel),
      })
      await carregarDados()
    } catch (e) {
      console.error(e)
    } finally {
      setSalvandoResponsavel(false)
    }
  }

  // ─── Aba 5 — Documento ───────────────────────────────────────────────────

  const gerarDocumento = async () => {
    setGerandoDoc(true)
    setUrlDocumento(null)
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/precos/gerar-documento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          responsavel,
          metodologia,
          justificativaMetodologia: justMetodologia || undefined,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setUrlDocumento(data.url || data.path || null)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setGerandoDoc(false)
    }
  }

  // ─── Checklist de conformidade ───────────────────────────────────────────

  const minFontes = itens.every((i) => i.cotacoes.length >= 3)
  const todasStats = itens.map((i) => statsItem(i))
  const cvOk = todasStats.every((s) => s.cv <= 25) || justCv.trim().length > 0
  const metOk = !!metodologia
  const respOk = !!(responsavel.nome && responsavel.cargo)
  const urlOuComprovante = itens.every((item) =>
    item.cotacoes.every((c) => c.url_referencia || c.documento_comprobatorio_path)
  )

  const conformidade = [
    { label: "Mínimo 3 fontes por item", ok: minFontes },
    { label: "CV ≤ 25% ou justificativa registrada", ok: cvOk },
    { label: "Metodologia selecionada", ok: metOk },
    { label: "Responsável identificado", ok: respOk },
    { label: "URL ou comprovante em cada cotação", ok: urlOuComprovante },
  ]
  const prontoParaGerar = conformidade.every((c) => c.ok) && itens.length > 0

  // ─── Loading state ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="p-6 flex items-center gap-2 text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando pesquisa de preços…
      </div>
    )
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 pb-16 max-w-7xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-4">
        <Home className="w-3.5 h-3.5" />
        <ChevronRight className="w-3 h-3" />
        <Link href="/orgao/fase-interna" className="hover:text-[#1351b4]">
          Fase Interna
        </Link>
        <ChevronRight className="w-3 h-3" />
        <Link href={`/orgao/fase-interna/processos/${id}`} className="hover:text-[#1351b4]">
          Processo
        </Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#1351b4] font-medium">Pesquisa de Preços</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Pesquisa de Preços</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Estimativa do valor da contratação · Art. 23 da Lei 14.133/2021 · IN SEGES/ME nº 65/2021
        </p>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="itens">
        <TabsList className="mb-6 bg-gray-100">
          <TabsTrigger value="itens">Itens</TabsTrigger>
          <TabsTrigger value="cotacoes">Cotações</TabsTrigger>
          <TabsTrigger value="estatisticas">Estatísticas</TabsTrigger>
          <TabsTrigger value="responsavel">Responsável</TabsTrigger>
          <TabsTrigger value="documento">Documento PP</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════════
            ABA 1 — ITENS
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="itens">
          <Card className="border border-gray-100 shadow-sm">
            <CardHeader className="pb-3 flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Itens da pesquisa</CardTitle>
              <Button
                size="sm"
                onClick={() => setAdicionandoItem(true)}
                disabled={adicionandoItem}
                className="bg-[#1351b4] hover:bg-[#0c326f]"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar item
              </Button>
            </CardHeader>
            <CardContent>
              {/* Formulário inline */}
              {adicionandoItem && (
                <div className="mb-5 p-4 bg-[#f6f9fd] border border-[#dbe8fb] rounded-lg">
                  <p className="text-xs font-semibold text-gray-700 mb-3">Novo item</p>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600 mb-1 block">
                        Buscar no CATMAT/CATSER
                      </label>
                      <CatalogoBusca
                        value={catalogoSelecionado}
                        onChange={(item) => {
                          setCatalogoSelecionado(item)
                          if (!item) {
                            setNovoItem((p) => ({
                              ...p,
                              codigo_catalogo: "",
                              codigo_catmat: "",
                              codigo_catser: "",
                              tipo_catalogo: "",
                            }))
                            return
                          }
                          setNovoItem((p) => ({
                            ...p,
                            descricao: item.descricao || p.descricao,
                            unidade: item.unidade_padrao || p.unidade,
                            codigo_catalogo: item.codigo,
                            codigo_catmat: item.tipo === "MATERIAL" ? item.codigo : "",
                            codigo_catser: item.tipo === "SERVICO" ? item.codigo : "",
                            tipo_catalogo: item.tipo,
                          }))
                        }}
                        placeholder="Pesquisar material ou serviço no catálogo federal"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600 mb-1 block">Descrição *</label>
                      <Input
                        placeholder="Ex: Serviço de limpeza predial"
                        value={novoItem.descricao}
                        onChange={(e) => setNovoItem((p) => ({ ...p, descricao: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Quantidade *</label>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        placeholder="1"
                        value={novoItem.quantidade}
                        onChange={(e) => setNovoItem((p) => ({ ...p, quantidade: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Unidade *</label>
                      <Input
                        placeholder="UN, M², KG, SV…"
                        value={novoItem.unidade}
                        onChange={(e) => setNovoItem((p) => ({ ...p, unidade: e.target.value }))}
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-600 mb-1 block">
                        Código CATMAT/CATSER (opcional)
                      </label>
                      <Input
                        placeholder="Ex: 20117"
                        value={novoItem.codigo_catalogo || novoItem.codigo_catmat || novoItem.codigo_catser}
                        onChange={(e) => {
                          const codigo = e.target.value
                          setNovoItem((p) => ({
                            ...p,
                            codigo_catalogo: codigo,
                            codigo_catmat: p.tipo_catalogo === "SERVICO" ? "" : codigo,
                            codigo_catser: p.tipo_catalogo === "SERVICO" ? codigo : "",
                          }))
                        }}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={adicionarItem}
                      disabled={!novoItem.descricao || !novoItem.unidade || salvandoItem}
                      className="bg-[#1351b4] hover:bg-[#0c326f]"
                    >
                      {salvandoItem ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Salvar item"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setAdicionandoItem(false)
                        setCatalogoSelecionado(null)
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {/* Estado vazio */}
              {itens.length === 0 && !adicionandoItem && (
                <div className="py-16 text-center">
                  <p className="text-sm text-gray-400 mb-1">Nenhum item definido ainda.</p>
                  <p className="text-xs text-gray-400 mb-4">
                    Adicione os itens que precisam ter seus preços pesquisados.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setAdicionandoItem(true)}
                    className="bg-[#1351b4] hover:bg-[#0c326f]"
                  >
                    <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar primeiro item
                  </Button>
                </div>
              )}

              {/* Lista de itens */}
              {itens.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5 w-10">Nº</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5">Descrição</th>
                        <th className="text-right text-xs font-semibold text-gray-500 px-3 py-2.5">Quantidade</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5">Unidade</th>
                        <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2.5">CATMAT/CATSER</th>
                        <th className="w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {itens.map((item) => (
                        <tr key={item.item_numero} className="border-b border-gray-50 hover:bg-gray-50/60">
                          <td className="px-3 py-3 text-xs text-gray-500">{item.item_numero}</td>
                          <td className="px-3 py-3 text-sm text-gray-800">{item.descricao}</td>
                          <td className="px-3 py-3 text-sm text-gray-700 text-right">{item.quantidade}</td>
                          <td className="px-3 py-3 text-sm text-gray-700">{item.unidade}</td>
                          <td className="px-3 py-3 text-xs text-gray-500">
                            {item.codigo_catmat || item.codigo_catser || item.codigo_catalogo || "—"}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => removerItem(item.item_numero)}
                              disabled={removendoItem === item.item_numero}
                              className="text-gray-300 hover:text-red-500 transition-colors"
                              title="Remover item"
                            >
                              {removendoItem === item.item_numero ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            ABA 2 — COTAÇÕES
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="cotacoes">
          {itens.length === 0 && (
            <div className="py-16 text-center text-sm text-gray-400">
              Nenhum item definido. Vá à aba <strong>Itens</strong> para adicionar itens à pesquisa.
            </div>
          )}

          <div className="space-y-4">
            {itens.map((item) => {
              const expandido = expandidosCards[item.item_numero] ?? true
              const buscando = buscandoAuto[item.item_numero] ?? false

              return (
                <Card key={item.item_numero} className="border border-gray-100 shadow-sm">
                  {/* Header do card */}
                  <div
                    className="flex items-center justify-between px-5 py-3.5 cursor-pointer select-none"
                    onClick={() => toggleCard(item.item_numero)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-gray-400 font-mono">#{item.item_numero}</span>
                      <span className="text-sm font-semibold text-gray-800">{item.descricao}</span>
                      <StatusBadge count={item.cotacoes.length} />
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => buscarAutomatico(item)}
                        disabled={buscando}
                        className="text-[#1351b4] border-[#c5d4eb] text-xs"
                      >
                        {buscando ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Buscando…
                          </>
                        ) : (
                          <>
                            <Search className="w-3.5 h-3.5 mr-1.5" /> Buscar automaticamente
                          </>
                        )}
                      </Button>
                      {expandido ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {expandido && (
                    <CardContent className="pt-0 pb-4">
                      {/* Tabela de cotações */}
                      {item.cotacoes.length > 0 ? (
                        <div className="overflow-x-auto mb-4">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-100">
                                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2 w-8">Nº</th>
                                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2">Tipo</th>
                                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2">Fonte / Descrição</th>
                                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2">Data</th>
                                <th className="text-right text-xs font-semibold text-gray-500 px-3 py-2">Valor Unit.</th>
                                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2">URL</th>
                                <th className="text-left text-xs font-semibold text-gray-500 px-3 py-2">Comprovante</th>
                                <th className="w-10" />
                              </tr>
                            </thead>
                            <tbody>
                              {item.cotacoes.map((cot, idx) => {
                                const removeKey = `${item.item_numero}-${idx}`
                                const uploadKey = `${item.item_numero}-${idx}`
                                return (
                                  <tr
                                    key={idx}
                                    className="border-b border-gray-50 hover:bg-gray-50/60"
                                  >
                                    <td className="px-3 py-3 text-xs text-gray-400">{idx + 1}</td>
                                    <td className="px-3 py-3">
                                      <span
                                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                                          FONTE_BADGE_CLASS[cot.fonte] ?? FONTE_BADGE_CLASS.OUTRA
                                        }`}
                                      >
                                        {FONTE_LABELS[cot.fonte] ?? cot.fonte}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3">
                                      <p className="text-xs text-gray-700 max-w-[180px] truncate" title={cot.descricao_fonte}>
                                        {cot.descricao_fonte || "—"}
                                      </p>
                                      {cot.observacao && (
                                        <p className="text-[10px] text-gray-400 mt-0.5 max-w-[180px] truncate">
                                          {cot.observacao}
                                        </p>
                                      )}
                                    </td>
                                    <td className="px-3 py-3">
                                      <span className="text-xs text-gray-500">
                                        {fmtData(cot.data_pesquisa)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3 text-right">
                                      <span className="text-sm font-bold text-gray-800">
                                        {fmtMoeda(cot.valor_unitario)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-3">
                                      {cot.url_referencia ? (
                                        <a
                                          href={cot.url_referencia}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-[#1351b4] hover:underline text-xs"
                                        >
                                          <ExternalLink className="w-3 h-3" /> Ver
                                        </a>
                                      ) : (
                                        <span className="text-xs text-gray-300">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-3">
                                      {cot.documento_comprobatorio_path ? (
                                        <a
                                          href={`${API_URL}/${cot.documento_comprobatorio_path}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-green-600 hover:underline text-xs"
                                        >
                                          <FileCheck className="w-3.5 h-3.5" /> Ver arquivo
                                        </a>
                                      ) : (
                                        <>
                                          <input
                                            type="file"
                                            accept="application/pdf,image/jpeg,image/png"
                                            className="hidden"
                                            ref={(el) => {
                                              fileInputRefs.current[uploadKey] = el
                                            }}
                                            onChange={(e) =>
                                              uploadComprovante(e, item.item_numero, idx)
                                            }
                                          />
                                          <button
                                            onClick={() =>
                                              fileInputRefs.current[uploadKey]?.click()
                                            }
                                            disabled={uploadingComprovante === uploadKey}
                                            className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#1351b4] transition-colors"
                                          >
                                            {uploadingComprovante === uploadKey ? (
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                              <Upload className="w-3.5 h-3.5" />
                                            )}
                                            Enviar
                                          </button>
                                        </>
                                      )}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <button
                                        onClick={() => removerCotacao(item.item_numero, idx)}
                                        disabled={removendoCotacao === removeKey}
                                        className="text-gray-300 hover:text-red-500 transition-colors"
                                        title="Remover cotação"
                                      >
                                        {removendoCotacao === removeKey ? (
                                          <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                          <Trash2 className="w-4 h-4" />
                                        )}
                                      </button>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="py-6 text-center text-xs text-gray-400 mb-3">
                          Nenhuma cotação registrada. Busque automaticamente ou adicione manualmente.
                        </div>
                      )}

                      {/* Formulário de nova cotação */}
                      {adicionandoCotacao[item.item_numero] ? (
                        <div className="p-4 bg-[#f6f9fd] border border-[#dbe8fb] rounded-lg">
                          <p className="text-xs font-semibold text-gray-700 mb-3">Nova cotação</p>
                          <div className="grid grid-cols-2 gap-3 mb-3">
                            <div>
                              <label className="text-xs text-gray-600 mb-1 block">Tipo *</label>
                              <Select
                                value={novaCotacao[item.item_numero]?.fonte ?? "PNCP"}
                                onValueChange={(v) =>
                                  setNovaCotacao((prev) => ({
                                    ...prev,
                                    [item.item_numero]: {
                                      ...prev[item.item_numero],
                                      fonte: v as FontePesquisaTipo,
                                    },
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {(Object.keys(FONTE_LABELS) as FontePesquisaTipo[]).map((k) => (
                                    <SelectItem key={k} value={k}>
                                      {FONTE_LABELS[k]}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 mb-1 block">
                                Descrição da fonte *
                              </label>
                              <Input
                                placeholder="Ex: PNCP — Prefeitura de SP"
                                value={novaCotacao[item.item_numero]?.descricao_fonte ?? ""}
                                onChange={(e) =>
                                  setNovaCotacao((prev) => ({
                                    ...prev,
                                    [item.item_numero]: {
                                      ...prev[item.item_numero],
                                      descricao_fonte: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 mb-1 block">
                                Valor unitário (R$) *
                              </label>
                              <Input
                                type="number"
                                min="0"
                                step="any"
                                placeholder="0,00"
                                value={novaCotacao[item.item_numero]?.valor_unitario ?? ""}
                                onChange={(e) =>
                                  setNovaCotacao((prev) => ({
                                    ...prev,
                                    [item.item_numero]: {
                                      ...prev[item.item_numero],
                                      valor_unitario: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600 mb-1 block">
                                Data da pesquisa *
                              </label>
                              <Input
                                type="date"
                                value={
                                  novaCotacao[item.item_numero]?.data_pesquisa ??
                                  new Date().toISOString().split("T")[0]
                                }
                                onChange={(e) =>
                                  setNovaCotacao((prev) => ({
                                    ...prev,
                                    [item.item_numero]: {
                                      ...prev[item.item_numero],
                                      data_pesquisa: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs text-gray-600 mb-1 block">
                                URL de referência
                              </label>
                              <Input
                                type="url"
                                placeholder="https://…"
                                value={novaCotacao[item.item_numero]?.url_referencia ?? ""}
                                onChange={(e) =>
                                  setNovaCotacao((prev) => ({
                                    ...prev,
                                    [item.item_numero]: {
                                      ...prev[item.item_numero],
                                      url_referencia: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs text-gray-600 mb-1 block">Observação</label>
                              <Input
                                placeholder="Observação opcional"
                                value={novaCotacao[item.item_numero]?.observacao ?? ""}
                                onChange={(e) =>
                                  setNovaCotacao((prev) => ({
                                    ...prev,
                                    [item.item_numero]: {
                                      ...prev[item.item_numero],
                                      observacao: e.target.value,
                                    },
                                  }))
                                }
                              />
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => salvarCotacao(item.item_numero)}
                              disabled={
                                !novaCotacao[item.item_numero]?.descricao_fonte ||
                                !novaCotacao[item.item_numero]?.valor_unitario ||
                                salvandoCotacao[item.item_numero]
                              }
                              className="bg-[#1351b4] hover:bg-[#0c326f]"
                            >
                              {salvandoCotacao[item.item_numero] ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                "Salvar"
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                setAdicionandoCotacao((prev) => ({
                                  ...prev,
                                  [item.item_numero]: false,
                                }))
                              }
                            >
                              Cancelar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => initNovaCotacao(item.item_numero)}
                          className="text-[#1351b4] border-[#c5d4eb]"
                        >
                          <Plus className="w-3.5 h-3.5 mr-1.5" /> Adicionar cotação manualmente
                        </Button>
                      )}
                    </CardContent>
                  )}
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            ABA 3 — ESTATÍSTICAS
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="estatisticas">
          {itens.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">
              Nenhum item com cotações. Preencha as abas anteriores primeiro.
            </div>
          ) : (
            <div className="space-y-6">
              {itens.map((item) => {
                const s = statsItem(item)
                const histVals = item.cotacoes.map((c) => c.valor_unitario)
                const bars = buildHistogram(histVals)
                const maxCount = Math.max(...bars.map((b) => b.count), 1)
                const cvAlto = s.cv > 25

                return (
                  <Card key={item.item_numero} className="border border-gray-100 shadow-sm">
                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-mono">#{item.item_numero}</span>
                        <CardTitle className="text-sm font-semibold">{item.descricao}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      {item.cotacoes.length < 2 ? (
                        <p className="text-xs text-gray-400">
                          Mínimo 2 cotações para calcular estatísticas.
                        </p>
                      ) : (
                        <>
                          {/* KPI cards */}
                          <div className="grid grid-cols-4 gap-3 mb-5">
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                              <p className="text-[10px] text-gray-500 mb-0.5">Valor médio</p>
                              <p className="text-base font-bold text-gray-800">{fmtMoeda(s.media)}</p>
                              <p className="text-[10px] text-gray-400">Aritmético simples</p>
                            </div>
                            <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                              <p className="text-[10px] text-gray-500 mb-0.5">Mediana</p>
                              <p className="text-base font-bold text-gray-800">{fmtMoeda(s.mediana)}</p>
                              <p className="text-[10px] text-gray-400">Recomendado IN 65</p>
                            </div>
                            <div className={`p-3 rounded-lg border ${cvAlto ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-100"}`}>
                              <p className="text-[10px] text-gray-500 mb-0.5">CV%</p>
                              <p className={`text-base font-bold ${cvAlto ? "text-red-600" : "text-gray-800"}`}>
                                {s.cv.toFixed(1)}%
                              </p>
                              <p className="text-[10px] text-gray-400">Coef. variação</p>
                            </div>
                            <div className="p-3 bg-[#1351b4]/5 rounded-lg border border-[#1351b4]/20">
                              <p className="text-[10px] text-gray-500 mb-0.5">Valor referencial</p>
                              <p className="text-base font-bold text-[#1351b4]">
                                {fmtMoeda(item.valor_referencial || s.mediana)}
                              </p>
                              <p className="text-[10px] text-gray-400">Unitário estimado</p>
                            </div>
                          </div>

                          {/* Mini tabela de stats */}
                          <div className="overflow-x-auto mb-4">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-gray-100">
                                  {["Mín.", "Máx.", "Média", "Mediana", "Desvio", "CV%"].map((h) => (
                                    <th key={h} className="text-left font-semibold text-gray-500 px-2 py-1.5">
                                      {h}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td className="px-2 py-2 text-gray-700">{fmtMoeda(s.min)}</td>
                                  <td className="px-2 py-2 text-gray-700">{fmtMoeda(s.max)}</td>
                                  <td className="px-2 py-2 text-gray-700">{fmtMoeda(s.media)}</td>
                                  <td className="px-2 py-2 text-gray-700">{fmtMoeda(s.mediana)}</td>
                                  <td className="px-2 py-2 text-gray-700">{fmtMoeda(s.desvio)}</td>
                                  <td className={`px-2 py-2 font-semibold ${cvAlto ? "text-red-600" : "text-gray-700"}`}>
                                    {s.cv.toFixed(1)}%
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          {/* Alerta CV > 25% */}
                          {cvAlto && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-xs font-semibold text-red-700 mb-1">
                                    Coeficiente de variação acima de 25%
                                  </p>
                                  <p className="text-xs text-red-600 mb-2">
                                    IN 65/2021 recomenda buscar mais fontes ou justificar formalmente.
                                  </p>
                                  <label className="text-xs text-gray-600 mb-1 block">
                                    Justificativa *
                                  </label>
                                  <Textarea
                                    placeholder="Justifique formalmente a dispersão dos preços…"
                                    value={justCv}
                                    onChange={(e) => setJustCv(e.target.value)}
                                    className="text-xs min-h-[60px]"
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Outliers */}
                          <div className="mb-4">
                            <p className="text-xs font-semibold text-gray-700 mb-2">
                              Outliers (marque para descartar)
                            </p>
                            <div className="space-y-1.5">
                              {item.cotacoes.map((cot, idx) => {
                                const key = `${item.item_numero}-${idx}`
                                const state = outliersDescartados[key] ?? { marcado: false, motivo: "" }
                                return (
                                  <div key={idx} className="flex items-start gap-2">
                                    <input
                                      type="checkbox"
                                      id={`outlier-${key}`}
                                      checked={state.marcado}
                                      onChange={(e) =>
                                        setOutliersDescartados((prev) => ({
                                          ...prev,
                                          [key]: { ...prev[key], marcado: e.target.checked, motivo: prev[key]?.motivo ?? "" },
                                        }))
                                      }
                                      className="mt-0.5 accent-[#1351b4]"
                                    />
                                    <label htmlFor={`outlier-${key}`} className="text-xs text-gray-700 flex-1">
                                      <span className="font-medium">{fmtMoeda(cot.valor_unitario)}</span>{" "}
                                      — {cot.descricao_fonte || FONTE_LABELS[cot.fonte]}
                                      {state.marcado && (
                                        <Input
                                          placeholder="Motivo do descarte *"
                                          className="mt-1 text-xs h-7"
                                          value={state.motivo}
                                          onChange={(e) =>
                                            setOutliersDescartados((prev) => ({
                                              ...prev,
                                              [key]: { ...prev[key], motivo: e.target.value },
                                            }))
                                          }
                                        />
                                      )}
                                    </label>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Histograma */}
                          {bars.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-gray-700 mb-2">Histograma</p>
                              <div className="flex items-end gap-1.5 h-20">
                                {bars.map((bar, i) => (
                                  <div key={i} className="flex-1 flex flex-col items-center justify-end">
                                    <div
                                      className="w-full bg-[#1351b4] rounded-t opacity-75"
                                      style={{
                                        height: `${(bar.count / maxCount) * 100}%`,
                                        minHeight: bar.count > 0 ? 4 : 0,
                                      }}
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="flex justify-between mt-1">
                                <span className="text-[10px] text-gray-400">{fmtMoeda(s.min)}</span>
                                <span className="text-[10px] text-gray-400">{fmtMoeda(s.max)}</span>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                )
              })}

              {/* Metodologia */}
              <Card className="border border-gray-100 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Metodologia</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-xs text-gray-600 mb-1 block">Método de referência *</label>
                    <Select
                      value={metodologia}
                      onValueChange={(v) => setMetodologia(v as Metodologia)}
                    >
                      <SelectTrigger className="max-w-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MEDIANA">Mediana (recomendada — IN 65/2021)</SelectItem>
                        <SelectItem value="MEDIA">Média aritmética</SelectItem>
                        <SelectItem value="MENOR_VALOR">Menor valor</SelectItem>
                        <SelectItem value="OUTRA">Outra (justificar)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {metodologia === "OUTRA" && (
                    <div>
                      <label className="text-xs text-gray-600 mb-1 block">Justificativa *</label>
                      <Textarea
                        placeholder="Descreva e justifique a metodologia adotada…"
                        value={justMetodologia}
                        onChange={(e) => setJustMetodologia(e.target.value)}
                        className="text-xs min-h-[80px]"
                      />
                    </div>
                  )}
                  <Button
                    size="sm"
                    onClick={salvarMetodologia}
                    disabled={salvandoMetodologia || (metodologia === "OUTRA" && !justMetodologia.trim())}
                    className="bg-[#1351b4] hover:bg-[#0c326f]"
                  >
                    {salvandoMetodologia ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      "Salvar configurações"
                    )}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            ABA 4 — RESPONSÁVEL
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="responsavel">
          <Card className="border border-gray-100 shadow-sm max-w-2xl">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold">Responsável pela pesquisa</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Nome completo *</label>
                <Input
                  placeholder="Nome do servidor responsável"
                  value={responsavel.nome}
                  onChange={(e) => setResponsavel((p) => ({ ...p, nome: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Cargo / Função *</label>
                <Input
                  placeholder="Ex: Analista de Licitações"
                  value={responsavel.cargo}
                  onChange={(e) => setResponsavel((p) => ({ ...p, cargo: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Matrícula (opcional)</label>
                <Input
                  placeholder="Nº de matrícula"
                  value={responsavel.matricula ?? ""}
                  onChange={(e) => setResponsavel((p) => ({ ...p, matricula: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Data da pesquisa *</label>
                <Input
                  type="date"
                  value={responsavel.data_pesquisa}
                  onChange={(e) =>
                    setResponsavel((p) => ({ ...p, data_pesquisa: e.target.value }))
                  }
                />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Observações gerais</label>
                <Textarea
                  placeholder="Informações adicionais sobre a condução da pesquisa…"
                  value={responsavel.observacoes ?? ""}
                  onChange={(e) => setResponsavel((p) => ({ ...p, observacoes: e.target.value }))}
                  className="text-xs min-h-[90px]"
                />
              </div>
              <Button
                size="sm"
                onClick={salvarResponsavel}
                disabled={
                  !responsavel.nome || !responsavel.cargo || !responsavel.data_pesquisa || salvandoResponsavel
                }
                className="bg-[#1351b4] hover:bg-[#0c326f]"
              >
                {salvandoResponsavel ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  "Salvar responsável"
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════════
            ABA 5 — DOCUMENTO PP
        ═══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="documento">
          <div className="max-w-2xl space-y-5">
            {/* Checklist */}
            <Card className="border border-gray-100 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Checklist de conformidade</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2.5">
                  {conformidade.map((item, i) => (
                    <li key={i} className="flex items-center gap-2.5">
                      <span
                        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
                          item.ok ? "bg-green-100 text-green-600" : "bg-red-100 text-red-500"
                        }`}
                      >
                        {item.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                      </span>
                      <span className={`text-sm ${item.ok ? "text-gray-700" : "text-gray-500"}`}>
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>

                <div
                  className={`mt-4 px-3 py-2 rounded-lg border text-xs font-semibold ${
                    prontoParaGerar
                      ? "bg-green-50 border-green-200 text-green-700"
                      : "bg-yellow-50 border-yellow-200 text-yellow-700"
                  }`}
                >
                  {prontoParaGerar ? "Pronto para gerar o documento" : "Pendências encontradas — resolva os itens acima"}
                </div>
              </CardContent>
            </Card>

            {/* Gerar documento */}
            <Card className="border border-gray-100 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Gerar Documento PP</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  size="lg"
                  onClick={gerarDocumento}
                  disabled={!prontoParaGerar || gerandoDoc}
                  className="w-full bg-[#1351b4] hover:bg-[#0c326f] text-white font-semibold"
                >
                  {gerandoDoc ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Gerando documento…
                    </>
                  ) : (
                    <>
                      <FileDown className="w-4 h-4 mr-2" /> Gerar Documento PP (PDF)
                    </>
                  )}
                </Button>

                {urlDocumento && (
                  <a
                    href={urlDocumento.startsWith("http") ? urlDocumento : `${API_URL}/${urlDocumento}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[#1351b4] hover:underline text-sm font-medium"
                  >
                    <FileDown className="w-4 h-4" /> Baixar documento gerado
                  </a>
                )}

                <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg">
                  <p className="text-xs text-blue-700 leading-relaxed">
                    O documento gerado deve ser assinado pelo responsável e anexado ao processo.
                    A pesquisa de preços tem validade de 6 meses (IN 65/2021, Art. 5º).
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
