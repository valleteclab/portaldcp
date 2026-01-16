'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Loader2,
  Building2,
  Users,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Clock,
  Eye,
  Ban,
  RotateCcw,
  Phone,
  Mail,
  MapPin,
  Calendar,
  FileText,
  RefreshCw
} from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface Fornecedor {
  id: string
  razao_social: string
  nome_fantasia?: string
  cnpj: string
  cpf_cnpj?: string
  porte?: string
  municipio?: string
  cidade?: string
  uf?: string
  status: string
  email?: string
  telefone?: string
  logradouro?: string
  numero?: string
  bairro?: string
  cep?: string
  representante_nome?: string
  representante_cpf?: string
  representante_cargo?: string
  nivel_atual?: string
  created_at?: string
  updated_at?: string
  observacoes?: string
  data_validade_cadastro?: string
}

export default function AdminFornecedoresPage() {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('all')
  
  // Estados para modais
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null)
  const [modalDetalhes, setModalDetalhes] = useState(false)
  const [modalSuspender, setModalSuspender] = useState(false)
  const [motivoSuspensao, setMotivoSuspensao] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchFornecedores = async () => {
    setLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedores`)
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
    fetchFornecedores()
  }, [])

  const handleVerDetalhes = (fornecedor: Fornecedor) => {
    setFornecedorSelecionado(fornecedor)
    setModalDetalhes(true)
  }

  const handleAbrirSuspender = (fornecedor: Fornecedor) => {
    setFornecedorSelecionado(fornecedor)
    setMotivoSuspensao('')
    setModalSuspender(true)
  }

  const handleAprovar = async (fornecedor: Fornecedor) => {
    if (!confirm(`Deseja aprovar o fornecedor ${fornecedor.razao_social}?`)) return
    
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedores/${fornecedor.id}/aprovar`, {
        method: 'PUT'
      })
      
      if (res.ok) {
        await fetchFornecedores()
      } else {
        alert('Erro ao aprovar fornecedor')
      }
    } catch (error) {
      console.error('Erro ao aprovar:', error)
      alert('Erro ao aprovar fornecedor')
    } finally {
      setActionLoading(false)
    }
  }

  const handleSuspender = async () => {
    if (!fornecedorSelecionado || !motivoSuspensao.trim()) return
    
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedores/${fornecedorSelecionado.id}/suspender`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ motivo: motivoSuspensao })
      })
      
      if (res.ok) {
        await fetchFornecedores()
        setModalSuspender(false)
        setFornecedorSelecionado(null)
      } else {
        alert('Erro ao suspender fornecedor')
      }
    } catch (error) {
      console.error('Erro ao suspender:', error)
      alert('Erro ao suspender fornecedor')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReativar = async (fornecedor: Fornecedor) => {
    if (!confirm(`Deseja reativar o fornecedor ${fornecedor.razao_social}?`)) return
    
    setActionLoading(true)
    try {
      const res = await authFetch(`${API_URL}/api/fornecedores/${fornecedor.id}/reativar`, {
        method: 'PUT'
      })
      
      if (res.ok) {
        await fetchFornecedores()
      } else {
        alert('Erro ao reativar fornecedor')
      }
    } catch (error) {
      console.error('Erro ao reativar:', error)
      alert('Erro ao reativar fornecedor')
    } finally {
      setActionLoading(false)
    }
  }

  const formatarData = (data?: string) => {
    if (!data) return '-'
    return new Date(data).toLocaleDateString('pt-BR')
  }

  const formatarCpfCnpj = (valor?: string) => {
    if (!valor) return '-'
    const limpo = valor.replace(/\D/g, '')
    if (limpo.length === 11) {
      return limpo.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    }
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
      EM_ANALISE: { label: 'Em Análise', className: 'bg-blue-100 text-blue-800', icon: Clock },
      REJEITADO: { label: 'Rejeitado', className: 'bg-red-100 text-red-800', icon: XCircle },
    }
    const config = map[status] || { label: status, className: 'bg-gray-100 text-gray-800', icon: AlertCircle }
    const Icon = config.icon
    return <Badge className={config.className}><Icon className="w-3 h-3 mr-1" /> {config.label}</Badge>
  }

  const getNivelBadge = (nivel?: string) => {
    if (!nivel) return <Badge variant="outline">-</Badge>
    const map: Record<string, string> = {
      NIVEL_I: 'Nível I',
      NIVEL_II: 'Nível II',
      NIVEL_III: 'Nível III',
      NIVEL_IV: 'Nível IV',
      NIVEL_V: 'Nível V',
      NIVEL_VI: 'Nível VI',
    }
    return <Badge variant="outline">{map[nivel] || nivel}</Badge>
  }

  const filteredFornecedores = fornecedores.filter(f => {
    const cnpj = f.cnpj || f.cpf_cnpj || ''
    if (busca && !f.razao_social?.toLowerCase().includes(busca.toLowerCase()) && !cnpj.includes(busca)) return false
    if (filtroStatus && filtroStatus !== 'all' && f.status !== filtroStatus) return false
    return true
  })

  const stats = {
    total: fornecedores.length,
    aprovados: fornecedores.filter(f => f.status === 'APROVADO' || f.status === 'ATIVO').length,
    suspensos: fornecedores.filter(f => f.status === 'SUSPENSO').length,
    pendentes: fornecedores.filter(f => f.status === 'PENDENTE').length,
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Gerenciamento de Fornecedores</h1>
          <p className="text-muted-foreground">Administração de todos os fornecedores cadastrados no sistema</p>
        </div>
        <Button variant="outline" onClick={fetchFornecedores} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg">
                <Users className="h-5 w-5 text-slate-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Cadastrados</p>
                <p className="text-2xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Aprovados</p>
                <p className="text-2xl font-bold text-green-600">{stats.aprovados}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Suspensos</p>
                <p className="text-2xl font-bold text-red-600">{stats.suspensos}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pendentes</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.pendentes}</p>
              </div>
            </div>
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
                  placeholder="Buscar por razão social ou CNPJ..." 
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
                <SelectItem value="all">Todos os Status</SelectItem>
                <SelectItem value="APROVADO">Aprovados</SelectItem>
                <SelectItem value="SUSPENSO">Suspensos</SelectItem>
                <SelectItem value="PENDENTE">Pendentes</SelectItem>
                <SelectItem value="EM_ANALISE">Em Análise</SelectItem>
              </SelectContent>
            </Select>
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
              <p>Nenhum fornecedor encontrado</p>
              <p className="text-sm">Ajuste os filtros ou aguarde novos cadastros</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Localização</TableHead>
                  <TableHead>Nível</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Cadastro</TableHead>
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
                      {formatarCpfCnpj(fornecedor.cnpj || fornecedor.cpf_cnpj)}
                    </TableCell>
                    <TableCell>
                      {(fornecedor.municipio || fornecedor.cidade) && fornecedor.uf 
                        ? `${fornecedor.municipio || fornecedor.cidade}/${fornecedor.uf}` 
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {getNivelBadge(fornecedor.nivel_atual)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(fornecedor.status)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatarData(fornecedor.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          title="Ver detalhes"
                          onClick={() => handleVerDetalhes(fornecedor)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {(fornecedor.status === 'PENDENTE' || fornecedor.status === 'EM_ANALISE') && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            title="Aprovar fornecedor"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleAprovar(fornecedor)}
                            disabled={actionLoading}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                          </Button>
                        )}
                        {(fornecedor.status === 'APROVADO' || fornecedor.status === 'ATIVO') && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            title="Suspender fornecedor"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleAbrirSuspender(fornecedor)}
                            disabled={actionLoading}
                          >
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        {fornecedor.status === 'SUSPENSO' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            title="Reativar fornecedor"
                            className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={() => handleReativar(fornecedor)}
                            disabled={actionLoading}
                          >
                            <RotateCcw className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Fornecedor</DialogTitle>
            <DialogDescription>
              Informações completas do cadastro
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
                <div className="flex gap-2">
                  {getNivelBadge(fornecedorSelecionado.nivel_atual)}
                  {getStatusBadge(fornecedorSelecionado.status)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-muted-foreground">CNPJ</p>
                    <p className="font-medium font-mono">{formatarCpfCnpj(fornecedorSelecionado.cnpj || fornecedorSelecionado.cpf_cnpj)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Porte</p>
                    <p className="font-medium">{fornecedorSelecionado.porte || '-'}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{fornecedorSelecionado.email || '-'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{fornecedorSelecionado.telefone || '-'}</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <div className="text-sm">
                      <p>{fornecedorSelecionado.logradouro}{fornecedorSelecionado.numero ? `, ${fornecedorSelecionado.numero}` : ''}</p>
                      <p>{fornecedorSelecionado.bairro}</p>
                      <p>{fornecedorSelecionado.municipio || fornecedorSelecionado.cidade}/{fornecedorSelecionado.uf} - {fornecedorSelecionado.cep}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Cadastrado em: {formatarData(fornecedorSelecionado.created_at)}</span>
                  </div>
                  {fornecedorSelecionado.data_validade_cadastro && (
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">Validade: {formatarData(fornecedorSelecionado.data_validade_cadastro)}</span>
                    </div>
                  )}
                </div>
              </div>

              {fornecedorSelecionado.representante_nome && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Representante Legal</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Nome</p>
                      <p>{fornecedorSelecionado.representante_nome}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">CPF</p>
                      <p className="font-mono">{formatarCpfCnpj(fornecedorSelecionado.representante_cpf)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Cargo</p>
                      <p>{fornecedorSelecionado.representante_cargo || '-'}</p>
                    </div>
                  </div>
                </div>
              )}

              {fornecedorSelecionado.observacoes && (
                <div className="border-t pt-4">
                  <h4 className="font-medium mb-2">Observações</h4>
                  <p className="text-sm text-muted-foreground bg-slate-50 p-3 rounded">{fornecedorSelecionado.observacoes}</p>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalDetalhes(false)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal de Suspensão */}
      <Dialog open={modalSuspender} onOpenChange={setModalSuspender}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">Suspender Fornecedor</DialogTitle>
            <DialogDescription>
              Esta ação impedirá o fornecedor de participar de novas licitações.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-slate-50 p-3 rounded">
              <p className="font-medium">{fornecedorSelecionado?.razao_social}</p>
              <p className="text-sm text-muted-foreground font-mono">
                {formatarCpfCnpj(fornecedorSelecionado?.cnpj || fornecedorSelecionado?.cpf_cnpj)}
              </p>
            </div>
            <div>
              <Label htmlFor="motivo">Motivo da Suspensão *</Label>
              <Textarea
                id="motivo"
                placeholder="Descreva o motivo da suspensão (obrigatório)..."
                value={motivoSuspensao}
                onChange={(e) => setMotivoSuspensao(e.target.value)}
                rows={4}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalSuspender(false)}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleSuspender}
              disabled={!motivoSuspensao.trim() || actionLoading}
            >
              {actionLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Suspendendo...
                </>
              ) : (
                'Confirmar Suspensão'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
