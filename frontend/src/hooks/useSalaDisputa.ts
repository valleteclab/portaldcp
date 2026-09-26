'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { API_URL, authFetch, getAuthToken } from '@/lib/api'
import {
  DisputaMensagem,
  DisputaV3Board,
  DisputaV3ItemBoard,
  DisputaV3LanceMeu,
} from '@/components/sala/types'
import { escolherItemInicial } from '@/components/sala/utils'

interface UseSalaDisputaOptions {
  area: 'orgao' | 'fornecedor'
  /** Sessão resolvida pela página da sala a partir da licitação (null = ainda sem sessão). */
  sessaoIdParam?: string | null
}

function getWsUrl() {
  return API_URL.replace('/api', '').replace('http', 'ws')
}

export function useSalaDisputa({ area, sessaoIdParam }: UseSalaDisputaOptions) {
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
  // Negociação (E3): muda a cada evento privado/resultado da negociação — os painéis recarregam
  const [negociacaoVersao, setNegociacaoVersao] = useState(0)

  const socketRef = useRef<Socket | null>(null)
  const actorRef = useRef<{ id: string; nome: string; tipo: 'PREGOEIRO' | 'FORNECEDOR' } | null>(null)
  const selectedItemIdRef = useRef<string | null>(null)
  selectedItemIdRef.current = selectedItemId

  // A sessão vem SEMPRE da rota (licitação → sessão resolvida pela página da sala);
  // nada de adivinhar pela última sessão aberta no navegador (plano E8).
  useEffect(() => {
    setSessaoId(sessaoIdParam || null)
  }, [sessaoIdParam])

  const resolveSessaoId = useCallback(async () => sessaoId, [sessaoId])

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

      // A visão (pregoeiro ou do próprio fornecedor) é decidida pelo token no backend
      const response = await authFetch(`${API_URL}/api/disputa/sessao/${targetSessaoId}/board`)
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
      const res = await authFetch(`${API_URL}/api/disputa/sessao/${sid}/item/${iid}/lances-meus`)
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

      const response = await authFetch(`${API_URL}/api/disputa/sessao/${targetSessaoId}/mensagens`)
      if (!response.ok) return

      const data = await response.json()
      setMensagens(Array.isArray(data) ? data : [])
    },
    [sessaoId],
  )

  const atualizarTempos = useCallback((itensTempo: Array<{ id: string; tempoRestante: number; emProrrogacao: boolean; fase?: string; oculto?: boolean }>) => {
    setBoard((current) => {
      if (!current) return current

      const mapTempo = new Map(itensTempo.map((item) => [item.id, item]))
      const patch = (items: DisputaV3ItemBoard[]): DisputaV3ItemBoard[] =>
        items.map((item) => {
          const novoTempo = mapTempo.get(item.id)
          if (!novoTempo) return item

          // Fase vinda do relógio por modo; tempo aleatório chega sempre OCULTO (sem contagem)
          const fase = (['ETAPA_ABERTA', 'PRORROGACAO', 'TEMPO_ALEATORIO', 'LANCE_FECHADO'].includes(novoTempo.fase || '')
            ? novoTempo.fase
            : novoTempo.emProrrogacao ? 'PRORROGACAO' : 'ETAPA_ABERTA') as DisputaV3ItemBoard['cronometro']['fase']
          return {
            ...item,
            cronometro: {
              tempoRestanteSegundos: novoTempo.oculto ? 0 : novoTempo.tempoRestante,
              fase,
              oculto: !!novoTempo.oculto,
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
        if (cancelled || !resolvedSessaoId) return
        await Promise.all([refreshBoard(resolvedSessaoId), refreshMensagens(resolvedSessaoId)])
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Erro ao carregar a sala de disputa.'
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

    // Identidade e papel vão SÓ no token do handshake (o backend ignora o payload)
    const socket = io(`${getWsUrl()}/disputa`, {
      transports: ['websocket', 'polling'],
      auth: { token: getAuthToken() || undefined },
    })

    socketRef.current = socket

    socket.on('connect', () => {
      setWsConectado(true)
      socket.emit('entrar_sala', { sessaoId })
    })

    socket.on('disconnect', () => setWsConectado(false))
    socket.on('connect_error', (err: Error) => {
      setWsConectado(false)
      setActionError(err?.message || 'Nao foi possivel conectar a sala de disputa.')
    })
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
    // Modos de disputa (E2.4): troca de fase do item, contagem de lances fechados, retomada agendada
    for (const evento of ['fase_item_alterada', 'lance_fechado_recebido', 'retomada_agendada']) {
      socket.on(evento, async () => {
        await refreshBoard(sessaoId)
      })
    }
    // Negociação (art. 61): acompanhada pelos participantes na sala da sessão (IN 73 art. 30 §1º) e resultado
    for (const evento of ['negociacao_mensagem', 'negociacao_atualizada', 'negociacao_resultado']) {
      socket.on(evento, () => setNegociacaoVersao((v) => v + 1))
    }
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

  /** Reinício da disputa para as demais colocações (Lei 14.133 art. 56 §4º) — pregoeiro. */
  const reiniciarDemais = useCallback(
    async (itemId: string, justificativa: string): Promise<boolean> => {
      if (!sessaoId || area !== 'orgao' || !justificativa.trim()) return false
      setActionError(null)
      const res = await authFetch(`${API_URL}/api/disputa/sessao/${sessaoId}/item/${itemId}/reiniciar-demais`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ justificativa: justificativa.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = (body as { message?: string | string[] })?.message
        setActionError(Array.isArray(msg) ? msg.join(', ') : msg || 'Nao foi possivel reiniciar a disputa.')
        return false
      }
      await Promise.all([refreshBoard(sessaoId), refreshMensagens(sessaoId)])
      return true
    },
    [area, sessaoId, refreshBoard, refreshMensagens],
  )

  /** Comunica a data de reinício após suspensão por desconexão do agente (IN 73 art. 27 §1º). */
  const agendarRetomada = useCallback(
    async (retomadaEm: string): Promise<boolean> => {
      if (!sessaoId || area !== 'orgao' || !retomadaEm) return false
      setActionError(null)
      const res = await authFetch(`${API_URL}/api/disputa/sessao/${sessaoId}/agendar-retomada`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retomadaEm: new Date(retomadaEm).toISOString() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const msg = (body as { message?: string | string[] })?.message
        setActionError(Array.isArray(msg) ? msg.join(', ') : msg || 'Nao foi possivel comunicar a retomada.')
        return false
      }
      await refreshMensagens(sessaoId)
      return true
    },
    [area, sessaoId, refreshMensagens],
  )

  const cancelarLanceDireto = useCallback(
    async (itemId: string, lanceId: string) => {
      if (!sessaoId || area !== 'fornecedor') return
      setActionError(null)
      setSendingCancel(true)
      try {
        const res = await authFetch(
          `${API_URL}/api/disputa/sessao/${sessaoId}/item/${itemId}/lance/${lanceId}/cancelar-fornecedor`,
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
          `${API_URL}/api/disputa/sessao/${sessaoId}/item/${itemId}/lance/${lanceId}/solicitar-cancelamento`,
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
          `${API_URL}/api/disputa/sessao/${sessaoId}/item/${itemId}/lance/${lanceId}/pregoeiro-cancelar`,
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
    reiniciarDemais,
    agendarRetomada,
    enviarMensagem,
    enviarLance,
    meusLances,
    carregarMeusLances,
    sendingCancel,
    cancelarLanceDireto,
    solicitarCancelamentoLance,
    pregoeiroCancelarLance,
    negociacaoVersao,
  }
}
