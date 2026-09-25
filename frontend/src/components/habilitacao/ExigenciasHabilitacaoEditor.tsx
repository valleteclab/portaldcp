'use client'

import { useCallback, useEffect, useState } from 'react'
import { Lock, Plus, RefreshCw, Save, Trash2, Wand2 } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Exigencia, ORDEM_CATEGORIAS, ROTULO_CATEGORIA, ROTULO_TIPO_DOC, mensagemDeErro, porCategoria } from './comum'

/**
 * EXIGÊNCIAS DE HABILITAÇÃO DO EDITAL (plano E4 item 1 — Lei 14.133/2021
 * arts. 62–69). Parte do modelo padrão do objeto (bens, serviços, obras,
 * dispensa) e o órgão ajusta: categoria, descrição, obrigatória, documento do
 * registro cadastral que a atende (art. 70) e se exige validade. Editável só
 * na fase interna; depois da publicação fica congelada (retificação — E7).
 */

interface Modelo { chave: string; rotulo: string }
interface Resposta {
  licitacaoId: string
  editavel: boolean
  motivoCongelada: string | null
  modeloPadrao: string
  inversaoFases: boolean
  exigencias: Exigencia[]
}

type Linha = Omit<Exigencia, 'id' | 'ordem'> & { id?: string | null; chave: string }

const novaLinha = (categoria = 'JURIDICA'): Linha => ({
  chave: Math.random().toString(36).slice(2),
  categoria,
  descricao: '',
  base_legal: '',
  obrigatorio: true,
  aceita_registro_cadastral: true,
  tipos_documento_cadastro: [],
  exige_validade: false,
})

