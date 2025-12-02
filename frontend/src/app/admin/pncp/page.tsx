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
  Check
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

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    setErro(null)
    try {
      // Carregar status da configuração
      const configRes = await fetch(`${API_URL}/api/pncp/config/status`)
      if (configRes.ok) {
        const config = await configRes.json()
        setConfigStatus(config)
      }

      // Carregar usuário e entes autorizados
      const usuarioRes = await fetch(`${API_URL}/api/pncp/usuario`)
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
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => abrirDetalhesOrgao(ente)}
                        >
                          <ExternalLink className="w-4 h-4 mr-1" />
                          Detalhes
                        </Button>
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

              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setShowDetalhesOrgao(false)}>
                  Fechar
                </Button>
              </div>
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
    </div>
  )
}
