"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRightLeft, Copy, FileText, RotateCcw, Send, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  listarMovimentacoes, cancelarMovimentacao, devolverEmprestimo, reenviarLinkTransferencia,
  abrirPdf, urlTermoTransferencia, urlTermoBaixa, listarBens, listarSetores,
} from "@/services/patrimonio.service"
import { TransferenciaDialog } from "./BemAcoes"

const TIPO: Record<string, string> = { TRANSFERENCIA: "Transferência", BAIXA: "Baixa", EMPRESTIMO: "Empréstimo" }
const STATUS: Record<string, { l: string; c: string }> = {
  PENDENTE: { l: "Aguardando aceite", c: "bg-amber-100 text-amber-800" },
  ACEITA: { l: "Aceita", c: "bg-green-100 text-green-800" },
  RECUSADA: { l: "Recusada", c: "bg-red-100 text-red-800" },
  CANCELADA: { l: "Cancelada", c: "bg-gray-100 text-gray-800" },
  EM_ANDAMENTO: { l: "Em andamento", c: "bg-blue-100 text-blue-800" },
  CONCLUIDA: { l: "Concluída", c: "bg-green-100 text-green-800" },
}
const MOTIVO_BAIXA: Record<string, string> = { INSERVIVEL: "Inservível", ALIENACAO: "Alienação", DOACAO: "Doação", FURTO_EXTRAVIO: "Furto/extravio", OUTRO: "Outro" }

