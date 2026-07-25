"use client"

/**
 * COCKPIT DO PROCESSO (Degrau 1) — o fio condutor da contratação.
 * Linha do tempo única: Planejamento (PCA/Demanda) → Fase interna (documentos)
 * → Seleção (interna ou EXTERNA) → Contratos → Execução.
 * Fonte: GET /api/licitacoes/:id/processo-completo
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  ArrowLeft, ClipboardList, FileText, Gavel, FileSignature, Activity,
  CheckCircle2, Circle, ExternalLink, Loader2, AlertTriangle,
} from "lucide-react"

interface ProcessoCompleto {
  licitacao: {
    id: string
    numero_processo: string
    numero_edital?: string
    objeto: string
    modalidade: string
    fase: string
    srp: boolean
    valor_total_estimado?: number
    valor_homologado?: number
    data_homologacao?: string
    selecao_externa: boolean
    plataforma_externa?: string | null
    numero_processo_externo?: string | null
    url_externa?: string | null
    tipo_contratacao?: string
    data_fim_acolhimento?: string | null
    data_abertura_sessao?: string | null
  }
  item_pca?: { id: string; numero_item: number; descricao_objeto: string; valor_estimado: number } | null
  demanda?: { id: string; titulo?: string; status: string } | null
  itens: Array<{
    id: string
    numero_item: number
    descricao: string
    quantidade: number
    unidade_medida?: string
    valor_unitario_estimado?: number
    valor_unitario_homologado?: number
    valor_total_homologado?: number
    fornecedor_vencedor_id?: string
    fornecedor_vencedor_nome?: string
    status: string
  }>
  documentos: Array<{ id: string; tipo: string; titulo?: string; status?: string }>
  contratos: Array<{
    id: string; numero_contrato: string; fornecedor_razao_social?: string
    valor_global?: number; status?: string
  }>
  atas: Array<{ id: string; numero_ata: string; fornecedor_razao_social?: string; valor_total?: number; status?: string }>
  propostas: Array<{ id: string; status: string; valor_total_proposta?: number | null; data_envio?: string; razao_social: string; sigilo?: boolean }>
  propostas_em_sigilo?: boolean
  checklist: {
    vinculado_pca: boolean
    possui_itens: boolean
    possui_documentos: boolean
    fase_interna_concluida: boolean
    resultado_registrado: boolean
    homologado: boolean
    contrato_gerado: boolean
  }
}

interface FornecedorOpt { id: string; razao_social: string; cpf_cnpj?: string; cnpj?: string }

const fmtMoeda = (v?: number | string | null) =>
  Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

export default function CockpitProcessoPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string

  const [dados, setDados] = useState<ProcessoCompleto | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Modal de resultado externo
  const [modalResultado, setModalResultado] = useState(false)
  const [fornecedores, setFornecedores] = useState<FornecedorOpt[]>([])
  const [plataforma, setPlataforma] = useState("")
  const [numeroExterno, setNumeroExterno] = useState("")
  const [urlExterna, setUrlExterna] = useState("")
  const [linhas, setLinhas] = useState<Record<string, { fornecedor_id: string; valor_unitario: string }>>({})
  const [salvando, setSalvando] = useState(false)
  const [homologando, setHomologando] = useState(false)
  const [julgando, setJulgando] = useState(false)
  const [limiteDispensa, setLimiteDispensa] = useState<{ chave: string; valor: number } | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/processo-completo`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as ProcessoCompleto
      setDados(j)
      // Pré-carrega o form do resultado com o que já está registrado
      const iniciais: Record<string, { fornecedor_id: string; valor_unitario: string }> = {}
      for (const it of j.itens) {
        iniciais[it.id] = {
          fornecedor_id: it.fornecedor_vencedor_id || "",
          valor_unitario: it.valor_unitario_homologado != null ? String(it.valor_unitario_homologado) : "",
        }
      }
      setLinhas(iniciais)
      setPlataforma(j.licitacao.plataforma_externa || "")
      setNumeroExterno(j.licitacao.numero_processo_externo || "")
      setUrlExterna(j.licitacao.url_externa || "")

      // Limite legal do art. 75 (aviso de conformidade da dispensa)
      if (j.licitacao.modalidade === "DISPENSA_ELETRONICA") {
        try {
          const tc = (j.licitacao.tipo_contratacao || "").toUpperCase()
          const chave = tc.includes("OBRA") || tc.includes("ENGENHARIA")
            ? "DISPENSA_OBRAS_ENGENHARIA"
            : "DISPENSA_COMPRAS_SERVICOS"
          const orgao = JSON.parse(localStorage.getItem("orgao") || "{}")
          const rl = await authFetch(`${API_URL}/api/parametros-licitacao/limites/vigente?chave=${chave}${orgao?.id ? `&orgaoId=${orgao.id}` : ""}`)
          if (rl.ok) {
            const lim = await rl.json()
            if (lim?.valor != null) setLimiteDispensa({ chave, valor: Number(lim.valor) })
          }
        } catch { /* aviso de limite é opcional */ }
      }
    } catch (e: any) {
      setErro(e.message || "Erro ao carregar o processo")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { if (id) carregar() }, [id, carregar])

  const abrirModalResultado = async () => {
    setModalResultado(true)
    if (fornecedores.length === 0) {
      try {
        const res = await authFetch(`${API_URL}/api/fornecedores?status=APROVADO`)
        if (res.ok) {
          const lista = await res.json()
          setFornecedores(Array.isArray(lista) ? lista : lista?.data || [])
        }
      } catch { /* dropdown fica vazio; usuário ainda pode cadastrar fornecedor */ }
    }
  }

  const salvarResultado = async () => {
    if (!dados) return
    const itensPreenchidos = dados.itens
      .map((it) => ({ item_id: it.id, ...linhas[it.id] }))
      .filter((l) => l.fornecedor_id && Number(String(l.valor_unitario).replace(",", ".")) > 0)
      .map((l) => ({
        item_id: l.item_id,
        fornecedor_id: l.fornecedor_id,
        valor_unitario: Number(String(l.valor_unitario).replace(",", ".")),
      }))
    if (itensPreenchidos.length === 0) {
      alert("Preencha vencedor e valor de pelo menos um item.")
      return
    }
    setSalvando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/resultado-externo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plataforma_externa: plataforma || undefined,
          numero_processo_externo: numeroExterno || undefined,
          url_externa: urlExterna || undefined,
          itens: itensPreenchidos,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.message || `HTTP ${res.status}`)
      }
      setModalResultado(false)
      await carregar()
    } catch (e: any) {
      alert(`Erro ao registrar resultado: ${e.message}`)
    } finally {
      setSalvando(false)
    }
  }

  const homologar = async () => {
    if (!dados) return
    const total = dados.itens.reduce((s, i) => s + Number(i.valor_total_homologado || 0), 0)
    if (!confirm(`Homologar o processo por ${fmtMoeda(total)}?\n\nA homologação gera o(s) contrato(s) automaticamente, um por fornecedor vencedor.`)) return
    setHomologando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/homologar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ valor_homologado: total }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.message || `HTTP ${res.status}`)
      }
      await carregar()
    } catch (e: any) {
      alert(`Erro ao homologar: ${e.message}`)
    } finally {
      setHomologando(false)
    }
  }

  const julgarDispensa = async () => {
    if (!dados) return
    if (!confirm("Julgar as propostas por MENOR PREÇO unitário por item?\n\nO vencedor de cada item será adjudicado automaticamente. Você poderá revisar antes de homologar.")) return
    setJulgando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/julgar-dispensa`, { method: "POST" })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      const semProposta = j?.itens_sem_proposta?.length
        ? `\n\nItens SEM proposta (ficaram de fora): ${j.itens_sem_proposta.join(", ")}`
        : ""
      alert(`Julgamento concluído: ${j?.adjudicados?.length || 0} item(ns) adjudicado(s).${semProposta}`)
      await carregar()
    } catch (e: any) {
      alert(`Erro no julgamento: ${e.message}`)
    } finally {
      setJulgando(false)
    }
  }

  const desclassificarProposta = async (propostaId: string, fornecedor: string) => {
    const motivo = prompt(`Desclassificar a proposta de ${fornecedor}?\n\nInforme o MOTIVO (obrigatório, ficará registrado):`)
    if (!motivo || !motivo.trim()) return
    try {
      const fd = new FormData()
      fd.append("motivo", motivo.trim())
      const res = await authFetch(`${API_URL}/api/propostas/${propostaId}/desclassificar`, {
        method: "PUT",
        body: fd,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        throw new Error(err?.message || `HTTP ${res.status}`)
      }
      alert("Proposta desclassificada. Se já houve julgamento, use 'Rejulgar' para recalcular os vencedores.")
      await carregar()
    } catch (e: any) {
      alert(`Erro ao desclassificar: ${e.message}`)
    }
  }

  const etapas = useMemo(() => {
    if (!dados) return []
    const c = dados.checklist
    return [
      {
        icone: ClipboardList,
        titulo: "Planejamento",
        feito: c.vinculado_pca && c.possui_itens,
        resumo: dados.item_pca
          ? `Item ${dados.item_pca.numero_item} do PCA — ${dados.item_pca.descricao_objeto}`
          : "Sem vínculo com o PCA (verifique a justificativa do Art. 12 §1º)",
        extra: `${dados.itens.length} item(ns) na contratação`,
        link: { href: "/orgao/pca", texto: "Abrir PCA" },
      },
      {
        icone: FileText,
        titulo: "Fase interna (documentos)",
        feito: c.possui_documentos && c.fase_interna_concluida,
        resumo: dados.documentos.length > 0
          ? `${dados.documentos.length} documento(s) no processo eletrônico`
          : "Nenhum documento anexado ainda (DFD, ETP, TR, pareceres…)",
        extra: c.fase_interna_concluida ? "Fase interna concluída" : `Fase atual: ${dados.licitacao.fase}`,
        link: { href: `/orgao/fase-interna/processos/${id}`, texto: "Abrir processo eletrônico" },
      },
      {
        icone: Gavel,
        titulo: dados.licitacao.selecao_externa
          ? "Seleção (externa)"
          : dados.licitacao.modalidade === "DISPENSA_ELETRONICA"
            ? "Seleção (dispensa eletrônica)"
            : "Seleção do fornecedor",
        feito: c.resultado_registrado,
        resumo: dados.licitacao.selecao_externa
          ? `Disputa realizada em ${dados.licitacao.plataforma_externa || "plataforma externa"}${dados.licitacao.numero_processo_externo ? ` — nº ${dados.licitacao.numero_processo_externo}` : ""}`
          : dados.licitacao.modalidade === "DISPENSA_ELETRONICA"
            ? `Art. 75 §3º — cotação eletrônica pelo portal do fornecedor${(dados.licitacao.data_fim_acolhimento || dados.licitacao.data_abertura_sessao) ? ` · propostas até ${new Date((dados.licitacao.data_fim_acolhimento || dados.licitacao.data_abertura_sessao)!).toLocaleString("pt-BR")}` : ""}`
            : `Modalidade ${dados.licitacao.modalidade} conduzida no sistema — fase ${dados.licitacao.fase}`,
        extra: c.resultado_registrado
          ? `${dados.itens.filter(i => i.fornecedor_vencedor_id).length} item(ns) com vencedor definido`
          : "Resultado ainda não registrado",
        link: dados.licitacao.selecao_externa
          ? (dados.licitacao.url_externa ? { href: dados.licitacao.url_externa, texto: "Ver na plataforma", externo: true } : undefined)
          : { href: `/orgao/licitacoes/${id}`, texto: "Abrir licitação" },
      },
      {
        icone: FileSignature,
        titulo: "Homologação e contratos",
        feito: c.homologado && c.contrato_gerado,
        resumo: c.homologado
          ? `Homologado em ${dados.licitacao.data_homologacao ? new Date(dados.licitacao.data_homologacao).toLocaleDateString("pt-BR") : "—"} — ${fmtMoeda(dados.licitacao.valor_homologado)}`
          : "Aguardando homologação da autoridade competente",
        extra: dados.contratos.length > 0
          ? `${dados.contratos.length} contrato(s) gerado(s)`
          : "Contrato é gerado automaticamente na homologação",
      },
      {
        icone: Activity,
        titulo: "Execução",
        feito: dados.contratos.length > 0,
        resumo: dados.contratos.length > 0
          ? "Acompanhe requisições, ordens e medições em cada contrato"
          : "Disponível após a geração do contrato",
      },
    ]
  }, [dados, id])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }
  if (erro || !dados) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto text-amber-500 mb-3" />
        <p className="text-gray-600">{erro || "Processo não encontrado"}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>Voltar</Button>
      </div>
    )
  }

  const { licitacao, checklist } = dados
  const podeRegistrarResultado = !checklist.homologado
  const podeHomologar = checklist.resultado_registrado && !checklist.homologado

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">Processo {licitacao.numero_processo}</h1>
              <Badge variant="outline">{licitacao.modalidade}</Badge>
              {licitacao.srp && <Badge variant="outline">SRP</Badge>}
              {licitacao.selecao_externa && (
                <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100">Seleção externa</Badge>
              )}
              <Badge className={checklist.homologado ? "bg-green-100 text-green-800 hover:bg-green-100" : "bg-blue-100 text-blue-800 hover:bg-blue-100"}>
                {licitacao.fase}
              </Badge>
            </div>
            <p className="text-gray-500 mt-1 max-w-3xl">{licitacao.objeto}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {podeRegistrarResultado && (
            <Button variant="outline" onClick={abrirModalResultado}>
              <Gavel className="w-4 h-4 mr-2" />
              {checklist.resultado_registrado ? "Editar resultado externo" : "Registrar resultado externo"}
            </Button>
          )}
          {podeHomologar && (
            <Button onClick={homologar} disabled={homologando}>
              {homologando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Homologar e gerar contrato
            </Button>
          )}
        </div>
      </div>

      {/* Linha do tempo */}
      <Card>
        <CardHeader><CardTitle className="text-base">Linha do tempo da contratação</CardTitle></CardHeader>
        <CardContent>
          <ol className="relative">
            {etapas.map((et, idx) => {
              const Icone = et.icone
              return (
                <li key={et.titulo} className="flex gap-4 pb-6 last:pb-0">
                  <div className="flex flex-col items-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 shrink-0 ${et.feito ? "bg-green-50 border-green-500 text-green-600" : "bg-gray-50 border-gray-300 text-gray-400"}`}>
                      <Icone className="w-4 h-4" />
                    </div>
                    {idx < etapas.length - 1 && (
                      <div className={`w-0.5 flex-1 mt-1 ${et.feito ? "bg-green-300" : "bg-gray-200"}`} />
                    )}
                  </div>
                  <div className="pt-1 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{et.titulo}</span>
                      {et.feito
                        ? <CheckCircle2 className="w-4 h-4 text-green-600" />
                        : <Circle className="w-4 h-4 text-gray-300" />}
                      {et.link && (
                        et.link.externo ? (
                          <a href={et.link.href} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1">
                            {et.link.texto} <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <Link href={et.link.href} className="text-sm text-blue-600 hover:underline">{et.link.texto}</Link>
                        )
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mt-0.5">{et.resumo}</p>
                    <p className="text-xs text-gray-400">{et.extra}</p>

                    {/* Painel da DISPENSA ELETRÔNICA: prazo, propostas e julgamento */}
                    {et.titulo.startsWith("Seleção") &&
                      dados.licitacao.modalidade === "DISPENSA_ELETRONICA" &&
                      !dados.licitacao.selecao_externa &&
                      !checklist.homologado && (() => {
                        const prazoFim = dados.licitacao.data_fim_acolhimento || dados.licitacao.data_abertura_sessao
                        const aberto = prazoFim ? new Date() < new Date(prazoFim) : false
                        const totalEstimado = Number(dados.licitacao.valor_total_estimado || 0)
                        const excedeLimite = limiteDispensa != null && totalEstimado > limiteDispensa.valor
                        return (
                          <div className="mt-3 border rounded-md p-3 bg-slate-50 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="text-sm">
                                <span className={`font-medium ${aberto ? "text-blue-700" : "text-gray-700"}`}>
                                  {aberto ? "⏳ Recebendo propostas" : "Prazo de propostas encerrado"}
                                </span>
                                <span className="text-gray-500"> · {dados.propostas.length} proposta(s) recebida(s)</span>
                                {dados.propostas_em_sigilo && (
                                  <span className="ml-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">🔒 valores sigilosos até o fim do prazo</span>
                                )}
                              </div>
                              <Button size="sm" onClick={julgarDispensa} disabled={julgando || aberto || dados.propostas.length === 0}
                                title={aberto ? "Disponível após o fim do prazo de propostas" : dados.propostas.length === 0 ? "Sem propostas recebidas" : ""}>
                                {julgando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Gavel className="w-4 h-4 mr-1" />}
                                {checklist.resultado_registrado ? "Rejulgar (menor preço)" : "Julgar propostas (menor preço)"}
                              </Button>
                            </div>
                            {excedeLimite && (
                              <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
                                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                <span>
                                  Valor estimado ({fmtMoeda(totalEstimado)}) <b>excede o limite vigente de dispensa</b> ({fmtMoeda(limiteDispensa!.valor)} — {limiteDispensa!.chave === "DISPENSA_OBRAS_ENGENHARIA" ? "art. 75, I" : "art. 75, II"}). Verifique o enquadramento legal antes de prosseguir.
                                </span>
                              </div>
                            )}
                            {dados.propostas.length > 0 && (
                              <div className="border rounded bg-white overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                      <th className="text-left px-3 py-1.5">Fornecedor</th>
                                      <th className="text-right px-3 py-1.5">Valor global</th>
                                      <th className="text-left px-3 py-1.5">Enviada em</th>
                                      <th className="text-left px-3 py-1.5">Situação</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {dados.propostas.map((p) => (
                                      <tr key={p.id} className="border-t">
                                        <td className="px-3 py-1.5">{p.razao_social}</td>
                                        <td className="px-3 py-1.5 text-right whitespace-nowrap">{p.valor_total_proposta != null ? fmtMoeda(p.valor_total_proposta) : "—"}</td>
                                        <td className="px-3 py-1.5 whitespace-nowrap">{p.data_envio ? new Date(p.data_envio).toLocaleString("pt-BR") : "—"}</td>
                                        <td className="px-3 py-1.5">
                                          <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={p.status === "VENCEDORA" ? "border-green-400 text-green-700" : p.status === "DESCLASSIFICADA" ? "border-red-300 text-red-600" : ""}>{p.status}</Badge>
                                            {!aberto && p.id && p.status !== "DESCLASSIFICADA" && p.status !== "CANCELADA" && (
                                              <button
                                                type="button"
                                                onClick={() => desclassificarProposta(p.id, p.razao_social)}
                                                className="text-[11px] text-red-600 hover:underline"
                                                title="Desclassificar com motivo registrado"
                                              >
                                                desclassificar
                                              </button>
                                            )}
                                          </div>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            <p className="text-[11px] text-gray-400">
                              O fornecedor envia a proposta pelo Portal do Fornecedor (Licitações → esta dispensa). O julgamento adjudica o menor preço unitário por item; a homologação gera o contrato automaticamente.
                            </p>
                          </div>
                        )
                      })()}

                    {/* Conteúdo específico por etapa */}
                    {et.titulo.startsWith("Seleção") && dados.itens.length > 0 && (
                      <div className="mt-3 border rounded-md overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 text-gray-500 text-xs">
                            <tr>
                              <th className="text-left px-3 py-2">Item</th>
                              <th className="text-left px-3 py-2">Vencedor</th>
                              <th className="text-right px-3 py-2">Vl. unit.</th>
                              <th className="text-right px-3 py-2">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dados.itens.map((it) => (
                              <tr key={it.id} className="border-t">
                                <td className="px-3 py-2">{it.numero_item} — {it.descricao?.slice(0, 60)}</td>
                                <td className="px-3 py-2">{it.fornecedor_vencedor_nome || <span className="text-gray-400">—</span>}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap">{it.valor_unitario_homologado != null ? fmtMoeda(it.valor_unitario_homologado) : "—"}</td>
                                <td className="px-3 py-2 text-right whitespace-nowrap font-medium">{it.valor_total_homologado != null ? fmtMoeda(it.valor_total_homologado) : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {et.titulo === "Homologação e contratos" && dados.contratos.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {dados.contratos.map((ct) => (
                          <Link key={ct.id} href={`/orgao/contratos/${ct.id}`} className="flex items-center justify-between border rounded-md px-3 py-2 hover:bg-gray-50">
                            <span className="text-sm font-medium">Contrato {ct.numero_contrato} — {ct.fornecedor_razao_social}</span>
                            <span className="text-sm text-gray-500">{fmtMoeda(ct.valor_global)} · {ct.status}</span>
                          </Link>
                        ))}
                        {dados.atas.map((ata) => (
                          <div key={ata.id} className="flex items-center justify-between border rounded-md px-3 py-2 bg-amber-50/50">
                            <span className="text-sm font-medium">Ata {ata.numero_ata} — {ata.fornecedor_razao_social}</span>
                            <span className="text-sm text-gray-500">{fmtMoeda(ata.valor_total)} · {ata.status}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {et.titulo === "Execução" && dados.contratos.length > 0 && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {dados.contratos.map((ct) => (
                          <Link key={ct.id} href={`/orgao/contratos/${ct.id}`}>
                            <Button variant="outline" size="sm">Medições do {ct.numero_contrato}</Button>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      {/* Modal: registrar resultado externo */}
      <Dialog open={modalResultado} onOpenChange={setModalResultado}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar resultado da seleção externa</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-500 -mt-2">
            A disputa aconteceu fora do sistema? Informe onde e o vencedor de cada item.
            Ao homologar, o contrato é gerado automaticamente e cai na execução (medições).
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-500">Plataforma</label>
              <Input placeholder="ex.: BLL, BNC, Compras.gov" value={plataforma} onChange={(e) => setPlataforma(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Nº na plataforma</label>
              <Input placeholder="ex.: PE 012/2026" value={numeroExterno} onChange={(e) => setNumeroExterno(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-gray-500">Link (opcional)</label>
              <Input placeholder="https://…" value={urlExterna} onChange={(e) => setUrlExterna(e.target.value)} />
            </div>
          </div>

          <div className="border rounded-md overflow-x-auto mt-2">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2">Item</th>
                  <th className="text-left px-3 py-2 w-[280px]">Fornecedor vencedor</th>
                  <th className="text-right px-3 py-2 w-[140px]">Vl. unitário (R$)</th>
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((it) => (
                  <tr key={it.id} className="border-t align-top">
                    <td className="px-3 py-2">
                      <div className="font-medium">{it.numero_item} — {it.descricao?.slice(0, 70)}</div>
                      <div className="text-xs text-gray-400">
                        Qtd: {Number(it.quantidade).toLocaleString("pt-BR")} {it.unidade_medida || ""}
                        {it.valor_unitario_estimado ? ` · Estimado: ${fmtMoeda(it.valor_unitario_estimado)}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="w-full border rounded-md h-9 px-2 text-sm bg-white"
                        value={linhas[it.id]?.fornecedor_id || ""}
                        onChange={(e) => setLinhas((p) => ({ ...p, [it.id]: { ...p[it.id], fornecedor_id: e.target.value } }))}
                      >
                        <option value="">— selecionar —</option>
                        {fornecedores.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.razao_social} {(f.cpf_cnpj || f.cnpj) ? `(${f.cpf_cnpj || f.cnpj})` : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        value={linhas[it.id]?.valor_unitario || ""}
                        onChange={(e) => setLinhas((p) => ({ ...p, [it.id]: { ...p[it.id], valor_unitario: e.target.value } }))}
                        className="text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-400">
            Fornecedor não aparece na lista? <Link href="/orgao/fornecedores" className="text-blue-600 hover:underline">Cadastre-o primeiro</Link> (dá para consultar pelo CNPJ) e reabra este formulário.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalResultado(false)}>Cancelar</Button>
            <Button onClick={salvarResultado} disabled={salvando}>
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar resultado
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
