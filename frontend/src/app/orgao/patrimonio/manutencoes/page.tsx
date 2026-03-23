"use client"

import { useState, useEffect } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { listarManutencoes, atualizarManutencao } from "@/services/patrimonio.service"

const STATUS_COLORS: Record<string, string> = {
  AGUARDANDO_DIAGNOSTICO: "bg-orange-100 text-orange-800",
  AGUARDANDO_CONSERTO: "bg-yellow-100 text-yellow-800",
  EM_CONSERTO: "bg-blue-100 text-blue-800",
  CONCLUIDO: "bg-green-100 text-green-800",
}

const STATUS_LABELS: Record<string, string> = {
  AGUARDANDO_DIAGNOSTICO: "Aguardando Diagnóstico",
  AGUARDANDO_CONSERTO: "Aguardando Conserto",
  EM_CONSERTO: "Em Conserto",
  CONCLUIDO: "Concluído",
}

export default function ManutencoesPage() {
  const [manutencoes, setManutencoes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroStatus, setFiltroStatus] = useState<string>("todos")
  const [editDialog, setEditDialog] = useState<any>(null)
  const [editForm, setEditForm] = useState({
    status: "",
    data_saida: "",
    data_retorno: "",
  })

  const carregar = async () => {
    setLoading(true)
    try {
      const status = filtroStatus !== "todos" ? filtroStatus : undefined
      const data = await listarManutencoes(status)
      setManutencoes(data)
    } catch (error) {
      console.error("Erro:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [filtroStatus])

  const handleEdit = (m: any) => {
    setEditForm({
      status: m.status,
      data_saida: m.data_saida || "",
      data_retorno: m.data_retorno || "",
    })
    setEditDialog(m)
  }

  const handleSalvar = async () => {
    try {
      const data: any = { status: editForm.status }
      if (editForm.data_saida) data.data_saida = editForm.data_saida
      if (editForm.data_retorno) data.data_retorno = editForm.data_retorno
      await atualizarManutencao(editDialog.id, data)
      setEditDialog(null)
      carregar()
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manutenções</h1>
          <p className="text-muted-foreground">Controle de bens em manutenção (Depósito de Patrimônio)</p>
        </div>
      </div>

      <div className="flex gap-3">
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[250px]">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="AGUARDANDO_DIAGNOSTICO">Aguardando Diagnóstico</SelectItem>
            <SelectItem value="AGUARDANDO_CONSERTO">Aguardando Conserto</SelectItem>
            <SelectItem value="EM_CONSERTO">Em Conserto</SelectItem>
            <SelectItem value="CONCLUIDO">Concluído</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plaqueta</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Setor</TableHead>
              <TableHead>Motivo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Entrada</TableHead>
              <TableHead>Saída</TableHead>
              <TableHead>Retorno</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : manutencoes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">Nenhuma manutenção encontrada</TableCell>
              </TableRow>
            ) : (
              manutencoes.map((m: any) => (
                <TableRow key={m.id}>
                  <TableCell className="font-mono text-sm">{m.bem?.plaqueta || "-"}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{m.bem?.descricao || "-"}</TableCell>
                  <TableCell>{m.bem?.categoria?.nome || "-"}</TableCell>
                  <TableCell>{m.setor}</TableCell>
                  <TableCell className="max-w-[150px] truncate">{m.motivo}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[m.status] || ""}>
                      {STATUS_LABELS[m.status] || m.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{m.data_entrada ? new Date(m.data_entrada).toLocaleDateString("pt-BR") : "-"}</TableCell>
                  <TableCell>{m.data_saida ? new Date(m.data_saida).toLocaleDateString("pt-BR") : "-"}</TableCell>
                  <TableCell>{m.data_retorno ? new Date(m.data_retorno).toLocaleDateString("pt-BR") : "-"}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => handleEdit(m)}>Editar</Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog edição */}
      <Dialog open={!!editDialog} onOpenChange={() => setEditDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Manutenção</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AGUARDANDO_DIAGNOSTICO">Aguardando Diagnóstico</SelectItem>
                  <SelectItem value="AGUARDANDO_CONSERTO">Aguardando Conserto</SelectItem>
                  <SelectItem value="EM_CONSERTO">Em Conserto</SelectItem>
                  <SelectItem value="CONCLUIDO">Concluído</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data de Saída</Label>
              <Input type="date" value={editForm.data_saida} onChange={(e) => setEditForm({ ...editForm, data_saida: e.target.value })} />
            </div>
            <div>
              <Label>Data de Retorno</Label>
              <Input type="date" value={editForm.data_retorno} onChange={(e) => setEditForm({ ...editForm, data_retorno: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Cancelar</Button>
            <Button onClick={handleSalvar}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
