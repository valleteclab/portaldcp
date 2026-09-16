"use client"

import { useEffect, useState } from "react"
import { ArrowRightLeft, Handshake, Trash2, Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { listarSetores, solicitarTransferencia, baixarBem, emprestarBem } from "@/services/patrimonio.service"

export const MOTIVOS_BAIXA = [
  { v: "INSERVIVEL", l: "Inservível (sem condição de uso)" },
  { v: "ALIENACAO", l: "Alienação (venda/leilão)" },
  { v: "DOACAO", l: "Doação" },
  { v: "FURTO_EXTRAVIO", l: "Furto ou extravio" },
  { v: "OUTRO", l: "Outro" },
]

type BemMin = { id: string; plaqueta?: string | null; descricao: string }

/**
 * Diálogo de transferência (um ou vários bens). Se `aceiteImediato` vier
 * marcado, a comissão aplica na hora; senão gera link de aceite para o destino.
 */
export function TransferenciaDialog({
  bens, open, onClose, onDone, setorDestinoId, motivoInicial, inventarioId, aceiteImediatoInicial,
}: {
  bens: BemMin[]; open: boolean; onClose: () => void; onDone: () => void
  setorDestinoId?: string; motivoInicial?: string; inventarioId?: string; aceiteImediatoInicial?: boolean
}) {
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([])
  const [form, setForm] = useState({ setor_destino_id: setorDestinoId || "", responsavel_destino_nome: "", responsavel_destino_telefone: "", motivo: motivoInicial || "", aceite_imediato: !!aceiteImediatoInicial })
  const [salvando, setSalvando] = useState(false)
  const [resultado, setResultado] = useState<{ link: string | null; enviado: boolean; aplicada: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    listarSetores().then(setSetores).catch(() => setSetores([]))
    setForm({ setor_destino_id: setorDestinoId || "", responsavel_destino_nome: "", responsavel_destino_telefone: "", motivo: motivoInicial || "", aceite_imediato: !!aceiteImediatoInicial })
    setResultado(null)
  }, [open, setorDestinoId, motivoInicial, aceiteImediatoInicial])

  const salvar = async () => {
    if (!form.setor_destino_id) { toast.error("Escolha o setor de destino"); return }
    setSalvando(true)
    try {
      const r = await solicitarTransferencia({
        bem_ids: bens.map((b) => b.id),
        setor_destino_id: form.setor_destino_id,
        responsavel_destino_nome: form.responsavel_destino_nome || undefined,
        responsavel_destino_telefone: form.responsavel_destino_telefone || undefined,
        motivo: form.motivo || undefined,
        aceite_imediato: form.aceite_imediato,
        inventario_id: inventarioId,
      })
      if (r.aplicada) { toast.success("Transferência aplicada"); onDone(); onClose(); return }
      setResultado(r)
      toast.success(r.enviado ? "Link de aceite enviado por WhatsApp" : "Transferência criada, aguardando aceite")
      onDone()
    } catch (e: any) { toast.error(e.message) } finally { setSalvando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ArrowRightLeft className="h-5 w-5" />Transferir {bens.length === 1 ? "bem" : `${bens.length} bens`}</DialogTitle>
          <DialogDescription>
            {bens.length === 1 ? `${bens[0].plaqueta || "—"} · ${bens[0].descricao}` : bens.map((b) => b.plaqueta || "—").join(", ")}
          </DialogDescription>
        </DialogHeader>
        {resultado ? (
          <div className="space-y-3 text-sm">
            <p>{resultado.enviado ? "O responsável do destino recebeu o link por WhatsApp." : "Envie o link abaixo ao responsável do setor de destino para ele aceitar:"}</p>
            {resultado.link && (
              <div className="flex gap-2">
                <Input readOnly value={resultado.link} className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(resultado.link!); toast.success("Link copiado") }}><Copy className="h-4 w-4" /></Button>
              </div>
            )}
            <DialogFooter><Button onClick={onClose}>Fechar</Button></DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <div>
                <Label>Setor de destino *</Label>
                <Select value={form.setor_destino_id} onValueChange={(v) => setForm({ ...form, setor_destino_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>{setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Responsável no destino</Label><Input value={form.responsavel_destino_nome} onChange={(e) => setForm({ ...form, responsavel_destino_nome: e.target.value })} /></div>
                <div><Label>WhatsApp (para o aceite)</Label><Input value={form.responsavel_destino_telefone} onChange={(e) => setForm({ ...form, responsavel_destino_telefone: e.target.value })} placeholder="77 9 9999-9999" /></div>
              </div>
              <div><Label>Motivo</Label><Textarea rows={2} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></div>
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox checked={form.aceite_imediato} onCheckedChange={(v) => setForm({ ...form, aceite_imediato: !!v })} className="mt-0.5" />
                <span>Aplicar agora, sem aceite do destino <span className="text-muted-foreground">(uso da comissão; fica registrado quem aplicou)</span></span>
              </label>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button onClick={salvar} disabled={salvando}>{salvando ? "Salvando..." : form.aceite_imediato ? "Transferir agora" : "Solicitar aceite"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function BaixaDialog({ bem, open, onClose, onDone, inventarioId, motivoInicial }: { bem: BemMin | null; open: boolean; onClose: () => void; onDone: () => void; inventarioId?: string; motivoInicial?: string }) {
  const [form, setForm] = useState({ motivo_baixa: "INSERVIVEL", motivo: motivoInicial || "", data_baixa: new Date().toISOString().slice(0, 10), documento_url: "" })
  const [salvando, setSalvando] = useState(false)
  useEffect(() => { if (open) setForm({ motivo_baixa: inventarioId ? "FURTO_EXTRAVIO" : "INSERVIVEL", motivo: motivoInicial || "", data_baixa: new Date().toISOString().slice(0, 10), documento_url: "" }) }, [open, motivoInicial, inventarioId])

  const salvar = async () => {
    if (!bem) return
    if (form.motivo.trim().length < 5) { toast.error("Descreva o motivo da baixa"); return }
    setSalvando(true)
    try {
      await baixarBem({ bem_id: bem.id, motivo_baixa: form.motivo_baixa, motivo: form.motivo, data_baixa: form.data_baixa, documento_url: form.documento_url || undefined, inventario_id: inventarioId })
      toast.success("Baixa registrada")
      onDone(); onClose()
    } catch (e: any) { toast.error(e.message) } finally { setSalvando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-700"><Trash2 className="h-5 w-5" />Baixa de bem</DialogTitle>
          <DialogDescription>{bem ? `${bem.plaqueta || "—"} · ${bem.descricao}` : ""}. O bem sai do saldo do setor e fica no histórico.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Motivo *</Label>
            <Select value={form.motivo_baixa} onValueChange={(v) => setForm({ ...form, motivo_baixa: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{MOTIVOS_BAIXA.map((m) => <SelectItem key={m.v} value={m.v}>{m.l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Justificativa *</Label><Textarea rows={3} value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} placeholder="Ex.: laudo técnico nº 12/2026, sem conserto viável" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Data da baixa</Label><Input type="date" value={form.data_baixa} onChange={(e) => setForm({ ...form, data_baixa: e.target.value })} /></div>
            <div><Label>Documento (nº ou link)</Label><Input value={form.documento_url} onChange={(e) => setForm({ ...form, documento_url: e.target.value })} placeholder="Processo, laudo, B.O." /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button variant="destructive" onClick={salvar} disabled={salvando}>{salvando ? "Registrando..." : "Registrar baixa"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function EmprestimoDialog({ bem, open, onClose, onDone }: { bem: BemMin | null; open: boolean; onClose: () => void; onDone: () => void }) {
  const em30 = new Date(); em30.setDate(em30.getDate() + 30)
  const [form, setForm] = useState({ destino_texto: "", responsavel_destino_nome: "", data_prevista_retorno: em30.toISOString().slice(0, 10), motivo: "" })
  const [salvando, setSalvando] = useState(false)

  const salvar = async () => {
    if (!bem) return
    setSalvando(true)
    try {
      await emprestarBem({ bem_id: bem.id, ...form, responsavel_destino_nome: form.responsavel_destino_nome || undefined, motivo: form.motivo || undefined })
      toast.success("Empréstimo registrado")
      onDone(); onClose()
    } catch (e: any) { toast.error(e.message) } finally { setSalvando(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Handshake className="h-5 w-5" />Empréstimo temporário</DialogTitle>
          <DialogDescription>{bem ? `${bem.plaqueta || "—"} · ${bem.descricao}` : ""}. O bem continua no setor de origem; o sistema avisa se não voltar na data.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div><Label>Para quem / onde *</Label><Input value={form.destino_texto} onChange={(e) => setForm({ ...form, destino_texto: e.target.value })} placeholder="Ex.: Plenário — sessão solene; Escola Municipal X" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>Responsável</Label><Input value={form.responsavel_destino_nome} onChange={(e) => setForm({ ...form, responsavel_destino_nome: e.target.value })} /></div>
            <div><Label>Retorno previsto *</Label><Input type="date" value={form.data_prevista_retorno} onChange={(e) => setForm({ ...form, data_prevista_retorno: e.target.value })} /></div>
          </div>
          <div><Label>Observação</Label><Input value={form.motivo} onChange={(e) => setForm({ ...form, motivo: e.target.value })} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || form.destino_texto.trim().length < 3}>{salvando ? "Salvando..." : "Registrar empréstimo"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Botões Transferir / Emprestar / Baixar para a página do bem. */
export function BemAcoes({ bem, onDone }: { bem: BemMin & { status?: string; emprestado_ate?: string | null }; onDone: () => void }) {
  const [transf, setTransf] = useState(false)
  const [baixa, setBaixa] = useState(false)
  const [emp, setEmp] = useState(false)
  const baixado = bem.status === "BAIXADO"
  return (
    <>
      <Button variant="outline" onClick={() => setTransf(true)} disabled={baixado || !!bem.emprestado_ate}><ArrowRightLeft className="h-4 w-4 mr-2" />Transferir</Button>
      <Button variant="outline" onClick={() => setEmp(true)} disabled={baixado || !!bem.emprestado_ate}><Handshake className="h-4 w-4 mr-2" />Emprestar</Button>
      <Button variant="outline" className="text-red-700" onClick={() => setBaixa(true)} disabled={baixado}><Trash2 className="h-4 w-4 mr-2" />Baixar</Button>
      <TransferenciaDialog bens={[bem]} open={transf} onClose={() => setTransf(false)} onDone={onDone} />
      <BaixaDialog bem={bem} open={baixa} onClose={() => setBaixa(false)} onDone={onDone} />
      <EmprestimoDialog bem={bem} open={emp} onClose={() => setEmp(false)} onDone={onDone} />
    </>
  )
}