export function ExigenciasHabilitacaoEditor({ licitacaoId, className }: { licitacaoId: string; className?: string }) {
  const [dados, setDados] = useState<Resposta | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [modelos, setModelos] = useState<Modelo[]>([])
  const [modelo, setModelo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const aplicarResposta = (r: Resposta) => {
    setDados(r)
    setLinhas(r.exigencias.map((e) => ({ ...e, base_legal: e.base_legal ?? '', chave: e.id })))
    setModelo((m) => m || r.modeloPadrao)
  }

  const carregar = useCallback(async () => {
    const [ex, md] = await Promise.all([
      authFetch(`${API_URL}/api/habilitacao/licitacao/${licitacaoId}/exigencias`),
      authFetch(`${API_URL}/api/habilitacao/modelos`),
    ])
    if (ex.ok) aplicarResposta(await ex.json())
    if (md.ok) setModelos(((await md.json()).modelos ?? []).map((m: any) => ({ chave: m.chave, rotulo: m.rotulo })))
  }, [licitacaoId])

  useEffect(() => {
    carregar().catch(() => setErro('Não foi possível carregar as exigências de habilitação'))
  }, [carregar])

  const atualizar = (chave: string, campo: keyof Linha, valor: any) =>
    setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, [campo]: valor } : l)))

  const alternarTipo = (chave: string, tipo: string) =>
    setLinhas((ls) =>
      ls.map((l) =>
        l.chave !== chave
          ? l
          : { ...l, tipos_documento_cadastro: l.tipos_documento_cadastro.includes(tipo) ? l.tipos_documento_cadastro.filter((t) => t !== tipo) : [...l.tipos_documento_cadastro, tipo] },
      ),
    )

  const enviar = async (url: string, metodo: 'PUT' | 'POST', corpo: unknown, sucesso: string) => {
    setSalvando(true)
    setErro(null)
    setOk(null)
    try {
      const res = await authFetch(`${API_URL}${url}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      if (!res.ok) throw new Error(await mensagemDeErro(res, 'Não foi possível salvar'))
      aplicarResposta(await res.json())
      setOk(sucesso)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setSalvando(false)
    }
  }

  const salvar = () =>
    enviar(
      `/api/habilitacao/licitacao/${licitacaoId}/exigencias`,
      'PUT',
      {
        exigencias: linhas.map(({ chave, ...l }) => ({ ...l, base_legal: l.base_legal || null })),
      },
      'Exigências salvas.',
    )

  const aplicarModelo = () => {
    if (!modelo) return
    if (!window.confirm('Substituir as exigências atuais pelo modelo escolhido?')) return
    enviar(`/api/habilitacao/licitacao/${licitacaoId}/exigencias/modelo`, 'POST', { modelo }, 'Modelo aplicado.')
  }

  const editavel = !!dados?.editavel
  const tipos = Object.keys(ROTULO_TIPO_DOC)

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Exigências de habilitação do edital
          {!editavel && dados && <Badge className="bg-slate-200 text-slate-700"><Lock className="mr-1 h-3 w-3" /> Congeladas</Badge>}
          {dados?.inversaoFases && <Badge className="bg-violet-100 text-violet-800">Inversão de fases</Badge>}
        </CardTitle>
        <CardDescription>
          Lei 14.133/2021, arts. 62–69. Marque o documento do registro cadastral que atende cada exigência: na convocação o
          sistema aproveita o que estiver válido no cadastro do licitante (art. 70) e ele envia só o que falta.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}
        {ok && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{ok}</div>}
        {dados?.motivoCongelada && <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">{dados.motivoCongelada}</div>}

        {editavel && (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-slate-600">Modelo padrão</label>
              <select className="block h-9 rounded-md border px-2 text-sm" value={modelo} onChange={(e) => setModelo(e.target.value)}>
                {modelos.map((m) => (
                  <option key={m.chave} value={m.chave}>{m.rotulo}</option>
                ))}
              </select>
            </div>
            <Button variant="outline" size="sm" onClick={aplicarModelo} disabled={salvando}>
              <Wand2 className="mr-1 h-4 w-4" /> Aplicar modelo
            </Button>
            <Button variant="ghost" size="sm" onClick={() => carregar()} disabled={salvando}>
              <RefreshCw className="mr-1 h-4 w-4" /> Descartar alterações
            </Button>
          </div>
        )}

        {porCategoria(linhas).map((g) => (
          <div key={g.categoria} className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ROTULO_CATEGORIA[g.categoria] ?? g.categoria}</div>
            {g.itens.map((l) => (
              <div key={l.chave} className="space-y-2 rounded-lg border p-3">
                <div className="flex flex-wrap gap-2">
                  <select
                    className="h-9 rounded-md border px-2 text-sm"
                    value={l.categoria}
                    disabled={!editavel}
                    onChange={(e) => atualizar(l.chave, 'categoria', e.target.value)}
                  >
                    {ORDEM_CATEGORIAS.map((c) => (
                      <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>
                    ))}
                  </select>
                  <Input className="min-w-[260px] flex-1" value={l.descricao} disabled={!editavel} placeholder="Documento exigido" onChange={(e) => atualizar(l.chave, 'descricao', e.target.value)} />
                  <Input className="w-56" value={l.base_legal ?? ''} disabled={!editavel} placeholder="Base legal" onChange={(e) => atualizar(l.chave, 'base_legal', e.target.value)} />
                  {editavel && (
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => setLinhas((ls) => ls.filter((x) => x.chave !== l.chave))}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={l.obrigatorio} disabled={!editavel} onChange={(e) => atualizar(l.chave, 'obrigatorio', e.target.checked)} /> Obrigatória
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={l.exige_validade} disabled={!editavel} onChange={(e) => atualizar(l.chave, 'exige_validade', e.target.checked)} /> Exige validade (certidão)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={l.aceita_registro_cadastral}
                      disabled={!editavel}
                      onChange={(e) => atualizar(l.chave, 'aceita_registro_cadastral', e.target.checked)}
                    />{' '}
                    Aceita o registro cadastral (art. 70)
                  </label>
                </div>
                {l.aceita_registro_cadastral && (
                  <div className="flex flex-wrap gap-1">
                    {tipos.map((t) => {
                      const marcado = l.tipos_documento_cadastro.includes(t)
                      return (
                        <button
                          key={t}
                          type="button"
                          disabled={!editavel}
                          onClick={() => alternarTipo(l.chave, t)}
                          className={`rounded-full border px-2 py-0.5 text-xs ${marcado ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-200 text-slate-500'} ${!editavel && !marcado ? 'hidden' : ''}`}
                        >
                          {ROTULO_TIPO_DOC[t]}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}

        {editavel && (
          <div className="flex justify-between">
            <Button variant="outline" size="sm" onClick={() => setLinhas((ls) => [...ls, novaLinha()])}>
              <Plus className="mr-1 h-4 w-4" /> Nova exigência
            </Button>
            <Button onClick={salvar} disabled={salvando}>
              <Save className="mr-1 h-4 w-4" /> {salvando ? 'Salvando...' : 'Salvar exigências'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
