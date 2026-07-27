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
    dispensa_lances_inicio?: string | null
    dispensa_lances_fim?: string | null
    link_pncp?: string | null
    preparacao_automatica?: {
      status: 'EXECUTANDO' | 'CONCLUIDA' | 'ERRO'
      etapa?: string
      log?: string[]
      erro?: string
      concluida_em?: string
    } | null
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
    data_assinatura?: string | null
    arquivo_contrato?: string | null
    documento_assinatura_id?: string | null
    assinatura_status?: string | null
    arquivo_assinado_url?: string | null
    assinados?: number | string | null
    total_signatarios?: number | string | null
    signatarios_resumo?: string | null
  }>
  atas: Array<{ id: string; numero_ata: string; fornecedor_razao_social?: string; valor_total?: number; status?: string }>
  propostas: Array<{ id: string; status: string; valor_total_proposta?: number | null; data_envio?: string; razao_social: string; sigilo?: boolean }>
  propostas_em_sigilo?: boolean
  pncp?: Array<{ tipo: string; status: string; numero_controle_pncp?: string | null; erro_mensagem?: string | null; tentativas?: number; updated_at?: string }>
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

  // === Autos do processo: download do PDF compilado (autenticado) ===
  const [baixandoProcesso, setBaixandoProcesso] = useState(false)
  const baixarProcessoPdf = async () => {
    setBaixandoProcesso(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/processo-pdf`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `processo-${dados?.licitacao.numero_processo?.replace(/\W+/g, "-") || id}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch (e: any) {
      alert(`Não foi possível gerar os autos agora: ${e.message}`)
    } finally {
      setBaixandoProcesso(false)
    }
  }

  // === Copiloto (preparação automática): poll silencioso enquanto executa ===
  const [disparandoCopiloto, setDisparandoCopiloto] = useState(false)

  useEffect(() => {
    if (dados?.licitacao.preparacao_automatica?.status !== "EXECUTANDO") return
    const t = setInterval(async () => {
      try {
        const res = await authFetch(`${API_URL}/api/licitacoes/${id}/processo-completo`)
        if (res.ok) setDados((await res.json()) as ProcessoCompleto)
      } catch { /* mantém o estado atual */ }
    }, 5000)
    return () => clearInterval(t)
  }, [dados?.licitacao.preparacao_automatica?.status, id])

  const dispararCopiloto = async () => {
    if (!confirm(
      "🤖 Preparar o processo automaticamente?\n\n" +
      "O copiloto pesquisa preços em fontes reais (PNCP/Painel de Preços) e redige os rascunhos do ETP, TR e autorização. " +
      "Tudo fica marcado como SUGERIDO para você revisar — nada é publicado sem a sua validação.",
    )) return
    setDisparandoCopiloto(true)
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/preparar-automatico`, { method: "POST" })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      await carregar()
    } catch (e: any) {
      alert(`Erro ao iniciar o copiloto: ${e.message}`)
    } finally {
      setDisparandoCopiloto(false)
    }
  }

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

  // === Instrução do processo (Art. 72 — contratação direta) ===
  const [instrucao, setInstrucao] = useState<{
    contratacao_direta: boolean
    itens: Array<{ tipo: string; titulo: string; obrigatorio: boolean; fundamento: string; status: string; justificativa?: string }>
    pode_divulgar: boolean
    pendentes: string[]
  } | null>(null)
  const [naoSeAplicaLoading, setNaoSeAplicaLoading] = useState<string | null>(null)
  const [modalDivulgar, setModalDivulgar] = useState(false)
  const [fimPropostas, setFimPropostas] = useState("")
  const [divulgando, setDivulgando] = useState(false)

  useEffect(() => {
    if (!dados) return
    const m = dados.licitacao.modalidade
    if (m !== "DISPENSA_ELETRONICA" && m !== "INEXIGIBILIDADE") return
    authFetch(`${API_URL}/api/fase-interna/${id}/instrucao`)
      .then(async (r) => { if (r.ok) setInstrucao(await r.json()) })
      .catch(() => { /* card da instrução fica oculto */ })
  }, [dados, id])

  const marcarNaoSeAplica = async (tipo: string, titulo: string) => {
    const j = prompt(`Marcar "${titulo}" como NÃO SE APLICA a esta contratação?\n\nInforme a justificativa (fica registrada nos autos — Art. 72):`)
    if (!j || !j.trim()) return
    setNaoSeAplicaLoading(tipo)
    try {
      let usuario: any = {}
      try { usuario = JSON.parse(localStorage.getItem("usuario") || "{}") } catch { /* segue sem autor */ }
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/instrucao/${tipo}/nao-se-aplica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ justificativa: j.trim(), usuarioId: usuario?.id, usuarioNome: usuario?.nome }),
      })
      const jj = await res.json().catch(() => null)
      if (!res.ok) throw new Error(jj?.message || `HTTP ${res.status}`)
      setInstrucao(jj)
    } catch (e: any) {
      alert(`Erro: ${e.message}`)
    } finally {
      setNaoSeAplicaLoading(null)
    }
  }

  const desfazerNaoSeAplica = async (tipo: string) => {
    setNaoSeAplicaLoading(tipo)
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${id}/instrucao/${tipo}/nao-se-aplica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ desfazer: true }),
      })
      const jj = await res.json().catch(() => null)
      if (!res.ok) throw new Error(jj?.message || `HTTP ${res.status}`)
      setInstrucao(jj)
    } catch (e: any) {
      alert(`Erro: ${e.message}`)
    } finally {
      setNaoSeAplicaLoading(null)
    }
  }

  const addDiasUteis = (d: Date, n: number) => {
    const r = new Date(d)
    let add = 0
    while (add < n) {
      r.setDate(r.getDate() + 1)
      const dow = r.getDay()
      if (dow !== 0 && dow !== 6) add++
    }
    return r
  }

  const abrirModalDivulgar = () => {
    // Sugere o mínimo legal (3 dias úteis, art. 75 §3º) com 1h de folga
    const min = addDiasUteis(new Date(), 3)
    min.setHours(min.getHours() + 1)
    const pad = (x: number) => String(x).padStart(2, "0")
    setFimPropostas(`${min.getFullYear()}-${pad(min.getMonth() + 1)}-${pad(min.getDate())}T${pad(min.getHours())}:${pad(min.getMinutes())}`)
    setModalDivulgar(true)
  }

  const divulgarAviso = async () => {
    if (!dados || !fimPropostas) return
    setDivulgando(true)
    try {
      // Etapa única da contratação direta: conclui a instrução se ainda não concluída
      if (dados.licitacao.fase !== "APROVACAO_INTERNA") {
        const ra = await authFetch(`${API_URL}/api/fase-interna/${id}/avancar`, { method: "PUT" })
        if (!ra.ok) {
          const e = await ra.json().catch(() => null)
          throw new Error(e?.message || `HTTP ${ra.status}`)
        }
      }
      const agora = new Date().toISOString()
      const fim = new Date(fimPropostas).toISOString()
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/publicar-edital`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data_publicacao_edital: agora,
          data_limite_impugnacao: fim,
          data_inicio_acolhimento: agora,
          data_fim_acolhimento: fim,
          data_abertura_sessao: fim,
        }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      setModalDivulgar(false)
      alert("Aviso divulgado!\n\nO prazo de propostas está aberto para os fornecedores e o aviso está sendo publicado automaticamente no PNCP (acompanhe o status no painel da seleção).")
      await carregar()
    } catch (e: any) {
      alert(`Erro ao divulgar: ${e.message}`)
    } finally {
      setDivulgando(false)
    }
  }

  // === Assinatura eletrônica do termo de contrato ===
  const [assinandoContrato, setAssinandoContrato] = useState<string | null>(null)

  const solicitarAssinaturasContrato = async (ct: { id: string; numero_contrato: string; fornecedor_razao_social?: string }) => {
    let usuario: any = {}
    try { usuario = JSON.parse(localStorage.getItem("usuario") || "{}") } catch { /* segue */ }
    const nome = usuario?.nome || prompt("Nome do responsável do órgão que assinará o contrato:")
    if (!nome) return
    if (!confirm(
      `Gerar o TERMO DE CONTRATO ${ct.numero_contrato} em PDF e solicitar as assinaturas eletrônicas?\n\n` +
      `Signatários:\n• ${nome} (órgão — assina pelo Portal de Assinaturas)\n• ${ct.fornecedor_razao_social || "Fornecedor"} (recebe o link por e-mail)\n\n` +
      `Quando todos assinarem, a data de assinatura é registrada e o contrato é publicado automaticamente no PNCP (art. 94 — condição de eficácia).`,
    )) return
    setAssinandoContrato(ct.id)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${ct.id}/solicitar-assinaturas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: { nome, cpf: usuario?.cpf, email: usuario?.email, telefone: usuario?.telefone } }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      alert(j?.ja_existente
        ? "Já existe uma solicitação de assinatura ativa para este contrato — acompanhe o progresso aqui no cockpit."
        : `Termo gerado e assinaturas solicitadas!\n\n${(j?.signatarios || []).map((s: any) => `• ${s.nome}`).join("\n")}\n\nO fornecedor recebe o link por e-mail; você assina pelo Portal de Assinaturas.`)
      await carregar()
    } catch (e: any) {
      alert(`Erro ao solicitar assinaturas: ${e.message}`)
    } finally {
      setAssinandoContrato(null)
    }
  }

  const reenviarNotificacoesAssinatura = async (documentoId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/portal-assinaturas/${documentoId}/reenviar`, { method: "POST" })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      alert(`Notificações reenviadas (${j?.enviados ?? "ok"}).`)
    } catch (e: any) {
      alert(`Erro ao reenviar: ${e.message}`)
    }
  }

  const [painelLances, setPainelLances] = useState<any>(null)
  const [mensagensDispensa, setMensagensDispensa] = useState<any[]>([])
  const [novaMensagemOrgao, setNovaMensagemOrgao] = useState("")

  const carregarMensagensDispensa = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/dispensa/mensagens`)
      if (res.ok) setMensagensDispensa(await res.json())
    } catch { /* mantém */ }
  }, [id])

  // Durante a fase de lances: painel e chat se atualizam sozinhos (sem clique)
  useEffect(() => {
    if (!dados || dados.licitacao.modalidade !== "DISPENSA_ELETRONICA") return
    carregarMensagensDispensa()
    const fim = dados.licitacao.dispensa_lances_fim ? new Date(dados.licitacao.dispensa_lances_fim) : null
    const lancesAberta = fim ? new Date() < fim : false
    if (!lancesAberta) return
    atualizarPainelLances()
    const p1 = setInterval(atualizarPainelLances, 3000)
    const p2 = setInterval(carregarMensagensDispensa, 5000)
    return () => { clearInterval(p1); clearInterval(p2) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dados, carregarMensagensDispensa])

  const enviarMensagemOrgao = async () => {
    const texto = novaMensagemOrgao.trim()
    if (!texto) return
    try {
      let autor = "Órgão"
      try {
        const u = JSON.parse(localStorage.getItem("usuario") || "{}")
        const o = JSON.parse(localStorage.getItem("orgao") || "{}")
        autor = u?.nome || o?.nome || "Órgão"
      } catch { /* usa default */ }
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/dispensa/mensagens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autor_tipo: "ORGAO", autor_nome: autor, mensagem: texto }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      setNovaMensagemOrgao("")
      await carregarMensagensDispensa()
    } catch (e: any) {
      alert(`Mensagem não enviada: ${e.message}`)
    }
  }

  const abrirLances = async () => {
    const min = prompt("Abrir a fase de LANCES da dispensa (opcional — modelo IN SEGES 67/2021).\n\nDuração em MINUTOS (padrão 360 = 6 horas):", "360")
    if (min == null) return
    const pror = prompt(
      "PRORROGAÇÃO AUTOMÁTICA (opcional): lance recebido nos últimos N minutos prorroga a janela por mais N minutos, sucessivamente (modelo do modo de disputa aberto).\n\nMinutos de prorrogação (0 = sem prorrogação, encerramento no horário — padrão IN 67):",
      "2",
    )
    if (pror == null) return
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/dispensa/abrir-lances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ duracao_minutos: Number(min) || 360, prorrogacao_minutos: Number(pror) || 0 }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      alert(`Fase de lances aberta até ${new Date(j.dispensa_lances_fim).toLocaleString("pt-BR")}.${j.prorrogacao_minutos ? ` Prorrogação automática de ${j.prorrogacao_minutos} min ativada (regra registrada no chat da sessão).` : " Sem prorrogação automática."} Os fornecedores com proposta válida podem reduzir seus valores na sala de lances.`)
      await carregar()
    } catch (e: any) {
      alert(`Erro ao abrir lances: ${e.message}`)
    }
  }

  const atualizarPainelLances = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/dispensa/lances/painel`)
      if (res.ok) setPainelLances(await res.json())
    } catch { /* mantém painel anterior */ }
  }

  const [enviandoPncp, setEnviandoPncp] = useState<string | null>(null)

  const enviarPncp = async (acao: "aviso" | "resultado" | "contratos") => {
    const rota = acao === "aviso" ? "completo" : acao === "resultado" ? "resultados-homologacao" : "contratos"
    setEnviandoPncp(acao)
    try {
      const res = await authFetch(`${API_URL}/api/pncp/compras/${id}/${rota}`, { method: "POST" })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      alert(acao === "aviso"
        ? `Aviso enviado ao PNCP${j?.numeroControlePNCP ? ` — nº de controle ${j.numeroControlePNCP}` : ""}.`
        : acao === "resultado"
          ? `Resultado: ${j?.enviados}/${j?.total} item(ns) enviados ao PNCP.`
          : `Contratos: ${j?.enviados}/${j?.total} publicado(s) no PNCP (art. 94 — condição de eficácia).`)
      await carregar()
    } catch (e: any) {
      alert(`PNCP: ${e.message}\n\nVerifique as credenciais em Configurações → PNCP e tente novamente.`)
    } finally {
      setEnviandoPncp(null)
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
          <Button variant="outline" onClick={baixarProcessoPdf} disabled={baixandoProcesso}
            title="Autos do processo em PDF único: capa, sumário e todas as peças (DFD, ETP, TR, pesquisa de preços, autorização, aviso, ata, contratos e publicações no PNCP)">
            {baixandoProcesso ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Baixar processo (PDF)
          </Button>
          {licitacao.modalidade === "DISPENSA_ELETRONICA" && checklist.resultado_registrado && (
            <a href={`${API_URL}/api/licitacoes/${id}/dispensa/ata`} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" title="Ata da sessão gerada automaticamente dos registros (propostas, lances, chat e resultado)">
                <FileText className="w-4 h-4 mr-2" />
                Ata da sessão (PDF)
              </Button>
            </a>
          )}
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

      {/* Copiloto: status da preparação automática */}
      {licitacao.preparacao_automatica && (
        <Card className={
          licitacao.preparacao_automatica.status === "EXECUTANDO"
            ? "border-blue-200 bg-blue-50/50"
            : licitacao.preparacao_automatica.status === "CONCLUIDA"
              ? "border-green-200 bg-green-50/40"
              : "border-red-200 bg-red-50/40"
        }>
          <CardContent className="py-3">
            {licitacao.preparacao_automatica.status === "EXECUTANDO" && (
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-blue-600 shrink-0" />
                <div>
                  <p className="text-sm font-medium text-blue-900">🤖 Copiloto preparando o processo…</p>
                  <p className="text-xs text-blue-700">{licitacao.preparacao_automatica.etapa || "Trabalhando…"}</p>
                </div>
              </div>
            )}
            {licitacao.preparacao_automatica.status === "CONCLUIDA" && (
              <div>
                <p className="text-sm font-medium text-green-800">
                  🤖 Processo preparado pelo copiloto — <b>revise os itens sugeridos antes de aprovar</b>
                </p>
                {(licitacao.preparacao_automatica.log || []).length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {(licitacao.preparacao_automatica.log || []).map((l, i) => (
                      <li key={i} className="text-xs text-green-700">• {l}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {licitacao.preparacao_automatica.status === "ERRO" && (
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm text-red-700">
                  🤖 A preparação automática falhou: {licitacao.preparacao_automatica.erro || "erro desconhecido"}
                </p>
                <Button size="sm" variant="outline" onClick={dispararCopiloto} disabled={disparandoCopiloto}>
                  Tentar de novo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

                    {/* Instrução do processo (Art. 72) — contratação direta em etapa única */}
                    {et.titulo === "Fase interna (documentos)" &&
                      instrucao?.contratacao_direta &&
                      ["PLANEJAMENTO", "TERMO_REFERENCIA", "PESQUISA_PRECOS", "ANALISE_JURIDICA", "APROVACAO_INTERNA"].includes(dados.licitacao.fase) && (
                        <div className="mt-3 border rounded-md p-3 bg-slate-50 space-y-2">
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <span className="text-sm font-medium text-gray-700">
                              📋 Instrução do processo — contratação direta (Art. 72)
                            </span>
                            {!instrucao.pode_divulgar && !dados.licitacao.preparacao_automatica && (
                              <Button size="sm" variant="outline" onClick={dispararCopiloto} disabled={disparandoCopiloto}
                                title="O copiloto pesquisa preços em fontes reais e redige os rascunhos dos documentos — você só revisa">
                                {disparandoCopiloto ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : "🤖 "}
                                Preparar automaticamente
                              </Button>
                            )}
                            {dados.licitacao.modalidade === "DISPENSA_ELETRONICA" && (
                              <Button
                                size="sm"
                                onClick={abrirModalDivulgar}
                                disabled={!instrucao.pode_divulgar}
                                title={instrucao.pode_divulgar ? "Abre o prazo de propostas e publica o aviso no PNCP" : `Pendências: ${instrucao.pendentes.join("; ")}`}
                              >
                                📢 Divulgar aviso da dispensa
                              </Button>
                            )}
                          </div>
                          <div className="space-y-1">
                            {instrucao.itens.map((it) => (
                              <div key={it.tipo} className="flex items-center justify-between gap-2 text-xs bg-white border rounded px-2 py-1.5">
                                <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                  {it.status === "OK"
                                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600 shrink-0" />
                                    : it.status === "NAO_SE_APLICA"
                                      ? <span className="text-gray-400 shrink-0" title="Não se aplica">∅</span>
                                      : <Circle className={`w-3.5 h-3.5 shrink-0 ${it.obrigatorio ? "text-amber-500" : "text-gray-300"}`} />}
                                  <span className={it.status === "NAO_SE_APLICA" ? "line-through text-gray-400" : ""}>{it.titulo}</span>
                                  <span className="text-gray-400">({it.fundamento})</span>
                                  {it.obrigatorio && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-300 text-amber-700">obrigatório</Badge>
                                  )}
                                  {it.status === "NAO_SE_APLICA" && it.justificativa && (
                                    <span className="text-gray-400 truncate max-w-[220px]" title={it.justificativa}>— {it.justificativa}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  {it.status !== "NAO_SE_APLICA" && it.status !== "OK" && !it.obrigatorio && (
                                    <button
                                      type="button"
                                      className="text-[11px] text-gray-500 hover:underline disabled:opacity-50"
                                      disabled={naoSeAplicaLoading === it.tipo}
                                      onClick={() => marcarNaoSeAplica(it.tipo, it.titulo)}
                                    >
                                      não se aplica
                                    </button>
                                  )}
                                  {it.status === "NAO_SE_APLICA" && (
                                    <button
                                      type="button"
                                      className="text-[11px] text-gray-500 hover:underline disabled:opacity-50"
                                      disabled={naoSeAplicaLoading === it.tipo}
                                      onClick={() => desfazerNaoSeAplica(it.tipo)}
                                    >
                                      desfazer
                                    </button>
                                  )}
                                  <Link href={`/orgao/fase-interna/processos/${id}`} className="text-[11px] text-blue-600 hover:underline">abrir</Link>
                                </div>
                              </div>
                            ))}
                          </div>
                          <p className="text-[11px] text-gray-400">
                            Mínimo para divulgar: <b>DFD, estimativa de despesa e autorização</b>. Os demais são &quot;se for o caso&quot; — marque
                            &quot;não se aplica&quot; com justificativa (fica registrada nos autos). Ao divulgar, o aviso é publicado
                            automaticamente no PNCP e abre o prazo de propostas (mínimo 3 dias úteis — art. 75, §3º).
                          </p>
                        </div>
                      )}

                    {/* Painel da DISPENSA ELETRÔNICA: prazo, propostas e julgamento */}
                    {et.titulo.startsWith("Seleção") &&
                      dados.licitacao.modalidade === "DISPENSA_ELETRONICA" &&
                      !dados.licitacao.selecao_externa &&
                      !checklist.homologado && (() => {
                        const prazoFim = dados.licitacao.data_fim_acolhimento || dados.licitacao.data_abertura_sessao
                        const aberto = prazoFim ? new Date() < new Date(prazoFim) : false
                        const lancesFim = dados.licitacao.dispensa_lances_fim ? new Date(dados.licitacao.dispensa_lances_fim) : null
                        const lancesAberta = lancesFim ? new Date() < lancesFim : false
                        const totalEstimado = Number(dados.licitacao.valor_total_estimado || 0)
                        const excedeLimite = limiteDispensa != null && totalEstimado > limiteDispensa.valor
                        return (
                          <div className="mt-3 border rounded-md p-3 bg-slate-50 space-y-3">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="text-sm">
                                <span className={`font-medium ${aberto ? "text-blue-700" : "text-gray-700"}`}>
                                  {aberto ? "⏳ Recebendo propostas" : lancesAberta ? "⚡ Fase de lances aberta" : "Prazo de propostas encerrado"}
                                </span>
                                <span className="text-gray-500"> · {dados.propostas.length} proposta(s) recebida(s)</span>
                                {lancesAberta && lancesFim && (
                                  <span className="ml-2 text-xs text-green-800 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">lances até {lancesFim.toLocaleString("pt-BR")}</span>
                                )}
                                {dados.propostas_em_sigilo && (
                                  <span className="ml-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">🔒 valores sigilosos até o fim do prazo</span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {!aberto && !lancesFim && !checklist.resultado_registrado && dados.propostas.length > 0 && (
                                  <Button size="sm" variant="outline" onClick={abrirLances} title="Opcional (modelo IN SEGES 67/2021): janela para os fornecedores reduzirem os próprios valores">
                                    ⚡ Abrir fase de lances
                                  </Button>
                                )}
                                {lancesAberta && (
                                  <Button size="sm" variant="outline" onClick={atualizarPainelLances}>Atualizar painel</Button>
                                )}
                                <Button size="sm" onClick={julgarDispensa} disabled={julgando || aberto || lancesAberta || dados.propostas.length === 0}
                                  title={aberto ? "Disponível após o fim do prazo de propostas" : lancesAberta ? "Disponível após o fim da fase de lances" : dados.propostas.length === 0 ? "Sem propostas recebidas" : ""}>
                                  {julgando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Gavel className="w-4 h-4 mr-1" />}
                                  {checklist.resultado_registrado ? "Rejulgar (menor preço)" : "Julgar propostas (menor preço)"}
                                </Button>
                              </div>
                            </div>
                            {lancesAberta && painelLances?.itens?.length > 0 && (
                              <div className="border rounded bg-white overflow-x-auto">
                                <table className="w-full text-xs">
                                  <thead className="bg-gray-50 text-gray-500">
                                    <tr>
                                      <th className="text-left px-3 py-1.5">Item</th>
                                      <th className="text-right px-3 py-1.5">Menor valor atual</th>
                                      <th className="text-right px-3 py-1.5">Lances</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {painelLances.itens.map((it: any) => (
                                      <tr key={it.item_licitacao_id} className="border-t">
                                        <td className="px-3 py-1.5">{it.numero_item} — {String(it.descricao || "").slice(0, 60)}</td>
                                        <td className="px-3 py-1.5 text-right whitespace-nowrap font-medium text-green-700">{it.menor_valor != null ? fmtMoeda(it.menor_valor) : "—"}</td>
                                        <td className="px-3 py-1.5 text-right">{it.total_lances}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
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
                            {/* Chat da sessão (registrado nos autos; negociação pós-lances) */}
                            <div className="border rounded bg-white">
                              <div className="px-3 py-1.5 border-b text-xs font-medium text-gray-600">💬 Chat da sessão <span className="font-normal text-gray-400">— registrado no processo; use para avisos e para negociar com o melhor classificado após os lances</span></div>
                              <div className="p-2 max-h-40 overflow-y-auto space-y-1.5">
                                {mensagensDispensa.length === 0 && <p className="text-[11px] text-gray-400">Nenhuma mensagem.</p>}
                                {mensagensDispensa.map((m: any) => (
                                  <div key={m.id} className="text-xs">
                                    <span className={`font-medium ${m.autor_tipo === "ORGAO" ? "text-blue-700" : "text-gray-700"}`}>{m.autor_tipo === "ORGAO" ? "🏛️ " : ""}{m.autor_nome}</span>
                                    <span className="text-gray-400"> {m.created_at ? new Date(m.created_at).toLocaleTimeString("pt-BR") : ""}: </span>
                                    <span>{m.mensagem}</span>
                                  </div>
                                ))}
                              </div>
                              <div className="flex items-center gap-2 p-2 border-t">
                                <Input
                                  placeholder="Mensagem aos fornecedores (fica registrada)…"
                                  value={novaMensagemOrgao}
                                  onChange={(e) => setNovaMensagemOrgao(e.target.value)}
                                  onKeyDown={(e) => { if (e.key === "Enter") enviarMensagemOrgao() }}
                                  className="h-8 text-sm"
                                  maxLength={1000}
                                />
                                <Button size="sm" className="h-8" onClick={enviarMensagemOrgao} disabled={!novaMensagemOrgao.trim()}>Enviar</Button>
                              </div>
                            </div>

                            <p className="text-[11px] text-gray-400">
                              O fornecedor envia a proposta pelo Portal do Fornecedor (Licitações → esta dispensa). Após o prazo, você pode (opcionalmente) abrir a <b>fase de lances</b> — cada fornecedor reduz o próprio valor, com o menor valor público e anônimo, em tempo real. O julgamento adjudica o menor valor final por item; a homologação gera o contrato automaticamente.
                            </p>
                          </div>
                        )
                      })()}

                    {/* PNCP (D5): status das publicações + reenvio */}
                    {et.titulo.startsWith("Seleção") &&
                      dados.licitacao.modalidade === "DISPENSA_ELETRONICA" &&
                      !dados.licitacao.selecao_externa &&
                      checklist.fase_interna_concluida && (
                        <div className="mt-3 border rounded-md p-2.5 bg-white">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="font-medium text-gray-600">PNCP:</span>
                              {(dados.pncp || []).length === 0 && (
                                <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">aviso ainda não publicado</span>
                              )}
                              {(dados.pncp || []).map((s, ix) => {
                                const chip = (
                                  <span
                                    key={ix}
                                    title={s.erro_mensagem || (s.status === "ENVIADO" && dados.licitacao.link_pncp ? "Abrir no portal PNCP" : "")}
                                    className={`rounded px-1.5 py-0.5 border ${s.status === "ENVIADO" ? "text-green-700 bg-green-50 border-green-200" : s.status === "ERRO" ? "text-red-700 bg-red-50 border-red-200" : "text-gray-600 bg-gray-50 border-gray-200"}`}
                                  >
                                    {s.tipo} {s.status === "ENVIADO" ? "✓" : s.status === "ERRO" ? "✗" : "…"}
                                    {s.numero_controle_pncp ? ` ${s.numero_controle_pncp}` : ""}
                                  </span>
                                )
                                return s.status === "ENVIADO" && dados.licitacao.link_pncp ? (
                                  <a key={ix} href={dados.licitacao.link_pncp} target="_blank" rel="noopener noreferrer" className="hover:opacity-75">
                                    {chip}
                                  </a>
                                ) : chip
                              })}
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => enviarPncp("aviso")} disabled={enviandoPncp !== null}>
                                {enviandoPncp === "aviso" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                                {(dados.pncp || []).some((s) => s.tipo === "COMPRA" && s.status === "ENVIADO") ? "Reenviar aviso" : "Publicar aviso no PNCP"}
                              </Button>
                              {checklist.homologado && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => enviarPncp("resultado")} disabled={enviandoPncp !== null}>
                                  {enviandoPncp === "resultado" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                                  Enviar resultado
                                </Button>
                              )}
                              {checklist.contrato_gerado && (
                                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => enviarPncp("contratos")} disabled={enviandoPncp !== null}
                                  title="Art. 94 da Lei 14.133: a divulgação no PNCP é condição de eficácia do contrato (10 dias úteis na contratação direta)">
                                  {enviandoPncp === "contratos" ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                                  Enviar contratos
                                </Button>
                              )}
                            </div>
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">Publicação automática: aviso ao divulgar; resultado e contratos ao homologar (art. 94 — a divulgação do contrato no PNCP é condição de eficácia). Os botões servem para reenvio em caso de falha.</p>
                        </div>
                      )}

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
                        {dados.contratos.map((ct) => {
                          const concluido = ct.assinatura_status === "CONCLUIDO"
                          const emAssinatura = !!ct.documento_assinatura_id && !concluido
                          return (
                            <div key={ct.id} className="border rounded-md px-3 py-2 space-y-1.5">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <Link href={`/orgao/contratos/${ct.id}`} className="text-sm font-medium hover:underline">
                                  Contrato {ct.numero_contrato} — {ct.fornecedor_razao_social}
                                </Link>
                                <span className="text-sm text-gray-500">{fmtMoeda(ct.valor_global)} · {ct.status}</span>
                              </div>
                              {/* Fluxo do termo: gerar → assinar (todas as partes) → PNCP */}
                              <div className="flex items-center gap-2 flex-wrap text-xs">
                                {!ct.documento_assinatura_id && (
                                  <Button size="sm" variant="outline" className="h-7 text-xs"
                                    disabled={assinandoContrato === ct.id}
                                    onClick={() => solicitarAssinaturasContrato(ct)}
                                    title="Gera o termo de contrato em PDF e envia para assinatura eletrônica do órgão e do fornecedor">
                                    {assinandoContrato === ct.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : "📝 "}
                                    Gerar termo e colher assinaturas
                                  </Button>
                                )}
                                {emAssinatura && (
                                  <>
                                    <span className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                                      ✍️ Assinaturas: {ct.assinados ?? 0}/{ct.total_signatarios ?? 0}
                                    </span>
                                    {ct.signatarios_resumo && <span className="text-gray-500">{ct.signatarios_resumo}</span>}
                                    {ct.arquivo_contrato && (
                                      <a href={`${API_URL}/uploads/${ct.arquivo_contrato}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">termo (PDF)</a>
                                    )}
                                    <Link href="/assinador/painel" className="text-blue-600 hover:underline">assinar/acompanhar</Link>
                                    <button type="button" className="text-gray-500 hover:underline"
                                      onClick={() => reenviarNotificacoesAssinatura(ct.documento_assinatura_id!)}>
                                      reenviar notificações
                                    </button>
                                  </>
                                )}
                                {concluido && (
                                  <>
                                    <span className="text-green-700 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                                      ✅ Assinado por todas as partes{ct.data_assinatura ? ` em ${new Date(ct.data_assinatura).toLocaleDateString("pt-BR")}` : ""}
                                    </span>
                                    {(ct.arquivo_assinado_url || ct.arquivo_contrato) && (
                                      <a href={`${API_URL}/uploads/${ct.arquivo_assinado_url || ct.arquivo_contrato}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                                        termo assinado (PDF)
                                      </a>
                                    )}
                                    <span className="text-gray-400">publicação no PNCP disparada automaticamente (art. 94)</span>
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })}
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

      {/* Modal: divulgar aviso da dispensa */}
      <Dialog open={modalDivulgar} onOpenChange={setModalDivulgar}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Divulgar aviso da dispensa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              A divulgação conclui a instrução, abre o prazo de propostas no Portal do Fornecedor
              e publica o aviso de contratação direta <b>automaticamente no PNCP</b>.
            </p>
            <div>
              <label className="text-sm font-medium">Receber propostas até</label>
              <Input
                type="datetime-local"
                value={fimPropostas}
                onChange={(e) => setFimPropostas(e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-gray-400 mt-1">
                Mínimo de 3 dias úteis a partir de agora (art. 75, §3º) — já sugerido no campo.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDivulgar(false)} disabled={divulgando}>Cancelar</Button>
            <Button onClick={divulgarAviso} disabled={divulgando || !fimPropostas}>
              {divulgando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Divulgar agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
