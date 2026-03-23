"use client"

import { useState, useEffect } from "react"
import { Tag, Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { listarBens, gerarEtiquetas } from "@/services/patrimonio.service"

const TIPOS_ETIQUETA = [
  { value: "AVARIA", label: "Etiqueta de Avaria", cor: "bg-red-500" },
  { value: "SITUACAO_PATRIMONIO", label: "Situação Patrimônio", cor: "bg-blue-500" },
  { value: "BEM_PARTICULAR_SERVIDOR", label: "Bem Particular - Servidor", cor: "bg-purple-500" },
  { value: "BEM_LOCADO", label: "Bem Locado", cor: "bg-green-500" },
  { value: "BEM_COMODATO", label: "Bem em Comodato", cor: "bg-cyan-500" },
]

export default function EtiquetasPage() {
  const [bens, setBens] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [tipoEtiqueta, setTipoEtiqueta] = useState("SITUACAO_PATRIMONIO")
  const [formato, setFormato] = useState<"individual" | "folha_a4">("folha_a4")
  const [gerando, setGerando] = useState(false)

  useEffect(() => {
    listarBens()
      .then(setBens)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const toggleSelecionado = (id: string) => {
    const novo = new Set(selecionados)
    if (novo.has(id)) {
      novo.delete(id)
    } else {
      novo.add(id)
    }
    setSelecionados(novo)
  }

  const toggleTodos = () => {
    if (selecionados.size === bens.length) {
      setSelecionados(new Set())
    } else {
      setSelecionados(new Set(bens.map((b: any) => b.id)))
    }
  }

  const handleGerar = async () => {
    if (selecionados.size === 0) {
      alert("Selecione pelo menos um bem")
      return
    }
    setGerando(true)
    try {
      const blob = await gerarEtiquetas({
        tipo: tipoEtiqueta,
        bem_ids: Array.from(selecionados),
        formato,
      })
      const url = URL.createObjectURL(blob)
      window.open(url, "_blank")
    } catch (error) {
      console.error("Erro ao gerar etiquetas:", error)
      alert("Erro ao gerar etiquetas")
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Etiquetas de Patrimônio</h1>
          <p className="text-muted-foreground">Selecione os bens e gere etiquetas para impressão</p>
        </div>
      </div>

      {/* Configuração */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5" />
            Configuração da Etiqueta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="min-w-[250px]">
              <label className="text-sm font-medium mb-2 block">Tipo de Etiqueta</label>
              <Select value={tipoEtiqueta} onValueChange={setTipoEtiqueta}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ETIQUETA.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${t.cor}`} />
                        {t.label}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="min-w-[200px]">
              <label className="text-sm font-medium mb-2 block">Formato</label>
              <Select value={formato} onValueChange={(v: any) => setFormato(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="folha_a4">Folha A4 (múltiplas)</SelectItem>
                  <SelectItem value="individual">Individual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleGerar} disabled={gerando || selecionados.size === 0}>
              <Printer className="h-4 w-4 mr-2" />
              {gerando ? "Gerando..." : `Gerar Etiquetas (${selecionados.size})`}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tabela de seleção */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[50px]">
                <Checkbox
                  checked={bens.length > 0 && selecionados.size === bens.length}
                  onCheckedChange={toggleTodos}
                />
              </TableHead>
              <TableHead>Plaqueta</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Carregando...</TableCell>
              </TableRow>
            ) : bens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Nenhum bem cadastrado</TableCell>
              </TableRow>
            ) : (
              bens.map((bem: any) => (
                <TableRow key={bem.id} className={selecionados.has(bem.id) ? "bg-blue-50" : ""}>
                  <TableCell>
                    <Checkbox
                      checked={selecionados.has(bem.id)}
                      onCheckedChange={() => toggleSelecionado(bem.id)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-sm">{bem.plaqueta || "-"}</TableCell>
                  <TableCell>{bem.descricao}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{bem.tipo?.replace(/_/g, " ")}</Badge>
                  </TableCell>
                  <TableCell>{bem.categoria?.nome || "-"}</TableCell>
                  <TableCell>{bem.localizacao_nome || "-"}</TableCell>
                  <TableCell>
                    <Badge className={
                      bem.status === "ATIVO" ? "bg-green-100 text-green-800" :
                      bem.status === "EM_MANUTENCAO" ? "bg-yellow-100 text-yellow-800" :
                      "bg-gray-100 text-gray-800"
                    }>
                      {bem.status?.replace(/_/g, " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
