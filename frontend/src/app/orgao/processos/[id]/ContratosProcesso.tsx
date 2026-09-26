"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { fmtBrasilia } from "@/lib/publicacao"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { useDialogoConfirmacao } from "@/components/licitacao/useDialogoConfirmacao"
import { fmtMoeda, type ProcessoCompleto } from "./tipos"

/**
 * CONTRATOS E ATAS do processo (depois da homologação): termo em PDF,
 * assinaturas eletrônicas (órgão + fornecedor) e publicação no PNCP
 * disparada ao concluir (art. 94 — condição de eficácia).
 */
export function ContratosProcesso({ dados, onAtualizado }: { dados: ProcessoCompleto; onAtualizado: () => void }) {
  const { confirmar, pedirTexto, dialogo } = useDialogoConfirmacao()
  const [assinando, setAssinando] = useState<string | null>(null)

  if (dados.contratos.length === 0 && dados.atas.length === 0) return null

  const solicitar = async (ct: ProcessoCompleto["contratos"][number]) => {
    let usuario: any = {}
    try { usuario = JSON.parse(localStorage.getItem("usuario") || "{}") } catch { /* segue */ }
    const nome = usuario?.nome || await pedirTexto({
      titulo: "Responsável pela assinatura",
      rotulo: "Nome do responsável do órgão que assinará o contrato",
      obrigatorio: true,
      linhaUnica: true,
    })
    if (!nome) return
    if (!(await confirmar({
      titulo: `Termo de contrato ${ct.numero_contrato}`,
      mensagem:
        `Gerar o termo em PDF e solicitar as assinaturas eletrônicas?\n\nSignatários:\n• ${nome} (órgão — assina pelo Portal de Assinaturas)\n• ${ct.fornecedor_razao_social || "Fornecedor"} (recebe o link por e-mail)\n\n` +
        `Quando todos assinarem, a data de assinatura é registrada e o contrato é publicado automaticamente no PNCP (art. 94 — condição de eficácia).`,
      confirmarRotulo: "Gerar e solicitar",
    }))) return
    setAssinando(ct.id)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${ct.id}/solicitar-assinaturas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ usuario: { nome, cpf: usuario?.cpf, email: usuario?.email, telefone: usuario?.telefone } }),
      })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      toast.success(j?.ja_existente ? "Já existe uma solicitação de assinatura ativa para este contrato." : "Termo gerado e assinaturas solicitadas.")
      onAtualizado()
    } catch (e: any) {
      toast.error(`Erro ao solicitar assinaturas: ${e.message}`)
    } finally {
      setAssinando(null)
    }
  }

  const reenviar = async (documentoId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/portal-assinaturas/${documentoId}/reenviar`, { method: "POST" })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      toast.success(`Notificações reenviadas (${j?.enviados ?? "ok"}).`)
    } catch (e: any) {
      toast.error(`Erro ao reenviar: ${e.message}`)
    }
  }

  return (
    <section aria-labelledby="titulo-contratos" className="space-y-2">
      {dialogo}
      <h3 id="titulo-contratos" className="text-sm font-semibold">Contratos e atas</h3>
      {dados.contratos.map((ct) => {
        const concluido = ct.assinatura_status === "CONCLUIDO"
        const emAssinatura = !!ct.documento_assinatura_id && !concluido
        return (
          <div key={ct.id} className="border rounded-md px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Link href={`/orgao/contratos/${ct.id}`} className="text-sm font-medium hover:underline">
                Contrato {ct.numero_contrato} — {ct.fornecedor_razao_social}
              </Link>
              <span className="text-sm text-gray-700">{fmtMoeda(ct.valor_global)} · {ct.status}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {!ct.documento_assinatura_id && (
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={assinando === ct.id} onClick={() => solicitar(ct)}>
                  {assinando === ct.id && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Gerar termo e colher assinaturas
                </Button>
              )}
              {emAssinatura && (
                <>
                  <span className="text-amber-900 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                    Assinaturas: {ct.assinados ?? 0}/{ct.total_signatarios ?? 0}
                  </span>
                  {ct.signatarios_resumo && <span className="text-gray-700">{ct.signatarios_resumo}</span>}
                  {ct.arquivo_contrato && (
                    <a href={`${API_URL}/uploads/${ct.arquivo_contrato}`} target="_blank" rel="noopener noreferrer" className="text-blue-800 hover:underline">termo (PDF)</a>
                  )}
                  <Link href="/assinador/painel" className="text-blue-800 hover:underline">assinar/acompanhar</Link>
                  <button type="button" className="text-gray-700 hover:underline" onClick={() => reenviar(ct.documento_assinatura_id!)}>reenviar notificações</button>
                </>
              )}
              {concluido && (
                <>
                  <span className="text-green-900 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                    Assinado por todas as partes{ct.data_assinatura ? ` em ${fmtBrasilia(ct.data_assinatura, false)}` : ""}
                  </span>
                  {(ct.arquivo_assinado_url || ct.arquivo_contrato) && (
                    <a href={`${API_URL}/uploads/${ct.arquivo_assinado_url || ct.arquivo_contrato}`} target="_blank" rel="noopener noreferrer" className="text-blue-800 hover:underline">
                      termo assinado (PDF)
                    </a>
                  )}
                  <Link href={`/orgao/contratos/${ct.id}`} className="text-blue-800 hover:underline">medições e execução</Link>
                </>
              )}
            </div>
          </div>
        )
      })}
      {dados.atas.map((ata) => (
        <div key={ata.id} className="flex items-center justify-between border rounded-md px-3 py-2 bg-amber-50/50">
          <span className="text-sm font-medium">Ata {ata.numero_ata} — {ata.fornecedor_razao_social}</span>
          <span className="text-sm text-gray-700">{fmtMoeda(ata.valor_total)} · {ata.status}</span>
        </div>
      ))}
    </section>
  )
}
