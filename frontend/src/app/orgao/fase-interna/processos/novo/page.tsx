"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, ArrowRight, Check, Sparkles, ChevronRight,
  Home, Send, Loader2, FileText
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { API_URL, authFetch } from "@/lib/api"

const WIZARD_ETAPAS = [
  { id: "dados", sigla: "INI", nome: "Dados básicos", art: "Configuração inicial" },
  { id: "dfd", sigla: "DFD", nome: "Formalização da Demanda", art: "Art. 18, I" },
  { id: "etp", sigla: "ETP", nome: "Estudo Técnico Preliminar", art: "Art. 18, §1º" },
  { id: "riscos", sigla: "MR", nome: "Análise de Riscos", art: "Art. 18, X" },
  { id: "pesquisa", sigla: "PP", nome: "Pesquisa de Preços", art: "Art. 23" },
  { id: "tr", sigla: "TR", nome: "Termo de Referência", art: "Art. 6º, XXIII" },
  { id: "autorizacao", sigla: "AUT", nome: "Autorização", art: "Art. 18, II" },
  { id: "edital", sigla: "ED", nome: "Minuta do Edital", art: "Art. 25" },
  { id: "juridico", sigla: "PJ", nome: "Parecer Jurídico", art: "Art. 53" },
  { id: "concluido", sigla: "OK", nome: "Fase interna concluída", art: "" },
]

interface FormData {
  objeto: string
  categoria: string
  modalidade: string
  valor: string
  quantidade: string
  area: string
  dfd: string
  etp_necessidade: string
  etp_solucao: string
  riscos: string
  precos_fontes: string
  tr_requisitos: string
  tr_prazo: string
  autorizacao_autoridade: string
  edital_notas: string
  juridico_obs: string
}

function useTypewriter() {
  const [texto, setTexto] = useState("")
  const [ocupado, setOcupado] = useState(false)

  const animar = (content: string) => {
    setOcupado(true)
    setTexto("")
    let i = 0
    const interval = setInterval(() => {
      i += Math.max(3, Math.round(content.length / 60))
      setTexto(content.slice(0, i))
      if (i >= content.length) {
        clearInterval(interval)
        setTexto(content)
        setOcupado(false)
      }
    }, 20)
  }

  return { texto, ocupado, animar, set: setTexto }
}

