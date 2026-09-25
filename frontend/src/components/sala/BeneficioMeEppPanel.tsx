'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Clock3, RefreshCw, ShieldCheck, Shuffle, XCircle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatarMoeda } from './utils'

/**
 * BENEFÍCIO ME/EPP — painel do agente de contratação (LC 123/2006 arts. 44 e
 * 45). Por unidade (item ou lote) com empate ficto: melhor oferta, intervalo
 * (5% pregão / 10% demais), ME/EPP no intervalo na ordem (sorteio quando
 * iguais), a convocada com a contagem do prazo e o histórico. É SÓ leitura: a
 * convocação é automática e quem responde é a própria ME/EPP; a aceitação da
 * unidade fica bloqueada até o desempate terminar.
 */

interface Candidato {
  fornecedorId: string
  razaoSocial: string | null
  porte: string | null
  valor: number
  posicao: number
  ordem: number
  sorteado?: boolean
  convocacao: string | null
}
interface Convocacao {
  id: string
  fornecedorId: string
  razaoSocial?: string | null
  ordem: number
  status: string
  prazoAte: string
  prazoPausado?: boolean
  segundosRestantes?: number
  valorOfertado: number | null
  motivo?: string | null
}
interface Unidade {
  tipo: 'ITEM' | 'LOTE'
  id: string
  numero: number
  descricao: string
  desempate: null | {
    status: 'EM_CURSO' | 'EXERCIDO' | 'NAO_EXERCIDO' | 'NAO_APLICAVEL' | 'CANCELADO'
    motivo: string | null
    percentual: number | null
    limite: number | null
    prazoMinutos: number | null
    melhor: { fornecedorId: string; razaoSocial: string | null; valor: number | null } | null
    candidatos: Candidato[]
    sorteio: unknown
    vencedor: { fornecedorId: string; razaoSocial: string | null; valor: number } | null
  }
  convocacaoAtual: Convocacao | null
  historico: Convocacao[]
}

const ROTULO_STATUS: Record<string, string> = {
  AGUARDANDO: 'Aguardando',
  PROCESSANDO: 'Registrando',
  EXERCIDA: 'Exerceu',
  DECLINADA: 'Recusou',
  EXPIRADA: 'Prazo vencido',
  CANCELADA: 'Cancelada',
}

