"use client"

import { useState, useEffect, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'

// ==================== TIPOS ====================

export interface Lance {
  id: string
  fornecedorId: string
  fornecedorNomeExibicao: string
  valor: number
  valorTotal: number
  horario: string
  posicao: number
}

export interface Item {
  id: string
  numero: number
  descricao: string
  quantidade: number
  unidade: string
  valorReferencia: number
  status: 'AGUARDANDO' | 'EM_DISPUTA' | 'ENCERRADO'
}

export interface Mensagem {
  id: string
  remetente: string
  mensagem: string
  horario: string
  tipo: 'PREGOEIRO' | 'FORNECEDOR' | 'SISTEMA'
}

export interface Participante {
  id: string
  nomeExibicao: string
  tipo: 'PREGOEIRO' | 'FORNECEDOR'
  online: boolean
}

export interface SessaoState {
  licitacaoId: string
  licitacaoNumero: string
  orgaoNome: string
  pregoeiroNome: string
  status: 'AGUARDANDO_INICIO' | 'EM_ANDAMENTO' | 'ENCERRADA' | 'SUSPENSA'
  etapa: string
  itemAtualId: string | null
  tempoRestante: number
  emTempoAleatorio: boolean
  itens: Item[]
  lances: Lance[]
  mensagens: Mensagem[]
  participantes: Participante[]
}

// URL do backend WebSocket
const WEBSOCKET_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001'

// Estado inicial vazio
const estadoInicial: SessaoState = {
  licitacaoId: '',
  licitacaoNumero: '',
  orgaoNome: '',
  pregoeiroNome: '',
  status: 'AGUARDANDO_INICIO',
  etapa: '',
  itemAtualId: null,
  tempoRestante: 0,
  emTempoAleatorio: false,
  itens: [],
  lances: [],
  mensagens: [],
  participantes: [],
}

/**
 * Hook para conectar a sessao de disputa via WebSocket
 * O estado e gerenciado pelo BACKEND - todos os clientes recebem o mesmo estado
 */
export function useSessaoDisputa(
  licitacaoId: string,
  tipoUsuario: 'PREGOEIRO' | 'FORNECEDOR',
  participanteId: string,
  participanteNome?: string
) {
  const [sessao, setSessao] = useState<SessaoState>(estadoInicial)
  const [conectado, setConectado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)

  // Conectar ao WebSocket
  useEffect(() => {
    console.log(`Conectando ao WebSocket: ${WEBSOCKET_URL}`)
    
    const socket = io(WEBSOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    })

    socketRef.current = socket

    // Eventos de conexao
    socket.on('connect', () => {
      console.log('WebSocket conectado:', socket.id)
      setConectado(true)
      setErro(null)

      // Entrar na sala da licitacao
      socket.emit('entrar_sala', {
        licitacaoId,
        participanteId,
        nome: participanteNome || participanteId,
        tipo: tipoUsuario,
      })
    })

    socket.on('disconnect', () => {
      console.log('WebSocket desconectado')
      setConectado(false)
    })

    socket.on('connect_error', (error) => {
      console.error('Erro de conexao WebSocket:', error)
      setErro('Erro ao conectar ao servidor')
      setConectado(false)
    })

    // Recebe estado completo da sessao
    socket.on('estado_sessao', (estado: SessaoState) => {
      console.log('Estado da sessao recebido:', estado)
      setSessao(estado)
    })

    // Recebe tick do timer (atualizacao a cada segundo)
    socket.on('tick', (data: { tempoRestante: number; emTempoAleatorio: boolean }) => {
      setSessao(prev => ({
        ...prev,
        tempoRestante: data.tempoRestante,
        emTempoAleatorio: data.emTempoAleatorio,
      }))
    })

    // Recebe nova mensagem
    socket.on('nova_mensagem', (mensagem: Mensagem) => {
      setSessao(prev => ({
        ...prev,
        mensagens: [...prev.mensagens, mensagem],
      }))
    })

    // Confirmacao de lance
    socket.on('lance_confirmado', (data: { success: boolean; lance?: Lance }) => {
      console.log('Lance confirmado:', data)
    })

    // Erro no lance
    socket.on('erro_lance', (data: { message: string }) => {
      console.error('Erro no lance:', data.message)
      setErro(data.message)
    })

    // Erro generico
    socket.on('erro', (data: { message: string }) => {
      console.error('Erro:', data.message)
      setErro(data.message)
    })

    // Cleanup
    return () => {
      console.log('Desconectando WebSocket')
      socket.disconnect()
      socketRef.current = null
    }
  }, [licitacaoId, participanteId, participanteNome, tipoUsuario])

  // Enviar lance
  const enviarLance = useCallback((valor: number) => {
    if (!socketRef.current || !conectado) {
      return { success: false, error: 'Nao conectado ao servidor' }
    }

    socketRef.current.emit('enviar_lance', {
      licitacaoId,
      valor,
      fornecedorId: participanteId,
    })

    return { success: true }
  }, [licitacaoId, participanteId, conectado])

  // Enviar mensagem no chat
  const enviarMensagem = useCallback((texto: string) => {
    if (!socketRef.current || !conectado || !texto.trim()) return

    socketRef.current.emit('enviar_mensagem', {
      licitacaoId,
      conteudo: texto,
      remetente: participanteNome || participanteId,
      isPregoeiro: tipoUsuario === 'PREGOEIRO',
    })
  }, [licitacaoId, participanteId, participanteNome, tipoUsuario, conectado])

  // Acoes do pregoeiro
  const encerrarItem = useCallback(() => {
    if (!socketRef.current || !conectado || tipoUsuario !== 'PREGOEIRO') return

    socketRef.current.emit('encerrar_item', { licitacaoId })
  }, [licitacaoId, tipoUsuario, conectado])

  const suspenderSessao = useCallback((motivo: string) => {
    if (!socketRef.current || !conectado || tipoUsuario !== 'PREGOEIRO') return

    socketRef.current.emit('suspender_sessao', { licitacaoId, motivo })
  }, [licitacaoId, tipoUsuario, conectado])

  const cancelarLance = useCallback((lanceId: string, justificativa: string) => {
    if (!socketRef.current || !conectado || tipoUsuario !== 'PREGOEIRO') return

    socketRef.current.emit('cancelar_lance', { licitacaoId, lanceId, justificativa })
  }, [licitacaoId, tipoUsuario, conectado])

  // Dados calculados
  const itemAtual = sessao.itens.find(i => i.id === sessao.itemAtualId)
  const melhorLance = sessao.lances[0]
  
  const minhaPosicao = tipoUsuario === 'FORNECEDOR'
    ? sessao.lances.find(l => l.fornecedorId === participanteId)?.posicao 
    : undefined
    
  const meuMelhorLance = tipoUsuario === 'FORNECEDOR'
    ? sessao.lances.find(l => l.fornecedorId === participanteId)?.valor
    : undefined

  return {
    sessao,
    conectado,
    erro,
    itemAtual,
    melhorLance,
    minhaPosicao,
    meuMelhorLance,
    enviarLance,
    enviarMensagem,
    encerrarItem,
    suspenderSessao,
    cancelarLance,
  }
}

// Funcao para formatar tempo
export function formatarTempo(segundos: number): string {
  const min = Math.floor(segundos / 60)
  const seg = segundos % 60
  return `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`
}
