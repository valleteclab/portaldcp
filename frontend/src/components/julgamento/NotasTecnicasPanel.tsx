'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Megaphone, RefreshCw, Save } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * NOTAS TÉCNICAS (banca) — Lei 14.133/2021 arts. 36 §2º e 37: depois do
 * acolhimento e antes da etapa de preços, cada membro da banca atribui a sua
 * nota por quesito e licitante (registrada por membro); o órgão acompanha o
 * progresso, abre as propostas técnicas e PUBLICA as notas (todas as notas de
 * todos os membros; banca de no mínimo 3). Só então a etapa de preços abre.
 */

interface Quesito {
  id: string
  ordem: number
  descricao: string
  peso: number
  notaMaxima: number
}
interface Nota {
  quesitoId: string
  fornecedorId: string
  membroId: string
  nota: number
  justificativa: string | null
}
interface ResultadoLicitante {
  fornecedorId: string
  razaoSocial: string
  notaTecnica: number
  abaixoDoMinimo: boolean
}
interface Painel {
  criterio: string
  aplicavel: boolean
  fase: string
  quesitos: Quesito[]
  comissao: Array<{ id: string; nome: string }>
  licitantes: Array<{ id: string; nome: string; cpfCnpj: string }>
  notas: Nota[]
  souMembro: boolean
  usuarioId: string | null
  fasePermiteNotas: boolean
  pendencias: string[]
  podePublicar: boolean
  publicadoEm: string | null
  previa: ResultadoLicitante[] | null
  resultado: ResultadoLicitante[] | null
  notaMinima: number | null
}
interface Documento {
  id: string
  fornecedorId: string
  razaoSocial: string | null
  nome: string
  tamanho: number
}

const chave = (q: string, f: string) => `${q}|${f}`

