"use client"

/**
 * TELA DO PROCESSO (órgão) — /orgao/processos/[id]. Layout único para todas
 * as modalidades (Etapa B do redesenho — docs/tela dispensa/):
 *  1. banner de falha/aguardo do PNCP;  2. cabeçalho + menu "Mais ações";
 *  3. cinco cartões de resumo;  4. barra de etapas (por modalidade);
 *  5. área da etapa atual + próxima etapa;  6. coluna lateral;  7. abas.
 * Regras e disponibilidade de atos vêm do backend (processo-completo,
 * conferencia-publicacao, divulgacao) — a tela só mostra.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Loader2 } from "lucide-react"
import { FASES_INTERNAS } from "@/lib/licitacao-rotulos"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { AbasProcesso, type AbaProcesso } from "./AbasProcesso"
import { AreaEtapaAtual } from "./AreaEtapaAtual"
import { BarraEtapas } from "./BarraEtapas"
import { CabecalhoProcesso } from "./CabecalhoProcesso"
import { useCancelarPublicacao } from "./CancelarPublicacao"
import { CartoesResumo } from "./CartoesResumo"
import { ColunaLateral } from "./ColunaLateral"
import { DialogoAto } from "./DialogoAto"
import { DivulgacaoBanner, useDivulgacao } from "./DivulgacaoBanner"
import { DivulgarAvisoDialog } from "./DivulgarAvisoDialog"
import { etapaAtualESeguinte, etapasDoProcesso } from "./etapas"
import { ExtincaoLicitacao, type TipoExtincao } from "./ExtincaoLicitacao"
import { useMensagensDispensa } from "./MensagensDispensa"
import { entradasDoMenu } from "./MenuAcoes"
import { ProximaEtapaCard } from "./ProximaEtapaCard"
import { ResultadoExternoDialog } from "./ResultadoExternoDialog"
import type { ConferenciaPrePublicacao, ProcessoCompleto } from "./tipos"

export default function ProcessoPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const { confirmar, dialogo } = useDialogoConfirmacao()

  const [dados, setDados] = useState<ProcessoCompleto | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setLoading(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}/processo-completo`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const j = (await res.json()) as ProcessoCompleto
      setDados(j)
    } catch (e: any) {
      setErro(e.message || "Erro ao carregar o processo")
    } finally {
      if (!silencioso) setLoading(false)
    }
  }, [id])

  useEffect(() => { if (id) carregar() }, [id, carregar])

  const fase = dados?.licitacao.fase
  const { divulgacao, recarregarDivulgacao } = useDivulgacao(id, fase)
  const atualizar = useCallback(() => {
    carregar(true)
    recarregarDivulgacao()
  }, [carregar, recarregarDivulgacao])

  // Copiloto (preparação automática): atualiza sozinho enquanto executa
  useEffect(() => {
    if (dados?.licitacao.preparacao_automatica?.status !== "EXECUTANDO") return
    const t = setInterval(() => carregar(true), 5000)
    return () => clearInterval(t)
  }, [dados?.licitacao.preparacao_automatica?.status, carregar])

  // Checklist de pré-publicação (backend) — na fase interna e enquanto aguarda o PNCP
  const [conferencia, setConferencia] = useState<ConferenciaPrePublicacao | null>(null)
  const precisaConferencia = !!fase && (FASES_INTERNAS.includes(fase) || fase === "AGUARDANDO_DIVULGACAO")
  useEffect(() => {
    if (!precisaConferencia) {
      setConferencia(null)
      return
    }
    authFetch(`${API_URL}/api/licitacoes/${id}/conferencia-publicacao`)
      .then(async (r) => (r.ok ? setConferencia(await r.json()) : null))
      .catch(() => null)
  }, [id, precisaConferencia, dados])

  // Mensagens da dispensa (regras por fase — IN 67); atualização automática durante os lances
  const dispensa = dados?.licitacao.modalidade === "DISPENSA_ELETRONICA"
  const lancesFim = dados?.licitacao.dispensa_lances_fim ? new Date(dados.licitacao.dispensa_lances_fim) : null
  const lancesAberta = !!lancesFim && new Date() < lancesFim
  const { mensagens, regras, recarregar: recarregarMensagens } = useMensagensDispensa(id, !!dispensa, lancesAberta ? 5000 : undefined, fase)

  // Diálogos e sinais do menu "Mais ações"
  const [aba, setAba] = useState<AbaProcesso>("historico")
  const [retificarSinal, setRetificarSinal] = useState(0)
  const [pedidoExtincao, setPedidoExtincao] = useState<{ tipo: TipoExtincao; nonce: number } | null>(null)
  const [atoDialogo, setAtoDialogo] = useState<{ ato: string; rotulo: string; requer_motivo: boolean } | null>(null)
  const [modalDivulgar, setModalDivulgar] = useState(false)
  const [modalResultado, setModalResultado] = useState(false)
  const cancelamento = useCancelarPublicacao(id, atualizar)

  const excluirProcesso = async () => {
    const ok = await confirmar({
      titulo: "Excluir processo",
      mensagem: "O processo e os documentos da fase interna serão excluídos definitivamente. Só é possível antes da publicação — depois, use Revogar ou Anular.",
      confirmarRotulo: "Excluir definitivamente",
      destrutivo: true,
    })
    if (!ok) return
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${id}`, { method: "DELETE" })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      toast.success("Processo excluído")
      router.push("/orgao/licitacoes")
    } catch (e: any) {
      toast.error(`Não foi possível excluir: ${e.message}`)
    }
  }

  const irPara = (ancora: string) => document.getElementById(ancora)?.scrollIntoView({ behavior: "smooth", block: "start" })

  const entradas = useMemo(() => {
    if (!dados) return []
    const e = entradasDoMenu(dados.acoes_menu, {
      resultadoRegistrado: dados.checklist.resultado_registrado,
      atosDisponiveis: dados.atos_disponiveis,
    })
    // Excluir: só na fase interna (o backend recusa depois da publicação)
    if (FASES_INTERNAS.includes(dados.licitacao.fase)) e.push({ chave: "EXCLUIR", rotulo: "Excluir processo…", disponivel: true, destrutiva: true })
    return e
  }, [dados])

  const aoEscolherAcao = (chave: string) => {
    const acao =
      dados?.acoes_menu?.find((a) => a.ato === chave) ??
      dados?.atos_disponiveis?.find((a) => a.ato === chave)
    switch (chave) {
      case "REVOGAR":
      case "ANULAR":
        setPedidoExtincao({ tipo: chave, nonce: Date.now() })
        break
      case "RETIFICAR_EDITAL":
        setAba("documentos")
        setRetificarSinal((n) => n + 1)
        break
      case "CANCELAR_PUBLICACAO":
        cancelamento.cancelar()
        break
      case "REGISTRAR_RESULTADO_EXTERNO":
        setModalResultado(true)
        break
      case "EXCLUIR":
        excluirProcesso()
        break
      default:
        if (acao) setAtoDialogo(acao)
    }
  }

  const etapas = useMemo(() => {
    if (!dados) return []
    const l = dados.licitacao
    return etapasDoProcesso({
      modalidade: l.modalidade,
      fase: l.fase,
      situacao: l.situacao,
      selecao_externa: l.selecao_externa,
      vinculado_pca: dados.checklist.vinculado_pca,
      documentos_fase_interna: dados.documentos.length,
      propostas: dados.propostas.filter((p) => !["RASCUNHO", "CANCELADA"].includes(p.status)).length,
      resultado_registrado: dados.checklist.resultado_registrado,
      homologado: dados.checklist.homologado,
      contratos: dados.contratos.length + dados.atas.length,
      dispensa_lances_fim: l.dispensa_lances_fim,
      divulgacao_com_erro: divulgacao?.banner?.tipo === "ERRO",
    })
  }, [dados, divulgacao])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-500" aria-label="Carregando o processo" />
      </div>
    )
  }
  if (erro || !dados) {
    return (
      <div className="max-w-3xl mx-auto p-8 text-center">
        <AlertTriangle className="w-10 h-10 mx-auto text-amber-600 mb-3" aria-hidden="true" />
        <p className="text-gray-800">{erro || "Processo não encontrado"}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>Voltar</Button>
      </div>
    )
  }

  const l = dados.licitacao
  // Na fase interna a área já mostra o checklist de publicação: a "próxima" é a etapa depois dela
  const { seguinte: s1 } = etapaAtualESeguinte(etapas)
  const seguinte = s1?.chave === "publicacao" ? etapas[etapas.indexOf(s1) + 1] ?? null : s1
  const pendenciasChecklist = (conferencia?.itens || []).filter((i) => i.bloqueia && i.estado === "PENDENTE")
  const acaoResultado = dados.acoes_menu?.find((a) => a.ato === "REGISTRAR_RESULTADO_EXTERNO")

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 space-y-5">
      {dialogo}
      {cancelamento.dialogo}

      {/* 1. Divulgação oficial (PNCP — arts. 54 e 174): aviso não publicado = prazo não iniciado */}
      {l.fase === "AGUARDANDO_DIVULGACAO" && (
        <DivulgacaoBanner
          licitacaoId={id}
          situacao={divulgacao}
          pendenciasChecklist={pendenciasChecklist}
          onVerDetalhes={() => {
            setAba("pncp")
            irPara("abas-processo")
          }}
          onCorrigir={() => irPara("area-etapa-atual")}
          onAtualizado={atualizar}
        />
      )}

      {/* 2. Cabeçalho + "Mais ações" */}
      <CabecalhoProcesso licitacao={l} entradasMenu={entradas} onAcao={aoEscolherAcao} />

      {/* 3. Resumo */}
      <CartoesResumo dados={dados} divulgacao={divulgacao} />

      {/* 4. Etapas (por modalidade) */}
      <BarraEtapas etapas={etapas} />

      {/* 5 e 6. Etapa atual + coluna lateral (empilha no celular) */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div id="area-etapa-atual" className="space-y-5 min-w-0 scroll-mt-4">
          {l.preparacao_automatica && <CopilotoStatus p={l.preparacao_automatica} />}
          <ExtincaoLicitacao licitacaoId={id} acoes={dados.acoes_menu} pedido={pedidoExtincao} onAtualizado={atualizar} />
          <AreaEtapaAtual
            dados={dados}
            conferencia={conferencia}
            divulgacao={divulgacao}
            mensagens={mensagens}
            regras={regras}
            onMensagem={recarregarMensagens}
            onDivulgarAviso={() => setModalDivulgar(true)}
            onCancelarPublicacao={cancelamento.cancelar}
            onRegistrarResultadoExterno={acaoResultado?.disponivel ? () => setModalResultado(true) : null}
            onAtualizado={atualizar}
          />
          <ProximaEtapaCard etapa={seguinte} dispensa={l.modalidade === "DISPENSA_ELETRONICA"} />
        </div>
        <aside aria-label="Dados, prazos e comunicação">
          <ColunaLateral dados={dados} mensagens={mensagens} regras={regras} />
        </aside>
      </div>

      {/* 7. Abas */}
      <AbasProcesso dados={dados} aba={aba} onAba={setAba} retificarSinal={retificarSinal} onAtualizado={atualizar} />

      <DialogoAto licitacaoId={id} ato={atoDialogo} modalidade={l.modalidade} onFechar={() => setAtoDialogo(null)} onAtualizado={atualizar} />
      <DivulgarAvisoDialog licitacaoId={id} fase={l.fase} aberto={modalDivulgar} onFechar={() => setModalDivulgar(false)} onAtualizado={atualizar} />
      <ResultadoExternoDialog licitacaoId={id} dados={dados} aberto={modalResultado} onFechar={() => setModalResultado(false)} onAtualizado={atualizar} />
    </div>
  )
}

function CopilotoStatus({ p }: { p: NonNullable<ProcessoCompleto["licitacao"]["preparacao_automatica"]> }) {
  const cor =
    p.status === "EXECUTANDO" ? "border-blue-200 bg-blue-50 text-blue-950" : p.status === "CONCLUIDA" ? "border-green-200 bg-green-50 text-green-950" : "border-red-200 bg-red-50 text-red-950"
  return (
    <div className={`rounded-md border p-3 text-sm ${cor}`} role="status">
      {p.status === "EXECUTANDO" && (
        <p className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Copiloto preparando o processo… {p.etapa || ""}
        </p>
      )}
      {p.status === "CONCLUIDA" && (
        <>
          <p className="font-medium">Processo preparado pelo copiloto — revise os itens sugeridos antes de aprovar.</p>
          {(p.log || []).length > 0 && (
            <ul className="mt-1 list-disc ml-5 text-xs">
              {(p.log || []).map((x, i) => <li key={i}>{x}</li>)}
            </ul>
          )}
        </>
      )}
      {p.status === "ERRO" && <p>A preparação automática falhou: {p.erro || "erro desconhecido"}. Tente de novo pelo quadro da instrução.</p>}
    </div>
  )
}
