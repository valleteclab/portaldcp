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
import { criarBem, listarCategorias, listarSetores, proximaPlaqueta } from "@/services/patrimonio.service"

export default function NovoBemPage() {
  const router = useRouter()
  const [categorias, setCategorias] = useState<any[]>([])
  const [setores, setSetores] = useState<{ id: string; nome: string; codigo: string }[]>([])
  const [sugestaoPlaqueta, setSugestaoPlaqueta] = useState("")
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    plaqueta: "",
    epc: "",
    descricao: "",
    categoria_id: "",
    tipo: "BEM_PROPRIO",
    quantidade: 1,
    estado_conservacao: "",
    setor_id: "",
    localizacao_codigo: "",
    localizacao_nome: "",
    responsavel_nome: "",
    responsavel_cargo: "",
    marca: "",
    modelo: "",
    numero_serie: "",
    valor_aquisicao: "",
    data_aquisicao: "",
    nota_fiscal_numero: "",
    fornecedor_nome: "",
    observacoes: "",
  })

  useEffect(() => {
    listarCategorias().then(setCategorias).catch(console.error)
    listarSetores().then(setSetores).catch(() => setSetores([]))
    proximaPlaqueta().then(setSugestaoPlaqueta).catch(() => {})
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const data: any = { ...form }
      for (const k of Object.keys(data)) {
        if (data[k] === "" || data[k] === null) delete data[k]
      }
      if (data.valor_aquisicao !== undefined) data.valor_aquisicao = parseFloat(String(data.valor_aquisicao).replace(",", "."))

      await criarBem(data)
      router.push("/orgao/patrimonio")
    } catch (error: any) {
      console.error("Erro ao criar bem:", error)
      alert(error?.message || "Erro ao criar bem")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
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
                  placeholder={sugestaoPlaqueta ? `Automática: ${sugestaoPlaqueta}` : "Código da plaqueta"}
                  value={form.plaqueta}
                  onChange={(e) => setForm({ ...form, plaqueta: e.target.value })}
                />
                <p className="text-xs text-muted-foreground mt-1">Vazio = o sistema numera. Informe só para manter uma numeração já existente.</p>
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
                <Label>Setor *</Label>
                <Select value={form.setor_id} onValueChange={(v) => setForm({ ...form, setor_id: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={setores.length ? "Selecione o setor" : "Cadastre setores em Configurações"} />
                  </SelectTrigger>
                  <SelectContent>
                    {setores.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">O inventário confere setor a setor: o bem só entra na lista do responsável se tiver setor.</p>
              </div>
              <div>
                <Label>Sala / localização (texto)</Label>
                <Input
                  placeholder="Ex: Sala 12, 2º andar"
                  value={form.localizacao_nome}
                  onChange={(e) => setForm({ ...form, localizacao_nome: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Marca</Label>
                <Input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
              </div>
              <div>
                <Label>Modelo</Label>
                <Input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
              </div>
              <div>
                <Label>Nº de série</Label>
                <Input value={form.numero_serie} onChange={(e) => setForm({ ...form, numero_serie: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>Valor de aquisição (R$)</Label>
                <Input inputMode="decimal" placeholder="0,00" value={form.valor_aquisicao} onChange={(e) => setForm({ ...form, valor_aquisicao: e.target.value })} />
              </div>
              <div>
                <Label>Data de aquisição</Label>
                <Input type="date" value={form.data_aquisicao} onChange={(e) => setForm({ ...form, data_aquisicao: e.target.value })} />
              </div>
              <div>
                <Label>Nota fiscal</Label>
                <Input value={form.nota_fiscal_numero} onChange={(e) => setForm({ ...form, nota_fiscal_numero: e.target.value })} />
              </div>
              <div>
                <Label>Fornecedor</Label>
                <Input value={form.fornecedor_nome} onChange={(e) => setForm({ ...form, fornecedor_nome: e.target.value })} />
              </div>
            </div>

            <div>
              <Label>Código RFID (EPC)</Label>
              <Input placeholder="Preenchido quando a etiqueta tiver chip RFID" value={form.epc} onChange={(e) => setForm({ ...form, epc: e.target.value })} className="font-mono" />
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
