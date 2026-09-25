'use client'

import { useCallback, useEffect, useState } from 'react'
import { Plus, Save, Trash2, Users } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

/**
 * CONFIGURAÇÃO DO JULGAMENTO TÉCNICO (edital) — Lei 14.133/2021 arts. 35–37:
 * quesitos (descrição, peso, nota máxima), peso da proposta técnica na
 * técnica e preço (≤ 70% — art. 36 §2º), nota mínima e a BANCA (usuários do
 * órgão; mínimo 3 — art. 37 §1º). Quesitos/pesos travam na 1ª nota; a banca,
 * na publicação. As regras são validadas no backend.
 */

interface Quesito {
  id?: string
  descricao: string
  peso: number | string
  notaMaxima: number | string
  criterioAvaliacao?: string | null
}
interface Configuracao {
  criterio: string
  aplicavel: boolean
  pesoTecnica: number | null
  pesoPreco: number | null
  pesoTecnicaMaximo: number
  notaMinima: number | null
  minimoMembrosBanca: number
  quesitos: Quesito[]
  comissao: Array<{ id: string; nome: string; papel: string; cargo: string | null }>
  totalNotas: number
  podeEditarQuesitos: boolean
  podeEditarComissao: boolean
  publicadoEm: string | null
}
interface Usuario {
  id: string
  nome: string
  cargo: string | null
  role: string | null
}

async function erroDe(res: Response) {
  const e = await res.json().catch(() => null)
  return Array.isArray(e?.message) ? e.message.join('; ') : e?.message || 'Não foi possível salvar'
}

