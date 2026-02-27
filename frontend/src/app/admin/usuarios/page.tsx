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
  Package,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

import { API_URL, adminFetch } from '@/lib/api'

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
  modulos_habilitados?: string[]
  pode_aprovar_requisicoes?: boolean
  pode_cancelar_estornar?: boolean
  pode_liberar_contratos?: boolean
  pode_excluir_medicao?: boolean
  eh_fiscal_contrato?: boolean
  pode_gerenciar_os?: boolean
  pode_receber_patrimonio?: boolean
}

// Lista de módulos disponíveis
const MODULOS_DISPONIVEIS = [
  { codigo: 'LICITACOES', nome: 'Licitações', descricao: 'Gerenciamento de processos licitatórios' },
  { codigo: 'PCA', nome: 'PCA', descricao: 'Plano de Contratações Anual' },
  { codigo: 'PNCP', nome: 'PNCP', descricao: 'Integração com Portal Nacional de Contratações Públicas' },
  { codigo: 'CONTRATOS', nome: 'Contratos', descricao: 'Gestão de contratos' },
  { codigo: 'DEMANDAS', nome: 'Demandas', descricao: 'Gestão de demandas de contratação' },
  { codigo: 'ATAS', nome: 'Atas', descricao: 'Atas de Registro de Preços' },
  { codigo: 'DISPUTA', nome: 'Disputa', descricao: 'Sala de disputa de licitações' },
  { codigo: 'CREDENCIAMENTO', nome: 'Credenciamento', descricao: 'Credenciamento de fornecedores' },
  { codigo: 'USUARIOS', nome: 'Usuários', descricao: 'Gestão de usuários do órgão' },
  { codigo: 'FORNECEDORES', nome: 'Fornecedores', descricao: 'Gestão de fornecedores' },
  { codigo: 'ALMOXARIFADO', nome: 'Almoxarifado', descricao: 'Gestão de almoxarifado e ordens de fornecimento' },
]

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
  const [showModulosUsuario, setShowModulosUsuario] = useState(false)
  const [usuarioSelecionado, setUsuarioSelecionado] = useState<Usuario | null>(null)
  const [salvando, setSalvando] = useState(false)

  // Módulos do usuário
  const [modulosUsuario, setModulosUsuario] = useState<string[]>([])
  const [modulosOrgao, setModulosOrgao] = useState<string[]>([])
  const [herdaDoOrgao, setHerdaDoOrgao] = useState(true)
  const [carregandoModulos, setCarregandoModulos] = useState(false)

  const [formUsuario, setFormUsuario] = useState({
    nome: '',
    email: '',
    senha: '',
    cpf: '',
    telefone: '',
    cargo: '',
    role: 'PREGOEIRO' as 'ADMIN' | 'PREGOEIRO' | 'EQUIPE_APOIO',
    orgao_id: '',
    pode_aprovar_requisicoes: false,
    pode_cancelar_estornar: false,
    pode_liberar_contratos: false,
    pode_excluir_medicao: false,
    eh_fiscal_contrato: false,
    pode_gerenciar_os: false,
    pode_receber_patrimonio: false,
  })

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    setErro(null)
    try {
      const [resUsuarios, resOrgaos] = await Promise.all([
        adminFetch(`${API_URL}/api/usuarios`),
        adminFetch(`${API_URL}/api/orgaos`),
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
      pode_aprovar_requisicoes: false,
      pode_cancelar_estornar: false,
      pode_liberar_contratos: false,
      pode_excluir_medicao: false,
      eh_fiscal_contrato: false,
      pode_gerenciar_os: false,
      pode_receber_patrimonio: false,
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
      pode_aprovar_requisicoes: usuario.pode_aprovar_requisicoes || false,
      pode_cancelar_estornar: usuario.pode_cancelar_estornar || false,
      pode_liberar_contratos: usuario.pode_liberar_contratos || false,
      pode_excluir_medicao: usuario.pode_excluir_medicao || false,
      eh_fiscal_contrato: usuario.eh_fiscal_contrato || false,
      pode_gerenciar_os: usuario.pode_gerenciar_os || false,
      pode_receber_patrimonio: usuario.pode_receber_patrimonio || false,
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
        pode_aprovar_requisicoes: formUsuario.pode_aprovar_requisicoes,
        pode_cancelar_estornar: formUsuario.pode_cancelar_estornar,
        pode_liberar_contratos: formUsuario.pode_liberar_contratos,
        pode_excluir_medicao: formUsuario.pode_excluir_medicao,
        eh_fiscal_contrato: formUsuario.eh_fiscal_contrato,
        pode_gerenciar_os: formUsuario.pode_gerenciar_os,
        pode_receber_patrimonio: formUsuario.pode_receber_patrimonio,
      }

      if (formUsuario.senha) {
        body.senha = formUsuario.senha
      }

      const res = await adminFetch(url, {
        method,
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
      const res = await adminFetch(`${API_URL}/api/usuarios/${usuarioSelecionado.id}`, {
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
      const res = await adminFetch(`${API_URL}/api/usuarios/${usuario.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ativo: !usuario.ativo }),
      })

      if (res.ok) {
        carregarDados()
      }
    } catch (error) {
      console.error('Erro ao alterar status:', error)
    }
  }

  // ============ FUNÇÕES DE MÓDULOS ============

  const abrirModalModulos = async (usuario: Usuario) => {
    setUsuarioSelecionado(usuario)
    setCarregandoModulos(true)
    setShowModulosUsuario(true)

    try {
      const res = await adminFetch(`${API_URL}/api/usuarios/${usuario.id}/modulos`)
      if (res.ok) {
        const data = await res.json()
        setModulosUsuario(data.modulos_usuario || [])
        setModulosOrgao(data.modulos_orgao || [])
        setHerdaDoOrgao(data.herdaDoOrgao)
      }
    } catch (error) {
      console.error('Erro ao carregar módulos:', error)
    } finally {
      setCarregandoModulos(false)
    }
  }

  const handleToggleModulo = (codigo: string) => {
    if (herdaDoOrgao) {
      // Se estava herdando, agora vai personalizar
      setHerdaDoOrgao(false)
      // Começa com o módulo clicado ativado
      setModulosUsuario([codigo])
    } else {
      setModulosUsuario(prev =>
        prev.includes(codigo)
          ? prev.filter(m => m !== codigo)
          : [...prev, codigo]
      )
    }
  }

  const handleHerdarDoOrgao = (checked: boolean) => {
    if (checked) {
      // Marca herdar: limpa módulos personalizados
      setHerdaDoOrgao(true)
      setModulosUsuario([])
    } else {
      // Desmarca herdar: começa com todos os módulos do órgão selecionados
      setHerdaDoOrgao(false)
      setModulosUsuario([...modulosOrgao])
    }
  }

  const salvarModulosUsuario = async () => {
    if (!usuarioSelecionado) return

    setSalvando(true)
    try {
      // Se herda do órgão, envia array vazio
      const modulosParaSalvar = herdaDoOrgao ? [] : modulosUsuario

      const res = await adminFetch(`${API_URL}/api/usuarios/${usuarioSelecionado.id}/modulos`, {
        method: 'PUT',
        body: JSON.stringify({ modulos: modulosParaSalvar }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.message || 'Erro ao salvar módulos')
      }

      setShowModulosUsuario(false)
      carregarDados()
      alert('Módulos do usuário atualizados com sucesso!')
    } catch (error: any) {
      setErro(error.message)
      alert(`Erro: ${error.message}`)
    } finally {
      setSalvando(false)
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
      <div className="px-6 py-6">
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
                    <TableHead>Permissões</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usuariosFiltrados.map((usuario) => (
                    <TableRow key={usuario.id}>
                      <TableCell className="font-medium whitespace-nowrap">{usuario.nome}</TableCell>
                      <TableCell className="text-sm">{usuario.email}</TableCell>
                      <TableCell>
                        <Badge className={`${roleLabels[usuario.role]?.color} text-white`}>
                          {roleLabels[usuario.role]?.icon}
                          <span className="ml-1">{roleLabels[usuario.role]?.label}</span>
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {usuario.orgao?.nome || '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 flex-wrap">
                          {usuario.pode_aprovar_requisicoes && (
                            <Badge className="bg-amber-100 text-amber-800 text-xs" title="Pode aprovar requisições">
                              Aprovador
                            </Badge>
                          )}
                          {usuario.pode_liberar_contratos && (
                            <Badge className="bg-blue-100 text-blue-800 text-xs" title="Pode liberar contratos">
                              Liberar Contratos
                            </Badge>
                          )}
                          {usuario.pode_cancelar_estornar && (
                            <Badge className="bg-red-100 text-red-800 text-xs" title="Pode cancelar/estornar">
                              Cancelar/Estornar
                            </Badge>
                          )}
                          {usuario.pode_excluir_medicao && (
                            <Badge className="bg-purple-100 text-purple-800 text-xs" title="Pode excluir medições">
                              Excluir Medição
                            </Badge>
                          )}
                          {usuario.eh_fiscal_contrato && (
                            <Badge className="bg-teal-100 text-teal-800 text-xs" title="Fiscal de contrato - atesta medições">
                              Fiscal
                            </Badge>
                          )}
                          {usuario.pode_gerenciar_os && (
                            <Badge className="bg-indigo-100 text-indigo-800 text-xs" title="Gerenciar Ordens de Serviço">
                              Ordens de Serviço
                            </Badge>
                          )}
                          {usuario.pode_receber_patrimonio && (
                            <Badge className="bg-slate-100 text-slate-800 text-xs" title="Pode aceitar recebimentos de itens permanentes">
                              Patrimônio
                            </Badge>
                          )}
                          {!usuario.pode_aprovar_requisicoes && !usuario.pode_liberar_contratos && !usuario.pode_cancelar_estornar && !usuario.pode_excluir_medicao && !usuario.eh_fiscal_contrato && !usuario.pode_gerenciar_os && !usuario.pode_receber_patrimonio && (
                            <span className="text-gray-400 text-xs">-</span>
                          )}
                        </div>
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
                        <div className="flex items-center justify-end gap-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Configurar módulos"
                            onClick={() => abrirModalModulos(usuario)}
                          >
                            <Package className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Editar"
                            onClick={() => handleEditarUsuario(usuario)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600"
                            title="Excluir"
                            onClick={() => handleExcluirUsuario(usuario)}
                          >
                            <Trash2 className="h-4 w-4" />
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

        {/* Modal Novo/Editar Usuário */}
        <Dialog
          open={showNovoUsuario || showEditarUsuario}
          onOpenChange={() => {
            setShowNovoUsuario(false)
            setShowEditarUsuario(false)
            setErro(null)
          }}
        >
          <DialogContent className="max-w-2xl">
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

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="grid grid-cols-2 gap-4">
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
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>{showEditarUsuario ? 'Nova Senha' : 'Senha *'}</Label>
                  <Input
                    type="password"
                    value={formUsuario.senha}
                    onChange={(e) => setFormUsuario({ ...formUsuario, senha: e.target.value })}
                    placeholder={showEditarUsuario ? 'Em branco = manter' : '••••••••'}
                  />
                </div>
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

              {/* Permissões */}
              <div className="p-4 bg-gray-50 border rounded-lg">
                <Label className="text-sm font-semibold text-gray-700 mb-3 block">Permissões Especiais</Label>
                <div className="grid grid-cols-3 gap-3">
                  <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <Checkbox
                      id="perm-aprovar"
                      checked={formUsuario.pode_aprovar_requisicoes}
                      onCheckedChange={(checked) => 
                        setFormUsuario({ ...formUsuario, pode_aprovar_requisicoes: checked === true })
                      }
                      className="mt-0.5"
                    />
                    <label htmlFor="perm-aprovar" className="cursor-pointer">
                      <p className="text-sm font-medium text-amber-800">Aprovar requisições</p>
                      <p className="text-xs text-amber-600">Página de aprovações do almoxarifado</p>
                    </label>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <Checkbox
                      id="perm-liberar"
                      checked={formUsuario.pode_liberar_contratos}
                      onCheckedChange={(checked) => 
                        setFormUsuario({ ...formUsuario, pode_liberar_contratos: checked === true })
                      }
                      className="mt-0.5"
                    />
                    <label htmlFor="perm-liberar" className="cursor-pointer">
                      <p className="text-sm font-medium text-blue-800">Liberar contratos</p>
                      <p className="text-xs text-blue-600">Liberar contratos para pedidos</p>
                    </label>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <Checkbox
                      id="perm-cancelar"
                      checked={formUsuario.pode_cancelar_estornar}
                      onCheckedChange={(checked) => 
                        setFormUsuario({ ...formUsuario, pode_cancelar_estornar: checked === true })
                      }
                      className="mt-0.5"
                    />
                    <label htmlFor="perm-cancelar" className="cursor-pointer">
                      <p className="text-sm font-medium text-red-800">Cancelar/Estornar</p>
                      <p className="text-xs text-red-600">Cancelar requisições e estornar</p>
                    </label>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <Checkbox
                      id="perm-excluir-medicao"
                      checked={formUsuario.pode_excluir_medicao}
                      onCheckedChange={(checked) => 
                        setFormUsuario({ ...formUsuario, pode_excluir_medicao: checked === true })
                      }
                      className="mt-0.5"
                    />
                    <label htmlFor="perm-excluir-medicao" className="cursor-pointer">
                      <p className="text-sm font-medium text-purple-800">Excluir medições</p>
                      <p className="text-xs text-purple-600">Excluir medições de contratos (inclusive aprovadas, com reversão de saldo)</p>
                    </label>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-teal-50 border border-teal-200 rounded-lg">
                    <Checkbox
                      id="perm-fiscal"
                      checked={formUsuario.eh_fiscal_contrato}
                      onCheckedChange={(checked) => 
                        setFormUsuario({ ...formUsuario, eh_fiscal_contrato: checked === true })
                      }
                      className="mt-0.5"
                    />
                    <label htmlFor="perm-fiscal" className="cursor-pointer">
                      <p className="text-sm font-medium text-teal-800">Fiscal de contrato</p>
                      <p className="text-xs text-teal-600">Atestar medições, devolver ao fornecedor e acessar o painel de medições</p>
                    </label>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <Checkbox
                      id="perm-os"
                      checked={formUsuario.pode_gerenciar_os}
                      onCheckedChange={(checked) => 
                        setFormUsuario({ ...formUsuario, pode_gerenciar_os: checked === true })
                      }
                      className="mt-0.5"
                    />
                    <label htmlFor="perm-os" className="cursor-pointer">
                      <p className="text-sm font-medium text-indigo-800">Ordens de Serviço</p>
                      <p className="text-xs text-indigo-600">Criar e gerenciar ordens de serviço de contratos</p>
                    </label>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <Checkbox
                      id="perm-patrimonio"
                      checked={formUsuario.pode_receber_patrimonio}
                      onCheckedChange={(checked) => 
                        setFormUsuario({ ...formUsuario, pode_receber_patrimonio: checked === true })
                      }
                      className="mt-0.5"
                    />
                    <label htmlFor="perm-patrimonio" className="cursor-pointer">
                      <p className="text-sm font-medium text-slate-800">Receber patrimônio</p>
                      <p className="text-xs text-slate-600">Aceitar recebimentos de itens permanentes (patrimônio)</p>
                    </label>
                  </div>
                </div>
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

        {/* Modal Módulos do Usuário */}
        <Dialog open={showModulosUsuario} onOpenChange={setShowModulosUsuario}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Módulos do Usuário
              </DialogTitle>
              <DialogDescription>
                Configure quais módulos {usuarioSelecionado?.nome} pode acessar.
                <br />
                <span className="text-amber-600">
                  Nota: O usuário só pode acessar módulos que o órgão também tem.
                </span>
              </DialogDescription>
            </DialogHeader>

            {carregandoModulos ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Opção herdar do órgão */}
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="herdar-orgao"
                      checked={herdaDoOrgao}
                      onCheckedChange={(checked) => handleHerdarDoOrgao(checked === true)}
                    />
                    <label htmlFor="herdar-orgao" className="text-sm font-medium cursor-pointer">
                      Herdar todos os módulos do órgão
                    </label>
                  </div>
                  <p className="text-xs text-blue-600 mt-1 ml-6">
                    {herdaDoOrgao 
                      ? 'O usuário terá acesso a todos os módulos habilitados para o órgão'
                      : 'Desmarque para personalizar os módulos deste usuário'}
                  </p>
                </div>

                {/* Lista de módulos */}
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {MODULOS_DISPONIVEIS.map((modulo) => {
                    const disponivelNoOrgao = modulosOrgao.includes(modulo.codigo)
                    const ativoParaUsuario = herdaDoOrgao 
                      ? disponivelNoOrgao 
                      : modulosUsuario.includes(modulo.codigo)
                    
                    return (
                      <div 
                        key={modulo.codigo}
                        className={`p-3 rounded-lg border ${
                          !disponivelNoOrgao 
                            ? 'bg-gray-100 border-gray-200 opacity-50' 
                            : ativoParaUsuario
                              ? 'bg-green-50 border-green-200'
                              : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id={`modulo-${modulo.codigo}`}
                              checked={ativoParaUsuario}
                              disabled={!disponivelNoOrgao || herdaDoOrgao}
                              onCheckedChange={() => handleToggleModulo(modulo.codigo)}
                            />
                            <label 
                              htmlFor={`modulo-${modulo.codigo}`}
                              className={`text-sm font-medium ${!disponivelNoOrgao ? 'text-gray-400' : 'cursor-pointer'}`}
                            >
                              {modulo.nome}
                            </label>
                          </div>
                          {!disponivelNoOrgao && (
                            <Badge variant="outline" className="text-xs text-gray-400">
                              Não disponível no órgão
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 ml-6 mt-1">
                          {modulo.descricao}
                        </p>
                      </div>
                    )
                  })}
                </div>

                {/* Resumo */}
                <div className="p-3 bg-gray-50 rounded-lg text-sm">
                  <strong>Resumo:</strong>{' '}
                  {herdaDoOrgao ? (
                    <span className="text-blue-600">
                      Herdando {modulosOrgao.length} módulo(s) do órgão
                    </span>
                  ) : (
                    <span className="text-green-600">
                      {modulosUsuario.length} módulo(s) selecionado(s) manualmente
                    </span>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowModulosUsuario(false)}>
                Cancelar
              </Button>
              <Button onClick={salvarModulosUsuario} disabled={salvando || carregandoModulos}>
                {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
