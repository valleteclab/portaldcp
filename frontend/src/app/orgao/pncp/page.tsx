'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  RefreshCw, 
  Send, 
  CheckCircle, 
  XCircle, 
  Clock, 
  AlertTriangle,
  FileText,
  Upload,
  ExternalLink,
  Settings,
  Wifi,
  WifiOff,
  Calendar,
  Building,
  Loader2
} from 'lucide-react'

interface SyncRecord {
  id: string
  tipo: string
  licitacao_id: string
  entidade_id?: string
  numero_controle_pncp: string
  status: string
  erro_mensagem: string
  tentativas: number
  created_at: string
  updated_at: string
  payload_enviado?: any
  resposta_pncp?: any
}

interface Licitacao {
  id: string
  numero_processo: string
  objeto: string
  fase: string
  numero_controle_pncp?: string
}

interface ConfigPNCP {
  configurado: boolean
  ambiente: string
  cnpjOrgao: string | null
  loginConfigurado: boolean
}

interface PCA {
  id: string
  numero_pca: string
  ano_exercicio: number
  status: string
  enviado_pncp: boolean
  quantidade_itens: number
  valor_total_estimado: number
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export default function PncpPage() {
  const [pendentes, setPendentes] = useState<SyncRecord[]>([])
  const [erros, setErros] = useState<SyncRecord[]>([])
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [pcas, setPcas] = useState<PCA[]>([])
  const [config, setConfig] = useState<ConfigPNCP | null>(null)
  const [loading, setLoading] = useState(true)
  const [enviando, setEnviando] = useState<string | null>(null)
  const [testandoConexao, setTestandoConexao] = useState(false)
  const [statusConexao, setStatusConexao] = useState<{ sucesso: boolean; mensagem: string } | null>(null)

  useEffect(() => {
    carregarDados()
  }, [])

  const carregarDados = async () => {
    setLoading(true)
    try {
      const orgaoData = localStorage.getItem('orgao')
      const orgao = orgaoData ? JSON.parse(orgaoData) : null

      const [pendentesRes, errosRes, licitacoesRes, configRes, pcasRes] = await Promise.all([
        fetch(`${API_URL}/api/pncp/pendentes`),
        fetch(`${API_URL}/api/pncp/erros`),
        fetch(`${API_URL}/api/licitacoes`),
        fetch(`${API_URL}/api/pncp/config/status`),
        orgao ? fetch(`${API_URL}/api/pca?orgaoId=${orgao.id}`) : Promise.resolve(null)
      ])

      if (pendentesRes.ok) setPendentes(await pendentesRes.json())
      if (errosRes.ok) setErros(await errosRes.json())
      if (licitacoesRes.ok) setLicitacoes(await licitacoesRes.json())
      if (configRes.ok) setConfig(await configRes.json())
      if (pcasRes && pcasRes.ok) setPcas(await pcasRes.json())
    } catch (error) {
      console.error('Erro ao carregar dados:', error)
    } finally {
      setLoading(false)
    }
  }

  const testarConexao = async () => {
    setTestandoConexao(true)
    setStatusConexao(null)
    try {
      const response = await fetch(`${API_URL}/api/pncp/config/testar-conexao`, {
        method: 'POST'
      })
      const data = await response.json()
      setStatusConexao(data)
    } catch (error) {
      setStatusConexao({ sucesso: false, mensagem: 'Erro ao testar conexão' })
    } finally {
      setTestandoConexao(false)
    }
  }

  const enviarPCAParaPNCP = async (pca: PCA) => {
    setEnviando(pca.id)
    try {
      // Buscar dados completos do PCA
      const pcaResponse = await fetch(`${API_URL}/api/pca/${pca.id}`)
      if (!pcaResponse.ok) {
        throw new Error('Erro ao buscar dados do PCA')
      }
      const pcaCompleto = await pcaResponse.json()

      // Enviar para o PNCP
      const response = await fetch(`${API_URL}/api/pncp/pca/${pca.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pcaCompleto)
      })

      const data = await response.json()

      if (response.ok && data.sucesso) {
        alert(`PCA enviado ao PNCP com sucesso!\nNúmero de Controle: ${data.numeroControlePNCP}`)
        carregarDados()
      } else {
        alert(data.message || 'Erro ao enviar PCA para o PNCP')
      }
    } catch (error: any) {
      console.error('Erro ao enviar PCA:', error)
      alert(error.message || 'Erro ao enviar PCA para o PNCP')
    } finally {
      setEnviando(null)
    }
  }

  const enviarParaPNCP = async (licitacaoId: string) => {
    setEnviando(licitacaoId)
    try {
      const token = localStorage.getItem('orgao_token')
      const response = await fetch(`${API_URL}/api/pncp/compras/${licitacaoId}/completo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })

      const data = await response.json()

      if (response.ok && data.sucesso) {
        alert('Licitação enviada ao PNCP com sucesso!')
        carregarDados()
      } else {
        alert(data.message || 'Erro ao enviar para o PNCP')
      }
    } catch (error) {
      console.error('Erro ao enviar:', error)
      alert('Erro ao enviar para o PNCP')
    } finally {
      setEnviando(null)
    }
  }

