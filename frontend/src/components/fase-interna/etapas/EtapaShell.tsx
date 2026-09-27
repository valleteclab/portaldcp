"use client"

/**
 * MOLDURA DAS TELAS POR ETAPA (Entrega 3A — mockups DFD/ETP/Pesquisa/Reserva):
 * "← Voltar ao processo", identificação do processo e a barra das 8 etapas
 * (1 Demanda › 2 ETP › … › 8 Publicação; o controle interno só quando o
 * órgão o ativou) com a situação vinda de
 * GET /api/fase-interna/:id/etapas. As etapas com tela própria viram link;
 * as demais levam ao quadro "Fluxo da fase interna" do processo.
 * Homologação: o "Voltar" da etapa (reabrir com motivo; dependentes "a
 * revisar") fica aqui mesmo, no topo da tela, para quem conduz o processo ou
 * responde pela etapa — não só no quadro do processo.
 */
import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { ArrowLeft, CheckCircle2, ChevronRight, Circle, CircleDashed, Clock, Loader2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { dependentesAfetados, type PassoFluxo } from "@/lib/fase-interna/visao-fluxo"
import { API_URL, authFetch } from "@/lib/api"
import { avisarTarefasAtualizadas } from "@/lib/tarefas"
import { ETAPAS_DA_BARRA, aoAtualizarFaseInterna, avisarFaseInternaAtualizada, criarUltimaCarga, erroDaApi, rotaDaTela, type TelaEtapa } from "@/lib/fase-interna/telas"
import { AvisoSomenteLeitura, PERMISSAO_LIVRE, PermissaoEtapaContext, permissaoDoPasso, type PermissaoTrabalho, type PermissoesTrabalho } from "@/lib/fase-interna/permissao-etapa"

interface LicitacaoCabecalho {
  id: string
  numero_processo?: string
  objeto?: string
  modalidade?: string
  fase?: string
}

interface EtapasResposta {
  etapas: Array<{ etapa: string; situacao: string; passos: Array<PassoFluxo & { pode_reabrir?: boolean }> }>
  /** Isolamento das peças: quem está vendo pode trabalhar em cada etapa? */
  permissoes_trabalho?: PermissoesTrabalho
}

const ROTULO_SIT: Record<string, string> = {
  CONCLUIDO: "concluída",
  EM_ANDAMENTO: "em andamento",
  DISPONIVEL: "a fazer",
  AGUARDANDO: "aguardando",
  NAO_REALIZADO: "não realizada",
  CANCELADO: "cancelada",
}

function Icone({ s }: { s: string | null }) {
  const cls = "w-3.5 h-3.5 shrink-0"
  if (s === "CONCLUIDO") return <CheckCircle2 className={`${cls} text-green-700`} aria-hidden="true" />
  if (s === "EM_ANDAMENTO") return <Clock className={`${cls} text-blue-700`} aria-hidden="true" />
  if (s === "DISPONIVEL") return <Circle className={`${cls} text-blue-700`} aria-hidden="true" />
  return <CircleDashed className={`${cls} text-slate-400`} aria-hidden="true" />
}

export function EtapaShell({
  licitacaoId,
  tela,
  titulo,
  subtitulo,
  acoes,
  atualizacao,
  onPermissao,
  children,
}: {
  licitacaoId: string
  tela: TelaEtapa
  titulo: string
  subtitulo?: React.ReactNode
  acoes?: React.ReactNode
  /** Muda quando a tela grava algo: recarrega a situação das etapas. */
  atualizacao?: unknown
  /**
   * Isolamento das peças: a página recebe a permissão de quem está vendo
   * nesta etapa (as ações de escrita dela ficam desabilitadas sem ela). Os
   * componentes dentro da moldura leem pelo contexto (`usePermissaoEtapa`).
   */
  onPermissao?: (p: PermissaoTrabalho) => void
  children: React.ReactNode
}) {
  const [lic, setLic] = useState<LicitacaoCabecalho | null>(null)
  const [situacoes, setSituacoes] = useState<Record<string, string>>({})
  const [passos, setPassos] = useState<Array<PassoFluxo & { pode_reabrir?: boolean }>>([])
  const [voltando, setVoltando] = useState(false)
  const { pedirTexto, dialogo } = useDialogoConfirmacao()
  const [permissao, setPermissao] = useState<PermissaoTrabalho>(PERMISSAO_LIVRE)
  const ultima = useRef(criarUltimaCarga())
  const passoDaTela = ETAPAS_DA_BARRA.find((e) => e.tela === tela)?.passo ?? null

  useEffect(() => {
    authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`)
      .then(async (r) => (r.ok ? setLic(await r.json()) : null))
      .catch(() => null)
  }, [licitacaoId])

  const carregarEtapas = useCallback(async () => {
    const vigente = ultima.current()
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/etapas`, { cache: "no-store" })
      if (!r.ok) return
      const j = (await r.json()) as EtapasResposta
      if (!vigente()) return // uma carga mais nova já está valendo
      const mapa: Record<string, string> = {}
      for (const e of j.etapas || []) for (const p of e.passos || []) mapa[p.passo] = p.situacao
      setSituacoes(mapa)
      setPassos((j.etapas || []).flatMap((e) => e.passos || []))
      setPermissao(permissaoDoPasso(j.permissoes_trabalho, passoDaTela))
      avisarTarefasAtualizadas()
    } catch {
      /* barra sem situação */
    }
  }, [licitacaoId, passoDaTela])
  useEffect(() => {
    carregarEtapas()
  }, [carregarEtapas, atualizacao])
  useEffect(() => {
    onPermissao?.(permissao)
  }, [permissao, onPermissao])
  // A tela gravou algo (atualizacao mudou): avisa os demais quadros da página (peças, fluxo)
  const primeira = useRef(true)
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false
      return
    }
    avisarFaseInternaAtualizada(licitacaoId)
  }, [atualizacao, licitacaoId])
  // Mudança vinda de outro quadro, ou volta à aba: recarrega a barra
  useEffect(() => aoAtualizarFaseInterna(licitacaoId, carregarEtapas), [licitacaoId, carregarEtapas])

  // VOLTAR ESTA ETAPA (reabrir com motivo) — o servidor diz quem pode (pode_reabrir) e confere de novo
  const passoDaTela = ETAPAS_DA_BARRA.find((e) => e.tela === tela)?.passo ?? null
  const esta = passoDaTela ? passos.find((p) => p.passo === passoDaTela) ?? null : null
  const voltar = async () => {
    if (!esta) return
    const afetadas = dependentesAfetados(esta.passo, passos)
    const motivo = await pedirTexto({
      titulo: `Voltar a etapa "${esta.titulo}"`,
      mensagem: [
        "A etapa volta para ajuste. Nenhuma peça é apagada.",
        afetadas.length
          ? `As etapas que dependem dela e já estavam concluídas ficam "a revisar": ${afetadas.map((x) => x.titulo).join(", ")}.`
          : "Nenhuma etapa concluída depende dela.",
        "Enquanto houver etapa reaberta ou a revisar, a trava da lei segura a publicação.",
      ].join("\n\n"),
      rotulo: "Motivo (vai para o histórico do processo)",
      obrigatorio: true,
      minimo: 10,
      confirmarRotulo: "Voltar a etapa",
      destrutivo: true,
    })
    if (motivo === null) return
    setVoltando(true)
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/etapas/${esta.passo}/reabrir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo }),
      })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success(`Etapa "${esta.titulo}" reaberta.${afetadas.length ? ` A revisar: ${afetadas.map((x) => x.titulo).join(", ")}.` : ""}`)
      await carregarEtapas()
      avisarFaseInternaAtualizada(licitacaoId)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setVoltando(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-0 sm:px-2 py-4 space-y-4">
      {dialogo}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link href={`/orgao/processos/${licitacaoId}`} className="inline-flex items-center gap-1.5 text-sm text-blue-800 hover:underline">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Voltar ao processo
        </Link>
        {lic?.numero_processo && (
          <span className="text-xs text-gray-600 truncate max-w-full">
            Processo {lic.numero_processo}
            {lic.objeto ? ` · ${lic.objeto.length > 90 ? `${lic.objeto.slice(0, 87)}…` : lic.objeto}` : ""}
          </span>
        )}
      </div>

      <nav aria-label="Etapas da fase interna" className="relative overflow-x-auto -mx-1 px-1">
        <ol className="flex items-center gap-1 min-w-max text-xs">
          {ETAPAS_DA_BARRA.filter((e) => !e.opcional || situacoes[e.passo] !== undefined || e.tela === tela).map((e, i, lista) => {
            const sit = situacoes[e.passo] ?? null
            const atual = e.tela === tela
            const conteudo = (
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                  atual ? "border-blue-700 bg-blue-50 text-blue-900 font-semibold" : "border-slate-200 bg-white text-slate-700"
                }`}
                title={sit ? ROTULO_SIT[sit] ?? sit : "sem peça nesta etapa"}
              >
                <Icone s={sit} />
                <span className="font-mono text-[10px] text-slate-500">{e.numero}</span>
                {e.titulo}
              </span>
            )
            return (
              <li key={e.passo} className="flex items-center gap-1">
                {e.tela ? (
                  <Link href={rotaDaTela(licitacaoId, e.tela)} aria-current={atual ? "page" : undefined}>
                    {conteudo}
                  </Link>
                ) : (
                  <Link href={`/orgao/processos/${licitacaoId}#fluxo-fase-interna`}>{conteudo}</Link>
                )}
                {i < lista.length - 1 && <ChevronRight className="w-3 h-3 text-slate-400" aria-hidden="true" />}
              </li>
            )
          })}
        </ol>
      </nav>

      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-gray-900">{titulo}</h1>
          {subtitulo && <div className="text-sm text-gray-600 mt-0.5">{subtitulo}</div>}
        </div>
        {(acoes || esta?.pode_reabrir) && (
          <div className="flex items-center gap-2 flex-wrap">
            {acoes}
            {esta?.pode_reabrir && (
              <Button
                variant="outline"
                className="text-amber-900 border-amber-300 hover:bg-amber-50"
                onClick={voltar}
                disabled={voltando}
                title="Reabre esta etapa com motivo; as que dependem dela e já estavam concluídas ficam a revisar"
              >
                {voltando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" aria-hidden="true" /> : <Undo2 className="w-4 h-4 mr-1" aria-hidden="true" />} Voltar esta etapa
              </Button>
            )}
          </div>
        )}
      </header>
      {esta?.situacao === "A_REVISAR" && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950" role="status">
          Esta etapa está <b>a revisar</b>
          {esta.a_revisar?.motivo ? `: ${esta.a_revisar.motivo}` : ""}. Confira a peça — alterá-la (ou confirmar no quadro do processo) encerra a revisão.
        </p>
      )}

      <AvisoSomenteLeitura permissao={permissao} />

      <PermissaoEtapaContext.Provider value={permissao}>{children}</PermissaoEtapaContext.Provider>
    </div>
  )
}
