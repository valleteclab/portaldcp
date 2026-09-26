"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DocumentosExternos,
  ResultadoDaJuntada,
  errosLocaisDocumentos,
  estadoDocumentosVazio,
  montarEnvioDocumentos,
  type ErroExterno,
  type EstadoDocumentosExternos,
  type ResultadoJuntada,
} from "./DocumentosExternos"

/**
 * "JUNTAR DOCUMENTOS FEITOS FORA (VÁRIOS PDFs)" — no processo já criado (quem
 * começou guiado e decidiu anexar o resto, ou a retomada das pendências da
 * criação "feita fora"). O mesmo passo "Documentos" do fluxo curto:
 * POST /api/fase-interna/:id/externa/documentos.
 */
export function JuntarDocumentosDialog({
  licitacaoId,
  aberto,
  onFechar,
  onJuntado,
}: {
  licitacaoId: string
  aberto: boolean
  onFechar: () => void
  onJuntado: () => void
}) {
  const [docs, setDocs] = useState<EstadoDocumentosExternos>(estadoDocumentosVazio())
  const [erros, setErros] = useState<ErroExterno[]>([])
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoJuntada | null>(null)
  const [opcoes, setOpcoes] = useState<Array<{ tipo: string; rotulo: string }>>([])

  const fechar = () => {
    setDocs(estadoDocumentosVazio())
    setErros([])
    setResultado(null)
    onFechar()
  }
  const errosLocais = errosLocaisDocumentos(docs, opcoes)
  const vazio = !docs.arquivos.length && !Object.keys(docs.naoSeAplica).length && !docs.usarPortaria

  const enviar = async (estado: EstadoDocumentosExternos) => {
    setEnviando(true)
    setErros([])
    try {
      const envio = montarEnvioDocumentos(estado)
      const fd = new FormData()
      fd.append("classificacao", JSON.stringify(envio.classificacao))
      envio.arquivos.forEach((f) => fd.append("arquivos", f, f.name))
      const r = await authFetch(`${API_URL}/api/fase-interna/${licitacaoId}/externa/documentos`, { method: "POST", body: fd })
      const j = await r.json().catch(() => null)
      if (!r.ok) {
        setErros(Array.isArray(j?.erros) ? j.erros : [{ passo: "DOCUMENTOS", mensagem: j?.message || `HTTP ${r.status}` }])
        toast.error("Nada foi juntado — corrija o que está indicado.")
        return
      }
      const res = j as ResultadoJuntada
      onJuntado()
      if (!res.pendencias.length) {
        toast.success(`${res.juntadas.length} peça(s) juntada(s)${res.nao_se_aplica.length ? `, ${res.nao_se_aplica.length} "não se aplica"` : ""}.`)
        fechar()
        return
      }
      // Fica só o que não entrou, para "tentar de novo"
      const indices = new Set(res.pendencias.map((p) => p.indice).filter((i): i is number => i !== null))
      const tipos = new Set(res.pendencias.map((p) => p.tipo))
      setDocs({
        arquivos: estado.arquivos.filter((_, i) => indices.has(i)),
        naoSeAplica: Object.fromEntries(Object.entries(estado.naoSeAplica).filter(([t]) => tipos.has(t))),
        usarPortaria: estado.usarPortaria && tipos.has("DP"),
      })
      setResultado(res)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => { if (!v) fechar() }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Juntar documentos feitos fora (vários PDFs)</DialogTitle>
          <DialogDescription>
            Envie os PDFs das peças feitas fora do sistema e diga qual peça é cada um. Peça que o processo já tem ganha versão nova (a anterior fica no histórico).
          </DialogDescription>
        </DialogHeader>
        {resultado ? (
          <ResultadoDaJuntada resultado={resultado} onTentarDeNovo={() => enviar(docs)} tentando={enviando} />
        ) : (
          <DocumentosExternos
            licitacaoId={licitacaoId}
            valor={docs}
            onChange={(v) => { setDocs(v); setErros([]) }}
            errosServidor={erros}
            onQuadro={(q) => setOpcoes(q?.opcoes ?? [])}
          />
        )}
        {!resultado && (
          <DialogFooter className="items-center gap-2">
            {errosLocais.length > 0 && !vazio && <span className="text-xs text-gray-700 mr-auto">{errosLocais[0]}</span>}
            <Button variant="outline" onClick={fechar} disabled={enviando}>Cancelar</Button>
            <Button onClick={() => enviar(docs)} disabled={enviando || vazio || errosLocais.length > 0} className="bg-[#1351b4] hover:bg-[#0c326f]">
              {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              Juntar ao processo
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