export default function MovimentacoesPage() {
  const [lista, setLista] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [tipo, setTipo] = useState("todos")
  const [status, setStatus] = useState("todos")
  const [lote, setLote] = useState(false)
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([])
  const [setorOrigem, setSetorOrigem] = useState("")
  const [bensOrigem, setBensOrigem] = useState<any[]>([])
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState("")
  const [abrirTransf, setAbrirTransf] = useState(false)

  const carregar = () => {
    setLoading(true)
    listarMovimentacoes({ tipo: tipo === "todos" ? undefined : tipo, status: status === "todos" ? undefined : status })
      .then(setLista).catch(console.error).finally(() => setLoading(false))
  }
  useEffect(carregar, [tipo, status]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrirLote = async () => {
    try { setSetores(await listarSetores()) } catch { setSetores([]) }
    setSetorOrigem(""); setBensOrigem([]); setSel(new Set())
    setLote(true)
  }
  useEffect(() => {
    if (!setorOrigem) { setBensOrigem([]); return }
    listarBens({ setor_id: setorOrigem, status: "ATIVO" }).then(setBensOrigem).catch(() => setBensOrigem([]))
  }, [setorOrigem])

  const acao = async (fn: () => Promise<any>, ok: string) => {
    try { await fn(); toast.success(ok); carregar() } catch (e: any) { toast.error(e.message) }
  }

  const bensSel = bensOrigem.filter((b) => sel.has(b.id))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orgao/patrimonio"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Movimentações de patrimônio</h1>
          <p className="text-muted-foreground">Transferências entre setores (com aceite), baixas e empréstimos</p>
        </div>
        <Button onClick={abrirLote}><ArrowRightLeft className="h-4 w-4 mr-2" />Transferir em lote</Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="TRANSFERENCIA">Transferências</SelectItem>
            <SelectItem value="BAIXA">Baixas</SelectItem>
            <SelectItem value="EMPRESTIMO">Empréstimos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v.l}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Bem</TableHead>
              <TableHead>De → Para</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Quem</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            : lista.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhuma movimentação.</TableCell></TableRow>
            : lista.map((m) => (
              <TableRow key={m.id}>
                <TableCell className="text-sm whitespace-nowrap">{new Date(m.created_at).toLocaleDateString("pt-BR")}</TableCell>
                <TableCell><Badge variant="outline">{TIPO[m.tipo]}</Badge>{m.motivo_baixa && <div className="text-xs text-muted-foreground">{MOTIVO_BAIXA[m.motivo_baixa]}</div>}</TableCell>
                <TableCell className="text-sm"><Link href={`/orgao/patrimonio/${m.bem?.id}`} className="hover:underline"><span className="font-mono">{m.bem?.plaqueta || "—"}</span> · {m.bem?.descricao}</Link></TableCell>
                <TableCell className="text-sm">
                  {m.tipo === "TRANSFERENCIA" && <>{m.setor_origem_nome || "sem setor"} → <strong>{m.setor_destino_nome}</strong></>}
                  {m.tipo === "EMPRESTIMO" && <>{m.setor_origem_nome || "—"} → {m.destino_texto}<div className="text-xs text-muted-foreground">retorno {m.data_prevista_retorno ? new Date(m.data_prevista_retorno + "T12:00:00").toLocaleDateString("pt-BR") : "—"}{m.data_retorno ? ` · devolvido ${new Date(m.data_retorno + "T12:00:00").toLocaleDateString("pt-BR")}` : ""}</div></>}
                  {m.tipo === "BAIXA" && <>{m.setor_origem_nome || "—"}<div className="text-xs text-muted-foreground">{m.motivo}</div></>}
                </TableCell>
                <TableCell><Badge className={STATUS[m.status]?.c}>{STATUS[m.status]?.l || m.status}</Badge>{m.recusa_motivo && <div className="text-xs text-red-700">{m.recusa_motivo}</div>}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{m.solicitado_por}{m.aceito_por && m.aceito_por !== m.solicitado_por ? <><br />aceite: {m.aceito_por}</> : null}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    {m.tipo === "TRANSFERENCIA" && m.status === "PENDENTE" && (
                      <>
                        {m.link_aceite && <Button size="sm" variant="outline" title="Copiar link de aceite" onClick={() => { navigator.clipboard.writeText(m.link_aceite); toast.success("Link copiado") }}><Copy className="h-3.5 w-3.5" /></Button>}
                        <Button size="sm" variant="outline" title="Reenviar por WhatsApp" onClick={() => acao(() => reenviarLinkTransferencia(m.lote_id), "Link reenviado")}><Send className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="outline" title="Cancelar" onClick={() => confirm("Cancelar esta transferência?") && acao(() => cancelarMovimentacao(m.id), "Transferência cancelada")}><XCircle className="h-3.5 w-3.5" /></Button>
                      </>
                    )}
                    {m.tipo === "TRANSFERENCIA" && m.status === "ACEITA" && <Button size="sm" variant="outline" title="Termo de transferência" onClick={() => abrirPdf(urlTermoTransferencia(m.lote_id)).catch((e) => toast.error(e.message))}><FileText className="h-3.5 w-3.5" /></Button>}
                    {m.tipo === "BAIXA" && <Button size="sm" variant="outline" title="Termo de baixa" onClick={() => abrirPdf(urlTermoBaixa(m.id)).catch((e) => toast.error(e.message))}><FileText className="h-3.5 w-3.5" /></Button>}
                    {m.tipo === "EMPRESTIMO" && m.status === "EM_ANDAMENTO" && <Button size="sm" variant="outline" title="Registrar devolução" onClick={() => acao(() => devolverEmprestimo(m.id), "Devolução registrada")}><RotateCcw className="h-3.5 w-3.5" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={lote} onOpenChange={setLote}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Transferir em lote</DialogTitle>
            <DialogDescription>Escolha o setor de origem, marque os bens e informe o destino.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-3 items-end">
            <div className="min-w-[240px]">
              <label className="text-sm font-medium">Setor de origem</label>
              <Select value={setorOrigem} onValueChange={setSetorOrigem}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>{setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Input placeholder="Filtrar" value={busca} onChange={(e) => setBusca(e.target.value)} className="max-w-xs" />
            <Button onClick={() => setAbrirTransf(true)} disabled={sel.size === 0}>Transferir {sel.size} selecionado(s)</Button>
          </div>
          <div className="border rounded-lg max-h-96 overflow-y-auto">
            <Table>
              <TableHeader><TableRow><TableHead className="w-10"><Checkbox checked={bensOrigem.length > 0 && sel.size === bensOrigem.length} onCheckedChange={(v) => setSel(v ? new Set(bensOrigem.map((b) => b.id)) : new Set())} /></TableHead><TableHead>Plaqueta</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead></TableRow></TableHeader>
              <TableBody>
                {bensOrigem.filter((b) => !busca || `${b.plaqueta} ${b.descricao}`.toLowerCase().includes(busca.toLowerCase())).map((b) => (
                  <TableRow key={b.id}>
                    <TableCell><Checkbox checked={sel.has(b.id)} onCheckedChange={(v) => { const n = new Set(sel); v ? n.add(b.id) : n.delete(b.id); setSel(n) }} /></TableCell>
                    <TableCell className="font-mono text-sm">{b.plaqueta}</TableCell>
                    <TableCell>{b.descricao}</TableCell>
                    <TableCell className="text-sm">{b.categoria?.nome || "-"}</TableCell>
                  </TableRow>
                ))}
                {setorOrigem && bensOrigem.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">Nenhum bem ativo neste setor.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setLote(false)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <TransferenciaDialog bens={bensSel} open={abrirTransf} onClose={() => setAbrirTransf(false)} onDone={() => { setLote(false); carregar() }} />
    </div>
  )
}
