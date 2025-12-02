'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Loader2,
  Shield,
  Link2
} from 'lucide-react'

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

interface Orgao {
  id: string
  codigo: string
  nome: string
  nome_fantasia?: string
  cnpj: string
  tipo: string
  esfera: string
  cidade: string
  uf: string
  email_login?: string
  ativo: boolean
  // PNCP - Vinculação à plataforma
  pncp_vinculado?: boolean
  pncp_codigo_unidade?: string
  pncp_data_vinculacao?: string
  pncp_ultimo_envio?: string
  pncp_status?: string
}

const TIPOS_ORGAO = [
  { value: 'PREFEITURA', label: 'Prefeitura' },
  { value: 'CAMARA', label: 'Câmara Municipal' },
  { value: 'AUTARQUIA', label: 'Autarquia' },
  { value: 'FUNDACAO', label: 'Fundação' },
  { value: 'EMPRESA_PUBLICA', label: 'Empresa Pública' },
  { value: 'SOCIEDADE_ECONOMIA_MISTA', label: 'Sociedade de Economia Mista' },
  { value: 'CONSORCIO', label: 'Consórcio' },
]

const ESFERAS = [
  { value: 'FEDERAL', label: 'Federal' },
  { value: 'ESTADUAL', label: 'Estadual' },
  { value: 'MUNICIPAL', label: 'Municipal' },
  { value: 'DISTRITAL', label: 'Distrital' },
]

