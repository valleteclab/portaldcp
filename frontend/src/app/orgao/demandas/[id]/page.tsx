'use client'

/**
 * DEMANDA (pedido do setor) — tela no padrão das demais do órgão: menu do
 * sistema, cabeçalho com título, situação e ações; as 4 seções em cartões numa
 * página só (1 Informações gerais, 2 Justificativa, 3 Materiais e serviços,
 * 4 Responsável) e o resumo lateral (checklist, estimativa, PCA).
 * Peças em components/demandas/. Regras e API inalteradas: GET/PUT
 * /api/demandas/:id, itens (POST/PUT/DELETE), enviar, aprovar/rejeitar,
 * voltar-rascunho e "Iniciar contratação" (DFD de 1 demanda).
 */
import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertCircle, ArrowLeft, CheckCircle, ChevronRight, FileText, Loader2, Lock,
  Rocket, Send, Undo2, XCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { API_URL, authFetch, formatarDataBR, formatarDataHoraBR } from '@/lib/api'
import { toast } from "sonner"
import { confirmarAcao, pedirTextoAcao } from "@/components/DialogoGlobal"
import { type ModoFaseInterna, lembrarEscolhaModo, rotaFaseInternaFeitaFora, ultimaEscolhaModo } from '@/lib/fase-interna/criacao'
import { OpcoesModoFaseInterna } from '@/components/fase-interna/externa/EscolhaModoFaseInterna'
import {
  STATUS_DEMANDA, fmtMoeda, totalDaDemanda, trimestreDaData, trimestreInicialDoItem,
  type AcompanhamentoDaDemanda, type Demanda, type FormItemState, type ItemDemanda, type ItemSelecionado, type SetorOrgao,
} from '@/components/demandas/tipos'
import { SecaoDemanda } from '@/components/demandas/SecaoDemanda'
import { JustificativaDemanda } from '@/components/demandas/JustificativaDemanda'
import { ItensDemanda } from '@/components/demandas/ItensDemanda'
import { FormItemDemanda } from '@/components/demandas/FormItemDemanda'
import { PainelBuscaItem } from '@/components/demandas/PainelBuscaItem'
import { AcompanhamentoDemanda } from '@/components/demandas/AcompanhamentoDemanda'
import { ResumoDemanda, checklistDaDemanda } from '@/components/demandas/ResumoDemanda'
import { rotaDoProcessoAberto } from '@/lib/demandas/proxima-acao-dfd'

/** Linha "rótulo: valor" dos dados da demanda. */
function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-gray-600">{rotulo}</dt>
      <dd className="text-sm font-medium text-gray-900 break-words">{children}</dd>
    </div>
  )
}

/** Item da demanda na forma do formulário (edição). */
function itemParaSelecionado(item: ItemDemanda): ItemSelecionado {
  return {
    codigo: item.codigo_item_catalogo || '',
    descricao: item.descricao_objeto,
    tipo: item.categoria,
    unidade_padrao: item.unidade_medida,
    codigo_classe: item.codigo_classe,
    nome_classe: item.nome_classe,
    fonte: item.catalogo_utilizado === 'COMPRASGOV' ? 'COMPRASGOV' : 'PROPRIO',
  }
}

