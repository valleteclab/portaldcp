"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Wrench, Edit } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { obterBem, criarManutencao, atualizarBem, listarSetores, enviarFotoBem } from "@/services/patrimonio.service"
import { useRef } from "react"
import { Camera, QrCode } from "lucide-react"
import { API_URL } from "@/lib/api"
import { BemAcoes } from "../movimentacoes/BemAcoes"
import { listarMovimentacoes, devolverEmprestimo, abrirPdf, urlTermoTransferencia, urlTermoBaixa } from "@/services/patrimonio.service"

const TIPO_MOV: Record<string, string> = { TRANSFERENCIA: "Transferência", BAIXA: "Baixa", EMPRESTIMO: "Empréstimo" }
const STATUS_MOV: Record<string, string> = { PENDENTE: "aguardando aceite", ACEITA: "aceita", RECUSADA: "recusada", CANCELADA: "cancelada", EM_ANDAMENTO: "em andamento", CONCLUIDA: "concluída" }

const ESTADO_LABELS: Record<string, string> = { BOM: "Bom", REGULAR: "Regular", RUIM: "Ruim", INSERVIVEL: "Inservível" }
const fmtMoeda = (v: any) => (v == null || v === "" ? "-" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }))
const fmtData = (v: any) => (v ? new Date(String(v).slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "-")

const STATUS_COLORS: Record<string, string> = {
  ATIVO: "bg-green-100 text-green-800",
  EM_MANUTENCAO: "bg-yellow-100 text-yellow-800",
  BAIXADO: "bg-red-100 text-red-800",
  DEVOLVIDO: "bg-blue-100 text-blue-800",
}

const STATUS_MANUT_COLORS: Record<string, string> = {
  AGUARDANDO_DIAGNOSTICO: "bg-orange-100 text-orange-800",
  AGUARDANDO_CONSERTO: "bg-yellow-100 text-yellow-800",
  EM_CONSERTO: "bg-blue-100 text-blue-800",
  CONCLUIDO: "bg-green-100 text-green-800",
}

const STATUS_MANUT_LABELS: Record<string, string> = {
  AGUARDANDO_DIAGNOSTICO: "Aguardando Diagnóstico",
  AGUARDANDO_CONSERTO: "Aguardando Conserto",
  EM_CONSERTO: "Em Conserto",
  CONCLUIDO: "Concluído",
}

export default function DetalheBemPage() {
  const params = useParams()
  const router = useRouter()
  const [bem, setBem] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [manutDialog, setManutDialog] = useState(false)
  const [manutForm, setManutForm] = useState({
    setor: "",
    motivo: "",
    data_entrada: new Date().toISOString().split("T")[0],
  })
  const [setores, setSetores] = useState<{ id: string; nome: string }[]>([])
  const [enviandoFoto, setEnviandoFoto] = useState(false)
  const inputFoto = useRef<HTMLInputElement>(null)

  const [movs, setMovs] = useState<any[]>([])

  const carregarBem = async () => {
    try {
      const data = await obterBem(params.id as string)
      setBem(data)
      listarMovimentacoes({ bem_id: params.id as string }).then(setMovs).catch(() => setMovs([]))
    } catch (error) {
      console.error("Erro ao carregar bem:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarBem()
    listarSetores().then(setSetores).catch(() => setSetores([]))
  }, [params.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const trocarSetor = async (setorId: string) => {
    try {
      await atualizarBem(params.id as string, { setor_id: setorId || null })
      carregarBem()
    } catch (e: any) { alert(e?.message || "Erro ao alterar setor") }
  }

  const handleFoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setEnviandoFoto(true)
    try { await enviarFotoBem(params.id as string, file); carregarBem() }
    catch (err: any) { alert(err?.message || "Erro ao enviar foto") }
    finally { setEnviandoFoto(false) }
  }

  const handleEnviarManutencao = async () => {
    try {
      await criarManutencao(params.id as string, manutForm)
      setManutDialog(false)
      setManutForm({ setor: "", motivo: "", data_entrada: new Date().toISOString().split("T")[0] })
      carregarBem()
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12">Carregando...</div>
  }

  if (!bem) {
    return <div className="text-center py-12 text-muted-foreground">Bem não encontrado</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{bem.descricao}</h1>
          <p className="text-muted-foreground">
            {bem.plaqueta ? `Plaqueta: ${bem.plaqueta}` : "Sem plaqueta"} | {bem.tipo?.replace(/_/g, " ")}
          </p>
        </div>
        <Badge className={STATUS_COLORS[bem.status] || ""}>
          {bem.status?.replace(/_/g, " ")}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <a href={`/p/${bem.id}`} target="_blank" rel="noreferrer">
          <Button variant="outline" title="Página que o QR da plaqueta abre"><QrCode className="h-4 w-4 mr-2" />Página do QR</Button>
        </a>
        <Button variant="outline" onClick={() => setManutDialog(true)} disabled={bem.status === "BAIXADO"}>
          <Wrench className="h-4 w-4 mr-2" />Enviar para Manutenção
        </Button>
        <BemAcoes bem={bem} onDone={carregarBem} />
      </div>
      {bem.emprestado_ate && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900 flex items-center justify-between gap-3">
          <span>Emprestado para <strong>{bem.emprestado_para}</strong> · retorno previsto {fmtData(bem.emprestado_ate)}{new Date(String(bem.emprestado_ate).slice(0, 10) + "T23:59:59") < new Date() ? <span className="ml-2 font-semibold text-red-700">(atrasado)</span> : null}</span>
          {movs.find((m) => m.tipo === "EMPRESTIMO" && m.status === "EM_ANDAMENTO") && (
            <Button size="sm" variant="outline" onClick={async () => { try { await devolverEmprestimo(movs.find((m) => m.tipo === "EMPRESTIMO" && m.status === "EM_ANDAMENTO").id); carregarBem() } catch (e: any) { alert(e.message) } }}>Registrar devolução</Button>
          )}
        </div>
      )}
      {bem.status === "BAIXADO" && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-900">
          Bem baixado em {fmtData(bem.data_baixa)}{bem.motivo_baixa ? ` · ${bem.motivo_baixa.replace(/_/g, " ").toLowerCase()}` : ""}.
        </div>
      )}

      {/* Informações do Bem */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Plaqueta:</span><span className="font-mono">{bem.plaqueta || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">RFID (EPC):</span><span className="font-mono text-xs">{bem.epc || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Categoria:</span><span>{bem.categoria?.nome || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Marca / modelo:</span><span>{[bem.marca, bem.modelo].filter(Boolean).join(" ") || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Nº de série:</span><span className="font-mono text-xs">{bem.numero_serie || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quantidade:</span><span>{bem.quantidade}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Estado:</span><span>{ESTADO_LABELS[bem.estado_conservacao] || bem.estado_conservacao || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Última conferência:</span><span>{bem.ultima_conferencia_em ? new Date(bem.ultima_conferencia_em).toLocaleString("pt-BR") : "nunca"}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Aquisição</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Valor:</span><span>{fmtMoeda(bem.valor_aquisicao)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Data:</span><span>{fmtData(bem.data_aquisicao)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Nota fiscal:</span><span>{bem.nota_fiscal_numero || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Fornecedor:</span><span className="text-right">{bem.fornecedor_nome || "-"}</span></div>
            <div className="pt-2 border-t">
              <input ref={inputFoto} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFoto} />
              {bem.foto_url ? (
                <img src={`${API_URL}${bem.foto_url}`} alt="Foto do bem" className="w-full max-h-40 object-cover rounded-md mb-2 cursor-pointer" onClick={() => inputFoto.current?.click()} />
              ) : null}
              <Button size="sm" variant="outline" onClick={() => inputFoto.current?.click()} disabled={enviandoFoto}>
                <Camera className="h-4 w-4 mr-2" />{enviandoFoto ? "Enviando..." : bem.foto_url ? "Trocar foto" : "Adicionar foto"}
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Localização e Responsável</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <span className="text-muted-foreground text-sm">Setor (inventário):</span>
              <Select value={bem.setor_id || ""} onValueChange={trocarSetor}>
                <SelectTrigger className="mt-1"><SelectValue placeholder={setores.length ? "Sem setor — selecione" : "Cadastre setores em Configurações"} /></SelectTrigger>
                <SelectContent>
                  {setores.map((s) => <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sala / local:</span><span>{bem.localizacao_nome || "-"} {bem.localizacao_codigo ? `(${bem.localizacao_codigo})` : ""}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Responsável:</span><span>{bem.responsavel_nome || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cargo:</span><span>{bem.responsavel_cargo || "-"}</span></div>
            {bem.observacoes && <div className="pt-2 border-t"><span className="text-muted-foreground text-sm">Obs: </span><span className="text-sm">{bem.observacoes}</span></div>}
          </CardContent>
        </Card>
      </div>

      {/* Manutenções */}
      {bem.manutencoes?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Histórico de Manutenções</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Setor</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Entrada</TableHead>
                  <TableHead>Saída</TableHead>
                  <TableHead>Retorno</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bem.manutencoes.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.setor}</TableCell>
                    <TableCell>{m.motivo}</TableCell>
                    <TableCell>
                      <Badge className={STATUS_MANUT_COLORS[m.status] || ""}>
                        {STATUS_MANUT_LABELS[m.status] || m.status}
                      </Badge>
                    </TableCell>
                    <TableCell>{m.data_entrada ? new Date(m.data_entrada).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell>{m.data_saida ? new Date(m.data_saida).toLocaleDateString("pt-BR") : "-"}</TableCell>
                    <TableCell>{m.data_retorno ? new Date(m.data_retorno).toLocaleDateString("pt-BR") : "-"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Movimentações */}
      {movs.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Movimentações</CardTitle></CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Detalhe</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Quem</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movs.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-sm">{new Date(m.created_at).toLocaleDateString("pt-BR")}</TableCell>
                    <TableCell><Badge variant="outline">{TIPO_MOV[m.tipo] || m.tipo}</Badge></TableCell>
                    <TableCell className="text-sm">
                      {m.tipo === "TRANSFERENCIA" && <>{m.setor_origem_nome || "sem setor"} → {m.setor_destino_nome}</>}
                      {m.tipo === "EMPRESTIMO" && <>{m.destino_texto} · retorno {fmtData(m.data_prevista_retorno)}{m.data_retorno ? ` · devolvido ${fmtData(m.data_retorno)}` : ""}</>}
                      {m.tipo === "BAIXA" && <>{m.motivo}</>}
                    </TableCell>
                    <TableCell className="text-sm">{STATUS_MOV[m.status] || m.status}{m.recusa_motivo ? ` — ${m.recusa_motivo}` : ""}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{m.solicitado_por}{m.aceito_por && m.aceito_por !== m.solicitado_por ? ` / ${m.aceito_por}` : ""}</TableCell>
                    <TableCell>
                      {m.tipo === "TRANSFERENCIA" && m.status === "ACEITA" && <Button size="sm" variant="ghost" onClick={() => abrirPdf(urlTermoTransferencia(m.lote_id)).catch((e) => alert(e.message))}>Termo</Button>}
                      {m.tipo === "BAIXA" && <Button size="sm" variant="ghost" onClick={() => abrirPdf(urlTermoBaixa(m.id)).catch((e) => alert(e.message))}>Termo</Button>}
                      {m.tipo === "TRANSFERENCIA" && m.status === "PENDENTE" && m.link_aceite && <Button size="sm" variant="ghost" onClick={() => { navigator.clipboard.writeText(m.link_aceite); alert("Link de aceite copiado") }}>Copiar link</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Histórico */}
      {bem.historicos?.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Histórico de Ações</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {bem.historicos.map((h: any) => (
                <div key={h.id} className="flex items-center gap-3 text-sm border-b pb-2">
                  <Badge variant="outline">{h.acao}</Badge>
                  <span className="flex-1">{h.descricao}</span>
                  <span className="text-muted-foreground">{h.usuario_nome}</span>
                  <span className="text-muted-foreground">{new Date(h.created_at).toLocaleDateString("pt-BR")}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog manutenção */}
      <Dialog open={manutDialog} onOpenChange={setManutDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enviar para Manutenção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Setor *</Label>
              <Input value={manutForm.setor} onChange={(e) => setManutForm({ ...manutForm, setor: e.target.value })} placeholder="Setor responsável" />
            </div>
            <div>
              <Label>Motivo da Manutenção *</Label>
              <Input value={manutForm.motivo} onChange={(e) => setManutForm({ ...manutForm, motivo: e.target.value })} placeholder="Descreva o motivo" />
            </div>
            <div>
              <Label>Data de Entrada</Label>
              <Input type="date" value={manutForm.data_entrada} onChange={(e) => setManutForm({ ...manutForm, data_entrada: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManutDialog(false)}>Cancelar</Button>
            <Button onClick={handleEnviarManutencao} disabled={!manutForm.setor || !manutForm.motivo}>
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
