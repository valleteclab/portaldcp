"use client"

import { useState, type ReactNode } from "react"
import Link from "next/link"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Check, X, AlertTriangle, Loader2 } from "lucide-react"
import { FilaPncp } from "./FilaPncp"
import type { ConferenciaPrePublicacao, ItemConferencia, ProcessoCompleto, SituacaoDivulgacao } from "./tipos"

function IconeEstado({ i }: { i: ItemConferencia }) {
  if (i.estado === "OK")
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-800">
        <Check className="w-3.5 h-3.5" aria-hidden="true" /><span className="sr-only">Pronto</span>
      </span>
    )
  if (i.estado === "ALERTA")
    return (
      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
        <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /><span className="sr-only">Alerta</span>
      </span>
    )
  return (
    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700">
      <X className="w-3.5 h-3.5" aria-hidden="true" /><span className="sr-only">Pendente</span>
    </span>
  )
}

/**
 * ETAPA ATUAL — PUBLICAÇÃO: checklist de pré-publicação (as pré-condições do
 * PUBLICAR, do backend: GET /licitacoes/:id/conferencia-publicacao), com a
 * ação de cada pendência, a tabela "Envios ao PNCP" e o botão principal
 * (divulgar o aviso da dispensa ou reenviar ao PNCP), desabilitado com o
 * motivo escrito enquanto houver pendência.
 */
export function ChecklistPrePublicacao({
  licitacaoId,
  dados,
  conferencia,
  divulgacao,
  onDivulgarAviso,
  onCancelarPublicacao,
  onAtualizado,
}: {
  licitacaoId: string
  dados: ProcessoCompleto
  conferencia: ConferenciaPrePublicacao | null
  divulgacao: SituacaoDivulgacao | null
  onDivulgarAviso: () => void
  onCancelarPublicacao: () => void
  onAtualizado: () => void
}) {
  const l = dados.licitacao
  const aguardando = l.fase === "AGUARDANDO_DIVULGACAO"
  const dispensa = l.modalidade === "DISPENSA_ELETRONICA"
  const [reenviando, setReenviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const acaoDaLinha = (i: ItemConferencia) => {
    const botao = "inline-flex items-center rounded-md border border-blue-600 px-3 py-1 text-sm font-medium text-blue-800 hover:bg-blue-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    switch (i.acao) {
      case "ABRIR_FASE_INTERNA":
        return <Link href={`/orgao/fase-interna/processos/${licitacaoId}`} className={botao}>Abrir fase interna</Link>
      case "CADASTRAR_ITENS":
        return <Link href={`/orgao/processos/${licitacaoId}/editar?aba=itens`} className={botao}>Cadastrar itens</Link>
      case "VINCULAR_PCA":
        return <Link href={`/orgao/processos/${licitacaoId}/editar?aba=classificacao`} className="text-sm text-blue-800 hover:underline">Vincular ou justificar</Link>
      case "CONFIGURAR_ME_EPP":
        return <a href="#cotas-me-epp" className={botao}>Resolver ME/EPP</a>
      case "ANEXAR_EDITAL":
        return <a href="#publicacao-edital" className={botao}>Anexar edital</a>
      case "GERAR_AVISO":
        return (
          <button type="button" className={botao} onClick={onDivulgarAviso}>
            Gerar aviso
          </button>
        )
      case "CANCELAR_PUBLICACAO":
        return (
          <button type="button" className={botao} onClick={onCancelarPublicacao}>
            Cancelar publicação para corrigir
          </button>
        )
      default:
        return null
    }
  }

  const bloqueantes = (conferencia?.itens || []).filter((i) => i.bloqueia && i.estado === "PENDENTE")
  // O aviso é gerado dentro da janela de divulgação: não impede abri-la
  const bloqueantesDivulgar = bloqueantes.filter((i) => i.chave !== "AVISO")

  const reenviar = async () => {
    const id = divulgacao?.banner?.reenviar_id
    if (!id) return
    setReenviando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/pncp/fila/${id}/reenviar`, { method: "POST" })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setErro(j?.message || `HTTP ${res.status}`)
      }
    } finally {
      setReenviando(false)
      onAtualizado()
    }
  }

  let principal: ReactNode = null
  let motivoPrincipal: string | null = null
  if (aguardando && divulgacao?.integrado_pncp !== false) {
    const podeReenviar = !!divulgacao?.banner?.pode_reenviar
    const n = bloqueantes.length
    motivoPrincipal = n
      ? `Resolva ${n === 1 ? "a pendência" : `as ${n} pendências`} do checklist antes de reenviar.`
      : !podeReenviar
        ? "O envio já está em andamento ou foi aceito — aguarde a resposta do PNCP."
        : null
    principal = (
      <Button onClick={reenviar} disabled={reenviando || n > 0 || !podeReenviar} aria-describedby={motivoPrincipal ? "motivo-principal" : undefined}>
        {reenviando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Reenviar ao PNCP{n ? ` (${n} ${n === 1 ? "pendência" : "pendências"})` : ""}
      </Button>
    )
  } else if (!aguardando && dispensa && !l.selecao_externa) {
    const n = bloqueantesDivulgar.length
    motivoPrincipal = n ? `Resolva ${n === 1 ? "a pendência" : `as ${n} pendências`} do checklist para divulgar.` : null
    principal = (
      <Button onClick={onDivulgarAviso} disabled={n > 0} aria-describedby={motivoPrincipal ? "motivo-principal" : undefined}>
        Gerar aviso e divulgar{n ? ` (${n} ${n === 1 ? "pendência" : "pendências"})` : ""}
      </Button>
    )
  }

  return (
    <section aria-labelledby="titulo-etapa-publicacao" className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Etapa atual</p>
          <h2 id="titulo-etapa-publicacao" className="text-lg font-semibold">
            {dispensa ? "Publicação do aviso de dispensa" : "Publicação do edital"}
          </h2>
          <p className="text-sm text-gray-700">Checklist antes de publicar — o botão só libera quando não houver pendência.</p>
        </div>
        {principal && (
          <div className="text-right">
            {principal}
            {motivoPrincipal && <p id="motivo-principal" className="text-xs text-gray-700 mt-1 max-w-xs">{motivoPrincipal}</p>}
          </div>
        )}
      </div>

      {!conferencia ? (
        <Loader2 className="w-4 h-4 animate-spin text-gray-500" aria-label="Carregando checklist" />
      ) : (
        <ul className="divide-y border rounded-md">
          {conferencia.itens.map((i) => (
            <li key={i.chave} className={`flex items-start gap-3 px-3 py-2.5 ${i.estado === "PENDENTE" ? "bg-red-50/60" : ""}`}>
              <IconeEstado i={i} />
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${i.estado === "PENDENTE" ? "font-medium" : ""}`}>
                  {i.rotulo} <span className="text-xs text-gray-600">({i.fundamento})</span>
                </p>
                {i.detalhe && <p className="text-xs text-gray-700">{i.detalhe}</p>}
              </div>
              <div className="shrink-0">{acaoDaLinha(i)}</div>
            </li>
          ))}
        </ul>
      )}

      {aguardando && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Envios ao PNCP</h3>
          <FilaPncp licitacaoId={licitacaoId} linkPncp={l.link_pncp} atualizacao={dados} />
        </div>
      )}
      {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
    </section>
  )
}
