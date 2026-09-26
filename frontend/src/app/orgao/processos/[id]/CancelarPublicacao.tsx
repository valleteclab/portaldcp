"use client"

/**
 * Cancelar a publicação (ato CANCELAR_PUBLICACAO) — só o órgão dono, com
 * motivo, antes de haver propostas (depois disso é revogar/anular). A compra
 * sai do PNCP (se já publicada) ou da fila (se ainda não enviada) e o processo
 * volta à fase interna (aprovação interna) para correção e nova publicação.
 * POST /api/licitacoes/:id/cancelar-publicacao.
 */
import { useState } from "react"
import { toast } from "sonner"
import { Loader2, Undo2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { API_URL, authFetch } from "@/lib/api"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"

export const FASES_CANCELAR_PUBLICACAO = ["PUBLICADO", "IMPUGNACAO", "ACOLHIMENTO_PROPOSTAS"]

export function CancelarPublicacao({ licitacaoId, semItens, onAtualizado }: {
  licitacaoId: string
  /** Publicado sem itens válidos: o cartão ganha destaque (caso a corrigir) */
  semItens?: boolean
  onAtualizado: () => void
}) {
  const { pedirTexto, dialogo } = useDialogoConfirmacao()
  const [enviando, setEnviando] = useState(false)

  const cancelar = async () => {
    const motivo = await pedirTexto({
      titulo: "Cancelar a publicação",
      mensagem:
        "A compra sai do PNCP (ou da fila, se ainda não foi enviada) e o processo volta à fase interna (aprovação interna) " +
        "para correção e nova publicação. Só é possível antes de haver propostas. O motivo fica nos autos.",
      rotulo: "Motivo",
      obrigatorio: true,
      confirmarRotulo: "Cancelar publicação",
      destrutivo: true,
    })
    if (!motivo) return
    if (motivo.trim().length < 10) {
      toast.error("Descreva o motivo com pelo menos 10 caracteres")
      return
    }
    setEnviando(true)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/cancelar-publicacao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: motivo.trim() }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) {
        const pend = Array.isArray(j?.pendencias) && j.pendencias.length ? ` — ${j.pendencias.join("; ")}` : ""
        throw new Error((j?.message || `HTTP ${res.status}`) + pend)
      }
      toast.success(j?.mensagem || "Publicação cancelada — o processo voltou à fase interna")
      onAtualizado()
    } catch (e: any) {
      toast.error(`Não foi possível cancelar a publicação: ${e.message}`)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Card className={semItens ? "border-red-300 bg-red-50/40" : undefined}>
      {dialogo}
      <CardContent className="py-3 flex items-center justify-between gap-3 flex-wrap text-sm">
        <span className="text-gray-700">
          {semItens
            ? "Publicado sem itens: cancele a publicação, cadastre os itens na fase interna e publique de novo."
            : "Sem propostas recebidas: a publicação ainda pode ser cancelada (volta à fase interna para correção)."}
        </span>
        <Button variant="outline" className="text-red-700 border-red-300" onClick={cancelar} disabled={enviando}>
          {enviando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Undo2 className="w-4 h-4 mr-2" />}
          Cancelar publicação
        </Button>
      </CardContent>
    </Card>
  )
}
