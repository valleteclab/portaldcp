"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { toast } from "sonner"
import { 
  Settings,
  User,
  Building2,
  Bell,
  Shield,
  Save,
  Upload,
  Users,
  Globe,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  FolderTree,
  GitBranch,
  Plus,
  Pencil,
  Trash2
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"
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

import { API_URL, authFetch, getAssetUrl } from '@/lib/api'

interface Setor {
  id: string
  codigo: string
  nome: string
}

export default function ConfiguracoesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")
  const validTabs = ["orgao", "setores", "usuarios", "notificacoes", "pncp", "transparencia", "seguranca"]
  const [activeTab, setActiveTab] = useState(validTabs.includes(tabParam || "") ? tabParam! : "orgao")

  // Restringe acesso a usuários com role ADMIN.
  // Login direto do órgão (sem usuario individual) sempre tem acesso.
  useEffect(() => {
    try {
      const usuarioStr = localStorage.getItem('usuario')
      if (usuarioStr) {
        const usuario = JSON.parse(usuarioStr)
        if (usuario.role && usuario.role !== 'ADMIN') {
          router.replace('/orgao')
        }
      }
    } catch (e) {
      console.error('Erro ao verificar role para configurações:', e)
    }
  }, [router])

  useEffect(() => {
    if (tabParam && validTabs.includes(tabParam) && tabParam !== activeTab) {
      setActiveTab(tabParam)
    }
  }, [tabParam])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    const url = new URL(window.location.href)
    if (value === "orgao") url.searchParams.delete("tab")
    else url.searchParams.set("tab", value)
    router.replace(url.pathname + url.search)
  }

  const [orgao, setOrgao] = useState({
    id: '',
    nome: '',
    cnpj: '',
    logradouro: '',
    cidade: '',
    uf: '',
    cep: '',
    telefone: '',
    email: '',
    site: '',
    whatsapp_responsavel_medicoes: '' as string | null,
    logo_url: '' as string | null,
  })
  const [loading, setLoading] = useState(true)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const carregarOrgao = async () => {
    try {
      const response = await authFetch(`${API_URL}/api/orgaos/me`)
      if (response.ok) {
        const dados = await response.json()
        const orgaoAtual = {
          id: dados.id || '',
          nome: dados.nome || '',
          cnpj: dados.cnpj || '',
          logradouro: dados.logradouro || '',
          cidade: dados.cidade || '',
          uf: dados.uf || '',
          cep: dados.cep || '',
          telefone: dados.telefone || '',
          email: dados.email || dados.email_login || '',
          site: dados.site || '',
          whatsapp_responsavel_medicoes: dados.whatsapp_responsavel_medicoes || '',
          logo_url: dados.logo_url || null,
        }
        setOrgao(orgaoAtual)
        const atual = localStorage.getItem('orgao') ? JSON.parse(localStorage.getItem('orgao')!) : {}
        localStorage.setItem('orgao', JSON.stringify({ ...atual, ...dados }))
      }
    } catch (e) {
      console.error('Erro ao carregar órgão:', e)
      const orgaoSalvo = localStorage.getItem('orgao')
      if (orgaoSalvo) {
        const dados = JSON.parse(orgaoSalvo)
        setOrgao({
          id: dados.id || '',
          nome: dados.nome || '',
          cnpj: dados.cnpj || '',
          logradouro: dados.logradouro || '',
          cidade: dados.cidade || '',
          uf: dados.uf || '',
          cep: dados.cep || '',
          telefone: dados.telefone || '',
          email: dados.email || dados.email_login || '',
          site: dados.site || '',
          whatsapp_responsavel_medicoes: dados.whatsapp_responsavel_medicoes || '',
          logo_url: dados.logo_url || null,
        })
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarOrgao()
  }, [])

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !orgao.id) return
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      alert('Use apenas PNG ou JPG')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Arquivo deve ter no máximo 2MB')
      return
    }
    setUploadingLogo(true)
    try {
      const formData = new FormData()
      formData.append('logo', file)
      const token = localStorage.getItem('access_token') || localStorage.getItem('orgao_token')
      const response = await fetch(`${API_URL}/api/orgaos/${orgao.id}/logo`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      if (response.ok) {
        const data = await response.json()
        setOrgao(prev => ({ ...prev, logo_url: data.logo_url }))
        const orgaoAtual = JSON.parse(localStorage.getItem('orgao') || '{}')
        orgaoAtual.logo_url = data.logo_url
        localStorage.setItem('orgao', JSON.stringify(orgaoAtual))
        alert('Logo enviada com sucesso!')
      } else {
        const err = await response.json()
        alert(err.message || 'Erro ao enviar logo')
      }
    } catch (error) {
      console.error('Erro ao enviar logo:', error)
      alert('Erro ao enviar logo')
    } finally {
      setUploadingLogo(false)
      e.target.value = ''
    }
  }

  const [notificacoes, setNotificacoes] = useState({
    emailNovaLicitacao: true,
    emailProposta: true,
    emailDisputa: true,
    emailResultado: true,
    pushNovaLicitacao: false,
    pushDisputa: true,
  })

  const [pncpConfig, setPncpConfig] = useState({
    apiUrl: '',
    login: '',
    senha: '',
    cnpjOrgao: '',
  })
  const [pncpStatus, setPncpStatus] = useState({
    configurado: false,
    ambiente: '',
    cnpjOrgao: '',
    loginConfigurado: false,
  })
  const [loadingPncp, setLoadingPncp] = useState(false)
  const [testingConnection, setTestingConnection] = useState(false)

  // Fator Transparência
  const [fatorId, setFatorId] = useState('')
  const [loadingFator, setLoadingFator] = useState(false)

  const carregarFatorId = async () => {
    try {
      const res = await authFetch(`${API_URL}/api/system-config/FATOR_TRANSPARENCIA_ID`)
      if (res.ok) {
        const data = await res.json()
        setFatorId(data.value || '')
      }
    } catch { /* não configurado ainda */ }
  }

  const salvarFatorId = async () => {
    if (!fatorId.trim()) { toast.error('Informe o ID do órgão'); return }
    setLoadingFator(true)
    try {
      const res = await authFetch(`${API_URL}/api/system-config/FATOR_TRANSPARENCIA_ID`, {
        method: 'PUT',
        body: JSON.stringify({
          key: 'FATOR_TRANSPARENCIA_ID',
          value: fatorId.trim(),
          description: 'ID do órgão no Portal Fator Transparência (ex: cmlem)',
        }),
      })
      if (res.ok) toast.success('ID do Portal Fator salvo com sucesso!')
      else toast.error('Erro ao salvar')
    } catch { toast.error('Erro ao salvar') }
    setLoadingFator(false)
  }

  // Setores
  const [setores, setSetores] = useState<Setor[]>([])
  const [loadingSetores, setLoadingSetores] = useState(false)
  const [modalSetorOpen, setModalSetorOpen] = useState(false)
  const [editingSetor, setEditingSetor] = useState<Setor | null>(null)
  const [formSetor, setFormSetor] = useState({ codigo: '', nome: '' })
  const [savingSetor, setSavingSetor] = useState(false)
  const [savingOrgao, setSavingOrgao] = useState(false)

  const salvarDadosOrgao = async () => {
    if (!orgao.id) return
    setSavingOrgao(true)
    try {
      const res = await authFetch(`${API_URL}/api/orgaos/${orgao.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: orgao.nome,
          cnpj: orgao.cnpj,
          logradouro: orgao.logradouro,
          cidade: orgao.cidade,
          uf: orgao.uf,
          cep: orgao.cep,
          telefone: orgao.telefone,
          email: orgao.email,
          site: orgao.site,
          whatsapp_responsavel_medicoes: orgao.whatsapp_responsavel_medicoes || null,
        }),
      })
      if (res.ok) {
        const dados = await res.json()
        setOrgao((prev) => ({ ...prev, ...dados }))
        const atual = localStorage.getItem("orgao") ? JSON.parse(localStorage.getItem("orgao")!) : {}
        localStorage.setItem("orgao", JSON.stringify({ ...atual, ...dados }))
        toast.success("Dados do órgão salvos com sucesso!")
      } else {
        const err = await res.json()
        toast.error(err.message || "Erro ao salvar dados do órgão")
      }
    } catch (e) {
      console.error("Erro ao salvar dados do órgão:", e)
      toast.error("Erro ao salvar dados do órgão")
    } finally {
      setSavingOrgao(false)
    }
  }

  const carregarSetores = async () => {
    if (!orgao.id) return
    setLoadingSetores(true)
    try {
      const res = await authFetch(`${API_URL}/api/orgaos/${orgao.id}/setores`)
      if (res.ok) {
        const data = await res.json()
        setSetores(data)
      }
    } catch (e) {
      console.error('Erro ao carregar setores:', e)
    } finally {
      setLoadingSetores(false)
    }
  }

  useEffect(() => {
    if (orgao.id) carregarSetores()
  }, [orgao.id])

  const abrirModalSetor = (setor?: Setor) => {
    if (setor) {
      setEditingSetor(setor)
      setFormSetor({ codigo: setor.codigo, nome: setor.nome })
    } else {
      setEditingSetor(null)
      setFormSetor({ codigo: '', nome: '' })
    }
    setModalSetorOpen(true)
  }

  const salvarSetor = async () => {
    if (!orgao.id || !formSetor.nome.trim()) return
    setSavingSetor(true)
    try {
      const url = editingSetor
        ? `${API_URL}/api/orgaos/${orgao.id}/setores/${editingSetor.id}`
        : `${API_URL}/api/orgaos/${orgao.id}/setores`
      const body = editingSetor
        ? { codigo: formSetor.codigo, nome: formSetor.nome }
        : { nome: formSetor.nome }
      const res = await authFetch(url, {
        method: editingSetor ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        setModalSetorOpen(false)
        carregarSetores()
        toast.success(editingSetor ? "Setor atualizado com sucesso!" : "Setor cadastrado com sucesso!")
      } else {
        const err = await res.json()
        toast.error(err.message || "Erro ao salvar setor")
      }
    } catch (e) {
      console.error("Erro ao salvar setor:", e)
      toast.error("Erro ao salvar setor")
    } finally {
      setSavingSetor(false)
    }
  }

  const excluirSetor = async (id: string) => {
    if (!orgao.id) return
    if (!confirm("Tem certeza que deseja excluir este setor? Esta ação não pode ser desfeita.")) return
    try {
      const res = await authFetch(`${API_URL}/api/orgaos/${orgao.id}/setores/${id}`, { method: "DELETE" })
      if (res.ok) {
        carregarSetores()
        toast.success("Setor excluído com sucesso!")
      } else {
        const err = await res.json()
        toast.error(err.message || "Erro ao excluir setor")
      }
    } catch (e) {
      console.error("Erro ao excluir setor:", e)
      toast.error("Erro ao excluir setor")
    }
  }

  // Carregar status atual da configuração PNCP
  const carregarStatusPNCP = async () => {
    try {
      const token = localStorage.getItem('orgao_token')
      const response = await authFetch(`${API_URL}/api/pncp/config/status`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      if (response.ok) {
        const data = await response.json()
        setPncpStatus(data)
      }
    } catch (error) {
      console.error('Erro ao carregar status PNCP:', error)
    }
  }

  // Testar conexão com PNCP
  const testarConexaoPNCP = async () => {
    setTestingConnection(true)
    try {
      const token = localStorage.getItem('orgao_token')
      const response = await authFetch(`${API_URL}/api/pncp/config/testar-conexao`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`
        }
      })
      const data = await response.json()
      if (response.ok) {
        alert('Conexão com PNCP estabelecida com sucesso!')
      } else {
        alert(`Erro na conexão: ${data.message || 'Falha ao conectar'}`)
      }
    } catch (error) {
      alert('Erro ao testar conexão com PNCP')
      console.error(error)
    } finally {
      setTestingConnection(false)
    }
  }

  // Salvar configurações PNCP
  const salvarConfigPNCP = async () => {
    setLoadingPncp(true)
    try {
      const token = localStorage.getItem('orgao_token')
      const response = await authFetch(`${API_URL}/api/pncp/config/atualizar`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(pncpConfig)
      })
      const data = await response.json()
      if (response.ok) {
        alert('Configurações PNCP salvas com sucesso!')
        // Recarregar status
        await carregarStatusPNCP()
      } else {
        alert(`Erro ao salvar: ${data.message || 'Falha ao salvar configurações'}`)
      }
    } catch (error) {
      alert('Erro ao salvar configurações PNCP')
      console.error(error)
    } finally {
      setLoadingPncp(false)
    }
  }

  useEffect(() => {
    carregarStatusPNCP()
    carregarFatorId()
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Configuracoes</h1>
          <p className="text-muted-foreground">Gerencie as configuracoes do orgao</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push('/orgao/configuracoes/modelos-documento')}
          >
            <FolderTree className="h-4 w-4" />
            Modelos de documento
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push('/orgao/configuracoes/fluxos-aprovacao')}
          >
            <GitBranch className="h-4 w-4" />
            Fluxos de aprovação
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => router.push('/orgao/configuracoes/parametros-licitacao')}
          >
            <Settings className="h-4 w-4" />
            Parâmetros de licitação
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="orgao">
            <Building2 className="h-4 w-4 mr-2" /> Dados do Orgao
          </TabsTrigger>
          <TabsTrigger value="setores">
            <FolderTree className="h-4 w-4 mr-2" /> Setores
          </TabsTrigger>
          <TabsTrigger value="usuarios">
            <User className="h-4 w-4 mr-2" /> Usuarios
          </TabsTrigger>
          <TabsTrigger value="notificacoes">
            <Bell className="h-4 w-4 mr-2" /> Notificacoes
          </TabsTrigger>
          <TabsTrigger value="pncp">
            <Globe className="h-4 w-4 mr-2" /> PNCP
          </TabsTrigger>
          <TabsTrigger value="transparencia">
            <Globe className="h-4 w-4 mr-2" /> Transparência
          </TabsTrigger>
          <TabsTrigger value="seguranca">
            <Shield className="h-4 w-4 mr-2" /> Seguranca
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orgao" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informacoes do Orgao</CardTitle>
              <CardDescription>Dados cadastrais do orgao licitante</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome do Orgao</Label>
                  <Input 
                    value={orgao.nome}
                    onChange={(e) => setOrgao({...orgao, nome: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>CNPJ</Label>
                  <Input 
                    value={orgao.cnpj}
                    onChange={(e) => setOrgao({...orgao, cnpj: e.target.value})}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Endereço</Label>
                  <Input 
                    value={orgao.logradouro}
                    onChange={(e) => setOrgao({...orgao, logradouro: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cidade</Label>
                  <Input 
                    value={orgao.cidade}
                    onChange={(e) => setOrgao({...orgao, cidade: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>UF</Label>
                    <Input 
                      value={orgao.uf}
                      onChange={(e) => setOrgao({...orgao, uf: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>CEP</Label>
                    <Input 
                      value={orgao.cep}
                      onChange={(e) => setOrgao({...orgao, cep: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Telefone</Label>
                  <Input 
                    value={orgao.telefone}
                    onChange={(e) => setOrgao({...orgao, telefone: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input 
                    value={orgao.email}
                    onChange={(e) => setOrgao({...orgao, email: e.target.value})}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Site</Label>
                  <Input
                    value={orgao.site}
                    onChange={(e) => setOrgao({...orgao, site: e.target.value})}
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>WhatsApp do responsável por medições</Label>
                  <Input
                    placeholder="Ex.: 77999990000 (DDD + número)"
                    value={orgao.whatsapp_responsavel_medicoes || ''}
                    onChange={(e) => setOrgao({...orgao, whatsapp_responsavel_medicoes: e.target.value})}
                  />
                  <p className="text-xs text-muted-foreground">
                    Recebe alerta quando uma medição aprovada há mais de 15 dias ainda não constar liquidada no portal da transparência (processo de pagamento possivelmente não encaminhado à contabilidade).
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={salvarDadosOrgao} disabled={savingOrgao || !orgao.id}>
                  {savingOrgao ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Salvar Alteracoes
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Logo do Orgao</CardTitle>
              <CardDescription>Imagem que aparecera nos documentos e portal</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="w-24 h-24 bg-slate-100 rounded-lg flex items-center justify-center overflow-hidden relative">
                  {orgao.logo_url && (
                    <img
                      src={`${getAssetUrl(orgao.logo_url)}?t=${orgao.logo_url.split('/').pop() || Date.now()}`}
                      alt="Logo do órgão"
                      className="w-full h-full object-contain absolute inset-0"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const ph = e.currentTarget.parentElement?.querySelector('.logo-placeholder');
                        if (ph) ph.classList.remove('hidden');
                      }}
                    />
                  )}
                  <div className={`logo-placeholder w-full h-full flex items-center justify-center ${orgao.logo_url ? 'hidden' : ''}`}>
                    <Building2 className="h-12 w-12 text-slate-400" />
                  </div>
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/jpg"
                    className="hidden"
                    onChange={handleUploadLogo}
                  />
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo || !orgao.id}
                  >
                    {uploadingLogo ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="mr-2 h-4 w-4" />
                    )}
                    Enviar Logo
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">PNG ou JPG, max 2MB</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="setores" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Setores / Departamentos</CardTitle>
                  <CardDescription>Cadastre os setores para uso em requisições e ordens de serviço</CardDescription>
                </div>
                <Button onClick={() => abrirModalSetor()} disabled={!orgao.id}>
                  <Plus className="h-4 w-4 mr-2" /> Novo Setor
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loadingSetores ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Carregando...
                </div>
              ) : setores.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhum setor cadastrado</p>
                  <p className="text-sm">Clique em &quot;Novo Setor&quot; para cadastrar</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nome</TableHead>
                      <TableHead className="w-24">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {setores.map((s) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono">{s.codigo}</TableCell>
                        <TableCell>{s.nome}</TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => abrirModalSetor(s)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => excluirSetor(s.id)}>
                              <Trash2 className="h-4 w-4 text-red-600" />
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

          <Dialog open={modalSetorOpen} onOpenChange={setModalSetorOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingSetor ? 'Editar Setor' : 'Novo Setor'}</DialogTitle>
                <DialogDescription>
                  {editingSetor ? 'Altere o nome do setor.' : 'O código será gerado automaticamente (ex: SET-001).'}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {editingSetor && (
                  <div className="space-y-2">
                    <Label>Código</Label>
                    <Input value={formSetor.codigo} readOnly className="bg-muted" />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input
                    value={formSetor.nome}
                    onChange={(e) => setFormSetor({ ...formSetor, nome: e.target.value })}
                    placeholder="Ex: Departamento de Compras"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModalSetorOpen(false)}>Cancelar</Button>
                <Button onClick={salvarSetor} disabled={savingSetor || !formSetor.nome.trim()}>
                  {savingSetor ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="usuarios" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Pregoeiros</CardTitle>
                  <CardDescription>Usuários autorizados a conduzir sessões</CardDescription>
                </div>
                <Button>Adicionar Pregoeiro</Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-20" />
                <p>Nenhum pregoeiro cadastrado</p>
                <p className="text-sm">Clique em "Adicionar Pregoeiro" para cadastrar</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notificacoes" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Notificacoes por E-mail</CardTitle>
              <CardDescription>Configure quais eventos geram notificacoes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Nova licitacao publicada</p>
                  <p className="text-sm text-muted-foreground">Receber e-mail quando uma licitacao for publicada</p>
                </div>
                <Switch 
                  checked={notificacoes.emailNovaLicitacao}
                  onCheckedChange={(v) => setNotificacoes({...notificacoes, emailNovaLicitacao: v})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Nova proposta recebida</p>
                  <p className="text-sm text-muted-foreground">Receber e-mail quando um fornecedor enviar proposta</p>
                </div>
                <Switch 
                  checked={notificacoes.emailProposta}
                  onCheckedChange={(v) => setNotificacoes({...notificacoes, emailProposta: v})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Inicio de disputa</p>
                  <p className="text-sm text-muted-foreground">Receber e-mail quando uma sessao de disputa iniciar</p>
                </div>
                <Switch 
                  checked={notificacoes.emailDisputa}
                  onCheckedChange={(v) => setNotificacoes({...notificacoes, emailDisputa: v})}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Resultado da licitacao</p>
                  <p className="text-sm text-muted-foreground">Receber e-mail com o resultado final</p>
                </div>
                <Switch 
                  checked={notificacoes.emailResultado}
                  onCheckedChange={(v) => setNotificacoes({...notificacoes, emailResultado: v})}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pncp" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Configuração PNCP</CardTitle>
                  <CardDescription>Configure a conexão com o Portal Nacional de Contratações Públicas</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  {pncpStatus.configurado ? (
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">Conectado</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-red-600">
                      <XCircle className="h-5 w-5" />
                      <span className="text-sm font-medium">Não Configurado</span>
                    </div>
                  )}
                  <Button 
                    variant="outline" 
                    onClick={testarConexaoPNCP}
                    disabled={testingConnection || !pncpStatus.configurado}
                  >
                    {testingConnection ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Globe className="h-4 w-4 mr-2" />
                    )}
                    Testar Conexão
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Status da Configuração</Label>
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm">Ambiente:</span>
                        <span className="text-sm font-medium">{pncpStatus.ambiente || 'Não identificado'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">Login Configurado:</span>
                        <span className="text-sm font-medium">{pncpStatus.loginConfigurado ? 'Sim' : 'Não'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm">CNPJ do Órgão:</span>
                        <span className="text-sm font-medium">{pncpStatus.cnpjOrgao || 'Não configurado'}</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label>Ambientes PNCP</Label>
                  <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                    <div className="flex items-center gap-2 text-blue-600">
                      <Globe className="h-4 w-4" />
                      <span className="text-sm font-medium">Treinamento</span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      https://treina.pncp.gov.br/api/pncp/v1
                    </p>
                    <div className="flex items-center gap-2 text-green-600">
                      <Globe className="h-4 w-4" />
                      <span className="text-sm font-medium">Produção</span>
                    </div>
                    <p className="text-xs text-muted-foreground ml-6">
                      https://pncp.gov.br/api/pncp/v1
                    </p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600" />
                    <span className="text-sm text-amber-600">
                      Configure manualmente as credenciais PNCP (apenas para desenvolvimento)
                    </span>
                  </div>
                  <Button 
                    onClick={salvarConfigPNCP}
                    disabled={loadingPncp}
                  >
                    {loadingPncp ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar Configurações
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="space-y-2">
                    <Label>URL da API PNCP</Label>
                    <Input
                      value={pncpConfig.apiUrl}
                      onChange={(e) => setPncpConfig({...pncpConfig, apiUrl: e.target.value})}
                      placeholder="https://treina.pncp.gov.br/api/pncp/v1"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Login PNCP</Label>
                    <Input
                      value={pncpConfig.login}
                      onChange={(e) => setPncpConfig({...pncpConfig, login: e.target.value})}
                      placeholder="Login de acesso ao PNCP"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Senha PNCP</Label>
                    <Input
                      type="password"
                      value={pncpConfig.senha}
                      onChange={(e) => setPncpConfig({...pncpConfig, senha: e.target.value})}
                      placeholder="Senha de acesso ao PNCP"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>CNPJ do Órgão</Label>
                    <Input
                      value={pncpConfig.cnpjOrgao}
                      onChange={(e) => setPncpConfig({...pncpConfig, cnpjOrgao: e.target.value})}
                      placeholder="CNPJ do órgão no PNCP"
                    />
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-lg">
                  <p className="text-sm font-medium mb-2">Variáveis de Ambiente (produção):</p>
                  <ul className="text-xs text-muted-foreground space-y-1 font-mono">
                    <li>• PNCP_API_URL - URL da API do PNCP</li>
                    <li>• PNCP_LOGIN - Login de acesso ao PNCP</li>
                    <li>• PNCP_SENHA - Senha de acesso ao PNCP</li>
                    <li>• PNCP_CNPJ_ORGAO - CNPJ do órgão no PNCP</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="transparencia" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Portal Fator Transparência</CardTitle>
              <CardDescription>
                ID do órgão usado para buscar empenhos ao criar OS/OF. Encontre em
                transparencia.fatorsistemas.com.br/dados/despesa.php?id=<strong>cmlem</strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>ID do Órgão (FATOR_TRANSPARENCIA_ID)</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Ex: cmlem"
                    value={fatorId}
                    onChange={e => setFatorId(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button onClick={salvarFatorId} disabled={loadingFator}>
                    {loadingFator ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                    Salvar
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  Para o município de Luís Eduardo Magalhães o ID é <code className="bg-gray-100 px-1 rounded">cmlem</code>.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="seguranca" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Alterar Senha</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Senha Atual</Label>
                <Input type="password" />
              </div>
              <div className="space-y-2">
                <Label>Nova Senha</Label>
                <Input type="password" />
              </div>
              <div className="space-y-2">
                <Label>Confirmar Nova Senha</Label>
                <Input type="password" />
              </div>
              <Button>Alterar Senha</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Autenticacao em Dois Fatores</CardTitle>
              <CardDescription>Adicione uma camada extra de seguranca</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">2FA via Aplicativo</p>
                  <p className="text-sm text-muted-foreground">Use Google Authenticator ou similar</p>
                </div>
                <Button variant="outline">Configurar</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
