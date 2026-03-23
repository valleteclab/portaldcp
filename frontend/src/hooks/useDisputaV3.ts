'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_URL, authFetch } from '@/lib/api'
import {
  DisputaMensagem,
  DisputaV3Board,
  DisputaV3ItemBoard,
  DisputaV3LanceMeu,
} from '@/components/disputa-v3/types'
import { escolherItemInicial } from '@/components/disputa-v3/utils'

interface UseDisputaV3Options {
  area: 'orgao' | 'fornecedor'
  sessaoIdParam?: string | null
  licitacaoIdParam?: string | null
}

function getWsUrl() {
  return API_URL.replace('/api', '').replace('http', 'ws')
}

export function useDisputaV3({ area, sessaoIdParam, licitacaoIdParam }: UseDisputaV3Options) {
  const [sessaoId, setSessaoId] = useState<string | null>(sessaoIdParam || null)
  const [board, setBoard] = useState<DisputaV3Board | null>(null)
  const [mensagens, setMensagens] = useState<DisputaMensagem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [wsConectado, setWsConectado] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [sendingBid, setSendingBid] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [meusLances, setMeusLances] = useState<DisputaV3LanceMeu[]>([])
  const [sendingCancel, setSendingCancel] = useState(false)

  const socketRef = useRef<Socket | null>(null)
  const actorRef = useRef<{ id: string; nome: string; tipo: 'PREGOEIRO' | 'FORNECEDOR' } | null>(null)
  const selectedItemIdRef = useRef<string | null>(null)
  selectedItemIdRef.current = selectedItemId

  const resolveSessaoId = useCallback(async () => {
    if (sessaoId) return sessaoId

    if (licitacaoIdParam) {
      const response = await authFetch(`${API_URL}/api/sessao/licitacao/${licitacaoIdParam}`)
      if (!response.ok) throw new Error('Nao foi possivel localizar a sessao da licitacao.')
      const data = await response.json()
      if (!data?.id) throw new Error('Sessao nao encontrada para a licitacao informada.')
      setSessaoId(data.id)
      return data.id as string
    }

    if (typeof window !== 'undefined') {
      const ultimaSessao = localStorage.getItem('sessao_disputa_selecionada')
      if (ultimaSessao) {
        setSessaoId(ultimaSessao)
        return ultimaSessao
      }
    }

    throw new Error('Informe uma sessao ou acesse a disputa pela licitacao.')
  }, [licitacaoIdParam, sessaoId])

  const carregarActor = useCallback(() => {
    if (typeof window === 'undefined') return null

    if (area === 'orgao') {
      const usuarioRaw = localStorage.getItem('usuario')
      const orgaoRaw = localStorage.getItem('orgao')
      const usuario = usuarioRaw ? JSON.parse(usuarioRaw) : null
      const orgao = orgaoRaw ? JSON.parse(orgaoRaw) : null

      const actor = {
        id: usuario?.id || orgao?.id || 'pregoeiro',
        nome: usuario?.nome || orgao?.nome || 'Pregoeiro',
        tipo: 'PREGOEIRO' as const,
      }

      actorRef.current = actor
      return actor
    }

    const fornecedorRaw = localStorage.getItem('fornecedor')
    if (!fornecedorRaw) {
      throw new Error('Voce precisa estar logado como fornecedor.')
    }

    const fornecedor = JSON.parse(fornecedorRaw)
    const actor = {
      id: fornecedor.id,
      nome: fornecedor.razao_social || fornecedor.nome || 'Fornecedor',
      tipo: 'FORNECEDOR' as const,
    }

    actorRef.current = actor
    return actor
  }, [area])

  const refreshBoard = useCallback(
    async (resolvedSessaoId?: string) => {
      const actor = actorRef.current || carregarActor()
      const targetSessaoId = resolvedSessaoId || sessaoId
      if (!targetSessaoId || !actor) return

      const query = actor.tipo === 'FORNECEDOR' ? `?fornecedorId=${actor.id}` : ''
      const response = await authFetch(`${API_URL}/api/disputa-v3/sessao/${targetSessaoId}/board${query}`)
      if (!response.ok) {
        throw new Error('Nao foi possivel carregar o board da disputa.')
      }

      const data = (await response.json()) as DisputaV3Board
      setBoard(data)
      setSelectedItemId((current) => {
        if (current && [
          ...data.colunas.emDisputa,
          ...data.colunas.aguardando,
          ...data.colunas.encerrados,
        ].some((item) => item.id === current)) {
          return current
        }
        return escolherItemInicial(data)
      })
    },
    [carregarActor, sessaoId],
  )

  const carregarMeusLances = useCallback(
    async (resolvedSessaoId?: string, itemId?: string | null) => {
      if (area !== 'fornecedor') return
      const sid = resolvedSessaoId || sessaoId
      const iid = itemId ?? selectedItemIdRef.current
      const actor = actorRef.current || carregarActor()
      if (!sid || !iid || !actor || actor.tipo !== 'FORNECEDOR') {
        setMeusLances([])
        return
      }
      const res = await authFetch(
        `${API_URL}/api/disputa-v3/sessao/${sid}/item/${iid}/lances-meus?fornecedorId=${encodeURIComponent(actor.id)}`,
      )
      if (!res.ok) return
      const data = (await res.json()) as DisputaV3LanceMeu[]
      setMeusLances(Array.isArray(data) ? data : [])
    },
    [area, sessaoId, carregarActor],
  )

  const refreshMensagens = useCallback(
    async (resolvedSessaoId?: string) => {
      const targetSessaoId = resolvedSessaoId || sessaoId
      if (!targetSessaoId) return

      const response = await authFetch(`${API_URL}/api/disputa-v2/sessao/${targetSessaoId}/mensagens`)
      if (!response.ok) return

      const data = await response.json()
      setMensagens(Array.isArray(data) ? data : [])
    },
    [sessaoId],
  )

  const atualizarTempos = useCallback((itensTempo: Array<{ id: string; tempoRestante: number; emProrrogacao: boolean }>) => {
    setBoard((current) => {
      if (!current) return current

      const mapTempo = new Map(itensTempo.map((item) => [item.id, item]))
      const patch = (items: DisputaV3ItemBoard[]): DisputaV3ItemBoard[] =>
        items.map((item) => {
          const novoTempo = mapTempo.get(item.id)
          if (!novoTempo) return item

          return {
            ...item,
            cronometro: {
              tempoRestanteSegundos: novoTempo.tempoRestante,
              fase: novoTempo.emProrrogacao ? 'PRORROGACAO' : 'ETAPA_ABERTA',
            },
          }
        })

      return {
        ...current,
        colunas: {
          aguardando: current.colunas.aguardando,
          emDisputa: patch(current.colunas.emDisputa),
          encerrados: current.colunas.encerrados,
        },
      }
    })
  }, [])

  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        setLoading(true)
        setError(null)
        carregarActor()
        const resolvedSessaoId = await resolveSessaoId()
        if (cancelled) return
        await Promise.all([refreshBoard(resolvedSessaoId), refreshMensagens(resolvedSessaoId)])
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar disputa V3.'
        if (!cancelled) setError(message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    bootstrap()
    return () => {
      cancelled = true
    }
  }, [carregarActor, refreshBoard, refreshMensagens, resolveSessaoId])

  useEffect(() => {
    if (area !== 'fornecedor' || !sessaoId || !selectedItemId) {
      setMeusLances([])
      return
    }
    void carregarMeusLances(sessaoId, selectedItemId)
  }, [area, sessaoId, selectedItemId, carregarMeusLances])

  useEffect(() => {
    if (area !== 'fornecedor' || !sessaoId || !selectedItemId) return
    const id = setInterval(() => {
      void carregarMeusLances(sessaoId, selectedItemId)
    }, 3000)
    return () => clearInterval(id)
  }, [area, sessaoId, selectedItemId, carregarMeusLances])

  useEffect(() => {
    if (!sessaoId) return

    const actor = actorRef.current || carregarActor()
    if (!actor) return

    const socket = io(`${getWsUrl()}/disputa-v2`, {
      transports: ['websocket', 'polling'],
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setWsConectado(true)
      socket.emit('entrar_sala', {
        sessaoId,
        tipo: actor.tipo,
        usuarioId: actor.id,
        usuarioNome: actor.nome,
      })
    })

    socket.on('disconnect', () => setWsConectado(false))
    socket.on('dados_iniciais', async () => {
      await Promise.all([refreshBoard(sessaoId), refreshMensagens(sessaoId)])
    })
    socket.on('itens_iniciados', async () => {
      await refreshBoard(sessaoId)
    })
    socket.on('item_encerrado', async () => {
      await refreshBoard(sessaoId)
    })
    socket.on('novo_lance', async () => {
      await refreshBoard(sessaoId)
      if (area === 'fornecedor') void carregarMeusLances(sessaoId, selectedItemIdRef.current)
    })
    socket.on('sessao_suspensa', async () => {
      await refreshBoard(sessaoId)
    })
    socket.on('sessao_retomada', async () => {
      await refreshBoard(sessaoId)
    })
    socket.on('sessao_reiniciada', async () => {
      await refreshBoard(sessaoId)
    })
    socket.on('nova_mensagem', (mensagem: DisputaMensagem) => {
      setMensagens((current) => [mensagem, ...current].slice(0, 50))
    })
    socket.on('tempo_atualizado', (payload: { itens: Array<{ id: string; tempoRestante: number; emProrrogacao: boolean }> }) => {
      if (payload?.itens?.length) atualizarTempos(payload.itens)
    })
    socket.on('acesso_negado', (payload: { mensagem?: string }) => {
      setError(payload?.mensagem || 'Acesso negado a sala de disputa.')
      setLoading(false)
    })
    socket.on('lance_confirmado', async () => {
      setSendingBid(false)
      await refreshBoard(sessaoId)
      if (area === 'fornecedor') void carregarMeusLances(sessaoId, selectedItemIdRef.current)
    })
    socket.on('erro', (payload: { mensagem?: string }) => {
      setSendingBid(false)
      setSendingMessage(false)
      setActionError(payload?.mensagem || 'Erro ao operar a sala.')
    })

    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [area, atualizarTempos, carregarActor, carregarMeusLances, refreshBoard, refreshMensagens, sessaoId])

  const iniciarItens = useCallback((itensIds: string[]) => {
    if (!socketRef.current || itensIds.length === 0) return
    setActionError(null)
    socketRef.current.emit('iniciar_itens', { sessaoId, itensIds })
  }, [sessaoId])

  const encerrarItem = useCallback((itemId: string) => {
    if (!socketRef.current || !itemId) return
    setActionError(null)
    socketRef.current.emit('encerrar_item', { sessaoId, itemId })
  }, [sessaoId])

  const suspenderSessao = useCallback((payload: { motivo: 'ADMINISTRATIVO' | 'CAUTELAR' | 'JUDICIAL'; justificativa: string }) => {
    if (!socketRef.current) return
    setActionError(null)
    socketRef.current.emit('suspender_sessao', { sessaoId, ...payload })
  }, [sessaoId])

  const retomarSessao = useCallback(() => {
    if (!socketRef.current) return
    setActionError(null)
    socketRef.current.emit('retomar_sessao', { sessaoId })
  }, [sessaoId])

  const reiniciarSessao = useCallback((justificativa: string) => {
    if (!socketRef.current || !justificativa.trim()) return
    setActionError(null)
    socketRef.current.emit('reiniciar_sessao', { sessaoId, justificativa: justificativa.trim() })
  }, [sessaoId])

  const enviarMensagem = useCallback((conteudo: string) => {
    if (!socketRef.current || !conteudo.trim()) return
    setActionError(null)
    setSendingMessage(true)
    socketRef.current.emit('enviar_mensagem', { sessaoId, conteudo: conteudo.trim() })
    setTimeout(() => setSendingMessage(false), 300)
  }, [sessaoId])

  const enviarLance = useCallback((itemId: string, valor: number) => {
    const actor = actorRef.current
    if (!socketRef.current || !actor || actor.tipo !== 'FORNECEDOR') return
    setActionError(null)
    setSendingBid(true)
    socketRef.current.emit('enviar_lance', { sessaoId, itemId, valor })
  }, [sessaoId])

  const cancelarLanceDireto = useCallback(
    async (itemId: string, lanceId: string) => {
      if (!sessaoId || area !== 'fornecedor') return
      setActionError(null)
      setSendingCancel(true)
      try {
        const res = await authFetch(
          `${API_URL}/api/disputa-v3/sessao/${sessaoId}/item/${itemId}/lance/${lanceId}/cancelar-fornecedor`,
          { method: 'POST' },
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = (body as { message?: string | string[] })?.message
          setActionError(Array.isArray(msg) ? msg.join(', ') : msg || 'Nao foi possivel cancelar o lance.')
          return
        }
        await Promise.all([refreshBoard(sessaoId), carregarMeusLances(sessaoId, itemId)])
      } finally {
        setSendingCancel(false)
      }
    },
    [area, sessaoId, refreshBoard, carregarMeusLances],
  )

  const solicitarCancelamentoLance = useCallback(
    async (itemId: string, lanceId: string, motivo?: string) => {
      if (!sessaoId || area !== 'fornecedor') return
      setActionError(null)
      setSendingCancel(true)
      try {
        const res = await authFetch(
          `${API_URL}/api/disputa-v3/sessao/${sessaoId}/item/${itemId}/lance/${lanceId}/solicitar-cancelamento`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ motivo: motivo?.trim() || undefined }),
          },
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = (body as { message?: string | string[] })?.message
          setActionError(Array.isArray(msg) ? msg.join(', ') : msg || 'Nao foi possivel registrar a solicitacao.')
          return
        }
        await Promise.all([refreshBoard(sessaoId), carregarMeusLances(sessaoId, itemId)])
      } finally {
        setSendingCancel(false)
      }
    },
    [area, sessaoId, refreshBoard, carregarMeusLances],
  )

  const pregoeiroCancelarLance = useCallback(
    async (itemId: string, lanceId: string, justificativa: string) => {
      if (!sessaoId || area !== 'orgao') return
      setActionError(null)
      setSendingCancel(true)
      try {
        const res = await authFetch(
          `${API_URL}/api/disputa-v3/sessao/${sessaoId}/item/${itemId}/lance/${lanceId}/pregoeiro-cancelar`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ justificativa: justificativa.trim() }),
          },
        )
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          const msg = (body as { message?: string | string[] })?.message
          setActionError(Array.isArray(msg) ? msg.join(', ') : msg || 'Nao foi possivel cancelar o lance.')
          return
        }
        await refreshBoard(sessaoId)
      } finally {
        setSendingCancel(false)
      }
    },
    [area, sessaoId, refreshBoard],
  )

  const itensOrdenados = useMemo(
    () => board ? [...board.colunas.emDisputa, ...board.colunas.aguardando, ...board.colunas.encerrados] : [],
    [board],
  )

  const selectedItem = useMemo(
    () => itensOrdenados.find((item) => item.id === selectedItemId) || null,
    [itensOrdenados, selectedItemId],
  )

  return {
    sessaoId,
    board,
    mensagens,
    loading,
    error,
    wsConectado,
    selectedItemId,
    selectedItem,
    setSelectedItemId,
    actionError,
    sendingBid,
    sendingMessage,
    refreshBoard,
    refreshMensagens,
    iniciarItens,
    encerrarItem,
    suspenderSessao,
    retomarSessao,
    reiniciarSessao,
    enviarMensagem,
    enviarLance,
    meusLances,
    carregarMeusLances,
    sendingCancel,
    cancelarLanceDireto,
    solicitarCancelamentoLance,
    pregoeiroCancelarLance,
  }
}
