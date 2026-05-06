"use client"

import { useState } from "react"
import { AlertCircle, ChevronDown, Plus, Trash2, Save } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// =============================================================================
// Tipos (replicados de backend/src/fase-interna/types/etp-dados.type.ts)
// =============================================================================
export interface EtpDados {
  descricao_necessidade: string
  previsao_pca: {
    consta_no_pca: boolean
    pca_id?: string
    item_pca?: string
    justificativa_se_nao?: string
  }
  requisitos_contratacao: string
  estimativas_quantidades: {
    descricao: string
    memoria_calculo: string
    documentos_suporte?: string[]
  }
  levantamento_mercado: {
    alternativas_analisadas: Array<{ descricao: string; vantagens: string; desvantagens: string }>
    solucao_escolhida: string
    justificativa_tecnica: string
    justificativa_economica: string
  }
  estimativa_valor: {
    valor_total: number
    moeda: "BRL"
    metodo_calculo: string
    referencia_pesquisa_id?: string
  }
  descricao_solucao: string
  justificativa_parcelamento: { tipo: "PARCELADO" | "INTEGRAL"; justificativa: string }
  resultados_pretendidos: string
  providencias_previas: string
  contratacoes_correlatas: Array<{
    numero_processo?: string
    descricao: string
    tipo_relacao: "CORRELATA" | "INTERDEPENDENTE"
  }>
  impactos_ambientais: {
    aplicavel: boolean
    impactos_identificados?: string
    medidas_mitigadoras?: string
    criterios_sustentabilidade?: string
  }
  posicionamento_conclusivo: {
    contratacao_viavel: boolean
    justificativa: string
    recomendacoes?: string
  }
  responsavel_elaboracao?: { nome: string; cargo: string; matricula?: string }
}

interface Props {
  value: EtpDados
  onChange: (v: EtpDados) => void
  onSubmit: () => void
  errors?: string[]
}

// =============================================================================
// Section accordion helper
// =============================================================================
function Section({
  numero,
  titulo,
  obrigatorio = true,
  defaultOpen = false,
  children,
}: {
  numero: string
  titulo: string
  obrigatorio?: boolean
  defaultOpen?: boolean
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
        <div className="flex items-center gap-2 text-left">
          <span className="font-bold text-blue-600 w-12">{numero}</span>
          <span className="font-medium">{titulo}</span>
          {obrigatorio && (
            <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 bg-amber-50">
              obrigatório
            </Badge>
          )}
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="p-4 border-t space-y-3">{children}</div>}
    </div>
  )
}

