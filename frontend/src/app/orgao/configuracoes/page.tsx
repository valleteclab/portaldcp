"use client"

import { useState, useEffect } from "react"
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
  Loader2
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Switch } from "@/components/ui/switch"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function ConfiguracoesPage() {
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
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Buscar dados do órgão logado do localStorage
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
      })
    }
    setLoading(false)
  }, [])

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

  // Carregar status atual da configuração PNCP
  const carregarStatusPNCP = async () => {
    try {
      const token = localStorage.getItem('orgao_token')
      const response = await fetch(`${API_URL}/api/pncp/config/status`, {
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
      const response = await fetch(`${API_URL}/api/pncp/config/testar-conexao`, {
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
      const response = await fetch(`${API_URL}/api/pncp/config/atualizar`, {
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
  }, [])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Configuracoes</h1>
        <p className="text-muted-foreground">Gerencie as configuracoes do orgao</p>
      </div>

      <Tabs defaultValue="orgao">
        <TabsList>
          <TabsTrigger value="orgao">
            <Building2 className="h-4 w-4 mr-2" /> Dados do Orgao
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
              </div>
              <div className="flex justify-end">
                <Button>
                  <Save className="mr-2 h-4 w-4" /> Salvar Alteracoes
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
                <div className="w-24 h-24 bg-slate-100 rounded-lg flex items-center justify-center">
                  <Building2 className="h-12 w-12 text-slate-400" />
                </div>
                <div>
                  <Button variant="outline">
                    <Upload className="mr-2 h-4 w-4" /> Enviar Logo
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">PNG ou JPG, max 2MB</p>
                </div>
              </div>
            </CardContent>
          </Card>
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
