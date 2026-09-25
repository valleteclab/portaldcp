'use client'

import { useCallback, useEffect, useState } from 'react'
import { Dice5, RefreshCw, Scale, ShieldCheck, Timer } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatarMoeda } from './utils'

/**
 * PAINEL DE DESEMPATE (agente de contratação) — Lei 14.133/2021 art. 60 e
 * IN SEGES 73/2022 art. 28 §2º. Por unidade: grupos empatados; o agente
 * convoca a DISPUTA FINAL (nova proposta sigilosa dos empatados, prazo em
 * minutos), o backend aplica os critérios II..§1º IV (os sem dado aparecem
 * como "não aplicável") e, persistindo, o agente realiza o SORTEIO em ato
 * público — entrada, semente e algoritmo ficam registrados e qualquer
 * participante confere. A tela só pede o ato; a ordem é do backend.
 */

interface Passo {
  criterio: string
  baseLegal: string
  descricao: string
  aplicavel: boolean
  motivo?: string
  desempatou: boolean
}
interface RegistroSorteio {
  algoritmo: string
  entrada: string
  semente: string
  candidatos: string[]
  ordem: string[]
}
interface Desempate {
  id: string
  status: 'EM_DISPUTA_FINAL' | 'AGUARDANDO_SORTEIO' | 'RESOLVIDO' | 'CANCELADO'
  chave: 'VALOR' | 'PONTUACAO'
  valorEmpatado: number
  fornecedores: Array<{ fornecedorId: string; razaoSocial: string | null }>
  disputaFinal: {
    aplicada: boolean
    motivoNaoAplicada: string | null
    prazoAte: string | null
    prazoExpirado: boolean | null
    encerradaEm: string | null
    ofertasRecebidas: number
    ofertas: Array<{ fornecedorId: string; razaoSocial: string | null; valor: number }> | null
  }
  trilha: Passo[]
  ordemFinal: Array<{ posicao: number; fornecedorId: string; razaoSocial: string | null }> | null
  criterioDecisivo: string | null
  sorteio: { atoEm: string; algoritmo: string; descricaoAlgoritmo: string; registros: RegistroSorteio[] } | null
}
interface Grupo {
  chave: 'VALOR' | 'PONTUACAO'
  valor: number
  pendente: boolean
  etapa: string
  desempateId: string | null
  licitantes: Array<{ fornecedorId: string; razaoSocial: string; posicao: number | null; melhorValor: number; pontuacao: number | null }>
}
interface UnidadePainel {
  tipo: 'ITEM' | 'LOTE'
  id: string
  numero: number
  descricao: string
  gruposEmpatados: Grupo[]
  podeIniciar: boolean
  desempates: Desempate[]
}
interface Painel {
  criterio: string
  disputaFinalAplicavel: boolean
  motivoSemDisputaFinal: string | null
  prazoPadraoMinutos: number
  unidades: UnidadePainel[]
}

