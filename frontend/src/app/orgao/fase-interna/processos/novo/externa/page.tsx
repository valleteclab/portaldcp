"use client"

import { Suspense, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { AlertCircle, ArrowLeft, ArrowRight, Check, ChevronRight, Home, Loader2 } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { comAvisoDeAbertura } from "@/lib/demandas/proxima-acao-dfd"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ItensTab } from "@/components/cadastro-licitacao/ItensTab"
import {
  CRITERIOS_JULGAMENTO,
  MODALIDADES,
  MODOS_DISPUTA,
  TIPOS_CONTRATACAO,
  UNIDADES,
  type ItemLicitacao,
} from "@/components/cadastro-licitacao/types"
import { CamposModalidadeEspecial, MODALIDADES_ESPECIAIS_WIZARD, salvarCamposModalidadeEspecial } from "@/components/modalidades/CamposModalidadeEspecial"
import type { Valores } from "@/components/modalidades/formularios"
import {
  CRITERIOS_POR_MODALIDADE,
  MODALIDADES_CONTRATACAO_DIRETA,
  itemPreenchido,
  lembrarEscolhaModo,
  normalizarUnidade,
  valorDosItens,
} from "@/lib/fase-interna/criacao"
import {
  DocumentosExternos,
  ResultadoDaJuntada,
  errosLocaisDocumentos,
  estadoDocumentosVazio,
  montarEnvioDocumentos,
  type ErroExterno,
  type EstadoDocumentosExternos,
  type ResultadoJuntada,
} from "@/components/fase-interna/externa/DocumentosExternos"

type Passo = "DADOS" | "ITENS" | "DOCUMENTOS"
const PASSOS: Array<{ id: Passo; titulo: string; texto: string }> = [
  { id: "DADOS", titulo: "Dados", texto: "Modalidade, enquadramento, objeto e números" },
  { id: "ITENS", titulo: "Itens", texto: "Descrição, unidade, quantidade e valor" },
  { id: "DOCUMENTOS", titulo: "Documentos", texto: "Os PDFs da fase interna" },
]
const MODALIDADES_LICITACAO = ["PREGAO_ELETRONICO", "CONCORRENCIA", "CONCURSO", "LEILAO", "DIALOGO_COMPETITIVO"]
const COM_MODO_DISPUTA = ["PREGAO_ELETRONICO", "CONCORRENCIA", "DIALOGO_COMPETITIVO"]
/** Rótulos do CamposModalidadeEspecial (usa os nomes do assistente). */
const ROTULO_ESPECIAL: Record<string, string> = { LEILAO: "Leilão", CONCURSO: "Concurso", DIALOGO_COMPETITIVO: "Diálogo Competitivo" }
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

interface Dados {
  modalidade: string
  tipo_contratacao: string
  fundamento_legal: string
  criterio_julgamento: string
  modo_disputa: string
  objeto: string
  numero_processo: string
  numero_edital: string
  area_demandante: string
  dispensa_com_lances: boolean | null
  sigiloso: boolean
  justificativa_sigilo: string
  especiais?: Valores
}

/** Item da demanda de origem (GET /api/demandas/:id). */
interface ItemDaDemanda {
  descricao_objeto?: string
  quantidade_estimada?: number | string
  unidade_medida?: string
  valor_unitario_estimado?: number | string
  categoria?: string
  codigo_item_catalogo?: string
  nome_classe?: string
  item_pca_id?: string
  justificativa?: string
}

interface OpcaoDisputa {
  com_lances: boolean
  rotulo: string
  explicacao: string
}