export function NotasTecnicasPanel({ licitacaoId }: { licitacaoId: string }) {
  const [p, setP] = useState<Painel | null>(null)
  const [docs, setDocs] = useState<Documento[]>([])
  const [minhas, setMinhas] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [confirmar, setConfirmar] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/notas`)
      if (!r.ok) throw new Error('Não foi possível carregar as notas técnicas')
      const painel: Painel = await r.json()
      setP(painel)
      const meu: Record<string, string> = {}
      for (const n of painel.notas.filter((x) => x.membroId === painel.usuarioId)) meu[chave(n.quesitoId, n.fornecedorId)] = String(n.nota)
      setMinhas(meu)
      const d = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/documentos`)
      if (d.ok) setDocs((await d.json()).documentos ?? [])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    }
  }, [licitacaoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const progresso = useMemo(() => {
    if (!p) return []
    const total = p.quesitos.length * p.licitantes.length
    return p.comissao.map((m) => ({ ...m, feitas: p.notas.filter((n) => n.membroId === m.id).length, total }))
  }, [p])

  const salvar = async () => {
    if (!p) return
    setOcupado(true)
    setErro(null)
    setOk(null)
    try {
      const notas = Object.entries(minhas)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => {
          const [quesitoId, fornecedorId] = k.split('|')
          return { quesitoId, fornecedorId, nota: Number(String(v).replace(',', '.')) }
        })
      const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/notas`, { method: 'PUT', body: JSON.stringify({ notas }) })
      if (!r.ok) {
        const e = await r.json().catch(() => null)
        throw new Error(e?.message || 'Não foi possível salvar as notas')
      }
      setOk('Suas notas foram registradas.')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  const publicar = async () => {
    setOcupado(true)
    setErro(null)
    try {
      const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/publicar`, { method: 'POST' })
      if (!r.ok) {
        const e = await r.json().catch(() => null)
        throw new Error(e?.message || 'Não foi possível publicar')
      }
      setConfirmar(false)
      setOk('Notas técnicas publicadas. A etapa de preços pode ser aberta na sala.')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  const abrirDoc = async (d: Documento) => {
    const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/documentos/${d.id}/arquivo`).catch(() => null)
    if (!r || !r.ok) {
      setErro('Documento indisponível')
      return
    }
    window.open(URL.createObjectURL(await r.blob()), '_blank', 'noopener')
  }

  if (!p) return erro ? <div className="text-sm text-red-700">{erro}</div> : null
  if (!p.aplicavel) return null
  const resultado = p.resultado ?? p.previa ?? []
  const editavel = p.souMembro && p.fasePermiteNotas && !p.publicadoEm

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          Notas técnicas da banca
          <span className="flex items-center gap-2">
            {p.publicadoEm ? <Badge className="bg-emerald-100 text-emerald-800">Publicadas</Badge> : <Badge variant="outline">Em avaliação</Badge>}
            <Button size="sm" variant="ghost" onClick={carregar} title="Atualizar">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </span>
        </CardTitle>
        <CardDescription>
          Cada membro atribui a sua nota por quesito e licitante; a nota do quesito é a média dos membros. As notas são publicadas antes da etapa
          de preços (Lei 14.133/2021, art. 36, §2º).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-800">Propostas técnicas recebidas</div>
          {docs.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhuma (as propostas técnicas ficam disponíveis ao órgão depois do acolhimento).</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {docs.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1">
                  <span className="truncate">
                    {d.razaoSocial ?? d.fornecedorId} — {d.nome}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => abrirDoc(d)}>
                    <FileText className="mr-1 h-4 w-4" />
                    Abrir
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-800">Progresso da banca</div>
          {progresso.map((m) => (
            <div key={m.id} className="flex items-center justify-between text-sm">
              <span>{m.nome}</span>
              <span className={m.feitas >= m.total ? 'text-emerald-700' : 'text-amber-700'}>
                {m.feitas}/{m.total} notas
              </span>
            </div>
          ))}
        </div>

        {editavel && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-800">Minhas notas</div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="py-1 pr-2">Licitante</th>
                    {p.quesitos.map((q) => (
                      <th key={q.id} className="py-1 pr-2">
                        {q.ordem}. {q.descricao} <span className="font-normal">(0–{q.notaMaxima}, peso {q.peso})</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {p.licitantes.map((l) => (
                    <tr key={l.id} className="border-t">
                      <td className="py-1 pr-2">{l.nome}</td>
                      {p.quesitos.map((q) => (
                        <td key={q.id} className="py-1 pr-2">
                          <Input
                            className="w-24"
                            type="number"
                            min={0}
                            max={q.notaMaxima}
                            step="0.01"
                            value={minhas[chave(q.id, l.id)] ?? ''}
                            onChange={(e) => setMinhas((m) => ({ ...m, [chave(q.id, l.id)]: e.target.value }))}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={salvar} disabled={ocupado}>
              <Save className="mr-1 h-4 w-4" />
              Registrar minhas notas
            </Button>
          </div>
        )}
        {!p.souMembro && !p.publicadoEm && (
          <p className="text-xs text-slate-500">Você não é membro da banca: as notas são registradas por cada membro, com o próprio login.</p>
        )}
        {p.souMembro && !p.fasePermiteNotas && !p.publicadoEm && (
          <p className="text-xs text-slate-500">As notas são atribuídas depois do encerramento do acolhimento e antes da etapa de preços.</p>
        )}

        <div className="space-y-1">
          <div className="text-sm font-medium text-slate-800">{p.publicadoEm ? 'Resultado publicado' : 'Prévia (não publicada)'}</div>
          <ul className="space-y-1 text-sm">
            {resultado.map((r, i) => (
              <li key={r.fornecedorId} className="flex items-center justify-between rounded bg-slate-50 px-2 py-1">
                <span>
                  {i + 1}º {r.razaoSocial}
                  {r.abaixoDoMinimo && <Badge className="ml-2 bg-red-100 text-red-700">abaixo da mínima</Badge>}
                </span>
                <span className="tabular-nums font-medium">{Number(r.notaTecnica).toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>

        {!p.publicadoEm && (
          <div className="space-y-2 border-t pt-4">
            {p.pendencias.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-amber-800">
                {p.pendencias.map((x, i) => (
                  <li key={i}>{x}</li>
                ))}
              </ul>
            )}
            <Button onClick={() => setConfirmar(true)} disabled={!p.podePublicar || ocupado}>
              <Megaphone className="mr-1 h-4 w-4" />
              Publicar notas técnicas
            </Button>
          </div>
        )}
      </CardContent>

      <Dialog open={confirmar} onOpenChange={setConfirmar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar notas técnicas</DialogTitle>
            <DialogDescription>
              As notas ficam públicas e congeladas; licitantes abaixo da nota mínima são desclassificados. Depois da publicação a banca não altera
              notas e a etapa de preços pode ser aberta.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmar(false)}>
              Cancelar
            </Button>
            <Button onClick={publicar} disabled={ocupado}>
              Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
