"use client"

import { useState, useEffect } from "react"
import { 
  Search,
  Building2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  FileText,
  Users
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

interface Fornecedor {
  id: string
  razao_social: string
  cpf_cnpj: string
  porte?: string
  cidade?: string
  uf?: string
  status: string
}

export default function FornecedoresPage() {
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchFornecedores = async () => {
      try {
        const res = await fetch(`${API_URL}/api/fornecedores`)
        if (res.ok) {
          const data = await res.json()
          setFornecedores(data)
        }
      } catch (error) {
        console.error('Erro ao buscar fornecedores:', error)
      } finally {
        setLoading(false)
      }
    }
    fetchFornecedores()
  }, [])

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string; icon: any }> = {
      ATIVO: { label: 'Ativo', className: 'bg-green-100 text-green-800', icon: CheckCircle2 },
      SUSPENSO: { label: 'Suspenso', className: 'bg-red-100 text-red-800', icon: XCircle },
      PENDENTE: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
    }
    const config = map[status] || { label: status, className: 'bg-gray-100', icon: AlertCircle }
    const Icon = config.icon
    return <Badge className={config.className}><Icon className="w-3 h-3 mr-1" /> {config.label}</Badge>
  }

  const filteredFornecedores = fornecedores.filter(f => {
    if (busca && !f.razao_social?.toLowerCase().includes(busca.toLowerCase()) && !f.cpf_cnpj?.includes(busca)) return false
    if (filtroStatus && filtroStatus !== 'all' && f.status !== filtroStatus) return false
    return true
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Fornecedores</h1>
        <p className="text-muted-foreground">Fornecedores cadastrados e participantes</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Total Cadastrados</p>
            <p className="text-2xl font-bold">{fornecedores.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Ativos</p>
            <p className="text-2xl font-bold text-green-600">{fornecedores.filter(f => f.status === 'ATIVO').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">ME/EPP</p>
            <p className="text-2xl font-bold text-blue-600">{fornecedores.filter(f => f.porte === 'ME' || f.porte === 'EPP').length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">Pendentes</p>
            <p className="text-2xl font-bold text-orange-600">{fornecedores.filter(f => f.status === 'PENDENTE').length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Buscar por razao social ou CNPJ..." 
                  className="pl-10"
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                />
              </div>
            </div>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="ATIVO">Ativos</SelectItem>
                <SelectItem value="SUSPENSO">Suspensos</SelectItem>
                <SelectItem value="PENDENTE">Pendentes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle>Fornecedores ({filteredFornecedores.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Carregando fornecedores...
            </div>
          ) : filteredFornecedores.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhum fornecedor cadastrado</p>
              <p className="text-sm">Os fornecedores aparecerão aqui quando se cadastrarem no sistema</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>Porte</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFornecedores.map((fornecedor) => (
                  <TableRow key={fornecedor.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{fornecedor.razao_social}</p>
                        <p className="text-xs text-muted-foreground">{fornecedor.cpf_cnpj}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{fornecedor.porte || '-'}</Badge>
                    </TableCell>
                    <TableCell>
                      {fornecedor.cidade && fornecedor.uf ? `${fornecedor.cidade}/${fornecedor.uf}` : '-'}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(fornecedor.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="sm">
                          <FileText className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
