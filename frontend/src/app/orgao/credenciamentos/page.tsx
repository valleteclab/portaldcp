'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Loader2, Plus, Trash2, Users } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import {
  HIPOTESES,
  REGRAS,
  REGRAS_POR_HIPOTESE,
  dataCurta,
  deInputLocal,
  erroDaResposta,
  moeda,
  situacaoCredenciamento,
} from '@/lib/credenciamento'

/**
 * CREDENCIAMENTOS DO ÓRGÃO (plano E7b): cada credenciamento é um PROCESSO
 * (licitação com modalidade CREDENCIAMENTO — fase interna, edital, PNCP,
 * cockpit). Aqui: a lista e o cadastro inicial com as regras do art. 79.
 */

interface ItemForm {
  descricao: string
  quantidade: string
  valor_unitario: string
}

export default function CredenciamentosOrgaoPage() {
  const router = useRouter()
  const [lista, setLista] = useState<any[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [novo, setNovo] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({
    numero_processo: '',
    objeto: '',
    tipo_contratacao: 'SERVICO',
    hipotese: 'PARALELA_NAO_EXCLUDENTE',
    regra_distribuicao: 'RODIZIO',
    vigencia_inicio: '',
    vigencia_fim: '',
    validade_credenciado_meses: '',
    prazo_denuncia_dias: '30',
    condicoes_padronizadas: '',
  })
  const [itens, setItens] = useState<ItemForm[]>([{ descricao: '', quantidade: '1', valor_unitario: '' }])

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/credenciamento`)
      if (!r.ok) throw new Error(await erroDaResposta(r, 'Erro ao carregar'))
      setLista(await r.json())
    } catch (e: any) {
      setErro(e.message)
      setLista([])
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const regrasDaHipotese = REGRAS_POR_HIPOTESE[form.hipotese] ?? []

  const criar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      const corpo = {
        ...form,
        vigencia_inicio: deInputLocal(form.vigencia_inicio),
        vigencia_fim: deInputLocal(form.vigencia_fim),
        validade_credenciado_meses: form.validade_credenciado_meses ? Number(form.validade_credenciado_meses) : null,
        prazo_denuncia_dias: form.prazo_denuncia_dias ? Number(form.prazo_denuncia_dias) : null,
        itens: itens
          .filter((i) => i.descricao.trim())
          .map((i) => ({ descricao: i.descricao.trim(), quantidade: Number(i.quantidade || 1), valor_unitario: Number(String(i.valor_unitario).replace(',', '.') || 0) })),
      }
      const r = await authFetch(`${API_URL}/api/credenciamento`, { method: 'POST', body: JSON.stringify(corpo) })
      if (!r.ok) throw new Error(await erroDaResposta(r, 'Erro ao criar o credenciamento'))
      const c = await r.json()
      router.push(`/orgao/credenciamentos/${c.id}`)
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Credenciamentos</h1>
          <p className="text-sm text-gray-600">
            Procedimento auxiliar (Lei 14.133/2021, arts. 78, I, e 79): edital de chamamento com inscrições abertas durante toda a vigência;
            as contratações dos credenciados são por inexigibilidade (art. 74, IV).
          </p>
        </div>
        <Button onClick={() => setNovo((v) => !v)}>
          <Plus className="w-4 h-4 mr-1" /> Novo credenciamento
        </Button>
      </div>

      {erro && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}

      {novo && (
        <Card>
          <CardHeader>
            <CardTitle>Novo credenciamento</CardTitle>
            <CardDescription>
              Cria o processo na fase interna. Depois: instrução (DFD, estimativa, autorização — art. 72), edital em PDF e publicação.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-3 gap-3">
              <label className="text-sm">
                Nº do processo
                <Input value={form.numero_processo} onChange={(e) => setForm({ ...form, numero_processo: e.target.value })} placeholder="gerado se vazio" />
              </label>
              <label className="text-sm md:col-span-2">
                Objeto
                <Input value={form.objeto} onChange={(e) => setForm({ ...form, objeto: e.target.value })} placeholder="Ex.: credenciamento de clínicas para consultas especializadas" />
              </label>
              <label className="text-sm">
                Hipótese (art. 79)
                <select
                  className="w-full border rounded h-9 px-2 text-sm"
                  value={form.hipotese}
                  onChange={(e) => setForm({ ...form, hipotese: e.target.value, regra_distribuicao: REGRAS_POR_HIPOTESE[e.target.value]?.[0] ?? '' })}
                >
                  {Object.entries(HIPOTESES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.rotulo}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-gray-500">{HIPOTESES[form.hipotese]?.descricao}</span>
              </label>
              <label className="text-sm">
                Distribuição da demanda
                <select className="w-full border rounded h-9 px-2 text-sm" value={form.regra_distribuicao} onChange={(e) => setForm({ ...form, regra_distribuicao: e.target.value })}>
                  {regrasDaHipotese.map((r) => (
                    <option key={r} value={r}>
                      {REGRAS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Tipo
                <select className="w-full border rounded h-9 px-2 text-sm" value={form.tipo_contratacao} onChange={(e) => setForm({ ...form, tipo_contratacao: e.target.value })}>
                  <option value="SERVICO">Serviço</option>
                  <option value="COMPRA">Compra</option>
                  <option value="SERVICO_ENGENHARIA">Serviço de engenharia</option>
                  <option value="LOCACAO">Locação</option>
                </select>
              </label>
              <label className="text-sm">
                Início da vigência (inscrições)
                <Input type="datetime-local" value={form.vigencia_inicio} onChange={(e) => setForm({ ...form, vigencia_inicio: e.target.value })} />
              </label>
              <label className="text-sm">
                Fim da vigência
                <Input type="datetime-local" value={form.vigencia_fim} onChange={(e) => setForm({ ...form, vigencia_fim: e.target.value })} />
              </label>
              <label className="text-sm">
                Validade do credenciamento (meses)
                <Input
                  type="number"
                  min={1}
                  value={form.validade_credenciado_meses}
                  onChange={(e) => setForm({ ...form, validade_credenciado_meses: e.target.value })}
                  placeholder="vazio = até o fim da vigência"
                />
              </label>
              <label className="text-sm">
                Aviso prévio da denúncia (dias — art. 79, par. único, VI)
                <Input type="number" min={1} value={form.prazo_denuncia_dias} onChange={(e) => setForm({ ...form, prazo_denuncia_dias: e.target.value })} />
              </label>
            </div>
            <label className="text-sm block">
              Condições padronizadas de contratação (art. 79, par. único, III)
              <Textarea rows={3} value={form.condicoes_padronizadas} onChange={(e) => setForm({ ...form, condicoes_padronizadas: e.target.value })} />
            </label>
            <div className="space-y-2">
              <div className="text-sm font-medium">
                Itens e valor da contratação {form.hipotese === 'MERCADO_FLUIDO' ? '(valor de referência — cotação no momento)' : '(tabela de remuneração fixada no edital)'}
              </div>
              {itens.map((it, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <Input className="col-span-7" placeholder="Descrição" value={it.descricao} onChange={(e) => setItens(itens.map((x, k) => (k === i ? { ...x, descricao: e.target.value } : x)))} />
                  <Input className="col-span-2" type="number" min={1} placeholder="Qtd. estimada" value={it.quantidade} onChange={(e) => setItens(itens.map((x, k) => (k === i ? { ...x, quantidade: e.target.value } : x)))} />
                  <Input className="col-span-2" placeholder="Valor unitário" value={it.valor_unitario} onChange={(e) => setItens(itens.map((x, k) => (k === i ? { ...x, valor_unitario: e.target.value } : x)))} />
                  <Button variant="ghost" size="icon" className="col-span-1" onClick={() => setItens(itens.filter((_, k) => k !== i))} disabled={itens.length === 1}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={() => setItens([...itens, { descricao: '', quantidade: '1', valor_unitario: '' }])}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Item
              </Button>
            </div>
            <div className="flex gap-2">
              <Button onClick={criar} disabled={salvando}>
                {salvando && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Criar processo
              </Button>
              <Button variant="ghost" onClick={() => setNovo(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {lista === null ? (
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
        </div>
      ) : lista.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-gray-500">Nenhum credenciamento cadastrado.</CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((c) => {
            const s = situacaoCredenciamento(c)
            return (
              <Card key={c.id} className="hover:shadow-sm">
                <CardContent className="p-4 flex items-start justify-between gap-4 flex-wrap">
                  <div className="space-y-1 min-w-0">
                    <div className="flex gap-2 items-center flex-wrap">
                      <Badge className={s.cor}>{s.label}</Badge>
                      {c.regra_rotulo && <Badge variant="outline">{c.regra_rotulo}</Badge>}
                      <span className="text-xs text-gray-500">
                        Processo {c.numero_processo} · Edital {c.numero_edital || '—'}
                      </span>
                    </div>
                    <div className="font-medium">{c.objeto}</div>
                    <div className="text-xs text-gray-500">
                      {c.hipotese_rotulo || 'Hipótese não definida'} · vigência {dataCurta(c.vigencia_inicio)} a {dataCurta(c.vigencia_fim)} · estimado {moeda(c.valor_total_estimado)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-xs text-gray-600 flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" /> {c.credenciados} credenciado(s) · {c.pendentes} em análise · {c.contratacoes} contratação(ões)
                    </div>
                    <Button asChild size="sm">
                      <Link href={`/orgao/credenciamentos/${c.id}`}>Abrir</Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
