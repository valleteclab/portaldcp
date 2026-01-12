"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { io, Socket } from "socket.io-client"
import { 
  ArrowLeft,
  Gavel,
  MessageSquare,
  Send,
  Play,
  Pause,
  StopCircle,
  Clock,
  Users,
  AlertTriangle,
  CheckCircle2,
  Circle,
  ChevronDown,
  ChevronUp,
  Bell,
  RefreshCw,
  Trophy,
  Target,
  Settings,
  SkipForward,
  Ban
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'

// Tipos
interface Sessao {
  id: string
  licitacaoId: string
  numero: string
  orgao: string
  objeto: string
  status: string
  etapa: string
  itemAtualId: string | null
  itensTotal: number
  itensEncerrados: number
  fornecedoresOnline: number
}

interface Item {
  id: string
  numero: number
  descricao: string
  quantidade: number
  unidade: string
  valorReferencia: number
  melhorLance: number | null
  melhorFornecedor: string | null
  totalParticipantes: number
  tempoRestante: number
  emTempoAleatorio: boolean
  status: 'EM_DISPUTA' | 'AGUARDANDO' | 'ENCERRADO'
}

interface Lance {
  id: string
  posicao: number
  fornecedor: string
  fornecedorId: string
  valor: number
  valorTotal: number
  horario: string
}

interface Mensagem {
  id: string
  tipo: 'SISTEMA' | 'PREGOEIRO' | 'FORNECEDOR'
  remetente: string
  mensagem: string
  horario: string
  destaque: boolean
}

// Função para obter dados do usuário logado (pregoeiro)
function getUsuarioLogado(): { id: string; nome: string; email: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const userStr = localStorage.getItem('user')
    if (userStr) {
      const user = JSON.parse(userStr)
      return {
        id: user.id,
        nome: user.nome || user.email,
        email: user.email
      }
    }
  } catch (e) {
    console.error('Erro ao obter usuário do localStorage:', e)
  }
  return null
}

