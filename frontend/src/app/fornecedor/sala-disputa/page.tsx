"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { io, Socket } from "socket.io-client"
import { 
  ArrowLeft,
  Gavel,
  MessageSquare,
  Send,
  TrendingDown,
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
  Target
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

import { API_URL, getAuthHeaders } from '@/lib/api'
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'

// Tipos
interface Licitacao {
  id: string
  sessaoId: string
  numero: string
  orgao: string
  orgaoId: string
  objeto: string
  status: string
  etapa: string
  itensEmDisputa: number
  itensTotal: number
  minhaPosicaoGeral: number
}

interface Item {
  id: string
  numero: number
  descricao: string
  quantidade: number
  unidade: string
  valorReferencia: number
  melhorLance: number | null
  meuLance: number | null
  minhaPosicao: number | null
  totalParticipantes: number
  tempoRestante: number
  emTempoAleatorio: boolean
  status: 'EM_DISPUTA' | 'AGUARDANDO' | 'ENCERRADO'
}

interface Lance {
  id: string
  posicao: number
  fornecedor: string
  valor: number
  valorTotal: number
  horario: string
  isMeu: boolean
}

interface Mensagem {
  id: string
  tipo: 'SISTEMA' | 'PREGOEIRO' | 'FORNECEDOR'
  remetente: string
  mensagem: string
  horario: string
  destaque: boolean
}

// Função para obter dados do fornecedor logado
function getFornecedorLogado(): { id: string; nome: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const fornecedorStr = localStorage.getItem('fornecedor')
    if (fornecedorStr) {
      const fornecedor = JSON.parse(fornecedorStr)
      return {
        id: fornecedor.id,
        nome: fornecedor.razao_social || fornecedor.nome_fantasia || 'Fornecedor'
      }
    }
  } catch (e) {
    console.error('Erro ao obter fornecedor do localStorage:', e)
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

export default function SalaDisputaFornecedorPage() {
  const router = useRouter()
  const [fornecedor, setFornecedor] = useState<{ id: string; nome: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState('em_disputa')
  
  // Licitações
  const [licitacoes, setLicitacoes] = useState<Licitacao[]>([])
  const [licitacaoSelecionada, setLicitacaoSelecionada] = useState<string | null>(null)
  
  // Itens da licitação selecionada
  const [itens, setItens] = useState<Item[]>([])
  const [itemExpandido, setItemExpandido] = useState<string | null>(null)
  
  // Lances do item expandido
  const [lances, setLances] = useState<Lance[]>([])
  
  // Mensagens
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [novaMensagem, setNovaMensagem] = useState('')
  
  // Lance
  const [novoLance, setNovoLance] = useState('')
  
  // WebSocket
  const socketRef = useRef<Socket | null>(null)
  const [wsConectado, setWsConectado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Carregar fornecedor logado e licitação selecionada
  useEffect(() => {
    const f = getFornecedorLogado()
    if (f) {
      setFornecedor(f)
    } else {
      alert('Você precisa estar logado como fornecedor para acessar a sala de disputa')
      router.push('/fornecedor/login')
      return
    }
    
    // Verificar se há uma licitação pré-selecionada (vindo de outra página)
    const licitacaoPreSelecionada = localStorage.getItem('licitacao_disputa_selecionada')
    if (licitacaoPreSelecionada) {
      setLicitacaoSelecionada(licitacaoPreSelecionada)
      localStorage.removeItem('licitacao_disputa_selecionada') // Limpar após usar
    }
  }, [router])

  // Carregar licitações em disputa
  useEffect(() => {
    if (!fornecedor) return
    
    const carregarLicitacoes = async () => {
      try {
        const res = await fetch(`${API_URL}/api/sessao/fornecedor/${fornecedor.id}/licitacoes-ativas`)
        if (!res.ok) {
          throw new Error('Erro ao buscar licitações')
        }
        const data = await res.json()
        setLicitacoes(data.licitacoes || [])
        setLoading(false)
      } catch (error) {
        console.error('Erro ao carregar licitações:', error)
        setLicitacoes([])
        setLoading(false)
      }
    }
    
    carregarLicitacoes()
    
    // Atualizar a cada 5 segundos para manter dados frescos
    const interval = setInterval(carregarLicitacoes, 5000)
    return () => clearInterval(interval)
  }, [fornecedor])

  // Carregar itens quando selecionar licitação
  useEffect(() => {
    if (!licitacaoSelecionada || !fornecedor) return
    
    // Encontrar a sessão da licitação selecionada
    const licitacao = licitacoes.find(l => l.id === licitacaoSelecionada)
    if (!licitacao?.sessaoId) return
    
    const carregarItens = async () => {
      try {
        const res = await fetch(`${API_URL}/api/sessao/${licitacao.sessaoId}/itens/fornecedor/${fornecedor.id}`)
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
        const res = await fetch(`${API_URL}/api/sessao/${licitacao.sessaoId}/mensagens`)
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
    
    // Atualizar itens a cada 2 segundos para manter tempo atualizado
    const intervalItens = setInterval(carregarItens, 2000)
    // Atualizar mensagens a cada 3 segundos
    const intervalMensagens = setInterval(carregarMensagens, 3000)
    
    return () => {
      clearInterval(intervalItens)
      clearInterval(intervalMensagens)
    }
  }, [licitacaoSelecionada, fornecedor, licitacoes])

  // Carregar lances quando expandir item
  useEffect(() => {
    if (!itemExpandido || !fornecedor) return
    
    const carregarLances = async () => {
      try {
        const res = await fetch(`${API_URL}/api/sessao/item/${itemExpandido}/lances/fornecedor/${fornecedor.id}`)
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
    
    // Atualizar lances a cada 2 segundos
    const interval = setInterval(carregarLances, 2000)
    return () => clearInterval(interval)
  }, [itemExpandido, fornecedor])

  // Selecionar primeira licitação automaticamente
  useEffect(() => {
    if (licitacoes.length > 0 && !licitacaoSelecionada) {
      setLicitacaoSelecionada(licitacoes[0].id)
    }
  }, [licitacoes, licitacaoSelecionada])

  // Conectar WebSocket quando tiver sessão selecionada
  useEffect(() => {
    if (!fornecedor) return
    
    const licitacao = licitacoes.find(l => l.id === licitacaoSelecionada)
    if (!licitacao?.sessaoId) return

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

      // Entrar na sala da sessão
      socket.emit('entrar_sessao', {
        sessaoId: licitacao.sessaoId,
        participante: fornecedor.id,
        tipo: 'FORNECEDOR'
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

    // Recebe novo lance (atualiza lista)
    socket.on('novo_lance', (data) => {
      console.log('[WS] Novo lance recebido:', data)
      // Força atualização dos itens e lances
    })

    // Recebe nova mensagem
    socket.on('nova_mensagem', (msg) => {
      console.log('[WS] Nova mensagem:', msg)
      setMensagens(prev => [...prev, {
        id: Date.now().toString(),
        tipo: msg.isPregoeiro ? 'PREGOEIRO' : 'SISTEMA',
        remetente: msg.remetente,
        mensagem: msg.mensagem,
        horario: new Date(msg.horario).toLocaleTimeString('pt-BR'),
        destaque: msg.isPregoeiro
      }])
    })

    // Notificações
    socket.on('notificacao', (data) => {
      console.log('[WS] Notificação:', data)
      setMensagens(prev => [...prev, {
        id: Date.now().toString(),
        tipo: 'SISTEMA',
        remetente: 'Sistema',
        mensagem: data.mensagem,
        horario: new Date().toLocaleTimeString('pt-BR'),
        destaque: data.tipo === 'alerta'
      }])
    })

    // Cronômetro reset
    socket.on('cronometro_reset', () => {
      console.log('[WS] Cronômetro resetado')
    })

    // Erro no lance
    socket.on('erro_lance', (data) => {
      console.error('[WS] Erro no lance:', data)
      setErro(data.mensagem)
      alert(`Erro ao enviar lance: ${data.mensagem}`)
    })

    // Erro genérico
    socket.on('erro', (data) => {
      console.error('[WS] Erro:', data)
      setErro(data.mensagem)
    })

    // Cleanup
    return () => {
      console.log('[WS] Desconectando')
      socket.disconnect()
      socketRef.current = null
    }
  }, [fornecedor, licitacaoSelecionada, licitacoes])

  const handleEnviarLance = useCallback((itemId: string) => {
    const valor = parseFloat(novoLance.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) {
      alert('Valor inválido')
      return
    }
    
    if (!socketRef.current || !wsConectado) {
      alert('Não conectado ao servidor. Aguarde a reconexão.')
      return
    }

    const licitacao = licitacoes.find(l => l.id === licitacaoSelecionada)
    if (!licitacao?.sessaoId || !fornecedor) {
      alert('Erro: sessão não encontrada')
      return
    }

    // Enviar lance via WebSocket
    socketRef.current.emit('enviar_lance', {
      sessaoId: licitacao.sessaoId,
      itemId,
      fornecedorId: fornecedor.id,
      fornecedorNome: fornecedor.nome,
      valor
    })
    
    setNovoLance('')
  }, [novoLance, wsConectado, licitacoes, licitacaoSelecionada, fornecedor])

  const handleEnviarMensagem = useCallback(() => {
    if (!novaMensagem.trim()) return
    
    if (!socketRef.current || !wsConectado) {
      alert('Não conectado ao servidor')
      return
    }

    const licitacao = licitacoes.find(l => l.id === licitacaoSelecionada)
    if (!licitacao?.sessaoId || !fornecedor) return

    socketRef.current.emit('mensagem_chat', {
      sessaoId: licitacao.sessaoId,
      remetente: fornecedor.nome,
      mensagem: novaMensagem,
      isPregoeiro: false
    })
    
    setNovaMensagem('')
  }, [novaMensagem, wsConectado, licitacoes, licitacaoSelecionada, fornecedor])

  const calcularSugestao = (item: Item) => {
    const base = item.melhorLance || item.valorReferencia
    return (base * 0.995).toFixed(2)
  }

  const getStatusIcon = (item: Item) => {
    if (item.minhaPosicao === 1) return <Trophy className="h-4 w-4 text-green-600" />
    if (item.minhaPosicao && item.minhaPosicao <= 3) return <Target className="h-4 w-4 text-yellow-600" />
    return <Circle className="h-4 w-4 text-gray-400" />
  }

  const getStatusBadge = (item: Item) => {
    if (item.minhaPosicao === 1) return <Badge className="bg-green-100 text-green-800">1º Lugar</Badge>
    if (item.minhaPosicao) return <Badge className="bg-yellow-100 text-yellow-800">{item.minhaPosicao}º Lugar</Badge>
    return <Badge className="bg-gray-100 text-gray-800">Sem lance</Badge>
  }

  const licitacaoAtual = licitacoes.find(l => l.id === licitacaoSelecionada)

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
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => router.push('/fornecedor')}>
                <ArrowLeft className="h-4 w-4 mr-2" /> Voltar
              </Button>
              <div className="flex items-center gap-2">
                <Gavel className="h-5 w-5 text-red-600" />
                <h1 className="text-lg font-semibold">Sala de Disputa</h1>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Indicador de conexão WebSocket */}
              <div className="flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${wsConectado ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></span>
                <span className={wsConectado ? 'text-gray-600' : 'text-red-600'}>
                  {wsConectado ? 'Conectado' : 'Desconectado'}
                </span>
              </div>
              
              {/* Fornecedor logado */}
              <div className="text-sm text-gray-600">
                <span className="font-medium">{fornecedor?.nome}</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-4">
        <div className="grid grid-cols-12 gap-4">
          {/* Coluna Principal */}
          <div className="col-span-8 space-y-4">
            {/* Seletor de Licitação */}
            {licitacoes.length > 1 && (
              <Card>
                <CardContent className="py-3">
                  <div className="flex items-center gap-4">
                    <span className="text-sm font-medium text-gray-600">Licitação:</span>
                    <select 
                      className="flex-1 border rounded-md px-3 py-2 text-sm"
                      value={licitacaoSelecionada || ''}
                      onChange={(e) => setLicitacaoSelecionada(e.target.value)}
                    >
                      {licitacoes.map(lic => (
                        <option key={lic.id} value={lic.id}>
                          {lic.numero} - {lic.orgao}
                        </option>
                      ))}
                    </select>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Info da Licitação */}
            {licitacaoAtual && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Badge className="bg-red-100 text-red-800">
                          <span className="w-2 h-2 bg-red-500 rounded-full mr-1 animate-pulse inline-block"></span>
                          Em Disputa
                        </Badge>
                        <span className="font-semibold text-lg">{licitacaoAtual.numero}</span>
                      </div>
                      <p className="text-sm text-gray-600">{licitacaoAtual.orgao}</p>
                      <p className="text-sm text-gray-500 mt-1">{licitacaoAtual.objeto}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-gray-600">Sua posição geral</div>
                      <div className={`text-2xl font-bold ${licitacaoAtual.minhaPosicaoGeral === 1 ? 'text-green-600' : 'text-yellow-600'}`}>
                        {licitacaoAtual.minhaPosicaoGeral}º
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

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
                {/* Tabela de Itens */}
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50">
                        <TableHead className="w-16">Item</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Melhor Lance</TableHead>
                        <TableHead className="text-right">Meu Lance</TableHead>
                        <TableHead className="text-center">Variação</TableHead>
                        <TableHead className="text-center">Tempo</TableHead>
                        <TableHead className="text-center">Posição</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itens.filter(i => i.status === 'EM_DISPUTA').map(item => (
                        <React.Fragment key={item.id}>
                          <TableRow 
                            className={`cursor-pointer hover:bg-gray-50 ${
                              item.minhaPosicao === 1 ? 'bg-green-50' : 
                              item.emTempoAleatorio ? 'bg-red-50' : ''
                            }`}
                            onClick={() => setItemExpandido(itemExpandido === item.id ? null : item.id)}
                          >
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(item)}
                                <span className="font-medium">{item.numero}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="max-w-xs truncate text-sm" title={item.descricao}>
                                {item.descricao}
                              </div>
                              <div className="text-xs text-gray-500">
                                {item.quantidade} {item.unidade} • Ref: {formatarMoeda(item.valorReferencia)}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-mono font-medium text-green-700">
                              {item.melhorLance ? formatarMoeda(item.melhorLance) : '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {item.meuLance ? formatarMoeda(item.meuLance) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {item.meuLance && item.melhorLance ? (
                                <span className={item.meuLance <= item.melhorLance ? 'text-green-600' : 'text-red-600'}>
                                  {item.meuLance <= item.melhorLance ? '0%' : `+${(((item.meuLance - item.melhorLance) / item.melhorLance) * 100).toFixed(1)}%`}
                                </span>
                              ) : '-'}
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
                              {getStatusBadge(item)}
                            </TableCell>
                            <TableCell>
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
                            </TableCell>
                          </TableRow>
                          
                          {/* Área expandida para dar lance */}
                          {itemExpandido === item.id && (
                            <TableRow>
                              <TableCell colSpan={8} className="bg-gray-50 p-4">
                                <div className="space-y-4">
                                  {/* Detalhes do item */}
                                  <div className="bg-white p-4 rounded-lg border">
                                    <h4 className="font-medium mb-2">Item {item.numero}: {item.descricao}</h4>
                                    <div className="grid grid-cols-4 gap-4 text-sm">
                                      <div>
                                        <span className="text-gray-500">Quantidade:</span>
                                        <span className="ml-2 font-medium">{item.quantidade} {item.unidade}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Valor Referência:</span>
                                        <span className="ml-2 font-medium">{formatarMoeda(item.valorReferencia)}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Melhor Lance:</span>
                                        <span className="ml-2 font-medium text-green-700">{item.melhorLance ? formatarMoeda(item.melhorLance) : '-'}</span>
                                      </div>
                                      <div>
                                        <span className="text-gray-500">Participantes:</span>
                                        <span className="ml-2 font-medium">{item.totalParticipantes}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Formulário de lance */}
                                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                                    <div className="flex items-end gap-4">
                                      <div className="flex-1">
                                        <label className="text-sm font-medium text-gray-700 mb-1 block">
                                          Novo Lance (R$)
                                        </label>
                                        <Input 
                                          type="text"
                                          placeholder="Digite o valor do lance"
                                          className="text-lg font-mono"
                                          value={novoLance}
                                          onChange={(e) => setNovoLance(e.target.value)}
                                          onKeyPress={(e) => e.key === 'Enter' && handleEnviarLance(item.id)}
                                        />
                                      </div>
                                      <Button 
                                        variant="outline"
                                        onClick={() => setNovoLance(calcularSugestao(item))}
                                      >
                                        Sugerir: {formatarMoeda(parseFloat(calcularSugestao(item)))}
                                      </Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button className="bg-green-600 hover:bg-green-700">
                                            <TrendingDown className="h-4 w-4 mr-2" />
                                            Enviar Lance
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Confirmar Lance</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Você está prestes a enviar um lance de <strong className="text-green-600">{formatarMoeda(parseFloat(novoLance.replace(',', '.') || '0'))}</strong> para o Item {item.numero}.
                                              <br /><br />
                                              Valor total: <strong>{formatarMoeda(parseFloat(novoLance.replace(',', '.') || '0') * item.quantidade)}</strong>
                                              <br /><br />
                                              Esta ação não pode ser desfeita.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction 
                                              className="bg-green-600"
                                              onClick={() => handleEnviarLance(item.id)}
                                            >
                                              Confirmar Lance
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </div>

                                  {/* Histórico de lances */}
                                  <div>
                                    <h4 className="font-medium mb-2 flex items-center gap-2">
                                      <Clock className="h-4 w-4" />
                                      Histórico de Lances
                                    </h4>
                                    <div className="bg-white rounded-lg border max-h-48 overflow-auto">
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="w-16">Pos.</TableHead>
                                            <TableHead>Fornecedor</TableHead>
                                            <TableHead className="text-right">Valor Unit.</TableHead>
                                            <TableHead className="text-right">Valor Total</TableHead>
                                            <TableHead>Horário</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {lances.map(lance => (
                                            <TableRow key={lance.id} className={lance.isMeu ? 'bg-blue-50' : ''}>
                                              <TableCell>
                                                <Badge className={
                                                  lance.posicao === 1 ? 'bg-yellow-100 text-yellow-800' :
                                                  lance.isMeu ? 'bg-blue-100 text-blue-800' : 'bg-gray-100'
                                                }>
                                                  {lance.posicao}º
                                                </Badge>
                                              </TableCell>
                                              <TableCell className="font-medium">
                                                {lance.isMeu ? (
                                                  <span className="text-blue-600 flex items-center gap-1">
                                                    <CheckCircle2 className="h-4 w-4" /> Você
                                                  </span>
                                                ) : lance.fornecedor}
                                              </TableCell>
                                              <TableCell className="text-right font-mono">
                                                {formatarMoeda(lance.valor)}
                                              </TableCell>
                                              <TableCell className="text-right font-mono">
                                                {formatarMoeda(lance.valorTotal)}
                                              </TableCell>
                                              <TableCell className="text-gray-500">
                                                {lance.horario}
                                              </TableCell>
                                            </TableRow>
                                          ))}
                                        </TableBody>
                                      </Table>
                                    </div>
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
                <Card className="p-8 text-center text-gray-500">
                  <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Nenhum item aguardando disputa</p>
                </Card>
              </TabsContent>

              <TabsContent value="encerrados">
                <Card className="p-8 text-center text-gray-500">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>Nenhum item encerrado ainda</p>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Coluna Lateral - Mensagens */}
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

            {/* Status Geral */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Resumo da Participação
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Itens em 1º lugar:</span>
                    <span className="font-medium text-green-600">
                      {itens.filter(i => i.minhaPosicao === 1).length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Itens com lance:</span>
                    <span className="font-medium">
                      {itens.filter(i => i.meuLance).length} / {itens.length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Itens sem lance:</span>
                    <span className="font-medium text-yellow-600">
                      {itens.filter(i => !i.meuLance).length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Chat/Mensagens */}
            <Card className="flex flex-col" style={{ height: '400px' }}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Mensagens da Sessão
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ScrollArea className="flex-1 pr-4">
                  <div className="space-y-3">
                    {mensagens.map(msg => (
                      <div 
                        key={msg.id} 
                        className={`text-sm p-3 rounded-lg ${
                          msg.tipo === 'PREGOEIRO' ? 'bg-yellow-50 border border-yellow-200' : 
                          msg.tipo === 'SISTEMA' && msg.destaque ? 'bg-red-50 border border-red-200' :
                          'bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {msg.tipo === 'PREGOEIRO' && <Bell className="h-3 w-3 text-yellow-600" />}
                          {msg.tipo === 'SISTEMA' && msg.destaque && <AlertTriangle className="h-3 w-3 text-red-600" />}
                          <span className={`font-medium text-xs ${
                            msg.tipo === 'PREGOEIRO' ? 'text-yellow-700' : 
                            msg.tipo === 'SISTEMA' ? 'text-gray-600' : 'text-blue-700'
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
                    placeholder="Enviar mensagem..."
                    className="text-sm"
                    value={novaMensagem}
                    onChange={(e) => setNovaMensagem(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleEnviarMensagem()}
                  />
                  <Button size="icon" variant="outline" onClick={handleEnviarMensagem}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Dicas */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Dicas</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-gray-500 space-y-1">
                <p>• O tempo reinicia a cada lance enviado</p>
                <p>• Após 3 minutos sem lances, inicia o tempo aleatório</p>
                <p>• No tempo aleatório, o item pode encerrar entre 2 e 30 minutos</p>
                <p>• Fique atento às mensagens do pregoeiro</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
