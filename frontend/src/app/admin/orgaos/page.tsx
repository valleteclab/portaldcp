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
  Link2,
  Link as LinkIcon,
  Mail,
  MessageCircle
} from 'lucide-react'

import { API_URL, adminFetch } from '@/lib/api'

interface Orgao {
  id: string
  codigo: string
  nome: string
  nome_fantasia?: string
  cnpj: string
  tipo: string
  esfera: string
  logradouro?: string
  numero?: string
  complemento?: string
  bairro?: string
  cidade: string
  uf: string
  cep?: string
  telefone?: string
  email?: string
  site?: string
  responsavel_nome?: string
  responsavel_cpf?: string
  responsavel_cargo?: string
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
  const [showConfigurarEmail, setShowConfigurarEmail] = useState(false)
  const [showConfigurarWhatsApp, setShowConfigurarWhatsApp] = useState(false)
  const [showConfigWhatsAppGlobal, setShowConfigWhatsAppGlobal] = useState(false)
  const [showConfirmarExclusao, setShowConfirmarExclusao] = useState(false)
  
  const [orgaoSelecionado, setOrgaoSelecionado] = useState<Orgao | null>(null)
  const [testandoEmail, setTestandoEmail] = useState(false)
  const [salvandoEmail, setSalvandoEmail] = useState(false)
  const [testandoWhatsApp, setTestandoWhatsApp] = useState(false)
  const [salvandoWhatsApp, setSalvandoWhatsApp] = useState(false)
  const [consultandoCnpj, setConsultandoCnpj] = useState(false)
  
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

  const [formEmail, setFormEmail] = useState({
    email_smtp_host: '',
    email_smtp_port: 587,
    email_smtp_secure: false,
    email_smtp_user: '',
    email_smtp_senha: '',
    email_from: '',
    email_imap_host: '',
    email_imap_port: 993,
    email_imap_user: '',
    email_imap_senha: ''
  })
  const [testandoImap, setTestandoImap] = useState(false)

  const [formWhatsApp, setFormWhatsApp] = useState({
    whatsapp_provider: 'ZAPI',
    whatsapp_instance_id: '',
    whatsapp_token: '',
    whatsapp_client_token: ''
  })
  const [formWhatsAppGlobal, setFormWhatsAppGlobal] = useState({
    instance_id: '',
    token: '',
    client_token: ''
  })
  const [whatsappNumeroTeste, setWhatsappNumeroTeste] = useState('')

  useEffect(() => {
    carregarOrgaos()
  }, [])