export default function DetalheDemandaPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [demanda, setDemanda] = useState<Demanda | null>(null)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [orgaoId, setOrgaoId] = useState('')

  const [itemSelecionado, setItemSelecionado] = useState<ItemSelecionado | null>(null)
  const [dialogAdicionar, setDialogAdicionar] = useState(false)
  const [itemEditando, setItemEditando] = useState<ItemDemanda | null>(null)

  // ── Carregar orgaoId e demanda ─────────────────────────────────────────────
  useEffect(() => {
    try {
      const d = localStorage.getItem('orgao')
      if (d) setOrgaoId(JSON.parse(d).id || '')
    } catch { /* ignore */ }
  }, [])

  // Setores do órgão: o rascunho (inclusive o devolvido) troca a unidade requisitante
  const [setores, setSetores] = useState<SetorOrgao[]>([])
  const [unidadeLivre, setUnidadeLivre] = useState(false)

  const carregarDemanda = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/demandas/${id}`)
      if (res.ok) {
        const data = await res.json()
        setDemanda({ ...data, itens: data.itens ?? [] })
      } else {
        router.push('/orgao/demandas')
      }
    } catch {
      router.push('/orgao/demandas')
    } finally {
      setLoading(false)
    }
  }, [id, router])

  useEffect(() => { carregarDemanda() }, [carregarDemanda])

  useEffect(() => {
    if (!orgaoId || demanda?.status !== 'RASCUNHO' || setores.length) return
    authFetch(`${API_URL}/api/orgaos/${orgaoId}/setores`)
      .then(async (r) => {
        if (!r.ok) return
        const lista = await r.json()
        setSetores(Array.isArray(lista) ? lista : [])
      })
      .catch(() => { /* sem setores: a unidade fica em texto livre */ })
  }, [orgaoId, demanda?.status, setores.length])

  // Na chegada, leva à PRIMEIRA seção incompleta do rascunho (depois o usuário manda)
  const secaoInicialDefinida = useRef(false)
  useEffect(() => {
    if (!demanda || secaoInicialDefinida.current) return
    secaoInicialDefinida.current = true
    if (demanda.status !== 'RASCUNHO') return
    const secao = !demanda.descricao_sucinta_objeto?.trim() ? 1
      : !demanda.observacoes?.trim() ? 2
      : (demanda.itens?.length ?? 0) === 0 ? 3
      : null
    if (secao && secao > 1) {
      requestAnimationFrame(() => document.getElementById(`secao-${secao}`)?.scrollIntoView({ block: 'start' }))
    }
  }, [demanda])

  // ── Aprovar/Rejeitar direto na página (o aprovador não precisa voltar) ────
  const [decidindo, setDecidindo] = useState(false)
  // Permissões pelo modelo de fluxo (Configurações › Fluxo): quem aprova a demanda e quem monta o DFD
  const [podeAprovar, setPodeAprovar] = useState(false)
  const [podeMontarDfd, setPodeMontarDfd] = useState(false)
  useEffect(() => {
    authFetch(`${API_URL}/api/dfds-consolidados/permissoes`)
      .then(async (r) => {
        if (!r.ok) return
        const p = await r.json()
        setPodeAprovar(!!p.pode_aprovar_demanda)
        setPodeMontarDfd(!!p.pode_montar)
      })
      .catch(() => { /* sem permissões: botões ocultos */ })
  }, [])

  const aprovarAqui = async () => {
    if (!demanda || decidindo) return
    if (!(await confirmarAcao({ titulo: 'Confirmação', mensagem: `Aprovar a demanda de ${demanda.unidade_requisitante}?` }))) return
    setDecidindo(true)
    try {
      // Quem aprova vem do login (o servidor registra)
      const res = await authFetch(`${API_URL}/api/demandas/${demanda.id}/aprovar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `HTTP ${res.status}`)
      }
      await carregarDemanda()
    } catch (e: unknown) {
      toast.error(`Erro ao aprovar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDecidindo(false)
    }
  }

  const rejeitarAqui = async () => {
    if (!demanda || decidindo) return
    const motivo = (await pedirTextoAcao({ titulo: 'Motivo da rejeição (fica registrado e visível ao requisitante):' }))
    if (!motivo || !motivo.trim()) return
    setDecidindo(true)
    try {
      const res = await authFetch(`${API_URL}/api/demandas/${demanda.id}/rejeitar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivo.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `HTTP ${res.status}`)
      }
      await carregarDemanda()
    } catch (e: unknown) {
      toast.error(`Erro ao rejeitar: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDecidindo(false)
    }
  }

  // ── Rejeitada: o setor volta a demanda para rascunho, corrige e reenvia ───
  const voltarParaRascunho = async () => {
    if (!demanda || decidindo) return
    if (!(await confirmarAcao({ titulo: 'Corrigir a demanda', mensagem: 'A demanda volta para rascunho para você corrigir e enviar de novo. O motivo da rejeição continua visível.' }))) return
    setDecidindo(true)
    try {
      const res = await authFetch(`${API_URL}/api/demandas/${demanda.id}/voltar-rascunho`, { method: 'PATCH' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || `HTTP ${res.status}`)
      }
      await carregarDemanda()
    } catch (e: unknown) {
      toast.error(`Não foi possível voltar para rascunho: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setDecidindo(false)
    }
  }

  // ── Acompanhamento (PCA → processo → contrato) ────────────────────────────
  const [acomp, setAcomp] = useState<AcompanhamentoDaDemanda | null>(null)
  useEffect(() => {
    if (!demanda?.id || demanda.status === 'RASCUNHO') return
    authFetch(`${API_URL}/api/demandas/${demanda.id}/acompanhamento`)
      .then(async (r) => { if (r.ok) setAcomp(await r.json()) })
      .catch(() => { /* card fica oculto */ })
  }, [demanda?.id, demanda?.status])

  // ── Iniciar contratação a partir da demanda (ponte demanda → processo) ────
  const [processoVinculado, setProcessoVinculado] = useState<{ id: string; numero_processo: string; modalidade: string } | null>(null)
  const [modalIniciar, setModalIniciar] = useState(false)
  const [modalidadeEscolhida, setModalidadeEscolhida] = useState('')
  const [limiteDispensa, setLimiteDispensa] = useState<number | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const [prepararAutomatico, setPrepararAutomatico] = useState(true)
  // Pergunta da criação: fase interna guiada aqui ou já feita fora (sugestão = última escolha)
  const [modoFaseInterna, setModoFaseInterna] = useState<ModoFaseInterna | null>(null)

  useEffect(() => {
    if (!demanda?.id) return
    // Processo já iniciado a partir desta demanda (sozinha ou pelo DFD consolidado)?
    if (acomp?.processo) setProcessoVinculado({ id: acomp.processo.id, numero_processo: acomp.processo.numero_processo, modalidade: acomp.processo.modalidade })
    // Limite da dispensa do exercício (art. 75, II — tabela por exercício) para sugerir a modalidade
    authFetch(`${API_URL}/api/parametros-licitacao/limites-dispensa`)
      .then(async (r) => { if (r.ok) { const l = await r.json(); if (l?.II?.valor != null) setLimiteDispensa(Number(l.II.valor)) } })
      .catch(() => { /* sugestão fica sem limite */ })
  }, [demanda?.id, orgaoId, acomp?.processo])

  const abrirModalIniciar = () => {
    const total = totalDaDemanda(demanda?.itens)
    // Sugestão: dentro do limite do art. 75 → dispensa; acima → pregão
    setModalidadeEscolhida(limiteDispensa != null && total > limiteDispensa ? 'PREGAO_ELETRONICO' : 'DISPENSA_ELETRONICA')
    setModoFaseInterna(ultimaEscolhaModo())
    setModalIniciar(true)
  }

  /**
   * "Iniciar contratação" de UMA demanda (só a unidade de planejamento): por
   * baixo, um DFD de 1 demanda — o mesmo caminho do DFD consolidado.
   */
  const iniciarContratacao = async () => {
    if (!demanda || !modalidadeEscolhida || !modoFaseInterna) return
    lembrarEscolhaModo(modoFaseInterna)
    setIniciando(true)
    let dfdId: string | null = null
    try {
      const rd = await authFetch(`${API_URL}/api/dfds-consolidados/a-partir-de-demanda/${demanda.id}`, { method: 'POST' })
      const dfd = await rd.json().catch(() => null)
      if (!rd.ok) throw new Error(dfd?.message || `HTTP ${rd.status}`)
      dfdId = dfd.id
      // Fase interna já feita fora: o fluxo curto (dados, itens e PDFs) com o DFD pré-carregado
      if (modoFaseInterna === 'FORA') {
        router.push(rotaFaseInternaFeitaFora({ modalidade: modalidadeEscolhida, dfdId: dfd.id }))
        return
      }
      const res = await authFetch(`${API_URL}/api/dfds-consolidados/${dfd.id}/abrir-processo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modalidade: modalidadeEscolhida }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      const licId = j?.licitacao?.id
      if (j?.alerta) toast.warning(j.alerta, { duration: 12000 })
      // Modo co-work: dispara a preparação automática em background
      // (pesquisa de preços real + rascunhos IA) antes de abrir o cockpit
      if (prepararAutomatico && licId) {
        try {
          await authFetch(`${API_URL}/api/fase-interna/${licId}/preparar-automatico`, { method: 'POST' })
        } catch { /* cockpit permite disparar de novo */ }
      }
      router.push(rotaDoProcessoAberto(licId, dfd.rotulo))
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      toast.error(`Não foi possível iniciar a contratação: ${msg}`)
      setIniciando(false)
      // 2ª aprovação ligada: o DFD de 1 demanda fica pronto para enviar à aprovação
      if (dfdId && /2ª aprovação/.test(msg)) router.push(`/orgao/demandas/dfd/${dfdId}`)
    }
  }

  const salvarDadosDemanda = async (dados: Partial<Demanda>) => {
    if (!demanda) return
    setSalvando(true)
    try {
      const res = await authFetch(`${API_URL}/api/demandas/${demanda.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      })
      if (res.ok) {
        const atualizada = await res.json()
        setDemanda({ ...atualizada, itens: atualizada.itens ?? demanda.itens ?? [] })
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.message || 'Erro ao salvar dados da demanda')
      }
    } finally {
      setSalvando(false)
    }
  }

  // ── Adicionar item ─────────────────────────────────────────────────────────
  const adicionarItem = async (form: FormItemState) => {
    if (!demanda || !itemSelecionado) return
    setSalvando(true)
    try {
      // Classe efetiva: preferir classificação própria selecionada no formulário;
      // fallback para o código do item (pode ser código federal CATMAT/CATSER)
      const codigoClasse = form.codigo_classe || itemSelecionado.codigo_classe
      const nomeClasse = form.nome_classe || itemSelecionado.nome_classe

      // 1. Registrar no catálogo federal se origem = COMPRASGOV
      if (itemSelecionado.fonte === 'COMPRASGOV') {
        await authFetch(`${API_URL}/api/catalogo/importar-item`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigo: itemSelecionado.codigo,
            descricao: itemSelecionado.descricao,
            tipo: itemSelecionado.tipo,
            unidade_padrao: itemSelecionado.unidade_padrao,
            codigo_classe: codigoClasse,
            nome_classe: nomeClasse,
            codigo_pdm: itemSelecionado.codigo_pdm,
            nome_pdm: itemSelecionado.nome_pdm,
            descricao_detalhada: itemSelecionado.descricao_detalhada,
            origem: 'COMPRASGOV',
          }),
        })
      }

      // 2. Adicionar item à demanda
      const valorUnitario = parseFloat(form.valor_unitario_estimado) || 0
      const quantidade = parseFloat(form.quantidade_estimada) || 1

      const res = await authFetch(`${API_URL}/api/demandas/${demanda.id}/itens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoria: itemSelecionado.tipo,
          codigo_item_catalogo: itemSelecionado.codigo,
          descricao_objeto: itemSelecionado.descricao,
          codigo_classe: codigoClasse,
          nome_classe: nomeClasse,
          quantidade_estimada: quantidade,
          unidade_medida: form.unidade_medida,
          valor_unitario_estimado: valorUnitario,
          valor_total_estimado: valorUnitario * quantidade,
          trimestre_previsto: parseInt(form.trimestre_previsto),
          prioridade: parseInt(form.prioridade),
          renovacao_contrato: form.renovacao_contrato,
          catalogo_utilizado: itemSelecionado.fonte === 'COMPRASGOV' ? 'COMPRASGOV' : 'OUTROS',
        }),
      })

      if (res.ok) {
        setItemSelecionado(null)
        carregarDemanda()
      }
    } finally {
      setSalvando(false)
    }
  }

  // ── Editar item (PUT /api/demandas/itens/:id — o servidor recalcula o total) ──
  const salvarEdicaoItem = async (form: FormItemState) => {
    if (!itemEditando) return
    setSalvando(true)
    try {
      const res = await authFetch(`${API_URL}/api/demandas/itens/${itemEditando.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo_classe: form.codigo_classe || itemEditando.codigo_classe,
          nome_classe: form.nome_classe || itemEditando.nome_classe,
          quantidade_estimada: parseFloat(form.quantidade_estimada) || 1,
          unidade_medida: form.unidade_medida,
          valor_unitario_estimado: parseFloat(form.valor_unitario_estimado) || 0,
          trimestre_previsto: parseInt(form.trimestre_previsto),
          prioridade: parseInt(form.prioridade),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        toast.error(err.message || 'Não foi possível salvar o item')
        return
      }
      setItemEditando(null)
      carregarDemanda()
    } finally {
      setSalvando(false)
    }
  }

  // ── Remover item ───────────────────────────────────────────────────────────
  const removerItem = async (itemId: string) => {
    if (!(await confirmarAcao({ titulo: 'Confirmação', mensagem: 'Remover este item da demanda?', destrutivo: true }))) return
    await authFetch(`${API_URL}/api/demandas/itens/${itemId}`, { method: 'DELETE' })
    carregarDemanda()
  }

  // ── Enviar para aprovação ──────────────────────────────────────────────────
  const enviarParaAprovacao = async () => {
    if (!demanda) return
    setEnviando(true)
    try {
      const res = await authFetch(`${API_URL}/api/demandas/${demanda.id}/enviar`, { method: 'PATCH' })
      if (res.ok) {
        carregarDemanda()
      } else {
        const err = await res.json().catch(() => ({}))
        toast.error(err.message || 'Erro ao enviar demanda')
      }
    } finally {
      setEnviando(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" aria-label="Carregando a demanda" />
      </div>
    )
  }
  if (!demanda) return null

  const status = STATUS_DEMANDA[demanda.status]
  const StatusIcon = status?.icon || FileText
  const podeEditar = demanda.status === 'RASCUNHO'
  const totalDemanda = totalDaDemanda(demanda.itens)
  const titulo = demanda.descricao_sucinta_objeto?.trim() || 'Nova demanda'
  const podeEnviar = demanda.itens.length > 0 && !!demanda.descricao_sucinta_objeto?.trim()
  const faltaParaEnviar = checklistDaDemanda(demanda).filter(c => c.obrigatorio && !c.ok)
  const aprovadaOuAdiante = ['APROVADA', 'CONSOLIDADA', 'EM_CONTRATACAO', 'CONTRATADA'].includes(demanda.status)
  const voltar = () => (window.history.length > 1 ? router.back() : router.push('/orgao/demandas'))

  return (
    <div className="max-w-7xl mx-auto py-2 sm:py-4 space-y-4 min-w-0">
      {/* Trilha */}
      <nav aria-label="Trilha" className="flex items-center gap-1 text-sm text-gray-600 min-w-0">
        <Link href="/orgao/demandas" className="text-blue-800 hover:underline shrink-0">Demandas</Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate text-gray-800">Demanda — {demanda.unidade_requisitante}</span>
      </nav>

      {/* Cabeçalho: título, situação e ações */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-[1_1_320px]">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 break-words line-clamp-2" title={titulo}>
            {titulo}
          </h1>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-sm text-gray-700">
            <Badge className={`${status?.cor ?? ''} hover:opacity-100`}>
              <StatusIcon className="h-3 w-3 mr-1" aria-hidden="true" />
              {status?.label ?? demanda.status}
            </Badge>
            {demanda.dfd && (
              <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                DFD nº {demanda.dfd.numero}/{demanda.dfd.ano}
              </Badge>
            )}
            <span>{demanda.unidade_requisitante}</span>
            <span aria-hidden="true">·</span>
            <span>PCA {demanda.ano_referencia}</span>
            <span aria-hidden="true">·</span>
            <span>criada em {formatarDataBR(demanda.created_at)}</span>
            {demanda.data_aprovacao && aprovadaOuAdiante && (
              <>
                <span aria-hidden="true">·</span>
                <span>aprovada por <b className="font-medium">{demanda.aprovado_por || 'aprovador'}</b> em {formatarDataBR(demanda.data_aprovacao)}</span>
              </>
            )}
            {podeEditar && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-gray-600" role="status">{salvando ? 'salvando…' : 'salvo automaticamente'}</span>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={voltar} title="Volta para a tela anterior (lista, aprovações…)">
            <ArrowLeft className="h-4 w-4 mr-2" aria-hidden="true" /> Voltar
          </Button>
          {/* Rejeitada: o setor volta para rascunho, corrige e reenvia */}
          {demanda.status === 'REJEITADA' && demanda.motivo_rejeicao && (
            <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={voltarParaRascunho} disabled={decidindo}>
              <Undo2 className="h-4 w-4 mr-2" aria-hidden="true" /> Voltar para rascunho e corrigir
            </Button>
          )}
          {/* Aprovador decide AQUI mesmo — sem precisar voltar à central */}
          {podeAprovar && (demanda.status === 'ENVIADA' || demanda.status === 'EM_ANALISE') && (
            <>
              <Button className="bg-green-600 hover:bg-green-700" onClick={aprovarAqui} disabled={decidindo}>
                {decidindo ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" aria-hidden="true" />}
                Aprovar
              </Button>
              <Button variant="outline" className="text-red-700 border-red-300 hover:bg-red-50" onClick={rejeitarAqui} disabled={decidindo}>
                <XCircle className="h-4 w-4 mr-2" aria-hidden="true" /> Rejeitar
              </Button>
            </>
          )}
          {podeEditar && (
            <Button
              onClick={enviarParaAprovacao}
              disabled={enviando || !podeEnviar}
              title={podeEnviar ? 'Envia o pedido para aprovação' : 'Para enviar: descrição do pedido e ao menos 1 item'}
            >
              {enviando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" aria-hidden="true" />}
              Enviar demanda
            </Button>
          )}
          {aprovadaOuAdiante && (
            processoVinculado ? (
              <Button variant="outline" onClick={() => router.push(`/orgao/processos/${processoVinculado.id}`)}
                title={`Processo ${processoVinculado.numero_processo} iniciado a partir desta demanda`}>
                Ver processo {processoVinculado.numero_processo}
              </Button>
            ) : podeMontarDfd && !demanda.dfd ? (
              <Button className="bg-green-600 hover:bg-green-700" onClick={abrirModalIniciar}
                title="Unidade de planejamento: abre o processo só com esta demanda (DFD de 1 demanda). Para juntar pedidos parecidos, use o DFD consolidado.">
                <Rocket className="h-4 w-4 mr-2" aria-hidden="true" /> Iniciar contratação
              </Button>
            ) : null
          )}
        </div>
      </header>

      {podeEditar && faltaParaEnviar.length > 0 && (
        <p className="text-sm text-amber-800">
          Para enviar, falta: {faltaParaEnviar.map(c => c.secao === 1 ? 'a descrição do pedido (seção 1)' : 'ao menos 1 item (seção 3)').join(' e ')}.
        </p>
      )}

      {/* Avisos */}
      {demanda.status === 'REJEITADA' && demanda.motivo_rejeicao && (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 flex gap-2 items-start">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            <span className="font-semibold">Demanda rejeitada: </span>{demanda.motivo_rejeicao}
            <span className="block text-xs mt-0.5">Use &quot;Voltar para rascunho e corrigir&quot; acima para ajustar e enviar de novo.</span>
          </p>
        </div>
      )}
      {demanda.status === 'RASCUNHO' && demanda.motivo_rejeicao && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Corrija conforme a rejeição e envie de novo: <b>{demanda.motivo_rejeicao}</b>
        </div>
      )}
      {/* Juntada num DFD consolidado: travada (a unidade de planejamento conduz) */}
      {demanda.dfd && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 flex gap-2 items-start sm:items-center flex-wrap text-sm text-indigo-900">
          <Lock className="h-4 w-4 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
          <span className="flex-1 min-w-[200px]">
            Esta demanda está no <b>DFD nº {demanda.dfd.numero}/{demanda.dfd.ano}</b>, montado pela unidade de planejamento
            (Lei 14.133, art. 12, VII) — não pode mais ser alterada nem abrir processo sozinha.
          </span>
          <Button size="sm" variant="outline" className="bg-white" onClick={() => router.push(`/orgao/demandas/dfd/${demanda.dfd!.id}`)}>
            Ver DFD
          </Button>
        </div>
      )}

      {/* Acompanhamento: o requisitante VÊ o pedido andando */}
      {acomp && demanda.status !== 'RASCUNHO' && (
        <AcompanhamentoDemanda acomp={acomp} rejeitada={demanda.status === 'REJEITADA'} />
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-4 min-w-0">
          {/* 1. Informações gerais */}
          <SecaoDemanda
            id="secao-1"
            numero={1}
            titulo="Informações gerais"
            completa={!!demanda.descricao_sucinta_objeto?.trim()}
            descricao="Resumo do pedido em 1 a 3 frases: o que o setor precisa e para quê."
          >
            <div className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="demanda-descricao" className="block text-sm font-medium text-gray-800">Descrição do pedido *</label>
                {podeEditar ? (
                  <Textarea
                    id="demanda-descricao"
                    value={demanda.descricao_sucinta_objeto || ''}
                    onChange={(e) => setDemanda(d => d ? { ...d, descricao_sucinta_objeto: e.target.value } : d)}
                    onBlur={(e) => salvarDadosDemanda({ descricao_sucinta_objeto: e.target.value })}
                    placeholder="Ex.: Aquisição de notebooks para atender as atividades administrativas do setor de TI."
                    rows={3}
                    className="resize-y"
                  />
                ) : (
                  <p id="demanda-descricao" className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                    {demanda.descricao_sucinta_objeto || 'Sem descrição sucinta informada.'}
                  </p>
                )}
                <p className="text-xs text-gray-600">O planejamento usa este resumo para juntar pedidos parecidos de outros setores num DFD.</p>
              </div>
              {podeEditar ? (
                /* Rascunho (inclusive o devolvido): todos os dados do pedido são editáveis */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 border-t pt-4">
                  <div className="space-y-1 min-w-0">
                    <label htmlFor="demanda-unidade" className="block text-xs text-gray-600">Unidade requisitante *</label>
                    {setores.length > 0 && !unidadeLivre && (!demanda.unidade_requisitante || setores.some(x => x.id === demanda.setor_id || x.nome === demanda.unidade_requisitante)) ? (
                      <Select
                        value={setores.find(x => x.id === demanda.setor_id || x.nome === demanda.unidade_requisitante)?.id ?? ''}
                        onValueChange={(v) => {
                          if (v === '__outro__') { setUnidadeLivre(true); return }
                          const setor = setores.find(x => x.id === v)
                          if (!setor) return
                          setDemanda(d => d ? { ...d, setor_id: setor.id, unidade_requisitante: setor.nome } : d)
                          salvarDadosDemanda({ setor_id: setor.id, unidade_requisitante: setor.nome })
                        }}
                      >
                        <SelectTrigger id="demanda-unidade" className="h-9 bg-white"><SelectValue placeholder="Selecione o setor" /></SelectTrigger>
                        <SelectContent>
                          {setores.map(x => <SelectItem key={x.id} value={x.id}>{x.codigo ? `${x.codigo} - ` : ''}{x.nome}</SelectItem>)}
                          <SelectItem value="__outro__">Outro setor (digitar o nome)</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        id="demanda-unidade"
                        className="h-9 bg-white"
                        value={demanda.unidade_requisitante || ''}
                        onChange={(e) => setDemanda(d => d ? { ...d, unidade_requisitante: e.target.value, setor_id: null } : d)}
                        onBlur={(e) => { if (e.target.value.trim()) salvarDadosDemanda({ unidade_requisitante: e.target.value.trim() }) }}
                        placeholder="Nome do setor que pede"
                      />
                    )}
                  </div>
                  <Dado rotulo="Ano de referência (PCA)">{demanda.ano_referencia}</Dado>
                  <div className="space-y-1 min-w-0">
                    <label htmlFor="demanda-tipo" className="block text-xs text-gray-600">Tipo da demanda</label>
                    <Select
                      value={demanda.renovacao_contrato ? 'RENOVACAO' : 'NOVA'}
                      onValueChange={(v) => {
                        const renovacao = v === 'RENOVACAO'
                        setDemanda(d => d ? { ...d, renovacao_contrato: renovacao } : d)
                        salvarDadosDemanda({ renovacao_contrato: renovacao })
                      }}
                    >
                      <SelectTrigger id="demanda-tipo" className="h-9 bg-white"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NOVA">Nova demanda</SelectItem>
                        <SelectItem value="RENOVACAO">Renovação contratual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 min-w-0">
                    <label htmlFor="demanda-data" className="block text-xs text-gray-600">Para quando (data desejada)</label>
                    <Input
                      id="demanda-data"
                      type="date"
                      className="h-9 bg-white"
                      value={(demanda.data_desejada_contratacao || '').slice(0, 10)}
                      onChange={(e) => {
                        const v = e.target.value
                        setDemanda(d => d ? { ...d, data_desejada_contratacao: v } : d)
                        // data completa (ou apagada) → grava; digitação pela metade espera
                        if (!v || /^\d{4}-\d{2}-\d{2}$/.test(v)) salvarDadosDemanda({ data_desejada_contratacao: v })
                      }}
                    />
                    <p className="text-xs text-gray-600">
                      {trimestreDaData(demanda.data_desejada_contratacao)
                        ? `Novos itens entram no ${trimestreDaData(demanda.data_desejada_contratacao)}º trimestre (dá para mudar em cada item).`
                        : 'Sem data: você escolhe o trimestre de cada item.'}
                    </p>
                  </div>
                </div>
              ) : (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 border-t pt-4">
                  <Dado rotulo="Unidade requisitante">{demanda.unidade_requisitante}</Dado>
                  <Dado rotulo="Ano de referência (PCA)">{demanda.ano_referencia}</Dado>
                  <Dado rotulo="Tipo da demanda">{demanda.renovacao_contrato ? 'Renovação contratual' : 'Nova demanda'}</Dado>
                  <Dado rotulo="Para quando (data desejada)">
                    {demanda.data_desejada_contratacao ? formatarDataBR(demanda.data_desejada_contratacao) : <span className="font-normal text-gray-500 italic">Não informado</span>}
                  </Dado>
                  {demanda.data_aprovacao && (
                    <Dado rotulo="Aprovada por">
                      {demanda.aprovado_por || 'Aprovador'} <span className="font-normal text-gray-700">em {formatarDataHoraBR(demanda.data_aprovacao).slice(0, 17)}</span>
                    </Dado>
                  )}
                </dl>
              )}
            </div>
          </SecaoDemanda>

          {/* 2. Justificativa */}
          <JustificativaDemanda
            demandaId={demanda.id}
            justificativa={demanda.observacoes || ''}
            podeEditar={podeEditar}
            onSalvo={(texto) => setDemanda(d => d ? { ...d, observacoes: texto } : d)}
            contextoObjeto={demanda.descricao_sucinta_objeto || ''}
          />

          {/* 3. Materiais e serviços */}
          <ItensDemanda
            itens={demanda.itens}
            podeEditar={podeEditar}
            onAdicionar={() => { setItemSelecionado(null); setDialogAdicionar(true) }}
            onEditar={setItemEditando}
            onRemover={removerItem}
          />

          {/* 4. Responsável */}
          <SecaoDemanda
            id="secao-4"
            numero={4}
            titulo="Responsável pelo pedido"
            completa={!!demanda.responsavel_nome?.trim()}
            descricao={podeEditar ? 'Quem responde pela demanda no setor (quem cria já vem preenchido; dá para trocar).' : 'Quem responde pela demanda no setor.'}
          >
            {podeEditar ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
                {([
                  { campo: 'responsavel_nome', rotulo: 'Nome', tipo: 'text', ph: 'Nome completo' },
                  { campo: 'responsavel_email', rotulo: 'E-mail', tipo: 'email', ph: 'email@orgao.gov.br' },
                  { campo: 'responsavel_telefone', rotulo: 'Telefone', tipo: 'tel', ph: '(00) 00000-0000' },
                ] as const).map(c => (
                  <div key={c.campo} className="space-y-1 min-w-0">
                    <label htmlFor={`demanda-${c.campo}`} className="block text-xs text-gray-600">{c.rotulo}</label>
                    <Input
                      id={`demanda-${c.campo}`}
                      type={c.tipo}
                      className="h-9 bg-white"
                      value={demanda[c.campo] || ''}
                      placeholder={c.ph}
                      onChange={(e) => setDemanda(d => d ? { ...d, [c.campo]: e.target.value } : d)}
                      onBlur={(e) => salvarDadosDemanda({ [c.campo]: e.target.value.trim() })}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-3">
                {[
                  { rotulo: 'Nome', valor: demanda.responsavel_nome },
                  { rotulo: 'E-mail', valor: demanda.responsavel_email },
                  { rotulo: 'Telefone', valor: demanda.responsavel_telefone },
                ].map(row => (
                  <Dado key={row.rotulo} rotulo={row.rotulo}>
                    {row.valor || <span className="font-normal text-gray-500 italic">Não informado</span>}
                  </Dado>
                ))}
              </dl>
            )}
          </SecaoDemanda>
        </div>

        <aside aria-label="Resumo da demanda" className="min-w-0">
          <ResumoDemanda demanda={demanda} total={totalDemanda} editavel={podeEditar} />
        </aside>
      </div>

      {/* ══ Adicionar item ═══════════════════════════════════════════════════ */}
      <Dialog open={dialogAdicionar} onOpenChange={(open) => {
        setDialogAdicionar(open)
        if (!open) setItemSelecionado(null)
      }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Adicionar material ou serviço</DialogTitle>
            <DialogDescription>
              {itemSelecionado
                ? 'Informe a classe e a quantidade. O valor é uma estimativa.'
                : 'Procure pelo nome ou código. Não achou? Use o catálogo do órgão para cadastrar um item novo.'}
            </DialogDescription>
          </DialogHeader>

          {itemSelecionado ? (
            <FormItemDemanda
              item={itemSelecionado}
              inicial={{ trimestre_previsto: trimestreInicialDoItem(demanda.data_desejada_contratacao) }}
              onConfirm={async (form) => {
                await adicionarItem(form)
                setDialogAdicionar(false)
              }}
              onCancelar={() => setItemSelecionado(null)}
              loading={salvando}
            />
          ) : (
            <PainelBuscaItem orgaoId={orgaoId} onSelect={setItemSelecionado} />
          )}
        </DialogContent>
      </Dialog>

      {/* ══ Editar item ══════════════════════════════════════════════════════ */}
      <Dialog open={!!itemEditando} onOpenChange={(open) => { if (!open) setItemEditando(null) }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar item</DialogTitle>
            <DialogDescription>Ajuste a classe, a quantidade, o valor estimado, o prazo ou a prioridade.</DialogDescription>
          </DialogHeader>
          {itemEditando && (
            <FormItemDemanda
              key={itemEditando.id}
              item={itemParaSelecionado(itemEditando)}
              editando
              inicial={{
                quantidade_estimada: String(Number(itemEditando.quantidade_estimada) || 1),
                unidade_medida: itemEditando.unidade_medida || 'UN',
                valor_unitario_estimado: itemEditando.valor_unitario_estimado != null ? String(Number(itemEditando.valor_unitario_estimado)) : '',
                trimestre_previsto: itemEditando.trimestre_previsto ? String(itemEditando.trimestre_previsto) : trimestreInicialDoItem(demanda.data_desejada_contratacao),
                prioridade: String(itemEditando.prioridade || 3),
                renovacao_contrato: !!itemEditando.renovacao_contrato,
                codigo_classe: itemEditando.codigo_classe,
                nome_classe: itemEditando.nome_classe,
              }}
              onConfirm={salvarEdicaoItem}
              onCancelar={() => setItemEditando(null)}
              loading={salvando}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* ══ Iniciar contratação a partir da demanda ══════════════════════════ */}
      <Dialog open={modalIniciar} onOpenChange={setModalIniciar}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-lg max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Iniciar contratação</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600 -mt-1">
            O processo nasce de um <b>DFD de 1 demanda</b> (unidade de planejamento) e vem pré-preenchido: itens,
            quantidades, valores estimados e o DFD do processo. Havendo pedidos parecidos de outros setores, prefira
            juntar tudo num <b>DFD consolidado</b> (art. 12, VII). Valor total estimado:{' '}
            <b>{fmtMoeda(totalDemanda)}</b>.
          </p>
          <div className="space-y-2">
            <p className="text-sm font-semibold">Modalidade da contratação</p>
            {[
              { valor: 'DISPENSA_ELETRONICA', nome: 'Dispensa Eletrônica', desc: 'Art. 75 — contratação direta com disputa; aviso publicado automaticamente no PNCP' },
              { valor: 'PREGAO_ELETRONICO', nome: 'Pregão Eletrônico', desc: 'Art. 28, I — modalidade padrão para bens e serviços comuns' },
              { valor: 'INEXIGIBILIDADE', nome: 'Inexigibilidade', desc: 'Art. 74 — inviabilidade de competição (fornecedor exclusivo, credenciamento…)' },
              { valor: 'CONCORRENCIA', nome: 'Concorrência', desc: 'Art. 28, II — obras e serviços especiais' },
            ].map((m) => (
              <button
                key={m.valor}
                type="button"
                onClick={() => setModalidadeEscolhida(m.valor)}
                className={`w-full text-left border rounded-md px-3 py-2 hover:bg-gray-50 ${modalidadeEscolhida === m.valor ? 'border-blue-600 bg-blue-50' : ''}`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{m.nome}</span>
                  {modalidadeEscolhida === m.valor && <CheckCircle className="h-4 w-4 text-blue-600" aria-hidden="true" />}
                </div>
                <p className="text-xs text-gray-600">{m.desc}</p>
              </button>
            ))}
            {limiteDispensa != null && (
              <p className="text-xs text-gray-600">
                Sugestão automática pelo limite vigente da dispensa ({fmtMoeda(limiteDispensa)} — art. 75, II).
                A escolha é sua: nem toda demanda vira dispensa.
              </p>
            )}
          </div>

          <OpcoesModoFaseInterna valor={modoFaseInterna} onChange={setModoFaseInterna} modalidade={modalidadeEscolhida} compacto />

          {/* Modo co-work: o copiloto prepara o processo inteiro */}
          {modoFaseInterna !== 'FORA' && (
            <label className="flex items-start gap-2.5 rounded-lg border border-[#c5d4eb] bg-[#f6f9fd] p-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#1351b4]"
                checked={prepararAutomatico}
                onChange={(e) => setPrepararAutomatico(e.target.checked)}
              />
              <span className="text-xs leading-relaxed">
                <span className="font-semibold text-[#1351b4]">Preparar tudo automaticamente (copiloto)</span>
                <br />
                <span className="text-gray-600">
                  O sistema pesquisa preços em fontes reais (PNCP/Painel de Preços) e redige os rascunhos do
                  ETP, TR e autorização — você só revisa e aprova. Nada é publicado sem a sua validação.
                </span>
              </span>
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2 flex-wrap">
            <Button variant="outline" onClick={() => setModalIniciar(false)} disabled={iniciando}>Cancelar</Button>
            <Button onClick={iniciarContratacao} disabled={iniciando || !modalidadeEscolhida || !modoFaseInterna} className="bg-green-600 hover:bg-green-700">
              {iniciando ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              {modoFaseInterna === 'FORA' ? 'Continuar: dados, itens e PDFs →' : 'Criar processo e abrir cockpit'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
