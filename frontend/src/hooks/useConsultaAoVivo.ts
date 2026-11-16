'use client'

/**
 * Consulta que acompanha a sala em tempo real (lotes por fase, fila automática).
 *
 * O `gatilho` muda a cada atualização do quadro — durante os lances, a cada
 * segundo. Antes, cada mudança refazia a consulta e descartava a anterior; como
 * a resposta leva mais de 1 s, a tela ficava presa em "Carregando os lotes da
 * sessão..." enquanto havia lote em disputa (ensaio do pregão 2026/00072,
 * 09/11/2026). Aqui:
 * - no máximo uma consulta a cada `minimoMs` (as mudanças no meio se juntam numa só);
 * - a resposta de uma consulta em andamento nunca é descartada por uma nova;
 * - resposta fora de ordem (mais antiga que a já aplicada) é ignorada;
 * - além do gatilho, consulta a cada `intervaloMs`.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { authFetch } from '@/lib/api'

export function useConsultaAoVivo<T>(
  /** `null` = nada a consultar agora (a consulta fica parada). */
  url: string | null,
  gatilho: unknown,
  { intervaloMs = 20_000, minimoMs = 3_000, aoReceber }: { intervaloMs?: number; minimoMs?: number; aoReceber?: (dados: T) => void } = {},
): [T | null, (dados: T) => void] {
  const [dados, setDados] = useState<T | null>(null)
  const montado = useRef(true)
  const ultimaBusca = useRef(0)
  const pendente = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pedidos = useRef(0)
  const aplicado = useRef(0)
  const aoReceberRef = useRef(aoReceber)
  useEffect(() => {
    aoReceberRef.current = aoReceber
  }, [aoReceber])

  const buscar = useCallback(() => {
    if (!url) return
    ultimaBusca.current = Date.now()
    const n = ++pedidos.current
    authFetch(url, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: T | null) => {
        if (!montado.current || !j || n < aplicado.current) return
        aplicado.current = n
        setDados(j)
        aoReceberRef.current?.(j)
      })
      .catch(() => {})
  }, [url])

  // Ciclo de vida + consulta periódica
  useEffect(() => {
    montado.current = true
    const t = setInterval(buscar, intervaloMs)
    return () => {
      montado.current = false
      clearInterval(t)
      if (pendente.current) clearTimeout(pendente.current)
      pendente.current = null
    }
  }, [buscar, intervaloMs])

  // Gatilho (quadro em tempo real): consulta já, ou junta no fim da janela mínima
  useEffect(() => {
    const falta = minimoMs - (Date.now() - ultimaBusca.current)
    if (falta <= 0) {
      buscar()
      return
    }
    if (!pendente.current) {
      pendente.current = setTimeout(() => {
        pendente.current = null
        buscar()
      }, falta)
    }
  }, [gatilho, buscar, minimoMs])

  const substituir = useCallback((novo: T) => {
    aplicado.current = ++pedidos.current
    setDados(novo)
  }, [])

  return [dados, substituir]
}