  const carregarOrgaos = async () => {
    setLoading(true)
    try {
      const response = await adminFetch(`${API_URL}/api/orgaos`)
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
      const response = await adminFetch(`${API_URL}/api/orgaos`, {
        method: 'POST',
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
      const response = await adminFetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}`, {
        method: 'PUT',
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
      const response = await adminFetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}`, {
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
      const response = await adminFetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}/pncp`, {
        method: 'PUT',
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
      logradouro: orgao.logradouro || '',
      numero: orgao.numero || '',
      bairro: orgao.bairro || '',
      cidade: orgao.cidade,
      uf: orgao.uf,
      cep: orgao.cep || '',
      telefone: orgao.telefone || '',
      email: orgao.email || '',
      email_login: orgao.email_login || '',
      senha: '',
      responsavel_nome: orgao.responsavel_nome || '',
      responsavel_cpf: orgao.responsavel_cpf || '',
      responsavel_cargo: orgao.responsavel_cargo || ''
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

  const abrirConfigurarEmail = async (orgao: Orgao) => {
    setOrgaoSelecionado(orgao)
    setShowConfigurarEmail(true)
    try {
      const res = await adminFetch(`${API_URL}/api/orgaos/${orgao.id}/email-config`)
      if (res.ok) {
        const cfg = await res.json()
        setFormEmail({
          email_smtp_host: cfg.email_smtp_host || '',
          email_smtp_port: cfg.email_smtp_port ?? 587,
          email_smtp_secure: cfg.email_smtp_secure ?? false,
          email_smtp_user: cfg.email_smtp_user || '',
          email_smtp_senha: '',
          email_from: cfg.email_from || '',
          email_imap_host: cfg.email_imap_host || '',
          email_imap_port: cfg.email_imap_port ?? 993,
          email_imap_user: cfg.email_imap_user || '',
          email_imap_senha: ''
        })
      }
    } catch (e) {
      console.error('Erro ao carregar config email:', e)
    }
  }

  const salvarConfiguracaoEmail = async () => {
    if (!orgaoSelecionado) return
    const host = (formEmail.email_smtp_host || '').toLowerCase()
    if (host.includes('pop.') || host.includes('imap.')) {
      alert('SMTP é para ENVIAR emails. Você digitou pop. ou imap. — use smtp.gmail.com (Gmail) ou smtp.office365.com (Outlook).')
      return
    }
    if ([993, 995].includes(formEmail.email_smtp_port)) {
      alert('Portas 993 (IMAP) e 995 (POP3) são para receber. Para SMTP use 587 ou 465.')
      return
    }
    setSalvandoEmail(true)
    try {
      const res = await adminFetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}/email-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formEmail,
          email_smtp_senha: formEmail.email_smtp_senha || undefined,
          email_imap_senha: formEmail.email_imap_senha || undefined
        })
      })
      if (res.ok) {
        alert('Configuracao de email salva com sucesso!')
        carregarOrgaos()
      } else {
        const err = await res.json()
        alert(err.message || 'Erro ao salvar')
      }
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar configuracao')
    } finally {
      setSalvandoEmail(false)
    }
  }

  const testarConfiguracaoEmail = async () => {
    if (!orgaoSelecionado) return
    const host = (formEmail.email_smtp_host || '').toLowerCase()
    if (host.includes('pop.') || host.includes('imap.')) {
      alert('SMTP é para ENVIAR emails. Você digitou pop. ou imap. — use smtp.gmail.com (Gmail) ou smtp.office365.com (Outlook).')
      return
    }
    if ([993, 995].includes(formEmail.email_smtp_port)) {
      alert('Portas 993 (IMAP) e 995 (POP3) são para receber. Para SMTP use 587 ou 465.')
      return
    }
    setTestandoEmail(true)
    try {
      const res = await adminFetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}/email-config/testar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formEmail.email_smtp_user })
      })
      const data = await res.json()
      alert(data.sucesso ? data.mensagem : `Erro: ${data.mensagem}`)
    } catch (e) {
      alert('Erro ao testar conexao')
    } finally {
      setTestandoEmail(false)
    }
  }

  const abrirConfigurarWhatsApp = async (orgao: Orgao) => {
    setOrgaoSelecionado(orgao)
    setShowConfigurarWhatsApp(true)
    try {
      const res = await adminFetch(`${API_URL}/api/orgaos/${orgao.id}/whatsapp-config`)
      if (res.ok) {
        const cfg = await res.json()
        setFormWhatsApp({
          whatsapp_provider: cfg.whatsapp_provider || 'ZAPI',
          whatsapp_instance_id: cfg.whatsapp_instance_id || '',
          whatsapp_token: '',
          whatsapp_client_token: ''
        })
      }
    } catch (e) {
      console.error('Erro ao carregar config WhatsApp:', e)
    }
  }

  const salvarConfiguracaoWhatsApp = async () => {
    if (!orgaoSelecionado) return
    setSalvandoWhatsApp(true)
    try {
      const res = await adminFetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}/whatsapp-config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          whatsapp_provider: formWhatsApp.whatsapp_provider,
          whatsapp_instance_id: formWhatsApp.whatsapp_instance_id || undefined,
          whatsapp_token: formWhatsApp.whatsapp_token || undefined,
          whatsapp_client_token: formWhatsApp.whatsapp_client_token || undefined
        })
      })
      if (res.ok) {
        alert('Configuracao de WhatsApp salva com sucesso!')
        carregarOrgaos()
      } else {
        const err = await res.json()
        alert(err.message || 'Erro ao salvar')
      }
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar configuracao')
    } finally {
      setSalvandoWhatsApp(false)
    }
  }

  const testarConfiguracaoWhatsApp = async () => {
    if (!orgaoSelecionado) return
    const num = whatsappNumeroTeste.replace(/\D/g, '')
    if (num.length < 10) {
      alert('Informe um numero de teste valido (ex: 5511999999999)')
      return
    }
    setTestandoWhatsApp(true)
    try {
      const res = await adminFetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}/whatsapp-config/testar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ numero: num })
      })
      const data = await res.json()
      alert(data.sucesso ? data.mensagem : `Erro: ${data.mensagem}`)
    } catch (e) {
      alert('Erro ao testar WhatsApp')
    } finally {
      setTestandoWhatsApp(false)
    }
  }

  const abrirConfigWhatsAppGlobal = async () => {
    setShowConfigWhatsAppGlobal(true)
    try {
      const res = await adminFetch(`${API_URL}/api/system-config/whatsapp-global`)
      if (res.ok) {
        const cfg = await res.json()
        setFormWhatsAppGlobal({
          instance_id: cfg.instanceId || '',
          token: '',
          client_token: ''
        })
      }
    } catch (e) {
      console.error('Erro ao carregar config WhatsApp global:', e)
    }
  }

  const salvarConfigWhatsAppGlobal = async () => {
    setSalvandoWhatsApp(true)
    try {
      const res = await adminFetch(`${API_URL}/api/system-config/whatsapp-global`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_id: formWhatsAppGlobal.instance_id || undefined,
          token: formWhatsAppGlobal.token || undefined,
          client_token: formWhatsAppGlobal.client_token || undefined
        })
      })
      if (res.ok) {
        alert('Config WhatsApp global salva com sucesso!')
        setShowConfigWhatsAppGlobal(false)
      } else {
        const err = await res.json()
        alert(err.message || 'Erro ao salvar')
      }
    } catch (e) {
      console.error(e)
      alert('Erro ao salvar')
    } finally {
      setSalvandoWhatsApp(false)
    }
  }

  const consultarCnpj = async () => {
    const cnpjLimpo = formOrgao.cnpj.replace(/\D/g, '')
    if (cnpjLimpo.length !== 14) {
      alert('CNPJ deve ter 14 dígitos')
      return
    }

    setConsultandoCnpj(true)
    try {
      const response = await adminFetch(`${API_URL}/api/fornecedores/consultar-cnpj/${cnpjLimpo}`)
      if (response.ok) {
        const dados = await response.json()
        setFormOrgao(prev => ({
          ...prev,
          nome: dados.razao_social || prev.nome,
          nome_fantasia: dados.nome_fantasia || prev.nome_fantasia,
          logradouro: dados.endereco?.logradouro ? `${dados.endereco.tipo_logradouro || ''} ${dados.endereco.logradouro}`.trim() : prev.logradouro,
          numero: dados.endereco?.numero || prev.numero,
          bairro: dados.endereco?.bairro || prev.bairro,
          cidade: dados.endereco?.cidade || prev.cidade,
          uf: dados.endereco?.uf || prev.uf,
          cep: dados.endereco?.cep || prev.cep,
          telefone: dados.telefone || prev.telefone,
          email: dados.email || prev.email,
          email_login: prev.email_login || dados.email || prev.email_login,
          responsavel_nome: dados.socios?.[0]?.nome || prev.responsavel_nome,
        }))
      } else {
        const error = await response.json()
        alert(error.message || 'Erro ao consultar CNPJ')
      }
    } catch (error) {
      console.error('Erro ao consultar CNPJ:', error)
      alert('Erro ao consultar CNPJ. Verifique sua conexão.')
    } finally {
      setConsultandoCnpj(false)
    }
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={abrirConfigWhatsAppGlobal}>
            <MessageCircle className="w-4 h-4 mr-2" />
            WhatsApp Global
          </Button>
          <Button onClick={() => setShowNovoOrgao(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Novo Órgão
          </Button>
        </div>
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
                        onClick={() => abrirConfigurarEmail(orgao)}
                        title="Configurar Email (SMTP)"
                      >
                        <Mail className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => abrirConfigurarWhatsApp(orgao)}
                        title="Configurar WhatsApp"
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
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
              <div className="flex gap-2">
                <Input
                  value={formOrgao.cnpj}
                  onChange={(e) => setFormOrgao({ ...formOrgao, cnpj: e.target.value })}
                  placeholder="00.000.000/0000-00"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={consultarCnpj}
                  disabled={consultandoCnpj || formOrgao.cnpj.replace(/\D/g, '').length < 14}
                  title="Buscar dados pelo CNPJ"
                >
                  {consultandoCnpj ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1">Digite o CNPJ e clique na lupa para buscar dados automaticamente</p>
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
            <div className="col-span-2">
              <Label>Logradouro</Label>
              <Input
                value={formOrgao.logradouro}
                onChange={(e) => setFormOrgao({ ...formOrgao, logradouro: e.target.value })}
                placeholder="Rua, Avenida, etc."
              />
            </div>
            <div>
              <Label>Número</Label>
              <Input
                value={formOrgao.numero}
                onChange={(e) => setFormOrgao({ ...formOrgao, numero: e.target.value })}
              />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input
                value={formOrgao.bairro}
                onChange={(e) => setFormOrgao({ ...formOrgao, bairro: e.target.value })}
              />
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
              <Label>CEP</Label>
              <Input
                value={formOrgao.cep}
                onChange={(e) => setFormOrgao({ ...formOrgao, cep: e.target.value })}
                placeholder="00000-000"
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={formOrgao.telefone}
                onChange={(e) => setFormOrgao({ ...formOrgao, telefone: e.target.value })}
                placeholder="(00) 0000-0000"
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              <div className="flex gap-2">
                <Input
                  value={formOrgao.cnpj}
                  onChange={(e) => setFormOrgao({ ...formOrgao, cnpj: e.target.value })}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={consultarCnpj}
                  disabled={consultandoCnpj || formOrgao.cnpj.replace(/\D/g, '').length < 14}
                  title="Buscar dados pelo CNPJ"
                >
                  {consultandoCnpj ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="col-span-2">
              <Label>Nome do Órgão</Label>
              <Input
                value={formOrgao.nome}
                onChange={(e) => setFormOrgao({ ...formOrgao, nome: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <Label>Nome Fantasia</Label>
              <Input
                value={formOrgao.nome_fantasia}
                onChange={(e) => setFormOrgao({ ...formOrgao, nome_fantasia: e.target.value })}
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
            <div className="col-span-2">
              <Label>Logradouro</Label>
              <Input
                value={formOrgao.logradouro}
                onChange={(e) => setFormOrgao({ ...formOrgao, logradouro: e.target.value })}
                placeholder="Rua, Avenida, etc."
              />
            </div>
            <div>
              <Label>Número</Label>
              <Input
                value={formOrgao.numero}
                onChange={(e) => setFormOrgao({ ...formOrgao, numero: e.target.value })}
              />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input
                value={formOrgao.bairro}
                onChange={(e) => setFormOrgao({ ...formOrgao, bairro: e.target.value })}
              />
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
              <Label>CEP</Label>
              <Input
                value={formOrgao.cep}
                onChange={(e) => setFormOrgao({ ...formOrgao, cep: e.target.value })}
                placeholder="00000-000"
              />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={formOrgao.telefone}
                onChange={(e) => setFormOrgao({ ...formOrgao, telefone: e.target.value })}
                placeholder="(00) 0000-0000"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={formOrgao.email}
                onChange={(e) => setFormOrgao({ ...formOrgao, email: e.target.value })}
                placeholder="contato@orgao.gov.br"
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
              <Label>Nova Senha</Label>
              <Input
                type="password"
                value={formOrgao.senha}
                onChange={(e) => setFormOrgao({ ...formOrgao, senha: e.target.value })}
                placeholder="Deixe vazio para manter a atual"
              />
              <p className="text-xs text-gray-500 mt-1">Preencha apenas se deseja alterar a senha</p>
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
            <div>
              <Label>Cargo do Responsável</Label>
              <Input
                value={formOrgao.responsavel_cargo}
                onChange={(e) => setFormOrgao({ ...formOrgao, responsavel_cargo: e.target.value })}
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

      {/* Modal Configurar Email (SMTP/IMAP) */}
      <Dialog open={showConfigurarEmail} onOpenChange={setShowConfigurarEmail}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Configurar Email (SMTP / IMAP)
            </DialogTitle>
            <DialogDescription>
              {orgaoSelecionado?.nome} - Envio (SMTP) e recepção (IMAP) de emails
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="smtp" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="smtp">SMTP (Envio)</TabsTrigger>
              <TabsTrigger value="imap">IMAP (Recepção)</TabsTrigger>
            </TabsList>
            <TabsContent value="smtp" className="space-y-4 py-4">
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <p className="font-medium text-blue-800">SMTP = ENVIO de emails</p>
              <p className="text-blue-700 mt-1 text-xs">
                Gmail: smtp.gmail.com porta 587 | Outlook: smtp.office365.com porta 587
              </p>
              <p className="text-amber-700 mt-1 text-xs font-medium">
                Gmail com 2FA: use Senha de app (não a senha normal).{' '}
                <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="underline">Criar senha de app</a>
              </p>
              <p className="text-amber-700 mt-1 text-xs">
                Não use pop. ou imap. aqui — esses são para receber (aba IMAP).
              </p>
            </div>

            <div>
              <Label>Servidor SMTP (host) — ex: smtp.gmail.com</Label>
              <Input
                value={formEmail.email_smtp_host}
                onChange={(e) => setFormEmail({ ...formEmail, email_smtp_host: e.target.value })}
                placeholder="smtp.gmail.com"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Porta (SMTP: 587 ou 465)</Label>
                <Input
                  type="number"
                  value={formEmail.email_smtp_port}
                  onChange={(e) => setFormEmail({ ...formEmail, email_smtp_port: parseInt(e.target.value) || 587 })}
                  placeholder="587"
                />
              </div>
              <div className="flex items-center gap-2 pt-8">
                <Switch
                  checked={formEmail.email_smtp_secure}
                  onCheckedChange={(c) => setFormEmail({ ...formEmail, email_smtp_secure: c })}
                />
                <Label>SSL/TLS (porta 465)</Label>
              </div>
            </div>
            <div>
              <Label>Usuario (email)</Label>
              <Input
                type="email"
                value={formEmail.email_smtp_user}
                onChange={(e) => setFormEmail({ ...formEmail, email_smtp_user: e.target.value })}
                placeholder="contato@orgao.gov.br"
              />
            </div>
            <div>
              <Label>Senha</Label>
              <Input
                type="password"
                value={formEmail.email_smtp_senha}
                onChange={(e) => setFormEmail({ ...formEmail, email_smtp_senha: e.target.value })}
                placeholder="Deixe vazio para manter a atual"
              />
            </div>
            <div>
              <Label>Remetente (From)</Label>
              <Input
                value={formEmail.email_from}
                onChange={(e) => setFormEmail({ ...formEmail, email_from: e.target.value })}
                placeholder="Prefeitura &lt;contato@prefeitura.gov.br&gt;"
              />
              <p className="text-xs text-gray-500 mt-1">Ex: Nome &lt;email@orgao.gov.br&gt;</p>
            </div>
            </TabsContent>
            <TabsContent value="imap" className="space-y-4 py-4">
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <p className="font-medium text-blue-800">Recepção de emails</p>
              <p className="text-blue-700 mt-1 text-xs">
                Gmail: imap.gmail.com:993 | Outlook: outlook.office365.com:993
              </p>
            </div>
            <div>
              <Label>Servidor IMAP (host)</Label>
              <Input
                value={formEmail.email_imap_host}
                onChange={(e) => setFormEmail({ ...formEmail, email_imap_host: e.target.value })}
                placeholder="imap.gmail.com"
              />
            </div>
            <div>
              <Label>Porta IMAP</Label>
              <Input
                type="number"
                value={formEmail.email_imap_port}
                onChange={(e) => setFormEmail({ ...formEmail, email_imap_port: parseInt(e.target.value) || 993 })}
                placeholder="993"
              />
            </div>
            <div>
              <Label>Usuário (email)</Label>
              <Input
                type="email"
                value={formEmail.email_imap_user}
                onChange={(e) => setFormEmail({ ...formEmail, email_imap_user: e.target.value })}
                placeholder="contato@orgao.gov.br"
              />
            </div>
            <div>
              <Label>Senha IMAP</Label>
              <Input
                type="password"
                value={formEmail.email_imap_senha}
                onChange={(e) => setFormEmail({ ...formEmail, email_imap_senha: e.target.value })}
                placeholder="Deixe vazio para manter a atual"
              />
            </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                if (!orgaoSelecionado) return
                setTestandoImap(true)
                try {
                  const res = await adminFetch(`${API_URL}/api/orgaos/${orgaoSelecionado.id}/email-config/testar-imap`, { method: 'POST' })
                  const data = await res.json()
                  alert(data.sucesso ? data.mensagem : `Erro: ${data.mensagem}`)
                } catch (e) {
                  alert('Erro ao testar IMAP')
                } finally {
                  setTestandoImap(false)
                }
              }}
              disabled={testandoImap || !formEmail.email_imap_host || !formEmail.email_imap_user}
            >
              {testandoImap ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
              Testar IMAP
            </Button>
            <Button
              variant="outline"
              onClick={testarConfiguracaoEmail}
              disabled={testandoEmail || !formEmail.email_smtp_host || !formEmail.email_smtp_user}
            >
              {testandoEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4 mr-1" />}
              Testar
            </Button>
            <Button variant="outline" onClick={() => setShowConfigurarEmail(false)}>
              Cancelar
            </Button>
            <Button onClick={salvarConfiguracaoEmail} disabled={salvandoEmail}>
              {salvandoEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Configurar WhatsApp */}
      <Dialog open={showConfigurarWhatsApp} onOpenChange={setShowConfigurarWhatsApp}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Configurar WhatsApp (Z-API)
            </DialogTitle>
            <DialogDescription>
              {orgaoSelecionado?.nome} - Envio de mensagens via Z-API. Deixe vazio para usar config global.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-blue-50 rounded-lg text-sm">
              <p className="font-medium text-blue-800">Z-API</p>
              <p className="text-blue-700 mt-1 text-xs">
                Obtenha as credenciais em z-api.io. Instance ID, Token e Client Token.
              </p>
            </div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm">
              <p className="font-medium text-green-800 flex items-center gap-1">
                <LinkIcon className="w-4 h-4" /> URL do Webhook
              </p>
              <p className="text-green-700 mt-1 text-xs mb-2">
                Copie esta URL e cole nas configurações da sua instância Z-API:
              </p>
              <code className="block bg-white p-2 rounded text-xs break-all border">
                {API_URL}/api/webhooks/zapi
              </code>
            </div>
            <div>
              <Label>Provedor</Label>
              <Select value={formWhatsApp.whatsapp_provider} onValueChange={(v) => setFormWhatsApp({ ...formWhatsApp, whatsapp_provider: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ZAPI">Z-API</SelectItem>
                  <SelectItem value="META" disabled>Meta + Chatwoot (em breve)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Instance ID</Label>
              <Input
                value={formWhatsApp.whatsapp_instance_id}
                onChange={(e) => setFormWhatsApp({ ...formWhatsApp, whatsapp_instance_id: e.target.value })}
                placeholder="ID da instancia Z-API"
              />
            </div>
            <div>
              <Label>Token</Label>
              <Input
                type="password"
                value={formWhatsApp.whatsapp_token}
                onChange={(e) => setFormWhatsApp({ ...formWhatsApp, whatsapp_token: e.target.value })}
                placeholder="Deixe vazio para manter o atual"
              />
            </div>
            <div>
              <Label>Client Token</Label>
              <Input
                type="password"
                value={formWhatsApp.whatsapp_client_token}
                onChange={(e) => setFormWhatsApp({ ...formWhatsApp, whatsapp_client_token: e.target.value })}
                placeholder="Deixe vazio para manter o atual"
              />
            </div>
            <div>
              <Label>Numero para teste (ex: 5511999999999)</Label>
              <Input
                value={whatsappNumeroTeste}
                onChange={(e) => setWhatsappNumeroTeste(e.target.value)}
                placeholder="5511999999999"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={testarConfiguracaoWhatsApp} disabled={testandoWhatsApp}>
              {testandoWhatsApp ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4 mr-1" />}
              Testar
            </Button>
            <Button variant="outline" onClick={() => setShowConfigurarWhatsApp(false)}>Cancelar</Button>
            <Button onClick={salvarConfiguracaoWhatsApp} disabled={salvandoWhatsApp}>
              {salvandoWhatsApp ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Config WhatsApp Global (fallback) */}
      <Dialog open={showConfigWhatsAppGlobal} onOpenChange={setShowConfigWhatsAppGlobal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              WhatsApp Global (fallback)
            </DialogTitle>
            <DialogDescription>
              Usado quando o orgao nao tem config propria. Z-API.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Instance ID</Label>
              <Input
                value={formWhatsAppGlobal.instance_id}
                onChange={(e) => setFormWhatsAppGlobal({ ...formWhatsAppGlobal, instance_id: e.target.value })}
                placeholder="ID da instancia Z-API"
              />
            </div>
            <div>
              <Label>Token</Label>
              <Input
                type="password"
                value={formWhatsAppGlobal.token}
                onChange={(e) => setFormWhatsAppGlobal({ ...formWhatsAppGlobal, token: e.target.value })}
                placeholder="Deixe vazio para manter o atual"
              />
            </div>
            <div>
              <Label>Client Token</Label>
              <Input
                type="password"
                value={formWhatsAppGlobal.client_token}
                onChange={(e) => setFormWhatsAppGlobal({ ...formWhatsAppGlobal, client_token: e.target.value })}
                placeholder="Deixe vazio para manter o atual"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowConfigWhatsAppGlobal(false)}>Cancelar</Button>
            <Button onClick={salvarConfigWhatsAppGlobal} disabled={salvandoWhatsApp}>
              {salvandoWhatsApp ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
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
