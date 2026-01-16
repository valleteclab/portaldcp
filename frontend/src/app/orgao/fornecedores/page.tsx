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
  Users,
  Phone,
  Mail,
  Clock,
  RefreshCw,
  Loader2,
  TrendingUp
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

import { API_URL, authFetch } from '@/lib/api'

interface FornecedorParticipante {
  id: string
  razao_social: string
  nome_fantasia?: string
  cnpj: string
  porte?: string
  municipio?: string
  uf?: string
  status: string
  email?: string
  telefone?: string
  total_propostas: number
  total_licitacoes: number
  ultima_proposta: string
}

export default function FornecedoresOrgaoPage() {
  const [busca, setBusca] = useState('')
  const [fornecedores, setFornecedores] = useState<FornecedorParticipante[]>([])
  const [loading, setLoading] = useState(true)
  const [orgaoId, setOrgaoId] = useState<string | null>(null)
  
  // Estados para modal
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<FornecedorParticipante | null>(null)
  const [modalDetalhes, setModalDetalhes] = useState(false)

  useEffect(() => {
    const orgaoStr = localStorage.getItem('orgao')
    if (orgaoStr) {
      try {
        const orgao = JSON.parse(orgaoStr)
        setOrgaoId(orgao.id)
      } catch (e) {
        console.error('Erro ao parsear orgao:', e)
      }
    }
  }, [])

  const fetchFornecedores = async () => {
    if (!orgaoId) return
    
    setLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/propostas/orgao/${orgaoId}/fornecedores`)
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

  useEffect(() => {
    if (orgaoId) {
      fetchFornecedores()
    }
  }, [orgaoId])

  const handleVerDetalhes = (fornecedor: FornecedorParticipante) => {
    setFornecedorSelecionado(fornecedor)
    setModalDetalhes(true)
  }

  const formatarData = (data?: string) => {
    if (!data) return '-'
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const formatarCnpj = (valor?: string) => {
    if (!valor) return '-'
    const limpo = valor.replace(/\D/g, '')
    if (limpo.length === 14) {
      return limpo.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
    }
    return valor
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; className: string; icon: any }> = {
      APROVADO: { label: 'Aprovado', className: 'bg-green-100 text-green-800', icon: CheckCircle2 },
      ATIVO: { label: 'Ativo', className: 'bg-green-100 text-green-800', icon: CheckCircle2 },
      SUSPENSO: { label: 'Suspenso', className: 'bg-red-100 text-red-800', icon: XCircle },
      PENDENTE: { label: 'Pendente', className: 'bg-yellow-100 text-yellow-800', icon: AlertCircle },
    }
    const config = map[status] || { label: status, className: 'bg-gray-100 text-gray-800', icon: AlertCircle }
    const Icon = config.icon
    return <Badge className={config.className}><Icon className="w-3 h-3 mr-1" /> {config.label}</Badge>
  }

  const filteredFornecedores = fornecedores.filter(f => {
    if (busca && !f.razao_social?.toLowerCase().includes(busca.toLowerCase()) && !f.cnpj?.includes(busca)) return false
    return true
  })

  const totalPropostas = fornecedores.reduce((acc, f) => acc + Number(f.total_propostas || 0), 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Fornecedores Participantes</h1>
          <p className="text-muted-foreground">Fornecedores que enviaram propostas para suas licitações</p>
        </div>
        <Button variant="outline" onClick={fetchFornecedores} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Users className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Fornecedores</p>
                <p className="text-2xl font-bold">{fornecedores.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <FileText className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total de Propostas</p>
                <p className="text-2xl font-bold text-green-600">{totalPropostas}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 rounded-lg">
                <TrendingUp className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Média por Fornecedor</p>
                <p className="text-2xl font-bold text-purple-600">
                  {fornecedores.length > 0 ? (totalPropostas / fornecedores.length).toFixed(1) : '0'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              placeholder="Buscar por razão social ou CNPJ..." 
              className="pl-10"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Tabela */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Fornecedores ({filteredFornecedores.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredFornecedores.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>Nenhum fornecedor participante</p>
              <p className="text-sm">Os fornecedores aparecerão aqui quando enviarem propostas para suas licitações</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead className="text-center">Propostas</TableHead>
                  <TableHead className="text-center">Licitações</TableHead>
                  <TableHead>Última Proposta</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredFornecedores.map((fornecedor) => (
                  <TableRow key={fornecedor.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{fornecedor.razao_social || '-'}</p>
                        {fornecedor.nome_fantasia && (
                          <p className="text-xs text-muted-foreground">{fornecedor.nome_fantasia}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {formatarCnpj(fornecedor.cnpj)}
                    </TableCell>
                    <TableCell>
                      {fornecedor.municipio && fornecedor.uf 
                        ? `${fornecedor.municipio}/${fornecedor.uf}` 
                        : '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{fornecedor.total_propostas}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{fornecedor.total_licitacoes}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatarData(fornecedor.ultima_proposta)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(fornecedor.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        title="Ver detalhes"
                        onClick={() => handleVerDetalhes(fornecedor)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalhes */}
      <Dialog open={modalDetalhes} onOpenChange={setModalDetalhes}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes do Fornecedor</DialogTitle>
            <DialogDescription>
              Informações do fornecedor participante
            </DialogDescription>
          </DialogHeader>
          {fornecedorSelecionado && (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold">{fornecedorSelecionado.razao_social}</h3>
                  {fornecedorSelecionado.nome_fantasia && (
                    <p className="text-sm text-muted-foreground">{fornecedorSelecionado.nome_fantasia}</p>
                  )}
                </div>
                {getStatusBadge(fornecedorSelecionado.status)}
              </div>

              <div className="space-y-3 border-t pt-4">
                <div>
                  <p className="text-xs text-muted-foreground">CNPJ</p>
                  <p className="font-medium font-mono">{formatarCnpj(fornecedorSelecionado.cnpj)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Porte</p>
                  <p className="font-medium">{fornecedorSelecionado.porte || '-'}</p>
                </div>
                {fornecedorSelecionado.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{fornecedorSelecionado.email}</span>
                  </div>
                )}
                {fornecedorSelecionado.telefone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{fornecedorSelecionado.telefone}</span>
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Participação nas suas licitações</h4>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{fornecedorSelecionado.total_propostas}</p>
                    <p className="text-xs text-muted-foreground">Propostas</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{fornecedorSelecionado.total_licitacoes}</p>
                    <p className="text-xs text-muted-foreground">Licitações</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <p className="text-sm font-medium">{formatarData(fornecedorSelecionado.ultima_proposta)}</p>
                    <p className="text-xs text-muted-foreground">Última Proposta</p>
                  </div>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDetalhes(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
