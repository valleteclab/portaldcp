'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { 
  Activity, AlertTriangle, Clock, Eye, Search, 
  StopCircle, RefreshCw, Shield, Users, Gavel,
  ChevronRight, ExternalLink, Settings, EyeOff, MessageSquare,
  ToggleLeft, ToggleRight
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { API_URL, authFetch } from '@/lib/api'
import Link from 'next/link'

interface SessaoAtiva {
  id: string
  licitacao_id: string
  licitacao_numero: string
  licitacao_objeto: string
  orgao_nome: string
  pregoeiro_nome: string
  status: string
  etapa: string
  data_inicio: string
  itens_aguardando: number
  itens_em_disputa: number
  itens_encerrados: number
  total_lances: number
  fornecedores_conectados: number
}

interface ItemEmDisputa {
  id: string
  numero: number
  descricao: string
  tempo_restante: number
  em_prorrogacao: boolean
  ultimo_lance_em: string
  total_lances: number
  melhor_lance_valor: number
  melhor_lance_fornecedor: string
}

interface ConfiguracaoSessao {
  anonimizacao_ativa: boolean
  chat_desabilitado: boolean
  tempo_inatividade_minutos: number
  tempo_prorrogacao_minutos: number
  modo_aberto: boolean
  disputa_por_item: boolean
}

