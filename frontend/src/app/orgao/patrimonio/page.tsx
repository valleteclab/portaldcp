"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, Search, Tag, FileText, Wrench, Building2, Users, Handshake, FolderOpen } from "lucide-react"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { listarBens, listarCategorias, excluirBem, relatorioResumo } from "@/services/patrimonio.service"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const STATUS_COLORS: Record<string, string> = {
  ATIVO: "bg-green-100 text-green-800",
  EM_MANUTENCAO: "bg-yellow-100 text-yellow-800",
  BAIXADO: "bg-red-100 text-red-800",
  DEVOLVIDO: "bg-blue-100 text-blue-800",
}

const STATUS_LABELS: Record<string, string> = {
  ATIVO: "Ativo",
  EM_MANUTENCAO: "Em Manutenção",
  BAIXADO: "Baixado",
  DEVOLVIDO: "Devolvido",
}

const TIPO_LABELS: Record<string, string> = {
  BEM_PROPRIO: "Bem Próprio",
  BEM_LOCADO: "Bem Locado",
  BEM_SERVIDOR: "Bem Servidor",
  BEM_COMODATO: "Bem Comodato",
}

const TIPO_ICONS: Record<string, any> = {
  BEM_PROPRIO: Building2,
  BEM_LOCADO: Handshake,
  BEM_SERVIDOR: Users,
  BEM_COMODATO: Handshake,
}

export default function PatrimonioPage() {
  const [bens, setBens] = useState<any[]>([])
  const [categorias, setCategorias] = useState<any[]>([])
  const [resumo, setResumo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState("")
  const [filtroTipo, setFiltroTipo] = useState<string>("todos")
  const [filtroStatus, setFiltroStatus] = useState<string>("todos")
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todos")
  const [excluirDialog, setExcluirDialog] = useState<string | null>(null)

  const carregarDados = async () => {
    setLoading(true)
    try {
      const filtros: any = {}
      if (filtroTipo !== "todos") filtros.tipo = filtroTipo
      if (filtroStatus !== "todos") filtros.status = filtroStatus
      if (filtroCategoria !== "todos") filtros.categoria_id = filtroCategoria
      if (busca) filtros.busca = busca

      const [bensData, categoriasData, resumoData] = await Promise.all([
        listarBens(filtros),
        listarCategorias(),
        relatorioResumo(),
      ])
      setBens(bensData)
      setCategorias(categoriasData)
      setResumo(resumoData)
    } catch (error) {
      console.error("Erro ao carregar dados:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [filtroTipo, filtroStatus, filtroCategoria])

  const handleBusca = () => {
    carregarDados()
  }

  const handleExcluir = async (id: string) => {
    try {
      await excluirBem(id)
      setExcluirDialog(null)
      carregarDados()
    } catch (error) {
      console.error("Erro ao excluir:", error)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Controle de Patrimônio</h1>
          <p className="text-muted-foreground">Gestão de bens patrimoniais do órgão</p>
        </div>
        <div className="flex gap-2">
          <Link href="/orgao/patrimonio/etiquetas">
            <Button variant="outline"><Tag className="h-4 w-4 mr-2" />Etiquetas</Button>
          </Link>
          <Link href="/orgao/patrimonio/relatorios">
            <Button variant="outline"><FileText className="h-4 w-4 mr-2" />Relatórios</Button>
          </Link>
          <Link href="/orgao/patrimonio/categorias">
            <Button variant="outline"><FolderOpen className="h-4 w-4 mr-2" />Categorias</Button>
          </Link>
          <Link href="/orgao/patrimonio/novo">
            <Button><Plus className="h-4 w-4 mr-2" />Novo Bem</Button>
          </Link>
        </div>
      </div>

      {/* Cards de resumo */}
      {resumo && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total de Bens</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{resumo.total_bens}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Em Manutenção</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{resumo.manutencoes_ativas || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Locações Vencendo</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{resumo.locacoes_vencendo_30dias || 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Categorias</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{Object.keys(resumo.por_categoria || {}).length}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            placeholder="Buscar por descrição ou plaqueta..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleBusca()}
          />
        </div>
        <Select value={filtroTipo} onValueChange={setFiltroTipo}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os tipos</SelectItem>
            <SelectItem value="BEM_PROPRIO">Bem Próprio</SelectItem>
            <SelectItem value="BEM_LOCADO">Bem Locado</SelectItem>
            <SelectItem value="BEM_SERVIDOR">Bem Servidor</SelectItem>
            <SelectItem value="BEM_COMODATO">Bem Comodato</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            <SelectItem value="ATIVO">Ativo</SelectItem>
            <SelectItem value="EM_MANUTENCAO">Em Manutenção</SelectItem>
            <SelectItem value="BAIXADO">Baixado</SelectItem>
            <SelectItem value="DEVOLVIDO">Devolvido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todas as categorias</SelectItem>
            {categorias.map((cat: any) => (
              <SelectItem key={cat.id} value={cat.id}>{cat.nome}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleBusca} variant="secondary">
          <Search className="h-4 w-4 mr-2" />Buscar
        </Button>
      </div>

      {/* Tabela */}
      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Plaqueta</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Categoria</TableHead>
              <TableHead>Qtd</TableHead>
              <TableHead>Localização</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Carregando...
                </TableCell>
              </TableRow>
            ) : bens.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Nenhum bem encontrado
                </TableCell>
              </TableRow>
            ) : (
              bens.map((bem: any) => (
                <TableRow key={bem.id}>
                  <TableCell className="font-mono text-sm">{bem.plaqueta || "-"}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{bem.descricao}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{TIPO_LABELS[bem.tipo] || bem.tipo}</Badge>
                  </TableCell>
                  <TableCell>{bem.categoria?.nome || "-"}</TableCell>
                  <TableCell>{bem.quantidade}</TableCell>
                  <TableCell className="text-sm">
                    {bem.localizacao_nome ? `${bem.localizacao_nome}${bem.localizacao_codigo ? ` (${bem.localizacao_codigo})` : ''}` : "-"}
                  </TableCell>
                  <TableCell className="text-sm">{bem.responsavel_nome || "-"}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[bem.status] || ""}>
                      {STATUS_LABELS[bem.status] || bem.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Link href={`/orgao/patrimonio/${bem.id}`}>
                        <Button size="sm" variant="ghost">Ver</Button>
                      </Link>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600"
                        onClick={() => setExcluirDialog(bem.id)}
                      >
                        Excluir
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog de exclusão */}
      <Dialog open={!!excluirDialog} onOpenChange={() => setExcluirDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Exclusão</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir este bem? Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluirDialog(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => excluirDialog && handleExcluir(excluirDialog)}>
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
