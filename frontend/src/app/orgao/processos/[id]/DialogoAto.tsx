"use client"

import { useEffect, useState } from "react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"

/**
 * Dispensa deserta/fracassada — IN SEGES 67/2021, art. 22: providência que o
 * órgão adotará (fracassada: I, II ou III; deserta: só I ou III). O backend
 * exige e registra no histórico.
 */
const PROVIDENCIAS_ART22: Record<string, string> = {
  REPUBLICAR: "I — republicar o procedimento",
  PRAZO_ADEQUACAO: "II — prazo para adequação da proposta ou da habilitação",
  PROPOSTA_PESQUISA_PRECOS: "III — contratar pela proposta da pesquisa de preços (menor preço, com a habilitação exigida)",
}
const providenciasDoAto = (ato: string) =>
  ato === "DECLARAR_DESERTA" ? ["REPUBLICAR", "PROPOSTA_PESQUISA_PRECOS"] : Object.keys(PROVIDENCIAS_ART22)

/**
 * DIÁLOGO DE UM ATO NOMEADO (E1) — aberto pelo menu "Mais ações": suspender,
 * retomar, declarar deserta/fracassada. Pede o motivo (obrigatório quando o
 * ato exige) e, na dispensa, a providência do art. 22 da IN 67; quem valida é
 * o backend (POST /licitacoes/:id/atos/:ato), que devolve as pendências.
 */
export function DialogoAto({
  licitacaoId,
  ato,
  modalidade,
  onFechar,
  onAtualizado,
}: {
  licitacaoId: string
  ato: { ato: string; rotulo: string; requer_motivo: boolean } | null
  modalidade?: string
  onFechar: () => void
  onAtualizado: () => void
}) {
  const [motivo, setMotivo] = useState("")
  const [providencia, setProvidencia] = useState("")
  const [executando, setExecutando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    setMotivo("")
    setProvidencia("")
    setErro(null)
  }, [ato])

  const pedeProvidencia =
    modalidade === "DISPENSA_ELETRONICA" && !!ato && ["DECLARAR_DESERTA", "DECLARAR_FRACASSADA"].includes(ato.ato)

  const executar = async () => {
    if (!ato) return
    if (pedeProvidencia && !providencia) {
      setErro("Escolha a providência do art. 22 da IN SEGES 67/2021 — ela fica registrada no histórico.")
      return
    }
    if (ato.requer_motivo && !motivo.trim()) {
      setErro("Informe o motivo — ele fica registrado no histórico do processo.")
      return
    }
    setExecutando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}/atos/${ato.ato}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(motivo.trim() ? { motivo: motivo.trim() } : {}),
          ...(pedeProvidencia ? { dados: { providencia_art22: providencia } } : {}),
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        const pend: string[] = Array.isArray(j?.pendencias) ? j.pendencias : []
        throw new Error(pend.length > 1 ? pend.join(" · ") : j?.message || `HTTP ${res.status}`)
      }
      onFechar()
      onAtualizado()
    } catch (e: any) {
      setErro(e.message || "Falha ao executar o ato")
    } finally {
      setExecutando(false)
    }
  }

  return (
    <Dialog open={!!ato} onOpenChange={(v) => !v && !executando && onFechar()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{ato?.rotulo}</DialogTitle>
          <DialogDescription>O ato fica registrado no histórico do processo (quem, quando e o motivo).</DialogDescription>
        </DialogHeader>
        {ato?.requer_motivo && (
          <div className="space-y-1">
            <label htmlFor="motivo-ato" className="text-sm font-medium">Motivo / fundamentação (obrigatório)</label>
            <Textarea id="motivo-ato" value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={4} />
          </div>
        )}
        {pedeProvidencia && ato && (
          <div className="space-y-1">
            <label htmlFor="providencia-ato" className="text-sm font-medium">Providência (IN SEGES 67/2021, art. 22)</label>
            <select
              id="providencia-ato"
              className="w-full border rounded px-2 py-1.5 text-sm bg-white"
              value={providencia}
              onChange={(e) => setProvidencia(e.target.value)}
            >
              <option value="">Selecione…</option>
              {providenciasDoAto(ato.ato).map((p) => (
                <option key={p} value={p}>{PROVIDENCIAS_ART22[p]}</option>
              ))}
            </select>
          </div>
        )}
        {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onFechar} disabled={executando}>Cancelar</Button>
          <Button onClick={executar} disabled={executando}>
            {executando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
