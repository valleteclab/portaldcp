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
import { obterBem, criarManutencao, atualizarBem } from "@/services/patrimonio.service"

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

  const carregarBem = async () => {
    try {
      const data = await obterBem(params.id as string)
      setBem(data)
    } catch (error) {
      console.error("Erro ao carregar bem:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarBem()
  }, [params.id])

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
        <Button variant="outline" onClick={() => setManutDialog(true)}>
          <Wrench className="h-4 w-4 mr-2" />Enviar para Manutenção
        </Button>
      </div>

      {/* Informações do Bem */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Identificação</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Plaqueta:</span><span>{bem.plaqueta || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Categoria:</span><span>{bem.categoria?.nome || "-"}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Quantidade:</span><span>{bem.quantidade}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Estado:</span><span>{bem.estado_conservacao || "-"}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Localização e Responsável</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between"><span className="text-muted-foreground">Local:</span><span>{bem.localizacao_nome || "-"} {bem.localizacao_codigo ? `(${bem.localizacao_codigo})` : ""}</span></div>
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