/**
 * FASE INTERNA FEITA FORA DO SISTEMA — fluxo curto em 3 passos (modelo BLL,
 * BBMNET, Licitanet), uma tela com passos:
 *  1. Dados: modalidade, fundamento legal (select da modalidade), objeto, nº
 *     do processo administrativo e da dispensa/licitação, área demandante,
 *     disputa da dispensa (com/sem lances), sigilo do orçamento (art. 24);
 *  2. Itens: o mesmo editor (catálogo, planilha, digitação) com unidade e
 *     valor unitário obrigatórios (decisão 2: a pesquisa foi feita fora);
 *  3. Documentos: vários PDFs, cada um classificado como uma peça, com o
 *     checklist do art. 72 / art. 18 ao lado.
 * "Criar o processo" cria, grava os itens e junta tudo numa operação só
 * (POST /api/fase-interna/externa/processo). Recusa = nada gravado, a tela
 * volta ao passo do erro; peça que não entrar = pendência clara e retomável.
 */
function FaseInternaFeitaFora() {
  const router = useRouter()
  const params = useSearchParams()
  const demandaId = params.get("demanda_id")
  // DFD consolidado de origem (unidade de planejamento): itens somados e objeto do DFD
  const dfdId = params.get("dfd_id")
  const [passo, setPasso] = useState<Passo>("DADOS")
  const [dados, setDados] = useState<Dados>({
    modalidade: params.get("modalidade") && MODALIDADES.some((m) => m.value === params.get("modalidade")) ? params.get("modalidade")! : "",
    tipo_contratacao: "",
    fundamento_legal: "",
    criterio_julgamento: "",
    modo_disputa: "",
    objeto: "",
    numero_processo: "",
    numero_edital: "",
    area_demandante: "",
    dispensa_com_lances: null,
    sigiloso: false,
    justificativa_sigilo: "",
  })
  const [itens, setItens] = useState<ItemLicitacao[]>([])
  const [docs, setDocs] = useState<EstadoDocumentosExternos>(estadoDocumentosVazio())
  const [fundamentos, setFundamentos] = useState<Array<{ codigo: string; referencia: string; descricao: string }>>([])
  const [fundamentoPadrao, setFundamentoPadrao] = useState<string | null>(null)
  const [disputa, setDisputa] = useState<{ opcoes: OpcaoDisputa[]; padrao_do_orgao: boolean } | null>(null)
  const [erros, setErros] = useState<ErroExterno[]>([])
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoJuntada | null>(null)
  const [pendentes, setPendentes] = useState<EstadoDocumentosExternos | null>(null)
  const [opcoesPecas, setOpcoesPecas] = useState<Array<{ tipo: string; rotulo: string }>>([])
  // Rótulo do DFD de origem ("DFD nº N/AAAA") para o aviso "Processo aberto" na tela do processo
  const [dfdRotulo, setDfdRotulo] = useState<string | null>(null)
  const destinoFinal = (destino: string) => (dfdId ? comAvisoDeAbertura(destino, dfdRotulo) : destino)

  const set = (p: Partial<Dados>) => setDados((d) => ({ ...d, ...p }))
  const direta = MODALIDADES_CONTRATACAO_DIRETA.includes(dados.modalidade)
  const licitacaoFormal = MODALIDADES_LICITACAO.includes(dados.modalidade)
  const criterios = CRITERIOS_POR_MODALIDADE[dados.modalidade] ?? []

  useEffect(() => { lembrarEscolhaModo("FORA") }, [])

  // DFD consolidado de origem: objeto, unidade e itens somados (o backend confere o DFD de novo)
  useEffect(() => {
    if (!dfdId) return
    authFetch(`${API_URL}/api/dfds-consolidados/${dfdId}`)
      .then(async (r) => {
        if (!r.ok) return toast.error("DFD de origem não encontrado.")
        const d = await r.json()
        setDfdRotulo(typeof d.rotulo === "string" ? d.rotulo : null)
        const its: any[] = d.itens ?? []
        const setores = [...new Set((d.demandas ?? []).map((x: any) => x.unidade_requisitante))].join(", ")
        set({
          objeto: d.objeto || "",
          area_demandante: d.unidade_planejamento_nome ? `${d.unidade_planejamento_nome}${setores ? ` (demandas de: ${setores})` : ""}` : setores,
          tipo_contratacao: its.some((i) => i.categoria === "SERVICO") ? "SERVICO" : "COMPRA",
        })
        setItens(
          its.map((i, n) => ({
            numero: n + 1,
            descricao: i.descricao || "",
            quantidade: Number(i.quantidade) || 1,
            unidade: normalizarUnidade(i.unidade_medida),
            valor_unitario: Number(i.valor_unitario_estimado) || 0,
            tipo_item: i.categoria === "SERVICO" ? "SERVICO" : "MATERIAL",
            codigo_catalogo: i.codigo_item_catalogo || undefined,
            classe_catalogo: i.nome_classe || undefined,
            item_pca_id: i.item_pca_id || undefined,
            justificativa_sem_pca: i.item_pca_id ? undefined : i.justificativa || undefined,
          })),
        )
      })
      .catch(() => toast.error("Não foi possível carregar o DFD de origem."))
  }, [dfdId])

  // Demanda de origem: objeto, área e itens aproveitados (o backend confere a demanda de novo)
  useEffect(() => {
    if (!demandaId || dfdId) return
    authFetch(`${API_URL}/api/demandas/${demandaId}`)
      .then(async (r) => {
        if (!r.ok) return toast.error("Demanda de origem não encontrada.")
        const d = await r.json()
        const its: ItemDaDemanda[] = d.itens ?? []
        set({
          objeto: d.descricao_sucinta_objeto || (its.length === 1 ? its[0].descricao_objeto : `Contratação referente à demanda ${d.unidade_requisitante}`),
          area_demandante: d.unidade_requisitante || "",
          tipo_contratacao: its.some((i) => i.categoria === "SERVICO") ? "SERVICO" : "COMPRA",
        })
        setItens(
          its.map((i, n) => ({
            numero: n + 1,
            descricao: i.descricao_objeto || "",
            quantidade: Number(i.quantidade_estimada) || 1,
            unidade: normalizarUnidade(i.unidade_medida),
            valor_unitario: Number(i.valor_unitario_estimado) || 0,
            tipo_item: i.categoria === "MATERIAL" ? "MATERIAL" : i.categoria === "SERVICO" ? "SERVICO" : undefined,
            codigo_catalogo: i.codigo_item_catalogo || undefined,
            classe_catalogo: i.nome_classe || undefined,
            item_pca_id: i.item_pca_id || undefined,
            justificativa_sem_pca: i.item_pca_id ? undefined : i.justificativa || undefined,
          })),
        )
      })
      .catch(() => toast.error("Não foi possível carregar a demanda de origem."))
  }, [demandaId, dfdId])

  // Fundamento legal: opções da modalidade (fonte única do enquadramento — backend)
  useEffect(() => {
    if (!dados.modalidade) return
    const q = new URLSearchParams({ modalidade: dados.modalidade, tipo_contratacao: dados.tipo_contratacao || "" })
    authFetch(`${API_URL}/api/parametros-licitacao/fundamentos-legais?${q}`)
      .then(async (r) => {
        if (!r.ok) return
        const j = await r.json()
        setFundamentos(j.fundamentos || [])
        setFundamentoPadrao(j.padrao || null)
      })
      .catch(() => null)
  }, [dados.modalidade, dados.tipo_contratacao])

  // Disputa da dispensa: as opções e o padrão sugerido do órgão (mesmos da escolha no processo)
  useEffect(() => {
    if (dados.modalidade !== "DISPENSA_ELETRONICA") { setDisputa(null); return }
    authFetch(`${API_URL}/api/fase-interna/externa/checklist`, { method: "POST", body: JSON.stringify({ modalidade: dados.modalidade }) })
      .then(async (r) => {
        if (!r.ok) return
        const j = await r.json()
        setDisputa(j.disputa ?? null)
        setDados((d) => (d.dispensa_com_lances === null && j.disputa ? { ...d, dispensa_com_lances: !!j.disputa.padrao_do_orgao } : d))
      })
      .catch(() => null)
  }, [dados.modalidade])

  const trocarModalidade = (v: string) => {
    const cs = CRITERIOS_POR_MODALIDADE[v] ?? []
    set({
      modalidade: v,
      fundamento_legal: "",
      criterio_julgamento: cs.includes(dados.criterio_julgamento) ? dados.criterio_julgamento : cs[0] ?? "",
      modo_disputa: COM_MODO_DISPUTA.includes(v) ? dados.modo_disputa || "ABERTO" : "",
      dispensa_com_lances: null,
      ...(v === "LEILAO" ? { tipo_contratacao: "ALIENACAO" } : {}),
    })
  }

  // ─── Conferências na tela (o backend confere tudo de novo antes de gravar) ─
  const errosDados = useMemo(() => {
    const e: string[] = []
    if (!dados.modalidade) e.push("Escolha a modalidade.")
    if (!dados.tipo_contratacao) e.push("Escolha a natureza do objeto.")
    if (dados.objeto.trim().length < 5) e.push("Descreva o objeto.")
    if (!dados.numero_processo.trim()) e.push("Informe o número do processo administrativo.")
    if (licitacaoFormal && !dados.criterio_julgamento) e.push("Escolha o critério de julgamento.")
    if (dados.sigiloso && dados.justificativa_sigilo.trim().length < 20) e.push("Justifique o sigilo do orçamento (art. 24) — mínimo 20 caracteres.")
    return e
  }, [dados, licitacaoFormal])
  const prontos = itens.filter(itemPreenchido)
  const errosItens = useMemo(() => {
    const e: string[] = []
    if (!prontos.length) e.push("Informe ao menos um item.")
    prontos.forEach((i, n) => {
      if (!UNIDADES.some((u) => u.value === i.unidade)) e.push(`Item ${n + 1}: escolha a unidade de medida.`)
      if (!(Number(i.valor_unitario) > 0)) e.push(`Item ${n + 1}: informe o valor unitário (o valor da pesquisa feita fora).`)
    })
    return e
  }, [prontos])
  const errosDocs = errosLocaisDocumentos(docs, opcoesPecas)

  const irPara = (p: Passo) => {
    setPasso(p)
    window.scrollTo?.({ top: 0 })
  }

  const corpoItens = () =>
    prontos.map((i) => ({
      descricao: i.descricao.trim(),
      quantidade: Number(i.quantidade),
      unidade: i.unidade,
      valor_unitario: Number(i.valor_unitario),
      tipo_item: i.tipo_item,
      codigo_catalogo: i.codigo_catalogo || i.codigo_catmat || i.codigo_catser,
      codigo_catmat: i.codigo_catmat,
      codigo_catser: i.codigo_catser,
      classe_catalogo: i.classe_catalogo,
      item_pca_id: i.item_pca_id,
      justificativa_sem_pca: i.justificativa_sem_pca,
    }))

  const criar = async () => {
    if (errosDados.length) return irPara("DADOS")
    if (errosItens.length) return irPara("ITENS")
    if (errosDocs.length || !docs.arquivos.length) {
      if (!docs.arquivos.length) toast.error("Envie os PDFs da fase interna.")
      return
    }
    setEnviando(true)
    setErros([])
    try {
      const envio = montarEnvioDocumentos(docs)
      const fd = new FormData()
      fd.append(
        "dados",
        JSON.stringify({
          modalidade: dados.modalidade,
          tipo_contratacao: dados.tipo_contratacao,
          fundamento_legal: dados.fundamento_legal || null,
          criterio_julgamento: licitacaoFormal ? dados.criterio_julgamento : null,
          modo_disputa: COM_MODO_DISPUTA.includes(dados.modalidade) ? dados.modo_disputa || "ABERTO" : null,
          objeto: dados.objeto.trim(),
          numero_processo: dados.numero_processo.trim(),
          numero_edital: dados.numero_edital.trim() || null,
          area_demandante: dados.area_demandante.trim() || null,
          dispensa_com_lances: dados.modalidade === "DISPENSA_ELETRONICA" ? dados.dispensa_com_lances : null,
          sigilo: { sigiloso: dados.sigiloso, justificativa: dados.sigiloso ? dados.justificativa_sigilo.trim() : null },
          demanda_id: dfdId ? null : demandaId,
          dfd_id: dfdId,
          itens: corpoItens(),
          classificacao: envio.classificacao,
        }),
      )
      envio.arquivos.forEach((f) => fd.append("arquivos", f, f.name))
      const r = await authFetch(`${API_URL}/api/fase-interna/externa/processo`, { method: "POST", body: fd })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        const lista: ErroExterno[] = Array.isArray(j?.erros) ? j.erros : [{ passo: (j?.passo as Passo) || "DOCUMENTOS", mensagem: j?.message || `HTTP ${r.status}` }]
        setErros(lista)
        irPara((j?.passo as Passo) || lista[0]?.passo || "DOCUMENTOS")
        toast.error("Nada foi gravado — corrija o que está indicado e tente de novo.")
        return
      }
      const res = j as ResultadoJuntada
      window.dispatchEvent(new Event("processos-updated"))
      // Leilão/concurso/diálogo: dados próprios da modalidade (o que faltar vira pendência no processo)
      if (MODALIDADES_ESPECIAIS_WIZARD.includes(ROTULO_ESPECIAL[dados.modalidade] ?? "")) {
        const erroEspeciais = await salvarCamposModalidadeEspecial(res.licitacao_id, ROTULO_ESPECIAL[dados.modalidade], dados.especiais)
        if (erroEspeciais) toast.warning(`Dados da modalidade pendentes: ${erroEspeciais}`)
      }
      if (!res.pendencias.length) {
        toast.success(`Processo ${res.numero_processo} criado com ${res.juntadas.length} peça(s) juntada(s).`)
        router.push(destinoFinal(res.destino))
        return
      }
      setResultado(res)
      setPendentes(pendentesDoEnvio(docs, res))
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  /** Retomada: reenvia só o que não entrou (mesmos arquivos e dados), no processo já criado. */
  const tentarDeNovo = async () => {
    if (!resultado || !pendentes) return
    setEnviando(true)
    try {
      const envio = montarEnvioDocumentos(pendentes)
      const fd = new FormData()
      fd.append("classificacao", JSON.stringify(envio.classificacao))
      envio.arquivos.forEach((f) => fd.append("arquivos", f, f.name))
      const r = await authFetch(`${API_URL}/api/fase-interna/${resultado.licitacao_id}/externa/documentos`, { method: "POST", body: fd })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.message || `HTTP ${r.status}`)
      const novo = j as ResultadoJuntada
      if (!novo.pendencias.length) {
        toast.success("Pendências resolvidas.")
        router.push(destinoFinal(novo.destino))
        return
      }
      setResultado({ ...novo, juntadas: [...resultado.juntadas, ...novo.juntadas], nao_se_aplica: [...resultado.nao_se_aplica, ...novo.nao_se_aplica] })
      setPendentes(pendentesDoEnvio(pendentes, novo))
      toast.error("Ainda há pendências.")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  const idx = PASSOS.findIndex((p) => p.id === passo)
  const errosDoPasso = (p: Passo) => erros.filter((e) => e.passo === p && e.indice === undefined)

  return (
    <div className="h-full flex flex-col">
      <nav aria-label="Trilha" className="flex items-center gap-1.5 text-xs text-gray-500 px-6 py-3 border-b border-gray-100 shrink-0">
        <Home className="w-3.5 h-3.5" aria-hidden="true" />
        <ChevronRight className="w-3 h-3" aria-hidden="true" />
        <Link href="/orgao/fase-interna/processos" className="hover:text-[#1351b4]">Processos</Link>
        <ChevronRight className="w-3 h-3" aria-hidden="true" />
        <span className="text-[#1351b4] font-medium">Fase interna feita fora do sistema</span>
      </nav>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 space-y-6">
          <header className="space-y-1">
            <h1 className="text-xl font-bold text-gray-900">Processo com a fase interna já feita</h1>
            <p className="text-sm text-gray-600">
              Os documentos foram feitos fora do Portal DCP? Informe os dados e os itens e envie os PDFs — cada um vira uma peça dos autos,
              com número, data e quem assinou.{" "}
              <Link href="/orgao/fase-interna/processos/novo?modo=guiado" className="text-[#1351b4] hover:underline">Prefiro fazer aqui (guiado)</Link>
            </p>
          </header>

          {resultado ? (
            <ResultadoDaJuntada resultado={resultado} onTentarDeNovo={tentarDeNovo} tentando={enviando} />
          ) : (
            <>
              <ol className="grid grid-cols-3 gap-2" aria-label="Passos">
                {PASSOS.map((p, i) => {
                  const atual = p.id === passo
                  const feito = i < idx
                  const comErro = erros.some((e) => e.passo === p.id)
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => irPara(p.id)}
                        aria-current={atual ? "step" : undefined}
                        className={`w-full text-left rounded-lg border px-3 py-2 transition-colors ${
                          atual ? "border-[#1351b4] bg-[#ecf3fc]" : comErro ? "border-red-300 bg-red-50" : "border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span className="flex items-center gap-2">
                          <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${feito ? "bg-green-700 text-white" : atual ? "bg-[#1351b4] text-white" : "bg-gray-100 text-gray-600"}`}>
                            {feito ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : i + 1}
                          </span>
                          <span className="text-sm font-semibold text-gray-900">{p.titulo}</span>
                        </span>
                        <span className="block text-[11px] text-gray-600 mt-0.5 pl-8">{p.texto}</span>
                      </button>
                    </li>
                  )
                })}
              </ol>

              {errosDoPasso(passo).length > 0 && (
                <ul className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 space-y-1" role="alert">
                  {errosDoPasso(passo).map((e, i) => <li key={i}>{e.mensagem}</li>)}
                </ul>
              )}

              {passo === "DADOS" && (
                <section className="space-y-5 max-w-3xl" aria-label="Dados do processo">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Modalidade *</Label>
                      <Select value={dados.modalidade} onValueChange={trocarModalidade}>
                        <SelectTrigger aria-label="Modalidade"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                        <SelectContent>
                          {MODALIDADES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Natureza do objeto *</Label>
                      <Select value={dados.tipo_contratacao} onValueChange={(v) => set({ tipo_contratacao: v, ...(dados.fundamento_legal.startsWith("ART75_I") ? { fundamento_legal: "" } : {}) })}>
                        <SelectTrigger aria-label="Natureza do objeto"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                        <SelectContent>
                          {TIPOS_CONTRATACAO.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Fundamento legal *</Label>
                      <Select value={dados.fundamento_legal || fundamentoPadrao || ""} onValueChange={(v) => set({ fundamento_legal: v })} disabled={fundamentos.length <= 1}>
                        <SelectTrigger aria-label="Fundamento legal"><SelectValue placeholder={dados.modalidade ? "Selecione o fundamento legal" : "Escolha a modalidade primeiro"} /></SelectTrigger>
                        <SelectContent>
                          {fundamentos.map((f) => <SelectItem key={f.codigo} value={f.codigo}>{f.referencia} — {f.descricao}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-gray-600">O mesmo das peças feitas fora: vai para o PNCP (amparo legal), o aviso e a conferência de consistência.</p>
                    </div>
                    {licitacaoFormal && (
                      <div className="space-y-1">
                        <Label>Critério de julgamento *</Label>
                        <Select value={dados.criterio_julgamento} onValueChange={(v) => set({ criterio_julgamento: v })}>
                          <SelectTrigger aria-label="Critério de julgamento"><SelectValue placeholder="Selecione…" /></SelectTrigger>
                          <SelectContent>
                            {CRITERIOS_JULGAMENTO.filter((c) => criterios.includes(c.value)).map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {COM_MODO_DISPUTA.includes(dados.modalidade) && (
                      <div className="space-y-1">
                        <Label>Modo de disputa</Label>
                        <Select value={dados.modo_disputa || "ABERTO"} onValueChange={(v) => set({ modo_disputa: v })}>
                          <SelectTrigger aria-label="Modo de disputa"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {MODOS_DISPUTA.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>

                  {MODALIDADES_ESPECIAIS_WIZARD.includes(ROTULO_ESPECIAL[dados.modalidade] ?? "") && (
                    <CamposModalidadeEspecial
                      modalidade={ROTULO_ESPECIAL[dados.modalidade]}
                      valor={dados.especiais ?? {}}
                      onChange={(v) => set({ especiais: v })}
                    />
                  )}

                  <div className="space-y-1">
                    <Label htmlFor="ext-objeto">Objeto *</Label>
                    <Textarea id="ext-objeto" rows={3} value={dados.objeto} onChange={(e) => set({ objeto: e.target.value })} placeholder="O mesmo objeto das peças (DFD, TR, aviso)…" />
                  </div>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="ext-pa">Nº do processo administrativo *</Label>
                      <Input id="ext-pa" value={dados.numero_processo} onChange={(e) => set({ numero_processo: e.target.value })} placeholder="Ex.: PA 139/2025" />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ext-num">{direta ? "Nº da dispensa / contratação direta" : "Nº da licitação / edital"}</Label>
                      <Input id="ext-num" value={dados.numero_edital} onChange={(e) => set({ numero_edital: e.target.value })} placeholder={direta ? "Ex.: Dispensa 029/2025" : "Ex.: Pregão 012/2025"} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ext-area">Área demandante</Label>
                      <Input id="ext-area" value={dados.area_demandante} onChange={(e) => set({ area_demandante: e.target.value })} placeholder="Ex.: Diretoria de Comunicação" />
                    </div>
                  </div>

                  {dados.modalidade === "DISPENSA_ELETRONICA" && disputa && (
                    <fieldset className="rounded-lg border p-4 space-y-2">
                      <legend className="text-sm font-semibold text-gray-900 px-1">Disputa da dispensa</legend>
                      {disputa.opcoes.map((o) => (
                        <label key={String(o.com_lances)} className="flex gap-2 items-start text-sm cursor-pointer">
                          <input type="radio" name="disputa" className="mt-1" checked={dados.dispensa_com_lances === o.com_lances} onChange={() => set({ dispensa_com_lances: o.com_lances })} />
                          <span><b>{o.rotulo}</b><span className="block text-xs text-gray-600">{o.explicacao}</span></span>
                        </label>
                      ))}
                      <p className="text-xs text-gray-600">Padrão sugerido pelo órgão: {disputa.padrao_do_orgao ? "com" : "sem"} lances. Pode mudar até a publicação.</p>
                    </fieldset>
                  )}

                  <div className="rounded-lg border p-4 space-y-2">
                    <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                      <input type="checkbox" checked={dados.sigiloso} onChange={(e) => set({ sigiloso: e.target.checked })} />
                      Orçamento sigiloso (art. 24)
                    </label>
                    {dados.sigiloso && (
                      <Textarea rows={2} aria-label="Justificativa do sigilo" value={dados.justificativa_sigilo} onChange={(e) => set({ justificativa_sigilo: e.target.value })}
                        placeholder="Justificativa do sigilo (mínimo 20 caracteres) — a mesma que consta nos autos" />
                    )}
                  </div>

                  {errosDados.length > 0 && <p className="text-xs text-gray-600">Para seguir: {errosDados.join(" ")}</p>}
                  <div className="flex justify-end">
                    <Button onClick={() => irPara("ITENS")} disabled={errosDados.length > 0} className="bg-[#1351b4] hover:bg-[#0c326f]">
                      Itens <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
                    </Button>
                  </div>
                </section>
              )}

              {passo === "ITENS" && (
                <section className="space-y-4" aria-label="Itens">
                  <p className="text-sm text-gray-600">
                    Descreva cada item com <b>unidade</b>, quantidade e o <b>valor unitário</b> da pesquisa de preços feita fora (o mapa vai em Documentos). O PNCP exige o valor por item.
                  </p>
                  <ItensTab itens={itens} onChange={setItens} modoVinculacaoPca="POR_ITEM" />
                  <div className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${errosItens.length ? "bg-[#f6f9fd] border-[#dbe8fb] text-[#1351b4]" : "bg-green-50 border-green-200 text-green-800"}`}>
                    {errosItens.length ? <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" /> : <Check className="w-4 h-4 shrink-0" aria-hidden="true" />}
                    <span>
                      {prontos.length} item(ns) · total estimado {brl(valorDosItens(prontos))}
                      {errosItens.length > 0 && <> — {errosItens.join(" ")}</>}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <Button variant="ghost" onClick={() => irPara("DADOS")}><ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" /> Dados</Button>
                    <Button onClick={() => irPara("DOCUMENTOS")} disabled={errosItens.length > 0} className="bg-[#1351b4] hover:bg-[#0c326f]">
                      Documentos <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
                    </Button>
                  </div>
                </section>
              )}

              {passo === "DOCUMENTOS" && (
                <section className="space-y-4" aria-label="Documentos">
                  <DocumentosExternos
                    modalidade={dados.modalidade}
                    valor={docs}
                    onChange={(v) => { setDocs(v); setErros((e) => e.filter((x) => x.passo !== "DOCUMENTOS")) }}
                    errosServidor={erros}
                    onQuadro={(q) => setOpcoesPecas(q?.opcoes ?? [])}
                  />
                  {errosDocs.length > 0 && docs.arquivos.length > 0 && (
                    <ul className="text-xs text-gray-700 space-y-0.5">
                      {errosDocs.map((e, i) => <li key={i}>• {e}</li>)}
                    </ul>
                  )}
                  <div className="flex justify-between items-center gap-3 flex-wrap">
                    <Button variant="ghost" onClick={() => irPara("ITENS")}><ArrowLeft className="w-4 h-4 mr-1.5" aria-hidden="true" /> Itens</Button>
                    <Button onClick={criar} disabled={enviando || !docs.arquivos.length || errosDocs.length > 0 || errosDados.length > 0 || errosItens.length > 0} className="bg-[#1351b4] hover:bg-[#0c326f]">
                      {enviando ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Criando e juntando…</> : "Criar o processo e juntar os documentos"}
                    </Button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** O que ficou pendente de um envio (arquivos pelo índice, "não se aplica" e portaria pelo tipo). */
function pendentesDoEnvio(enviado: EstadoDocumentosExternos, r: ResultadoJuntada): EstadoDocumentosExternos {
  const indices = new Set(r.pendencias.map((p) => p.indice).filter((i): i is number => i !== null))
  const tipos = new Set(r.pendencias.map((p) => p.tipo))
  return {
    arquivos: enviado.arquivos.filter((_, i) => indices.has(i)),
    naoSeAplica: Object.fromEntries(Object.entries(enviado.naoSeAplica).filter(([t]) => tipos.has(t))),
    usarPortaria: enviado.usarPortaria && tipos.has("DP") && !r.pendencias.some((p) => p.tipo === "DP" && p.indice !== null),
  }
}

export default function Pagina() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-gray-600"><Loader2 className="inline w-4 h-4 mr-2 animate-spin" />Carregando…</div>}>
      <FaseInternaFeitaFora />
    </Suspense>
  )
}
