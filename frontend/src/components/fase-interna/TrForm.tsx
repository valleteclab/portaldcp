"use client"

import { useState } from "react"
import { AlertCircle, ChevronDown, FileText, Plus, Save, Trash2 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

// =============================================================================
// Tipos (replicados de backend/src/fase-interna/types/tr-dados.type.ts)
// =============================================================================
export interface TrDados {
  // a) definição do objeto, incluídos sua natureza, os quantitativos, o prazo
  // do contrato e, se for o caso, a possibilidade de sua prorrogação
  definicao_objeto: {
    natureza: string
    descricao_detalhada: string
    prazo_contrato_meses: number
    permite_prorrogacao: boolean
    limite_prorrogacao?: string
  }

  // b) fundamentação da contratação
  fundamentacao_contratacao: string

  // c) descrição da solução como um todo, considerado todo o ciclo de vida do objeto
  descricao_solucao: string

  // d) requisitos da contratação
  requisitos_contratacao: {
    requisitos_gerais: string
    sustentabilidade?: string
    acessibilidade?: string
    seguranca?: string
  }

  // e) modelo de execução do objeto
  modelo_execucao: string

  // f) modelo de gestão do contrato
  modelo_gestao: {
    descricao: string
    fiscal_titular?: string
    fiscal_substituto?: string
    gestor_contrato?: string
  }

  // g) critérios de medição e de pagamento
  criterios_medicao_pagamento: {
    forma_medicao: string
    periodicidade: "MENSAL" | "QUINZENAL" | "POR_ENTREGA" | "POR_ETAPA" | "OUTRA"
    forma_pagamento: string
    prazo_pagamento_dias: number
    instrumento_medicao?: string
  }

  // h) forma e critérios de seleção do fornecedor
  forma_criterios_selecao: {
    modalidade: string
    criterio_julgamento: string
    modo_disputa: string
    requisitos_habilitacao: {
      juridica: string[]
      fiscal_trabalhista: string[]
      tecnica?: string[]
      economica_financeira?: string[]
    }
  }

  // i) estimativas do valor da contratação
  estimativas_valor: {
    valor_total: number
    valor_unitario_medio?: number
    referencia_pesquisa_id?: string
    sigilo_orcamento: boolean
    justificativa_sigilo?: string
  }

  // j) adequação orçamentária
  adequacao_orcamentaria: {
    fonte_recurso: string
    elemento_despesa: string
    dotacao_orcamentaria: string
    exercicio_financeiro: number
  }

  // Quantitativos e itens
  quantitativos: Array<{
    item_numero: number
    descricao: string
    quantidade: number
    unidade: string
    valor_unitario_estimado?: number
  }>

  // Metadados
  responsavel_elaboracao?: {
    nome: string
    cargo: string
    matricula?: string
  }
}

// =============================================================================
// Props
// =============================================================================
interface Props {
  documentoId: string
  dadosIniciais?: Partial<TrDados>
  onSalvo?: (dados: TrDados) => void
}

// =============================================================================
// Estado inicial vazio
// =============================================================================
function estadoInicial(patch?: Partial<TrDados>): TrDados {
  return {
    definicao_objeto: {
      natureza: "",
      descricao_detalhada: "",
      prazo_contrato_meses: 0,
      permite_prorrogacao: false,
      ...patch?.definicao_objeto,
    },
    fundamentacao_contratacao: patch?.fundamentacao_contratacao ?? "",
    descricao_solucao: patch?.descricao_solucao ?? "",
    requisitos_contratacao: {
      requisitos_gerais: "",
      ...patch?.requisitos_contratacao,
    },
    modelo_execucao: patch?.modelo_execucao ?? "",
    modelo_gestao: {
      descricao: "",
      ...patch?.modelo_gestao,
    },
    criterios_medicao_pagamento: {
      forma_medicao: "",
      periodicidade: "MENSAL",
      forma_pagamento: "",
      prazo_pagamento_dias: 30,
      ...patch?.criterios_medicao_pagamento,
    },
    forma_criterios_selecao: {
      modalidade: "",
      criterio_julgamento: "",
      modo_disputa: "",
      requisitos_habilitacao: {
        juridica: [],
        fiscal_trabalhista: [],
        ...(patch?.forma_criterios_selecao?.requisitos_habilitacao ?? {}),
      },
      ...patch?.forma_criterios_selecao,
    },
    estimativas_valor: {
      valor_total: 0,
      sigilo_orcamento: false,
      ...patch?.estimativas_valor,
    },
    adequacao_orcamentaria: {
      fonte_recurso: "",
      elemento_despesa: "",
      dotacao_orcamentaria: "",
      exercicio_financeiro: new Date().getFullYear(),
      ...patch?.adequacao_orcamentaria,
    },
    quantitativos: patch?.quantitativos ?? [],
    responsavel_elaboracao: patch?.responsavel_elaboracao,
  }
}

// =============================================================================
// Section accordion helper
// =============================================================================
function Section({
  letra,
  titulo,
  obrigatorio = true,
  defaultOpen = false,
  children,
}: {
  letra: string
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
          <span className="font-bold text-blue-600 w-8">{letra})</span>
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
// TrForm
// =============================================================================
export default function TrForm({ documentoId, dadosIniciais, onSalvo }: Props) {
  const [dados, setDados] = useState<TrDados>(() => estadoInicial(dadosIniciais))
  const [salvando, setSalvando] = useState(false)
  const [erros, setErros] = useState<string[]>([])
  const [sucesso, setSucesso] = useState(false)

  const set = <K extends keyof TrDados>(key: K, v: TrDados[K]) =>
    setDados((prev) => ({ ...prev, [key]: v }))

  // ---- quantitativos helpers ------------------------------------------------
  const addQuantitativo = () =>
    set("quantitativos", [
      ...dados.quantitativos,
      {
        item_numero: dados.quantitativos.length + 1,
        descricao: "",
        quantidade: 0,
        unidade: "",
        valor_unitario_estimado: undefined,
      },
    ])

  const removeQuantitativo = (idx: number) =>
    set(
      "quantitativos",
      dados.quantitativos
        .filter((_, i) => i !== idx)
        .map((q, i) => ({ ...q, item_numero: i + 1 }))
    )

  const updateQuantitativo = (
    idx: number,
    patch: Partial<TrDados["quantitativos"][number]>
  ) =>
    set(
      "quantitativos",
      dados.quantitativos.map((q, i) => (i === idx ? { ...q, ...patch } : q))
    )

  // ---- habilitação helpers (arrays de strings) ------------------------------
  function updateHabilitacaoLinha(
    campo: keyof TrDados["forma_criterios_selecao"]["requisitos_habilitacao"],
    idx: number,
    valor: string
  ) {
    const arr = [...(dados.forma_criterios_selecao.requisitos_habilitacao[campo] ?? [])]
    arr[idx] = valor
    set("forma_criterios_selecao", {
      ...dados.forma_criterios_selecao,
      requisitos_habilitacao: {
        ...dados.forma_criterios_selecao.requisitos_habilitacao,
        [campo]: arr,
      },
    })
  }

  function addHabilitacaoLinha(
    campo: keyof TrDados["forma_criterios_selecao"]["requisitos_habilitacao"]
  ) {
    const arr = [...(dados.forma_criterios_selecao.requisitos_habilitacao[campo] ?? []), ""]
    set("forma_criterios_selecao", {
      ...dados.forma_criterios_selecao,
      requisitos_habilitacao: {
        ...dados.forma_criterios_selecao.requisitos_habilitacao,
        [campo]: arr,
      },
    })
  }

  function removeHabilitacaoLinha(
    campo: keyof TrDados["forma_criterios_selecao"]["requisitos_habilitacao"],
    idx: number
  ) {
    const arr = (dados.forma_criterios_selecao.requisitos_habilitacao[campo] ?? []).filter(
      (_, i) => i !== idx
    )
    set("forma_criterios_selecao", {
      ...dados.forma_criterios_selecao,
      requisitos_habilitacao: {
        ...dados.forma_criterios_selecao.requisitos_habilitacao,
        [campo]: arr,
      },
    })
  }

  // ---- save -----------------------------------------------------------------
  async function handleSalvar() {
    setSalvando(true)
    setErros([])
    setSucesso(false)
    try {
      // Modo local: sem documentoId, apenas devolve os dados ao parent
      if (!documentoId) {
        setSucesso(true)
        onSalvo?.(dados)
        setTimeout(() => setSucesso(false), 3000)
        return
      }
      const res = await fetch(`/api/fase-interna/estruturado/${documentoId}/dados`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dados }),
      })
      const json = await res.json()
      if (!res.ok) {
        const msgs: string[] =
          json?.erros ?? json?.message
            ? Array.isArray(json.message)
              ? json.message
              : [json.message]
            : ["Erro desconhecido ao salvar."]
        setErros(msgs)
      } else {
        setSucesso(true)
        onSalvo?.(dados)
        setTimeout(() => setSucesso(false), 3000)
      }
    } catch {
      setErros(["Falha de comunicação com o servidor."])
    } finally {
      setSalvando(false)
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center gap-2 pb-2 border-b">
        <FileText className="h-5 w-5 text-blue-600" />
        <h2 className="text-lg font-semibold">Termo de Referência</h2>
        <span className="text-sm text-slate-500 ml-1">— Art. 6º, XXIII / Lei 14.133/2021</span>
      </div>

      {/* Erros do backend */}
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
            <p className="text-green-700 font-medium text-sm">TR salvo com sucesso.</p>
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* a) Definição do objeto                                              */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="a" titulo="Definição do objeto" defaultOpen>
        <div className="grid grid-cols-1 gap-3">
          <div>
            <Label>Natureza do objeto</Label>
            <Input
              value={dados.definicao_objeto.natureza}
              onChange={(e) =>
                set("definicao_objeto", { ...dados.definicao_objeto, natureza: e.target.value })
              }
              placeholder="Ex.: Serviço contínuo, fornecimento de bens, obra..."
            />
          </div>
          <div>
            <Label>Descrição detalhada</Label>
            <Textarea
              rows={5}
              value={dados.definicao_objeto.descricao_detalhada}
              onChange={(e) =>
                set("definicao_objeto", {
                  ...dados.definicao_objeto,
                  descricao_detalhada: e.target.value,
                })
              }
              placeholder="Descreva o objeto com precisão e clareza..."
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Prazo do contrato (meses)</Label>
              <Input
                type="number"
                min={1}
                value={dados.definicao_objeto.prazo_contrato_meses || ""}
                onChange={(e) =>
                  set("definicao_objeto", {
                    ...dados.definicao_objeto,
                    prazo_contrato_meses: parseInt(e.target.value) || 0,
                  })
                }
              />
            </div>
            <div className="flex flex-col justify-end pb-1">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dados.definicao_objeto.permite_prorrogacao}
                  onChange={(e) =>
                    set("definicao_objeto", {
                      ...dados.definicao_objeto,
                      permite_prorrogacao: e.target.checked,
                    })
                  }
                />
                <span className="text-sm">Permite prorrogação</span>
              </label>
            </div>
          </div>
          {dados.definicao_objeto.permite_prorrogacao && (
            <div>
              <Label>Limite de prorrogação (opcional)</Label>
              <Input
                value={dados.definicao_objeto.limite_prorrogacao ?? ""}
                onChange={(e) =>
                  set("definicao_objeto", {
                    ...dados.definicao_objeto,
                    limite_prorrogacao: e.target.value,
                  })
                }
                placeholder="Ex.: Até 60 meses, conforme art. 107 da Lei 14.133/2021"
              />
            </div>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* b) Fundamentação da contratação                                     */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="b" titulo="Fundamentação da contratação">
        <Textarea
          rows={6}
          value={dados.fundamentacao_contratacao}
          onChange={(e) => set("fundamentacao_contratacao", e.target.value)}
          placeholder="Descreva a necessidade e o interesse público que fundamentam esta contratação..."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* c) Descrição da solução                                             */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="c" titulo="Descrição da solução (ciclo de vida)">
        <Textarea
          rows={6}
          value={dados.descricao_solucao}
          onChange={(e) => set("descricao_solucao", e.target.value)}
          placeholder="Descreva a solução contemplando todo o ciclo de vida do objeto..."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* d) Requisitos da contratação                                        */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="d" titulo="Requisitos da contratação">
        <div>
          <Label>Requisitos gerais</Label>
          <Textarea
            rows={5}
            value={dados.requisitos_contratacao.requisitos_gerais}
            onChange={(e) =>
              set("requisitos_contratacao", {
                ...dados.requisitos_contratacao,
                requisitos_gerais: e.target.value,
              })
            }
            placeholder="Liste os requisitos técnicos, legais e operacionais..."
          />
        </div>
        <div>
          <Label>Sustentabilidade (opcional)</Label>
          <Textarea
            rows={3}
            value={dados.requisitos_contratacao.sustentabilidade ?? ""}
            onChange={(e) =>
              set("requisitos_contratacao", {
                ...dados.requisitos_contratacao,
                sustentabilidade: e.target.value,
              })
            }
            placeholder="Requisitos de sustentabilidade ambiental..."
          />
        </div>
        <div>
          <Label>Acessibilidade (opcional)</Label>
          <Textarea
            rows={3}
            value={dados.requisitos_contratacao.acessibilidade ?? ""}
            onChange={(e) =>
              set("requisitos_contratacao", {
                ...dados.requisitos_contratacao,
                acessibilidade: e.target.value,
              })
            }
            placeholder="Requisitos de acessibilidade..."
          />
        </div>
        <div>
          <Label>Segurança (opcional)</Label>
          <Textarea
            rows={3}
            value={dados.requisitos_contratacao.seguranca ?? ""}
            onChange={(e) =>
              set("requisitos_contratacao", {
                ...dados.requisitos_contratacao,
                seguranca: e.target.value,
              })
            }
            placeholder="Requisitos de segurança da informação ou física..."
          />
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* e) Modelo de execução                                               */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="e" titulo="Modelo de execução do objeto">
        <Textarea
          rows={6}
          value={dados.modelo_execucao}
          onChange={(e) => set("modelo_execucao", e.target.value)}
          placeholder="Defina como o contrato deverá produzir os resultados pretendidos..."
        />
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* f) Modelo de gestão                                                 */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="f" titulo="Modelo de gestão do contrato">
        <div>
          <Label>Descrição do modelo de gestão</Label>
          <Textarea
            rows={5}
            value={dados.modelo_gestao.descricao}
            onChange={(e) =>
              set("modelo_gestao", { ...dados.modelo_gestao, descricao: e.target.value })
            }
            placeholder="Descreva como a execução será acompanhada e fiscalizada..."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Fiscal titular (opcional)</Label>
            <Input
              value={dados.modelo_gestao.fiscal_titular ?? ""}
              onChange={(e) =>
                set("modelo_gestao", { ...dados.modelo_gestao, fiscal_titular: e.target.value })
              }
              placeholder="Nome / matrícula"
            />
          </div>
          <div>
            <Label>Fiscal substituto (opcional)</Label>
            <Input
              value={dados.modelo_gestao.fiscal_substituto ?? ""}
              onChange={(e) =>
                set("modelo_gestao", {
                  ...dados.modelo_gestao,
                  fiscal_substituto: e.target.value,
                })
              }
              placeholder="Nome / matrícula"
            />
          </div>
          <div>
            <Label>Gestor do contrato (opcional)</Label>
            <Input
              value={dados.modelo_gestao.gestor_contrato ?? ""}
              onChange={(e) =>
                set("modelo_gestao", { ...dados.modelo_gestao, gestor_contrato: e.target.value })
              }
              placeholder="Nome / matrícula"
            />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* g) Critérios de medição e pagamento                                 */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="g" titulo="Critérios de medição e de pagamento">
        <div>
          <Label>Forma de medição</Label>
          <Textarea
            rows={4}
            value={dados.criterios_medicao_pagamento.forma_medicao}
            onChange={(e) =>
              set("criterios_medicao_pagamento", {
                ...dados.criterios_medicao_pagamento,
                forma_medicao: e.target.value,
              })
            }
            placeholder="Descreva como o serviço/bem será medido..."
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Periodicidade</Label>
            <select
              className="w-full border rounded h-9 px-2 bg-white"
              value={dados.criterios_medicao_pagamento.periodicidade}
              onChange={(e) =>
                set("criterios_medicao_pagamento", {
                  ...dados.criterios_medicao_pagamento,
                  periodicidade: e.target.value as TrDados["criterios_medicao_pagamento"]["periodicidade"],
                })
              }
            >
              <option value="MENSAL">Mensal</option>
              <option value="QUINZENAL">Quinzenal</option>
              <option value="POR_ENTREGA">Por entrega</option>
              <option value="POR_ETAPA">Por etapa</option>
              <option value="OUTRA">Outra</option>
            </select>
          </div>
          <div>
            <Label>Prazo de pagamento (dias)</Label>
            <Input
              type="number"
              min={1}
              value={dados.criterios_medicao_pagamento.prazo_pagamento_dias || ""}
              onChange={(e) =>
                set("criterios_medicao_pagamento", {
                  ...dados.criterios_medicao_pagamento,
                  prazo_pagamento_dias: parseInt(e.target.value) || 0,
                })
              }
            />
          </div>
        </div>
        <div>
          <Label>Forma de pagamento</Label>
          <Textarea
            rows={3}
            value={dados.criterios_medicao_pagamento.forma_pagamento}
            onChange={(e) =>
              set("criterios_medicao_pagamento", {
                ...dados.criterios_medicao_pagamento,
                forma_pagamento: e.target.value,
              })
            }
            placeholder="Ex.: mediante apresentação de nota fiscal, após ateste..."
          />
        </div>
        <div>
          <Label>Instrumento de medição (opcional)</Label>
          <Input
            value={dados.criterios_medicao_pagamento.instrumento_medicao ?? ""}
            onChange={(e) =>
              set("criterios_medicao_pagamento", {
                ...dados.criterios_medicao_pagamento,
                instrumento_medicao: e.target.value,
              })
            }
            placeholder="Ex.: relatório mensal de atividades, ordem de serviço..."
          />
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* h) Forma e critérios de seleção                                     */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="h" titulo="Forma e critérios de seleção do fornecedor">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Modalidade</Label>
            <select
              className="w-full border rounded h-9 px-2 bg-white"
              value={dados.forma_criterios_selecao.modalidade}
              onChange={(e) =>
                set("forma_criterios_selecao", {
                  ...dados.forma_criterios_selecao,
                  modalidade: e.target.value,
                })
              }
            >
              <option value="">Selecione...</option>
              <option value="PREGAO_ELETRONICO">Pregão Eletrônico</option>
              <option value="PREGAO_PRESENCIAL">Pregão Presencial</option>
              <option value="CONCORRENCIA">Concorrência</option>
              <option value="CONCURSO">Concurso</option>
              <option value="LEILAO">Leilão</option>
              <option value="DIALOGO_COMPETITIVO">Diálogo Competitivo</option>
              <option value="DISPENSA_ELETRONICA">Dispensa Eletrônica</option>
              <option value="DISPENSA_PRESENCIAL">Dispensa Presencial</option>
              <option value="INEXIGIBILIDADE">Inexigibilidade</option>
            </select>
          </div>
          <div>
            <Label>Critério de julgamento</Label>
            <select
              className="w-full border rounded h-9 px-2 bg-white"
              value={dados.forma_criterios_selecao.criterio_julgamento}
              onChange={(e) =>
                set("forma_criterios_selecao", {
                  ...dados.forma_criterios_selecao,
                  criterio_julgamento: e.target.value,
                })
              }
            >
              <option value="">Selecione...</option>
              <option value="MENOR_PRECO">Menor Preço</option>
              <option value="MAIOR_DESCONTO">Maior Desconto</option>
              <option value="MELHOR_TECNICA">Melhor Técnica</option>
              <option value="TECNICA_E_PRECO">Técnica e Preço</option>
              <option value="MAIOR_OFERTA">Maior Oferta</option>
              <option value="MAIOR_RETORNO_ECONOMICO">Maior Retorno Econômico</option>
            </select>
          </div>
          <div>
            <Label>Modo de disputa</Label>
            <select
              className="w-full border rounded h-9 px-2 bg-white"
              value={dados.forma_criterios_selecao.modo_disputa}
              onChange={(e) =>
                set("forma_criterios_selecao", {
                  ...dados.forma_criterios_selecao,
                  modo_disputa: e.target.value,
                })
              }
            >
              <option value="">Selecione...</option>
              <option value="ABERTO">Aberto</option>
              <option value="FECHADO">Fechado</option>
              <option value="ABERTO_FECHADO">Aberto e Fechado</option>
              <option value="DISPENSA_COM_DISPUTA">Dispensa com Disputa</option>
            </select>
          </div>
        </div>

        {/* Requisitos de habilitação */}
        <div className="space-y-4 pt-2">
          <p className="text-sm font-semibold text-slate-600">Requisitos de habilitação</p>

          {(
            [
              ["juridica", "Jurídica"],
              ["fiscal_trabalhista", "Fiscal e Trabalhista"],
              ["tecnica", "Técnica (opcional)"],
              ["economica_financeira", "Econômica-financeira (opcional)"],
            ] as const
          ).map(([campo, rotulo]) => {
            const linhas =
              dados.forma_criterios_selecao.requisitos_habilitacao[campo] ?? []
            return (
              <div key={campo}>
                <div className="flex items-center justify-between mb-1">
                  <Label>{rotulo}</Label>
                  <Button
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => addHabilitacaoLinha(campo)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar
                  </Button>
                </div>
                {linhas.length === 0 && (
                  <p className="text-xs text-slate-400 italic">Nenhum requisito adicionado.</p>
                )}
                {linhas.map((linha, idx) => (
                  <div key={idx} className="flex gap-2 mb-1">
                    <Input
                      value={linha}
                      onChange={(e) => updateHabilitacaoLinha(campo, idx, e.target.value)}
                      placeholder={`Requisito ${idx + 1}`}
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      type="button"
                      onClick={() => removeHabilitacaoLinha(campo, idx)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* i) Estimativas do valor                                             */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="i" titulo="Estimativas do valor da contratação">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Valor total estimado (R$)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={dados.estimativas_valor.valor_total || ""}
              onChange={(e) =>
                set("estimativas_valor", {
                  ...dados.estimativas_valor,
                  valor_total: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>
          <div>
            <Label>Valor unitário médio (R$, opcional)</Label>
            <Input
              type="number"
              step="0.01"
              min={0}
              value={dados.estimativas_valor.valor_unitario_medio ?? ""}
              onChange={(e) =>
                set("estimativas_valor", {
                  ...dados.estimativas_valor,
                  valor_unitario_medio: parseFloat(e.target.value) || undefined,
                })
              }
            />
          </div>
        </div>
        <div>
          <Label>ID da pesquisa de referência (opcional)</Label>
          <Input
            value={dados.estimativas_valor.referencia_pesquisa_id ?? ""}
            onChange={(e) =>
              set("estimativas_valor", {
                ...dados.estimativas_valor,
                referencia_pesquisa_id: e.target.value || undefined,
              })
            }
            placeholder="Identificador do documento de pesquisa de preços"
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={dados.estimativas_valor.sigilo_orcamento}
              onChange={(e) =>
                set("estimativas_valor", {
                  ...dados.estimativas_valor,
                  sigilo_orcamento: e.target.checked,
                })
              }
            />
            <span className="text-sm">Orçamento sigiloso (art. 24 da Lei 14.133/2021)</span>
          </label>
          {dados.estimativas_valor.sigilo_orcamento && (
            <div>
              <Label>Justificativa do sigilo</Label>
              <Textarea
                rows={3}
                value={dados.estimativas_valor.justificativa_sigilo ?? ""}
                onChange={(e) =>
                  set("estimativas_valor", {
                    ...dados.estimativas_valor,
                    justificativa_sigilo: e.target.value,
                  })
                }
                placeholder="Justifique a necessidade de manter o orçamento sob sigilo..."
              />
            </div>
          )}
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* j) Adequação orçamentária                                           */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="j" titulo="Adequação orçamentária">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Fonte de recurso</Label>
            <Input
              value={dados.adequacao_orcamentaria.fonte_recurso}
              onChange={(e) =>
                set("adequacao_orcamentaria", {
                  ...dados.adequacao_orcamentaria,
                  fonte_recurso: e.target.value,
                })
              }
              placeholder="Ex.: Tesouro Nacional, Convênio nº..."
            />
          </div>
          <div>
            <Label>Elemento de despesa</Label>
            <Input
              value={dados.adequacao_orcamentaria.elemento_despesa}
              onChange={(e) =>
                set("adequacao_orcamentaria", {
                  ...dados.adequacao_orcamentaria,
                  elemento_despesa: e.target.value,
                })
              }
              placeholder="Ex.: 33903700"
            />
          </div>
          <div>
            <Label>Dotação orçamentária</Label>
            <Input
              value={dados.adequacao_orcamentaria.dotacao_orcamentaria}
              onChange={(e) =>
                set("adequacao_orcamentaria", {
                  ...dados.adequacao_orcamentaria,
                  dotacao_orcamentaria: e.target.value,
                })
              }
              placeholder="UO / Programa / Ação / Subação"
            />
          </div>
          <div>
            <Label>Exercício financeiro</Label>
            <Input
              type="number"
              min={2000}
              max={2099}
              value={dados.adequacao_orcamentaria.exercicio_financeiro || ""}
              onChange={(e) =>
                set("adequacao_orcamentaria", {
                  ...dados.adequacao_orcamentaria,
                  exercicio_financeiro: parseInt(e.target.value) || new Date().getFullYear(),
                })
              }
            />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Quantitativos                                                       */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="§" titulo="Quantitativos e itens" defaultOpen={false}>
        <div className="flex justify-end">
          <Button size="sm" variant="outline" type="button" onClick={addQuantitativo}>
            <Plus className="h-4 w-4 mr-1" />
            Adicionar item
          </Button>
        </div>
        {dados.quantitativos.length === 0 && (
          <p className="text-sm text-slate-400 italic text-center py-4">
            Nenhum item adicionado. Clique em "Adicionar item" para começar.
          </p>
        )}
        {dados.quantitativos.map((q, idx) => (
          <div key={idx} className="border rounded p-3 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-sm text-slate-700">Item #{q.item_numero}</span>
              <Button
                size="sm"
                variant="ghost"
                type="button"
                onClick={() => removeQuantitativo(idx)}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
            <div>
              <Label>Descrição</Label>
              <Input
                value={q.descricao}
                onChange={(e) => updateQuantitativo(idx, { descricao: e.target.value })}
                placeholder="Descrição do item"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div>
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={0}
                  step="any"
                  value={q.quantidade || ""}
                  onChange={(e) =>
                    updateQuantitativo(idx, { quantidade: parseFloat(e.target.value) || 0 })
                  }
                />
              </div>
              <div>
                <Label>Unidade</Label>
                <Input
                  value={q.unidade}
                  onChange={(e) => updateQuantitativo(idx, { unidade: e.target.value })}
                  placeholder="Ex.: un, m², hora..."
                />
              </div>
              <div>
                <Label>Valor unitário est. (R$)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={q.valor_unitario_estimado ?? ""}
                  onChange={(e) =>
                    updateQuantitativo(idx, {
                      valor_unitario_estimado: parseFloat(e.target.value) || undefined,
                    })
                  }
                />
              </div>
            </div>
          </div>
        ))}
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Responsável pela elaboração (opcional)                              */}
      {/* ------------------------------------------------------------------ */}
      <Section letra="*" titulo="Responsável pela elaboração" obrigatorio={false}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <Label>Nome</Label>
            <Input
              value={dados.responsavel_elaboracao?.nome ?? ""}
              onChange={(e) =>
                set("responsavel_elaboracao", {
                  ...dados.responsavel_elaboracao,
                  nome: e.target.value,
                  cargo: dados.responsavel_elaboracao?.cargo ?? "",
                })
              }
            />
          </div>
          <div>
            <Label>Cargo</Label>
            <Input
              value={dados.responsavel_elaboracao?.cargo ?? ""}
              onChange={(e) =>
                set("responsavel_elaboracao", {
                  ...dados.responsavel_elaboracao,
                  cargo: e.target.value,
                  nome: dados.responsavel_elaboracao?.nome ?? "",
                })
              }
            />
          </div>
          <div>
            <Label>Matrícula (opcional)</Label>
            <Input
              value={dados.responsavel_elaboracao?.matricula ?? ""}
              onChange={(e) =>
                set("responsavel_elaboracao", {
                  ...dados.responsavel_elaboracao,
                  matricula: e.target.value || undefined,
                  nome: dados.responsavel_elaboracao?.nome ?? "",
                  cargo: dados.responsavel_elaboracao?.cargo ?? "",
                })
              }
            />
          </div>
        </div>
      </Section>

      {/* ------------------------------------------------------------------ */}
      {/* Botão salvar                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex justify-end pt-4">
        <Button
          onClick={handleSalvar}
          disabled={salvando}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <Save className="h-4 w-4 mr-2" />
          {salvando ? "Salvando..." : "Salvar TR"}
        </Button>
      </div>
    </div>
  )
}