export default function AdminOrgaosPage() {
  const [orgaos, setOrgaos] = useState<Orgao[]>([])
  const [loading, setLoading] = useState(true)
  const [busca, setBusca] = useState('')
  
  // Modal states
  const [showNovoOrgao, setShowNovoOrgao] = useState(false)
  const [showEditarOrgao, setShowEditarOrgao] = useState(false)
  const [showConfigurarPNCP, setShowConfigurarPNCP] = useState(false)
  const [showConfirmarExclusao, setShowConfirmarExclusao] = useState(false)
  
  const [orgaoSelecionado, setOrgaoSelecionado] = useState<Orgao | null>(null)
  
  // Form state
  const [formOrgao, setFormOrgao] = useState({
    codigo: '',
    nome: '',
    nome_fantasia: '',
    cnpj: '',
    tipo: 'PREFEITURA',
    esfera: 'MUNICIPAL',
    logradouro: '',
    numero: '',
    bairro: '',
    cidade: '',
    uf: '',
    cep: '',
    telefone: '',
    email: '',
    email_login: '',
    senha: '',
    responsavel_nome: '',
    responsavel_cpf: '',
    responsavel_cargo: ''
  })
  
  const [formPNCP, setFormPNCP] = useState({
    pncp_vinculado: false,
    pncp_codigo_unidade: '1'
  })

  useEffect(() => {
    carregarOrgaos()
  }, [])

  const carregarOrgaos = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/orgaos`)
      if (response.ok) {
        const data = await response.json()
        setOrgaos(data)
      }
    } catch (error) {
      console.error('Erro ao carregar órgãos:', error)
    } finally {
      setLoading(false)
    }
  }

  const salvarOrgao = async () => {
    try {
      const response = await fetch(`${API_URL}/api/orgaos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formOrgao)
      })

      if (response.ok) {
        alert('Órgão cadastrado com sucesso!')
        setShowNovoOrgao(false)
        limparForm()
        carregarOrgaos()
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao cadastrar órgão')
      }
    } catch (error) {
      console.error('Erro ao salvar órgão:', error)
      alert('Erro ao cadastrar órgão')
    }
  }

  const atualizarOrgao = async () => {
    if (!orgaoSelecionado) return

    try {
      const response = await fetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formOrgao)
      })

      if (response.ok) {
        alert('Órgão atualizado com sucesso!')
        setShowEditarOrgao(false)
        setOrgaoSelecionado(null)
        carregarOrgaos()
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao atualizar órgão')
      }
    } catch (error) {
      console.error('Erro ao atualizar órgão:', error)
      alert('Erro ao atualizar órgão')
    }
  }

  const excluirOrgao = async () => {
    if (!orgaoSelecionado) return

    try {
      const response = await fetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}`, {
        method: 'DELETE'
      })

      if (response.ok) {
        alert('Órgão desativado com sucesso!')
        setShowConfirmarExclusao(false)
        setOrgaoSelecionado(null)
        carregarOrgaos()
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao desativar órgão')
      }
    } catch (error) {
      console.error('Erro ao desativar órgão:', error)
      alert('Erro ao desativar órgão')
    }
  }

  const salvarConfiguracaoPNCP = async () => {
    if (!orgaoSelecionado) return

    try {
      const response = await fetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}/pncp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formPNCP)
      })

      if (response.ok) {
        alert('Configuração PNCP salva com sucesso!')
        carregarOrgaos()
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao salvar configuração')
      }
    } catch (error) {
      console.error('Erro ao salvar configuração PNCP:', error)
      alert('Erro ao salvar configuração')
    }
  }

  const limparForm = () => {
    setFormOrgao({
      codigo: '',
      nome: '',
      nome_fantasia: '',
      cnpj: '',
      tipo: 'PREFEITURA',
      esfera: 'MUNICIPAL',
      logradouro: '',
      numero: '',
      bairro: '',
      cidade: '',
      uf: '',
      cep: '',
      telefone: '',
      email: '',
      email_login: '',
      senha: '',
      responsavel_nome: '',
      responsavel_cpf: '',
      responsavel_cargo: ''
    })
  }

  const abrirEditarOrgao = (orgao: Orgao) => {
    setOrgaoSelecionado(orgao)
    setFormOrgao({
      codigo: orgao.codigo,
      nome: orgao.nome,
      nome_fantasia: orgao.nome_fantasia || '',
      cnpj: orgao.cnpj,
      tipo: orgao.tipo,
      esfera: orgao.esfera,
      logradouro: '',
      numero: '',
      bairro: '',
      cidade: orgao.cidade,
      uf: orgao.uf,
      cep: '',
      telefone: '',
      email: '',
      email_login: orgao.email_login || '',
      senha: '',
      responsavel_nome: '',
      responsavel_cpf: '',
      responsavel_cargo: ''
    })
    setShowEditarOrgao(true)
  }

  const abrirConfigurarPNCP = (orgao: Orgao) => {
    setOrgaoSelecionado(orgao)
    setFormPNCP({
      pncp_vinculado: orgao.pncp_vinculado || false,
      pncp_codigo_unidade: orgao.pncp_codigo_unidade || '1'
    })
    setShowConfigurarPNCP(true)
  }

  const formatarCNPJ = (cnpj: string) => {
    const numeros = cnpj.replace(/\D/g, '')
    return numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }

  const getStatusPNCPBadge = (orgao: Orgao) => {
    if (!orgao.pncp_vinculado) {
      return <Badge variant="outline" className="text-gray-500">Não Vinculado</Badge>
    }
    switch (orgao.pncp_status) {
      case 'VINCULADO':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Vinculado</Badge>
      case 'ERRO':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Erro</Badge>
      default:
        return <Badge variant="outline" className="text-yellow-600"><AlertCircle className="w-3 h-3 mr-1" />Pendente</Badge>
    }
  }

  const orgaosFiltrados = orgaos.filter(orgao => 
    orgao.nome.toLowerCase().includes(busca.toLowerCase()) ||
    orgao.cnpj.includes(busca) ||
    orgao.cidade.toLowerCase().includes(busca.toLowerCase())
  )

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-12 h-12 animate-spin mx-auto text-blue-600" />
        <p className="mt-4 text-gray-600">Carregando órgãos...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-7 h-7 text-blue-600" />
            Administração de Órgãos
          </h1>
          <p className="text-gray-600">Gerencie os órgãos vinculados ao portal e suas integrações PNCP</p>
        </div>
        <Button onClick={() => setShowNovoOrgao(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Novo Órgão
        </Button>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total de Órgãos</p>
                <p className="text-2xl font-bold">{orgaos.length}</p>
              </div>
              <Building2 className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Ativos</p>
                <p className="text-2xl font-bold text-green-600">{orgaos.filter(o => o.ativo).length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">PNCP Vinculado</p>
                <p className="text-2xl font-bold text-blue-600">{orgaos.filter(o => o.pncp_vinculado).length}</p>
              </div>
              <Link2 className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Com Envios</p>
                <p className="text-2xl font-bold text-green-600">{orgaos.filter(o => o.pncp_ultimo_envio).length}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Busca */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="Buscar por nome, CNPJ ou cidade..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={carregarOrgaos}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* Tabela de Órgãos */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Órgão</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Cidade/UF</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>PNCP</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgaosFiltrados.map((orgao) => (
                <TableRow key={orgao.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium">{orgao.nome}</p>
                      <p className="text-sm text-gray-500">{orgao.codigo}</p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-sm">{formatarCNPJ(orgao.cnpj)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">
                      {TIPOS_ORGAO.find(t => t.value === orgao.tipo)?.label || orgao.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell>{orgao.cidade}/{orgao.uf}</TableCell>
                  <TableCell>
                    {orgao.ativo ? (
                      <Badge className="bg-green-100 text-green-800">Ativo</Badge>
                    ) : (
                      <Badge className="bg-red-100 text-red-800">Inativo</Badge>
                    )}
                  </TableCell>
                  <TableCell>{getStatusPNCPBadge(orgao)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => abrirConfigurarPNCP(orgao)}
                        title="Configurar PNCP"
                      >
                        <Link2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => abrirEditarOrgao(orgao)}
                        title="Editar"
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-red-600"
                        onClick={() => {
                          setOrgaoSelecionado(orgao)
                          setShowConfirmarExclusao(true)
                        }}
                        title="Desativar"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal Novo Órgão */}
      <Dialog open={showNovoOrgao} onOpenChange={setShowNovoOrgao}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cadastrar Novo Órgão</DialogTitle>
            <DialogDescription>
              Preencha os dados do órgão para vinculá-lo ao portal
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div>
              <Label>Código (UASG)</Label>
              <Input
                value={formOrgao.codigo}
                onChange={(e) => setFormOrgao({ ...formOrgao, codigo: e.target.value })}
                placeholder="Ex: 123456"
              />
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input
                value={formOrgao.cnpj}
                onChange={(e) => setFormOrgao({ ...formOrgao, cnpj: e.target.value })}
                placeholder="00.000.000/0000-00"
              />
            </div>
            <div className="col-span-2">
              <Label>Nome do Órgão</Label>
              <Input
                value={formOrgao.nome}
                onChange={(e) => setFormOrgao({ ...formOrgao, nome: e.target.value })}
                placeholder="Nome completo do órgão"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={formOrgao.tipo} onValueChange={(v) => setFormOrgao({ ...formOrgao, tipo: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ORGAO.map(tipo => (
                    <SelectItem key={tipo.value} value={tipo.value}>{tipo.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Esfera</Label>
              <Select value={formOrgao.esfera} onValueChange={(v) => setFormOrgao({ ...formOrgao, esfera: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESFERAS.map(esfera => (
                    <SelectItem key={esfera.value} value={esfera.value}>{esfera.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cidade</Label>
              <Input
                value={formOrgao.cidade}
                onChange={(e) => setFormOrgao({ ...formOrgao, cidade: e.target.value })}
              />
            </div>
            <div>
              <Label>UF</Label>
              <Input
                value={formOrgao.uf}
                onChange={(e) => setFormOrgao({ ...formOrgao, uf: e.target.value.toUpperCase() })}
                maxLength={2}
              />
            </div>
            <div>
              <Label>Email de Login</Label>
              <Input
                type="email"
                value={formOrgao.email_login}
                onChange={(e) => setFormOrgao({ ...formOrgao, email_login: e.target.value })}
                placeholder="email@orgao.gov.br"
              />
            </div>
            <div>
              <Label>Senha</Label>
              <Input
                type="password"
                value={formOrgao.senha}
                onChange={(e) => setFormOrgao({ ...formOrgao, senha: e.target.value })}
              />
            </div>
            <div>
              <Label>Responsável</Label>
              <Input
                value={formOrgao.responsavel_nome}
                onChange={(e) => setFormOrgao({ ...formOrgao, responsavel_nome: e.target.value })}
              />
            </div>
            <div>
              <Label>CPF do Responsável</Label>
              <Input
                value={formOrgao.responsavel_cpf}
                onChange={(e) => setFormOrgao({ ...formOrgao, responsavel_cpf: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowNovoOrgao(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarOrgao}>
              Cadastrar Órgão
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Editar Órgão */}
      <Dialog open={showEditarOrgao} onOpenChange={setShowEditarOrgao}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Órgão</DialogTitle>
            <DialogDescription>
              Atualize os dados do órgão
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-2 gap-4 py-4">
            <div>
              <Label>Código (UASG)</Label>
              <Input
                value={formOrgao.codigo}
                onChange={(e) => setFormOrgao({ ...formOrgao, codigo: e.target.value })}
              />
            </div>
            <div>
              <Label>CNPJ</Label>
              <Input
                value={formOrgao.cnpj}
                onChange={(e) => setFormOrgao({ ...formOrgao, cnpj: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Nome do Órgão</Label>
              <Input
                value={formOrgao.nome}
                onChange={(e) => setFormOrgao({ ...formOrgao, nome: e.target.value })}
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={formOrgao.tipo} onValueChange={(v) => setFormOrgao({ ...formOrgao, tipo: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_ORGAO.map(tipo => (
                    <SelectItem key={tipo.value} value={tipo.value}>{tipo.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Esfera</Label>
              <Select value={formOrgao.esfera} onValueChange={(v) => setFormOrgao({ ...formOrgao, esfera: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ESFERAS.map(esfera => (
                    <SelectItem key={esfera.value} value={esfera.value}>{esfera.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Cidade</Label>
              <Input
                value={formOrgao.cidade}
                onChange={(e) => setFormOrgao({ ...formOrgao, cidade: e.target.value })}
              />
            </div>
            <div>
              <Label>UF</Label>
              <Input
                value={formOrgao.uf}
                onChange={(e) => setFormOrgao({ ...formOrgao, uf: e.target.value.toUpperCase() })}
                maxLength={2}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowEditarOrgao(false)}>
              Cancelar
            </Button>
            <Button onClick={atualizarOrgao}>
              Salvar Alterações
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Configurar PNCP */}
      <Dialog open={showConfigurarPNCP} onOpenChange={setShowConfigurarPNCP}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Link2 className="w-5 h-5" />
              Configurar Integração PNCP
            </DialogTitle>
            <DialogDescription>
              {orgaoSelecionado?.nome}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Informação sobre o modelo */}
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <p className="font-medium text-blue-800">ℹ️ Como funciona a integração PNCP</p>
              <p className="text-blue-700 mt-1">
                A plataforma LicitaFácil possui uma única credencial no PNCP. 
                Ao vincular este órgão, você autoriza o envio de dados em nome do CNPJ: <strong>{formatarCNPJ(orgaoSelecionado?.cnpj || '')}</strong>
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Vincular ao PNCP</Label>
                <p className="text-sm text-gray-500">Permite enviar dados deste órgão ao PNCP</p>
              </div>
              <Switch
                checked={formPNCP.pncp_vinculado}
                onCheckedChange={(checked) => setFormPNCP({ ...formPNCP, pncp_vinculado: checked })}
              />
            </div>

            {formPNCP.pncp_vinculado && (
              <>
                <div>
                  <Label>Código da Unidade</Label>
                  <Input
                    value={formPNCP.pncp_codigo_unidade}
                    onChange={(e) => setFormPNCP({ ...formPNCP, pncp_codigo_unidade: e.target.value })}
                    placeholder="1"
                  />
                  <p className="text-xs text-gray-500 mt-1">Geralmente "1" para a unidade principal</p>
                </div>

                {orgaoSelecionado?.pncp_data_vinculacao && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm">
                      <strong>Data de Vinculação:</strong>{' '}
                      {new Date(orgaoSelecionado.pncp_data_vinculacao).toLocaleString('pt-BR')}
                    </p>
                    {orgaoSelecionado?.pncp_ultimo_envio && (
                      <p className="text-sm">
                        <strong>Último Envio:</strong>{' '}
                        {new Date(orgaoSelecionado.pncp_ultimo_envio).toLocaleString('pt-BR')}
                      </p>
                    )}
                    <p className="text-sm">
                      <strong>Status:</strong>{' '}
                      {orgaoSelecionado.pncp_status === 'VINCULADO' ? (
                        <span className="text-green-600">Vinculado</span>
                      ) : (
                        <span className="text-yellow-600">Pendente</span>
                      )}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowConfigurarPNCP(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarConfiguracaoPNCP}>
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmar Exclusão */}
      <AlertDialog open={showConfirmarExclusao} onOpenChange={setShowConfirmarExclusao}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desativar Órgão?</AlertDialogTitle>
            <AlertDialogDescription>
              O órgão "{orgaoSelecionado?.nome}" será desativado e não poderá mais acessar o sistema.
              Esta ação pode ser revertida posteriormente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={excluirOrgao} className="bg-red-600 hover:bg-red-700">
              Desativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
