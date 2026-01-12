'use client'

import { useState, useEffect } from 'react'
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
} from '@/components/ui/dialog'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Building2,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  Search,
  Loader2,
  Shield,
  Link2,
  Globe,
  Server,
  Users,
  MapPin,
  ExternalLink,
  Info,
  Mail,
  Copy,
  Check,
  Save,
  Gavel,
  UserCog
} from 'lucide-react'

const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '')

interface EnteAutorizado {
  id: number
  cnpj: string
  razaoSocial: string
}

interface Usuario {
  id: number
  login: string
  nome: string
  cpfCnpj: string
  email: string
  administrador: boolean
  gestaoEnteAutorizado: boolean
  entesAutorizados: EnteAutorizado[]
}

interface Unidade {
  id: number
  codigoUnidade: string
  nomeUnidade: string
  municipio?: {
    nome: string
    codigoIbge: string
    uf: {
      siglaUF: string
      nomeUF: string
    }
  }
  dataInclusao: string
}

interface OrgaoDetalhes {
  cnpj: string
  razaoSocial: string
  poderId?: string
  esferaId?: string
  validado?: boolean
  unidades: Unidade[]
}

interface ConfigStatus {
  configurado: boolean
  ambiente: string
  cnpjOrgao: string
  loginConfigurado: boolean
}

