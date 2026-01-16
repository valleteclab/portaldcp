'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Play, Pause, Square, MessageSquare, Clock, Users, 
  ChevronDown, ChevronUp, AlertTriangle, CheckCircle2,
  Send, RefreshCw, Gavel, Settings, FileText
} from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { API_URL, authFetch } from '@/lib/api'

// ============================================================================
// TIPOS
// ============================================================================

interface ItemDisputa {
  id: string
  numero: number
  descricao: string
  quantidade: number
  unidade: string
  valorReferencia: number
  valorMaximoAceitavel?: number
  status: 'AGUARDANDO' | 'EM_DISPUTA' | 'ENCERRADO'
  tempoRestante: number
  emProrrogacao?: boolean
  melhorLance?: {
    valor: number
    fornecedorId: string
    fornecedorNome: string
  }
  totalPropostas: number
  totalLances: number
}

interface Sessao {
  id: string
  licitacaoId: string
  status: string
  etapa: string
  modoDisputa: string
  disputaPorItem: boolean
  pregoeiro: { id: string; nome: string }
  tempoInatividade: number
  chatDesabilitado: boolean
  suspensa: boolean
  motivoSuspensao?: string
  licitacao?: { id: string; numero: string; objeto: string }
}

interface Mensagem {
  id: string
  tipo: 'SISTEMA' | 'PREGOEIRO' | 'FORNECEDOR'
  remetente: string
  conteudo: string
  dataHora: Date
}

interface ConfiguracoesSessao {
  tempo_inatividade_minutos: number
  tempo_prorrogacao_minutos: number
  intervalo_minimo_lances_minutos: number
  tempo_aleatorio_min_minutos: number
  tempo_aleatorio_max_minutos: number
  chat_desabilitado: boolean
  modo_aberto: boolean
  modo_aberto_fechado: boolean
  disputa_por_item: boolean
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function DisputaPregoeiro() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessaoIdParam = searchParams.get('sessao')
  const licitacaoIdParam = searchParams.get('licitacao')
  
  // Estado para sessaoId (pode vir do param ou ser buscado via licitação)
  const [sessaoId, setSessaoId] = useState<string | null>(sessaoIdParam)

