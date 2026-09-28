"use client"

import { useState } from "react"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Loader2 } from "lucide-react"
import { CamposMetadadosPeca, erroDaData, metadadosVazios, type MetadadosPeca } from "./CamposMetadadosPeca"
import { usePermissaoEtapa } from "@/lib/fase-interna/permissao-etapa"

/**
 * "ANEXAR PDF" — peça feita fora do sistema (decisão 1 do dono: setores
 * manuais continuam existindo). Envia o PDF com o número da peça, a DATA DO
 * DOCUMENTO (a que consta na peça — o sistema guarda também a do envio), quem
 * assinou e uma observação. Substituir uma peça já anexada cria nova versão;
 * a anterior fica no histórico. POST /api/fase-interna/:id/documentos/:tipo/anexo.
 * Os campos da peça são os mesmos da juntada em lote (CamposMetadadosPeca).
 */
export function AnexarPecaDialog({
  licitacaoId,
  peca,
  onFechar,
  onAnexado,
  bloqueio,
}: {
  licitacaoId: string
  peca: { tipo: string; titulo: string; jaTem: boolean } | null
  onFechar: () => void
  onAnexado: () => void
  /** Motivo por que quem está vendo não pode anexar (isolamento das peças); sem ele, o da etapa da tela. */
  bloqueio?: string | null
}) {
  const permissao = usePermissaoEtapa()
  const motivoBloqueio = bloqueio ?? (permissao.pode ? null : permissao.motivo ?? "Você não pode alterar as peças desta etapa agora.")
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [meta, setMeta] = useState<MetadadosPeca>(metadadosVazios())
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const limpar = () => {
    setArquivo(null); setMeta(metadadosVazios()); setErro(null)
  }

  const enviar = async () => {
    if (!peca) return
    if (!arquivo) return setErro("Selecione o arquivo PDF da peça.")
    const erroData = erroDaData(meta.data)
    if (erroData) return setErro(erroData)
    setEnviando(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append("arquivo", arquivo)
      fd.append("data_documento", meta.data)
      fd.append("numero_peca", meta.numero.trim())
      fd.append("observacao", meta.observacao.trim())
      fd.append("signatarios", JSON.stringify(meta.signatarios.filter((s) => s.nome.trim())))
      const res = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/documentos/${peca.tipo}/anexo`, { method: "POST", body: fd })
      const j = await res.json().catch(() => null)
      if (!res.ok) throw new Error(j?.message || `HTTP ${res.status}`)
      toast.success(`${peca.titulo}: PDF anexado (versão ${j?.versao ?? 1}${j?.folha_inicial ? `, fls. ${j.folha_inicial}–${j.folha_final}` : ""})`)
      limpar()
      onAnexado()
    } catch (e) {
      setErro((e instanceof Error ? e.message : String(e)) || "Erro ao anexar a peça")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={!!peca} onOpenChange={(v) => { if (!v) { limpar(); onFechar() } }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Anexar PDF — {peca?.titulo}</DialogTitle>
          <DialogDescription>
            Peça feita fora do sistema. Ela conta no checklist como pronta.
            {peca?.jaTem ? " A versão atual será substituída (continua no histórico)." : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {motivoBloqueio && (
            <p className="text-sm rounded border border-slate-300 bg-slate-50 px-2 py-1.5 text-slate-800" role="alert">
              Somente leitura: {motivoBloqueio}
            </p>
          )}
          <div className="space-y-1">
            <Label htmlFor="anexo-arquivo">Arquivo (PDF) *</Label>
            <Input id="anexo-arquivo" type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </div>
          <CamposMetadadosPeca idBase="anexo" valor={meta} onChange={setMeta} />
          {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { limpar(); onFechar() }} disabled={enviando}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando || !!motivoBloqueio}>
            {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Anexar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
