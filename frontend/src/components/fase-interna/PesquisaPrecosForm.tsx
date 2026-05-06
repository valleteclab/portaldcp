"use client"

import { useState } from "react"
import {
  AlertCircle,
  ChevronDown,
  Plus,
  Trash2,
  Save,
  ShoppingCart,
  TrendingUp,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// =============================================================================
// Tipos (replicados de backend/src/fase-interna/types/pesquisa-precos.type.ts)
// =============================================================================
export type FontePesquisaTipo =
  | "PAINEL_DE_PRECOS"
  | "PNCP"
  | "CONTRATO_VIGENTE_SISTEMA"
  | "MIDIA_ESPECIALIZADA"
  | "FORNECEDOR_DIRETO"
  | "NOTA_FISCAL_ELETRONICA"
  | "OUTRA"

export interface CotacaoPorFonte {
  fonte: FontePesquisaTipo
  descricao_fonte: string
  url_referencia?: string
  data_pesquisa: string
  fornecedor_cnpj?: string
  fornecedor_razao_social?: string
  valor_unitario: number
  observacao?: string
}

export interface ItemPesquisaPrecos {
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
  metodologia: "MEDIA" | "MEDIANA" | "MENOR_VALOR" | "OUTRA"
  justificativa_metodologia?: string
  valor_referencial: number
}

export interface PesquisaPrecosDados {
  itens: ItemPesquisaPrecos[]
  metodologia_geral?: string
  observacoes?: string
  valor_total_estimado?: number
  responsavel_pesquisa?: {
    nome: string
    cargo: string
    matricula?: string
  }
}

// =============================================================================
// Helpers
// =============================================================================
const FONTE_LABELS: Record<FontePesquisaTipo, string> = {
  PAINEL_DE_PRECOS: "Painel de Preços (paineldeprecos.planejamento.gov.br)",
  PNCP: "PNCP — Portal Nacional de Contratações Públicas",
  CONTRATO_VIGENTE_SISTEMA: "Contrato Vigente no Sistema",
  MIDIA_ESPECIALIZADA: "Mídia / Sítio Eletrônico Especializado",
  FORNECEDOR_DIRETO: "Fornecedor Direto (cotação presencial/eletrônica)",
  NOTA_FISCAL_ELETRONICA: "Base Nacional de Notas Fiscais Eletrônicas",
  OUTRA: "Outra fonte",
}

const METODOLOGIA_LABELS: Record<ItemPesquisaPrecos["metodologia"], string> = {
  MEDIA: "Média aritmética",
  MEDIANA: "Mediana",
  MENOR_VALOR: "Menor valor obtido",
  OUTRA: "Outra metodologia (justificar)",
}

function fontesDistintas(cotacoes: CotacaoPorFonte[]): number {
  return new Set(cotacoes.map((c) => c.fonte)).size
}

function formatBRL(v?: number): string {
  if (v == null) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

function novaCotacao(): CotacaoPorFonte {
  return {
    fonte: "PAINEL_DE_PRECOS",
    descricao_fonte: "",
    data_pesquisa: "",
    valor_unitario: 0,
  }
}

function novoItem(numero: number): ItemPesquisaPrecos {
  return {
    item_numero: numero,
    descricao: "",
    quantidade: 1,
    unidade: "",
    cotacoes: [novaCotacao()],
    metodologia: "MEDIA",
    valor_referencial: 0,
  }
}

// =============================================================================
// Section accordion helper
// =============================================================================
function Section({
  numero,
  titulo,
  obrigatorio = true,
  defaultOpen = false,
  badge,
  children,
}: {
  numero: string
  titulo: string
  obrigatorio?: boolean
  defaultOpen?: boolean
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border rounded-lg bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2 text-left flex-wrap">
          <span className="font-bold text-blue-600 w-12">{numero}</span>
          <span className="font-medium">{titulo}</span>
          {obrigatorio && (
            <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
              obrigatório
            </Badge>
          )}
          {badge}
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform flex-shrink-0", open && "rotate-180")} />
      </button>
      {open && <div className="p-4 border-t space-y-3">{children}</div>}
    </div>
  )
}

// =============================================================================
// CotacaoCard
// =============================================================================
function CotacaoCard({
  cotacao,
  index,
  onChange,
  onRemove,
}: {
  cotacao: CotacaoPorFonte
  index: number
  onChange: (patch: Partial<CotacaoPorFonte>) => void
  onRemove: () => void
}) {
  return (
    <div className="border rounded-lg p-3 bg-slate-50 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm text-slate-700">Cotação #{index + 1}</span>
        <Button size="sm" variant="ghost" type="button" onClick={onRemove}>
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>

      {/* Fonte */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Fonte *</Label>
          <select
            className="w-full border rounded h-9 px-2 bg-white text-sm mt-1"
            value={cotacao.fonte}
            onChange={(e) => onChange({ fonte: e.target.value as FontePesquisaTipo })}
          >
            {(Object.keys(FONTE_LABELS) as FontePesquisaTipo[]).map((f) => (
              <option key={f} value={f}>
                {FONTE_LABELS[f]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label className="text-xs">Descrição da fonte *</Label>
          <Input
            className="mt-1"
            placeholder='Ex: "Painel de Preços", "Loja XPTO"'
            value={cotacao.descricao_fonte}
            onChange={(e) => onChange({ descricao_fonte: e.target.value })}
          />
        </div>
      </div>

      {/* URL e Data */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">URL de referência (opcional)</Label>
          <Input
            className="mt-1"
            type="url"
            placeholder="https://..."
            value={cotacao.url_referencia || ""}
            onChange={(e) => onChange({ url_referencia: e.target.value || undefined })}
          />
        </div>
        <div>
          <Label className="text-xs">Data da pesquisa *</Label>
          <Input
            className="mt-1"
            type="date"
            value={cotacao.data_pesquisa}
            onChange={(e) => onChange({ data_pesquisa: e.target.value })}
          />
        </div>
      </div>

      {/* Fornecedor (somente FORNECEDOR_DIRETO) */}
      {cotacao.fonte === "FORNECEDOR_DIRETO" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-2 border rounded bg-amber-50">
          <div>
            <Label className="text-xs text-amber-700">CNPJ do fornecedor *</Label>
            <Input
              className="mt-1"
              placeholder="00.000.000/0000-00"
              value={cotacao.fornecedor_cnpj || ""}
              onChange={(e) => onChange({ fornecedor_cnpj: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs text-amber-700">Razão social</Label>
            <Input
              className="mt-1"
              placeholder="Razão social do fornecedor"
              value={cotacao.fornecedor_razao_social || ""}
              onChange={(e) => onChange({ fornecedor_razao_social: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Valor unitário e Observação */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Valor unitário (R$) *</Label>
          <Input
            className="mt-1"
            type="number"
            step="0.0001"
            min="0"
            placeholder="0,00"
            value={cotacao.valor_unitario || ""}
            onChange={(e) => onChange({ valor_unitario: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div>
          <Label className="text-xs">Observação (opcional)</Label>
          <Input
            className="mt-1"
            placeholder="Observação sobre esta cotação"
            value={cotacao.observacao || ""}
            onChange={(e) => onChange({ observacao: e.target.value || undefined })}
          />
        </div>
      </div>
    </div>
  )
}

// =============================================================================
// ItemCard
// =============================================================================
function ItemCard({
  item,
  index,
  onChange,
  onRemove,
}: {
  item: ItemPesquisaPrecos
  index: number
  onChange: (patch: Partial<ItemPesquisaPrecos>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(index === 0)
  const nFontes = fontesDistintas(item.cotacoes)
  const fontesBadgeOk = nFontes >= 3

  const addCotacao = () => onChange({ cotacoes: [...item.cotacoes, novaCotacao()] })
  const removeCotacao = (ci: number) => onChange({ cotacoes: item.cotacoes.filter((_, i) => i !== ci) })
  const updateCotacao = (ci: number, patch: Partial<CotacaoPorFonte>) => {
    const arr = item.cotacoes.map((c, i) => (i === ci ? { ...c, ...patch } : c))
    onChange({ cotacoes: arr })
  }

  const hasStats =
    item.valor_minimo != null ||
    item.valor_maximo != null ||
    item.valor_medio != null

  return (
    <div className="border rounded-lg bg-white">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50"
      >
        <div className="flex items-center gap-2 text-left flex-wrap">
          <ShoppingCart className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <span className="font-medium">
            Item {item.item_numero}
            {item.descricao ? ` — ${item.descricao.substring(0, 40)}${item.descricao.length > 40 ? "…" : ""}` : ""}
          </span>
          <Badge
            variant="outline"
            className={cn(
              "text-xs",
              fontesBadgeOk
                ? "border-green-300 text-green-700 bg-green-50"
                : "border-red-400 text-red-700 bg-red-50"
            )}
          >
            {nFontes} fonte{nFontes !== 1 ? "s" : ""} distinta{nFontes !== 1 ? "s" : ""}
            {!fontesBadgeOk && " ⚠ mín. 3"}
          </Badge>
          <Badge variant="outline" className="text-xs border-slate-300 text-slate-600">
            {item.cotacoes.length} cotaç{item.cotacoes.length === 1 ? "ão" : "ões"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
          <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="p-4 border-t space-y-4">
          {/* Dados básicos do item */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label>Descrição do item *</Label>
              <Input
                className="mt-1"
                placeholder="Descrição completa do item"
                value={item.descricao}
                onChange={(e) => onChange({ descricao: e.target.value })}
              />
            </div>
            <div>
              <Label>N.º do item</Label>
              <Input
                className="mt-1"
                type="number"
                min="1"
                value={item.item_numero}
                onChange={(e) => onChange({ item_numero: parseInt(e.target.value) || index + 1 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantidade *</Label>
              <Input
                className="mt-1"
                type="number"
                step="0.001"
                min="0"
                value={item.quantidade || ""}
                onChange={(e) => onChange({ quantidade: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Unidade *</Label>
              <Input
                className="mt-1"
                placeholder="Ex: UN, KG, M², SV"
                value={item.unidade}
                onChange={(e) => onChange({ unidade: e.target.value })}
              />
            </div>
          </div>

          {/* Cotações */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label>Cotações por fonte</Label>
                {!fontesBadgeOk && (
                  <span className="text-xs text-red-600 font-medium">
                    (Art. 23, §1º — exige mínimo 3 fontes distintas)
                  </span>
                )}
              </div>
              <Button size="sm" variant="outline" type="button" onClick={addCotacao}>
                <Plus className="h-4 w-4 mr-1" />
                Adicionar cotação
              </Button>
            </div>
            {item.cotacoes.map((cot, ci) => (
              <CotacaoCard
                key={ci}
                cotacao={cot}
                index={ci}
                onChange={(patch) => updateCotacao(ci, patch)}
                onRemove={() => removeCotacao(ci)}
              />
            ))}
          </div>

          {/* Estatísticas (read-only, vindas da API) */}
          {hasStats && (
            <div className="rounded-lg border bg-slate-50 p-3">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="h-4 w-4 text-blue-500" />
                <span className="font-medium text-sm">Estatísticas calculadas pelo sistema</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-500">Valor mínimo</p>
                  <p className="font-medium">{formatBRL(item.valor_minimo)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Valor máximo</p>
                  <p className="font-medium">{formatBRL(item.valor_maximo)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Média</p>
                  <p className="font-medium">{formatBRL(item.valor_medio)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Mediana</p>
                  <p className="font-medium">{formatBRL(item.valor_mediano)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Desvio padrão</p>
                  <p className="font-medium">{formatBRL(item.desvio_padrao)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">CV (%)</p>
                  <p
                    className={cn(
                      "font-medium",
                      item.cv_percent != null && item.cv_percent > 25
                        ? "text-amber-600"
                        : "text-green-700"
                    )}
                  >
                    {item.cv_percent != null ? `${item.cv_percent.toFixed(2)} %` : "—"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Metodologia */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Metodologia de cálculo *</Label>
              <select
                className="w-full border rounded h-9 px-2 bg-white text-sm mt-1"
                value={item.metodologia}
                onChange={(e) =>
                  onChange({ metodologia: e.target.value as ItemPesquisaPrecos["metodologia"] })
                }
              >
                {(Object.keys(METODOLOGIA_LABELS) as ItemPesquisaPrecos["metodologia"][]).map(
                  (m) => (
                    <option key={m} value={m}>
                      {METODOLOGIA_LABELS[m]}
                    </option>
                  )
                )}
              </select>
            </div>
            <div>
              <Label>Valor referencial (R$) *</Label>
              <Input
                className="mt-1"
                type="number"
                step="0.0001"
                min="0"
                placeholder="0,00"
                value={item.valor_referencial || ""}
                onChange={(e) => onChange({ valor_referencial: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          {(item.metodologia === "OUTRA" || item.metodologia !== "MEDIA") && (
            <div>
              <Label>
                Justificativa da metodologia
                {item.metodologia === "OUTRA" && (
                  <span className="text-red-600 ml-1">* (obrigatória)</span>
                )}
              </Label>
              <Textarea
                className="mt-1"
                rows={3}
                placeholder="Justifique a metodologia escolhida para determinação do valor referencial..."
                value={item.justificativa_metodologia || ""}
                onChange={(e) =>
                  onChange({ justificativa_metodologia: e.target.value || undefined })
                }
              />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// PesquisaPrecosForm
// =============================================================================
interface Props {
  documentoId: string
  dadosIniciais?: Partial<PesquisaPrecosDados>
  onSalvo?: (dados: PesquisaPrecosDados) => void
}

export default function PesquisaPrecosForm({ documentoId, dadosIniciais, onSalvo }: Props) {
  const [dados, setDados] = useState<PesquisaPrecosDados>(() => ({
    itens: dadosIniciais?.itens ?? [novoItem(1)],
    metodologia_geral: dadosIniciais?.metodologia_geral ?? "",
    observacoes: dadosIniciais?.observacoes ?? "",
    valor_total_estimado: dadosIniciais?.valor_total_estimado,
    responsavel_pesquisa: dadosIniciais?.responsavel_pesquisa ?? {
      nome: "",
      cargo: "",
      matricula: "",
    },
  }))

  const [salvando, setSalvando] = useState(false)
  const [errors, setErrors] = useState<string[]>([])

  // ---------------------------------------------------------------------------
  // Helpers de mutação
  // ---------------------------------------------------------------------------
  const set = <K extends keyof PesquisaPrecosDados>(key: K, v: PesquisaPrecosDados[K]) =>
    setDados((prev) => ({ ...prev, [key]: v }))

  const addItem = () => {
    const proximoNumero = dados.itens.length > 0
      ? Math.max(...dados.itens.map((i) => i.item_numero)) + 1
      : 1
    set("itens", [...dados.itens, novoItem(proximoNumero)])
  }

  const removeItem = (idx: number) => set("itens", dados.itens.filter((_, i) => i !== idx))

  const updateItem = (idx: number, patch: Partial<ItemPesquisaPrecos>) =>
    set(
      "itens",
      dados.itens.map((item, i) => (i === idx ? { ...item, ...patch } : item))
    )

  // ---------------------------------------------------------------------------
  // Salvar
  // ---------------------------------------------------------------------------
  const handleSalvar = async () => {
    setSalvando(true)
    setErrors([])
    try {
      const res = await fetch(`/api/fase-interna/estruturado/${documentoId}/dados`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados }),
      })

      const json = await res.json().catch(() => ({}))

      if (!res.ok) {
        const msgs: string[] =
          json?.message
            ? Array.isArray(json.message)
              ? json.message
              : [json.message]
            : [`Erro ${res.status} ao salvar`]
        setErrors(msgs)
        return
      }

      // Atualiza dados com o que vier do backend (estatísticas calculadas, etc.)
      if (json?.dados) {
        setDados((prev) => ({ ...prev, ...json.dados }))
      }

      onSalvo?.(json?.dados ?? dados)
    } catch (err) {
      setErrors(["Erro de comunicação com o servidor. Tente novamente."])
    } finally {
      setSalvando(false)
    }
  }

  // ---------------------------------------------------------------------------
  // Resumo global
  // ---------------------------------------------------------------------------
  const totalItens = dados.itens.length
  const itensSemFonteSuficiente = dados.itens.filter(
    (it) => fontesDistintas(it.cotacoes) < 3
  ).length

  return (
    <div className="space-y-4">
      {/* Cabeçalho informativo */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-4 pb-3">
          <div className="flex items-start gap-2 text-blue-800 text-sm">
            <ShoppingCart className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">
                Pesquisa de Preços — Art. 23 da Lei 14.133/2021 e IN SEGES/ME 65/2021
              </p>
              <p className="text-blue-700 mt-0.5">
                Exige no mínimo <strong>3 fontes distintas</strong> por item. Fontes aceitas: Painel
                de Preços, PNCP, contratos vigentes, mídias especializadas, fornecedores diretos e
                notas fiscais eletrônicas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Erros de validação */}
      {errors.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">
                  Existem {errors.length} erro(s) de validação:
                </p>
                <ul className="list-disc pl-5 text-sm space-y-0.5">
                  {errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aviso itens sem fontes suficientes */}
      {itensSemFonteSuficiente > 0 && errors.length === 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 text-amber-700 text-sm">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p>
                <strong>{itensSemFonteSuficiente}</strong>{" "}
                {itensSemFonteSuficiente === 1 ? "item ainda não possui" : "itens ainda não possuem"}{" "}
                3 fontes distintas (obrigatório pelo Art. 23, §1º).
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* I — Itens */}
      <Section
        numero="I"
        titulo="Itens da pesquisa"
        defaultOpen
        badge={
          <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50">
            {totalItens} item{totalItens !== 1 ? "ns" : ""}
          </Badge>
        }
      >
        <div className="space-y-3">
          {dados.itens.map((item, idx) => (
            <ItemCard
              key={idx}
              item={item}
              index={idx}
              onChange={(patch) => updateItem(idx, patch)}
              onRemove={() => removeItem(idx)}
            />
          ))}
          <Button size="sm" variant="outline" type="button" onClick={addItem} className="w-full">
            <Plus className="h-4 w-4 mr-1" />
            Adicionar item
          </Button>
        </div>
      </Section>

      {/* II — Metodologia geral */}
      <Section numero="II" titulo="Metodologia geral" obrigatorio={false}>
        <Label>Descrição da metodologia geral adotada na pesquisa</Label>
        <Textarea
          rows={4}
          className="mt-1"
          placeholder="Descreva como foi conduzida a pesquisa de preços, critérios de seleção de fontes, período pesquisado..."
          value={dados.metodologia_geral || ""}
          onChange={(e) => set("metodologia_geral", e.target.value || undefined)}
        />
      </Section>

      {/* III — Observações */}
      <Section numero="III" titulo="Observações gerais" obrigatorio={false}>
        <Textarea
          rows={4}
          placeholder="Observações adicionais sobre a pesquisa de preços..."
          value={dados.observacoes || ""}
          onChange={(e) => set("observacoes", e.target.value || undefined)}
        />
      </Section>

      {/* IV — Responsável */}
      <Section numero="IV" titulo="Responsável pela pesquisa" obrigatorio={false}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="md:col-span-2">
            <Label>Nome completo</Label>
            <Input
              className="mt-1"
              placeholder="Nome do servidor responsável"
              value={dados.responsavel_pesquisa?.nome || ""}
              onChange={(e) =>
                set("responsavel_pesquisa", {
                  ...dados.responsavel_pesquisa,
                  nome: e.target.value,
                  cargo: dados.responsavel_pesquisa?.cargo ?? "",
                })
              }
            />
          </div>
          <div>
            <Label>Matrícula</Label>
            <Input
              className="mt-1"
              placeholder="Matrícula (opcional)"
              value={dados.responsavel_pesquisa?.matricula || ""}
              onChange={(e) =>
                set("responsavel_pesquisa", {
                  nome: dados.responsavel_pesquisa?.nome ?? "",
                  cargo: dados.responsavel_pesquisa?.cargo ?? "",
                  ...dados.responsavel_pesquisa,
                  matricula: e.target.value || undefined,
                })
              }
            />
          </div>
          <div className="md:col-span-3">
            <Label>Cargo / Função</Label>
            <Input
              className="mt-1"
              placeholder="Cargo ou função do responsável"
              value={dados.responsavel_pesquisa?.cargo || ""}
              onChange={(e) =>
                set("responsavel_pesquisa", {
                  nome: dados.responsavel_pesquisa?.nome ?? "",
                  ...dados.responsavel_pesquisa,
                  cargo: e.target.value,
                })
              }
            />
          </div>
        </div>
      </Section>

      {/* Rodapé — valor total estimado (read-only) e botão salvar */}
      <div className="flex items-center justify-between pt-2">
        {dados.valor_total_estimado != null && (
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <TrendingUp className="h-4 w-4 text-blue-500" />
            <span>
              Valor total estimado:{" "}
              <strong className="text-slate-800">{formatBRL(dados.valor_total_estimado)}</strong>
            </span>
          </div>
        )}
        <div className="ml-auto">
          <Button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Save className="h-4 w-4 mr-2" />
            {salvando ? "Salvando…" : "Salvar pesquisa de preços"}
          </Button>
        </div>
      </div>
    </div>
  )
}
