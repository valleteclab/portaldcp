"use client"

import { useState, useEffect } from "react"
import { Plus, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { listarCategorias, criarCategoria, atualizarCategoria } from "@/services/patrimonio.service"

const VAZIO = { nome: "", vida_util_anos: "", valor_residual_pct: "10", conta_contabil: "" }

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [form, setForm] = useState(VAZIO)

  const carregar = async () => {
    setLoading(true)
    try { setCategorias(await listarCategorias()) } catch (error) { console.error("Erro:", error) } finally { setLoading(false) }
  }
  useEffect(() => { carregar() }, [])

  const abrirNovo = () => { setEditando(null); setForm(VAZIO); setDialog(true) }
  const abrirEdicao = (cat: any) => {
    setEditando(cat)
    setForm({ nome: cat.nome, vida_util_anos: cat.vida_util_anos ?? "", valor_residual_pct: String(cat.valor_residual_pct ?? 10), conta_contabil: cat.conta_contabil || "" })
    setDialog(true)
  }

  const salvar = async () => {
    const dados = {
      nome: form.nome.trim(),
      vida_util_anos: form.vida_util_anos === "" ? null : Number(form.vida_util_anos),
      valor_residual_pct: Number(String(form.valor_residual_pct).replace(",", ".")) || 0,
      conta_contabil: form.conta_contabil.trim() || null,
    }
    try {
      if (editando) await atualizarCategoria(editando.id, editando.sistema ? { ...dados, nome: undefined } : dados)
      else await criarCategoria(dados)
      toast.success("Categoria salva")
      setDialog(false)
      carregar()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categorias de Bens</h1>
          <p className="text-muted-foreground">Categorias e parâmetros de depreciação (vida útil, valor residual, conta contábil)</p>
        </div>
        <Button onClick={abrirNovo}><Plus className="h-4 w-4 mr-2" />Nova Categoria</Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Depreciação</CardTitle>
          <CardDescription>
            O relatório de depreciação usa o método linear: (valor de aquisição − residual) ÷ meses de vida útil, contando a partir do mês seguinte à aquisição (NBC TSP 07).
            Referências usuais: informática 5 anos, mobiliário 10, veículos 15, máquinas e equipamentos 10, com residual de 10%. Confirme com a contabilidade do órgão.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Vida útil</TableHead>
              <TableHead>Residual</TableHead>
              <TableHead>Conta contábil</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell></TableRow>
            ) : categorias.map((cat: any) => (
              <TableRow key={cat.id}>
                <TableCell className="font-medium">{cat.nome}</TableCell>
                <TableCell>{cat.vida_util_anos ? `${cat.vida_util_anos} anos` : <span className="text-amber-600">não deprecia</span>}</TableCell>
                <TableCell>{Number(cat.valor_residual_pct ?? 10)}%</TableCell>
                <TableCell className="font-mono text-xs">{cat.conta_contabil || "-"}</TableCell>
                <TableCell><Badge variant={cat.sistema ? "secondary" : "outline"}>{cat.sistema ? "Sistema" : "Customizada"}</Badge></TableCell>
                <TableCell><Badge className={cat.ativo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>{cat.ativo ? "Ativa" : "Inativa"}</Badge></TableCell>
                <TableCell><Button size="sm" variant="ghost" onClick={() => abrirEdicao(cat)}><Pencil className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editando ? `Editar · ${editando.nome}` : "Nova Categoria"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome</Label>
              <Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Equipamentos de Laboratório" disabled={!!editando?.sistema} />
              {editando?.sistema && <p className="text-xs text-muted-foreground mt-1">Categoria do sistema: só os parâmetros de depreciação podem ser alterados.</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Vida útil (anos)</Label><Input type="number" min={1} max={100} value={form.vida_util_anos} onChange={(e) => setForm({ ...form, vida_util_anos: e.target.value })} placeholder="vazio = não deprecia" /></div>
              <div><Label>Valor residual (%)</Label><Input type="number" min={0} max={100} value={form.valor_residual_pct} onChange={(e) => setForm({ ...form, valor_residual_pct: e.target.value })} /></div>
            </div>
            <div><Label>Conta contábil (PCASP)</Label><Input value={form.conta_contabil} onChange={(e) => setForm({ ...form, conta_contabil: e.target.value })} placeholder="Ex: 1.2.3.1.1.01.03" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancelar</Button>
            <Button onClick={salvar} disabled={!form.nome.trim()}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