  const reenviar = async (syncId: string) => {
    try {
      const token = localStorage.getItem('orgao_token')
      const response = await fetch(`${API_URL}/api/pncp/reenviar/${syncId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.ok) {
        alert('Reenvio iniciado!')
        carregarDados()
      } else {
        alert('Erro ao reenviar')
      }
    } catch (error) {
      alert('Erro ao reenviar')
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline', icon: React.ReactNode }> = {
      'PENDENTE': { variant: 'secondary', icon: <Clock className="w-3 h-3 mr-1" /> },
      'ENVIANDO': { variant: 'outline', icon: <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> },
      'ENVIADO': { variant: 'default', icon: <CheckCircle className="w-3 h-3 mr-1" /> },
      'ERRO': { variant: 'destructive', icon: <XCircle className="w-3 h-3 mr-1" /> },
      'ATUALIZADO': { variant: 'default', icon: <CheckCircle className="w-3 h-3 mr-1" /> }
    }

    const config = statusMap[status] || { variant: 'secondary' as const, icon: null }

    return (
      <Badge variant={config.variant} className="flex items-center">
        {config.icon}
        {status}
      </Badge>
    )
  }

  const licitacoesNaoEnviadas = licitacoes.filter(l => 
    !l.numero_controle_pncp && 
    ['PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS', 'EM_DISPUTA', 'JULGAMENTO', 'HABILITACAO', 'RECURSO', 'ADJUDICACAO', 'HOMOLOGACAO', 'CONCLUIDO'].includes(l.fase)
  )

  const licitacoesEnviadas = licitacoes.filter(l => l.numero_controle_pncp)

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Integração PNCP</h1>
          <p className="text-muted-foreground">
            Portal Nacional de Contratações Públicas
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={carregarDados} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
          <Button variant="outline" asChild>
            <a href="https://pncp.gov.br" target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-4 h-4 mr-2" />
              Portal PNCP
            </a>
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aguardando Envio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{licitacoesNaoEnviadas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Enviadas ao PNCP
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{licitacoesEnviadas.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pendentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendentes.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Com Erro
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{erros.length}</div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="pca" className="space-y-4">
        <TabsList>
          <TabsTrigger value="pca">
            <Calendar className="w-4 h-4 mr-2" />
            PCA
          </TabsTrigger>
          <TabsTrigger value="licitacoes">
            <Send className="w-4 h-4 mr-2" />
            Licitações
          </TabsTrigger>
          <TabsTrigger value="enviadas">
            <CheckCircle className="w-4 h-4 mr-2" />
            Enviadas ({licitacoesEnviadas.length})
          </TabsTrigger>
          <TabsTrigger value="erros">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Erros ({erros.length})
          </TabsTrigger>
          <TabsTrigger value="config">
            <Settings className="w-4 h-4 mr-2" />
            Configuração
          </TabsTrigger>
        </TabsList>

        {/* Tab: PCA */}
        <TabsContent value="pca">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="w-5 h-5" />
                Plano de Contratações Anual (PCA)
              </CardTitle>
              <CardDescription>
                Envie o PCA para o Portal Nacional de Contratações Públicas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {pcas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="w-12 h-12 mx-auto mb-4" />
                  <p>Nenhum PCA encontrado.</p>
                  <p className="text-sm">Crie um PCA na página de Planejamento.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {pcas.map((pca) => (
                    <div 
                      key={pca.id} 
                      className={`flex items-center justify-between p-4 border rounded-lg ${
                        pca.enviado_pncp ? 'bg-green-50 border-green-200' : ''
                      }`}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">PCA {pca.ano_exercicio}</span>
                          <Badge variant={pca.status === 'PUBLICADO' ? 'default' : 'secondary'}>
                            {pca.status}
                          </Badge>
                          {pca.enviado_pncp && (
                            <Badge variant="outline" className="bg-green-100 text-green-700 border-green-300">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Enviado ao PNCP
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {pca.quantidade_itens} itens • {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(pca.valor_total_estimado)}
                        </p>
                      </div>
                      {!pca.enviado_pncp && pca.status === 'PUBLICADO' ? (
                        <Button 
                          onClick={() => enviarPCAParaPNCP(pca)}
                          disabled={enviando === pca.id}
                        >
                          {enviando === pca.id ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4 mr-2" />
                              Enviar ao PNCP
                            </>
                          )}
                        </Button>
                      ) : pca.enviado_pncp ? (
                        <Button variant="outline" asChild>
                          <a 
                            href={`https://pncp.gov.br/app/pca`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="w-4 h-4 mr-2" />
                            Ver no PNCP
                          </a>
                        </Button>
                      ) : (
                        <Badge variant="secondary">
                          Publique o PCA para enviar
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Licitações */}
        <TabsContent value="licitacoes">
          <Card>
            <CardHeader>
              <CardTitle>Licitações Aguardando Envio</CardTitle>
              <CardDescription>
                Licitações publicadas que ainda não foram enviadas ao PNCP
              </CardDescription>
            </CardHeader>
            <CardContent>
              {licitacoesNaoEnviadas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  <p>Todas as licitações publicadas já foram enviadas ao PNCP!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {licitacoesNaoEnviadas.map((licitacao) => (
                    <div 
                      key={licitacao.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{licitacao.numero_processo}</span>
                          <Badge variant="outline">{licitacao.fase}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
                          {licitacao.objeto}
                        </p>
                      </div>
                      <Button 
                        onClick={() => enviarParaPNCP(licitacao.id)}
                        disabled={enviando === licitacao.id}
                      >
                        {enviando === licitacao.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Enviando...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Enviar ao PNCP
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Enviadas */}
        <TabsContent value="enviadas">
          <Card>
            <CardHeader>
              <CardTitle>Licitações Enviadas ao PNCP</CardTitle>
              <CardDescription>
                Licitações já publicadas no Portal Nacional de Contratações Públicas
              </CardDescription>
            </CardHeader>
            <CardContent>
              {licitacoesEnviadas.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Upload className="w-12 h-12 mx-auto mb-4" />
                  <p>Nenhuma licitação foi enviada ao PNCP ainda.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {licitacoesEnviadas.map((licitacao) => (
                    <div 
                      key={licitacao.id} 
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-500" />
                          <span className="font-medium">{licitacao.numero_processo}</span>
                          <Badge variant="default">Enviada</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Controle PNCP: <code className="bg-muted px-1 rounded">{licitacao.numero_controle_pncp}</code>
                        </p>
                      </div>
                      <Button variant="outline" asChild>
                        <a 
                          href={`https://pncp.gov.br/app/editais/${licitacao.numero_controle_pncp}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                        >
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Ver no PNCP
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Erros */}
        <TabsContent value="erros">
          <Card>
            <CardHeader>
              <CardTitle>Erros de Sincronização</CardTitle>
              <CardDescription>
                Registros que falharam ao enviar para o PNCP
              </CardDescription>
            </CardHeader>
            <CardContent>
              {erros.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-4 text-green-500" />
                  <p>Nenhum erro de sincronização!</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {erros.map((erro) => (
                    <div 
                      key={erro.id} 
                      className="p-4 border border-red-200 rounded-lg bg-red-50"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <XCircle className="w-4 h-4 text-red-500" />
                          <span className="font-medium">{erro.tipo}</span>
                          <Badge variant="destructive">Tentativas: {erro.tentativas}</Badge>
                        </div>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => reenviar(erro.id)}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Reenviar
                        </Button>
                      </div>
                      <p className="text-sm text-red-700">
                        {erro.erro_mensagem}
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        Última tentativa: {new Date(erro.updated_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tab: Configuração */}
        <TabsContent value="config">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Status da Configuração */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  Status da Configuração
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {config ? (
                  <>
                    <div className={`p-4 rounded-lg ${config.configurado ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        {config.configurado ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <AlertTriangle className="w-5 h-5 text-yellow-600" />
                        )}
                        <span className="font-medium">
                          {config.configurado ? 'Configuração Completa' : 'Configuração Pendente'}
                        </span>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm font-medium">Ambiente</span>
                        <Badge variant={config.ambiente === 'PRODUÇÃO' ? 'default' : 'secondary'}>
                          {config.ambiente}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm font-medium">CNPJ do Órgão</span>
                        <span className="text-sm font-mono">
                          {config.cnpjOrgao || <span className="text-red-500">Não configurado</span>}
                        </span>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <span className="text-sm font-medium">Login</span>
                        {config.loginConfigurado ? (
                          <Badge variant="outline" className="bg-green-100 text-green-700">
                            <CheckCircle className="w-3 h-3 mr-1" />
                            Configurado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-red-100 text-red-700">
                            <XCircle className="w-3 h-3 mr-1" />
                            Não configurado
                          </Badge>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-4 text-muted-foreground">
                    <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                    Carregando configuração...
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Teste de Conexão */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Wifi className="w-5 h-5" />
                  Teste de Conexão
                </CardTitle>
                <CardDescription>
                  Verifique se a conexão com o PNCP está funcionando
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button 
                  onClick={testarConexao} 
                  disabled={testandoConexao}
                  className="w-full"
                >
                  {testandoConexao ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Testando conexão...
                    </>
                  ) : (
                    <>
                      <Wifi className="w-4 h-4 mr-2" />
                      Testar Conexão com PNCP
                    </>
                  )}
                </Button>

                {statusConexao && (
                  <div className={`p-4 rounded-lg ${
                    statusConexao.sucesso 
                      ? 'bg-green-50 border border-green-200' 
                      : 'bg-red-50 border border-red-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      {statusConexao.sucesso ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <span className={`font-medium ${
                        statusConexao.sucesso ? 'text-green-700' : 'text-red-700'
                      }`}>
                        {statusConexao.mensagem}
                      </span>
                    </div>
                  </div>
                )}

                <div className="text-xs text-muted-foreground">
                  O teste verifica se as credenciais estão corretas e se é possível autenticar no PNCP.
                </div>
              </CardContent>
            </Card>

            {/* Documentação */}
            <Card>
              <CardHeader>
                <CardTitle>Documentação</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://pncp.gov.br/api/pncp/swagger-ui/index.html" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Swagger API
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://www.gov.br/pncp/pt-br/pncp/integre-se-ao-pncp" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Manual de Integração
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild>
                    <a href="https://treina.pncp.gov.br" target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Ambiente de Treinamento
                    </a>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Dados Enviados */}
            <Card>
              <CardHeader>
                <CardTitle>Dados Enviados ao PNCP</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Plano de Contratações Anual (PCA)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Dados da Contratação/Compra
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Itens da Licitação
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Documentos (Edital, TR, ETP)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Resultado por Item
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Ata de Registro de Preços
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    Contratos e Aditivos
                  </li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
