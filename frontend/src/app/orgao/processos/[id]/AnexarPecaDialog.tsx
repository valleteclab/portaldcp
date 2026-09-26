"use client"

import { useState } from "react"
import { toast } from "sonner"
import { API_URL, authFetch } from "@/lib/api"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Loader2, Plus, Trash2 } from "lucide-react"

/** Hoje em Brasília (AAAA-MM-DD) — a data da peça não pode ser futura. */
const hojeBrasilia = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10)

/**
 * "ANEXAR PDF" — peça feita fora do sistema (decisão 1 do dono: setores
 * manuais continuam existindo). Envia o PDF com o número da peça, a DATA DO
 * DOCUMENTO (a que consta na peça — o sistema guarda também a do envio), quem
 * assinou e uma observação. Substituir uma peça já anexada cria nova versão;
 * a anterior fica no histórico. POST /api/fase-interna/:id/documentos/:tipo/anexo.
 */
export function AnexarPecaDialog({
  licitacaoId,
  peca,
  onFechar,
  onAnexado,
}: {
  licitacaoId: string
  peca: { tipo: string; titulo: string; jaTem: boolean } | null
  onFechar: () => void
  onAnexado: () => void
}) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [numero, setNumero] = useState("")
  const [data, setData] = useState("")
  const [observacao, setObservacao] = useState("")
  const [signatarios, setSignatarios] = useState<Array<{ nome: string; cargo: string }>>([{ nome: "", cargo: "" }])
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const limpar = () => {
    setArquivo(null); setNumero(""); setData(""); setObservacao(""); setSignatarios([{ nome: "", cargo: "" }]); setErro(null)
  }

  const enviar = async () => {
    if (!peca) return
    if (!arquivo) return setErro("Selecione o arquivo PDF da peça.")
    if (!data) return setErro("Informe a data do documento (a data que consta na peça).")
    if (data > hojeBrasilia()) return setErro("A data do documento não pode ser futura.")
    setEnviando(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append("arquivo", arquivo)
      fd.append("data_documento", data)
      fd.append("numero_peca", numero.trim())
      fd.append("observacao", observacao.trim())
      fd.append("signatarios", JSON.stringify(signatarios.filter((s) => s.nome.trim())))
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
          <div className="space-y-1">
            <Label htmlFor="anexo-arquivo">Arquivo (PDF) *</Label>
            <Input id="anexo-arquivo" type="file" accept="application/pdf,.pdf" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="anexo-numero">Número da peça</Label>
              <Input id="anexo-numero" placeholder="Ex.: Parecer 167/2025" value={numero} onChange={(e) => setNumero(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="anexo-data">Data do documento *</Label>
              <Input id="anexo-data" type="date" max={hojeBrasilia()} value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Quem assinou</Label>
            {signatarios.map((s, i) => (
              <div key={i} className="flex gap-2">
                <Input placeholder="Nome" value={s.nome} aria-label={`Nome do signatário ${i + 1}`}
                  onChange={(e) => setSignatarios((l) => l.map((x, j) => (j === i ? { ...x, nome: e.target.value } : x)))} />
                <Input placeholder="Cargo (ex.: Procurador)" value={s.cargo} aria-label={`Cargo do signatário ${i + 1}`}
                  onChange={(e) => setSignatarios((l) => l.map((x, j) => (j === i ? { ...x, cargo: e.target.value } : x)))} />
                {signatarios.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label="Remover signatário"
                    onClick={() => setSignatarios((l) => l.filter((_, j) => j !== i))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setSignatarios((l) => [...l, { nome: "", cargo: "" }])}>
              <Plus className="w-3.5 h-3.5 mr-1" /> Signatário
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="anexo-obs">Observação</Label>
            <Textarea id="anexo-obs" rows={2} value={observacao} onChange={(e) => setObservacao(e.target.value)} />
          </div>
          {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { limpar(); onFechar() }} disabled={enviando}>Cancelar</Button>
          <Button onClick={enviar} disabled={enviando}>
            {enviando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Anexar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
