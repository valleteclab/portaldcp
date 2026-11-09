"use client"

/**
 * JUSTIFICATIVA DA CONTRATAÇÃO NA LICITAÇÃO (art. 18, IX) — peça da etapa do
 * TR (decisão do dono, 09/11/2026). Gera pelo modelo (completado com o que o
 * ETP e o TR já dizem), edita por seções ou anexa o PDF feito fora. A etapa
 * do TR no fluxo da licitação só conclui com ela pronta.
 */
import { useCallback, useEffect, useState } from "react"
import dynamic from "next/dynamic"
import { toast } from "sonner"
import { FileText, Loader2 } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { CaminhosDaPeca } from "@/components/fase-interna/etapas/CaminhosDaPeca"
import { erroDaApi, vigenteEBaseDoEditor } from "@/lib/fase-interna/telas"
import { aguardarSalvamentosDaPeca } from "@/lib/salvamentos-pendentes"

const DocumentoSeccionado = dynamic(() => import("@/components/editor/DocumentoSeccionado").then((m) => ({ default: m.DocumentoSeccionado })), {
  ssr: false,
  loading: () => (
    <div className="flex justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin text-gray-500" aria-label="Carregando o editor" />
    </div>
  ),
})

export function JustificativaDaLicitacao({
  licitacaoId,
  licitacao,
  somenteLeitura,
  atualizacao,
  onAtualizado,
}: {
  licitacaoId: string
  licitacao: any
  somenteLeitura: boolean
  atualizacao: unknown
  onAtualizado: () => void
}) {
  const [documento, setDocumento] = useState<any>(undefined)
  const [vigente, setVigente] = useState<any>(null)
  const [chave, setChave] = useState(0)
  const [gerando, setGerando] = useState(false)

  const carregar = useCallback(async () => {
    const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos/JC`).catch(() => null)
    const lista = r && r.ok ? await r.json() : []
    const vb = vigenteEBaseDoEditor(Array.isArray(lista) ? lista : [])
    setVigente(vb.vigente)
    setDocumento(vb.base)
    setChave((n) => n + 1)
  }, [licitacaoId])
  useEffect(() => {
    carregar()
  }, [carregar, atualizacao])

  const anexada = !!vigente && vigente.origem !== "INTERNO"

  const gerar = async () => {
    setGerando(true)
    try {
      await aguardarSalvamentosDaPeca(licitacaoId, "JC")
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/tr/justificativa/gerar`, { method: "POST" })
      if (!r.ok) throw new Error(await erroDaApi(r))
      toast.success("Justificativa gerada pelo modelo, com o que o ETP e o TR já dizem. Revise as seções.")
      await carregar()
      onAtualizado()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setGerando(false)
    }
  }

  return (
    <section aria-label="Justificativa da contratação" className="space-y-3 pt-2">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Justificativa da contratação</h2>
          <p className="text-xs text-gray-600">
            Art. 18, IX: motivação das condições do edital — modalidade e critério, habilitação, parcelamento e ME/EPP. Faz parte desta etapa: o TR só conclui com ela pronta.
          </p>
        </div>
        <Button onClick={gerar} disabled={gerando || somenteLeitura || anexada} title={anexada ? "A justificativa vigente é um PDF anexado" : "Gera pelo modelo, completado com o ETP e o TR"}>
          {gerando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} Gerar justificativa
        </Button>
      </div>
      <CaminhosDaPeca
        licitacaoId={licitacaoId}
        tipo="JC"
        titulo="Justificativa da contratação"
        fazerAqui="gerar pelo modelo e revisar as seções"
        atualizacao={atualizacao}
        onAtualizado={() => {
          carregar()
          onAtualizado()
        }}
        compacto
      />
      {documento !== undefined && (
        <div className="rounded-lg border bg-white overflow-hidden h-[60vh] min-h-[420px]">
          <DocumentoSeccionado key={chave} licitacaoId={licitacaoId} tipo="JC" documento={documento} licitacao={licitacao} ocultarPdf somenteLeitura={somenteLeitura || anexada} />
        </div>
      )}
    </section>
  )
}
