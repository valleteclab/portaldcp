'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { io, Socket } from 'socket.io-client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Clock, TrendingDown, AlertTriangle, CheckCircle2,
  Send, RefreshCw, Trophy, ArrowDown
} from 'lucide-react'
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
  status: 'AGUARDANDO' | 'EM_DISPUTA' | 'ENCERRADO'
  tempoRestante: number
  emProrrogacao?: boolean
  melhorLance?: {
    valor: number
    fornecedorId: string
    fornecedorNome: string
  }
  meuMelhorLance?: number
  minhaPosicao?: number
  minhaPropostaInicial?: number
  totalPropostas: number
  totalLances: number
}

interface Sessao {
  id: string
  licitacaoId: string
  status: string
  modoDisputa: string
  suspensa: boolean
  licitacao?: { id: string; numero: string; objeto: string }
}

interface Mensagem {
  tipo: 'SISTEMA' | 'PREGOEIRO' | 'FORNECEDOR'
  remetente: string
  conteudo: string
  dataHora: Date
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================

export default function DisputaFornecedor() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const sessaoIdParam = searchParams.get('sessao')
  const licitacaoIdParam = searchParams.get('licitacao')
  
  // Estado para sessaoId (pode vir do param ou ser buscado via licitação)
  const [sessaoId, setSessaoId] = useState<string | null>(sessaoIdParam)

  // Estados
  const [sessao, setSessao] = useState<Sessao | null>(null)
  const [itens, setItens] = useState<ItemDisputa[]>([])
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [wsConectado, setWsConectado] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [fornecedor, setFornecedor] = useState<{ id: string; nome: string } | null>(null)

  // Lance
  const [itemSelecionado, setItemSelecionado] = useState<string | null>(null)
  const [valorLance, setValorLance] = useState('')
  const [enviandoLance, setEnviandoLance] = useState(false)
  const [erroLance, setErroLance] = useState<string | null>(null)

  // Refs
  const socketRef = useRef<Socket | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const enviandoLanceRef = useRef(false)

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

    // Buscar dados do fornecedor do localStorage
    const fornecedorData = localStorage.getItem('fornecedor')
    if (!fornecedorData) {
      setErro('Você precisa estar logado como fornecedor')
      setCarregando(false)
      return
    }