export default function MonitoramentoPage() {
  const [sessoesAtivas, setSessoesAtivas] = useState<SessaoAtiva[]>([])
  const [sessaoSelecionada, setSessaoSelecionada] = useState<SessaoAtiva | null>(null)
  const [itensDisputa, setItensDisputa] = useState<ItemEmDisputa[]>([])
  const [carregando, setCarregando] = useState(true)
  const [busca, setBusca] = useState('')
  
  // Modal encerrar item
  const [modalEncerrar, setModalEncerrar] = useState(false)
  const [itemParaEncerrar, setItemParaEncerrar] = useState<ItemEmDisputa | null>(null)
  const [justificativaEncerrar, setJustificativaEncerrar] = useState('')
  const [encerrando, setEncerrando] = useState(false)

  // Configurações da sessão
  const [configSessao, setConfigSessao] = useState<ConfiguracaoSessao | null>(null)
  const [modalConfig, setModalConfig] = useState(false)
  const [justificativaConfig, setJustificativaConfig] = useState('')
  const [salvandoConfig, setSalvandoConfig] = useState(false)

  // Buscar sessões ativas
  const buscarSessoesAtivas = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/admin/monitoramento/sessoes-ativas`)
      if (res.ok) {
        const data = await res.json()
        // Tratar resposta que pode vir como array ou objeto com value
        const sessoes = Array.isArray(data) ? data : (data.value || data)
        setSessoesAtivas(Array.isArray(sessoes) ? sessoes : [])
      }
    } catch (error) {
      console.error('Erro ao buscar sessões:', error)
    } finally {
      setCarregando(false)
    }
  }, [])

  // Buscar itens em disputa de uma sessão
  const buscarItensDisputa = useCallback(async (sessaoId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/admin/monitoramento/sessao/${sessaoId}/itens`)
      if (res.ok) {
        const data = await res.json()
        setItensDisputa(data)
      }
    } catch (error) {
      console.error('Erro ao buscar itens:', error)
    }
  }, [])

  // Buscar configurações da sessão
  const buscarConfigSessao = useCallback(async (sessaoId: string) => {
    try {
      const res = await authFetch(`${API_URL}/api/admin/monitoramento/sessao/${sessaoId}/config`)
      if (res.ok) {
        const data = await res.json()
        setConfigSessao(data.configuracoes)
      }
    } catch (error) {
      console.error('Erro ao buscar configurações:', error)
    }
  }, [])

  // Alterar anonimização
  const toggleAnonimizacao = async (ativa: boolean) => {
    if (!sessaoSelecionada || !justificativaConfig.trim()) {
      alert('Justificativa é obrigatória para alterar anonimização')
      return
    }

    setSalvandoConfig(true)
    try {
      const res = await authFetch(`${API_URL}/api/admin/monitoramento/sessao/${sessaoSelecionada.id}/anonimizacao`, {
        method: 'PUT',
        body: JSON.stringify({
          ativa,
          justificativa: justificativaConfig,
          usuarioId: 'ADMIN',
        }),
      })

      if (res.ok) {
        setConfigSessao(prev => prev ? { ...prev, anonimizacao_ativa: ativa } : null)
        setJustificativaConfig('')
        alert(`Anonimização ${ativa ? 'ativada' : 'desativada'} com sucesso`)
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      console.error('Erro ao alterar anonimização:', error)
      alert('Erro ao alterar anonimização')
    } finally {
      setSalvandoConfig(false)
    }
  }

  // Alterar chat
  const toggleChat = async (desabilitado: boolean) => {
    if (!sessaoSelecionada) return

    setSalvandoConfig(true)
    try {
      const res = await authFetch(`${API_URL}/api/admin/monitoramento/sessao/${sessaoSelecionada.id}/chat`, {
        method: 'PUT',
        body: JSON.stringify({ desabilitado }),
      })

      if (res.ok) {
        setConfigSessao(prev => prev ? { ...prev, chat_desabilitado: desabilitado } : null)
        alert(`Chat ${desabilitado ? 'desabilitado' : 'habilitado'} com sucesso`)
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      console.error('Erro ao alterar chat:', error)
      alert('Erro ao alterar chat')
    } finally {
      setSalvandoConfig(false)
    }
  }

  useEffect(() => {
    buscarSessoesAtivas()
    const interval = setInterval(buscarSessoesAtivas, 5000) // Atualiza a cada 5s
    return () => clearInterval(interval)
  }, [buscarSessoesAtivas])

  useEffect(() => {
    if (sessaoSelecionada) {
      buscarItensDisputa(sessaoSelecionada.id)
      buscarConfigSessao(sessaoSelecionada.id)
      const interval = setInterval(() => buscarItensDisputa(sessaoSelecionada.id), 1000) // Atualiza a cada 1s
      return () => clearInterval(interval)
    }
  }, [sessaoSelecionada, buscarItensDisputa, buscarConfigSessao])

  // Encerrar item forçadamente (apenas superadmin)
  const encerrarItemForcado = async () => {
    if (!sessaoSelecionada || !itemParaEncerrar || !justificativaEncerrar.trim()) return

    setEncerrando(true)
    try {
      const res = await authFetch(`${API_URL}/api/admin/monitoramento/encerrar-item-forcado`, {
        method: 'POST',
        body: JSON.stringify({
          sessaoId: sessaoSelecionada.id,
          itemId: itemParaEncerrar.id,
          justificativa: justificativaEncerrar,
        }),
      })

      if (res.ok) {
        setModalEncerrar(false)
        setItemParaEncerrar(null)
        setJustificativaEncerrar('')
        buscarItensDisputa(sessaoSelecionada.id)
      } else {
        const error = await res.json()
        alert(`Erro: ${error.message}`)
      }
    } catch (error) {
      console.error('Erro ao encerrar item:', error)
      alert('Erro ao encerrar item')
    } finally {
      setEncerrando(false)
    }
  }

  const formatarTempo = (segundos: number) => {
    const min = Math.floor(segundos / 60)
    const seg = segundos % 60
    return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`
  }

  const formatarMoeda = (valor: number) => {
    return valor?.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) || 'R$ 0,00'
  }

  const formatarData = (data: string) => {
    return new Date(data).toLocaleString('pt-BR')
  }

  const sessoesFiltradas = sessoesAtivas.filter(s => 
    s.licitacao_numero?.toLowerCase().includes(busca.toLowerCase()) ||
    s.orgao_nome?.toLowerCase().includes(busca.toLowerCase()) ||
    s.pregoeiro_nome?.toLowerCase().includes(busca.toLowerCase())
  )

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando monitoramento...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-red-900 text-white p-4">
        <div className="container mx-auto">
          <div className="flex items-center gap-3">
            <Shield className="h-8 w-8" />
            <div>
              <h1 className="text-2xl font-bold">Monitoramento de Disputas</h1>
              <p className="text-red-200 text-sm">Painel de Auditoria - Acesso Restrito</p>
            </div>
          </div>
        </div>
      </div>

      {/* Alerta de acesso restrito */}
      <div className="container mx-auto p-4">
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Área Restrita</AlertTitle>
          <AlertDescription>
            Este painel é exclusivo para superadministradores e suporte técnico. 
            Todas as ações são registradas para auditoria. O encerramento forçado de itens 
            só deve ser utilizado em casos de erro do sistema, conforme Lei 14.133/2021.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Lista de Sessões Ativas */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-green-600" />
                  Sessões Ativas ({sessoesAtivas.length})
                </CardTitle>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por número, órgão..."
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {sessoesFiltradas.map(sessao => (
                      <div
                        key={sessao.id}
                        onClick={() => setSessaoSelecionada(sessao)}
                        className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                          sessaoSelecionada?.id === sessao.id 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{sessao.licitacao_numero}</span>
                          <Badge variant={sessao.itens_em_disputa > 0 ? 'default' : 'secondary'}>
                            {sessao.itens_em_disputa} em disputa
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600 truncate">{sessao.orgao_nome}</p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                          <Users className="h-3 w-3" />
                          <span>{sessao.fornecedores_conectados} conectados</span>
                          <Gavel className="h-3 w-3 ml-2" />
                          <span>{sessao.pregoeiro_nome}</span>
                        </div>
                      </div>
                    ))}
                    {sessoesFiltradas.length === 0 && (
                      <p className="text-center text-gray-500 py-8">
                        Nenhuma sessão ativa no momento
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Detalhes da Sessão Selecionada */}
          <div className="lg:col-span-2">
            {sessaoSelecionada ? (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{sessaoSelecionada.licitacao_numero}</CardTitle>
                      <CardDescription className="mt-1">
                        {sessaoSelecionada.licitacao_objeto}
                      </CardDescription>
                    </div>
                    <Link 
                      href={`/orgao/disputa?sessao=${sessaoSelecionada.id}`}
                      target="_blank"
                    >
                      <Button variant="outline" size="sm">
                        <ExternalLink className="h-4 w-4 mr-2" />
                        Abrir Sala
                      </Button>
                    </Link>
                  </div>
                  <div className="flex gap-4 mt-2 text-sm">
                    <span><strong>Órgão:</strong> {sessaoSelecionada.orgao_nome}</span>
                    <span><strong>Pregoeiro:</strong> {sessaoSelecionada.pregoeiro_nome}</span>
                    <span><strong>Início:</strong> {formatarData(sessaoSelecionada.data_inicio)}</span>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Estatísticas */}
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="bg-yellow-50 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-yellow-600">{sessaoSelecionada.itens_aguardando}</p>
                      <p className="text-xs text-yellow-700">Aguardando</p>
                    </div>
                    <div className="bg-blue-50 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-blue-600">{sessaoSelecionada.itens_em_disputa}</p>
                      <p className="text-xs text-blue-700">Em Disputa</p>
                    </div>
                    <div className="bg-green-50 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-green-600">{sessaoSelecionada.itens_encerrados}</p>
                      <p className="text-xs text-green-700">Encerrados</p>
                    </div>
                    <div className="bg-purple-50 p-3 rounded-lg text-center">
                      <p className="text-2xl font-bold text-purple-600">{sessaoSelecionada.total_lances}</p>
                      <p className="text-xs text-purple-700">Total Lances</p>
                    </div>
                  </div>

                  {/* Painel de Controle de Configurações */}
                  {configSessao && (
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border">
                      <h3 className="font-semibold mb-3 flex items-center gap-2">
                        <Settings className="h-4 w-4" />
                        Painel de Controle
                      </h3>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Anonimização */}
                        <div className="p-3 bg-white rounded-lg border">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <EyeOff className="h-4 w-4 text-blue-600" />
                              <Label className="font-medium">Anonimização</Label>
                            </div>
                            <Badge variant={configSessao.anonimizacao_ativa ? 'default' : 'secondary'}>
                              {configSessao.anonimizacao_ativa ? 'Ativa' : 'Inativa'}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 mb-2">
                            Oculta identidade dos fornecedores durante a disputa (Lei 14.133/2021)
                          </p>
                          <Button
                            size="sm"
                            variant={configSessao.anonimizacao_ativa ? 'destructive' : 'default'}
                            onClick={() => setModalConfig(true)}
                            disabled={salvandoConfig}
                          >
                            {configSessao.anonimizacao_ativa ? (
                              <>
                                <ToggleRight className="h-4 w-4 mr-1" />
                                Desativar
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="h-4 w-4 mr-1" />
                                Ativar
                              </>
                            )}
                          </Button>
                        </div>

                        {/* Chat */}
                        <div className="p-3 bg-white rounded-lg border">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4 text-green-600" />
                              <Label className="font-medium">Chat da Sessão</Label>
                            </div>
                            <Badge variant={!configSessao.chat_desabilitado ? 'default' : 'secondary'}>
                              {!configSessao.chat_desabilitado ? 'Habilitado' : 'Desabilitado'}
                            </Badge>
                          </div>
                          <p className="text-xs text-gray-500 mb-2">
                            Comunicação entre pregoeiro e fornecedores
                          </p>
                          <Button
                            size="sm"
                            variant={!configSessao.chat_desabilitado ? 'destructive' : 'default'}
                            onClick={() => toggleChat(!configSessao.chat_desabilitado)}
                            disabled={salvandoConfig}
                          >
                            {!configSessao.chat_desabilitado ? (
                              <>
                                <ToggleRight className="h-4 w-4 mr-1" />
                                Desabilitar
                              </>
                            ) : (
                              <>
                                <ToggleLeft className="h-4 w-4 mr-1" />
                                Habilitar
                              </>
                            )}
                          </Button>
                        </div>
                      </div>

                      {/* Info de configurações */}
                      <div className="mt-3 flex gap-4 text-xs text-gray-500">
                        <span>Tempo inicial: <strong>{configSessao.tempo_inatividade_minutos} min</strong></span>
                        <span>Prorrogação: <strong>{configSessao.tempo_prorrogacao_minutos} min</strong></span>
                        <span>Modo: <strong>{configSessao.modo_aberto ? 'Aberto' : 'Fechado'}</strong></span>
                        <span>Disputa: <strong>{configSessao.disputa_por_item ? 'Por Item' : 'Por Lote'}</strong></span>
                      </div>
                    </div>
                  )}

                  {/* Itens em Disputa */}
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Itens em Disputa
                  </h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Item</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="w-24">Tempo</TableHead>
                        <TableHead className="w-32">Melhor Lance</TableHead>
                        <TableHead className="w-20">Lances</TableHead>
                        <TableHead className="w-32">Ação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itensDisputa.map(item => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium">{item.numero}</TableCell>
                          <TableCell className="max-w-xs truncate">{item.descricao}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <Badge 
                                variant={item.tempo_restante < 60 ? 'destructive' : 'outline'}
                                className={item.tempo_restante <= 30 ? 'animate-pulse' : ''}
                              >
                                {formatarTempo(item.tempo_restante)}
                              </Badge>
                              {item.em_prorrogacao && (
                                <Badge variant="outline" className="border-orange-500 text-orange-600 text-xs animate-pulse">
                                  Prorrogação
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium">{formatarMoeda(item.melhor_lance_valor)}</p>
                              <p className="text-xs text-gray-500">{item.melhor_lance_fornecedor}</p>
                            </div>
                          </TableCell>
                          <TableCell>{item.total_lances}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => {
                                setItemParaEncerrar(item)
                                setModalEncerrar(true)
                              }}
                            >
                              <StopCircle className="h-4 w-4 mr-1" />
                              Encerrar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {itensDisputa.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                            Nenhum item em disputa no momento
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="flex items-center justify-center h-[600px]">
                  <div className="text-center text-gray-500">
                    <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Selecione uma sessão para monitorar</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Modal Encerrar Item Forçado */}
      <Dialog open={modalEncerrar} onOpenChange={setModalEncerrar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Encerramento Forçado de Item
            </DialogTitle>
            <DialogDescription>
              Esta ação só deve ser utilizada em casos de erro do sistema.
            </DialogDescription>
          </DialogHeader>
          
          {itemParaEncerrar && (
            <div className="space-y-4 py-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="font-medium">Item {itemParaEncerrar.numero}</p>
                <p className="text-sm text-gray-600">{itemParaEncerrar.descricao}</p>
                <div className="flex gap-4 mt-2 text-sm">
                  <span>Tempo restante: <strong>{formatarTempo(itemParaEncerrar.tempo_restante)}</strong></span>
                  <span>Lances: <strong>{itemParaEncerrar.total_lances}</strong></span>
                </div>
              </div>

              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Atenção</AlertTitle>
                <AlertDescription>
                  O encerramento forçado interrompe a disputa antes do tempo previsto.
                  Esta ação será registrada para auditoria e deve ser justificada
                  conforme Art. 17 da Lei 14.133/2021.
                </AlertDescription>
              </Alert>

              <div>
                <label className="text-sm font-medium">Justificativa Técnica (obrigatória)</label>
                <Textarea
                  placeholder="Descreva o erro do sistema que justifica o encerramento forçado..."
                  value={justificativaEncerrar}
                  onChange={(e) => setJustificativaEncerrar(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Exemplos: Falha de conexão, erro de cálculo de tempo, travamento do sistema
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEncerrar(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={encerrarItemForcado}
              disabled={!justificativaEncerrar.trim() || encerrando}
            >
              {encerrando ? 'Encerrando...' : 'Confirmar Encerramento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Alterar Anonimização */}
      <Dialog open={modalConfig} onOpenChange={setModalConfig}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeOff className="h-5 w-5 text-blue-600" />
              Alterar Anonimização
            </DialogTitle>
            <DialogDescription>
              {configSessao?.anonimizacao_ativa 
                ? 'Desativar a anonimização revelará a identidade dos fornecedores.'
                : 'Ativar a anonimização ocultará a identidade dos fornecedores.'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="font-medium">Sessão: {sessaoSelecionada?.licitacao_numero}</p>
              <p className="text-sm text-gray-600">{sessaoSelecionada?.orgao_nome}</p>
              <div className="mt-2">
                <Badge variant={configSessao?.anonimizacao_ativa ? 'default' : 'secondary'}>
                  Estado atual: {configSessao?.anonimizacao_ativa ? 'Anonimização ATIVA' : 'Anonimização INATIVA'}
                </Badge>
              </div>
            </div>

            <Alert variant={configSessao?.anonimizacao_ativa ? 'destructive' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Atenção</AlertTitle>
              <AlertDescription>
                {configSessao?.anonimizacao_ativa 
                  ? 'Desativar a anonimização pode violar o sigilo da disputa conforme Lei 14.133/2021. Esta ação será registrada para auditoria.'
                  : 'A anonimização será ativada e os fornecedores serão identificados como "Fornecedor A", "Fornecedor B", etc.'}
              </AlertDescription>
            </Alert>

            <div>
              <label className="text-sm font-medium">Justificativa (obrigatória)</label>
              <Textarea
                placeholder="Descreva o motivo para alterar a anonimização..."
                value={justificativaConfig}
                onChange={(e) => setJustificativaConfig(e.target.value)}
                rows={3}
              />
              <p className="text-xs text-gray-500 mt-1">
                Esta justificativa será registrada para auditoria.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setModalConfig(false)
              setJustificativaConfig('')
            }}>
              Cancelar
            </Button>
            <Button
              variant={configSessao?.anonimizacao_ativa ? 'destructive' : 'default'}
              onClick={() => {
                toggleAnonimizacao(!configSessao?.anonimizacao_ativa)
                setModalConfig(false)
              }}
              disabled={!justificativaConfig.trim() || salvandoConfig}
            >
              {salvandoConfig ? 'Salvando...' : (configSessao?.anonimizacao_ativa ? 'Desativar Anonimização' : 'Ativar Anonimização')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