// =============================================================================
// EtpForm
// =============================================================================
export default function EtpForm({ value, onChange, onSubmit, errors = [] }: Props) {
  const set = <K extends keyof EtpDados>(key: K, v: EtpDados[K]) => onChange({ ...value, [key]: v })

  // V — Levantamento de mercado: alternativas dinâmicas
  const addAlternativa = () => {
    set("levantamento_mercado", {
      ...value.levantamento_mercado,
      alternativas_analisadas: [
        ...value.levantamento_mercado.alternativas_analisadas,
        { descricao: "", vantagens: "", desvantagens: "" },
      ],
    })
  }
  const removeAlternativa = (idx: number) => {
    set("levantamento_mercado", {
      ...value.levantamento_mercado,
      alternativas_analisadas: value.levantamento_mercado.alternativas_analisadas.filter((_, i) => i !== idx),
    })
  }
  const updateAlternativa = (idx: number, patch: Partial<{ descricao: string; vantagens: string; desvantagens: string }>) => {
    set("levantamento_mercado", {
      ...value.levantamento_mercado,
      alternativas_analisadas: value.levantamento_mercado.alternativas_analisadas.map((a, i) =>
        i === idx ? { ...a, ...patch } : a
      ),
    })
  }

  // XI — Contratações correlatas dinâmicas
  const addCorrelata = () => {
    set("contratacoes_correlatas", [
      ...value.contratacoes_correlatas,
      { descricao: "", tipo_relacao: "CORRELATA" },
    ])
  }
  const removeCorrelata = (idx: number) => {
    set("contratacoes_correlatas", value.contratacoes_correlatas.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-4">
      {/* Erros do backend */}
      {errors.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Existem {errors.length} erro(s) de validação:</p>
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

      {/* I */}
      <Section numero="I" titulo="Descrição da necessidade" defaultOpen>
        <Label>Necessidade da contratação (interesse público)</Label>
        <Textarea
          value={value.descricao_necessidade}
          onChange={(e) => set("descricao_necessidade", e.target.value)}
          rows={6}
          placeholder="Descreva detalhadamente o problema a ser resolvido..."
        />
      </Section>

      {/* II */}
      <Section numero="II" titulo="Previsão no PCA">
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={value.previsao_pca.consta_no_pca === true}
              onChange={() => set("previsao_pca", { ...value.previsao_pca, consta_no_pca: true })}
            />
            <span>Consta no PCA</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={value.previsao_pca.consta_no_pca === false}
              onChange={() => set("previsao_pca", { ...value.previsao_pca, consta_no_pca: false })}
            />
            <span>Não consta</span>
          </label>
        </div>
        {value.previsao_pca.consta_no_pca && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>ID do PCA</Label>
              <Input
                value={value.previsao_pca.pca_id || ""}
                onChange={(e) => set("previsao_pca", { ...value.previsao_pca, pca_id: e.target.value })}
              />
            </div>
            <div>
              <Label>Item do PCA</Label>
              <Input
                value={value.previsao_pca.item_pca || ""}
                onChange={(e) => set("previsao_pca", { ...value.previsao_pca, item_pca: e.target.value })}
              />
            </div>
          </div>
        )}
        {value.previsao_pca.consta_no_pca === false && (
          <div>
            <Label>Justificativa para contratação fora do PCA</Label>
            <Textarea
              rows={4}
              value={value.previsao_pca.justificativa_se_nao || ""}
              onChange={(e) => set("previsao_pca", { ...value.previsao_pca, justificativa_se_nao: e.target.value })}
            />
          </div>
        )}
      </Section>

      {/* III */}
      <Section numero="III" titulo="Requisitos da contratação">
        <Textarea
          rows={5}
          value={value.requisitos_contratacao}
          onChange={(e) => set("requisitos_contratacao", e.target.value)}
        />
      </Section>

      {/* IV */}
      <Section numero="IV" titulo="Estimativas de quantidades">
        <Label>Descrição</Label>
        <Textarea
          rows={4}
          value={value.estimativas_quantidades.descricao}
          onChange={(e) =>
            set("estimativas_quantidades", { ...value.estimativas_quantidades, descricao: e.target.value })
          }
        />
        <Label>Memória de cálculo</Label>
        <Textarea
          rows={4}
          value={value.estimativas_quantidades.memoria_calculo}
          onChange={(e) =>
            set("estimativas_quantidades", { ...value.estimativas_quantidades, memoria_calculo: e.target.value })
          }
        />
      </Section>

      {/* V */}
      <Section numero="V" titulo="Levantamento de mercado">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Alternativas analisadas</Label>
            <Button size="sm" variant="outline" onClick={addAlternativa}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar alternativa
            </Button>
          </div>
          {value.levantamento_mercado.alternativas_analisadas.map((alt, idx) => (
            <div key={idx} className="border rounded p-3 bg-slate-50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">Alternativa #{idx + 1}</span>
                <Button size="sm" variant="ghost" onClick={() => removeAlternativa(idx)}>
                  <Trash2 className="h-4 w-4 text-red-600" />
                </Button>
              </div>
              <Input
                placeholder="Descrição"
                value={alt.descricao}
                onChange={(e) => updateAlternativa(idx, { descricao: e.target.value })}
              />
              <Textarea
                placeholder="Vantagens"
                rows={2}
                value={alt.vantagens}
                onChange={(e) => updateAlternativa(idx, { vantagens: e.target.value })}
              />
              <Textarea
                placeholder="Desvantagens"
                rows={2}
                value={alt.desvantagens}
                onChange={(e) => updateAlternativa(idx, { desvantagens: e.target.value })}
              />
            </div>
          ))}
        </div>
        <div className="grid gap-2">
          <Label>Solução escolhida</Label>
          <Input
            value={value.levantamento_mercado.solucao_escolhida}
            onChange={(e) =>
              set("levantamento_mercado", { ...value.levantamento_mercado, solucao_escolhida: e.target.value })
            }
          />
          <Label>Justificativa técnica</Label>
          <Textarea
            rows={3}
            value={value.levantamento_mercado.justificativa_tecnica}
            onChange={(e) =>
              set("levantamento_mercado", { ...value.levantamento_mercado, justificativa_tecnica: e.target.value })
            }
          />
          <Label>Justificativa econômica</Label>
          <Textarea
            rows={3}
            value={value.levantamento_mercado.justificativa_economica}
            onChange={(e) =>
              set("levantamento_mercado", { ...value.levantamento_mercado, justificativa_economica: e.target.value })
            }
          />
        </div>
      </Section>

      {/* VI */}
      <Section numero="VI" titulo="Estimativa do valor">
        <Label>Valor total (R$)</Label>
        <Input
          type="number"
          step="0.01"
          value={value.estimativa_valor.valor_total || ""}
          onChange={(e) =>
            set("estimativa_valor", {
              ...value.estimativa_valor,
              valor_total: parseFloat(e.target.value) || 0,
              moeda: "BRL",
            })
          }
        />
        <Label>Método de cálculo</Label>
        <Textarea
          rows={3}
          value={value.estimativa_valor.metodo_calculo}
          onChange={(e) => set("estimativa_valor", { ...value.estimativa_valor, metodo_calculo: e.target.value })}
        />
      </Section>

      {/* VII */}
      <Section numero="VII" titulo="Descrição da solução">
        <Textarea rows={5} value={value.descricao_solucao} onChange={(e) => set("descricao_solucao", e.target.value)} />
      </Section>

      {/* VIII */}
      <Section numero="VIII" titulo="Justificativa de parcelamento">
        <div className="flex gap-4">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={value.justificativa_parcelamento.tipo === "PARCELADO"}
              onChange={() => set("justificativa_parcelamento", { ...value.justificativa_parcelamento, tipo: "PARCELADO" })}
            />
            <span>Parcelado</span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              checked={value.justificativa_parcelamento.tipo === "INTEGRAL"}
              onChange={() => set("justificativa_parcelamento", { ...value.justificativa_parcelamento, tipo: "INTEGRAL" })}
            />
            <span>Integral</span>
          </label>
        </div>
        <Textarea
          rows={4}
          value={value.justificativa_parcelamento.justificativa}
          onChange={(e) =>
            set("justificativa_parcelamento", { ...value.justificativa_parcelamento, justificativa: e.target.value })
          }
        />
      </Section>

      {/* IX */}
      <Section numero="IX" titulo="Resultados pretendidos">
        <Textarea rows={4} value={value.resultados_pretendidos} onChange={(e) => set("resultados_pretendidos", e.target.value)} />
      </Section>

      {/* X */}
      <Section numero="X" titulo="Providências prévias">
        <Textarea rows={4} value={value.providencias_previas} onChange={(e) => set("providencias_previas", e.target.value)} />
      </Section>

      {/* XI */}
      <Section numero="XI" titulo="Contratações correlatas" obrigatorio={false}>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={addCorrelata}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar
          </Button>
        </div>
        {value.contratacoes_correlatas.map((c, idx) => (
          <div key={idx} className="border rounded p-3 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm">Contratação #{idx + 1}</span>
              <Button size="sm" variant="ghost" onClick={() => removeCorrelata(idx)}>
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
            <Input
              placeholder="Número do processo"
              value={c.numero_processo || ""}
              onChange={(e) => {
                const arr = [...value.contratacoes_correlatas]
                arr[idx] = { ...arr[idx], numero_processo: e.target.value }
                set("contratacoes_correlatas", arr)
              }}
            />
            <Input
              placeholder="Descrição"
              value={c.descricao}
              onChange={(e) => {
                const arr = [...value.contratacoes_correlatas]
                arr[idx] = { ...arr[idx], descricao: e.target.value }
                set("contratacoes_correlatas", arr)
              }}
            />
            <select
              className="w-full border rounded h-9 px-2 bg-white"
              value={c.tipo_relacao}
              onChange={(e) => {
                const arr = [...value.contratacoes_correlatas]
                arr[idx] = { ...arr[idx], tipo_relacao: e.target.value as "CORRELATA" | "INTERDEPENDENTE" }
                set("contratacoes_correlatas", arr)
              }}
            >
              <option value="CORRELATA">Correlata</option>
              <option value="INTERDEPENDENTE">Interdependente</option>
            </select>
          </div>
        ))}
      </Section>

      {/* XII */}
      <Section numero="XII" titulo="Impactos ambientais">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.impactos_ambientais.aplicavel}
            onChange={(e) => set("impactos_ambientais", { ...value.impactos_ambientais, aplicavel: e.target.checked })}
          />
          <span>Aplicável a esta contratação</span>
        </label>
        {value.impactos_ambientais.aplicavel && (
          <>
            <Label>Impactos identificados</Label>
            <Textarea
              rows={3}
              value={value.impactos_ambientais.impactos_identificados || ""}
              onChange={(e) =>
                set("impactos_ambientais", { ...value.impactos_ambientais, impactos_identificados: e.target.value })
              }
            />
            <Label>Medidas mitigadoras</Label>
            <Textarea
              rows={3}
              value={value.impactos_ambientais.medidas_mitigadoras || ""}
              onChange={(e) =>
                set("impactos_ambientais", { ...value.impactos_ambientais, medidas_mitigadoras: e.target.value })
              }
            />
            <Label>Critérios de sustentabilidade</Label>
            <Textarea
              rows={3}
              value={value.impactos_ambientais.criterios_sustentabilidade || ""}
              onChange={(e) =>
                set("impactos_ambientais", {
                  ...value.impactos_ambientais,
                  criterios_sustentabilidade: e.target.value,
                })
              }
            />
          </>
        )}
      </Section>

      {/* XIII */}
      <Section numero="XIII" titulo="Posicionamento conclusivo">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={value.posicionamento_conclusivo.contratacao_viavel}
            onChange={(e) =>
              set("posicionamento_conclusivo", {
                ...value.posicionamento_conclusivo,
                contratacao_viavel: e.target.checked,
              })
            }
          />
          <span>Contratação considerada viável</span>
        </label>
        <Label>Justificativa</Label>
        <Textarea
          rows={4}
          value={value.posicionamento_conclusivo.justificativa}
          onChange={(e) =>
            set("posicionamento_conclusivo", { ...value.posicionamento_conclusivo, justificativa: e.target.value })
          }
        />
        <Label>Recomendações (opcional)</Label>
        <Textarea
          rows={3}
          value={value.posicionamento_conclusivo.recomendacoes || ""}
          onChange={(e) =>
            set("posicionamento_conclusivo", { ...value.posicionamento_conclusivo, recomendacoes: e.target.value })
          }
        />
      </Section>

      <div className="flex justify-end pt-4">
        <Button onClick={onSubmit} className="bg-blue-600 hover:bg-blue-700">
          <Save className="h-4 w-4 mr-2" />
          Salvar ETP
        </Button>
      </div>
    </div>
  )
}
