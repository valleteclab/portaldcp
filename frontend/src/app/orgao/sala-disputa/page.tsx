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
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Ban,
  RotateCcw
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

import { API_URL, authFetch } from '@/lib/api'
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000'

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
  status: 'EM_DISPUTA' | 'AGUARDANDO' | 'ENCERRADO' | 'TEMPO_ALEATORIO' | 'NEGOCIACAO'
  loteId?: string
  loteNumero?: number
}

interface Lote {
  id: string
  numero: number
  descricao: string
  valorTotalEstimado: number
  melhorLance: number | null
  melhorFornecedor: string | null
  totalParticipantes: number
  tempoRestante: number
  emTempoAleatorio: boolean
  status: 'EM_DISPUTA' | 'AGUARDANDO' | 'ENCERRADO' | 'TEMPO_ALEATORIO' | 'NEGOCIACAO'
  itens: Item[]
}

interface SessaoInfo {
  id: string
  status: string
  etapa: string
  itemAtualId: string | null
  disputaPorItem: boolean  // true = por item, false = por lote
  modoAberto: boolean
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

// Função para obter dados do usuário logado (pregoeiro/órgão)
function getUsuarioLogado(): { id: string; nome: string; email: string } | null {
  if (typeof window === 'undefined') return null
  try {
    // Primeiro tenta buscar usuário do órgão
    const usuarioStr = localStorage.getItem('usuario')
    if (usuarioStr) {
      const usuario = JSON.parse(usuarioStr)
      return {
        id: usuario.id,
        nome: usuario.nome || usuario.email,
        email: usuario.email
      }
    }
    
    // Fallback para dados do órgão
    const orgaoStr = localStorage.getItem('orgao')
    if (orgaoStr) {
      const orgao = JSON.parse(orgaoStr)
      return {
        id: orgao.id,
        nome: orgao.responsavel_nome || orgao.nome,
        email: orgao.email || ''
      }
    }
    
    // Fallback para 'user' (compatibilidade)
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
  
  // Limpar cache ao carregar a página
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Limpar possíveis sessões inválidas
      localStorage.removeItem('sessaoSelecionada')
      localStorage.removeItem('ultimaSessao')
      console.log('Cache limpo ao carregar página')
    }
  }, [])
  
  const [usuario, setUsuario] = useState<{ id: string; nome: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [abaAtiva, setAbaAtiva] = useState('em_disputa')
  
  // Sessões ativas
  const [sessoes, setSessoes] = useState<Sessao[]>([])
  const [sessaoSelecionada, setSessaoSelecionada] = useState<string | null>(null)
  
  // Itens da sessão selecionada
  const [itens, setItens] = useState<Item[]>([])
  const [itemExpandido, setItemExpandido] = useState<string | null>(null)
  const [itensSelecionados, setItensSelecionados] = useState<string[]>([])
  
  // Lotes (quando disputa é por lote)
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loteExpandido, setLoteExpandido] = useState<string | null>(null)
  
  // Tipo de disputa
  const [disputaPorItem, setDisputaPorItem] = useState(true)
  const [modoDisputa, setModoDisputa] = useState<'ABERTO' | 'FECHADO' | 'ABERTO_FECHADO' | 'FECHADO_ABERTO'>('ABERTO')
  const [sessao, setSessao] = useState<any>(null)
  
  // Lances do item/lote expandido
  const [lances, setLances] = useState<Lance[]>([])
  
  // Mensagens
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [novaMensagem, setNovaMensagem] = useState('')
  const [chatHabilitado, setChatHabilitado] = useState(true)
  
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
      router.push('/orgao-login')
      return
    }
    
    // Verificar se há uma sessão pré-selecionada
    const sessaoPreSelecionada = localStorage.getItem('sessao_disputa_selecionada')
    if (sessaoPreSelecionada) {
      console.log('Sessão pré-selecionada encontrada:', sessaoPreSelecionada)
      // Verificar se é um ID de licitação (errado) ou de sessão (certo)
      if (sessaoPreSelecionada === '12d17589-20a0-4af6-9169-7d105b3f001c') {
        console.log('ID de licitação detectado, ignorando...')
        localStorage.removeItem('sessao_disputa_selecionada')
      } else {
        setSessaoSelecionada(sessaoPreSelecionada)
        localStorage.removeItem('sessao_disputa_selecionada')
      }
    }
  }, [router])

  // Carregar sessões ativas do órgão
  useEffect(() => {
    if (!usuario) return
    
    const carregarSessoes = async () => {
      try {
        // Primeiro tenta buscar sessões ativas do pregoeiro
        let res = await authFetch(`${API_URL}/api/sessao/pregoeiro/${usuario.id}/sessoes-ativas`)
        
        if (res.ok) {
          const data = await res.json()
          if (data.sessoes && data.sessoes.length > 0) {
            setSessoes(data.sessoes)
            // Selecionar automaticamente a primeira sessão ativa
            const sessaoAtiva = data.sessoes.find((s: Sessao) => 
              s.status === 'EM_ANDAMENTO' || s.status === 'MODO_ABERTO'
            ) || data.sessoes[0]
                        setSessaoSelecionada(sessaoAtiva.id)
            setLoading(false)
            return
          }
        }
        
        // Fallback: buscar licitações em fase de disputa do órgão
        const orgaoData = localStorage.getItem('orgao')
        if (orgaoData) {
          const orgao = JSON.parse(orgaoData)
          const licRes = await authFetch(`${API_URL}/api/licitacoes?orgao_id=${orgao.id}`)
          if (licRes.ok) {
            const licitacoes = await licRes.json()
            // Filtrar licitações em fase de disputa
            const emDisputa = licitacoes.filter((l: any) => 
              ['EM_DISPUTA', 'DISPUTA', 'ANALISE_PROPOSTAS'].includes(l.fase)
            )
            
            // Para cada licitação em disputa, buscar a sessão
            const sessoesPromises = emDisputa.map(async (lic: any) => {
              try {
                const sessaoRes = await authFetch(`${API_URL}/api/sessao/licitacao/${lic.id}`)
                if (sessaoRes.ok) {
                  const sessao = await sessaoRes.json()
                  return {
                    id: sessao.id,
                    licitacaoId: lic.id,
                    numero: lic.numero_processo,
                    orgao: orgao.nome,
                    objeto: lic.objeto,
                    status: sessao.status,
                    etapa: sessao.etapa,
                    totalItens: 0,
                    itensEncerrados: 0
                  }
                }
              } catch (e) {
                return null
              }
              return null
            })
            
            const sessoesResolvidas = (await Promise.all(sessoesPromises)).filter(Boolean) as Sessao[]
            setSessoes(sessoesResolvidas)
            
            // Selecionar automaticamente a primeira sessão ativa
            if (sessoesResolvidas.length > 0) {
              console.log('Sessões encontradas:', sessoesResolvidas.map(s => ({ id: s.id, status: s.status })))
              const sessaoAtiva = sessoesResolvidas.find(s => 
                s.status === 'EM_ANDAMENTO' || s.status === 'MODO_ABERTO'
              ) || sessoesResolvidas[0]
              console.log('Selecionando sessão:', sessaoAtiva.id)
              setSessaoSelecionada(sessaoAtiva.id)
            } else {
              console.log('Nenhuma sessão encontrada')
              setSessaoSelecionada(null)
            }
          }
        }
        
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
    // Limpar sessão inválida do localStorage se existir
    if (typeof window !== 'undefined') {
      const sessaoSalva = localStorage.getItem('sessaoSelecionada')
      if (sessaoSalva && sessaoSalva === '12d17589-20a0-4af6-9169-7d105b3f001c') {
        console.log('Removendo sessão inválida do localStorage')
        localStorage.removeItem('sessaoSelecionada')
      }
    }
    
    if (!sessaoSelecionada || !usuario) return
    
    const carregarItens = async () => {
      try {
        console.log('Buscando itens da sessão:', sessaoSelecionada)
        const res = await authFetch(`${API_URL}/api/sessao/${sessaoSelecionada}/itens/pregoeiro`)
        if (!res.ok) {
          const errorText = await res.text()
          console.error('Erro HTTP ao buscar itens:', res.status, errorText)
          throw new Error(`Erro ao buscar itens: ${res.status}`)
        }
        const data = await res.json()
        console.log('Itens recebidos:', data.itens?.length || 0, data.itens)
        console.log('Status detalhado dos itens:', data.itens?.map((i: any) => ({
          numero: i.numero,
          status: i.status,
          descricao: i.descricao?.substring(0, 50) + '...'
        })))
        console.log('Lotes recebidos:', data.lotes?.length || 0, data.lotes)
        setItens(data.itens || [])
        
        // Configurar tipo de disputa e lotes
        if (data.sessao) {
          setDisputaPorItem(data.sessao.disputaPorItem !== false)
          setModoDisputa(data.sessao.modoDisputa || 'ABERTO')
          setSessao(data.sessao)
        }
        if (data.lotes && data.lotes.length > 0) {
          setLotes(data.lotes)
        }
      } catch (error) {
        console.error('Erro ao carregar itens:', error)
        // Não limpar itens em caso de erro temporário
      }
    }
    
    const carregarMensagens = async () => {
      try {
        const res = await authFetch(`${API_URL}/api/sessao/${sessaoSelecionada}/mensagens`)
        if (!res.ok) {
          throw new Error('Erro ao buscar mensagens')
        }
        const data = await res.json()
        // Mesclar mensagens do servidor com mensagens locais (sistema)
        setMensagens(prev => {
          const mensagensServidor = data.mensagens || []
          const mensagensSistema = prev.filter(m => m.tipo === 'SISTEMA')
          // Combinar e ordenar por horário
          const todasMensagens = [...mensagensServidor, ...mensagensSistema]
          // Remover duplicatas por ID
          const uniqueMensagens = todasMensagens.reduce((acc: typeof todasMensagens, msg) => {
            if (!acc.find(m => m.id === msg.id)) {
              acc.push(msg)
            }
            return acc
          }, [])
          return uniqueMensagens
        })
      } catch (error) {
        console.error('Erro ao carregar mensagens:', error)
      }
    }
    
    carregarItens()
    carregarMensagens()
    
    const intervalItens = setInterval(carregarItens, 2000)
    const intervalMensagens = setInterval(carregarMensagens, 5000)
    
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
        console.log('Carregando lances do item:', itemExpandido)
        const res = await authFetch(`${API_URL}/api/sessao/item/${itemExpandido}/lances/pregoeiro`)
        if (!res.ok) {
          // Se for 404, pode ser que não há lances ainda - não é erro crítico
          if (res.status === 404) {
            console.log('Nenhum lance encontrado para o item')
            setLances([])
            return
          }
          const errorText = await res.text()
          console.error('Erro HTTP ao buscar lances:', res.status, errorText)
          setLances([])
          return
        }
        const data = await res.json()
        console.log('Lances recebidos:', data.lances?.length || 0)
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
  // CRONÔMETRO REAL - Decrementa a cada segundo
  // ========================================
  useEffect(() => {
    // Só roda se tiver itens em disputa
    const sessaoAtual = sessoes.find(s => s.id === sessaoSelecionada)
    console.log('Status dos itens:', itens.map(i => ({ id: i.id, numero: i.numero, status: i.status })))
    console.log('Itens EM_DISPUTA:', itens.filter(i => i.status === 'EM_DISPUTA' || i.status === 'TEMPO_ALEATORIO').length)
    console.log('Itens AGUARDANDO:', itens.filter(i => i.status === 'AGUARDANDO').length)
    console.log('Itens ENCERRADOS:', itens.filter(i => i.status === 'ENCERRADO').length)
    const itensEmDisputa = itens.filter(i => i.status === 'EM_DISPUTA' || i.status === 'TEMPO_ALEATORIO')
    const lotesEmDisputa = lotes.filter(l => l.status === 'EM_DISPUTA' || l.status === 'TEMPO_ALEATORIO')
    
    if (itensEmDisputa.length === 0 && lotesEmDisputa.length === 0) return

    const timer = setInterval(() => {
      // Decrementa tempo dos itens
      setItens(prevItens => prevItens.map(item => {
        if (item.status === 'EM_DISPUTA' || item.status === 'TEMPO_ALEATORIO') {
          const novoTempo = Math.max(0, item.tempoRestante - 1)
          return { ...item, tempoRestante: novoTempo }
        }
        return item
      }))

      // Decrementa tempo dos lotes
      setLotes(prevLotes => prevLotes.map(lote => {
        if (lote.status === 'EM_DISPUTA' || lote.status === 'TEMPO_ALEATORIO') {
          const novoTempo = Math.max(0, lote.tempoRestante - 1)
          return { ...lote, tempoRestante: novoTempo }
        }
        return lote
      }))
    }, 1000)

    return () => clearInterval(timer)
  }, [itens.length, lotes.length, itens.filter(i => i.status === 'EM_DISPUTA').length])

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

    socket.on('chat_status', (data) => {
      console.log('[WS] Chat status:', data)
      setChatHabilitado(data.habilitado)
      setMensagens(prev => [...prev, {
        id: Date.now().toString(),
        tipo: 'SISTEMA',
        remetente: 'Sistema',
        mensagem: data.mensagem,
        horario: new Date().toLocaleTimeString('pt-BR'),
        destaque: true
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

    socket.on('disputa_reiniciada', (data) => {
      console.log('[WS] Disputa reiniciada:', data)
      // Recarregar itens para mostrar todos como AGUARDANDO
      if (sessaoSelecionada) {
        authFetch(`${API_URL}/api/sessao/${sessaoSelecionada}/itens/pregoeiro`)
          .then(res => res.json())
          .then(data => {
            setItens(data.itens || [])
            setItensSelecionados([])
          })
          .catch(error => {
            console.error('Erro ao recarregar itens:', error)
          })
      }
    })

    socket.on('itens_selecionados_iniciados', (data) => {
      console.log('[WS] Itens selecionados iniciados:', data)
      // Recarregar itens para mostrar os que foram iniciados
      if (sessaoSelecionada) {
        authFetch(`${API_URL}/api/sessao/${sessaoSelecionada}/itens/pregoeiro`)
          .then(res => res.json())
          .then(data => {
            setItens(data.itens || [])
            setItensSelecionados([])
          })
          .catch(error => {
            console.error('Erro ao recarregar itens:', error)
          })
      }
    })

    socket.on('item_encerrado', (data) => {
      console.log('[WS] Item encerrado:', data)
      // Recarregar itens para atualizar status
      if (sessaoSelecionada) {
        authFetch(`${API_URL}/api/sessao/${sessaoSelecionada}/itens/pregoeiro`)
          .then(res => res.json())
          .then(data => {
            setItens(data.itens || [])
          })
          .catch(error => {
            console.error('Erro ao recarregar itens:', error)
          })
      }
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

  const handleEncerrarItem = useCallback((itemId?: string) => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return

    socketRef.current.emit('encerrar_item', {
      sessaoId: sessaoSelecionada,
      itemId
    })
  }, [wsConectado, sessaoSelecionada])

  // Iniciar TODOS os itens simultaneamente
  const handleIniciarTodosItens = useCallback(() => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return

    socketRef.current.emit('iniciar_todos_itens', {
      sessaoId: sessaoSelecionada
    })
  }, [wsConectado, sessaoSelecionada])

  // Iniciar itens selecionados
  const handleIniciarItensSelecionados = useCallback(() => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return
    if (itensSelecionados.length === 0) {
      alert('Selecione pelo menos um item para iniciar a disputa')
      return
    }

    socketRef.current.emit('iniciar_itens_selecionados', {
      sessaoId: sessaoSelecionada,
      itensIds: itensSelecionados
    })
  }, [wsConectado, sessaoSelecionada, itensSelecionados])

  const handleSuspenderSessao = useCallback((motivo: string) => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return

    socketRef.current.emit('suspender_sessao', {
      sessaoId: sessaoSelecionada,
      motivo
    })
  }, [wsConectado, sessaoSelecionada])

  // Alterar fase da sessão
  const handleAlterarFase = useCallback((novaEtapa: string, novoStatus?: string, motivo?: string) => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return

    socketRef.current.emit('alterar_fase', {
      sessaoId: sessaoSelecionada,
      novaEtapa,
      novoStatus,
      motivo
    })
  }, [wsConectado, sessaoSelecionada])

  // Reiniciar disputa (reseta todos os itens)
  const handleReiniciarDisputa = useCallback((motivo?: string) => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return

    socketRef.current.emit('reiniciar_disputa', {
      sessaoId: sessaoSelecionada,
      motivo
    })
  }, [wsConectado, sessaoSelecionada])

  const handleCancelarLance = useCallback((lanceId: string, itemId: string) => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return
    
    const justificativa = prompt('Informe a justificativa para cancelar o lance:')
    if (!justificativa) return

    socketRef.current.emit('cancelar_lance', {
      sessaoId: sessaoSelecionada,
      itemId,
      lanceId,
      justificativa
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

  const handleToggleChat = useCallback(() => {
    if (!socketRef.current || !wsConectado || !sessaoSelecionada) return
    
    const novoStatus = !chatHabilitado
    socketRef.current.emit('toggle_chat', {
      sessaoId: sessaoSelecionada,
      habilitado: novoStatus
    })
    setChatHabilitado(novoStatus)
  }, [wsConectado, sessaoSelecionada, chatHabilitado])

  const getStatusBadge = (item: Item) => {
    if (item.status === 'EM_DISPUTA') return <Badge className="bg-red-100 text-red-800">Em Disputa</Badge>
    if (item.status === 'ENCERRADO') return <Badge className="bg-green-100 text-green-800">Encerrado</Badge>
    return <Badge className="bg-gray-100 text-gray-800">Aguardando</Badge>
  }

  const handleReabrirSessao = async (sessaoId: string) => {
    if (!confirm('Deseja reabrir esta sessão de disputa?')) return
    
    try {
      const res = await authFetch(`${API_URL}/api/sessao/${sessaoId}/reabrir`, {
        method: 'PUT'
      })
      
      if (res.ok) {
        alert('Sessão reaberta com sucesso!')
        window.location.reload()
      } else {
        const error = await res.json()
        alert(`Erro ao reabrir sessão: ${error.message}`)
      }
    } catch (error) {
      console.error('Erro ao reabrir sessão:', error)
      alert('Erro ao reabrir sessão')
    }
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
      {/* Header Principal */}
      <header className="bg-gradient-to-r from-blue-900 to-blue-800 text-white sticky top-0 z-50 shadow-lg">
        <div className="max-w-full mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            {/* Esquerda - Logo e Navegação */}
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" className="text-white hover:bg-blue-700" onClick={() => router.push('/orgao')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <Gavel className="h-6 w-6 text-yellow-400" />
                <div>
                  <h1 className="text-lg font-bold">Sala de Disputa</h1>
                  <p className="text-xs text-blue-200">Pregoeiro</p>
                </div>
              </div>
            </div>

            {/* Centro - Cronômetro Grande (quando há item em disputa) */}
            {itens.some(i => i.status === 'EM_DISPUTA') && (
              <div className="flex items-center gap-4">
                <div className={`px-6 py-2 rounded-lg ${
                  itens.find(i => i.status === 'EM_DISPUTA')?.emTempoAleatorio 
                    ? 'bg-red-600 animate-pulse' 
                    : itens.find(i => i.status === 'EM_DISPUTA')?.tempoRestante && itens.find(i => i.status === 'EM_DISPUTA')!.tempoRestante < 60
                    ? 'bg-yellow-600'
                    : 'bg-blue-700'
                }`}>
                  <div className="flex items-center gap-3">
                    <Clock className="h-6 w-6" />
                    <div>
                      <div className="text-3xl font-mono font-bold">
                        {formatarTempo(itens.find(i => i.status === 'EM_DISPUTA')?.tempoRestante || 0)}
                      </div>
                      <div className="text-xs text-center">
                        {itens.find(i => i.status === 'EM_DISPUTA')?.emTempoAleatorio 
                          ? '⚠️ TEMPO ALEATÓRIO' 
                          : 'Tempo restante'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {/* Direita - Status e Usuário */}
            <div className="flex items-center gap-4">
              {/* Fornecedores Online */}
              <div className="flex items-center gap-2 bg-blue-700/50 px-3 py-1 rounded-full">
                <Users className="h-4 w-4" />
                <span className="text-sm font-medium">{sessaoAtual?.fornecedoresOnline || 0} online</span>
              </div>
              
              {/* Indicador de conexão */}
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${wsConectado ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
                <span className="text-sm">{wsConectado ? 'Conectado' : 'Desconectado'}</span>
              </div>
              
              {/* Usuário */}
              <div className="text-sm bg-blue-700/50 px-3 py-1 rounded-full">
                <span className="font-medium">{usuario?.nome}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Barra de Status da Sessão */}
        {sessaoAtual && (
          <div className="bg-blue-950/50 border-t border-blue-700">
            <div className="max-w-full mx-auto px-4 py-2">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <span className="text-blue-200">
                    <strong className="text-white">{sessaoAtual.numero}</strong> - {sessaoAtual.orgao}
                  </span>
                  <Badge className="bg-yellow-500 text-yellow-900">
                    {sessaoAtual.etapa?.replace(/_/g, ' ') || 'EM DISPUTA'}
                  </Badge>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-blue-200">
                    Itens: <strong className="text-white">{itens.filter(i => i.status === 'ENCERRADO').length}/{itens.length}</strong>
                  </span>
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    className="text-blue-200 hover:text-white hover:bg-blue-700"
                    onClick={() => router.push(`/orgao/licitacoes/${sessaoAtual.licitacaoId}`)}
                  >
                    Ver Licitação
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="max-w-full mx-auto px-4 py-4">
        {sessoes.length === 0 ? (
          <Card className="p-8 text-center">
            <Gavel className="h-16 w-16 mx-auto mb-4 text-gray-300" />
            <h2 className="text-xl font-semibold text-gray-700 mb-2">Nenhuma sessão ativa</h2>
            <p className="text-gray-500 mb-4">Você não possui sessões de disputa em andamento.</p>
            <p className="text-sm text-gray-400 mb-4">
              Para iniciar uma disputa, acesse a licitação desejada e clique em "Sala de Disputa".
            </p>
            <Button onClick={() => router.push('/orgao/licitacoes')}>
              Ver Licitações
            </Button>
          </Card>
        ) : sessoes.some(s => s.status === 'ENCERRADA' || s.status === 'SUSPENSA') && !sessoes.some(s => s.status === 'EM_ANDAMENTO' || s.status === 'MODO_ABERTO') ? (
          <Card className="p-8">
            <div className="text-center mb-6">
              <Gavel className="h-16 w-16 mx-auto mb-4 text-yellow-500" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Sessões Encerradas</h2>
              <p className="text-gray-500">As sessões abaixo estão encerradas. Você pode reabri-las se necessário.</p>
            </div>
            <div className="space-y-3">
              {sessoes.filter(s => s.status === 'ENCERRADA' || s.status === 'SUSPENSA').map(sessao => (
                <div key={sessao.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
                  <div>
                    <div className="font-medium">{sessao.numero}</div>
                    <div className="text-sm text-gray-500">{sessao.objeto?.substring(0, 60)}...</div>
                    <Badge className={sessao.status === 'ENCERRADA' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'}>
                      {sessao.status === 'ENCERRADA' ? 'Encerrada' : 'Suspensa'}
                    </Badge>
                  </div>
                  <Button onClick={() => handleReabrirSessao(sessao.id)} className="bg-blue-600 hover:bg-blue-700">
                    <Play className="h-4 w-4 mr-2" /> Reabrir Sessão
                  </Button>
                </div>
              ))}
            </div>
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

              {/* Painel de Controles da Disputa */}
              <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    {/* Ações da Disputa */}
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-blue-800">
                        {disputaPorItem ? 'Disputa por Item - ' : 'Disputa por Lote - '}
                        {modoDisputa === 'ABERTO' && 'Modo Aberto'}
                        {modoDisputa === 'FECHADO' && 'Modo Fechado'}
                        {modoDisputa === 'ABERTO_FECHADO' && 'Modo Aberto-Fechado'}
                        {modoDisputa === 'FECHADO_ABERTO' && 'Modo Fechado-Aberto'}
                      </span>
                      
                      {/* Botão principal: Iniciar disputa */}
                      {itens.some(i => i.status === 'AGUARDANDO') && !itens.some(i => i.status === 'EM_DISPUTA') && (
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={handleIniciarTodosItens}>
                          <Play className="h-4 w-4 mr-1" /> 
                          {disputaPorItem 
                            ? `Iniciar Disputa (${itens.filter(i => i.status === 'AGUARDANDO').length} Itens)`
                            : `Iniciar Disputa (${lotes.filter(l => l.status === 'AGUARDANDO').length} Lotes)`
                          }
                        </Button>
                      )}

                      {/* Iniciar item/lote individual (quando já tem em disputa) */}
                      {itens.some(i => i.status === 'AGUARDANDO') && itens.some(i => i.status === 'EM_DISPUTA') && disputaPorItem && (
                        <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => {
                          const itemAguardando = itens.find(i => i.status === 'AGUARDANDO')
                          if (itemAguardando) handleIniciarItem(itemAguardando.id)
                        }}>
                          <Play className="h-4 w-4 mr-1" /> Adicionar Item à Disputa
                        </Button>
                      )}
                      
                      {/* Indicador de itens/lotes em disputa */}
                      {disputaPorItem ? (
                        itens.filter(i => i.status === 'EM_DISPUTA').length > 0 && (
                          <span className="text-sm text-green-700 bg-green-100 px-2 py-1 rounded">
                            {itens.filter(i => i.status === 'EM_DISPUTA').length} item(ns) em disputa
                          </span>
                        )
                      ) : (
                        lotes.filter(l => l.status === 'EM_DISPUTA').length > 0 && (
                          <span className="text-sm text-green-700 bg-green-100 px-2 py-1 rounded">
                            {lotes.filter(l => l.status === 'EM_DISPUTA').length} lote(s) em disputa
                          </span>
                        )
                      )}
                    </div>

                    {/* Controles da Sessão */}
                    <div className="flex items-center gap-2">
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

                      {/* Menu de Controle de Fases */}
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="border-blue-600 text-blue-700">
                            <RotateCcw className="h-4 w-4 mr-1" /> Controle de Fases
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="max-w-md">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Controle de Fases da Sessão</AlertDialogTitle>
                            <AlertDialogDescription>
                              Selecione a ação desejada. Use com cautela - estas ações afetam toda a sessão.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <div className="space-y-3 py-4">
                            <Button 
                              className="w-full justify-start bg-green-600 hover:bg-green-700"
                              onClick={() => {
                                handleAlterarFase('DISPUTA_LANCES', 'MODO_ABERTO')
                              }}
                            >
                              <Play className="h-4 w-4 mr-2" /> Voltar para Disputa de Lances
                            </Button>
                            <Button 
                              className="w-full justify-start bg-blue-600 hover:bg-blue-700"
                              onClick={() => {
                                handleAlterarFase('NEGOCIACAO', 'EM_ANDAMENTO')
                              }}
                            >
                              <MessageSquare className="h-4 w-4 mr-2" /> Ir para Negociação
                            </Button>
                            <Button 
                              className="w-full justify-start bg-purple-600 hover:bg-purple-700"
                              onClick={() => {
                                handleAlterarFase('CONVOCACAO_HABILITACAO', 'EM_ANDAMENTO')
                              }}
                            >
                              <Users className="h-4 w-4 mr-2" /> Ir para Habilitação
                            </Button>
                            <hr className="my-2" />
                            <Button 
                              variant="destructive"
                              className="w-full justify-start"
                              onClick={() => {
                                if (confirm('Tem certeza? Isso vai resetar TODOS os itens para "Aguardando".')) {
                                  handleReiniciarDisputa('Reinício manual pelo pregoeiro')
                                }
                              }}
                            >
                              <RotateCcw className="h-4 w-4 mr-2" /> Reiniciar Disputa (Reset Total)
                            </Button>
                          </div>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Fechar</AlertDialogCancel>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Abas de Status */}
              <Tabs value={abaAtiva} onValueChange={setAbaAtiva}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="em_disputa" className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full"></span>
                    Em Disputa ({disputaPorItem 
                      ? itens.filter(i => i.status === 'EM_DISPUTA' || i.status === 'TEMPO_ALEATORIO').length
                      : lotes.filter(l => l.status === 'EM_DISPUTA' || l.status === 'TEMPO_ALEATORIO').length
                    })
                  </TabsTrigger>
                  <TabsTrigger value="aguardando">
                    Aguardando ({disputaPorItem 
                      ? itens.filter(i => i.status === 'AGUARDANDO').length
                      : lotes.filter(l => l.status === 'AGUARDANDO').length
                    })
                  </TabsTrigger>
                  <TabsTrigger value="encerrados">
                    Encerrados ({disputaPorItem 
                      ? itens.filter(i => i.status === 'ENCERRADO').length
                      : lotes.filter(l => l.status === 'ENCERRADO').length
                    })
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="em_disputa" className="mt-4">
                  <Card>
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-16">{disputaPorItem ? 'Item' : 'Lote'}</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">{disputaPorItem ? 'Melhor Lance' : 'Valor Total'}</TableHead>
                          <TableHead className="text-center">Participantes</TableHead>
                          <TableHead className="text-center">Tempo</TableHead>
                          <TableHead className="text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Renderiza LOTES quando disputa é por lote */}
                        {!disputaPorItem && lotes.filter(l => l.status === 'EM_DISPUTA').map(lote => (
                          <React.Fragment key={lote.id}>
                            <TableRow 
                              className={`cursor-pointer hover:bg-gray-50 ${lote.emTempoAleatorio ? 'bg-red-50' : ''}`}
                              onClick={() => setLoteExpandido(loteExpandido === lote.id ? null : lote.id)}
                            >
                              <TableCell>
                                <span className="font-medium">Lote {lote.numero}</span>
                              </TableCell>
                              <TableCell>
                                <div className="max-w-xs truncate text-sm" title={lote.descricao}>
                                  {lote.descricao}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {lote.itens.length} itens • Ref: {formatarMoeda(lote.valorTotalEstimado)}
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="font-mono font-medium text-green-700">
                                  {lote.melhorLance ? formatarMoeda(lote.melhorLance) : '-'}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {lote.melhorFornecedor || '-'}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="outline">{lote.totalParticipantes}</Badge>
                              </TableCell>
                              <TableCell className="text-center">
                                <div className={`font-mono font-medium ${
                                  lote.emTempoAleatorio ? 'text-red-600 animate-pulse' : 
                                  lote.tempoRestante < 60 ? 'text-yellow-600' : 'text-gray-700'
                                }`}>
                                  {formatarTempo(lote.tempoRestante)}
                                </div>
                                {lote.emTempoAleatorio && (
                                  <div className="text-xs text-red-600">ALEATÓRIO</div>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Button 
                                  variant="ghost" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setLoteExpandido(loteExpandido === lote.id ? null : lote.id)
                                  }}
                                >
                                  {loteExpandido === lote.id ? (
                                    <ChevronUp className="h-4 w-4" />
                                  ) : (
                                    <ChevronDown className="h-4 w-4" />
                                  )}
                                </Button>
                              </TableCell>
                            </TableRow>
                            
                            {loteExpandido === lote.id && (
                              <TableRow>
                                <TableCell colSpan={6} className="bg-gray-50 p-4">
                                  <div className="space-y-4">
                                    <div className="bg-white p-4 rounded-lg border">
                                      <h4 className="font-medium mb-2">Itens do Lote</h4>
                                      <Table>
                                        <TableHeader>
                                          <TableRow>
                                            <TableHead className="w-16">Item</TableHead>
                                            <TableHead>Descrição</TableHead>
                                            <TableHead className="text-right">Qtd</TableHead>
                                            <TableHead className="text-right">Valor Unit.</TableHead>
                                          </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                          {lote.itens.map(item => (
                                            <TableRow key={item.id}>
                                              <TableCell>{item.numero}</TableCell>
                                              <TableCell className="text-sm">{item.descricao}</TableCell>
                                              <TableCell className="text-right">{item.quantidade} {item.unidade}</TableCell>
                                              <TableCell className="text-right font-mono">{formatarMoeda(item.valorReferencia)}</TableCell>
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
                        
                        {/* Renderiza ITENS quando disputa é por item */}
                        {disputaPorItem && itens.filter(i => i.status === 'EM_DISPUTA' || i.status === 'TEMPO_ALEATORIO').map(item => (
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
                                      handleEncerrarItem(item.id)
                                    }}
                                    className="text-red-600 border-red-300"
                                    title="Encerrar disputa deste item"
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
                                                <Button 
                                                  variant="ghost" 
                                                  size="sm" 
                                                  className="text-red-600"
                                                  onClick={() => handleCancelarLance(lance.id, item.id)}
                                                  title="Cancelar lance"
                                                >
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
                    {itensSelecionados.length > 0 && (
                      <div className="p-3 bg-blue-50 border-b flex items-center justify-between">
                        <span className="text-sm text-blue-700">
                          {itensSelecionados.length} item(ns) selecionado(s)
                        </span>
                        <Button 
                          size="sm" 
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={handleIniciarItensSelecionados}
                        >
                          <Play className="h-3 w-3 mr-1" /> Iniciar Selecionados
                        </Button>
                      </div>
                    )}
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-12">
                            <input
                              type="checkbox"
                              checked={itens.filter(i => i.status === 'AGUARDANDO').length > 0 && itens.filter(i => i.status === 'AGUARDANDO').every(i => itensSelecionados.includes(i.id))}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setItensSelecionados(itens.filter(i => i.status === 'AGUARDANDO').map(i => i.id))
                                } else {
                                  setItensSelecionados([])
                                }
                              }}
                            />
                          </TableHead>
                          <TableHead className="w-16">Item</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="text-right">Valor Ref.</TableHead>
                          <TableHead className="text-center">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {itens.filter(i => i.status === 'AGUARDANDO').map(item => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={itensSelecionados.includes(item.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setItensSelecionados([...itensSelecionados, item.id])
                                  } else {
                                    setItensSelecionados(itensSelecionados.filter(id => id !== item.id))
                                  }
                                }}
                              />
                            </TableCell>
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
                  <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Chat da Sessão
                    </div>
                    <Button 
                      variant={chatHabilitado ? "outline" : "destructive"} 
                      size="sm"
                      onClick={handleToggleChat}
                      className="text-xs"
                    >
                      {chatHabilitado ? '🔓 Desabilitar' : '🔒 Habilitar'}
                    </Button>
                  </CardTitle>
                  {!chatHabilitado && (
                    <p className="text-xs text-red-500 mt-1">Chat desabilitado para fornecedores</p>
                  )}
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
