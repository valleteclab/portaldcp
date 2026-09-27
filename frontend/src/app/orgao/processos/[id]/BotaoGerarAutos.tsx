"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { FileText, Loader2 } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"

type Situacao =
  | { situacao: "PRONTO"; folhas: number; gerado_em: string }
  | { situacao: "GERANDO"; iniciado_em: string }
  | { situacao: "DESATUALIZADO" | "NAO_GERADO"; anterior: { gerado_em: string; folhas: number } | null; erro?: string | null }

/**
 * "GERAR AUTOS (PDF)" (fase interna, Entrega 6; mockup Main e Conformidade):
 * pede a montagem (POST /licitacoes/:id/processo-pdf/gerar — fila única, em
 * segundo plano; o backend avisa por notificação quando fica pronta),
 * acompanha a situação e baixa o PDF (capa, termo de abertura com a autuação,
 * índice e os documentos na ORDEM CRONOLÓGICA DE JUNTADA, cada um na folha que
 * a tela mostra, com o carimbo "Fl. 000123"). Nada mudou nas juntadas → o
 * mesmo PDF sai do cache na hora.
 */
export function BotaoGerarAutos({ licitacaoId, numeroProcesso, variante = "outline" }: { licitacaoId: string; numeroProcesso?: string | null; variante?: "outline" | "default" }) {
  const [estado, setEstado] = useState<"ocioso" | "gerando" | "baixando">("ocioso")
  const vivo = useRef(true)
  useEffect(() => {
    vivo.current = true
    return () => {
      vivo.current = false
    }
  }, [])

  const situacao = async (): Promise<Situacao> => {
    const r = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/processo-pdf/situacao`)
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }

  const baixar = async (folhas?: number) => {
    setEstado("baixando")
    const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/processo-pdf`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const url = URL.createObjectURL(await res.blob())
    const a = document.createElement("a")
    a.href = url
    a.download = `autos-${numeroProcesso?.replace(/\W+/g, "-") || licitacaoId}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    toast.success(`Autos baixados${folhas ? ` — ${folhas} folhas numeradas` : ""}.`)
  }

  const gerar = async () => {
    setEstado("gerando")
    try {
      const r = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/processo-pdf/gerar`, { method: "POST" })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      let s: Situacao = await r.json()
      const limite = Date.now() + 120_000
      while (s.situacao === "GERANDO" && Date.now() < limite && vivo.current) {
        await new Promise((ok) => setTimeout(ok, 1500))
        s = await situacao()
      }
      if (!vivo.current) return
      if (s.situacao === "PRONTO") {
        await baixar(s.folhas)
      } else if (s.situacao === "GERANDO") {
        toast.info("Os autos ainda estão sendo montados. Você será avisado nas notificações quando ficarem prontos.")
      } else {
        throw new Error(s.erro || "não foi possível montar os autos")
      }
    } catch (e) {
      toast.error(`Autos em PDF: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      if (vivo.current) setEstado("ocioso")
    }
  }

  return (
    <Button variant={variante} onClick={gerar} disabled={estado !== "ocioso"} aria-live="polite">
      {estado === "ocioso" ? <FileText className="w-4 h-4 mr-2" aria-hidden="true" /> : <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />}
      {estado === "gerando" ? "Montando os autos…" : estado === "baixando" ? "Baixando…" : "Gerar autos (PDF)"}
    </Button>
  )
}
