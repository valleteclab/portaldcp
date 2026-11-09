'use client'

/**
 * FILA AUTOMÁTICA (dono, 09/11/2026 — como Compras.gov.br e BLL): a pregoeira
 * define quantas unidades ficam em disputa ao mesmo tempo e o aviso prévio; a
 * próxima unidade (ordem da numeração) abre sozinha quando há vaga.
 */
import { useEffect, useState } from 'react'
import { ListOrdered, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface EstadoFila {
  ativa: boolean
  maxSimultaneos: number | null
  avisoMinutos: number
  proximaUnidadeId: string | null
  proximaAberturaEm: string | null
  aguardando: number
  emDisputa: number
}

export function FilaAutomaticaBarra({ sessaoId, atualizacao }: { sessaoId: string; atualizacao?: unknown }) {
  const [estado, setEstado] = useState<EstadoFila | null>(null)
  const [max, setMax] = useState('1')
  const [aviso, setAviso] = useState('1')
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    let vivo = true
    const buscar = () =>
      authFetch(`${API_URL}/api/disputa/sessao/${sessaoId}/fila`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: EstadoFila | null) => {
          if (vivo && j) setEstado(j)
        })
        .catch(() => {})
    buscar()
    const t = setInterval(buscar, 15_000)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [sessaoId, atualizacao])

  const enviar = async (url: string, corpo?: Record<string, unknown>) => {
    setOcupado(true)
    try {
      const r = await authFetch(url, { method: 'POST', body: JSON.stringify(corpo ?? {}) })
      const j = await r.json().catch(() => null)
      if (!r.ok) throw new Error(j?.message || 'Não foi possível alterar a fila.')
      setEstado(j)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setOcupado(false)
    }
  }

  // Sem nada aguardando e sem fila ligada, a barra não tem o que fazer
  if (!estado || (!estado.ativa && estado.aguardando === 0)) return null
  const proxima = estado.proximaAberturaEm
    ? new Date(estado.proximaAberturaEm).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
      <div className="flex items-center gap-2 font-semibold text-slate-800">
        <ListOrdered className="h-4 w-4" /> Fila automática
      </div>
      {estado.ativa ? (
        <>
          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">ligada</span>
          <span className="text-slate-600">
            até {estado.maxSimultaneos} em disputa · aviso de {estado.avisoMinutos} min · {estado.emDisputa} em disputa, {estado.aguardando} aguardando
            {proxima ? ` · próxima abertura às ${proxima}` : ''}
          </span>
          <Button size="sm" variant="outline" className="ml-auto" disabled={ocupado} onClick={() => enviar(`${API_URL}/api/disputa/sessao/${sessaoId}/fila/desligar`)}>
            Desligar
          </Button>
        </>
      ) : (
        <>
          <span className="text-slate-600">{estado.aguardando} aguardando · abre a próxima sozinha quando uma encerrar</span>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            Simultâneas
            <Input className="h-8 w-16" type="number" min={1} max={20} value={max} onChange={(e) => setMax(e.target.value)} />
          </label>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            Aviso prévio (min)
            <Input className="h-8 w-16" type="number" min={0} max={10} value={aviso} onChange={(e) => setAviso(e.target.value)} />
          </label>
          <Button
            size="sm"
            className="ml-auto"
            disabled={ocupado}
            onClick={() => enviar(`${API_URL}/api/disputa/sessao/${sessaoId}/fila`, { maxSimultaneos: Number(max), avisoMinutos: Number(aviso) })}
          >
            {ocupado && <Loader2 className="mr-1 h-4 w-4 animate-spin" />} Ligar a fila
          </Button>
        </>
      )}
    </div>
  )
}