    const fornecedorParsed = JSON.parse(fornecedorData)
    setFornecedor({
      id: fornecedorParsed.id,
      nome: fornecedorParsed.razao_social || fornecedorParsed.nome || 'Fornecedor',
    })

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
        tipo: 'FORNECEDOR',
        usuarioId: fornecedorParsed.id,
        usuarioNome: fornecedorParsed.razao_social || fornecedorParsed.nome || 'Fornecedor',
      })
    })

    socket.on('disconnect', () => {
      console.log('[WS] Desconectado')
      setWsConectado(false)
    })

    // Tratamento de acesso negado (fornecedor sem proposta classificada)
    socket.on('acesso_negado', (data) => {
      console.error('[WS] Acesso negado:', data)
      setCarregando(false)
      alert(data.mensagem || 'Acesso negado à sala de disputa')
      // Redirecionar para página de licitações
      window.location.href = '/fornecedor/licitacoes'
    })

    socket.on('dados_iniciais', (data) => {
      console.log('[WS] Dados iniciais:', data)
      setSessao(data.sessao)
      
      // Combinar todos os itens
      const todosItens = [
        ...(data.itens.aguardando || []),
        ...(data.itens.emDisputa || []),
        ...(data.itens.encerrados || []),
      ]
      setItens(todosItens)
      setCarregando(false)
    })

    socket.on('itens_iniciados', (data) => {
      console.log('[WS] Itens iniciados:', data)
      const todosItens = [
        ...(data.itens.aguardando || []),
        ...(data.itens.emDisputa || []),
        ...(data.itens.encerrados || []),
      ]
      setItens(todosItens)
    })

    socket.on('item_encerrado', (data) => {
      console.log('[WS] Item encerrado:', data)
      const todosItens = [
        ...(data.itens.aguardando || []),
        ...(data.itens.emDisputa || []),
        ...(data.itens.encerrados || []),
      ]
      setItens(todosItens)
    })

    socket.on('novo_lance', (data) => {
      console.log('[WS] Novo lance:', data)
      const todosItens = [
        ...(data.itens.aguardando || []),
        ...(data.itens.emDisputa || []),
        ...(data.itens.encerrados || []),
      ]
      setItens(todosItens)
    })

    socket.on('sessao_suspensa', (data) => {
      console.log('[WS] Sessão suspensa:', data)
      setSessao(data.sessao)
    })

    socket.on('sessao_retomada', (data) => {
      console.log('[WS] Sessão retomada:', data)
      setSessao(data.sessao)
    })

    socket.on('nova_mensagem', (data) => {
      console.log('[WS] Nova mensagem:', data)
      setMensagens(prev => [data, ...prev])
    })

    socket.on('lance_confirmado', (data) => {
      console.log('[WS] Lance confirmado:', data)
      setEnviandoLance(false)
      enviandoLanceRef.current = false
      setValorLance('')
      setErroLance(null)
    })

    socket.on('erro', (data) => {
      console.error('[WS] Erro:', data)
      // Sempre tratar como erro de lance se estiver enviando (usa ref para valor atualizado)
      if (enviandoLanceRef.current) {
        setErroLance(data.mensagem || 'Erro ao enviar lance')
        setEnviandoLance(false)
        enviandoLanceRef.current = false
      } else {
        // Se não está enviando lance, pode ser erro de lance mesmo assim (verificar mensagem)
        const mensagem = data.mensagem || ''
        if (mensagem.toLowerCase().includes('lance')) {
          setErroLance(mensagem)
        } else {
          setErro(mensagem)
        }
      }
    })
    
    // Atualização de tempo do servidor (sincronização garantida)
    socket.on('tempo_atualizado', (data) => {
      if (data.itens && Array.isArray(data.itens)) {
        setItens(prev => prev.map(item => {
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

  const enviarLance = useCallback(() => {
    if (!socketRef.current || !itemSelecionado || !valorLance) return

    const valor = parseFloat(valorLance.replace(',', '.'))
    if (isNaN(valor) || valor <= 0) {
      setErroLance('Valor inválido')
      return
    }

    setEnviandoLance(true)
    enviandoLanceRef.current = true
    setErroLance(null)

    socketRef.current.emit('enviar_lance', {
      sessaoId,
      itemId: itemSelecionado,
      valor,
    })
  }, [sessaoId, itemSelecionado, valorLance])

  const formatarTempo = (segundos: number) => {
    const min = Math.floor(segundos / 60)
    const seg = segundos % 60
    return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`
  }

  const formatarMoeda = (valor: number) => {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
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

  const itensEmDisputa = itens.filter(i => i.status === 'EM_DISPUTA')
  const itensEncerrados = itens.filter(i => i.status === 'ENCERRADO')
  const itensAguardando = itens.filter(i => i.status === 'AGUARDANDO')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-green-800 text-white p-4">
        <div className="container mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Sala de Disputa - Fornecedor</h1>
            <p className="text-green-200 text-sm">
              {sessao?.licitacao?.numero} - {sessao?.licitacao?.objeto?.substring(0, 60)}...
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant={wsConectado ? 'default' : 'destructive'} className="bg-green-600">
              {wsConectado ? '● Online' : '○ Offline'}
            </Badge>
            {sessao?.suspensa && (
              <Badge variant="destructive">SESSÃO SUSPENSA</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="bg-white border-b p-3">
        <div className="container mx-auto flex items-center justify-between">
          <div className="text-sm text-gray-600">
            Logado como: <strong>{fornecedor?.nome}</strong>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-yellow-600">Aguardando: <strong>{itensAguardando.length}</strong></span>
            <span className="text-blue-600">Em disputa: <strong>{itensEmDisputa.length}</strong></span>
            <span className="text-green-600">Encerrados: <strong>{itensEncerrados.length}</strong></span>
          </div>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="container mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Lista de Itens */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Itens em Disputa</CardTitle>
              </CardHeader>
              <CardContent>
                {itensEmDisputa.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Clock className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>Nenhum item em disputa no momento</p>
                    <p className="text-sm">Aguarde o pregoeiro iniciar a disputa</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {itensEmDisputa.map(item => (
                      <div 
                        key={item.id}
                        className={`border rounded-lg p-4 cursor-pointer transition-all ${
                          itemSelecionado === item.id 
                            ? 'border-green-500 bg-green-50 ring-2 ring-green-200' 
                            : 'hover:border-gray-300'
                        }`}
                        onClick={() => setItemSelecionado(item.id)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-bold text-lg">Item {item.numero}</span>
                              <Badge className="bg-blue-600">
                                <Clock className="h-3 w-3 mr-1" />
                                {formatarTempo(item.tempoRestante)}
                              </Badge>
                              {item.minhaPosicao === 1 && (
                                <Badge className="bg-yellow-500">
                                  <Trophy className="h-3 w-3 mr-1" />
                                  1º Lugar
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mb-2">{item.descricao}</p>
                            <div className="text-sm text-gray-500">
                              {item.quantidade} {item.unidade} | Ref: {formatarMoeda(item.valorReferencia)}
                            </div>
                          </div>
                          
                          <div className="text-right">
                            {item.melhorLance && (
                              <div className="mb-2">
                                <div className="text-xs text-gray-500">Melhor lance</div>
                                <div className="font-bold text-green-600 text-lg">
                                  {formatarMoeda(item.melhorLance.valor)}
                                </div>
                              </div>
                            )}
                            {item.meuMelhorLance && (
                              <div>
                                <div className="text-xs text-gray-500">Meu lance</div>
                                <div className={`font-medium ${item.minhaPosicao === 1 ? 'text-yellow-600' : 'text-gray-700'}`}>
                                  {formatarMoeda(item.meuMelhorLance)}
                                  {item.minhaPosicao && (
                                    <span className="text-xs ml-1">({item.minhaPosicao}º)</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Itens Encerrados */}
                {itensEncerrados.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-medium text-gray-700 mb-3">Itens Encerrados</h3>
                    <div className="space-y-2">
                      {itensEncerrados.map(item => (
                        <div key={item.id} className="border rounded p-3 bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-medium">Item {item.numero}</span>
                              <Badge className="ml-2 bg-green-100 text-green-800">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                Encerrado
                              </Badge>
                            </div>
                            <div className="text-right">
                              {item.melhorLance && (
                                <div className="text-sm">
                                  Vencedor: {formatarMoeda(item.melhorLance.valor)}
                                  {item.minhaPosicao === 1 && (
                                    <Badge className="ml-2 bg-yellow-500">VOCÊ VENCEU!</Badge>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Painel de Lance */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingDown className="h-5 w-5" />
                  Enviar Lance
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!itemSelecionado ? (
                  <div className="text-center py-8 text-gray-500">
                    <ArrowDown className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p>Selecione um item para dar lance</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {(() => {
                      const item = itens.find(i => i.id === itemSelecionado)
                      if (!item) return null

                      return (
                        <>
                          <div className="bg-gray-50 p-3 rounded">
                            <div className="font-medium">Item {item.numero}</div>
                            <div className="text-sm text-gray-600 line-clamp-2">{item.descricao}</div>
                          </div>

                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-blue-50 p-2 rounded">
                              <div className="text-blue-600 text-xs">Valor Referência</div>
                              <div className="font-medium">{formatarMoeda(item.valorReferencia)}</div>
                            </div>
                            <div className="bg-green-50 p-2 rounded">
                              <div className="text-green-600 text-xs">Melhor Lance</div>
                              <div className="font-medium">
                                {item.melhorLance ? formatarMoeda(item.melhorLance.valor) : '-'}
                              </div>
                            </div>
                          </div>

                          {/* Minha Proposta Inicial */}
                          {item.minhaPropostaInicial && (
                            <div className="bg-blue-50 p-2 rounded text-sm">
                              <div className="text-blue-600 text-xs">Minha Proposta Inicial</div>
                              <div className="font-medium text-blue-700">
                                {formatarMoeda(item.minhaPropostaInicial)}
                              </div>
                            </div>
                          )}

                          {/* Meu Melhor Lance */}
                          {item.meuMelhorLance && (
                            <div className="bg-yellow-50 p-2 rounded text-sm">
                              <div className="text-yellow-600 text-xs">Meu Melhor Lance</div>
                              <div className="font-medium">
                                {formatarMoeda(item.meuMelhorLance)} {item.minhaPosicao && `(${item.minhaPosicao}º lugar)`}
                              </div>
                            </div>
                          )}

                          <div>
                            <label className="text-sm font-medium">Valor do Lance (R$)</label>
                            <Input 
                              type="text"
                              placeholder="0,00"
                              value={valorLance}
                              onChange={(e) => setValorLance(e.target.value)}
                              onKeyPress={(e) => e.key === 'Enter' && enviarLance()}
                              className="mt-1 text-lg font-medium"
                              disabled={sessao?.suspensa || item.status !== 'EM_DISPUTA'}
                            />
                            <div className="text-xs text-gray-500 mt-1 space-y-1">
                              {item.melhorLance && (
                                <p>Lance deve ser menor que <strong>{formatarMoeda(item.melhorLance.valor)}</strong> (melhor lance atual)</p>
                              )}
                              {item.meuMelhorLance && item.meuMelhorLance !== item.minhaPropostaInicial && (
                                <p>Seu último lance: <strong>{formatarMoeda(item.meuMelhorLance)}</strong></p>
                              )}
                            </div>
                          </div>

                          {erroLance && (
                            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
                              <strong>Erro:</strong> {erroLance}
                            </div>
                          )}

                          <Button 
                            className="w-full bg-green-600 hover:bg-green-700"
                            onClick={enviarLance}
                            disabled={!valorLance || enviandoLance || sessao?.suspensa || item.status !== 'EM_DISPUTA'}
                          >
                            {enviandoLance ? (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <Send className="h-4 w-4 mr-2" />
                            )}
                            {enviandoLance ? 'Enviando...' : 'Enviar Lance'}
                          </Button>

                          {sessao?.suspensa && (
                            <div className="bg-orange-50 text-orange-600 p-2 rounded text-sm text-center">
                              <AlertTriangle className="h-4 w-4 inline mr-1" />
                              Sessão suspensa - lances desabilitados
                            </div>
                          )}
                        </>
                      )
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Mensagens */}
            <Card className="mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Mensagens do Pregoeiro</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-48">
                  <div className="space-y-2">
                    {mensagens.filter(m => m.tipo !== 'FORNECEDOR').map((msg, idx) => (
                      <div 
                        key={idx}
                        className={`p-2 rounded text-xs ${
                          msg.tipo === 'SISTEMA' 
                            ? 'bg-gray-100 text-gray-600' 
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        <div className="font-medium mb-1">
                          {msg.remetente} - {new Date(msg.dataHora).toLocaleTimeString()}
                        </div>
                        {msg.conteudo}
                      </div>
                    ))}
                    {mensagens.length === 0 && (
                      <p className="text-center text-gray-400 text-xs py-4">
                        Nenhuma mensagem
                      </p>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
