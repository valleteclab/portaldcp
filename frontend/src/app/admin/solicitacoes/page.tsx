'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import {
  Building2,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Search,
  Loader2,
  Eye,
  Check,
  X,
  Mail,
  Phone,
  User,
  FileText
} from 'lucide-react'

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

interface Solicitacao {
  id: string
  cnpj: string
  razao_social: string
  email: string
  nome_responsavel: string
  telefone?: string
  cargo_responsavel?: string
  mensagem?: string
  status: 'PENDENTE' | 'APROVADA' | 'REJEITADA'
  motivo_rejeicao?: string
  aprovado_por?: string
  data_aprovacao?: string
  orgao_id?: string
  created_at: string
}

export default function AdminSolicitacoesPage() {
  const [loading, setLoading] = useState(true)
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([])
  const [filtroStatus, setFiltroStatus] = useState<string>('PENDENTE')
  const [busca, setBusca] = useState('')
  const [estatisticas, setEstatisticas] = useState({
    total: 0,
    pendentes: 0,
    aprovadas: 0,
    rejeitadas: 0
  })
  
  // Modal states
  const [showDetalhes, setShowDetalhes] = useState(false)
  const [showAprovar, setShowAprovar] = useState(false)
  const [showRejeitar, setShowRejeitar] = useState(false)
  const [solicitacaoSelecionada, setSolicitacaoSelecionada] = useState<Solicitacao | null>(null)
  const [processando, setProcessando] = useState(false)
  
  // Form de aprovação
  const [formAprovacao, setFormAprovacao] = useState({
    email_login: '',
    senha_temporaria: ''
  })
  
  // Form de rejeição
  const [motivoRejeicao, setMotivoRejeicao] = useState('')

  useEffect(() => {
    carregarDados()
  }, [filtroStatus])

  const carregarDados = async () => {
    setLoading(true)
    try {
      // Carregar estatísticas
      const statsRes = await fetch(`${API_URL}/api/solicitacoes-acesso/admin/estatisticas`)
      if (statsRes.ok) {
        const stats = await statsRes.json()
        setEstatisticas(stats)
      }

      // Carregar solicitações
      const url = filtroStatus === 'TODAS' 
        ? `${API_URL}/api/solicitacoes-acesso`
        : `${API_URL}/api/solicitacoes-acesso?status=${filtroStatus}`
      
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setSolicitacoes(data)
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const abrirDetalhes = (solicitacao: Solicitacao) => {
    setSolicitacaoSelecionada(solicitacao)
    setShowDetalhes(true)
  }

  const abrirAprovar = (solicitacao: Solicitacao) => {
    setSolicitacaoSelecionada(solicitacao)
    setFormAprovacao({
      email_login: solicitacao.email,
      senha_temporaria: ''
    })
    setShowAprovar(true)
  }

  const abrirRejeitar = (solicitacao: Solicitacao) => {
    setSolicitacaoSelecionada(solicitacao)
    setMotivoRejeicao('')
    setShowRejeitar(true)
  }

  const aprovarSolicitacao = async () => {
    if (!solicitacaoSelecionada) return
    
    setProcessando(true)
    try {
      const response = await fetch(`${API_URL}/api/solicitacoes-acesso/${solicitacaoSelecionada.id}/aprovar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aprovado_por: 'admin',
          criar_usuario: true,
          email_login: formAprovacao.email_login,
          senha_temporaria: formAprovacao.senha_temporaria || undefined
        })
      })

      if (response.ok) {
        const result = await response.json()
        alert(`✅ Solicitação aprovada!\n\nÓrgão criado com sucesso.\nEmail: ${result.credenciais?.email || formAprovacao.email_login}`)
        setShowAprovar(false)
        carregarDados()
      } else {
        const error = await response.json()
        alert('Erro: ' + error.message)
      }
    } catch (error) {
      console.error('Erro ao aprovar:', error)
      alert('Erro ao aprovar solicitação')
    } finally {
      setProcessando(false)
    }
  }

  const rejeitarSolicitacao = async () => {
    if (!solicitacaoSelecionada || !motivoRejeicao) return
    
    setProcessando(true)
    try {
      const response = await fetch(`${API_URL}/api/solicitacoes-acesso/${solicitacaoSelecionada.id}/rejeitar`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          motivo_rejeicao: motivoRejeicao,
          aprovado_por: 'admin'
        })
      })

      if (response.ok) {
        alert('Solicitação rejeitada')
        setShowRejeitar(false)
        carregarDados()
      } else {
        const error = await response.json()
        alert('Erro: ' + error.message)
      }
    } catch (error) {
      console.error('Erro ao rejeitar:', error)
      alert('Erro ao rejeitar solicitação')
    } finally {
      setProcessando(false)
    }
  }

  const formatarCNPJ = (cnpj: string) => {
    const numeros = cnpj.replace(/\D/g, '')
    return numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR')
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDENTE':
        return <Badge className="bg-yellow-100 text-yellow-800"><Clock className="w-3 h-3 mr-1" />Pendente</Badge>
      case 'APROVADA':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Aprovada</Badge>
      case 'REJEITADA':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Rejeitada</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  const solicitacoesFiltradas = solicitacoes.filter(s =>
    s.razao_social.toLowerCase().includes(busca.toLowerCase()) ||
    s.cnpj.includes(busca) ||
    s.email.toLowerCase().includes(busca.toLowerCase())
  )

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
        <p>Carregando solicitações...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <FileText className="w-7 h-7" />
            Solicitações de Acesso
          </h1>
          <p className="text-gray-500">
            Gerencie as solicitações de acesso de órgãos públicos
          </p>
        </div>
        <Button onClick={carregarDados}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:shadow-md" onClick={() => setFiltroStatus('TODAS')}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total</p>
                <p className="text-2xl font-bold">{estatisticas.total}</p>
              </div>
              <FileText className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md" onClick={() => setFiltroStatus('PENDENTE')}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Pendentes</p>
                <p className="text-2xl font-bold text-yellow-600">{estatisticas.pendentes}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md" onClick={() => setFiltroStatus('APROVADA')}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Aprovadas</p>
                <p className="text-2xl font-bold text-green-600">{estatisticas.aprovadas}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:shadow-md" onClick={() => setFiltroStatus('REJEITADA')}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Rejeitadas</p>
                <p className="text-2xl font-bold text-red-600">{estatisticas.rejeitadas}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Buscar por nome, CNPJ ou email..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={filtroStatus} onValueChange={setFiltroStatus}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Filtrar por status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="TODAS">Todas</SelectItem>
            <SelectItem value="PENDENTE">Pendentes</SelectItem>
            <SelectItem value="APROVADA">Aprovadas</SelectItem>
            <SelectItem value="REJEITADA">Rejeitadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {solicitacoesFiltradas.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhuma solicitação encontrada</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Órgão</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {solicitacoesFiltradas.map((solicitacao) => (
                  <TableRow key={solicitacao.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{solicitacao.razao_social}</p>
                        <p className="text-sm text-gray-500 font-mono">{formatarCNPJ(solicitacao.cnpj)}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p>{solicitacao.nome_responsavel}</p>
                        {solicitacao.cargo_responsavel && (
                          <p className="text-sm text-gray-500">{solicitacao.cargo_responsavel}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        <p className="flex items-center gap-1">
                          <Mail className="w-3 h-3" /> {solicitacao.email}
                        </p>
                        {solicitacao.telefone && (
                          <p className="flex items-center gap-1 text-gray-500">
                            <Phone className="w-3 h-3" /> {solicitacao.telefone}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatarData(solicitacao.created_at)}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(solicitacao.status)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => abrirDetalhes(solicitacao)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {solicitacao.status === 'PENDENTE' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => abrirAprovar(solicitacao)}
                            >
                              <Check className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => abrirRejeitar(solicitacao)}
                            >
                              <X className="w-4 h-4" />
                            </Button>
                          </>
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

      {/* Modal Detalhes */}
      <Dialog open={showDetalhes} onOpenChange={setShowDetalhes}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Detalhes da Solicitação</DialogTitle>
          </DialogHeader>
          {solicitacaoSelecionada && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">CNPJ</Label>
                  <p className="font-mono">{formatarCNPJ(solicitacaoSelecionada.cnpj)}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Status</Label>
                  <p>{getStatusBadge(solicitacaoSelecionada.status)}</p>
                </div>
              </div>
              <div>
                <Label className="text-gray-500">Razão Social</Label>
                <p className="font-medium">{solicitacaoSelecionada.razao_social}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">Responsável</Label>
                  <p>{solicitacaoSelecionada.nome_responsavel}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Cargo</Label>
                  <p>{solicitacaoSelecionada.cargo_responsavel || '-'}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">Email</Label>
                  <p>{solicitacaoSelecionada.email}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Telefone</Label>
                  <p>{solicitacaoSelecionada.telefone || '-'}</p>
                </div>
              </div>
              {solicitacaoSelecionada.mensagem && (
                <div>
                  <Label className="text-gray-500">Mensagem</Label>
                  <p className="text-sm bg-gray-50 p-3 rounded">{solicitacaoSelecionada.mensagem}</p>
                </div>
              )}
              <div>
                <Label className="text-gray-500">Data da Solicitação</Label>
                <p>{formatarData(solicitacaoSelecionada.created_at)}</p>
              </div>
              {solicitacaoSelecionada.status !== 'PENDENTE' && (
                <div className="border-t pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-gray-500">Processado por</Label>
                      <p>{solicitacaoSelecionada.aprovado_por}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500">Data</Label>
                      <p>{solicitacaoSelecionada.data_aprovacao ? formatarData(solicitacaoSelecionada.data_aprovacao) : '-'}</p>
                    </div>
                  </div>
                  {solicitacaoSelecionada.motivo_rejeicao && (
                    <div className="mt-4">
                      <Label className="text-gray-500">Motivo da Rejeição</Label>
                      <p className="text-sm bg-red-50 p-3 rounded text-red-700">{solicitacaoSelecionada.motivo_rejeicao}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Aprovar */}
      <Dialog open={showAprovar} onOpenChange={setShowAprovar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              Aprovar Solicitação
            </DialogTitle>
            <DialogDescription>
              {solicitacaoSelecionada?.razao_social}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-green-50 rounded-lg text-sm text-green-700">
              Ao aprovar, um novo órgão será criado no sistema com as credenciais abaixo.
            </div>
            <div className="space-y-2">
              <Label>Email de Login</Label>
              <Input
                value={formAprovacao.email_login}
                onChange={(e) => setFormAprovacao({ ...formAprovacao, email_login: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Senha Temporária (opcional)</Label>
              <Input
                value={formAprovacao.senha_temporaria}
                onChange={(e) => setFormAprovacao({ ...formAprovacao, senha_temporaria: e.target.value })}
                placeholder="Deixe vazio para gerar automaticamente"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowAprovar(false)}>
                Cancelar
              </Button>
              <Button 
                className="bg-green-600 hover:bg-green-700"
                onClick={aprovarSolicitacao}
                disabled={processando}
              >
                {processando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Check className="w-4 h-4 mr-2" />}
                Aprovar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Rejeitar */}
      <Dialog open={showRejeitar} onOpenChange={setShowRejeitar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <XCircle className="w-5 h-5" />
              Rejeitar Solicitação
            </DialogTitle>
            <DialogDescription>
              {solicitacaoSelecionada?.razao_social}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Motivo da Rejeição *</Label>
              <Textarea
                value={motivoRejeicao}
                onChange={(e) => setMotivoRejeicao(e.target.value)}
                placeholder="Informe o motivo da rejeição..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowRejeitar(false)}>
                Cancelar
              </Button>
              <Button 
                variant="destructive"
                onClick={rejeitarSolicitacao}
                disabled={processando || !motivoRejeicao}
              >
                {processando ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <X className="w-4 h-4 mr-2" />}
                Rejeitar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
