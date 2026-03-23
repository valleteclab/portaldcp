"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { criarBem, listarCategorias } from "@/services/patrimonio.service"

export default function NovoBemPage() {
  const router = useRouter()
  const [categorias, setCategorias] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    plaqueta: "",
    descricao: "",
    categoria_id: "",
    tipo: "BEM_PROPRIO",
    quantidade: 1,
    estado_conservacao: "",
    localizacao_codigo: "",
    localizacao_nome: "",
    responsavel_nome: "",
    responsavel_cargo: "",
    observacoes: "",
  })

  useEffect(() => {
    listarCategorias().then(setCategorias).catch(console.error)
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data: any = { ...form }
      if (!data.plaqueta) delete data.plaqueta
      if (!data.categoria_id) delete data.categoria_id
      if (!data.estado_conservacao) delete data.estado_conservacao
      if (!data.localizacao_codigo) delete data.localizacao_codigo
      if (!data.localizacao_nome) delete data.localizacao_nome
      if (!data.responsavel_nome) delete data.responsavel_nome
      if (!data.responsavel_cargo) delete data.responsavel_cargo
      if (!data.observacoes) delete data.observacoes

      await criarBem(data)
      router.push("/orgao/patrimonio")
    } catch (error) {
      console.error("Erro ao criar bem:", error)
      alert("Erro ao criar bem")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cadastrar Novo Bem</h1>
        <p className="text-muted-foreground">Preencha os dados do bem patrimonial</p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Identificação do Bem</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Plaqueta</Label>
                <Input
                  placeholder="Código da plaqueta"
                  value={form.plaqueta}
                  onChange={(e) => setForm({ ...form, plaqueta: e.target.value })}
                />
              </div>
              <div>
                <Label>Tipo *</Label>
                <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BEM_PROPRIO">Bem Próprio</SelectItem>
                    <SelectItem value="BEM_LOCADO">Bem Locado</SelectItem>
                    <SelectItem value="BEM_SERVIDOR">Bem de Servidor</SelectItem>
                    <SelectItem value="BEM_COMODATO">Bem em Comodato</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Descrição *</Label>
              <Input
                required
                placeholder="Descrição do bem"
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Categoria</Label>
                <Select value={form.categoria_id} onValueChange={(v) => setForm({ ...form, categoria_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((cat: any) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quantidade</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantidade}
                  onChange={(e) => setForm({ ...form, quantidade: parseInt(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Estado de Conservação</Label>
                <Select value={form.estado_conservacao} onValueChange={(v) => setForm({ ...form, estado_conservacao: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOM">Bom</SelectItem>
                    <SelectItem value="REGULAR">Regular</SelectItem>
                    <SelectItem value="RUIM">Ruim</SelectItem>
                    <SelectItem value="INSERVIVEL">Inservível</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Localização (Código)</Label>
                <Input
                  placeholder="Ex: CC-10031"
                  value={form.localizacao_codigo}
                  onChange={(e) => setForm({ ...form, localizacao_codigo: e.target.value })}
                />
              </div>
              <div>
                <Label>Localização (Nome)</Label>
                <Input
                  placeholder="Ex: Compras"
                  value={form.localizacao_nome}
                  onChange={(e) => setForm({ ...form, localizacao_nome: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Responsável</Label>
                <Input
                  placeholder="Nome do responsável"
                  value={form.responsavel_nome}
                  onChange={(e) => setForm({ ...form, responsavel_nome: e.target.value })}
                />
              </div>
              <div>
                <Label>Cargo do Responsável</Label>
                <Input
                  placeholder="Cargo"
                  value={form.responsavel_cargo}
                  onChange={(e) => setForm({ ...form, responsavel_cargo: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea
                placeholder="Observações adicionais"
                value={form.observacoes}
                onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={loading}>
                {loading ? "Salvando..." : "Cadastrar Bem"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  )
}