  // Estados
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [itensAguardando, setItensAguardando] = useState<ItemDisputa[]>([])
  const [itensEmDisputa, setItensEmDisputa] = useState<ItemDisputa[]>([])
  const [itensEncerrados, setItensEncerrados] = useState<ItemDisputa[]>([])
  const [itensSelecionados, setItensSelecionados] = useState<string[]>([])
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [novaMensagem, setNovaMensagem] = useState('')
  const [itensExpandidos, setItensExpandidos] = useState<string[]>([])
  const [lancesItemMap, setLancesItemMap] = useState<Record<string, any[]>>({})
  const [tipoLancesMap, setTipoLancesMap] = useState<Record<string, 'propostas' | 'melhores' | 'todos'>>({})
  const [wsConectado, setWsConectado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  // Modal suspender
  const [modalSuspender, setModalSuspender] = useState(false)
  const [motivoSuspensao, setMotivoSuspensao] = useState<'ADMINISTRATIVO' | 'CAUTELAR' | 'JUDICIAL'>('ADMINISTRATIVO')
  const [justificativaSuspensao, setJustificativaSuspensao] = useState('')

  // Modal reiniciar
  const [modalReiniciar, setModalReiniciar] = useState(false)
  const [justificativaReiniciar, setJustificativaReiniciar] = useState('')

  // Modal configurações
  const [modalConfiguracoes, setModalConfiguracoes] = useState(false)
  const [configuracoes, setConfiguracoes] = useState<ConfiguracoesSessao | null>(null)
  const [salvandoConfig, setSalvandoConfig] = useState(false)

  // Refs
  const socketRef = useRef<Socket | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // ============================================================================
  // CONEXÃO WEBSOCKET
  // ============================================================================

  // Buscar sessão via licitação se não tiver sessaoId
  useEffect(() => {
    const buscarSessao = async () => {
      if (sessaoId) return // Já tem sessaoId
      
      if (licitacaoIdParam) {
        try {
          const res = await authFetch(`${API_URL}/api/sessao/licitacao/${licitacaoIdParam}`)
          if (res.ok) {
            const data = await res.json()
            if (data.id) {
              setSessaoId(data.id)
              return
            }
          }
        } catch (error) {
          console.error('Erro ao buscar sessão:', error)
        }
      }
      
      setErro('ID da sessão não informado')
      setCarregando(false)
    }
    
    buscarSessao()
  }, [licitacaoIdParam, sessaoId])

  useEffect(() => {
    if (!sessaoId) {
      return // Aguardar busca da sessão
    }

    // Buscar dados do pregoeiro do localStorage
    const orgaoData = localStorage.getItem('orgao')
    const pregoeiro = orgaoData ? JSON.parse(orgaoData) : { id: 'pregoeiro', nome: 'Pregoeiro' }

    // Conectar WebSocket
    const wsUrl = API_URL.replace('/api', '').replace('http', 'ws')
    const socket = io(`${wsUrl}/disputa-v2`, {
      transports: ['websocket', 'polling'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[WS] Conectado')
      setWsConectado(true)

      // Entrar na sala
      socket.emit('entrar_sala', {
        sessaoId,
        tipo: 'PREGOEIRO',
        usuarioId: pregoeiro.id,
        usuarioNome: pregoeiro.nome || 'Pregoeiro',
      })
    })

    socket.on('disconnect', () => {
      console.log('[WS] Desconectado')
      setWsConectado(false)
    })

    socket.on('dados_iniciais', (data) => {
      console.log('[WS] Dados iniciais:', data)
      setSessao(data.sessao)
      setItensAguardando(data.itens.aguardando || [])
      setItensEmDisputa(data.itens.emDisputa || [])
      setItensEncerrados(data.itens.encerrados || [])
      setCarregando(false)
    })

    socket.on('itens_iniciados', (data) => {
      console.log('[WS] Itens iniciados:', data)
      setItensAguardando(data.itens.aguardando || [])
      setItensEmDisputa(data.itens.emDisputa || [])
      setItensEncerrados(data.itens.encerrados || [])
      setItensSelecionados([])
    })

    socket.on('item_encerrado', (data) => {
      console.log('[WS] Item encerrado:', data)
      setItensAguardando(data.itens.aguardando || [])
      setItensEmDisputa(data.itens.emDisputa || [])
      setItensEncerrados(data.itens.encerrados || [])
    })

    socket.on('novo_lance', (data) => {
      console.log('[WS] Novo lance:', data)
      setItensAguardando(data.itens.aguardando || [])
      setItensEmDisputa(data.itens.emDisputa || [])
      setItensEncerrados(data.itens.encerrados || [])
      
      // Atualizar lances do item se estiver expandido
      if (data.itemId && data.lances) {
        setLancesItemMap(prev => ({ ...prev, [data.itemId]: data.lances }))
      }
    })

    socket.on('sessao_suspensa', (data) => {
      console.log('[WS] Sessão suspensa:', data)
      setSessao(data.sessao)
    })

    socket.on('sessao_retomada', (data) => {
      console.log('[WS] Sessão retomada:', data)
      setSessao(data.sessao)
    })

    socket.on('sessao_reiniciada', (data) => {
      console.log('[WS] Sessão reiniciada:', data)
      setSessao(data.sessao)
      setItensAguardando(data.itens.aguardando || [])
      setItensEmDisputa(data.itens.emDisputa || [])
      setItensEncerrados(data.itens.encerrados || [])
      setItensSelecionados([])
    })

    socket.on('nova_mensagem', (data) => {
      console.log('[WS] Nova mensagem:', data)
      setMensagens(prev => [data, ...prev])
    })

    socket.on('lances_item', (data) => {
      console.log('[WS] Lances do item:', data)
      if (data.itemId) {
        setLancesItemMap(prev => ({ ...prev, [data.itemId]: data.dados || [] }))
      }
    })

    // Alerta de diferença menor que 5% entre lances (Lei 14.133/2021 - Art. 61)
    socket.on('alerta_diferenca_5_porcento', (data) => {
      console.log('[WS] Alerta 5%:', data)
      // Mostrar alerta visual para o pregoeiro
      const confirmar = window.confirm(
        `⚠️ ATENÇÃO - Lei 14.133/2021\n\n` +
        `Item ${data.itemNumero}: A diferença entre o 1º e 2º colocado é de apenas ${data.diferencaPercentual?.toFixed(2)}%.\n\n` +
        `1º Lugar: R$ ${data.primeiroLance?.valor?.toFixed(2)}\n` +
        `2º Lugar: R$ ${data.segundoLance?.valor?.toFixed(2)}\n\n` +
        `Deseja reiniciar a disputa deste item?\n\n` +
        `Clique OK para REINICIAR ou Cancelar para CONTINUAR.`
      )
      
      if (confirmar) {
        // TODO: Implementar reinício de item específico
        alert('Funcionalidade de reinício de item será implementada em breve.')
      }
    })
    
    // Atualização de tempo do servidor (sincronização garantida)
    socket.on('tempo_atualizado', (data) => {
      if (data.itens && Array.isArray(data.itens)) {
        setItensEmDisputa(prev => prev.map(item => {
          const tempoAtualizado = data.itens.find((t: any) => t.id === item.id)
          if (tempoAtualizado) {
            return {
              ...item,
              tempoRestante: tempoAtualizado.tempoRestante,
              emProrrogacao: tempoAtualizado.emProrrogacao,
            }
          }
          return item
        }))
      }
    })

    socket.on('erro', (data) => {
      console.error('[WS] Erro:', data)
      setErro(data.mensagem)
    })

    // Cleanup
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [sessaoId])

  // Timer removido - tempo agora vem 100% do backend via WebSocket
  useEffect(() => {
    // Mantido apenas para cleanup de referência antiga
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [])

  // ============================================================================
  // AÇÕES
  // ============================================================================

  const iniciarItensSelecionados = useCallback(() => {
    if (!socketRef.current || itensSelecionados.length === 0) return

    socketRef.current.emit('iniciar_itens', {
      sessaoId,
      itensIds: itensSelecionados,
    })
  }, [sessaoId, itensSelecionados])

  const encerrarItem = useCallback((itemId: string) => {
    if (!socketRef.current) return

    socketRef.current.emit('encerrar_item', {
      sessaoId,
      itemId,
    })
  }, [sessaoId])

  const suspenderSessao = useCallback(() => {
    if (!socketRef.current) return

    socketRef.current.emit('suspender_sessao', {
      sessaoId,
      motivo: motivoSuspensao,
      justificativa: justificativaSuspensao,
    })

    setModalSuspender(false)
    setJustificativaSuspensao('')
  }, [sessaoId, motivoSuspensao, justificativaSuspensao])

  const retomarSessao = useCallback(() => {
    if (!socketRef.current) return

    socketRef.current.emit('retomar_sessao', { sessaoId })
  }, [sessaoId])

  const reiniciarSessao = useCallback(() => {
    if (!socketRef.current || !justificativaReiniciar.trim()) return

    socketRef.current.emit('reiniciar_sessao', {
      sessaoId,
      justificativa: justificativaReiniciar.trim(),
    })

    setModalReiniciar(false)
    setJustificativaReiniciar('')
  }, [sessaoId, justificativaReiniciar])

  const enviarMensagem = useCallback(() => {
    if (!socketRef.current || !novaMensagem.trim()) return

    socketRef.current.emit('enviar_mensagem', {
      sessaoId,
      conteudo: novaMensagem.trim(),
    })

    setNovaMensagem('')
  }, [sessaoId, novaMensagem])

  const buscarLancesItem = useCallback((itemId: string, tipo: 'propostas' | 'melhores' | 'todos', itemEncerrado?: boolean) => {
    if (!socketRef.current) return

    socketRef.current.emit('buscar_lances_item', { itemId, tipo, itemEncerrado: itemEncerrado ?? false })
    setTipoLancesMap(prev => ({ ...prev, [itemId]: tipo }))
  }, [])

  const toggleItemExpandido = (itemId: string) => {
    setItensExpandidos(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    )
  }

  const toggleItemSelecionado = (itemId: string) => {
    setItensSelecionados(prev => 
      prev.includes(itemId) 
        ? prev.filter(id => id !== itemId)
        : [...prev, itemId]
    )
  }

  const selecionarTodosAguardando = () => {
    if (itensSelecionados.length === itensAguardando.length) {
      setItensSelecionados([])
    } else {
      setItensSelecionados(itensAguardando.map(i => i.id))
    }
  }

  const formatarTempo = (segundos: number) => {
    const min = Math.floor(segundos / 60)
    const seg = segundos % 60
    return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`
  }

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  // ============================================================================
  // CONFIGURAÇÕES
  // ============================================================================

  const abrirConfiguracoes = async () => {
    if (!sessaoId) return
    
    try {
      const res = await authFetch(`${API_URL}/api/disputa-v2/sessao/${sessaoId}/configuracoes`)
      if (res.ok) {
        const data = await res.json()
        setConfiguracoes(data)
        setModalConfiguracoes(true)
      }
    } catch (error) {
      console.error('Erro ao buscar configurações:', error)
    }
  }

  const salvarConfiguracoes = async () => {
    if (!sessaoId || !configuracoes) return
    
    setSalvandoConfig(true)
    try {
      const res = await authFetch(`${API_URL}/api/disputa-v2/sessao/${sessaoId}/configuracoes`, {
        method: 'PUT',
        body: JSON.stringify({
          tempo_inatividade_minutos: configuracoes.tempo_inatividade_minutos,
          tempo_prorrogacao_minutos: configuracoes.tempo_prorrogacao_minutos,
          intervalo_minimo_lances_minutos: configuracoes.intervalo_minimo_lances_minutos,
          tempo_aleatorio_min_minutos: configuracoes.tempo_aleatorio_min_minutos,
          tempo_aleatorio_max_minutos: configuracoes.tempo_aleatorio_max_minutos,
          chat_desabilitado: configuracoes.chat_desabilitado,
        }),
      })
      
      if (res.ok) {
        setModalConfiguracoes(false)
        // Atualizar sessão local
        if (sessao) {
          setSessao({
            ...sessao,
            tempoInatividade: configuracoes.tempo_inatividade_minutos,
            chatDesabilitado: configuracoes.chat_desabilitado,
          })
        }
      }
    } catch (error) {
      console.error('Erro ao salvar configurações:', error)
    } finally {
      setSalvandoConfig(false)
    }
  }

  // ============================================================================
  // RENDER
  // ============================================================================

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Carregando sala de disputa...</p>
        </div>
      </div>
    )
  }

  if (erro && !sessao) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-600">{erro}</p>
            <Button className="mt-4" onClick={() => router.back()}>
              Voltar
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-blue-900 text-white p-4">
        <div className="container mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Sala de Disputa</h1>
            <p className="text-blue-200 text-sm">
              {sessao?.licitacao?.numero} - {sessao?.licitacao?.objeto?.substring(0, 60)}...
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={wsConectado ? 'default' : 'destructive'} className="bg-green-600">
              {wsConectado ? '● Online' : '○ Offline'}
            </Badge>
            <Badge variant="outline" className="text-white border-white">
              Modo: {sessao?.modoDisputa}
            </Badge>
            {sessao?.suspensa && (
              <Badge variant="destructive">SUSPENSA</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Barra de ações */}
      <div className="bg-white border-b p-3">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            {sessao?.suspensa ? (
              <Button onClick={retomarSessao} variant="default" className="bg-green-600">
                <Play className="h-4 w-4 mr-2" /> Retomar Sessão
              </Button>
            ) : (
              <Button onClick={() => setModalSuspender(true)} variant="outline" className="text-orange-600 border-orange-600">
                <Pause className="h-4 w-4 mr-2" /> Suspender
              </Button>
            )}
            <Button onClick={() => setModalReiniciar(true)} variant="outline" className="text-red-600 border-red-600">
              <RefreshCw className="h-4 w-4 mr-2" /> Reset Sessão
            </Button>
            <Button onClick={abrirConfiguracoes} variant="outline">
              <Settings className="h-4 w-4 mr-2" /> Configurações
            </Button>
            <Button 
              onClick={() => sessao?.licitacaoId && router.push(`/orgao/licitacoes/${sessao.licitacaoId}/ata`)} 
              variant="outline"
              disabled={!sessao?.licitacaoId}
            >
              <FileText className="h-4 w-4 mr-2" /> Ver Ata
            </Button>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <span>Aguardando: <strong>{itensAguardando.length}</strong></span>
            <span>Em disputa: <strong>{itensEmDisputa.length}</strong></span>
            <span>Encerrados: <strong>{itensEncerrados.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="container mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          {/* Área principal - Itens */}
          <div className="lg:col-span-3">
            <Card>
              <Tabs defaultValue="emDisputa">
                <CardHeader className="pb-2">
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="aguardando">
                      Aguardando ({itensAguardando.length})
                    </TabsTrigger>
                    <TabsTrigger value="emDisputa">
                      Em Disputa ({itensEmDisputa.length})
                    </TabsTrigger>
                    <TabsTrigger value="encerrados">
                      Encerrados ({itensEncerrados.length})
                    </TabsTrigger>
                  </TabsList>
                </CardHeader>

                <CardContent>
                  {/* Aba Aguardando */}
                  <TabsContent value="aguardando" className="mt-0">
                    {itensAguardando.length > 0 && (
                      <div className="mb-4 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Checkbox 
                            checked={itensSelecionados.length === itensAguardando.length && itensAguardando.length > 0}
                            onCheckedChange={selecionarTodosAguardando}
                          />
                          <span className="text-sm text-gray-600">Selecionar todos</span>
                        </div>
                        <Button 
                          onClick={iniciarItensSelecionados}
                          disabled={itensSelecionados.length === 0 || sessao?.suspensa}
                          className="bg-green-600"
                        >
                          <Play className="h-4 w-4 mr-2" />
                          Iniciar {itensSelecionados.length} item(ns)
                        </Button>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      {itensAguardando.map(item => (
                        <ItemCard 
                          key={item.id}
                          item={item}
                          selecionado={itensSelecionados.includes(item.id)}
                          onSelecionar={() => toggleItemSelecionado(item.id)}
                          expandido={itensExpandidos.includes(item.id)}
                          onExpandir={() => {
                            toggleItemExpandido(item.id)
                            if (!itensExpandidos.includes(item.id)) {
                              buscarLancesItem(item.id, 'propostas')
                            }
                          }}
                          lancesItem={lancesItemMap[item.id] || []}
                          tipoLances={tipoLancesMap[item.id] || 'propostas'}
                          onTipoLances={(tipo) => buscarLancesItem(item.id, tipo)}
                          formatarMoeda={formatarMoeda}
                          formatarTempo={formatarTempo}
                          mostrarCheckbox={true}
                        />
                      ))}
                      {itensAguardando.length === 0 && (
                        <p className="text-center text-gray-500 py-8">
                          Nenhum item aguardando disputa
                        </p>
                      )}
                    </div>
                  </TabsContent>

                  {/* Aba Em Disputa */}
                  <TabsContent value="emDisputa" className="mt-0">
                    <div className="space-y-2">
                      {itensEmDisputa.map(item => (
                        <ItemCard 
                          key={item.id}
                          item={item}
                          expandido={itensExpandidos.includes(item.id)}
                          onExpandir={() => {
                            toggleItemExpandido(item.id)
                            if (!itensExpandidos.includes(item.id)) {
                              buscarLancesItem(item.id, 'todos')
                            }
                          }}
                          lancesItem={lancesItemMap[item.id] || []}
                          tipoLances={tipoLancesMap[item.id] || 'todos'}
                          onTipoLances={(tipo) => buscarLancesItem(item.id, tipo)}
                          formatarMoeda={formatarMoeda}
                          formatarTempo={formatarTempo}
                        />
                      ))}
                      {itensEmDisputa.length === 0 && (
                        <p className="text-center text-gray-500 py-8">
                          Nenhum item em disputa no momento
                        </p>
                      )}
                    </div>
                  </TabsContent>

                  {/* Aba Encerrados */}
                  <TabsContent value="encerrados" className="mt-0">
                    <div className="space-y-2">
                      {itensEncerrados.map(item => (
                        <ItemCard 
                          key={item.id}
                          item={item}
                          expandido={itensExpandidos.includes(item.id)}
                          onExpandir={() => {
                            toggleItemExpandido(item.id)
                            if (!itensExpandidos.includes(item.id)) {
                              buscarLancesItem(item.id, 'todos', true) // itemEncerrado=true - mostra nomes reais
                            }
                          }}
                          lancesItem={lancesItemMap[item.id] || []}
                          tipoLances={tipoLancesMap[item.id] || 'todos'}
                          onTipoLances={(tipo) => buscarLancesItem(item.id, tipo, true)} // itemEncerrado=true
                          formatarMoeda={formatarMoeda}
                          formatarTempo={formatarTempo}
                        />
                      ))}
                      {itensEncerrados.length === 0 && (
                        <p className="text-center text-gray-500 py-8">
                          Nenhum item encerrado ainda
                        </p>
                      )}
                    </div>
                  </TabsContent>
                </CardContent>
              </Tabs>
            </Card>
          </div>

          {/* Sidebar - Chat */}
          <div className="lg:col-span-1">
            <Card className="h-[600px] flex flex-col">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Mensagens
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ScrollArea className="flex-1 pr-4">
                  <div className="space-y-3">
                    {mensagens.map((msg, idx) => (
                      <div 
                        key={msg.id || idx}
                        className={`p-2 rounded text-sm ${
                          msg.tipo === 'SISTEMA' 
                            ? 'bg-gray-100 text-gray-600' 
                            : msg.tipo === 'PREGOEIRO'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        <div className="font-medium text-xs mb-1">
                          {msg.remetente} - {new Date(msg.dataHora).toLocaleTimeString()}
                        </div>
                        {msg.conteudo}
                      </div>
                    ))}
                    {mensagens.length === 0 && (
                      <p className="text-center text-gray-400 text-sm py-4">
                        Nenhuma mensagem ainda
                      </p>
                    )}
                  </div>
                </ScrollArea>
                
                <div className="mt-4 flex gap-2">
                  <Input 
                    placeholder="Digite uma mensagem..."
                    value={novaMensagem}
                    onChange={(e) => setNovaMensagem(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && enviarMensagem()}
                    disabled={sessao?.chatDesabilitado}
                  />
                  <Button 
                    size="icon" 
                    onClick={enviarMensagem}
                    disabled={!novaMensagem.trim() || sessao?.chatDesabilitado}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* Modal Suspender */}
      <Dialog open={modalSuspender} onOpenChange={setModalSuspender}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspender Sessão Pública</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Motivo</label>
              <Select value={motivoSuspensao} onValueChange={(v: any) => setMotivoSuspensao(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADMINISTRATIVO">Medida Administrativa</SelectItem>
                  <SelectItem value="CAUTELAR">Medida Cautelar</SelectItem>
                  <SelectItem value="JUDICIAL">Medida Judicial</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Justificativa</label>
              <Textarea 
                placeholder="Descreva o motivo da suspensão..."
                value={justificativaSuspensao}
                onChange={(e) => setJustificativaSuspensao(e.target.value)}
                rows={4}
              />
            </div>
            <p className="text-sm text-orange-600">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              Itens em disputa continuarão até o encerramento. Novos itens não serão abertos.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalSuspender(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={suspenderSessao}
              disabled={!justificativaSuspensao.trim()}
              className="bg-orange-600"
            >
              Confirmar Suspensão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Reset Sessão */}
      <Dialog open={modalReiniciar} onOpenChange={setModalReiniciar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">⚠️ Reset Sessão</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-800 font-medium mb-2">Esta ação irá:</p>
              <ul className="text-sm text-red-700 space-y-1 list-disc list-inside">
                <li>Cancelar <strong>TODOS</strong> os lances registrados</li>
                <li>Resetar todos os itens para "Aguardando"</li>
                <li>Manter as propostas originais dos fornecedores</li>
              </ul>
            </div>
            <div>
              <label className="text-sm font-medium">Justificativa (obrigatória)</label>
              <Textarea 
                placeholder="Descreva o motivo para resetar a sessão..."
                value={justificativaReiniciar}
                onChange={(e) => setJustificativaReiniciar(e.target.value)}
                rows={4}
              />
            </div>
            <p className="text-sm text-gray-600">
              Esta ação será registrada na ata da sessão e não pode ser desfeita.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalReiniciar(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={reiniciarSessao}
              disabled={!justificativaReiniciar.trim()}
              className="bg-red-600 hover:bg-red-700"
            >
              Confirmar Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Configurações */}
      <Dialog open={modalConfiguracoes} onOpenChange={setModalConfiguracoes}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Configurações da Disputa
            </DialogTitle>
          </DialogHeader>
          {configuracoes && (
            <div className="space-y-6 py-4">
              {/* Modo de Disputa (somente leitura) */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-800 mb-2">Modo de Disputa</p>
                <div className="flex gap-4 text-sm">
                  <Badge variant={configuracoes.modo_aberto ? 'default' : 'secondary'}>
                    {configuracoes.modo_aberto ? 'Modo Aberto' : 'Modo Fechado'}
                  </Badge>
                  <Badge variant="outline">
                    {configuracoes.disputa_por_item ? 'Por Item' : 'Por Lote'}
                  </Badge>
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  O modo de disputa é definido no cadastro da licitação e não pode ser alterado aqui.
                </p>
              </div>

              {/* Tempo Inicial */}
              <div className="space-y-2">
                <Label htmlFor="tempo_inatividade">Tempo Inicial da Disputa (minutos)</Label>
                <Input
                  id="tempo_inatividade"
                  type="number"
                  min={1}
                  max={60}
                  value={configuracoes.tempo_inatividade_minutos}
                  onChange={(e) => setConfiguracoes({
                    ...configuracoes,
                    tempo_inatividade_minutos: parseInt(e.target.value) || 10
                  })}
                />
                <p className="text-xs text-gray-500">
                  Lei 14.133/2021: Padrão de 10 minutos para modo aberto
                </p>
              </div>

              {/* Tempo de Prorrogação */}
              <div className="space-y-2">
                <Label htmlFor="tempo_prorrogacao">Tempo de Prorrogação (minutos)</Label>
                <Input
                  id="tempo_prorrogacao"
                  type="number"
                  min={1}
                  max={10}
                  value={configuracoes.tempo_prorrogacao_minutos}
                  onChange={(e) => setConfiguracoes({
                    ...configuracoes,
                    tempo_prorrogacao_minutos: parseInt(e.target.value) || 2
                  })}
                />
                <p className="text-xs text-gray-500">
                  Prorrogação automática se houver lance nos últimos minutos. Padrão: 2 minutos
                </p>
              </div>

              {/* Intervalo Mínimo entre Lances */}
              <div className="space-y-2">
                <Label htmlFor="intervalo_lances">Intervalo Mínimo entre Lances (minutos)</Label>
                <Input
                  id="intervalo_lances"
                  type="number"
                  min={0}
                  max={10}
                  value={configuracoes.intervalo_minimo_lances_minutos}
                  onChange={(e) => setConfiguracoes({
                    ...configuracoes,
                    intervalo_minimo_lances_minutos: parseInt(e.target.value) || 3
                  })}
                />
              </div>

              {/* Tempo Aleatório */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tempo_aleatorio_min">Tempo Aleatório Mín (min)</Label>
                  <Input
                    id="tempo_aleatorio_min"
                    type="number"
                    min={1}
                    max={30}
                    value={configuracoes.tempo_aleatorio_min_minutos}
                    onChange={(e) => setConfiguracoes({
                      ...configuracoes,
                      tempo_aleatorio_min_minutos: parseInt(e.target.value) || 2
                    })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tempo_aleatorio_max">Tempo Aleatório Máx (min)</Label>
                  <Input
                    id="tempo_aleatorio_max"
                    type="number"
                    min={1}
                    max={60}
                    value={configuracoes.tempo_aleatorio_max_minutos}
                    onChange={(e) => setConfiguracoes({
                      ...configuracoes,
                      tempo_aleatorio_max_minutos: parseInt(e.target.value) || 30
                    })}
                  />
                </div>
              </div>

              {/* Chat */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>Chat da Sessão</Label>
                  <p className="text-xs text-gray-500">Permite comunicação entre pregoeiro e fornecedores</p>
                </div>
                <Switch
                  checked={!configuracoes.chat_desabilitado}
                  onCheckedChange={(checked) => setConfiguracoes({
                    ...configuracoes,
                    chat_desabilitado: !checked
                  })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalConfiguracoes(false)}>
              Cancelar
            </Button>
            <Button 
              onClick={salvarConfiguracoes}
              disabled={salvandoConfig}
            >
              {salvandoConfig ? 'Salvando...' : 'Salvar Configurações'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ============================================================================
// COMPONENTE ITEM CARD
// ============================================================================

interface ItemCardProps {
  item: ItemDisputa
  selecionado?: boolean
  onSelecionar?: () => void
  expandido?: boolean
  onExpandir?: () => void
  onEncerrar?: () => void
  lancesItem?: any[]
  tipoLances?: 'propostas' | 'melhores' | 'todos'
  onTipoLances?: (tipo: 'propostas' | 'melhores' | 'todos') => void
  formatarMoeda: (valor: number) => string
  formatarTempo: (segundos: number) => string
  mostrarCheckbox?: boolean
  mostrarEncerrar?: boolean
}

function ItemCard({
  item,
  selecionado,
  onSelecionar,
  expandido,
  onExpandir,
  onEncerrar,
  lancesItem = [],
  tipoLances,
  onTipoLances,
  formatarMoeda,
  formatarTempo,
  mostrarCheckbox,
  mostrarEncerrar,
}: ItemCardProps) {
  return (
    <div className={`border rounded-lg ${item.status === 'EM_DISPUTA' ? 'border-blue-300 bg-blue-50' : ''}`}>
      <div className="p-3 flex items-center gap-3">
        {mostrarCheckbox && (
          <Checkbox checked={selecionado} onCheckedChange={onSelecionar} />
        )}
        
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-bold text-blue-900">Item {item.numero}</span>
            {item.status === 'EM_DISPUTA' && (
              <>
                <Badge 
                  className={`
                    ${item.tempoRestante <= 30 
                      ? 'bg-red-600 animate-pulse' 
                      : item.tempoRestante <= 60 
                        ? 'bg-orange-500' 
                        : 'bg-blue-600'
                    }
                  `}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  {formatarTempo(item.tempoRestante)}
                </Badge>
                {item.emProrrogacao && (
                  <Badge variant="outline" className="border-orange-500 text-orange-600 animate-pulse">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    Prorrogação Automática
                  </Badge>
                )}
              </>
            )}
            {item.status === 'ENCERRADO' && (
              <Badge className="bg-green-600">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Encerrado
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-600 line-clamp-1">{item.descricao}</p>
        </div>

        <div className="text-right text-sm">
          <div className="text-gray-500">Ref: {formatarMoeda(item.valorReferencia)}</div>
          {item.melhorLance && (
            <div className="font-bold text-green-600">
              Melhor: {formatarMoeda(item.melhorLance.valor)}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          {mostrarEncerrar && item.status === 'EM_DISPUTA' && (
            <Button size="sm" variant="outline" onClick={onEncerrar} className="text-red-600">
              <Square className="h-4 w-4" />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onExpandir}>
            {expandido ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Área expandida */}
      {expandido && (
        <div className="border-t p-3 bg-white">
          <Tabs value={tipoLances} onValueChange={(v: any) => onTipoLances?.(v)}>
            <TabsList className="mb-3">
              <TabsTrigger value="propostas">Propostas Iniciais</TabsTrigger>
              <TabsTrigger value="melhores">Melhores por Fornecedor</TabsTrigger>
              <TabsTrigger value="todos">Todos os Lances</TabsTrigger>
            </TabsList>

            <div className="max-h-60 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2">#</th>
                    <th className="text-left p-2">Fornecedor</th>
                    <th className="text-right p-2">Valor</th>
                    <th className="text-right p-2">Diferença</th>
                    {tipoLances === 'todos' && <th className="text-center p-2">Origem</th>}
                    {tipoLances === 'todos' && <th className="text-right p-2">Data/Hora</th>}
                  </tr>
                </thead>
                <tbody>
                  {lancesItem.map((lance, idx) => {
                    const valorLance = lance.valor || lance.melhorValor || 0
                    const diferenca = item.valorReferencia > 0 
                      ? ((item.valorReferencia - valorLance) / item.valorReferencia * 100)
                      : 0
                    return (
                      <tr key={lance.id || idx} className="border-t">
                        <td className="p-2">{lance.posicao || idx + 1}</td>
                        <td className="p-2">{lance.fornecedorNome || lance.fornecedor}</td>
                        <td className="p-2 text-right font-medium">
                          {formatarMoeda(valorLance)}
                        </td>
                        <td className={`p-2 text-right font-medium ${diferenca >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {diferenca >= 0 ? '-' : '+'}{Math.abs(diferenca).toFixed(2)}%
                        </td>
                        {tipoLances === 'todos' && (
                          <td className="p-2 text-center">
                            <Badge variant={lance.origem === 'PROPOSTA' ? 'secondary' : 'default'}>
                              {lance.origem}
                            </Badge>
                          </td>
                        )}
                        {tipoLances === 'todos' && (
                          <td className="p-2 text-right text-gray-500">
                            {lance.dataHora ? new Date(lance.dataHora).toLocaleString() : '-'}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                  {lancesItem.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-gray-500">
                        Nenhum registro encontrado
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Tabs>
        </div>
      )}
    </div>
  )
}