export default function AdminPNCPPage() {
  const [loading, setLoading] = useState(true)
  const [loadingUnidades, setLoadingUnidades] = useState<string | null>(null)
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [configStatus, setConfigStatus] = useState<ConfigStatus | null>(null)
  const [orgaosDetalhes, setOrgaosDetalhes] = useState<Record<string, OrgaoDetalhes>>({})
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<string | null>(null)
  
  // Modal states
  const [showDetalhesOrgao, setShowDetalhesOrgao] = useState(false)
  const [orgaoSelecionado, setOrgaoSelecionado] = useState<EnteAutorizado | null>(null)
  const [showInstrucoes, setShowInstrucoes] = useState(false)
  const [showCriarUsuario, setShowCriarUsuario] = useState(false)
  const [criandoUsuario, setCriandoUsuario] = useState(false)
  const [resetandoUsuario, setResetandoUsuario] = useState(false)
  const [erroCriarUsuario, setErroCriarUsuario] = useState<string | null>(null)
  const [podeResetar, setPodeResetar] = useState(false)
  const [showUsuariosOrgao, setShowUsuariosOrgao] = useState(false)
  const [carregandoUsuarioOrgao, setCarregandoUsuarioOrgao] = useState(false)
  const [dadosUsuarioOrgao, setDadosUsuarioOrgao] = useState<{ id: string; nome: string; cnpj: string; email_login?: string | null } | null>(null)
  const [usuariosDoOrgao, setUsuariosDoOrgao] = useState<any[]>([])
  const [formUsuario, setFormUsuario] = useState({
    email_login: '',
    senha: '',
    nome_responsavel: '',
    role: 'ADMIN' as 'ADMIN' | 'PREGOEIRO' | 'EQUIPE_APOIO'
  })
  
  // Estado para configuração manual de credenciais PNCP
  const [pncpCredentials, setPncpCredentials] = useState({
    orgaoId: '',
    apiUrl: '',
    login: '',
    senha: '',
    cnpjOrgao: ''
  })
  const [showCredentialsForm, setShowCredentialsForm] = useState(false)
  const [savingCredentials, setSavingCredentials] = useState(false)

  useEffect(() => {
    carregarDados()
    // Carregar credenciais do localStorage
    const savedCredentials = localStorage.getItem('pncp_credentials')
    if (savedCredentials) {
      try {
        setPncpCredentials(JSON.parse(savedCredentials))
      } catch (error) {
        console.error('Erro ao carregar credenciais do localStorage:', error)
      }
    }
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    setErro(null)
    try {
      // Preparar headers com credenciais do localStorage se disponíveis
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      
      // Adicionar credenciais PNCP do localStorage nos headers
      if (pncpCredentials.apiUrl && pncpCredentials.login && pncpCredentials.senha) {
        headers['X-PNCP-API-URL'] = pncpCredentials.apiUrl
        headers['X-PNCP-Login'] = pncpCredentials.login
        headers['X-PNCP-Senha'] = pncpCredentials.senha
        headers['X-PNCP-CNPJ-Orgao'] = pncpCredentials.cnpjOrgao
      }

      // Carregar status da configuração
      const configRes = await fetch(`${API_URL}/api/pncp/config/status`, { headers })
      if (configRes.ok) {
        const config = await configRes.json()
        setConfigStatus(config)
      }

      // Carregar usuário e entes autorizados com credenciais
      const usuarioRes = await fetch(`${API_URL}/api/pncp/usuario`, { headers })
      if (usuarioRes.ok) {
        const data = await usuarioRes.json()
        setUsuario(data.usuario)
        
        // Carregar unidades de todos os entes automaticamente
        if (data.usuario?.entesAutorizados) {
          carregarTodasUnidades(data.usuario.entesAutorizados)
        }
      } else {
        const errorData = await usuarioRes.json()
        setErro(errorData.message || 'Erro ao carregar dados do PNCP')
      }
    } catch (error: any) {
      console.error('Erro ao carregar dados:', error)
      setErro('Erro de conexão com o servidor')
    } finally {
      setLoading(false)
    }
  }

  const carregarTodasUnidades = async (entes: EnteAutorizado[]) => {
    for (const ente of entes) {
      try {
        const response = await fetch(`${API_URL}/api/pncp/orgaos/${ente.cnpj}/unidades`)
        if (response.ok) {
          const data = await response.json()
          setOrgaosDetalhes(prev => ({
            ...prev,
            [ente.cnpj]: {
              cnpj: ente.cnpj,
              razaoSocial: ente.razaoSocial,
              unidades: data.unidades || []
            }
          }))
        }
      } catch (error) {
        console.error(`Erro ao carregar unidades de ${ente.cnpj}:`, error)
      }
    }
  }

  const carregarUnidades = async (cnpj: string) => {
    setLoadingUnidades(cnpj)
    try {
      const response = await fetch(`${API_URL}/api/pncp/orgaos/${cnpj}/unidades`)
      if (response.ok) {
        const data = await response.json()
        setOrgaosDetalhes(prev => ({
          ...prev,
          [cnpj]: {
            cnpj,
            razaoSocial: usuario?.entesAutorizados.find(e => e.cnpj === cnpj)?.razaoSocial || '',
            unidades: data.unidades || []
          }
        }))
      }
    } catch (error) {
      console.error('Erro ao carregar unidades:', error)
    } finally {
      setLoadingUnidades(null)
    }
  }

  const abrirDetalhesOrgao = async (ente: EnteAutorizado) => {
    setOrgaoSelecionado(ente)
    setShowDetalhesOrgao(true)
    
    if (!orgaosDetalhes[ente.cnpj]) {
      await carregarUnidades(ente.cnpj)
    }
  }

  const formatarCNPJ = (cnpj: string) => {
    const numeros = cnpj.replace(/\D/g, '')
    return numeros.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  }

  const copiarParaClipboard = (texto: string, id: string) => {
    navigator.clipboard.writeText(texto)
    setCopiado(id)
    setTimeout(() => setCopiado(null), 2000)
  }

  const sincronizarUnidadePlataforma = async () => {
    if (!orgaoSelecionado) return

    const detalhes = orgaosDetalhes[orgaoSelecionado.cnpj]
    const unidade = detalhes?.unidades?.[0]
    if (!unidade) {
      alert('Nenhuma unidade encontrada para este órgão no PNCP.')
      return
    }

    try {
      // Buscar órgão local pelo CNPJ
      const orgaosRes = await fetch(`${API_URL}/api/orgaos`)
      if (!orgaosRes.ok) {
        throw new Error('Erro ao carregar órgãos locais')
      }
      const orgaos = await orgaosRes.json()
      const orgaoLocal = orgaos.find((o: any) => o.cnpj.replace(/\D/g, '') === orgaoSelecionado.cnpj)

      if (!orgaoLocal) {
        alert('Órgão ainda não está cadastrado na plataforma. Crie o órgão primeiro.')
        return
      }

      // Atualizar vínculo PNCP do órgão local com o código de unidade retornado pelo PNCP
      const vinculoRes = await fetch(`${API_URL}/api/orgaos/${orgaoLocal.id}/pncp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pncp_vinculado: true,
          pncp_codigo_unidade: unidade.codigoUnidade || '1',
        }),
      })

      if (vinculoRes.ok) {
        alert(`✅ Unidade ${unidade.codigoUnidade} sincronizada como padrão na plataforma para este órgão.`)
      } else {
        const error = await vinculoRes.json()
        alert('Erro ao salvar vínculo PNCP no órgão: ' + (error.message || 'Erro desconhecido'))
      }
    } catch (error: any) {
      console.error('Erro ao sincronizar unidade:', error)
      alert('Erro ao sincronizar unidade: ' + error.message)
    }
  }

  // Funções para gerenciar credenciais PNCP da PLATAFORMA
  const salvarCredenciaisPNCP = async () => {
    setSavingCredentials(true)
    try {
      // Validar campos obrigatórios
      if (!pncpCredentials.apiUrl || !pncpCredentials.login || !pncpCredentials.senha || !pncpCredentials.cnpjOrgao) {
        alert('Todos os campos são obrigatórios!')
        return
      }

      // Salvar credenciais da plataforma no backend
      const response = await fetch(`${API_URL}/api/pncp/credentials`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          apiUrl: pncpCredentials.apiUrl,
          login: pncpCredentials.login,
          senha: pncpCredentials.senha,
          cnpjOrgao: pncpCredentials.cnpjOrgao
        })
      })

      if (response.ok) {
        alert('✅ Credenciais PNCP da plataforma salvas com sucesso!')
        setShowCredentialsForm(false)
        
        // Recarregar dados para mostrar as credenciais salvas
        await carregarCredenciaisPNCP()
        await carregarDados()
      } else {
        const error = await response.json()
        alert(`❌ Erro ao salvar credenciais: ${error.message || 'Erro desconhecido'}`)
      }
    } catch (error: any) {
      console.error('Erro ao salvar credenciais:', error)
      alert(`❌ Erro ao salvar credenciais: ${error.message}`)
    } finally {
      setSavingCredentials(false)
    }
  }

  const carregarCredenciaisPNCP = async () => {
    try {
      // Carregar credenciais da plataforma PNCP
      const response = await fetch(`${API_URL}/api/pncp/credentials`)
      if (response.ok) {
        const credentials = await response.json()
        setPncpCredentials({
          orgaoId: 'platform', // Indica que são credenciais da plataforma
          apiUrl: credentials.apiUrl || '',
          login: credentials.login || '',
          senha: '', // Não retornamos a senha do backend por segurança
          cnpjOrgao: credentials.cnpjOrgao || ''
        })
      }
    } catch (error) {
      console.error('Erro ao carregar credenciais PNCP:', error)
    }
  }

  const limparCredenciaisPNCP = async () => {
    if (confirm('Tem certeza que deseja limpar as credenciais PNCP da plataforma?')) {
      try {
        const response = await fetch(`${API_URL}/api/pncp/credentials`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            apiUrl: '',
            login: '',
            senha: '',
            cnpjOrgao: ''
          })
        })

        if (response.ok) {
          setPncpCredentials({
            orgaoId: 'platform',
            apiUrl: '',
            login: '',
            senha: '',
            cnpjOrgao: ''
          })
          alert('✅ Credenciais PNCP da plataforma limpas com sucesso!')
          carregarDados()
        } else {
          alert('❌ Erro ao limpar credenciais')
        }
      } catch (error) {
        console.error('Erro ao limpar credenciais:', error)
        alert('❌ Erro ao limpar credenciais')
      }
    }
  }

  const testarCredenciaisPNCP = async () => {
    if (!pncpCredentials.apiUrl || !pncpCredentials.login || !pncpCredentials.senha) {
      alert('Configure as credenciais antes de testar!')
      return
    }

    try {
      // Primeiro salvar as credenciais da plataforma no backend
      await salvarCredenciaisPNCP()

      // Testar conexão usando o endpoint da plataforma
      const response = await fetch(`${API_URL}/api/pncp/credentials/test`, {
        method: 'POST'
      })

      if (response.ok) {
        const data = await response.json()
        if (data.sucesso) {
          alert('✅ Credenciais PNCP da plataforma testadas com sucesso!')
          // Recarregar dados para mostrar os entes autorizados
          await carregarDados()
        } else {
          alert(`❌ Erro ao testar credenciais: ${data.mensagem}`)
        }
      } else {
        const errorData = await response.json()
        alert(`❌ Erro ao testar credenciais: ${errorData.message || 'Erro desconhecido'}`)
      }
    } catch (error: any) {
      console.error('Erro ao testar credenciais:', error)
      alert(`❌ Erro ao testar credenciais: ${error.message}`)
    }
  }

  const abrirCriarUsuario = (ente: EnteAutorizado) => {
    setOrgaoSelecionado(ente)
    setFormUsuario({
      email_login: '',
      senha: '',
      nome_responsavel: '',
      role: 'ADMIN'
    })
    setErroCriarUsuario(null)
    setPodeResetar(false)
    setShowCriarUsuario(true)
  }

  const abrirUsuariosOrgao = async (ente: EnteAutorizado) => {
    setOrgaoSelecionado(ente)
    setDadosUsuarioOrgao(null)
    setUsuariosDoOrgao([])
    setFormUsuario({
      email_login: '',
      senha: '',
      nome_responsavel: '',
      role: 'ADMIN'
    })
    setCarregandoUsuarioOrgao(true)
    setShowUsuariosOrgao(true)

    try {
      // 1. Busca o órgão pelo CNPJ
      const cnpjBusca = ente.cnpj.replace(/\D/g, '')
      const resOrgaos = await fetch(`${API_URL}/api/orgaos?all=true`)
      if (resOrgaos.ok) {
        const orgaosData = await resOrgaos.json()
        const orgaosList = Array.isArray(orgaosData) ? orgaosData : orgaosData.value || []
        const encontrado = orgaosList.find((o: any) => o.cnpj?.replace(/\D/g, '') === cnpjBusca)
        if (encontrado) {
          setDadosUsuarioOrgao({
            id: encontrado.id,
            nome: encontrado.nome,
            cnpj: encontrado.cnpj,
            email_login: encontrado.email_login,
          })

          // 2. Busca usuários vinculados a este órgão na tabela usuarios
          const resUsuarios = await fetch(`${API_URL}/api/usuarios`)
          if (resUsuarios.ok) {
            const usuariosData = await resUsuarios.json()
            const usuariosList = Array.isArray(usuariosData) ? usuariosData : usuariosData.value || []
            const usuariosDoOrgaoFiltrados = usuariosList.filter((u: any) => u.orgao_id === encontrado.id)
            setUsuariosDoOrgao(usuariosDoOrgaoFiltrados)
          }
        }
      }
    } catch (error) {
      console.error('Erro ao carregar usuários do órgão:', error)
    } finally {
      setCarregandoUsuarioOrgao(false)
    }
  }

  const criarUsuarioOrgao = async () => {
    if (!orgaoSelecionado) return
    
    setCriandoUsuario(true)
    setErroCriarUsuario(null)
    setPodeResetar(false)
    try {
      let orgaoId: string | null = null

      // 1. Primeiro verificar se o órgão já existe pelo CNPJ (incluindo inativos)
      const cnpjBusca = orgaoSelecionado.cnpj.replace(/\D/g, '')
      const resOrgaos = await fetch(`${API_URL}/api/orgaos?all=true`)
      if (resOrgaos.ok) {
        const orgaosData = await resOrgaos.json()
        const orgaosList = Array.isArray(orgaosData) ? orgaosData : orgaosData.value || []
        const orgaoExistente = orgaosList.find((o: any) => o.cnpj?.replace(/\D/g, '') === cnpjBusca)
        if (orgaoExistente) {
          orgaoId = orgaoExistente.id
          // Se órgão está inativo, ativar
          if (!orgaoExistente.ativo) {
            await fetch(`${API_URL}/api/orgaos/${orgaoId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ativo: true })
            })
          }
        }
      }

      // 2. Se órgão não existe, criar
      if (!orgaoId) {
        const responseOrgao = await fetch(`${API_URL}/api/orgaos/registro`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formUsuario.email_login,
            senha: formUsuario.senha,
            nome: orgaoSelecionado.razaoSocial,
            cnpj: orgaoSelecionado.cnpj,
            codigo: orgaoSelecionado.cnpj.substring(0, 10)
          })
        })

        if (responseOrgao.ok) {
          const result = await responseOrgao.json()
          orgaoId = result.orgao?.id || result.id
        } else {
          const errorData = await responseOrgao.json()
          setErroCriarUsuario(errorData.message || 'Erro ao criar órgão. Verifique se o email já está em uso.')
          return
        }
      }

      if (!orgaoId) {
        setErroCriarUsuario('Não foi possível criar ou identificar o órgão. Tente novamente.')
        return
      }

      // 2. Criar usuário vinculado ao órgão na tabela usuarios
      const responseUsuario = await fetch(`${API_URL}/api/usuarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: formUsuario.nome_responsavel || orgaoSelecionado.razaoSocial,
          email: formUsuario.email_login,
          senha: formUsuario.senha,
          role: formUsuario.role,
          orgao_id: orgaoId
        })
      })

      if (responseUsuario.ok) {
        const roleLabels = { ADMIN: 'Administrador', PREGOEIRO: 'Pregoeiro', EQUIPE_APOIO: 'Equipe de Apoio' }
        alert(`✅ Usuário criado com sucesso!\n\nEmail: ${formUsuario.email_login}\nSenha: ${formUsuario.senha}\nFunção: ${roleLabels[formUsuario.role]}`)
        setShowCriarUsuario(false)
      } else {
        const errorUsuario = await responseUsuario.json()
        setErroCriarUsuario(errorUsuario.message || 'Erro ao criar usuário. Email pode já estar cadastrado.')
      }
    } catch (error: any) {
      console.error('Erro ao criar órgão:', error)
      alert('Erro ao criar órgão: ' + error.message)
    } finally {
      setCriandoUsuario(false)
    }
  }

  const resetUsuarioOrgao = async () => {
    if (!orgaoSelecionado) return

    setResetandoUsuario(true)
    try {
      const response = await fetch(`${API_URL}/api/orgaos/reset-credenciais`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cnpj: orgaoSelecionado.cnpj,
          email: formUsuario.email_login,
          senha: formUsuario.senha,
        }),
      })

      if (response.ok) {
        alert(`✅ Usuário resetado com sucesso!\n\nEmail: ${formUsuario.email_login}\nSenha: ${formUsuario.senha}`)
        setShowCriarUsuario(false)
      } else {
        const error = await response.json()
        alert('Erro ao resetar usuário: ' + (error.message || 'Erro desconhecido'))
      }
    } catch (error: any) {
      console.error('Erro ao resetar usuário:', error)
      alert('Erro ao resetar usuário: ' + error.message)
    } finally {
      setResetandoUsuario(false)
    }
  }

  const entesFiltrados = usuario?.entesAutorizados.filter(ente =>
    ente.razaoSocial.toLowerCase().includes(busca.toLowerCase()) ||
    ente.cnpj.includes(busca)
  ) || []

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
        <p>Carregando dados do PNCP...</p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Globe className="w-7 h-7" />
            Integração PNCP
          </h1>
          <p className="text-gray-500">
            Gerencie os entes autorizados e unidades vinculadas à plataforma
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.location.href = '/admin/usuarios'}>
            <Users className="w-4 h-4 mr-2" />
            Usuários
          </Button>
          <Button variant="outline" onClick={() => setShowInstrucoes(true)}>
            <Info className="w-4 h-4 mr-2" />
            Como Vincular Órgãos
          </Button>
          <Button onClick={carregarDados}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Erro */}
      {erro && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-red-700">
              <XCircle className="w-5 h-5" />
              <span>{erro}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Status da Configuração */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Ambiente</p>
                <p className="text-xl font-bold">
                  {configStatus?.ambiente === 'TREINAMENTO' ? (
                    <span className="text-yellow-600">Treinamento</span>
                  ) : (
                    <span className="text-green-600">Produção</span>
                  )}
                </p>
              </div>
              <Server className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Status</p>
                <p className="text-xl font-bold">
                  {configStatus?.configurado ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle className="w-5 h-5" /> Conectado
                    </span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1">
                      <XCircle className="w-5 h-5" /> Desconectado
                    </span>
                  )}
                </p>
              </div>
              <Shield className="w-8 h-8 text-gray-400" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Entes Autorizados</p>
                <p className="text-2xl font-bold text-blue-600">
                  {usuario?.entesAutorizados.length || 0}
                </p>
              </div>
              <Building2 className="w-8 h-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Com Unidades</p>
                <p className="text-2xl font-bold text-green-600">
                  {Object.values(orgaosDetalhes).filter(o => o.unidades.length > 0).length}
                </p>
              </div>
              <MapPin className="w-8 h-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Configuração Manual de Credenciais PNCP */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="w-5 h-5" />
                Configuração Manual de Credenciais PNCP
              </CardTitle>
              <CardDescription>
                Configure as credenciais do PNCP manualmente (apenas para desenvolvimento local)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              {pncpCredentials.apiUrl && (
                <Button variant="outline" onClick={testarCredenciaisPNCP}>
                  <Globe className="w-4 h-4 mr-2" />
                  Testar Conexão
                </Button>
              )}
              {pncpCredentials.apiUrl ? (
                <Button variant="destructive" onClick={limparCredenciaisPNCP}>
                  <XCircle className="w-4 h-4 mr-2" />
                  Limpar Credenciais
                </Button>
              ) : (
                <Button onClick={() => setShowCredentialsForm(true)}>
                  <Shield className="w-4 h-4 mr-2" />
                  Configurar Credenciais
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {pncpCredentials.apiUrl ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">URL da API</Label>
                  <p className="font-medium text-sm">{pncpCredentials.apiUrl}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Login</Label>
                  <p className="font-medium text-sm">{pncpCredentials.login}</p>
                </div>
                <div>
                  <Label className="text-gray-500">CNPJ do Órgão</Label>
                  <p className="font-medium text-sm">{formatarCNPJ(pncpCredentials.cnpjOrgao)}</p>
                </div>
                <div>
                  <Label className="text-gray-500">Status</Label>
                  <p className="font-medium text-sm text-green-600">✅ Configurado no localStorage</p>
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center gap-2 text-amber-800">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm font-medium">Aviso de Segurança</span>
                </div>
                <p className="text-xs text-amber-700 mt-1">
                  As credenciais estão armazenadas no localStorage do navegador. 
                  Esta configuração é apenas para desenvolvimento local. 
                  Em produção, use variáveis de ambiente no servidor.
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Shield className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p>Nenhuma credencial PNCP configurada</p>
              <p className="text-sm">Clique em "Configurar Credenciais" para adicionar as credenciais do PNCP</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Configuração de Credenciais */}
      <Dialog open={showCredentialsForm} onOpenChange={setShowCredentialsForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Configurar Credenciais PNCP
            </DialogTitle>
            <DialogDescription>
              Insira as credenciais de acesso ao Portal Nacional de Contratações Públicas
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>URL da API PNCP *</Label>
                <Input
                  value={pncpCredentials.apiUrl}
                  onChange={(e) => setPncpCredentials({...pncpCredentials, apiUrl: e.target.value})}
                  placeholder="https://treina.pncp.gov.br/api/pncp/v1"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Login PNCP *</Label>
                <Input
                  value={pncpCredentials.login}
                  onChange={(e) => setPncpCredentials({...pncpCredentials, login: e.target.value})}
                  placeholder="UUID de acesso ao PNCP"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Senha PNCP *</Label>
                <Input
                  type="password"
                  value={pncpCredentials.senha}
                  onChange={(e) => setPncpCredentials({...pncpCredentials, senha: e.target.value})}
                  placeholder="Senha de acesso ao PNCP"
                />
              </div>
              
              <div className="space-y-2">
                <Label>CNPJ do Órgão *</Label>
                <Input
                  value={pncpCredentials.cnpjOrgao}
                  onChange={(e) => setPncpCredentials({...pncpCredentials, cnpjOrgao: e.target.value})}
                  placeholder="CNPJ do órgão no PNCP"
                />
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-medium text-blue-800 mb-2">Ambientes Disponíveis:</p>
              <div className="space-y-1 text-xs text-blue-700">
                <div>• <strong>Treinamento:</strong> https://treina.pncp.gov.br/api/pncp/v1</div>
                <div>• <strong>Produção:</strong> https://pncp.gov.br/api/pncp/v1</div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => setShowCredentialsForm(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={salvarCredenciaisPNCP}
              disabled={savingCredentials}
            >
              {savingCredentials ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-2" />
              )}
              Salvar Credenciais
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Informações do Usuário */}
      {usuario && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Credenciais da Plataforma
            </CardTitle>
            <CardDescription>
              Informações do usuário autenticado no PNCP
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-gray-500">Nome/Razão Social</Label>
                <p className="font-medium">{usuario.nome}</p>
              </div>
              <div>
                <Label className="text-gray-500">CNPJ</Label>
                <p className="font-medium">{formatarCNPJ(usuario.cpfCnpj)}</p>
              </div>
              <div>
                <Label className="text-gray-500">Email</Label>
                <p className="font-medium">{usuario.email}</p>
              </div>
              <div>
                <Label className="text-gray-500">Login (UUID)</Label>
                <div className="flex items-center gap-2">
                  <code className="text-sm bg-gray-100 px-2 py-1 rounded">{usuario.login}</code>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => copiarParaClipboard(usuario.login, 'login')}
                  >
                    {copiado === 'login' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
              <div>
                <Label className="text-gray-500">Gestão de Entes</Label>
                <p className="font-medium">
                  {usuario.gestaoEnteAutorizado ? (
                    <Badge className="bg-green-100 text-green-800">Habilitado</Badge>
                  ) : (
                    <Badge variant="outline">Desabilitado</Badge>
                  )}
                </p>
              </div>
              <div>
                <Label className="text-gray-500">Administrador</Label>
                <p className="font-medium">
                  {usuario.administrador ? (
                    <Badge className="bg-blue-100 text-blue-800">Sim</Badge>
                  ) : (
                    <Badge variant="outline">Não</Badge>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Lista de Entes Autorizados */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                Entes Autorizados (Órgãos Vinculados)
              </CardTitle>
              <CardDescription>
                Órgãos que a plataforma pode enviar dados em nome
              </CardDescription>
            </div>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <Input
                placeholder="Buscar por nome ou CNPJ..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {entesFiltrados.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Building2 className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum ente autorizado encontrado</p>
              <Button variant="link" onClick={() => setShowInstrucoes(true)}>
                Saiba como vincular órgãos
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>CNPJ</TableHead>
                  <TableHead>Razão Social</TableHead>
                  <TableHead>Unidades</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entesFiltrados.map((ente) => {
                  const detalhes = orgaosDetalhes[ente.cnpj]
                  const temUnidades = detalhes?.unidades && detalhes.unidades.length > 0
                  
                  return (
                    <TableRow key={ente.id}>
                      <TableCell className="font-mono">
                        {formatarCNPJ(ente.cnpj)}
                      </TableCell>
                      <TableCell className="font-medium">
                        {ente.razaoSocial}
                      </TableCell>
                      <TableCell>
                        {loadingUnidades === ente.cnpj ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : detalhes ? (
                          <Badge variant={temUnidades ? 'default' : 'outline'}>
                            {detalhes.unidades.length} unidade(s)
                          </Badge>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => carregarUnidades(ente.cnpj)}
                          >
                            Verificar
                          </Button>
                        )}
                      </TableCell>
                      <TableCell>
                        {temUnidades ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Pronto
                          </Badge>
                        ) : detalhes ? (
                          <Badge className="bg-yellow-100 text-yellow-800">
                            <AlertCircle className="w-3 h-3 mr-1" />
                            Sem Unidade
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            Não verificado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => abrirDetalhesOrgao(ente)}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Detalhes
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => abrirUsuariosOrgao(ente)}
                          >
                            <Users className="w-4 h-4 mr-1" />
                            Usuários
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => abrirCriarUsuario(ente)}
                            disabled={!temUnidades}
                            title={!temUnidades ? 'Órgão precisa ter unidade cadastrada' : 'Criar usuário no sistema'}
                          >
                            Criar Usuário
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Modal de Detalhes do Órgão */}
      <Dialog open={showDetalhesOrgao} onOpenChange={setShowDetalhesOrgao}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Detalhes do Órgão
            </DialogTitle>
            <DialogDescription>
              {orgaoSelecionado?.razaoSocial}
            </DialogDescription>
          </DialogHeader>
          
          {orgaoSelecionado && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-500">CNPJ</Label>
                  <p className="font-mono">{formatarCNPJ(orgaoSelecionado.cnpj)}</p>
                </div>
                <div>
                  <Label className="text-gray-500">ID no PNCP</Label>
                  <p>{orgaoSelecionado.id}</p>
                </div>
              </div>

              <div>
                <Label className="text-gray-500 mb-2 block">Unidades Cadastradas</Label>
                {loadingUnidades === orgaoSelecionado.cnpj ? (
                  <div className="text-center py-4">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                  </div>
                ) : orgaosDetalhes[orgaoSelecionado.cnpj]?.unidades.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Nome</TableHead>
                        <TableHead>Município</TableHead>
                        <TableHead>UF</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orgaosDetalhes[orgaoSelecionado.cnpj]?.unidades.map((unidade) => (
                        <TableRow key={unidade.id}>
                          <TableCell>{unidade.codigoUnidade}</TableCell>
                          <TableCell>{unidade.nomeUnidade}</TableCell>
                          <TableCell>{unidade.municipio?.nome || '-'}</TableCell>
                          <TableCell>{unidade.municipio?.uf?.siglaUF || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="text-center py-4 bg-yellow-50 rounded-lg">
                    <AlertCircle className="w-8 h-8 text-yellow-600 mx-auto mb-2" />
                    <p className="text-yellow-800 font-medium">Nenhuma unidade cadastrada</p>
                    <p className="text-sm text-yellow-600 mt-1">
                      Este órgão precisa ter pelo menos uma unidade cadastrada para enviar dados ao PNCP.
                    </p>
                    <p className="text-sm text-yellow-600 mt-2">
                      Solicite o cadastro da unidade pelo email: <strong>gestao.entes.pncp@gestao.gov.br</strong>
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center gap-4">
                <div className="text-xs text-gray-500">
                  Use este órgão/unidade como base para configurar o vínculo PNCP na plataforma.
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={sincronizarUnidadePlataforma}
                  >
                    <Link2 className="w-4 h-4 mr-1" />
                    Usar esta unidade na plataforma
                  </Button>
                  <Button variant="outline" onClick={() => setShowDetalhesOrgao(false)}>
                    Fechar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Usuários do Órgão */}
      <Dialog open={showUsuariosOrgao} onOpenChange={setShowUsuariosOrgao}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Usuários do Órgão
            </DialogTitle>
            <DialogDescription>
              {orgaoSelecionado?.razaoSocial}
            </DialogDescription>
          </DialogHeader>

          {carregandoUsuarioOrgao ? (
            <div className="py-6 text-center">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
              <p className="text-sm text-gray-600">Carregando usuários do órgão...</p>
            </div>
          ) : (
            <div className="space-y-4">
              {dadosUsuarioOrgao ? (
                <>
                  <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg">
                    <div>
                      <Label className="text-gray-500 text-xs">CNPJ</Label>
                      <p className="font-mono text-sm">{dadosUsuarioOrgao.cnpj}</p>
                    </div>
                    <div>
                      <Label className="text-gray-500 text-xs">Nome do Órgão</Label>
                      <p className="font-medium text-sm">{dadosUsuarioOrgao.nome}</p>
                    </div>
                  </div>

                  {usuariosDoOrgao.length > 0 ? (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Usuários Vinculados ({usuariosDoOrgao.length})</Label>
                      <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
                        {usuariosDoOrgao.map((usuario: any) => (
                          <div key={usuario.id} className="p-3 flex items-center justify-between hover:bg-gray-50">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-blue-700 font-medium text-sm">
                                  {usuario.nome?.charAt(0)?.toUpperCase() || '?'}
                                </span>
                              </div>
                              <div>
                                <p className="font-medium text-sm">{usuario.nome}</p>
                                <p className="text-xs text-gray-500">{usuario.email}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={usuario.role === 'ADMIN' ? 'destructive' : usuario.role === 'PREGOEIRO' ? 'default' : 'secondary'} className="text-xs">
                                {usuario.role === 'ADMIN' ? 'Administrador' : usuario.role === 'PREGOEIRO' ? 'Pregoeiro' : 'Equipe de Apoio'}
                              </Badge>
                              {usuario.ativo ? (
                                <Badge variant="outline" className="text-xs text-green-600 border-green-300">Ativo</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs text-red-600 border-red-300">Inativo</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="py-4 text-center text-sm text-gray-500 border rounded-lg bg-gray-50">
                      <Users className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      Nenhum usuário vinculado a este órgão.
                      <br />
                      <span className="text-xs">Use "Criar Usuário" para adicionar.</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <Button variant="outline" onClick={() => setShowUsuariosOrgao(false)}>
                      Fechar
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => {
                        setShowUsuariosOrgao(false)
                        if (orgaoSelecionado) abrirCriarUsuario(orgaoSelecionado)
                      }}
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Adicionar Usuário
                    </Button>
                  </div>
                </>
              ) : (
                <div className="py-6 text-center text-sm text-gray-600">
                  Nenhum órgão encontrado no sistema com este CNPJ.
                  <br />
                  Use a opção "Criar Usuário" para cadastrar este órgão.
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Instruções */}
      <Dialog open={showInstrucoes} onOpenChange={setShowInstrucoes}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Info className="w-5 h-5" />
              Como Vincular Novos Órgãos
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-blue-800 font-medium mb-2">
                ⚠️ Importante: Plataformas Privadas
              </p>
              <p className="text-sm text-blue-700">
                Para plataformas privadas, a inclusão de novos entes autorizados requer 
                <strong> contato prévio com a central de atendimento</strong> e apresentação 
                de <strong>comprovação de vínculo</strong> com o ente público.
              </p>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium">Passo a Passo:</h4>
              
              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">1</div>
                <div>
                  <p className="font-medium">Verificar se o órgão existe no PNCP</p>
                  <p className="text-sm text-gray-600">
                    Use a busca no portal público do PNCP para verificar se o CNPJ do órgão já está cadastrado.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">2</div>
                <div>
                  <p className="font-medium">Preparar documentação</p>
                  <p className="text-sm text-gray-600">
                    Reúna o contrato ou autorização formal do órgão público autorizando a plataforma a enviar dados em seu nome.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">3</div>
                <div>
                  <p className="font-medium">Enviar solicitação por email</p>
                  <p className="text-sm text-gray-600">
                    Envie um email para a central de atendimento solicitando a vinculação.
                  </p>
                  <div className="mt-2 p-3 bg-gray-100 rounded flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      <code>gestao.entes.pncp@gestao.gov.br</code>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => copiarParaClipboard('gestao.entes.pncp@gestao.gov.br', 'email')}
                    >
                      {copiado === 'email' ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">4</div>
                <div>
                  <p className="font-medium">Aguardar aprovação</p>
                  <p className="text-sm text-gray-600">
                    Após análise, o PNCP vinculará o órgão à sua plataforma. O órgão aparecerá automaticamente na lista de entes autorizados.
                  </p>
                </div>
              </div>

              <div className="flex gap-3 items-start">
                <div className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold">5</div>
                <div>
                  <p className="font-medium">Verificar unidades</p>
                  <p className="text-sm text-gray-600">
                    Após vinculação, verifique se o órgão possui unidades cadastradas. Caso não tenha, solicite também o cadastro da unidade.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 bg-yellow-50 rounded-lg">
              <p className="text-yellow-800 font-medium mb-1">
                📝 Modelo de Email
              </p>
              <p className="text-sm text-yellow-700 whitespace-pre-line">
{`Assunto: Solicitação de Vinculação de Ente - Plataforma [Nome da Plataforma]

Prezados,

Solicitamos a vinculação do(s) seguinte(s) órgão(s) à nossa plataforma:

- CNPJ: [CNPJ do órgão]
- Razão Social: [Nome do órgão]

Segue em anexo a documentação comprobatória do vínculo.

Dados da Plataforma:
- Login: ${usuario?.login || '[seu login UUID]'}
- CNPJ: ${usuario?.cpfCnpj ? formatarCNPJ(usuario.cpfCnpj) : '[CNPJ da plataforma]'}

Atenciosamente,
[Seu nome]`}
              </p>
            </div>

            <div className="flex justify-end">
              <Button onClick={() => setShowInstrucoes(false)}>
                Entendi
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Criar Usuário */}
      <Dialog open={showCriarUsuario} onOpenChange={setShowCriarUsuario}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Criar Usuário do Órgão
            </DialogTitle>
            <DialogDescription>
              {orgaoSelecionado?.razaoSocial}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
              <p>Ao criar o usuário, o órgão será cadastrado no sistema e poderá acessar o portal com as credenciais abaixo.</p>
            </div>

            {erroCriarUsuario && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {erroCriarUsuario}
              </div>
            )}

            <div className="space-y-2">
              <Label>CNPJ</Label>
              <Input
                value={orgaoSelecionado ? formatarCNPJ(orgaoSelecionado.cnpj) : ''}
                disabled
              />
            </div>

            <div className="space-y-2">
              <Label>Nome do Responsável</Label>
              <Input
                value={formUsuario.nome_responsavel}
                onChange={(e) => setFormUsuario({ ...formUsuario, nome_responsavel: e.target.value })}
                placeholder="Nome do responsável pelo órgão"
              />
            </div>

            <div className="space-y-2">
              <Label>Email de Login *</Label>
              <Input
                type="email"
                value={formUsuario.email_login}
                onChange={(e) => setFormUsuario({ ...formUsuario, email_login: e.target.value })}
                placeholder="email@orgao.gov.br"
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Senha *</Label>
              <Input
                type="text"
                value={formUsuario.senha}
                onChange={(e) => setFormUsuario({ ...formUsuario, senha: e.target.value })}
                placeholder="Senha de acesso"
                required
              />
              <p className="text-xs text-gray-500">A senha será enviada ao órgão</p>
            </div>

            <div className="space-y-2">
              <Label>Função do Usuário *</Label>
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
                      Administrador do Órgão
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
              <p className="text-xs text-gray-500">O primeiro usuário geralmente é o Administrador</p>
            </div>

            <div className="flex justify-between items-center gap-4">
              {podeResetar && (
                <Button
                  type="button"
                  variant="outline"
                  className="text-orange-700 border-orange-300 hover:bg-orange-50"
                  onClick={resetUsuarioOrgao}
                  disabled={resetandoUsuario}
                >
                  {resetandoUsuario ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <RefreshCw className="w-4 h-4 mr-2" />
                  )}
                  Resetar usuário existente
                </Button>
              )}

              <div className="flex justify-end gap-2 ml-auto">
                <Button variant="outline" onClick={() => setShowCriarUsuario(false)}>
                  Cancelar
                </Button>
                <Button 
                  onClick={criarUsuarioOrgao}
                  disabled={criandoUsuario || !formUsuario.email_login || !formUsuario.senha}
                >
                  {criandoUsuario ? (
                    <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Criar Usuário
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