export function JulgamentoTecnicoConfig({ licitacaoId, className }: { licitacaoId: string; className?: string }) {
  const [cfg, setCfg] = useState<Configuracao | null>(null)
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [quesitos, setQuesitos] = useState<Quesito[]>([])
  const [pesoTecnica, setPesoTecnica] = useState('')
  const [notaMinima, setNotaMinima] = useState('')
  const [banca, setBanca] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/configuracao`)
      if (!r.ok) throw new Error(await erroDe(r))
      const c: Configuracao = await r.json()
      setCfg(c)
      setQuesitos(c.quesitos.length ? c.quesitos : [{ descricao: '', peso: 1, notaMaxima: 10 }])
      setPesoTecnica(c.pesoTecnica != null && c.criterio === 'TECNICA_E_PRECO' ? String(c.pesoTecnica) : '')
      setNotaMinima(c.notaMinima != null ? String(c.notaMinima) : '')
      setBanca(c.comissao.map((m) => m.id))
      const u = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/usuarios-elegiveis`)
      if (u.ok) setUsuarios(await u.json())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    }
  }, [licitacaoId])

  useEffect(() => {
    carregar()
  }, [carregar])

  const salvarEdital = async () => {
    setOcupado(true)
    setErro(null)
    setOk(null)
    try {
      const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/configuracao`, {
        method: 'PUT',
        body: JSON.stringify({
          pesoTecnica: pesoTecnica === '' ? null : Number(pesoTecnica),
          notaMinima: notaMinima === '' ? null : Number(notaMinima),
          quesitos: quesitos.map((q) => ({
            descricao: q.descricao,
            peso: Number(q.peso),
            notaMaxima: Number(q.notaMaxima),
            criterioAvaliacao: q.criterioAvaliacao || null,
          })),
        }),
      })
      if (!r.ok) throw new Error(await erroDe(r))
      setOk('Quesitos e pesos salvos.')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  const salvarBanca = async () => {
    setOcupado(true)
    setErro(null)
    setOk(null)
    try {
      const r = await authFetch(`${API_URL}/api/julgamento/licitacao/${licitacaoId}/tecnica/comissao`, {
        method: 'PUT',
        body: JSON.stringify({ usuarioIds: banca }),
      })
      if (!r.ok) throw new Error(await erroDe(r))
      setOk('Banca designada.')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setOcupado(false)
    }
  }

  if (!cfg) return erro ? <div className="text-sm text-red-700">{erro}</div> : null
  if (!cfg.aplicavel) {
    return (
      <Card className={className}>
        <CardContent className="py-4 text-sm text-slate-600">
          Julgamento técnico só se aplica aos critérios melhor técnica e técnica e preço. Se você acabou de trocar o critério, salve a licitação primeiro.
        </CardContent>
      </Card>
    )
  }
  const tp = cfg.criterio === 'TECNICA_E_PRECO'
  const travado = !cfg.podeEditarQuesitos

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          Julgamento técnico ({tp ? 'técnica e preço' : 'melhor técnica'})
          {cfg.publicadoEm && <Badge className="bg-emerald-100 text-emerald-800">Notas publicadas</Badge>}
        </CardTitle>
        <CardDescription>
          Quesitos com peso e nota máxima (Lei 14.133/2021, art. 37, II). Nota técnica = média dos membros por quesito, ponderada pelos pesos (0–100).
          {tp && ` Índice final = peso técnica × (nota / maior nota) + peso preço × (menor preço / preço); técnica até ${cfg.pesoTecnicaMaximo}% (art. 36, §2º).`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}

        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-500">
            <span className="col-span-7">Quesito</span>
            <span className="col-span-2">Peso</span>
            <span className="col-span-2">Nota máxima</span>
          </div>
          {quesitos.map((q, i) => (
            <div key={i} className="grid grid-cols-12 items-center gap-2">
              <Input
                className="col-span-7"
                value={q.descricao}
                disabled={travado}
                placeholder="Ex.: Metodologia de execução"
                onChange={(e) => setQuesitos((l) => l.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)))}
              />
              <Input
                className="col-span-2"
                type="number"
                min={0}
                step="0.1"
                value={q.peso}
                disabled={travado}
                onChange={(e) => setQuesitos((l) => l.map((x, j) => (j === i ? { ...x, peso: e.target.value } : x)))}
              />
              <Input
                className="col-span-2"
                type="number"
                min={0}
                step="0.1"
                value={q.notaMaxima}
                disabled={travado}
                onChange={(e) => setQuesitos((l) => l.map((x, j) => (j === i ? { ...x, notaMaxima: e.target.value } : x)))}
              />
              <Button
                variant="ghost"
                size="sm"
                className="col-span-1"
                disabled={travado || quesitos.length <= 1}
                onClick={() => setQuesitos((l) => l.filter((_, j) => j !== i))}
                title="Remover quesito"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" disabled={travado} onClick={() => setQuesitos((l) => [...l, { descricao: '', peso: 1, notaMaxima: 10 }])}>
            <Plus className="mr-1 h-4 w-4" />
            Adicionar quesito
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {tp && (
            <div>
              <label className="text-xs font-medium text-slate-600">Peso da proposta técnica (%) — máx. {cfg.pesoTecnicaMaximo}</label>
              <Input type="number" min={1} max={cfg.pesoTecnicaMaximo} value={pesoTecnica} disabled={travado} onChange={(e) => setPesoTecnica(e.target.value)} />
              {pesoTecnica !== '' && <p className="mt-1 text-xs text-slate-500">Peso do preço: {100 - Number(pesoTecnica)}%</p>}
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-slate-600">Nota técnica mínima (0–100, opcional)</label>
            <Input type="number" min={0} max={100} value={notaMinima} disabled={travado} onChange={(e) => setNotaMinima(e.target.value)} />
          </div>
        </div>
        {travado ? (
          <p className="text-xs text-slate-500">
            {cfg.publicadoEm ? 'Notas publicadas.' : `Já há ${cfg.totalNotas} nota(s) registrada(s)`} — quesitos e pesos do edital não podem mais mudar.
          </p>
        ) : (
          <Button onClick={salvarEdital} disabled={ocupado}>
            <Save className="mr-1 h-4 w-4" />
            Salvar quesitos e pesos
          </Button>
        )}

        <div className="space-y-2 border-t pt-4">
          <div className="flex items-center gap-2 font-medium text-slate-800">
            <Users className="h-4 w-4" />
            Banca (mínimo {cfg.minimoMembrosBanca} membros — art. 37, §1º)
          </div>
          {usuarios.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum usuário ativo no órgão. Cadastre os servidores em Usuários.</p>
          ) : (
            <div className="grid gap-1 sm:grid-cols-2">
              {usuarios.map((u) => (
                <label key={u.id} className="flex items-center gap-2 rounded border px-2 py-1 text-sm">
                  <input
                    type="checkbox"
                    checked={banca.includes(u.id)}
                    disabled={!cfg.podeEditarComissao}
                    onChange={(e) => setBanca((b) => (e.target.checked ? [...b, u.id] : b.filter((x) => x !== u.id)))}
                  />
                  <span className="truncate">
                    {u.nome}
                    {u.cargo ? <span className="text-xs text-slate-500"> — {u.cargo}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          )}
          {cfg.podeEditarComissao && (
            <Button variant="outline" onClick={salvarBanca} disabled={ocupado || banca.length === 0}>
              Designar banca ({banca.length})
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
