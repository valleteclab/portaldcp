"use client"

/**
 * "CONCLUIR ETAPA" NA PRÓPRIA TELA DO DOCUMENTO (mockup "Tela do ETP no
 * fluxo", aprovado em 12/10/2026): quando o processo segue um fluxo desenhado
 * e a etapa em andamento é a desta tela, quem pode agir conclui aqui mesmo —
 * sem voltar à tela do processo. Mesma chamada da tela do processo
 * (POST /workflows/execucoes/:instancia/tarefas/:tarefa/concluir); o servidor
 * confere as pendências (documento pronto pelo critério da instrução) e
 * devolve a lista, mostrada logo abaixo da barra.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { destinoAposConcluir, etapaDestaTela, proximaEtapa } from "@/lib/fluxo/concluir-etapa"
import type { Andamento } from "@/lib/fluxo/andamento"
import { avisarFaseInternaAtualizada } from "@/lib/fase-interna/telas"

export function ConcluirEtapaDoFluxo({
  licitacaoId,
  processoId,
  andamento,
  telaAtual,
  podeTrabalhar,
}: {
  licitacaoId: string
  processoId: string
  andamento: Andamento
  telaAtual: string
  /** Permissão de trabalho da etapa (posse/responsável): sem ela o botão não aparece. */
  podeTrabalhar: boolean
}) {
  const router = useRouter()
  const { pedirTexto, dialogo } = useDialogoConfirmacao()
  const [processando, setProcessando] = useState(false)
  const [pendencias, setPendencias] = useState<string[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const atual = etapaDestaTela(andamento, telaAtual)
  if (!atual || !podeTrabalhar) return null

  const i = andamento.nos.findIndex((n) => n.chave === atual.chave)
  const proxima = proximaEtapa(andamento, atual)
  const mudaDeMao = !!proxima?.responsavel && proxima.responsavel !== atual.responsavel
  const rotulo = mudaDeMao ? `Concluir e enviar a ${proxima!.responsavel}` : "Concluir etapa"
  const depois = !proxima
    ? "Esta é a última etapa do fluxo."
    : mudaDeMao
      ? `O processo segue para ${proxima.responsavel} (${proxima.titulo}), com despacho registrado nos autos.`
      : `A próxima etapa (${proxima.titulo}) também fica com você.`

  const concluir = async () => {
    const observacao = await pedirTexto({
      titulo: `Concluir "${atual.titulo}"?`,
      mensagem: depois,
      rotulo: "Observação para o histórico (opcional)",
      obrigatorio: false,
      confirmarRotulo: rotulo,
    })
    if (observacao === null) return
    setErro(null)
    setPendencias(null)
    setProcessando(true)
    try {
      const r = await authFetch(`${API_URL}/api/workflows/execucoes/${andamento.instancia_id}/tarefas/${atual.tarefa_id}/concluir`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resposta: observacao.trim() ? { observacao: observacao.trim() } : {} }),
      })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        const m = Array.isArray(j?.message) ? j.message.join("; ") : j?.message
        if (Array.isArray(j?.pendencias) && j.pendencias.length) setPendencias(j.pendencias)
        else setErro(m || "Não foi possível concluir a etapa.")
        return
      }
      toast.success(mudaDeMao ? `${atual.titulo} concluída. O processo foi enviado a ${proxima!.responsavel}.` : `${atual.titulo} concluída.`)
      avisarFaseInternaAtualizada(licitacaoId)
      router.push(destinoAposConcluir(andamento, atual, licitacaoId, processoId))
    } catch {
      setErro("Sem conexão com o servidor. Verifique sua internet e tente de novo.")
    } finally {
      setProcessando(false)
    }
  }

  return (
    <>
      {dialogo}
      <div className="flex items-center gap-2 shrink-0" data-guia="etapa-atual">
        <span className="hidden sm:inline text-xs text-slate-600">
          Etapa {i + 1} · {atual.titulo}
        </span>
        <button
          type="button"
          onClick={concluir}
          disabled={processando}
          title={depois}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#1351b4] px-4 text-sm font-semibold text-white hover:bg-[#0c3d8a] disabled:opacity-60"
        >
          {processando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          {processando ? "Concluindo..." : rotulo}
          {!processando ? <ArrowRight className="h-4 w-4" aria-hidden="true" /> : null}
        </button>
      </div>
      {pendencias?.length ? (
        <div role="alert" className="w-full rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <b>Falta para concluir esta etapa:</b>
          <ul className="mb-0 mt-1 list-disc pl-5">
            {pendencias.map((p, k) => (
              <li key={k}>{p}</li>
            ))}
          </ul>
        </div>
      ) : erro ? (
        <p role="alert" className="m-0 w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          {erro}
        </p>
      ) : null}
    </>
  )
}