// Formatar tempo
function formatarTempo(segundos: number): string {
  const min = Math.floor(segundos / 60)
  const seg = segundos % 60
  return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`
}

// Formatar moeda
function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export default function SalaDisputaPregoeiroPage() {
  const router = useRouter()
  const [usuario, setUsuario] = useState<{ id: string; nome: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState('em_disputa')
  
  // Sessões ativas
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [sessaoSelecionada, setSessaoSelecionada] = useState<string | null>(null)
  
  // Itens da sessão selecionada
  const [itens, setItens] = useState<Item[]>([])
  const [itemExpandido, setItemExpandido] = useState<string | null>(null)
  
  // Lances do item expandido
  const [lances, setLances] = useState<Lance[]>([])
  
  // Mensagens
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [novaMensagem, setNovaMensagem] = useState('')
  
  // WebSocket
  const socketRef = useRef<Socket | null>(null)
  const [wsConectado, setWsConectado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Carregar usuário logado
  useEffect(() => {
    const u = getUsuarioLogado()
    if (u) {
      setUsuario(u)
    } else {
      alert('Você precisa estar logado para acessar a sala de disputa')
      router.push('/login')
      return
    }
    
    // Verificar se há uma sessão pré-selecionada
    const sessaoPreSelecionada = localStorage.getItem('sessao_disputa_selecionada')
    if (sessaoPreSelecionada) {
      setSessaoSelecionada(sessaoPreSelecionada)
      localStorage.removeItem('sessao_disputa_selecionada')
    }
  }, [router])

  // Carregar sessões ativas do pregoeiro
  useEffect(() => {
    if (!usuario) return
    
    const carregarSessoes = async () => {
      try {
        const res = await fetch(`${API_URL}/api/sessao/pregoeiro/${usuario.id}/sessoes-ativas`)
        if (!res.ok) {
          // Se não houver endpoint específico, buscar todas as sessões
          setLoading(false)
          return
        }
        const data = await res.json()
        setSessoes(data.sessoes || [])
        setLoading(false)
      } catch (error) {
        console.error('Erro ao carregar sessões:', error)
        setSessoes([])
        setLoading(false)
      }
    }
    
    carregarSessoes()
    
    const interval = setInterval(carregarSessoes, 10000)
    return () => clearInterval(interval)
  }, [usuario])

  // Carregar itens quando selecionar sessão
  useEffect(() => {
    if (!sessaoSelecionada || !usuario) return
    
    const carregarItens = async () => {
      try {
        const res = await fetch(`${API_URL}/api/sessao/${sessaoSelecionada}/itens/pregoeiro`)
        if (!res.ok) {
          throw new Error('Erro ao buscar itens')
        }
        const data = await res.json()
        setItens(data.itens || [])
      } catch (error) {
        console.error('Erro ao carregar itens:', error)
        setItens([])
      }
    }
    
    const carregarMensagens = async () => {
      try {
        const res = await fetch(`${API_URL}/api/sessao/${sessaoSelecionada}/mensagens`)
        if (!res.ok) {
          throw new Error('Erro ao buscar mensagens')
        }
        const data = await res.json()
        setMensagens(data.mensagens || [])
      } catch (error) {
        console.error('Erro ao carregar mensagens:', error)
      }
    }
    
    carregarItens()
    carregarMensagens()
    
    const intervalItens = setInterval(carregarItens, 2000)
    const intervalMensagens = setInterval(carregarMensagens, 3000)
    
    return () => {
      clearInterval(intervalItens)
      clearInterval(intervalMensagens)
    }
  }, [sessaoSelecionada, usuario])

  // Carregar lances quando expandir item
  useEffect(() => {
    if (!itemExpandido) return
    
    const carregarLances = async () => {
      try {
        const res = await fetch(`${API_URL}/api/sessao/item/${itemExpandido}/lances/pregoeiro`)
        if (!res.ok) {
          throw new Error('Erro ao buscar lances')
        }
        const data = await res.json()
        setLances(data.lances || [])
      } catch (error) {
        console.error('Erro ao carregar lances:', error)
        setLances([])
      }
    }
    
    carregarLances()
    
    const interval = setInterval(carregarLances, 2000)
    return () => clearInterval(interval)
  }, [itemExpandido])

  // Selecionar primeira sessão automaticamente
  useEffect(() => {
    if (sessoes.length > 0 && !sessaoSelecionada) {
      setSessaoSelecionada(sessoes[0].id)
    }
  }, [sessoes, sessaoSelecionada])

  // Conectar WebSocket quando tiver sessão selecionada
  useEffect(() => {
    if (!usuario || !sessaoSelecionada) return

    console.log(`[WS] Conectando ao WebSocket: ${WS_URL}/sessao`)
    
    const socket = io(`${WS_URL}/sessao`, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    socket.on('connect', () => {
      console.log('[WS] Conectado:', socket.id)
      setWsConectado(true)
      setErro(null)

      socket.emit('entrar_sessao', {
        sessaoId: sessaoSelecionada,
        participante: usuario.id,
        tipo: 'PREGOEIRO'
      })
    })

    socket.on('disconnect', () => {
      console.log('[WS] Desconectado')
      setWsConectado(false)
    })

    socket.on('connect_error', (error) => {
      console.error('[WS] Erro de conexão:', error)
      setErro('Erro ao conectar ao servidor em tempo real')
      setWsConectado(false)
    })

    socket.on('novo_lance', (data) => {
      console.log('[WS] Novo lance recebido:', data)
    })

    socket.on('nova_mensagem', (msg) => {
      console.log('[WS] Nova mensagem:', msg)
      setMensagens(prev => [...prev, {
        id: Date.now().toString(),
        tipo: msg.isPregoeiro ? 'PREGOEIRO' : 'FORNECEDOR',
        remetente: msg.remetente,
        mensagem: msg.mensagem,
        horario: new Date(msg.horario).toLocaleTimeString('pt-BR'),
        destaque: msg.isPregoeiro
      }])
    })

    socket.on('participante_entrou', (data) => {
      console.log('[WS] Participante entrou:', data)
      setMensagens(prev => [...prev, {
        id: Date.now().toString(),
        tipo: 'SISTEMA',
        remetente: 'Sistema',
        mensagem: `${data.tipo === 'FORNECEDOR' ? 'Fornecedor' : 'Pregoeiro'} entrou na sala`,
        horario: new Date().toLocaleTimeString('pt-BR'),
        destaque: false
      }])
    })

    socket.on('erro', (data) => {
      console.error('[WS] Erro:', data)
      setErro(data.mensagem)
    })

    return () => {
      console.log('[WS] Desconectando')
      socket.disconnect()
      socketRef.current = null
    }
  }, [usuario, sessaoSelecionada])

  // Ações do pregoeiro
  const handleIniciarItem = useCallback((itemId: string) => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return

    socketRef.current.emit('iniciar_item', {
      sessaoId: sessaoSelecionada,
      itemId
    })
  }, [wsConectado, sessaoSelecionada])

  const handleEncerrarItem = useCallback(() => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return

    socketRef.current.emit('encerrar_item', {
      sessaoId: sessaoSelecionada
    })
  }, [wsConectado, sessaoSelecionada])

  const handleSuspenderSessao = useCallback((motivo: string) => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return

    socketRef.current.emit('suspender_sessao', {
      sessaoId: sessaoSelecionada,
      motivo
    })
  }, [wsConectado, sessaoSelecionada])

  const handleEnviarMensagem = useCallback(() => {
    if (!novaMensagem.trim()) return
    
    if (!socketRef.current || !wsConectado || !sessaoSelecionada || !usuario) {
      alert('Não conectado ao servidor')
      return
    }

    socketRef.current.emit('mensagem_chat', {
      sessaoId: sessaoSelecionada,
      remetente: usuario.nome,
      mensagem: novaMensagem,
      isPregoeiro: true
    })
    
    setNovaMensagem('')
  }, [novaMensagem, wsConectado, sessaoSelecionada, usuario])

  const getStatusBadge = (item: Item) => {
    if (item.status === 'EM_DISPUTA') return <Badge className="bg-red-100 text-red-800">Em Disputa</Badge>
    if (item.status === 'ENCERRADO') return <Badge className="bg-green-100 text-green-800">Encerrado</Badge>
    return <Badge className="bg-gray-100 text-gray-800">Aguardando</Badge>
  }

  const sessaoAtual = sessoes.find(s => s.id === sessaoSelecionada)

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-blue-900 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" className="text-white hover:bg-blue-800" onClick={() => router.push('/orgao')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
              <div className="flex items-center gap-2">
                <Gavel className="h-5 w-5 text-yellow-400" />
                <h1 className="text-lg font-semibold">Sala de Disputa - Pregoeiro</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Indicador de conexão */}
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${wsConectado ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
                <span>{wsConectado ? 'Conectado' : 'Desconectado'}</span>
              </div>
              
              {/* Usuário logado */}
              <div className="text-sm">
                <span className="font-medium">{usuario?.nome}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4">
        {sessoes.length === 0 ? (
          <Card className="p-8 text-center">
            <Gavel className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Nenhuma sessão ativa</h2>
            <p className="text-gray-500 mb-4">Você não possui sessões de disputa em andamento.</p>
            <Button onClick={() => router.push('/orgao/licitacoes')}>
              Ver Licitações
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-12 gap-4">
            {/* Coluna Principal */}
            <div className="col-span-8 space-y-4">
              {/* Seletor de Sessão */}
              {sessoes.length > 1 && (
                <Card>
                  <CardContent className="py-3">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-gray-600">Sessão:</span>
                      <Select value={sessaoSelecionada || ''} onValueChange={setSessaoSelecionada}>
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Selecione uma sessão" />
                        </SelectTrigger>
                        <SelectContent>
                          {sessoes.map(sessao => (
                            <SelectItem key={sessao.id} value={sessao.id}>
                              {sessao.numero} - {sessao.orgao}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Info da Sessão */}
              {sessaoAtual && (
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="py-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className="bg-blue-600 text-white">
                            <Gavel className="h-3 w-3 mr-1" />
                            Pregoeiro
                          </Badge>
                          <span className="font-semibold text-lg">{sessaoAtual.numero}</span>
                        </div>
                        <p className="text-sm text-gray-600">{sessaoAtual.orgao}</p>
                        <p className="text-sm text-gray-500 mt-1">{sessaoAtual.objeto}</p>
                      </div>
                      <div className="text-right space-y-1">
                        <div className="text-sm text-gray-600">
                          <Users className="h-4 w-4 inline mr-1" />
                          {sessaoAtual.fornecedoresOnline || 0} online
                        </div>
                        <div className="text-sm text-gray-600">
                          Itens: {sessaoAtual.itensEncerrados || 0}/{sessaoAtual.itensTotal || 0}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Controles do Pregoeiro */}
              <Card className="bg-yellow-50 border-yellow-200">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-yellow-800">Controles da Sessão</span>
                    <div className="flex gap-2">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="border-yellow-600 text-yellow-700">
                            <Pause className="h-4 w-4 mr-1" /> Suspender
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Suspender Sessão</AlertDialogTitle>
                            <AlertDialogDescription>
                              Informe o motivo da suspensão. Todos os participantes serão notificados.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <Input placeholder="Motivo da suspensão..." id="motivo-suspensao" />
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction 
                              className="bg-yellow-600"
                              onClick={() => {
                                const motivo = (document.getElementById('motivo-suspensao') as HTMLInputElement)?.value
                                if (motivo) handleSuspenderSessao(motivo)
                              }}
                            >
                              Confirmar Suspensão
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                      
                      <Button variant="outline" size="sm" className="border-red-600 text-red-700">
                        <StopCircle className="h-4 w-4 mr-1" /> Encerrar Sessão
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Abas de Status */}
              <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="em_disputa" className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    Em Disputa ({itens.filter(i => i.status === 'EM_DISPUTA').length})
                  </TabsTrigger>
                  <TabsTrigger value="aguardando">
                    Aguardando ({itens.filter(i => i.status === 'AGUARDANDO').length})
                  </TabsTrigger>
                  <TabsTrigger value="encerrados">
                    Encerrados ({itens.filter(i => i.status === 'ENCERRADO').length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="em_disputa" className="mt-4">
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-16">Item</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Melhor Lance</TableHead>
                          <TableHead className="text-center">Participantes</TableHead>
                          <TableHead className="text-center">Tempo</TableHead>
                          <TableHead className="text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itens.filter(i => i.status === 'EM_DISPUTA').map(item => (
                          <React.Fragment key={item.id}>
                            <TableRow 
                              className={`cursor-pointer hover:bg-gray-50 ${item.emTempoAleatorio ? 'bg-red-50' : ''}`}
                              onClick={() => setItemExpandido(itemExpandido === item.id ? null : item.id)}
                            >
                              <TableCell>
                                <span className="font-medium">{item.numero}</span>
                              </TableCell>
                              <TableCell>
                                <div className="max-w-xs truncate text-sm" title={item.descricao}>
                                  {item.descricao}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {item.quantidade} {item.unidade} • Ref: {formatarMoeda(item.valorReferencia)}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="font-mono font-medium text-green-700">
                                  {item.melhorLance ? formatarMoeda(item.melhorLance) : '-'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {item.melhorFornecedor || '-'}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">{item.totalParticipantes}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className={`font-mono font-medium ${
                                  item.emTempoAleatorio ? 'text-red-600 animate-pulse' : 
                                  item.tempoRestante < 60 ? 'text-yellow-600' : 'text-gray-700'
                                }`}>
                                  {formatarTempo(item.tempoRestante)}
                                </div>
                                {item.emTempoAleatorio && (
                                  <div className="text-xs text-red-600">ALEATÓRIO</div>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <div className="flex gap-1 justify-center">
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      handleEncerrarItem()
                                    }}
                                    className="text-red-600 border-red-300"
                                  >
                                    <StopCircle className="h-3 w-3" />
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setItemExpandido(itemExpandido === item.id ? null : item.id)
                                    }}
                                  >
                                    {itemExpandido === item.id ? (
                                      <ChevronUp className="h-4 w-4" />
                                    ) : (
                                      <ChevronDown className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            
                            {itemExpandido === item.id && (
                              <TableRow>
                                <TableCell colSpan={6} className="bg-gray-50 p-4">
                                  <div className="space-y-4">
                                    <div className="bg-white p-4 rounded-lg border">
                                      <h4 className="font-medium mb-2">Ranking de Lances</h4>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="w-16">Pos.</TableHead>
                                            <TableHead>Fornecedor</TableHead>
                                            <TableHead className="text-right">Valor Unit.</TableHead>
                                            <TableHead className="text-right">Valor Total</TableHead>
                                            <TableHead>Horário</TableHead>
                                            <TableHead className="w-20">Ações</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {lances.map(lance => (
                                            <TableRow key={lance.id}>
                                              <TableCell>
                                                <Badge className={lance.posicao === 1 ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100'}>
                                                  {lance.posicao}º
                                                </Badge>
                                              </TableCell>
                                              <TableCell className="font-medium">{lance.fornecedor}</TableCell>
                                              <TableCell className="text-right font-mono">{formatarMoeda(lance.valor)}</TableCell>
                                              <TableCell className="text-right font-mono">{formatarMoeda(lance.valorTotal)}</TableCell>
                                              <TableCell className="text-gray-500">{lance.horario}</TableCell>
                                              <TableCell>
                                                <Button variant="ghost" size="sm" className="text-red-600">
                                                  <Ban className="h-3 w-3" />
                                                </Button>
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </TabsContent>

                <TabsContent value="aguardando">
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-16">Item</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Valor Ref.</TableHead>
                          <TableHead className="text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itens.filter(i => i.status === 'AGUARDANDO').map(item => (
                          <TableRow key={item.id}>
                            <TableCell><span className="font-medium">{item.numero}</span></TableCell>
                            <TableCell>
                              <div className="max-w-md truncate text-sm">{item.descricao}</div>
                              <div className="text-xs text-gray-500">{item.quantidade} {item.unidade}</div>
                            </TableCell>
                            <TableCell className="text-right font-mono">{formatarMoeda(item.valorReferencia)}</TableCell>
                            <TableCell className="text-center">
                              <Button 
                                size="sm" 
                                className="bg-green-600 hover:bg-green-700"
                                onClick={() => handleIniciarItem(item.id)}
                              >
                                <Play className="h-3 w-3 mr-1" /> Iniciar
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </TabsContent>

                <TabsContent value="encerrados">
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-16">Item</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Valor Final</TableHead>
                          <TableHead>Vencedor</TableHead>
                          <TableHead className="text-center">Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itens.filter(i => i.status === 'ENCERRADO').map(item => (
                          <TableRow key={item.id}>
                            <TableCell><span className="font-medium">{item.numero}</span></TableCell>
                            <TableCell>
                              <div className="max-w-md truncate text-sm">{item.descricao}</div>
                            </TableCell>
                            <TableCell className="text-right font-mono text-green-700">
                              {item.melhorLance ? formatarMoeda(item.melhorLance) : '-'}
                            </TableCell>
                            <TableCell>{item.melhorFornecedor || '-'}</TableCell>
                            <TableCell className="text-center">
                              <Badge className="bg-green-100 text-green-800">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> Encerrado
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            {/* Coluna Lateral */}
            <div className="col-span-4 space-y-4">
              {/* Alertas */}
              {itens.some(i => i.emTempoAleatorio) && (
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="py-3">
                    <div className="flex items-center gap-2 text-red-700">
                      <AlertTriangle className="h-5 w-5 animate-pulse" />
                      <div>
                        <p className="font-medium">Tempo Aleatório Ativo!</p>
                        <p className="text-sm">Itens podem encerrar a qualquer momento</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Chat/Mensagens */}
              <Card className="flex flex-col" style={{ height: '500px' }}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Chat da Sessão
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <ScrollArea className="flex-1 pr-4">
                    <div className="space-y-3">
                      {mensagens.map(msg => (
                        <div 
                          key={msg.id} 
                          className={`text-sm p-3 rounded-lg ${
                            msg.tipo === 'PREGOEIRO' ? 'bg-blue-50 border border-blue-200' : 
                            msg.tipo === 'SISTEMA' && msg.destaque ? 'bg-red-50 border border-red-200' :
                            'bg-gray-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            {msg.tipo === 'PREGOEIRO' && <Gavel className="h-3 w-3 text-blue-600" />}
                            {msg.tipo === 'SISTEMA' && msg.destaque && <AlertTriangle className="h-3 w-3 text-red-600" />}
                            <span className={`font-medium text-xs ${
                              msg.tipo === 'PREGOEIRO' ? 'text-blue-700' : 
                              msg.tipo === 'SISTEMA' ? 'text-gray-600' : 'text-green-700'
                            }`}>
                              {msg.remetente}
                            </span>
                            <span className="text-xs text-gray-400">{msg.horario}</span>
                          </div>
                          <p className="text-gray-700">{msg.mensagem}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <div className="flex gap-2 mt-4 pt-4 border-t">
                    <Input 
                      placeholder="Enviar mensagem aos fornecedores..."
                      className="text-sm"
                      value={novaMensagem}
                      onChange={(e) => setNovaMensagem(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleEnviarMensagem()}
                    />
                    <Button size="icon" onClick={handleEnviarMensagem}>
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Atalhos */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Mensagens Rápidas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start text-xs"
                    onClick={() => {
                      setNovaMensagem('Senhores fornecedores, atenção ao prazo de encerramento.')
                    }}
                  >
                    ⚠️ Atenção ao prazo
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start text-xs"
                    onClick={() => {
                      setNovaMensagem('Iniciando tempo aleatório de encerramento.')
                    }}
                  >
                    ⏱️ Tempo aleatório
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start text-xs"
                    onClick={() => {
                      setNovaMensagem('Sessão será suspensa por 10 minutos.')
                    }}
                  >
                    ⏸️ Suspensão
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