const ROTULO_STATUS: Record<string, { label: string; cls: string }> = {
  EM_DISPUTA_FINAL: { label: 'Disputa final em curso', cls: 'bg-blue-100 text-blue-800' },
  AGUARDANDO_SORTEIO: { label: 'Aguardando sorteio', cls: 'bg-amber-100 text-amber-800' },
  RESOLVIDO: { label: 'Resolvido', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELADO: { label: 'Cancelado', cls: 'bg-slate-200 text-slate-600' },
}

const dataHora = (v?: string | null) =>
  v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '-'

const valorGrupo = (chave: string, v: number) => (chave === 'VALOR' ? formatarMoeda(v) : `pontuação ${Number(v).toFixed(4)}`)

export function DesempatePanel({ sessaoId, onMudou }: { sessaoId: string; onMudou?: () => void }) {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [prazos, setPrazos] = useState<Record<string, string>>({})
  const [confirmarSorteio, setConfirmarSorteio] = useState<Desempate | null>(null)
  const [conferencia, setConferencia] = useState<Record<string, boolean>>({})

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/desempate`)
      if (!res.ok) throw new Error('Não foi possível carregar o desempate')
      setPainel(await res.json())
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setCarregando(false)
    }
  }, [sessaoId])

  useEffect(() => {
    carregar()
    const i = setInterval(carregar, 10000)
    return () => clearInterval(i)
  }, [carregar])

  const ato = async (url: string, corpo: Record<string, unknown> = {}) => {
    setOcupado(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}${url}`, { method: 'POST', body: JSON.stringify(corpo) })
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        throw new Error(Array.isArray(e?.message) ? e.message.join('; ') : e?.message || 'Não foi possível concluir o ato')
      }
      await carregar()
      onMudou?.()
      return true
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
      return false
    } finally {
      setOcupado(false)
    }
  }

  const conferir = async (d: Desempate) => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/desempate/${d.id}/conferir`)
      const r = await res.json()
      setConferencia((c) => ({ ...c, [d.id]: !!r?.conferido }))
    } catch {
      setConferencia((c) => ({ ...c, [d.id]: false }))
    }
  }

  const unidadesComEmpate = (painel?.unidades ?? []).filter((u) => u.gruposEmpatados.length || u.desempates.length)
  if (!carregando && !erro && unidadesComEmpate.length === 0) return null

  return (
    <Card>
      <CardHeader className="border-b bg-amber-50">
        <CardTitle className="flex items-center justify-between gap-2 text-amber-900">
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Desempate (art. 60)
          </span>
          <Button size="sm" variant="ghost" onClick={carregar} disabled={carregando || ocupado} title="Atualizar">
            <RefreshCw className={`h-4 w-4 ${carregando ? 'animate-spin' : ''}`} />
          </Button>
        </CardTitle>
        <CardDescription>
          Lei 14.133/2021, art. 60: disputa final entre os empatados, critérios II a IV e preferências do §1º; persistindo, sorteio em ato
          público (IN SEGES 73/2022, art. 28, §2º). A aceitação só convoca depois do desempate.
          {painel?.motivoSemDisputaFinal && <span className="mt-1 block text-amber-800">Disputa final: {painel.motivoSemDisputaFinal}</span>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {unidadesComEmpate.map((u) => (
          <div key={u.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="font-semibold text-slate-900">
              {u.tipo === 'LOTE' ? 'Lote' : 'Item'} {u.numero} <span className="text-xs font-normal text-slate-500">{u.descricao}</span>
            </div>

            {u.gruposEmpatados.map((g, gi) => (
              <div key={gi} className="rounded-lg bg-slate-50 p-2 text-sm">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <span className="font-medium">Empate em {valorGrupo(g.chave, g.valor)}</span>
                  <Badge className={g.pendente ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}>
                    {g.pendente ? 'Pendente' : 'Resolvido'}
                  </Badge>
                </div>
                <ul className="space-y-0.5 text-slate-700">
                  {g.licitantes.map((l) => (
                    <li key={l.fornecedorId} className="flex justify-between gap-2">
                      <span className="truncate">
                        {l.posicao ? `${l.posicao}º ` : ''}
                        {l.razaoSocial}
                      </span>
                      <span className="tabular-nums">{formatarMoeda(l.melhorValor)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {u.podeIniciar && (
              <div className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-amber-300 p-2">
                {painel?.disputaFinalAplicavel && (
                  <div className="w-32">
                    <label className="text-xs text-slate-500">Prazo (minutos)</label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={prazos[u.id] ?? String(painel?.prazoPadraoMinutos ?? 5)}
                      onChange={(e) => setPrazos((p) => ({ ...p, [u.id]: e.target.value }))}
                    />
                  </div>
                )}
                <Button
                  size="sm"
                  disabled={ocupado}
                  onClick={() =>
                    ato(`/api/julgamento/sessao/${sessaoId}/desempate/unidade/${u.id}/iniciar`, {
                      prazoMinutos: Number(prazos[u.id] ?? painel?.prazoPadraoMinutos ?? 5),
                    })
                  }
                >
                  <Timer className="mr-1 h-4 w-4" />
                  {painel?.disputaFinalAplicavel ? 'Convocar disputa final (art. 60, I)' : 'Aplicar critérios do art. 60'}
                </Button>
              </div>
            )}

            {u.desempates.map((d) => {
              const st = ROTULO_STATUS[d.status] ?? { label: d.status, cls: 'bg-slate-100 text-slate-700' }
              return (
                <div key={d.id} className="space-y-2 rounded-lg border border-slate-200 p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">
                      {d.fornecedores.length} empatados em {valorGrupo(d.chave, d.valorEmpatado)}
                    </span>
                    <Badge className={st.cls}>{st.label}</Badge>
                  </div>

                  {d.status === 'EM_DISPUTA_FINAL' && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded bg-blue-50 px-2 py-1 text-blue-900">
                      <span>
                        Novas propostas: {d.disputaFinal.ofertasRecebidas} de {d.fornecedores.length} (sigilosas) · prazo até {dataHora(d.disputaFinal.prazoAte)}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={ocupado || !(d.disputaFinal.prazoExpirado || d.disputaFinal.ofertasRecebidas >= d.fornecedores.length)}
                        onClick={() => ato(`/api/julgamento/sessao/${sessaoId}/desempate/${d.id}/encerrar-disputa-final`)}
                      >
                        Encerrar disputa final
                      </Button>
                    </div>
                  )}

                  {d.disputaFinal.ofertas && d.disputaFinal.ofertas.length > 0 && (
                    <div className="text-xs text-slate-600">
                      Disputa final: {d.disputaFinal.ofertas.map((o) => `${o.razaoSocial ?? o.fornecedorId} ${formatarMoeda(o.valor)}`).join(' · ')}
                    </div>
                  )}

                  {d.trilha.length > 0 && (
                    <ol className="space-y-0.5 text-xs text-slate-600">
                      {d.trilha.map((p, i) => (
                        <li key={i}>
                          <span className="font-medium">{p.baseLegal}</span> — {p.descricao}:{' '}
                          {p.aplicavel ? (p.desempatou ? <b className="text-emerald-700">desempatou</b> : 'sem efeito') : <span className="text-slate-400">{p.motivo ?? 'não aplicável'}</span>}
                        </li>
                      ))}
                    </ol>
                  )}

                  {d.status === 'AGUARDANDO_SORTEIO' && (
                    <Button size="sm" disabled={ocupado} onClick={() => setConfirmarSorteio(d)}>
                      <Dice5 className="mr-1 h-4 w-4" />
                      Realizar sorteio em ato público
                    </Button>
                  )}

                  {d.ordemFinal && (
                    <div className="rounded bg-emerald-50 px-2 py-1 text-emerald-900">
                      Ordem final: {d.ordemFinal.map((o) => `${o.posicao}º ${o.razaoSocial ?? o.fornecedorId}`).join(', ')}
                    </div>
                  )}

                  {d.sorteio && (
                    <div className="space-y-1 rounded border border-slate-200 bg-slate-50 p-2 font-mono text-[11px] text-slate-700">
                      <div>Ato: {dataHora(d.sorteio.atoEm)} · algoritmo {d.sorteio.algoritmo}</div>
                      {d.sorteio.registros.map((r, i) => (
                        <div key={i} className="break-all">
                          <div>entrada: {r.entrada}</div>
                          <div>semente (SHA-256): {r.semente}</div>
                        </div>
                      ))}
                      <div className="font-sans text-slate-500">{d.sorteio.descricaoAlgoritmo}</div>
                      <div className="flex items-center gap-2 font-sans">
                        <Button size="sm" variant="ghost" onClick={() => conferir(d)}>
                          <ShieldCheck className="mr-1 h-4 w-4" />
                          Conferir sorteio
                        </Button>
                        {d.id in conferencia && (
                          <span className={conferencia[d.id] ? 'text-emerald-700' : 'text-red-700'}>
                            {conferencia[d.id] ? 'Resultado conferido: a entrada pública reproduz a ordem registrada.' : 'Divergência na conferência!'}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </CardContent>

      <Dialog open={!!confirmarSorteio} onOpenChange={(o) => !o && setConfirmarSorteio(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sorteio em ato público</DialogTitle>
            <DialogDescription>
              O instante deste ato é registrado e entra na semente pública do sorteio (IN SEGES 73/2022, art. 28, §2º). O ato não pode ser desfeito
              nem repetido; o resultado, a entrada e a semente ficam visíveis a todos os participantes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarSorteio(null)}>
              Cancelar
            </Button>
            <Button
              disabled={ocupado}
              onClick={async () => {
                if (!confirmarSorteio) return
                const ok = await ato(`/api/julgamento/sessao/${sessaoId}/desempate/${confirmarSorteio.id}/sortear`)
                if (ok) setConfirmarSorteio(null)
              }}
            >
              Sortear agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
