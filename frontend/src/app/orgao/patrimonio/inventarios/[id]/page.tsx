"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { ArrowLeft, Send, Copy, RotateCcw, Lock, AlertTriangle, CheckCircle2, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import {
  obterInventario, divergenciasInventario, fecharInventario, atualizarSetorInventario,
  enviarLinkSetorInventario, reabrirSetorInventario, abrirPdf, urlTermoResponsabilidade,
} from "@/services/patrimonio.service"
import { TransferenciaDialog, BaixaDialog } from "../../movimentacoes/BemAcoes"
import { FileText } from "lucide-react"

const STATUS_SETOR: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: "Não iniciado", cls: "bg-gray-100 text-gray-800" },
  EM_ANDAMENTO: { label: "Em andamento", cls: "bg-blue-100 text-blue-800" },
  FECHADO: { label: "Finalizado", cls: "bg-green-100 text-green-800" },
}

export default function InventarioDetalhePage() {
  const params = useParams()
  const id = params.id as string
  const [inv, setInv] = useState<any>(null)
  const [div, setDiv] = useState<any>(null)
  const [aba, setAba] = useState<"setores" | "divergencias">("setores")
  const [editando, setEditando] = useState<any>(null)
  const [editForm, setEditForm] = useState({ responsavel_nome: "", responsavel_telefone: "" })
  const [transf, setTransf] = useState<{ bem: any; setorId: string; setorNome: string } | null>(null)
  const [baixa, setBaixa] = useState<{ bem: any; setorNome: string } | null>(null)

  const carregar = async () => {
    try {
      const [i, d] = await Promise.all([obterInventario(id), divergenciasInventario(id)])
      setInv(i); setDiv(d)
    } catch (e) { console.error(e) }
  }
  useEffect(() => { carregar() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = async (s: any) => {
    try {
      const r = await enviarLinkSetorInventario(id, s.id)
      if (r.enviado) toast.success(`Link enviado para ${s.responsavel_nome || s.setor_nome}`)
      else toast.warning(r.motivo || "Não foi possível enviar pelo WhatsApp. Copie o link.")
      carregar()
    } catch (e: any) { toast.error(e.message) }
  }
  const copiar = (link: string) => { navigator.clipboard.writeText(link); toast.success("Link copiado") }
  const reabrir = async (s: any) => {
    if (!confirm(`Reabrir a conferência de ${s.setor_nome}?`)) return
    try { await reabrirSetorInventario(id, s.id); carregar() } catch (e: any) { toast.error(e.message) }
  }
  const salvarEdicao = async () => {
    try {
      await atualizarSetorInventario(id, editando.id, editForm)
      setEditando(null); carregar()
    } catch (e: any) { toast.error(e.message) }
  }
  const fechar = async (forcar: boolean) => {
    if (!confirm(forcar ? "Fechar a campanha mesmo com setores abertos? Os pendentes ficam registrados como não localizados." : "Fechar a campanha de inventário?")) return
    try { await fecharInventario(id, forcar); toast.success("Campanha fechada"); carregar() } catch (e: any) { toast.error(e.message) }
  }

  if (!inv) return <div className="py-12 text-center text-muted-foreground">Carregando...</div>
  const aberta = inv.status === "ABERTO"
  const setoresAbertos = inv.setores.filter((s: any) => s.status !== "FECHADO").length

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/orgao/patrimonio/inventarios"><Button variant="ghost" size="icon"><ArrowLeft className="h-5 w-5" /></Button></Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{inv.nome}</h1>
          <p className="text-muted-foreground text-sm">Ano {inv.ano} · aberta por {inv.aberto_por || "-"}{inv.comissao ? ` · Comissão: ${inv.comissao}` : ""}</p>
        </div>
        <Badge className={aberta ? "bg-blue-100 text-blue-800" : "bg-green-100 text-green-800"}>{aberta ? "Em andamento" : `Fechada${inv.fechado_por ? ` por ${inv.fechado_por}` : ""}`}</Badge>
        {aberta && (
          <Button variant={setoresAbertos ? "outline" : "default"} onClick={() => fechar(setoresAbertos > 0)}>
            <Lock className="h-4 w-4 mr-2" />{setoresAbertos ? `Fechar (${setoresAbertos} aberto${setoresAbertos > 1 ? "s" : ""})` : "Fechar campanha"}
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Resumo titulo="Bens nos setores" valor={inv.totais.bens} />
        <Resumo titulo="Conferidos" valor={inv.totais.encontrados} cor="text-green-600" />
        <Resumo titulo="Não localizados" valor={inv.totais.nao_localizados} cor="text-red-600" />
        <Resumo titulo="Divergências" valor={inv.totais.divergencias} cor="text-amber-600" />
      </div>

      <div className="flex gap-2">
        <Button variant={aba === "setores" ? "default" : "outline"} size="sm" onClick={() => setAba("setores")}>Setores</Button>
        <Button variant={aba === "divergencias" ? "default" : "outline"} size="sm" onClick={() => setAba("divergencias")}>Relatório de divergências</Button>
      </div>

      {aba === "setores" && (
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Setor</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Andamento</TableHead>
                <TableHead>Divergências</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {inv.setores.map((s: any) => {
                const r = s.resumo
                const divs = r.outro_setor + r.desconhecidos + r.sem_plaqueta + r.baixados_presentes
                const pct = r.total ? Math.round((r.encontrados / r.total) * 100) : 0
                return (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.setor_nome}{!s.setor_id && <span className="block text-xs text-muted-foreground">sem cadastro de setor</span>}</TableCell>
                    <TableCell className="text-sm">
                      <div className="flex items-center gap-1">
                        <div>
                          <div>{s.responsavel_nome || <span className="text-muted-foreground">—</span>}</div>
                          <div className="text-xs text-muted-foreground">{s.responsavel_telefone || "sem WhatsApp"}{s.link_enviado_em ? ` · link enviado ${new Date(s.link_enviado_em).toLocaleDateString("pt-BR")}` : ""}</div>
                        </div>
                        {aberta && <Button size="icon" variant="ghost" onClick={() => { setEditando(s); setEditForm({ responsavel_nome: s.responsavel_nome || "", responsavel_telefone: s.responsavel_telefone || "" }) }}><Pencil className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{r.encontrados} / {r.total} ({pct}%)</div>
                      <div className="h-1.5 w-32 bg-gray-200 rounded-full overflow-hidden mt-1"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>
                      {r.nao_localizados > 0 && s.status === "FECHADO" && <div className="text-xs text-red-600">{r.nao_localizados} não localizado(s)</div>}
                    </TableCell>
                    <TableCell className="text-sm">{divs > 0 ? <span className="text-amber-700 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />{divs}</span> : <span className="text-muted-foreground">0</span>}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_SETOR[s.status]?.cls}>{STATUS_SETOR[s.status]?.label || s.status}</Badge>
                      {s.status === "FECHADO" && <div className="text-xs text-muted-foreground mt-1">{s.fechado_por}<br />{s.fechado_em ? new Date(s.fechado_em).toLocaleString("pt-BR") : ""}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" title="Copiar link" onClick={() => copiar(s.link)}><Copy className="h-3.5 w-3.5" /></Button>
                        {aberta && s.status !== "FECHADO" && <Button size="sm" variant="outline" title="Enviar por WhatsApp" onClick={() => enviar(s)} disabled={!s.responsavel_telefone}><Send className="h-3.5 w-3.5" /></Button>}
                        {aberta && s.status === "FECHADO" && <Button size="sm" variant="outline" title="Reabrir" onClick={() => reabrir(s)}><RotateCcw className="h-3.5 w-3.5" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {aba === "divergencias" && div && (
        <div className="space-y-4">
          {div.setores.map((s: any) => {
            const vazio = !s.nao_localizados.length && !s.outro_setor.length && !s.desconhecidos.length && !s.sem_plaqueta.length && !s.baixados_presentes.length && !s.estado_ruim.length
            return (
              <Card key={s.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {vazio ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <AlertTriangle className="h-4 w-4 text-amber-600" />}
                    {s.setor_nome}
                    <Badge className={STATUS_SETOR[s.status]?.cls}>{STATUS_SETOR[s.status]?.label}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  {s.setor_id && (
                    <div className="flex justify-end">
                      <Button size="sm" variant="outline" onClick={() => abrirPdf(urlTermoResponsabilidade(s.setor_id, s.fechado_por || s.responsavel_nome || "")).catch((e) => toast.error(e.message))}>
                        <FileText className="h-3.5 w-3.5 mr-1" />Termo de responsabilidade do setor
                      </Button>
                    </div>
                  )}
                  {vazio && <p className="text-muted-foreground">Sem divergências{s.status !== "FECHADO" ? " até agora" : ""}.</p>}
                  <Lista titulo={`Não localizados (${s.nao_localizados.length})`} cor="text-red-700"
                    itens={s.nao_localizados.map((b: any) => ({ texto: `${b.plaqueta || "—"} · ${b.descricao}`, acao: aberta ? { rotulo: "Registrar baixa", onClick: () => setBaixa({ bem: b, setorNome: s.setor_nome }) } : undefined }))} />
                  <Lista titulo={`Encontrados de outro setor (${s.outro_setor.length})`} cor="text-amber-700"
                    itens={s.outro_setor.map((b: any) => ({ texto: `${b.plaqueta || "—"} · ${b.descricao} — cadastrado em ${b.setor_cadastro_nome || "?"}`, acao: aberta && s.setor_id && b.id ? { rotulo: `Transferir para ${s.setor_nome}`, onClick: () => setTransf({ bem: b, setorId: s.setor_id, setorNome: s.setor_nome }) } : undefined }))} />
                  <Lista titulo={`Sem plaqueta, cadastrados na conferência (${s.sem_plaqueta.length})`} cor="text-sky-700" itens={s.sem_plaqueta.map((b: any) => ({ texto: `${b.plaqueta || "—"} · ${b.descricao} — imprimir plaqueta` }))} />
                  <Lista titulo={`Códigos não cadastrados (${s.desconhecidos.length})`} cor="text-rose-700" itens={s.desconhecidos.map((d: any) => ({ texto: d.codigo_lido }))} />
                  <Lista titulo={`Baixados, mas presentes (${s.baixados_presentes.length})`} cor="text-purple-700" itens={s.baixados_presentes.map((b: any) => ({ texto: `${b.plaqueta || "—"} · ${b.descricao}` }))} />
                  <Lista titulo={`Estado ruim ou inservível (${s.estado_ruim.length})`} cor="text-orange-700"
                    itens={s.estado_ruim.map((b: any) => ({ texto: `${b.plaqueta || "—"} · ${b.descricao} (${b.estado_conservacao})`, acao: aberta && b.id && b.estado_conservacao === "INSERVIVEL" ? { rotulo: "Registrar baixa", onClick: () => setBaixa({ bem: b, setorNome: s.setor_nome }) } : undefined }))} />
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <TransferenciaDialog
        bens={transf ? [transf.bem] : []}
        open={!!transf}
        onClose={() => setTransf(null)}
        onDone={carregar}
        setorDestinoId={transf?.setorId}
        motivoInicial={transf ? `Inventário ${inv.ano}: encontrado em ${transf.setorNome}` : ""}
        inventarioId={id}
        aceiteImediatoInicial
      />
      <BaixaDialog
        bem={baixa?.bem || null}
        open={!!baixa}
        onClose={() => setBaixa(null)}
        onDone={carregar}
        inventarioId={id}
        motivoInicial={baixa ? `Inventário ${inv.ano}: não localizado na conferência do setor ${baixa.setorNome}` : ""}
      />

      <Dialog open={!!editando} onOpenChange={() => setEditando(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Responsável · {editando?.setor_nome}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={editForm.responsavel_nome} onChange={(e) => setEditForm({ ...editForm, responsavel_nome: e.target.value })} /></div>
            <div><Label>WhatsApp</Label><Input value={editForm.responsavel_telefone} onChange={(e) => setEditForm({ ...editForm, responsavel_telefone: e.target.value })} placeholder="77 9 9999-9999" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvarEdicao}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Resumo({ titulo, valor, cor }: { titulo: string; valor: number; cor?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle></CardHeader>
      <CardContent><div className={`text-2xl font-bold ${cor || ""}`}>{valor}</div></CardContent>
    </Card>
  )
}

function Lista({ titulo, cor, itens }: { titulo: string; cor: string; itens: { texto: string; acao?: { rotulo: string; onClick: () => void } }[] }) {
  if (!itens.length) return null
  return (
    <div>
      <p className={`font-semibold ${cor}`}>{titulo}</p>
      <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
        {itens.map((t, i) => (
          <li key={i}>
            {t.texto}
            {t.acao && <button onClick={t.acao.onClick} className="ml-2 text-xs text-blue-700 underline underline-offset-2">{t.acao.rotulo}</button>}
          </li>
        ))}
      </ul>
    </div>
  )
}
