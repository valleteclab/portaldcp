"use client"

import { useState, useEffect } from "react"
import { Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
import { Label } from "@/components/ui/label"
import { listarCategorias, criarCategoria } from "@/services/patrimonio.service"

export default function CategoriasPage() {
  const [categorias, setCategorias] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState(false)
  const [nomeCategoria, setNomeCategoria] = useState("")

  const carregar = async () => {
    setLoading(true)
    try {
      const data = await listarCategorias()
      setCategorias(data)
    } catch (error) {
      console.error("Erro:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  const handleCriar = async () => {
    try {
      await criarCategoria({ nome: nomeCategoria })
      setNomeCategoria("")
      setDialog(false)
      carregar()
    } catch (error) {
      console.error("Erro:", error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Categorias de Bens</h1>
          <p className="text-muted-foreground">Gerencie as categorias de bens patrimoniais</p>
        </div>
        <Button onClick={() => setDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />Nova Categoria
        </Button>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : (
              categorias.map((cat: any) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-medium">{cat.nome}</TableCell>
                  <TableCell>
                    <Badge variant={cat.sistema ? "secondary" : "outline"}>
                      {cat.sistema ? "Sistema" : "Customizada"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge className={cat.ativo ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}>
                      {cat.ativo ? "Ativa" : "Inativa"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Categoria</DialogTitle>
          </DialogHeader>
          <div>
            <Label>Nome da Categoria</Label>
            <Input
              value={nomeCategoria}
              onChange={(e) => setNomeCategoria(e.target.value)}
              placeholder="Ex: Equipamentos de Laboratório"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>Cancelar</Button>
            <Button onClick={handleCriar} disabled={!nomeCategoria.trim()}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