function contagem(prazoAte: string, agora: number) {
  const s = Math.max(0, Math.floor((new Date(prazoAte).getTime() - agora) / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function BeneficioMeEppPanel({ sessaoId, sempreVisivel = false }: { sessaoId: string; sempreVisivel?: boolean }) {
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(() => Date.now())

  const carregar = useCallback(async () => {
    try {
      const res = await authFetch(`${API_URL}/api/julgamento/sessao/${sessaoId}/me-epp`)
      if (!res.ok) {
        const e = await res.json().catch(() => null)
        throw new Error(e?.message || 'Não foi possível carregar o benefício ME/EPP')
      }
      const dados = await res.json()
      setUnidades(Array.isArray(dados?.unidades) ? dados.unidades : [])
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    }
  }, [sessaoId])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 5000)
    const r = setInterval(() => setAgora(Date.now()), 1000)
    return () => {
      clearInterval(t)
      clearInterval(r)
    }
  }, [carregar])

  const comEmpate = unidades.filter((u) => u.desempate && ['EM_CURSO', 'EXERCIDO', 'NAO_EXERCIDO'].includes(u.desempate.status))
  const emCurso = comEmpate.filter((u) => u.desempate?.status === 'EM_CURSO')
  if (!sempreVisivel && emCurso.length === 0) return null

  return (
    <Card className="border-amber-300">
      <CardHeader className="border-b bg-amber-50">
        <CardTitle className="flex items-center justify-between gap-2 text-amber-900">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Benefício ME/EPP — empate ficto
          </span>
          <Button size="sm" variant="ghost" onClick={carregar} title="Atualizar">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </CardTitle>
        <CardDescription>
          LC 123/2006, arts. 44 e 45 — a ME/EPP do intervalo é convocada automaticamente e responde sozinha, na sala, dentro do prazo.
          A aceitação da unidade aguarda o fim do desempate.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {comEmpate.length === 0 && <div className="text-sm text-slate-500">Nenhuma unidade com empate ficto.</div>}
        {comEmpate.map((u) => {
          const d = u.desempate!
          const atual = u.convocacaoAtual
          return (
            <div key={u.id} className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-semibold text-slate-900">
                    {u.tipo === 'LOTE' ? 'Lote' : 'Item'} {u.numero}
                  </div>
                  <div className="line-clamp-1 text-xs text-slate-500">{u.descricao}</div>
                </div>
                {d.status === 'EM_CURSO' && atual?.prazoPausado ? (
                  <div className="rounded-lg bg-slate-100 px-2 py-1 text-center text-slate-700">
                    <div className="text-[10px] uppercase tracking-wide">
                      <Clock3 className="mr-1 inline h-3 w-3" />
                      Prazo pausado (suspensão)
                    </div>
                    <div className="font-mono text-lg font-bold tabular-nums">
                      {String(Math.floor((atual.segundosRestantes ?? 0) / 60)).padStart(2, '0')}:{String((atual.segundosRestantes ?? 0) % 60).padStart(2, '0')}
                    </div>
                  </div>
                ) : d.status === 'EM_CURSO' && atual ? (
                  <div className="rounded-lg bg-amber-100 px-2 py-1 text-center text-amber-900">
                    <div className="text-[10px] uppercase tracking-wide">
                      <Clock3 className="mr-1 inline h-3 w-3" />
                      Prazo da {atual.ordem}ª ME/EPP
                    </div>
                    <div className="font-mono text-lg font-bold tabular-nums">{contagem(atual.prazoAte, agora)}</div>
                  </div>
                ) : d.status === 'EXERCIDO' ? (
                  <Badge className="bg-emerald-100 text-emerald-800">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    ME/EPP passou a 1ª ({formatarMoeda(d.vencedor?.valor ?? 0)})
                  </Badge>
                ) : d.status === 'NAO_EXERCIDO' ? (
                  <Badge className="bg-slate-100 text-slate-700">
                    <XCircle className="mr-1 h-3 w-3" />
                    Não exercido — mantida a melhor oferta
                  </Badge>
                ) : (
                  <Badge variant="outline">Em curso</Badge>
                )}
              </div>

              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Melhor oferta (não ME/EPP)</div>
                  <div className="font-semibold">{formatarMoeda(d.melhor?.valor ?? 0)}</div>
                  <div className="line-clamp-1 text-xs text-slate-500">{d.melhor?.razaoSocial}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Intervalo</div>
                  <div className="font-semibold">até {d.percentual}%</div>
                  <div className="text-xs text-slate-500">limite {formatarMoeda(d.limite ?? 0)}</div>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2">
                  <div className="text-xs text-slate-500">Prazo de cada convocação</div>
                  <div className="font-semibold">{d.prazoMinutos} min</div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500">
                      <th className="py-1">Ordem</th>
                      <th className="py-1">ME/EPP no intervalo</th>
                      <th className="py-1 text-right">Oferta</th>
                      <th className="py-1 text-right">Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.candidatos.map((c) => (
                      <tr key={c.fornecedorId} className="border-t">
                        <td className="py-1">
                          {c.ordem}ª {c.sorteado && <Shuffle className="ml-1 inline h-3 w-3 text-slate-400" aria-label="ordem por sorteio" />}
                        </td>
                        <td className="py-1">
                          <div className="line-clamp-1">{c.razaoSocial ?? c.fornecedorId}</div>
                          {c.porte && <div className="text-xs text-slate-500">{c.porte}</div>}
                        </td>
                        <td className="py-1 text-right">{formatarMoeda(c.valor)}</td>
                        <td className="py-1 text-right text-xs">{c.convocacao ? ROTULO_STATUS[c.convocacao] ?? c.convocacao : 'Na fila'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {d.candidatos.some((c) => c.sorteado) && (
                <div className="text-xs text-slate-500">
                  <Shuffle className="mr-1 inline h-3 w-3" />
                  Ofertas iguais entre ME/EPP ordenadas por sorteio auditável (art. 45, III) — semente registrada na ata da sessão.
                </div>
              )}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
