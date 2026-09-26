"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { CheckCircle2, Circle, Loader2 } from "lucide-react"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"

interface Instrucao {
  contratacao_direta: boolean
  itens: Array<{
    tipo: string; titulo: string; obrigatorio: boolean; fundamento: string; status: string; justificativa?: string
    exige_aprovacao?: boolean
    aprovacao?: { etapa: number; total: number; etapa_nome: string; responsavel: string | null }
  }>
  pode_divulgar: boolean
  pendentes: string[]
}

/**
 * INSTRUÇÃO DO PROCESSO (art. 72 — contratação direta): peça a peça, com
 * "não se aplica" justificado para as "se for o caso" e o copiloto que
 * prepara os rascunhos. Fonte: GET /api/fase-interna/:id/instrucao.
 */
export function InstrucaoArt72({
  licitacaoId,
  mostrarCopiloto,
  atualizacao,
  onAtualizado,
}: {
  licitacaoId: string
  mostrarCopiloto: boolean
  atualizacao?: unknown
  onAtualizado: () => void
}) {
  const { confirmar, pedirTexto, dialogo } = useDialogoConfirmacao()
  const [instrucao, setInstrucao] = useState<Instrucao | null>(null)
  const [carregandoTipo, setCarregandoTipo] = useState<string | null>(null)
  const [disparando, setDisparando] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/instrucao`)
      if (r.ok) setInstrucao(await r.json())
    } catch { /* quadro fica oculto */ }
  }, [licitacaoId])
  useEffect(() => { carregar() }, [carregar, atualizacao])

  const naoSeAplica = async (tipo: string, titulo: string, desfazer: boolean) => {
    let corpo: Record<string, unknown> = { desfazer: true }
    if (!desfazer) {
      const j = await pedirTexto({
        titulo: `"${titulo}" não se aplica`,
        mensagem: "Marcar esta peça como NÃO SE APLICA a esta contratação? A justificativa fica registrada nos autos (art. 72).",
        rotulo: "Justificativa",
        obrigatorio: true,
        confirmarRotulo: "Marcar não se aplica",
      })
      if (!j) return
      let usuario: any = {}
      try { usuario = JSON.parse(localStorage.getItem("usuario") || "{}") } catch { /* segue sem autor */ }
      corpo = { justificativa: j.trim(), usuarioId: usuario?.id, usuarioNome: usuario?.nome }
    }
    setCarregandoTipo(tipo)
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/instrucao/${tipo}/nao-se-aplica`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      })
      const jj = await res.json().catch(() => null)
      if (!res.ok) throw new Error(jj?.message || `HTTP ${res.status}`)
      setInstrucao(jj)
      onAtualizado()
    } catch (e: any) {
      toast.error(`Erro: ${e.message}`)
    } finally {
      setCarregandoTipo(null)
    }
  }

  const copiloto = async () => {
    if (!(await confirmar({
      titulo: "Preparar o processo automaticamente?",
      mensagem:
        "O copiloto pesquisa preços em fontes reais (PNCP/Painel de Preços) e redige os rascunhos do ETP, TR e autorização. " +
        "Tudo fica marcado como SUGERIDO para você revisar — nada é publicado sem a sua validação.",
      confirmarRotulo: "Preparar",
    }))) return
    setDisparando(true)
    try {
      const res = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/preparar-automatico`, { method: "POST" })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      onAtualizado()
    } catch (e: any) {
      toast.error(`Erro ao iniciar o copiloto: ${e.message}`)
    } finally {
      setDisparando(false)
    }
  }

  if (!instrucao?.contratacao_direta) return null

  return (
    <div className="border rounded-md p-3 bg-slate-50 space-y-2">
      {dialogo}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Peças da instrução (art. 72)</h3>
        {mostrarCopiloto && !instrucao.pode_divulgar && (
          <Button size="sm" variant="outline" onClick={copiloto} disabled={disparando}>
            {disparando && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />}
            Preparar automaticamente (copiloto)
          </Button>
        )}
      </div>
      <ul className="space-y-1">
        {instrucao.itens.map((it) => (
          <li key={it.tipo} className="flex items-center justify-between gap-2 text-xs bg-white border rounded px-2 py-1.5">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              {it.status === "OK" ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-green-700 shrink-0" aria-label="Pronto" />
              ) : it.status === "NAO_SE_APLICA" ? (
                <span className="text-gray-600 shrink-0" aria-label="Não se aplica">∅</span>
              ) : (
                <Circle className={`w-3.5 h-3.5 shrink-0 ${it.obrigatorio ? "text-amber-600" : "text-gray-400"}`} aria-label={it.status === "EM_APROVACAO" ? "Em aprovação" : "Pendente"} />
              )}
              <span className={it.status === "NAO_SE_APLICA" ? "line-through text-gray-600" : ""}>{it.titulo}</span>
              <span className="text-gray-600">({it.fundamento})</span>
              {it.status === "EM_APROVACAO" && (
                <span className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                  em aprovação{it.aprovacao ? ` — ${it.aprovacao.etapa_nome} (${it.aprovacao.etapa}/${it.aprovacao.total})${it.aprovacao.responsavel ? ` · ${it.aprovacao.responsavel}` : ""}` : ""}
                </span>
              )}
              {it.status === "EM_ELABORACAO" && it.exige_aprovacao && (
                <span className="text-[11px] text-gray-700 bg-gray-50 border border-gray-200 rounded px-1.5 py-0.5">aguarda envio p/ aprovação</span>
              )}
              {it.obrigatorio && <Badge variant="outline" className="text-[10px] px-1 py-0 border-amber-400 text-amber-900">obrigatório</Badge>}
              {it.status === "NAO_SE_APLICA" && it.justificativa && <span className="text-gray-600">— {it.justificativa}</span>}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {it.status !== "NAO_SE_APLICA" && it.status !== "OK" && !it.obrigatorio && (
                <button type="button" className="text-[11px] text-gray-700 hover:underline disabled:opacity-50" disabled={carregandoTipo === it.tipo}
                  onClick={() => naoSeAplica(it.tipo, it.titulo, false)}>
                  não se aplica
                </button>
              )}
              {it.status === "NAO_SE_APLICA" && (
                <button type="button" className="text-[11px] text-gray-700 hover:underline disabled:opacity-50" disabled={carregandoTipo === it.tipo}
                  onClick={() => naoSeAplica(it.tipo, it.titulo, true)}>
                  desfazer
                </button>
              )}
              <Link href={`/orgao/fase-interna/processos/${licitacaoId}`} className="text-[11px] text-blue-800 hover:underline">abrir</Link>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-gray-600">
        Mínimo para divulgar: DFD, estimativa de despesa e autorização. Os demais são &quot;se for o caso&quot; — marque &quot;não se aplica&quot;
        com justificativa (fica registrada nos autos).
      </p>
    </div>
  )
}