function GerarComIA({ label, campo, contexto, onGerar }: { label: string; campo: string; contexto: string; onGerar: (texto: string) => void }) {
  const [carregando, setCarregando] = useState(false)

  const gerar = async () => {
    setCarregando(true)
    try {
      const res = await authFetch(`${API_URL}/api/ia/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `Gere um ${label} para a seguinte contratação:\n${contexto}\n\nEscreva de forma clara, objetiva e fundamentada na Lei 14.133/2021. Máximo 300 palavras.` }],
          system: "Você é especialista em fase interna de licitações (Lei 14.133/2021). Gere documentos precisos e bem fundamentados.",
          max_tokens: 600,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        const texto = data.content?.[0]?.text || data.message || data.response || ""
        onGerar(texto)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setCarregando(false)
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={gerar} disabled={carregando} className="text-[#1351b4] border-[#c5d4eb] hover:bg-[#ecf3fc]">
      {carregando ? (
        <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Gerando…</>
      ) : (
        <><Sparkles className="w-3.5 h-3.5 mr-1.5" /> Gerar com IA</>
      )}
    </Button>
  )
}

export default function NovoProcessoPage() {
  const router = useRouter()
  const [etapaAtual, setEtapaAtual] = useState(0)
  const [concluidas, setConcluidas] = useState<string[]>([])
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<FormData>({
    objeto: "", categoria: "servicos", modalidade: "pregao", valor: "", quantidade: "", area: "",
    dfd: "", etp_necessidade: "", etp_solucao: "", riscos: "", precos_fontes: "",
    tr_requisitos: "", tr_prazo: "", autorizacao_autoridade: "", edital_notas: "", juridico_obs: "",
  })

  const set = (campo: keyof FormData, valor: string) =>
    setForm((prev) => ({ ...prev, [campo]: valor }))

  const contextoIA = `Objeto: ${form.objeto || "(não informado)"}\nModalidade: ${form.modalidade}\nCategoria: ${form.categoria}\nÁrea: ${form.area || "(não informado)"}\nValor estimado: ${form.valor || "(não informado)"}`

  const avancar = () => {
    const etapa = WIZARD_ETAPAS[etapaAtual]
    if (!concluidas.includes(etapa.id)) {
      setConcluidas((prev) => [...prev, etapa.id])
    }
    setEtapaAtual((prev) => Math.min(prev + 1, WIZARD_ETAPAS.length - 1))
  }

  const voltar = () => setEtapaAtual((prev) => Math.max(prev - 1, 0))

  const salvarProcesso = async () => {
    if (!form.objeto || !form.area) return
    setSalvando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          objeto: form.objeto,
          modalidade: form.modalidade.toUpperCase(),
          categoria_bem_servico: form.categoria.toUpperCase(),
          valor_total_estimado: parseFloat(form.valor) || 0,
          fase: "PLANEJAMENTO",
        }),
      })
      if (res.ok) {
        const data = await res.json()
        router.push(`/orgao/fase-interna/processos/${data.id}`)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setSalvando(false)
    }
  }

  const etapa = WIZARD_ETAPAS[etapaAtual]
  const progresso = (concluidas.length / (WIZARD_ETAPAS.length - 1)) * 100
  const isConcluido = etapa.id === "concluido"

  return (
    <div className="p-6 pb-10 max-w-6xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-xs text-gray-500 mb-6">
        <Home className="w-3.5 h-3.5" />
        <ChevronRight className="w-3 h-3" />
        <Link href="/orgao/fase-interna" className="hover:text-[#1351b4]">Fase Interna</Link>
        <ChevronRight className="w-3 h-3" />
        <Link href="/orgao/fase-interna/processos" className="hover:text-[#1351b4]">Processos</Link>
        <ChevronRight className="w-3 h-3" />
        <span className="text-[#1351b4] font-medium">Novo processo</span>
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-6">
        {/* Sidebar do wizard */}
        <div className="space-y-3">
          <Card className="border-0 shadow-sm sticky top-4">
            <CardHeader className="pb-2 pt-4 px-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Fase interna · {concluidas.length}/{WIZARD_ETAPAS.length - 1}
              </p>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Progress value={progresso} className="h-1.5 mb-4" />
              <div className="space-y-0.5">
                {WIZARD_ETAPAS.slice(0, -1).map((e, idx) => {
                  const done = concluidas.includes(e.id)
                  const atual = etapaAtual === idx
                  return (
                    <button
                      key={e.id}
                      onClick={() => done || atual ? setEtapaAtual(idx) : null}
                      className={`w-full flex items-center gap-2.5 py-2 px-2 rounded-lg text-left transition-colors ${
                        atual ? "bg-[#ecf3fc]" : "hover:bg-gray-50"
                      } ${!done && !atual ? "opacity-50" : ""}`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold border ${
                        done ? "bg-[#168821] border-[#168821] text-white" : atual ? "bg-[#1351b4] border-[#1351b4] text-white" : "bg-white border-gray-200 text-gray-500"
                      }`}>
                        {done ? <Check className="w-3 h-3" /> : idx + 1}
                      </div>
                      <div>
                        <div className={`text-xs font-semibold leading-tight ${atual ? "text-[#1351b4]" : "text-gray-700"}`}>
                          <span className="text-[9px] font-bold mr-1 bg-gray-100 px-1 py-0.5 rounded">{e.sigla}</span>
                          {e.nome}
                        </div>
                        <div className="text-[9px] text-gray-400">{e.art}</div>
                      </div>
                    </button>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Conteúdo da etapa */}
        <div className="space-y-4">
          {isConcluido ? (
            <ConclusaoStep onSalvar={salvarProcesso} salvando={salvando} />
          ) : etapa.id === "dados" ? (
            <DadosBasicosStep form={form} set={set} />
          ) : etapa.id === "dfd" ? (
            <TextoStep
              titulo="Documento de Formalização da Demanda (DFD)"
              descricao="Formaliza a necessidade da contratação. Deve identificar a demanda, justificar e vincular ao planejamento institucional."
              art="Art. 18, I · Lei 14.133/2021"
              campo="dfd"
              valor={form.dfd}
              onChange={(v) => set("dfd", v)}
              label="DFD completo"
              contextoIA={contextoIA}
            />
          ) : etapa.id === "etp" ? (
            <ETPStep form={form} set={set} contextoIA={contextoIA} />
          ) : etapa.id === "riscos" ? (
            <TextoStep
              titulo="Análise de Riscos"
              descricao="Identifica os principais riscos do processo e define medidas de mitigação."
              art="Art. 18, X · Art. 22 · Lei 14.133/2021"
              campo="riscos"
              valor={form.riscos}
              onChange={(v) => set("riscos", v)}
              label="Mapa de riscos"
              contextoIA={contextoIA}
            />
          ) : etapa.id === "pesquisa" ? (
            <TextoStep
              titulo="Pesquisa de Preços"
              descricao="Levantamento de preços de mercado para estimativa do valor da contratação."
              art="Art. 23 · IN 65/2021"
              campo="precos_fontes"
              valor={form.precos_fontes}
              onChange={(v) => set("precos_fontes", v)}
              label="Fontes e resultados da pesquisa"
              contextoIA={contextoIA}
            />
          ) : etapa.id === "tr" ? (
            <TRStep form={form} set={set} contextoIA={contextoIA} />
          ) : etapa.id === "autorizacao" ? (
            <TextoStep
              titulo="Autorização da Autoridade Competente"
              descricao="Registro da autorização da autoridade competente para abertura do processo."
              art="Art. 18, II · Lei 14.133/2021"
              campo="autorizacao_autoridade"
              valor={form.autorizacao_autoridade}
              onChange={(v) => set("autorizacao_autoridade", v)}
              label="Dados da autorização"
              contextoIA={contextoIA}
            />
          ) : etapa.id === "edital" ? (
            <TextoStep
              titulo="Minuta do Edital"
              descricao="Elaboração da minuta do edital de licitação com todas as cláusulas obrigatórias."
              art="Art. 25 · Lei 14.133/2021"
              campo="edital_notas"
              valor={form.edital_notas}
              onChange={(v) => set("edital_notas", v)}
              label="Notas sobre o edital"
              contextoIA={contextoIA}
            />
          ) : etapa.id === "juridico" ? (
            <TextoStep
              titulo="Parecer Jurídico"
              descricao="Análise jurídica do processo para validação da legalidade da contratação."
              art="Art. 53 · Lei 14.133/2021"
              campo="juridico_obs"
              valor={form.juridico_obs}
              onChange={(v) => set("juridico_obs", v)}
              label="Observações para a procuradoria"
              contextoIA={contextoIA}
            />
          ) : null}

          {/* Navegação */}
          {!isConcluido && (
            <div className="flex justify-between pt-4 border-t border-gray-100">
              <Button variant="outline" onClick={voltar} disabled={etapaAtual === 0}>
                <ArrowLeft className="w-4 h-4 mr-2" /> Anterior
              </Button>
              <Button onClick={avancar} className="bg-[#1351b4] hover:bg-[#0c326f]">
                {etapaAtual === WIZARD_ETAPAS.length - 2 ? (
                  <><Check className="w-4 h-4 mr-2" /> Concluir fase interna</>
                ) : (
                  <>Próxima etapa <ArrowRight className="w-4 h-4 ml-2" /></>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-componentes das etapas ──────────────────────────────────

function DadosBasicosStep({ form, set }: { form: FormData; set: (k: keyof FormData, v: string) => void }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Dados básicos do processo</CardTitle>
        <p className="text-sm text-gray-500">A IA usará essas informações para preencher os documentos seguintes.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Objeto da contratação <span className="text-red-500">*</span></Label>
          <Input
            value={form.objeto}
            onChange={(e) => set("objeto", e.target.value)}
            placeholder="Ex.: Aquisição de licenças de software de gestão de protocolo eletrônico"
          />
          <p className="text-xs text-gray-400">Descreva de forma objetiva o que será contratado (Art. 6º, XXIII).</p>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Categoria</Label>
            <Select value={form.categoria} onValueChange={(v) => set("categoria", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bens">Bens</SelectItem>
                <SelectItem value="servicos">Serviços</SelectItem>
                <SelectItem value="servicos_continuados">Serviços continuados</SelectItem>
                <SelectItem value="obras">Obras de engenharia</SelectItem>
                <SelectItem value="ti">Soluções de TI</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Modalidade sugerida <span className="text-red-500">*</span></Label>
            <Select value={form.modalidade} onValueChange={(v) => set("modalidade", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pregao">Pregão Eletrônico</SelectItem>
                <SelectItem value="concorrencia">Concorrência</SelectItem>
                <SelectItem value="dispensa">Dispensa Eletrônica</SelectItem>
                <SelectItem value="inexigibilidade">Inexigibilidade</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Valor estimado preliminar (R$)</Label>
            <Input
              value={form.valor}
              onChange={(e) => set("valor", e.target.value)}
              placeholder="Será refinado na pesquisa de preços"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Quantidade</Label>
            <Input
              value={form.quantidade}
              onChange={(e) => set("quantidade", e.target.value)}
              placeholder="Ex.: 250 licenças"
            />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Área demandante <span className="text-red-500">*</span></Label>
            <Select value={form.area} onValueChange={(v) => set("area", v)}>
              <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sec_adm">Secretaria de Administração</SelectItem>
                <SelectItem value="sec_inf">Secretaria de Infraestrutura</SelectItem>
                <SelectItem value="sec_ti">Secretaria de Tecnologia</SelectItem>
                <SelectItem value="sec_saude">Secretaria de Saúde</SelectItem>
                <SelectItem value="procuradoria">Procuradoria Geral</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function TextoStep({
  titulo, descricao, art, campo, valor, onChange, label, contextoIA,
}: {
  titulo: string; descricao: string; art: string; campo: string;
  valor: string; onChange: (v: string) => void; label: string; contextoIA: string
}) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">{titulo}</CardTitle>
            <p className="text-sm text-gray-500 mt-1">{descricao}</p>
            <span className="inline-block mt-2 text-xs bg-[#ecf3fc] text-[#1351b4] font-medium px-2 py-0.5 rounded">
              {art}
            </span>
          </div>
          <GerarComIA label={label} campo={campo} contexto={contextoIA} onGerar={onChange} />
        </div>
      </CardHeader>
      <CardContent>
        <Textarea
          value={valor}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Descreva o ${label.toLowerCase()} conforme exigido pela Lei 14.133/2021…`}
          className="min-h-48 resize-none text-sm"
        />
      </CardContent>
    </Card>
  )
}

function ETPStep({ form, set, contextoIA }: { form: FormData; set: (k: keyof FormData, v: string) => void; contextoIA: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Estudo Técnico Preliminar (ETP)</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Análise das alternativas e justificativa técnica da solução escolhida.
            </p>
            <span className="inline-block mt-2 text-xs bg-[#ecf3fc] text-[#1351b4] font-medium px-2 py-0.5 rounded">
              Art. 18, §1º · Lei 14.133/2021
            </span>
          </div>
          <GerarComIA label="ETP completo" campo="etp" contexto={contextoIA} onGerar={(v) => { set("etp_necessidade", v); set("etp_solucao", v) }} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Descrição da necessidade</Label>
          <Textarea
            value={form.etp_necessidade}
            onChange={(e) => set("etp_necessidade", e.target.value)}
            placeholder="Descreva a necessidade que motivou esta contratação…"
            className="min-h-28 resize-none text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Solução proposta e justificativa técnica</Label>
          <Textarea
            value={form.etp_solucao}
            onChange={(e) => set("etp_solucao", e.target.value)}
            placeholder="Descreva a solução escolhida e justifique tecnicamente…"
            className="min-h-28 resize-none text-sm"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function TRStep({ form, set, contextoIA }: { form: FormData; set: (k: keyof FormData, v: string) => void; contextoIA: string }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">Termo de Referência (TR)</CardTitle>
            <p className="text-sm text-gray-500 mt-1">
              Especificação detalhada do objeto, requisitos e condições de execução.
            </p>
            <span className="inline-block mt-2 text-xs bg-[#ecf3fc] text-[#1351b4] font-medium px-2 py-0.5 rounded">
              Art. 6º, XXIII · Art. 40 · Lei 14.133/2021
            </span>
          </div>
          <GerarComIA label="TR completo" campo="tr" contexto={contextoIA} onGerar={(v) => set("tr_requisitos", v)} />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Requisitos da contratação</Label>
          <Textarea
            value={form.tr_requisitos}
            onChange={(e) => set("tr_requisitos", e.target.value)}
            placeholder="Liste todos os requisitos técnicos, habilitação e condições de execução…"
            className="min-h-36 resize-none text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Prazo de execução / vigência</Label>
          <Input
            value={form.tr_prazo}
            onChange={(e) => set("tr_prazo", e.target.value)}
            placeholder="Ex.: 12 meses, prorrogáveis por igual período"
          />
        </div>
      </CardContent>
    </Card>
  )
}

function ConclusaoStep({ onSalvar, salvando }: { onSalvar: () => void; salvando: boolean }) {
  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="py-16 text-center">
        <div className="w-20 h-20 rounded-full bg-[#e3f5e1] flex items-center justify-center mx-auto mb-4">
          <Check className="w-10 h-10 text-[#168821]" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Fase interna concluída!</h2>
        <p className="text-sm text-gray-500 max-w-sm mx-auto mb-8">
          Todos os documentos da fase interna foram preenchidos. O processo será registrado e
          ficará disponível para revisão e aprovação.
        </p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" asChild>
            <Link href="/orgao/fase-interna/processos">Ver todos os processos</Link>
          </Button>
          <Button onClick={onSalvar} disabled={salvando} className="bg-[#1351b4] hover:bg-[#0c326f]">
            {salvando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando…</> : <><FileText className="w-4 h-4 mr-2" /> Salvar processo</>}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
