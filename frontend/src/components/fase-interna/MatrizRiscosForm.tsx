"use client"

import { useState } from "react"
import { ShieldAlert, AlertCircle, Save, Plus, Trash2, ChevronDown, BarChart2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// =============================================================================
// Tipos (replicados de backend/src/fase-interna/types/matriz-riscos.type.ts)
// =============================================================================
export type CategoriaRisco =
  | "TECNICO"
  | "JURIDICO"
  | "ECONOMICO_FINANCEIRO"
  | "OPERACIONAL"
  | "AMBIENTAL"
  | "SEGURANCA_TRABALHO"
  | "IMAGEM_REPUTACAO"
  | "EXTERNO_FORCA_MAIOR"

export type Probabilidade = 1 | 2 | 3 | 4 | 5
export type Impacto = 1 | 2 | 3 | 4 | 5
export type ResponsavelRisco = "CONTRATANTE" | "CONTRATADO" | "AMBOS"

export interface RiscoIdentificado {
  id: string
  numero: number
  categoria: CategoriaRisco
  descricao: string
  causa: string
  consequencia: string
  fase_aplicavel: "PLANEJAMENTO" | "SELECAO" | "EXECUCAO" | "TODAS"
  probabilidade: Probabilidade
  impacto: Impacto
  grau?: number
  nivel?: "BAIXO" | "MEDIO" | "ALTO"
  responsavel: ResponsavelRisco
  acoes_preventivas: string
  acoes_contingencia: string
  responsavel_monitoramento?: string
  status: "IDENTIFICADO" | "EM_TRATAMENTO" | "MITIGADO" | "MATERIALIZADO" | "ENCERRADO"
  observacoes?: string
}

export interface MatrizRiscosDados {
  riscos: RiscoIdentificado[]
  resumo_executivo?: string
  criterios_avaliacao?: {
    descricao_probabilidade: Record<Probabilidade, string>
    descricao_impacto: Record<Impacto, string>
  }
  responsavel_elaboracao?: {
    nome: string
    cargo: string
    matricula?: string
  }
  total_riscos?: number
  riscos_por_nivel?: { baixo: number; medio: number; alto: number }
  riscos_por_categoria?: Record<CategoriaRisco, number>
}

// =============================================================================
// Helpers
// =============================================================================
function calcularGrau(p: Probabilidade, i: Impacto): { grau: number; nivel: "BAIXO" | "MEDIO" | "ALTO" } {
  const grau = p * i
  let nivel: "BAIXO" | "MEDIO" | "ALTO"
  if (grau <= 6) nivel = "BAIXO"
  else if (grau <= 14) nivel = "MEDIO"
  else nivel = "ALTO"
  return { grau, nivel }
}

function gerarId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

const CATEGORIA_LABELS: Record<CategoriaRisco, string> = {
  TECNICO: "Técnico",
  JURIDICO: "Jurídico",
  ECONOMICO_FINANCEIRO: "Econômico-Financeiro",
  OPERACIONAL: "Operacional",
  AMBIENTAL: "Ambiental",
  SEGURANCA_TRABALHO: "Segurança do Trabalho",
  IMAGEM_REPUTACAO: "Imagem / Reputação",
  EXTERNO_FORCA_MAIOR: "Externo / Força Maior",
}

const PROBABILIDADE_LABELS: Record<number, string> = {
  1: "1 — Muito Baixa",
  2: "2 — Baixa",
  3: "3 — Média",
  4: "4 — Alta",
  5: "5 — Muito Alta",
}

const STATUS_LABELS: Record<RiscoIdentificado["status"], string> = {
  IDENTIFICADO: "Identificado",
  EM_TRATAMENTO: "Em Tratamento",
  MITIGADO: "Mitigado",
  MATERIALIZADO: "Materializado",
  ENCERRADO: "Encerrado",
}

const FASE_LABELS: Record<RiscoIdentificado["fase_aplicavel"], string> = {
  PLANEJAMENTO: "Planejamento",
  SELECAO: "Seleção",
  EXECUCAO: "Execução",
  TODAS: "Todas as Fases",
}

function nivelBadge(nivel?: "BAIXO" | "MEDIO" | "ALTO") {
  if (!nivel) return null
  const cfg = {
    BAIXO: "bg-green-100 text-green-800 border-green-300",
    MEDIO: "bg-yellow-100 text-yellow-800 border-yellow-300",
    ALTO: "bg-red-100 text-red-800 border-red-300",
  }
  const label = { BAIXO: "Baixo", MEDIO: "Médio", ALTO: "Alto" }
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border", cfg[nivel])}>
      {label[nivel]}
    </span>
  )
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
// RiscoCard — card expansível para cada risco
// =============================================================================
function RiscoCard({
  risco,
  onUpdate,
  onRemove,
}: {
  risco: RiscoIdentificado
  onUpdate: (patch: Partial<RiscoIdentificado>) => void
  onRemove: () => void
}) {
  const [open, setOpen] = useState(true)

  const { grau, nivel } = calcularGrau(risco.probabilidade, risco.impacto)

  return (
    <div className="border rounded-lg bg-white shadow-sm">
      {/* header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-t-lg">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          <ShieldAlert className="h-4 w-4 text-slate-500 flex-shrink-0" />
          <span className="font-semibold text-slate-700">
            R-{String(risco.numero).padStart(2, "0")}
          </span>
          {risco.descricao && (
            <span className="text-sm text-slate-500 truncate max-w-xs">{risco.descricao}</span>
          )}
          <span className="ml-2">{nivelBadge(nivel)}</span>
          {grau > 0 && (
            <span className="text-xs text-slate-400 ml-1">Grau {grau}</span>
          )}
          <ChevronDown className={cn("h-4 w-4 ml-auto transition-transform text-slate-400", open && "rotate-180")} />
        </button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          className="ml-2 text-red-500 hover:text-red-700 hover:bg-red-50"
          title="Remover risco"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {open && (
        <div className="p-4 space-y-4">
          {/* linha 1: categoria + fase */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Categoria</Label>
              <select
                className="w-full border rounded h-9 px-2 bg-white mt-1"
                value={risco.categoria}
                onChange={(e) => onUpdate({ categoria: e.target.value as CategoriaRisco })}
              >
                {(Object.entries(CATEGORIA_LABELS) as [CategoriaRisco, string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Fase Aplicável</Label>
              <select
                className="w-full border rounded h-9 px-2 bg-white mt-1"
                value={risco.fase_aplicavel}
                onChange={(e) => onUpdate({ fase_aplicavel: e.target.value as RiscoIdentificado["fase_aplicavel"] })}
              >
                {(Object.entries(FASE_LABELS) as [RiscoIdentificado["fase_aplicavel"], string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
          </div>

          {/* descrição / causa / consequência */}
          <div>
            <Label>Descrição (o que pode acontecer)</Label>
            <Textarea
              rows={2}
              className="mt-1"
              value={risco.descricao}
              onChange={(e) => onUpdate({ descricao: e.target.value })}
              placeholder="Descreva o evento de risco..."
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Causa (por que pode acontecer)</Label>
              <Textarea
                rows={2}
                className="mt-1"
                value={risco.causa}
                onChange={(e) => onUpdate({ causa: e.target.value })}
                placeholder="Origem ou condição que pode desencadear o risco..."
              />
            </div>
            <div>
              <Label>Consequência (impacto se ocorrer)</Label>
              <Textarea
                rows={2}
                className="mt-1"
                value={risco.consequencia}
                onChange={(e) => onUpdate({ consequencia: e.target.value })}
                placeholder="Efeitos esperados caso o risco se materialize..."
              />
            </div>
          </div>

          {/* probabilidade / impacto / grau calculado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
            <div>
              <Label>Probabilidade</Label>
              <select
                className="w-full border rounded h-9 px-2 bg-white mt-1"
                value={risco.probabilidade}
                onChange={(e) => {
                  const p = parseInt(e.target.value) as Probabilidade
                  const calc = calcularGrau(p, risco.impacto)
                  onUpdate({ probabilidade: p, grau: calc.grau, nivel: calc.nivel })
                }}
              >
                {([1, 2, 3, 4, 5] as Probabilidade[]).map((v) => (
                  <option key={v} value={v}>{PROBABILIDADE_LABELS[v]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Impacto</Label>
              <select
                className="w-full border rounded h-9 px-2 bg-white mt-1"
                value={risco.impacto}
                onChange={(e) => {
                  const i = parseInt(e.target.value) as Impacto
                  const calc = calcularGrau(risco.probabilidade, i)
                  onUpdate({ impacto: i, grau: calc.grau, nivel: calc.nivel })
                }}
              >
                {([1, 2, 3, 4, 5] as Impacto[]).map((v) => (
                  <option key={v} value={v}>{PROBABILIDADE_LABELS[v]}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Grau (P × I)</Label>
              <div className="mt-1 h-9 flex items-center gap-2 px-2 border rounded bg-slate-50">
                <span className="font-bold text-lg text-slate-700">{grau}</span>
                {nivelBadge(nivel)}
              </div>
            </div>
          </div>

          {/* tratamento */}
          <div className="border-t pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Tratamento — Art. 22, §1º (Alocação de Riscos)
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Responsável (alocação)</Label>
                <select
                  className="w-full border rounded h-9 px-2 bg-white mt-1"
                  value={risco.responsavel}
                  onChange={(e) => onUpdate({ responsavel: e.target.value as ResponsavelRisco })}
                >
                  <option value="CONTRATANTE">Contratante</option>
                  <option value="CONTRATADO">Contratado</option>
                  <option value="AMBOS">Ambos</option>
                </select>
              </div>
              <div>
                <Label>Responsável pelo Monitoramento</Label>
                <Input
                  className="mt-1"
                  value={risco.responsavel_monitoramento || ""}
                  onChange={(e) => onUpdate({ responsavel_monitoramento: e.target.value })}
                  placeholder="Nome / setor responsável..."
                />
              </div>
            </div>
            <div>
              <Label>Ações Preventivas</Label>
              <Textarea
                rows={2}
                className="mt-1"
                value={risco.acoes_preventivas}
                onChange={(e) => onUpdate({ acoes_preventivas: e.target.value })}
                placeholder="Medidas para reduzir probabilidade ou impacto..."
              />
            </div>
            <div>
              <Label>Ações de Contingência</Label>
              <Textarea
                rows={2}
                className="mt-1"
                value={risco.acoes_contingencia}
                onChange={(e) => onUpdate({ acoes_contingencia: e.target.value })}
                placeholder="Ações a executar caso o risco se materialize..."
              />
            </div>
          </div>

          {/* status / observações */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Status</Label>
              <select
                className="w-full border rounded h-9 px-2 bg-white mt-1"
                value={risco.status}
                onChange={(e) => onUpdate({ status: e.target.value as RiscoIdentificado["status"] })}
              >
                {(Object.entries(STATUS_LABELS) as [RiscoIdentificado["status"], string][]).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Observações (opcional)</Label>
              <Input
                className="mt-1"
                value={risco.observacoes || ""}
                onChange={(e) => onUpdate({ observacoes: e.target.value })}
                placeholder="Notas adicionais..."
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Props
// =============================================================================
interface MatrizRiscosFormProps {
  documentoId: string
  dadosIniciais?: Partial<MatrizRiscosDados>
  onSalvo?: (dados: MatrizRiscosDados) => void
}

// =============================================================================
// MatrizRiscosForm
// =============================================================================
export default function MatrizRiscosForm({ documentoId, dadosIniciais, onSalvo }: MatrizRiscosFormProps) {
  const [riscos, setRiscos] = useState<RiscoIdentificado[]>(() => {
    const lista = dadosIniciais?.riscos ?? []
    // garante grau/nivel calculados ao carregar
    return lista.map((r) => {
      const calc = calcularGrau(r.probabilidade, r.impacto)
      return { ...r, grau: calc.grau, nivel: calc.nivel }
    })
  })

  const [resumo_executivo, setResumoExecutivo] = useState(dadosIniciais?.resumo_executivo ?? "")
  const [responsavel_elaboracao, setResponsavelElaboracao] = useState(
    dadosIniciais?.responsavel_elaboracao ?? { nome: "", cargo: "", matricula: "" }
  )

  const [salvando, setSalvando] = useState(false)
  const [erros, setErros] = useState<string[]>([])
  const [sucesso, setSucesso] = useState(false)

  // Estatísticas computadas
  const total = riscos.length
  const baixo = riscos.filter((r) => {
    const { nivel } = calcularGrau(r.probabilidade, r.impacto)
    return nivel === "BAIXO"
  }).length
  const medio = riscos.filter((r) => {
    const { nivel } = calcularGrau(r.probabilidade, r.impacto)
    return nivel === "MEDIO"
  }).length
  const alto = riscos.filter((r) => {
    const { nivel } = calcularGrau(r.probabilidade, r.impacto)
    return nivel === "ALTO"
  }).length

  // Mutações de lista
  const addRisco = () => {
    const numero = riscos.length + 1
    const novo: RiscoIdentificado = {
      id: gerarId(),
      numero,
      categoria: "TECNICO",
      descricao: "",
      causa: "",
      consequencia: "",
      fase_aplicavel: "TODAS",
      probabilidade: 1,
      impacto: 1,
      grau: 1,
      nivel: "BAIXO",
      responsavel: "CONTRATANTE",
      acoes_preventivas: "",
      acoes_contingencia: "",
      responsavel_monitoramento: "",
      status: "IDENTIFICADO",
      observacoes: "",
    }
    setRiscos((prev) => [...prev, novo])
    setSucesso(false)
  }

  const removeRisco = (id: string) => {
    setRiscos((prev) => {
      const filtered = prev.filter((r) => r.id !== id)
      // renumera
      return filtered.map((r, idx) => ({ ...r, numero: idx + 1 }))
    })
    setSucesso(false)
  }

  const updateRisco = (id: string, patch: Partial<RiscoIdentificado>) => {
    setRiscos((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r
        const atualizado = { ...r, ...patch }
        // recalcula grau/nivel sempre que probabilidade ou impacto mudar
        const { grau, nivel } = calcularGrau(atualizado.probabilidade, atualizado.impacto)
        return { ...atualizado, grau, nivel }
      })
    )
    setSucesso(false)
  }

  // Salvar
  const salvar = async () => {
    setSalvando(true)
    setErros([])
    setSucesso(false)

    const dados: MatrizRiscosDados = {
      riscos: riscos.map((r) => {
        const { grau, nivel } = calcularGrau(r.probabilidade, r.impacto)
        return { ...r, grau, nivel }
      }),
      resumo_executivo,
      responsavel_elaboracao: {
        nome: responsavel_elaboracao.nome,
        cargo: responsavel_elaboracao.cargo,
        matricula: responsavel_elaboracao.matricula || undefined,
      },
      total_riscos: total,
      riscos_por_nivel: { baixo, medio, alto },
    }

    try {
      const res = await fetch(`/api/fase-interna/estruturado/${documentoId}/dados`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msgs: string[] = []
        if (body?.message) {
          if (Array.isArray(body.message)) msgs.push(...body.message)
          else msgs.push(String(body.message))
        } else if (body?.errors) {
          msgs.push(...(Array.isArray(body.errors) ? body.errors : [String(body.errors)]))
        } else {
          msgs.push(`Erro ${res.status}: ${res.statusText}`)
        }
        setErros(msgs)
      } else {
        setSucesso(true)
        onSalvo?.(dados)
      }
    } catch (err) {
      setErros(["Falha na comunicação com o servidor. Verifique a conexão e tente novamente."])
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 mb-2">
        <ShieldAlert className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-semibold text-slate-800">Matriz de Riscos</h2>
        <Badge variant="outline" className="text-xs border-blue-300 text-blue-700 bg-blue-50">
          Art. 18, X · Art. 22 — Lei 14.133/2021
        </Badge>
      </div>

      {/* Erros */}
      {erros.length > 0 && (
        <Card className="border-red-300 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-2 text-red-700">
              <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Existem {erros.length} erro(s) de validação:</p>
                <ul className="list-disc pl-5 text-sm space-y-0.5">
                  {erros.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sucesso */}
      {sucesso && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="pt-6">
            <p className="text-green-700 font-medium text-sm">Matriz de riscos salva com sucesso.</p>
          </CardContent>
        </Card>
      )}

      {/* Painel de resumo */}
      <Card className="border-slate-200">
        <CardContent className="pt-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart2 className="h-4 w-4 text-slate-500" />
            <span className="font-medium text-slate-700 text-sm">Resumo da Matriz</span>
          </div>
          <div className="grid grid-cols-4 gap-3 text-center">
            <div className="rounded-lg border p-3 bg-slate-50">
              <p className="text-2xl font-bold text-slate-700">{total}</p>
              <p className="text-xs text-slate-500 mt-0.5">Total de Riscos</p>
            </div>
            <div className="rounded-lg border border-green-200 p-3 bg-green-50">
              <p className="text-2xl font-bold text-green-700">{baixo}</p>
              <p className="text-xs text-green-600 mt-0.5">Baixo</p>
            </div>
            <div className="rounded-lg border border-yellow-200 p-3 bg-yellow-50">
              <p className="text-2xl font-bold text-yellow-700">{medio}</p>
              <p className="text-xs text-yellow-600 mt-0.5">Médio</p>
            </div>
            <div className="rounded-lg border border-red-200 p-3 bg-red-50">
              <p className="text-2xl font-bold text-red-700">{alto}</p>
              <p className="text-xs text-red-600 mt-0.5">Alto</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* I — Riscos identificados */}
      <Section numero="I" titulo="Riscos Identificados" defaultOpen>
        <div className="space-y-3">
          {riscos.length === 0 && (
            <p className="text-sm text-slate-400 italic text-center py-4">
              Nenhum risco cadastrado. Clique em "Adicionar risco" para começar.
            </p>
          )}
          {riscos.map((risco) => (
            <RiscoCard
              key={risco.id}
              risco={risco}
              onUpdate={(patch) => updateRisco(risco.id, patch)}
              onRemove={() => removeRisco(risco.id)}
            />
          ))}
          <div className="flex justify-end pt-1">
            <Button size="sm" variant="outline" onClick={addRisco}>
              <Plus className="h-4 w-4 mr-1" />
              Adicionar risco
            </Button>
          </div>
        </div>
      </Section>

      {/* II — Resumo executivo */}
      <Section numero="II" titulo="Resumo Executivo" obrigatorio={false}>
        <Label>Síntese da análise de riscos e principais conclusões</Label>
        <Textarea
          rows={5}
          className="mt-1"
          value={resumo_executivo}
          onChange={(e) => {
            setResumoExecutivo(e.target.value)
            setSucesso(false)
          }}
          placeholder="Descreva os principais riscos identificados, o perfil geral de risco da contratação e as medidas de mitigação prioritárias..."
        />
      </Section>

      {/* III — Responsável pela elaboração */}
      <Section numero="III" titulo="Responsável pela Elaboração" obrigatorio={false}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Nome</Label>
            <Input
              className="mt-1"
              value={responsavel_elaboracao.nome}
              onChange={(e) => {
                setResponsavelElaboracao((prev) => ({ ...prev, nome: e.target.value }))
                setSucesso(false)
              }}
              placeholder="Nome completo"
            />
          </div>
          <div>
            <Label>Cargo / Função</Label>
            <Input
              className="mt-1"
              value={responsavel_elaboracao.cargo}
              onChange={(e) => {
                setResponsavelElaboracao((prev) => ({ ...prev, cargo: e.target.value }))
                setSucesso(false)
              }}
              placeholder="Ex: Fiscal de Contratos"
            />
          </div>
          <div>
            <Label>Matrícula (opcional)</Label>
            <Input
              className="mt-1"
              value={responsavel_elaboracao.matricula || ""}
              onChange={(e) => {
                setResponsavelElaboracao((prev) => ({ ...prev, matricula: e.target.value }))
                setSucesso(false)
              }}
              placeholder="Número de matrícula"
            />
          </div>
        </div>
      </Section>

      {/* Botão salvar */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={salvar}
          disabled={salvando}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60"
        >
          <Save className="h-4 w-4 mr-2" />
          {salvando ? "Salvando..." : "Salvar Matriz de Riscos"}
        </Button>
      </div>
    </div>
  )
}
