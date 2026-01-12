'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft,
  Building2,
  Users,
  UserPlus,
  Search,
  Loader2,
  Shield,
  Gavel,
  UserCog,
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
} from 'lucide-react'

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

interface Orgao {
  id: string
  nome: string
  cnpj: string
  email_login?: string
}

interface Usuario {
  id: string
  nome: string
  email: string
  cpf?: string
  telefone?: string
  cargo?: string
  role: 'ADMIN' | 'PREGOEIRO' | 'EQUIPE_APOIO'
  orgao_id?: string
  orgao?: Orgao
  ativo: boolean
  created_at: string
}

const roleLabels: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  ADMIN: { label: 'Administrador', color: 'bg-red-500', icon: <Shield className="h-3 w-3" /> },
  PREGOEIRO: { label: 'Pregoeiro', color: 'bg-blue-500', icon: <Gavel className="h-3 w-3" /> },
  EQUIPE_APOIO: { label: 'Equipe de Apoio', color: 'bg-green-500', icon: <UserCog className="h-3 w-3" /> },
}

export default function AdminUsuariosPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [orgaos, setOrgaos] = useState<Orgao[]>([])
  const [busca, setBusca] = useState('')
  const [filtroOrgao, setFiltroOrgao] = useState<string>('todos')
  const [filtroRole, setFiltroRole] = useState<string>('todos')
  const [erro, setErro] = useState<string | null>(null)

  // Modal states
  const [showNovoUsuario, setShowNovoUsuario] = useState(false)
  const [showEditarUsuario, setShowEditarUsuario] = useState(false)
  const [showConfirmarExclusao, setShowConfirmarExclusao] = useState(false)
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<Usuario | null>(null)
  const [salvando, setSalvando] = useState(false)

  const [formUsuario, setFormUsuario] = useState({
    nome: '',
    email: '',
    senha: '',
    cpf: '',
    telefone: '',
    cargo: '',
    role: 'PREGOEIRO' as 'ADMIN' | 'PREGOEIRO' | 'EQUIPE_APOIO',
    orgao_id: '',
  })

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    setErro(null)
    try {
      const [resUsuarios, resOrgaos] = await Promise.all([
        fetch(`${API_URL}/api/usuarios`),
        fetch(`${API_URL}/api/orgaos`),
      ])

      if (resUsuarios.ok) {
        const data = await resUsuarios.json()
        setUsuarios(Array.isArray(data) ? data : data.value || [])
      }

      if (resOrgaos.ok) {
        const data = await resOrgaos.json()
        setOrgaos(Array.isArray(data) ? data : data.value || [])
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
      setErro('Erro ao carregar dados')
    } finally {
      setLoading(false)
    }
  }

  const handleNovoUsuario = () => {
    setFormUsuario({
      nome: '',
      email: '',
      senha: '',
      cpf: '',
      telefone: '',
      cargo: '',
      role: 'PREGOEIRO',
      orgao_id: '',
    })
    setShowNovoUsuario(true)
  }

  const handleEditarUsuario = (usuario: Usuario) => {
    setUsuarioSelecionado(usuario)
    setFormUsuario({
      nome: usuario.nome,
      email: usuario.email,
      senha: '',
      cpf: usuario.cpf || '',
      telefone: usuario.telefone || '',
      cargo: usuario.cargo || '',
      role: usuario.role,
      orgao_id: usuario.orgao_id || '',
    })
    setShowEditarUsuario(true)
  }

  const handleExcluirUsuario = (usuario: Usuario) => {
    setUsuarioSelecionado(usuario)
    setShowConfirmarExclusao(true)
  }

  const salvarUsuario = async () => {
    if (!formUsuario.nome || !formUsuario.email || !formUsuario.orgao_id) {
      setErro('Preencha nome, email e órgão')
      return
    }

    if (!showEditarUsuario && !formUsuario.senha) {
      setErro('Senha é obrigatória para novo usuário')
      return
    }

    setSalvando(true)
    setErro(null)

    try {
      const url = showEditarUsuario
        ? `${API_URL}/api/usuarios/${usuarioSelecionado?.id}`
        : `${API_URL}/api/usuarios`

      const method = showEditarUsuario ? 'PUT' : 'POST'

      const body: any = {
        nome: formUsuario.nome,
        email: formUsuario.email,
        cpf: formUsuario.cpf || undefined,
        telefone: formUsuario.telefone || undefined,
        cargo: formUsuario.cargo || undefined,
        role: formUsuario.role,
        orgao_id: formUsuario.orgao_id,
      }

      if (formUsuario.senha) {
        body.senha = formUsuario.senha
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Erro ao salvar usuário')
      }

      setShowNovoUsuario(false)
      setShowEditarUsuario(false)
      carregarDados()
    } catch (error: any) {
      setErro(error.message)
    } finally {
      setSalvando(false)
    }
  }

  const confirmarExclusao = async () => {
    if (!usuarioSelecionado) return

    setSalvando(true)
    try {
      const res = await fetch(`${API_URL}/api/usuarios/${usuarioSelecionado.id}`, {
        method: 'DELETE',
      })

      if (!res.ok) {
        throw new Error('Erro ao excluir usuário')
      }

      setShowConfirmarExclusao(false)
      setUsuarioSelecionado(null)
      carregarDados()
    } catch (error: any) {
      setErro(error.message)
    } finally {
      setSalvando(false)
    }
  }

  const toggleAtivo = async (usuario: Usuario) => {
    try {
      const res = await fetch(`${API_URL}/api/usuarios/${usuario.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: !usuario.ativo }),
      })

      if (res.ok) {
        carregarDados()
      }
    } catch (error) {
      console.error('Erro ao alterar status:', error)
    }
  }

  const usuariosFiltrados = usuarios.filter((u) => {
    const matchBusca =
      u.nome.toLowerCase().includes(busca.toLowerCase()) ||
      u.email.toLowerCase().includes(busca.toLowerCase())
    const matchOrgao = filtroOrgao === 'todos' || u.orgao_id === filtroOrgao
    const matchRole = filtroRole === 'todos' || u.role === filtroRole
    return matchBusca && matchOrgao && matchRole
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" onClick={() => router.push('/admin/pncp')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Users className="h-6 w-6" />
                Usuários do Sistema
              </h1>
              <p className="text-gray-500">Gerencie os usuários dos órgãos vinculados</p>
            </div>
          </div>
          <Button onClick={handleNovoUsuario}>
            <UserPlus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </div>

        {/* Filtros */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por nome ou email..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={filtroOrgao} onValueChange={setFiltroOrgao}>
                <SelectTrigger className="w-[250px]">
                  <Building2 className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filtrar por órgão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os órgãos</SelectItem>
                  {orgaos.map((orgao) => (
                    <SelectItem key={orgao.id} value={orgao.id}>
                      {orgao.nome.substring(0, 30)}...
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filtroRole} onValueChange={setFiltroRole}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filtrar por função" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas as funções</SelectItem>
                  <SelectItem value="ADMIN">Administrador</SelectItem>
                  <SelectItem value="PREGOEIRO">Pregoeiro</SelectItem>
                  <SelectItem value="EQUIPE_APOIO">Equipe de Apoio</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabela de Usuários */}
        <Card>
          <CardHeader>
            <CardTitle>Usuários Cadastrados</CardTitle>
            <CardDescription>
              {usuariosFiltrados.length} usuário(s) encontrado(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : usuariosFiltrados.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum usuário cadastrado</p>
                <Button variant="link" onClick={handleNovoUsuario}>
                  Cadastrar primeiro usuário
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Função</TableHead>
                    <TableHead>Órgão</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuariosFiltrados.map((usuario) => (
                    <TableRow key={usuario.id}>
                      <TableCell className="font-medium">{usuario.nome}</TableCell>
                      <TableCell>{usuario.email}</TableCell>
                      <TableCell>
                        <Badge className={`${roleLabels[usuario.role]?.color} text-white`}>
                          {roleLabels[usuario.role]?.icon}
                          <span className="ml-1">{roleLabels[usuario.role]?.label}</span>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {usuario.orgao?.nome?.substring(0, 25) || '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAtivo(usuario)}
                          className={usuario.ativo ? 'text-green-600' : 'text-red-600'}
                        >
                          {usuario.ativo ? (
                            <>
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Ativo
                            </>
                          ) : (
                            <>
                              <XCircle className="h-4 w-4 mr-1" />
                              Inativo
                            </>
                          )}
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditarUsuario(usuario)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => handleExcluirUsuario(usuario)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Modal Novo/Editar Usuário */}
        <Dialog
          open={showNovoUsuario || showEditarUsuario}
          onOpenChange={() => {
            setShowNovoUsuario(false)
            setShowEditarUsuario(false)
            setErro(null)
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {showEditarUsuario ? 'Editar Usuário' : 'Novo Usuário'}
              </DialogTitle>
              <DialogDescription>
                {showEditarUsuario
                  ? 'Atualize os dados do usuário'
                  : 'Cadastre um novo usuário para um órgão'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {erro && (
                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                  {erro}
                </div>
              )}

              <div>
                <Label>Órgão *</Label>
                <Select
                  value={formUsuario.orgao_id}
                  onValueChange={(v) => setFormUsuario({ ...formUsuario, orgao_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o órgão" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgaos.map((orgao) => (
                      <SelectItem key={orgao.id} value={orgao.id}>
                        {orgao.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Nome *</Label>
                <Input
                  value={formUsuario.nome}
                  onChange={(e) => setFormUsuario({ ...formUsuario, nome: e.target.value })}
                  placeholder="Nome completo"
                />
              </div>

              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={formUsuario.email}
                  onChange={(e) => setFormUsuario({ ...formUsuario, email: e.target.value })}
                  placeholder="email@exemplo.com"
                />
              </div>

              <div>
                <Label>{showEditarUsuario ? 'Nova Senha (deixe em branco para manter)' : 'Senha *'}</Label>
                <Input
                  type="password"
                  value={formUsuario.senha}
                  onChange={(e) => setFormUsuario({ ...formUsuario, senha: e.target.value })}
                  placeholder="••••••••"
                />
              </div>

              <div>
                <Label>Função *</Label>
                <Select
                  value={formUsuario.role}
                  onValueChange={(v: 'ADMIN' | 'PREGOEIRO' | 'EQUIPE_APOIO') =>
                    setFormUsuario({ ...formUsuario, role: v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ADMIN">
                      <div className="flex items-center gap-2">
                        <Shield className="h-4 w-4" />
                        Administrador
                      </div>
                    </SelectItem>
                    <SelectItem value="PREGOEIRO">
                      <div className="flex items-center gap-2">
                        <Gavel className="h-4 w-4" />
                        Pregoeiro
                      </div>
                    </SelectItem>
                    <SelectItem value="EQUIPE_APOIO">
                      <div className="flex items-center gap-2">
                        <UserCog className="h-4 w-4" />
                        Equipe de Apoio
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>CPF</Label>
                  <Input
                    value={formUsuario.cpf}
                    onChange={(e) => setFormUsuario({ ...formUsuario, cpf: e.target.value })}
                    placeholder="000.000.000-00"
                  />
                </div>
                <div>
                  <Label>Telefone</Label>
                  <Input
                    value={formUsuario.telefone}
                    onChange={(e) => setFormUsuario({ ...formUsuario, telefone: e.target.value })}
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div>
                <Label>Cargo</Label>
                <Input
                  value={formUsuario.cargo}
                  onChange={(e) => setFormUsuario({ ...formUsuario, cargo: e.target.value })}
                  placeholder="Ex: Pregoeiro Oficial"
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowNovoUsuario(false)
                  setShowEditarUsuario(false)
                }}
              >
                Cancelar
              </Button>
              <Button onClick={salvarUsuario} disabled={salvando}>
                {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {showEditarUsuario ? 'Salvar' : 'Cadastrar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirmação de Exclusão */}
        <AlertDialog open={showConfirmarExclusao} onOpenChange={setShowConfirmarExclusao}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
              <AlertDialogDescription>
                Tem certeza que deseja excluir o usuário{' '}
                <strong>{usuarioSelecionado?.nome}</strong>? Esta ação não pode ser desfeita.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmarExclusao}
                className="bg-red-600 hover:bg-red-700"
              >
                {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
