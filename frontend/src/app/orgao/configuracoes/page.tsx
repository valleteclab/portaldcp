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
  Users
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
