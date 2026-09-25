'use client'
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ArrowLeft, CheckCircle, ExternalLink, FileText, Loader2, Scale, Send, Shuffle, Upload, Users, XCircle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { ExigenciasHabilitacaoEditor } from '@/components/habilitacao/ExigenciasHabilitacaoEditor'
import { ROTULO_ANALISE, abrirDocumento } from '@/components/habilitacao/comum'
import { FilaPncp } from '@/app/orgao/processos/[id]/FilaPncp'
import {
  HIPOTESES,
  REGRAS,
  STATUS_HABILITACAO,
  STATUS_INSCRICAO,
  dataCurta,
  dataHora,
  deInputLocal,
  erroDaResposta,
  moeda,
  paraInputLocal,
  situacaoCredenciamento,
} from '@/lib/credenciamento'

/**
 * PAINEL DO CREDENCIAMENTO (órgão dono — plano E7b). O credenciamento é um
 * processo da mesma base da licitação: fase interna (instrução do art. 72 —
 * cockpit do processo), edital em PDF, publicação pela máquina de estados e
 * PNCP pela fila. Aqui: regras do edital, inscrições (documentos pela
 * habilitação da E4, deferir/indeferir, recurso, descredenciar) e
 * contratações distribuídas pela regra do edital (rodízio, sorteio auditável,
 * divisão igualitária, escolha do beneficiário, cotação) com o contrato por
 * inexigibilidade (art. 74, IV).
 */

const FASES_INTERNAS = ['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA']

async function postar(url: string, corpo: any, padrao: string) {
  const r = await authFetch(`${API_URL}${url}`, { method: 'POST', body: JSON.stringify(corpo ?? {}) })
  if (!r.ok) throw new Error(await erroDaResposta(r, padrao))
  return r.json()
}

export default function CredenciamentoOrgaoPage() {
  const { id } = useParams<{ id: string }>()
  const [c, setC] = useState<any | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [instrucao, setInstrucao] = useState<any | null>(null)
  const [edital, setEdital] = useState<any | null>(null)
  const [historico, setHistorico] = useState<any[]>([])
  const [atualizacao, setAtualizacao] = useState(0)
  const inputPdf = useRef<HTMLInputElement>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await authFetch(`${API_URL}/api/credenciamento/${id}`)
      if (!r.ok) throw new Error(await erroDaResposta(r, 'Credenciamento não encontrado'))
      const v = await r.json()
      setC(v)
      setAtualizacao((n) => n + 1)
      const [ri, re, rh] = await Promise.all([
        authFetch(`${API_URL}/api/fase-interna/${id}/instrucao`),
        authFetch(`${API_URL}/api/publicacao/licitacao/${id}/edital`),
        authFetch(`${API_URL}/api/licitacoes/${id}/transicoes`),
      ])
      if (ri.ok) setInstrucao(await ri.json())
      if (re.ok) setEdital(await re.json())
      if (rh.ok) setHistorico(await rh.json())
    } catch (e: any) {
      setErro(e.message)
    }
  }, [id])

  useEffect(() => {
    carregar()
  }, [carregar])

  const executar = async (chave: string, fn: () => Promise<any>, ok?: string) => {
    setOcupado(chave)
    setErro(null)
    setAviso(null)
    try {
      await fn()
      if (ok) setAviso(ok)
      await carregar()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setOcupado(null)
    }
  }

  if (!c) {
    return (
      <div className="p-6 text-gray-500 flex items-center gap-2">
        {erro ? <span className="text-red-600">{erro}</span> : <><Loader2 className="w-4 h-4 animate-spin" /> Carregando...</>}
      </div>
    )
  }

  const interno = FASES_INTERNAS.includes(c.fase)
  const s = situacaoCredenciamento(c)
  const cfg = c.configuracao || {}

  const enviarEdital = async (arquivo?: File) => {
    if (!arquivo) return
    await executar(
      'edital',
      async () => {
        const fd = new FormData()
        fd.append('arquivo', arquivo)
        const r = await authFetch(`${API_URL}/api/publicacao/licitacao/${id}/edital`, { method: 'POST', body: fd })
        if (!r.ok) throw new Error(await erroDaResposta(r, 'Erro ao anexar o edital'))
      },
      'Edital anexado.',
    )
  }

  const publicar = () =>
    executar(
      'publicar',
      async () => {
        const r = await authFetch(`${API_URL}/api/credenciamento/${id}/publicar`, { method: 'PATCH', body: JSON.stringify({}) })
        if (!r.ok) throw new Error(await erroDaResposta(r, 'Não foi possível publicar'))
      },
      'Edital de credenciamento publicado — PNCP enfileirado.',
    )

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <Link href="/orgao/credenciamentos" className="text-sm text-blue-600 inline-flex items-center gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Credenciamentos
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge className={s.cor}>{s.label}</Badge>
            <Badge variant="outline">{HIPOTESES[cfg.hipotese]?.rotulo ?? '—'}</Badge>
            <Badge variant="outline">{REGRAS[cfg.regra_distribuicao] ?? '—'}</Badge>
          </div>
          <h1 className="text-xl font-bold">{c.objeto}</h1>
          <p className="text-sm text-gray-600">
            Processo {c.numero_processo} · Edital {c.numero_edital || '—'} · vigência {dataHora(cfg.vigencia_inicio)} a {dataHora(cfg.vigencia_fim)}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/orgao/processos/${id}`}>Cockpit do processo</Link>
          </Button>
          {!interno && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/credenciamento/${id}`} target="_blank">
                Página pública <ExternalLink className="w-3 h-3 ml-1" />
              </Link>
            </Button>
          )}
        </div>
      </div>

      {erro && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{erro}</div>}
      {aviso && <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-700">{aviso}</div>}

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          ['Em análise', c.estatisticas?.pendentes],
          ['Credenciados', c.estatisticas?.credenciados],
          ['Indeferidos', c.estatisticas?.indeferidos],
          ['Contratações', c.estatisticas?.contratacoes],
          ['Valor contratado', moeda(c.estatisticas?.valor_contratado)],
        ].map(([rot, val]) => (
          <Card key={String(rot)}>
            <CardContent className="p-3">
              <div className="text-xs text-gray-500">{rot}</div>
              <div className="text-lg font-semibold">{val ?? 0}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue={interno ? 'edital' : 'inscricoes'}>
        <TabsList>
          <TabsTrigger value="edital">Edital e regras</TabsTrigger>
          <TabsTrigger value="inscricoes">Inscrições ({c.inscricoes?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="contratacoes">Contratações ({c.contratacoes?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ================= EDITAL ================= */}
        <TabsContent value="edital" className="space-y-4">
          {interno && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Publicação do edital de chamamento</CardTitle>
                <CardDescription>
                  Instrução do art. 72 (DFD, estimativa, autorização), edital em PDF e as regras do art. 79. Publicar leva o edital ao PNCP
                  (modalidade Credenciamento) e abre as inscrições no início da vigência.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <b>Instrução (art. 72):</b>{' '}
                  {instrucao?.pode_divulgar ? (
                    <span className="text-green-700">completa</span>
                  ) : (
                    <span className="text-amber-700">pendente — {(instrucao?.pendentes ?? []).join('; ') || 'carregando'}</span>
                  )}{' '}
                  <Link className="text-blue-600" href={`/orgao/fase-interna/processos/${id}`}>
                    abrir documentos
                  </Link>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <b>Edital:</b>
                  {edital?.vigente ? (
                    <span>
                      {edital.vigente.titulo || 'Edital'} (versão {edital.vigente.versao})
                    </span>
                  ) : (
                    <span className="text-amber-700">não anexado</span>
                  )}
                  <input ref={inputPdf} type="file" accept="application/pdf" className="hidden" onChange={(e) => enviarEdital(e.target.files?.[0])} />
                  <Button size="sm" variant="outline" onClick={() => inputPdf.current?.click()} disabled={ocupado === 'edital'}>
                    <Upload className="w-3.5 h-3.5 mr-1" /> {edital?.vigente ? 'Substituir PDF' : 'Anexar PDF'}
                  </Button>
                </div>
                {c.pendencias_edital?.length > 0 && (
                  <ul className="list-disc pl-5 text-amber-800">
                    {c.pendencias_edital.map((p: string, i: number) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                )}
                <Button onClick={publicar} disabled={ocupado === 'publicar'}>
                  {ocupado === 'publicar' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Send className="w-4 h-4 mr-1" />} Publicar edital de credenciamento
                </Button>
              </CardContent>
            </Card>
          )}

          <RegrasEdital c={c} interno={interno} onSalvo={carregar} />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Exigências de habilitação do edital</CardTitle>
              <CardDescription>Documentos que cada interessado apresenta na inscrição (registro cadastral aproveitado — art. 70).</CardDescription>
            </CardHeader>
            <CardContent>
              <ExigenciasHabilitacaoEditor licitacaoId={id} />
            </CardContent>
          </Card>

          {!interno && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">PNCP</CardTitle>
              </CardHeader>
              <CardContent>
                <FilaPncp licitacaoId={id} atualizacao={atualizacao} semItens={<span className="text-sm text-gray-500">Nada enviado ao PNCP.</span>} />
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ================= INSCRIÇÕES ================= */}
        <TabsContent value="inscricoes" className="space-y-3">
          {!c.inscricoes?.length && (
            <Card>
              <CardContent className="py-8 text-center text-gray-500">Nenhuma inscrição.</CardContent>
            </Card>
          )}
          {c.inscricoes?.map((i: any) => (
            <InscricaoCard key={i.id} i={i} executar={executar} ocupado={ocupado} />
          ))}
        </TabsContent>

        {/* ================= CONTRATAÇÕES ================= */}
        <TabsContent value="contratacoes" className="space-y-4">
          {c.fase === 'ACOLHIMENTO_PROPOSTAS' && c.situacao === 'ATIVA' ? (
            <NovaContratacao c={c} executar={executar} ocupado={ocupado} />
          ) : (
            <p className="text-sm text-gray-500">Contratações só durante a vigência, com as inscrições abertas.</p>
          )}
          {c.contratacoes?.map((k: any) => (
            <ContratacaoCard key={k.id} k={k} executar={executar} />
          ))}
        </TabsContent>

        {/* ================= HISTÓRICO ================= */}
        <TabsContent value="historico">
          <Card>
            <CardContent className="p-4 space-y-1 text-sm">
              {historico.map((h: any) => (
                <div key={h.id} className="flex gap-2 border-b last:border-0 py-1">
                  <span className="text-gray-500 w-36 shrink-0">{dataHora(h.created_at)}</span>
                  <span className="font-medium w-64 shrink-0">{h.ato}</span>
                  <span className="text-gray-600">
                    {h.fase_de || '—'} → {h.fase_para} · {h.situacao_para}
                    {h.motivo ? ` — ${h.motivo}` : ''}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ---------------------------------------------------------------------------

function RegrasEdital({ c, interno, onSalvo }: { c: any; interno: boolean; onSalvo: () => void }) {
  const cfg = c.configuracao || {}
  const [editando, setEditando] = useState(false)
  const [f, setF] = useState<any>({})
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  const abrir = () => {
    setF({
      objeto: c.objeto,
      hipotese: cfg.hipotese,
      regra_distribuicao: cfg.regra_distribuicao,
      vigencia_inicio: paraInputLocal(cfg.vigencia_inicio),
      vigencia_fim: paraInputLocal(cfg.vigencia_fim),
      validade_credenciado_meses: cfg.validade_credenciado_meses ?? '',
      prazo_denuncia_dias: cfg.prazo_denuncia_dias ?? '',
      condicoes_padronizadas: cfg.condicoes_padronizadas ?? '',
      regras_distribuicao_texto: cfg.regras_distribuicao_texto ?? '',
      itens: (c.itens || []).map((i: any) => ({ descricao: i.descricao_resumida, quantidade: i.quantidade, valor_unitario: i.valor_unitario_estimado })),
    })
    setEditando(true)
  }

  const salvar = async () => {
    setSalvando(true)
    setErro(null)
    try {
      const corpo = {
        ...f,
        vigencia_inicio: deInputLocal(f.vigencia_inicio),
        vigencia_fim: deInputLocal(f.vigencia_fim),
        validade_credenciado_meses: f.validade_credenciado_meses === '' ? null : Number(f.validade_credenciado_meses),
        prazo_denuncia_dias: f.prazo_denuncia_dias === '' ? null : Number(f.prazo_denuncia_dias),
        itens: f.itens.map((i: any) => ({ descricao: i.descricao, quantidade: Number(i.quantidade), valor_unitario: Number(String(i.valor_unitario).replace(',', '.')) })),
      }
      const r = await authFetch(`${API_URL}/api/credenciamento/${c.id}`, { method: 'PUT', body: JSON.stringify(corpo) })
      if (!r.ok) throw new Error(await erroDaResposta(r, 'Erro ao salvar'))
      setEditando(false)
      onSalvo()
    } catch (e: any) {
      setErro(e.message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div>
          <CardTitle className="text-base">Regras do edital (art. 79)</CardTitle>
          <CardDescription>{HIPOTESES[cfg.hipotese]?.descricao}</CardDescription>
        </div>
        {interno && !editando && (
          <Button size="sm" variant="outline" onClick={abrir}>
            Editar
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {erro && <div className="text-red-600">{erro}</div>}
        {!editando ? (
          <>
            <div className="grid md:grid-cols-2 gap-2">
              <div>
                <b>Hipótese:</b> {HIPOTESES[cfg.hipotese]?.rotulo ?? '—'}
              </div>
              <div>
                <b>Distribuição:</b> {REGRAS[cfg.regra_distribuicao] ?? '—'}
              </div>
              <div>
                <b>Vigência / inscrições:</b> {dataHora(cfg.vigencia_inicio)} a {dataHora(cfg.vigencia_fim)}
              </div>
              <div>
                <b>Validade do credenciamento:</b> {cfg.validade_credenciado_meses ? `${cfg.validade_credenciado_meses} mês(es)` : 'até o fim da vigência'}
              </div>
              <div>
                <b>Aviso prévio da denúncia:</b> {cfg.prazo_denuncia_dias ? `${cfg.prazo_denuncia_dias} dia(s)` : '—'}
              </div>
            </div>
            <div>
              <b>Condições padronizadas:</b>
              <p className="whitespace-pre-line text-gray-700">{cfg.condicoes_padronizadas || '—'}</p>
            </div>
            <table className="w-full text-sm border">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2">Item</th>
                  <th className="text-right p-2">Qtd. estimada</th>
                  <th className="text-right p-2">Valor unitário</th>
                </tr>
              </thead>
              <tbody>
                {(c.itens || []).map((i: any) => (
                  <tr key={i.id} className="border-t">
                    <td className="p-2">
                      {i.numero_item}. {i.descricao_resumida}
                    </td>
                    <td className="p-2 text-right">{i.quantidade}</td>
                    <td className="p-2 text-right">{moeda(i.valor_unitario_estimado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <div className="space-y-3">
            <label className="block">
              Objeto
              <Input value={f.objeto} onChange={(e) => setF({ ...f, objeto: e.target.value })} />
            </label>
            <div className="grid md:grid-cols-2 gap-3">
              <label>
                Hipótese
                <select className="w-full border rounded h-9 px-2" value={f.hipotese} onChange={(e) => setF({ ...f, hipotese: e.target.value, regra_distribuicao: '' })}>
                  {Object.entries(HIPOTESES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Distribuição
                <select className="w-full border rounded h-9 px-2" value={f.regra_distribuicao} onChange={(e) => setF({ ...f, regra_distribuicao: e.target.value })}>
                  <option value="">(padrão da hipótese)</option>
                  {Object.entries(REGRAS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Início da vigência
                <Input type="datetime-local" value={f.vigencia_inicio} onChange={(e) => setF({ ...f, vigencia_inicio: e.target.value })} />
              </label>
              <label>
                Fim da vigência
                <Input type="datetime-local" value={f.vigencia_fim} onChange={(e) => setF({ ...f, vigencia_fim: e.target.value })} />
              </label>
              <label>
                Validade (meses)
                <Input type="number" value={f.validade_credenciado_meses} onChange={(e) => setF({ ...f, validade_credenciado_meses: e.target.value })} />
              </label>
              <label>
                Aviso da denúncia (dias)
                <Input type="number" value={f.prazo_denuncia_dias} onChange={(e) => setF({ ...f, prazo_denuncia_dias: e.target.value })} />
              </label>
            </div>
            <label className="block">
              Condições padronizadas
              <Textarea rows={3} value={f.condicoes_padronizadas} onChange={(e) => setF({ ...f, condicoes_padronizadas: e.target.value })} />
            </label>
            <div className="space-y-2">
              {f.itens.map((it: any, k: number) => (
                <div key={k} className="grid grid-cols-12 gap-2">
                  <Input className="col-span-7" value={it.descricao} onChange={(e) => setF({ ...f, itens: f.itens.map((x: any, j: number) => (j === k ? { ...x, descricao: e.target.value } : x)) })} />
                  <Input className="col-span-2" type="number" value={it.quantidade} onChange={(e) => setF({ ...f, itens: f.itens.map((x: any, j: number) => (j === k ? { ...x, quantidade: e.target.value } : x)) })} />
                  <Input className="col-span-3" value={it.valor_unitario} onChange={(e) => setF({ ...f, itens: f.itens.map((x: any, j: number) => (j === k ? { ...x, valor_unitario: e.target.value } : x)) })} />
                </div>
              ))}
              <Button size="sm" variant="outline" onClick={() => setF({ ...f, itens: [...f.itens, { descricao: '', quantidade: 1, valor_unitario: '' }] })}>
                Item
              </Button>
            </div>
            <div className="flex gap-2">
              <Button onClick={salvar} disabled={salvando}>
                Salvar
              </Button>
              <Button variant="ghost" onClick={() => setEditando(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function InscricaoCard({ i, executar, ocupado }: { i: any; executar: (k: string, fn: () => Promise<any>, ok?: string) => Promise<void>; ocupado: string | null }) {
  const [aberto, setAberto] = useState(false)
  const [hab, setHab] = useState<any | null>(null)
  const [texto, setTexto] = useState('')
  const [motivoDoc, setMotivoDoc] = useState<Record<string, string>>({})
  const [dil, setDil] = useState<{ motivo: string; prazoHoras: string; exigencias: string[] }>({ motivo: '', prazoHoras: '48', exigencias: [] })
  const [aut, setAut] = useState({ nome: '', cargo: '' })
  const st = STATUS_INSCRICAO[i.status] ?? { label: i.status, cor: '' }

  const baixarRazoes = async (inscricaoId: string, nome: string) => {
    const r = await authFetch(`${API_URL}/api/credenciamento/inscricoes/${inscricaoId}/recurso/arquivo`)
    if (!r.ok) return
    const url = URL.createObjectURL(await r.blob())
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.click()
    URL.revokeObjectURL(url)
  }

  const carregarHab = useCallback(async () => {
    const r = await authFetch(`${API_URL}/api/credenciamento/inscricoes/${i.id}/habilitacao`)
    if (r.ok) setHab((await r.json()).habilitacao)
  }, [i.id])

  useEffect(() => {
    if (aberto) carregarHab()
  }, [aberto, carregarHab])

  const analisar = (docId: string, resultado: string) =>
    executar(`doc-${docId}`, async () => {
      await postar(`/api/habilitacao/documentos/${docId}/analisar`, { resultado, motivo: motivoDoc[docId] }, 'Erro na análise')
      await carregarHab()
    })

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={st.cor}>{st.label}</Badge>
              {i.ordem_rodizio != null && <Badge variant="outline">Rodízio nº {i.ordem_rodizio}</Badge>}
              {i.origem === 'LEGADO' && <Badge variant="outline">Cadastro anterior</Badge>}
              {i.habilitacao_status && <span className="text-xs text-gray-500">{STATUS_HABILITACAO[i.habilitacao_status] ?? i.habilitacao_status}</span>}
            </div>
            <div className="font-medium mt-1">
              {i.fornecedor_razao_social} <span className="text-xs text-gray-500">{i.fornecedor_cnpj}</span>
            </div>
            <div className="text-xs text-gray-500">
              Inscrita em {dataHora(i.inscrita_em)}
              {i.credenciado_em && ` · credenciada em ${dataHora(i.credenciado_em)} · validade ${dataCurta(i.validade_ate)}`}
              {i.decisao_motivo && ` · ${i.decisao_motivo}`}
            </div>
            {i.descredenciamento && (
              <div className="text-xs text-gray-600">
                {i.descredenciamento.iniciativa === 'CREDENCIADO_DENUNCIA' ? 'Denúncia do credenciado' : 'Descredenciamento'}: {i.descredenciamento.motivo} (efeitos em{' '}
                {dataHora(i.descredenciamento.efeitos_em)})
              </div>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setAberto((v) => !v)}>
            {aberto ? 'Fechar' : 'Analisar'}
          </Button>
        </div>

        {aberto && (
          <div className="border-t pt-3 space-y-3 text-sm">
            {i.origem === 'LEGADO' && i.legado && (
              <pre className="text-xs bg-gray-50 p-2 rounded overflow-auto">{JSON.stringify(i.legado, null, 2)}</pre>
            )}
            {hab && (
              <div className="space-y-2">
                {hab.exigencias.map((e: any) => (
                  <div key={e.id} className="border rounded p-2">
                    <div className="flex justify-between gap-2">
                      <span>
                        {e.descricao} {e.obrigatorio && <span className="text-xs text-amber-700">(obrigatória)</span>}
                      </span>
                      <span className="text-xs text-gray-500">{e.situacao}</span>
                    </div>
                    {e.documentos.map((d: any) => (
                      <div key={d.id} className="flex items-center gap-2 flex-wrap mt-1 text-xs">
                        <button className="text-blue-600 underline" onClick={() => abrirDocumento(d.id)}>
                          {d.arquivo?.nome || d.cadastro?.tipo || 'documento'}
                        </button>
                        <span className={ROTULO_ANALISE[d.analise]?.cls}>{ROTULO_ANALISE[d.analise]?.label ?? d.analise}</span>
                        {hab.podeAnalisar && d.analise === 'PENDENTE' && (
                          <>
                            <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => analisar(d.id, 'ATENDE')} disabled={ocupado === `doc-${d.id}`}>
                              Atende
                            </Button>
                            <Input className="h-6 w-56 text-xs" placeholder="motivo (não atende)" value={motivoDoc[d.id] ?? ''} onChange={(ev) => setMotivoDoc({ ...motivoDoc, [d.id]: ev.target.value })} />
                            <Button size="sm" variant="outline" className="h-6 px-2" onClick={() => analisar(d.id, 'NAO_ATENDE')}>
                              Não atende
                            </Button>
                          </>
                        )}
                      </div>
                    ))}
                    {!e.documentos.length && <div className="text-xs text-gray-400">sem documento</div>}
                    {hab.podeAnalisar && (
                      <label className="text-xs inline-flex items-center gap-1 mt-1">
                        <input
                          type="checkbox"
                          checked={dil.exigencias.includes(e.id)}
                          onChange={(ev) => setDil({ ...dil, exigencias: ev.target.checked ? [...dil.exigencias, e.id] : dil.exigencias.filter((x) => x !== e.id) })}
                        />
                        incluir na diligência
                      </label>
                    )}
                  </div>
                ))}
                {hab.pendencias?.length > 0 && <div className="text-xs text-amber-700">Pendências: {hab.pendencias.join(' • ')}</div>}
                {hab.podeAnalisar && dil.exigencias.length > 0 && (
                  <div className="flex gap-2 items-center flex-wrap">
                    <Input className="w-80" placeholder="motivo da diligência (art. 64)" value={dil.motivo} onChange={(e) => setDil({ ...dil, motivo: e.target.value })} />
                    <Input className="w-24" type="number" value={dil.prazoHoras} onChange={(e) => setDil({ ...dil, prazoHoras: e.target.value })} />
                    <span className="text-xs">horas</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        executar('dil', async () => {
                          await postar(`/api/habilitacao/${hab.id}/diligencia`, { motivo: dil.motivo, prazoHoras: Number(dil.prazoHoras), exigenciaIds: dil.exigencias }, 'Erro na diligência')
                          await carregarHab()
                        }, 'Diligência aberta.')
                      }
                    >
                      Abrir diligência
                    </Button>
                  </div>
                )}
              </div>
            )}

            <Textarea rows={2} placeholder="Observação / motivo / fundamentação" value={texto} onChange={(e) => setTexto(e.target.value)} />
            <div className="flex gap-2 flex-wrap">
              {i.status === 'PENDENTE' && (
                <>
                  <Button size="sm" onClick={() => executar(`d-${i.id}`, () => postar(`/api/credenciamento/inscricoes/${i.id}/deferir`, { observacao: texto }, 'Erro ao deferir'), 'Credenciado.')}>
                    <CheckCircle className="w-3.5 h-3.5 mr-1" /> Deferir (credenciar)
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => executar(`i-${i.id}`, () => postar(`/api/credenciamento/inscricoes/${i.id}/indeferir`, { motivo: texto }, 'Erro ao indeferir'), 'Inscrição indeferida — prazo recursal aberto.')}>
                    <XCircle className="w-3.5 h-3.5 mr-1" /> Indeferir
                  </Button>
                </>
              )}
              {i.recurso?.status && (
                <div className="w-full text-xs bg-amber-50 border border-amber-200 rounded p-2 space-y-1">
                  <div>
                    <b>Recurso (art. 165, I, &quot;a&quot;):</b> {i.recurso.razoes}{' '}
                    {i.recurso.arquivo && (
                      <button className="text-blue-600 underline" onClick={() => baixarRazoes(i.id, i.recurso.arquivo.nome)}>
                        {i.recurso.arquivo.nome}
                      </button>
                    )}
                  </div>
                  {i.recurso.status === 'INTERPOSTO' && (
                    <div className={i.recurso.reconsideracaoAtrasada ? 'text-red-700' : ''}>Reconsideração do agente até {dataHora(i.recurso.prazo_reconsideracao)} (3 dias úteis — art. 165, §2º)</div>
                  )}
                  {i.recurso.reconsideracao && <div>Agente: {i.recurso.reconsideracao}</div>}
                  {i.recurso.status === 'AGUARDANDO_AUTORIDADE' && (
                    <div className={i.recurso.autoridadeAtrasada ? 'text-red-700' : ''}>Aguardando a autoridade superior até {dataHora(i.recurso.prazo_autoridade)} (10 dias úteis)</div>
                  )}
                  {(i.recurso.status === 'PROVIDO' || i.recurso.status === 'IMPROVIDO') && (
                    <div>
                      {i.recurso.status === 'PROVIDO' ? 'Provido' : 'Não provido'} ({i.recurso.instancia === 'AUTORIDADE' ? `autoridade: ${i.recurso.autoridade?.nome}, ${i.recurso.autoridade?.cargo}` : 'reconsideração do agente'}) — {i.recurso.decisao}
                    </div>
                  )}
                </div>
              )}
              {i.recurso?.status === 'INTERPOSTO' && (
                <>
                  <Button size="sm" onClick={() => executar('rec', () => postar(`/api/credenciamento/inscricoes/${i.id}/recurso/reconsiderar`, { reconsiderar: true, fundamentacao: texto }, 'Erro'), 'Recurso provido na reconsideração — credenciado.')}>
                    <Scale className="w-3.5 h-3.5 mr-1" /> Reconsiderar (dar provimento)
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => executar('rec', () => postar(`/api/credenciamento/inscricoes/${i.id}/recurso/reconsiderar`, { reconsiderar: false, fundamentacao: texto }, 'Erro'), 'Decisão mantida — recurso encaminhado à autoridade superior.')}>
                    Manter e encaminhar à autoridade
                  </Button>
                </>
              )}
              {i.recurso?.status === 'AGUARDANDO_AUTORIDADE' && (
                <div className="w-full flex gap-2 flex-wrap items-center">
                  <Input className="w-56" placeholder="Nome da autoridade" value={aut.nome} onChange={(e) => setAut({ ...aut, nome: e.target.value })} />
                  <Input className="w-56" placeholder="Cargo" value={aut.cargo} onChange={(e) => setAut({ ...aut, cargo: e.target.value })} />
                  <Button size="sm" onClick={() => executar('aut', () => postar(`/api/credenciamento/inscricoes/${i.id}/recurso/decisao-autoridade`, { provido: true, fundamentacao: texto, ...aut }, 'Erro'), 'Recurso provido pela autoridade — credenciado.')}>
                    Autoridade: dar provimento
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => executar('aut', () => postar(`/api/credenciamento/inscricoes/${i.id}/recurso/decisao-autoridade`, { provido: false, fundamentacao: texto, ...aut }, 'Erro'), 'Recurso não provido pela autoridade.')}>
                    Autoridade: negar provimento
                  </Button>
                  <span className="text-xs text-gray-500">Conta do órgão (informe nome e cargo) ou usuário administrador — não quem manteve a decisão.</span>
                </div>
              )}
              {i.status === 'INDEFERIDO' && i.recurso && !i.recurso.status && (
                <span className="text-xs text-gray-500">Prazo recursal até {dataHora(i.recurso.prazo_ate)}</span>
              )}
              {i.status === 'CREDENCIADO' && !i.descredenciamento && (
                <>
                  <Button size="sm" variant="destructive" onClick={() => executar('desc', () => postar(`/api/credenciamento/inscricoes/${i.id}/descredenciar`, { motivo: texto, iniciativa: 'ADMINISTRACAO_DESCUMPRIMENTO' }, 'Erro'), 'Descredenciado.')}>
                    Descredenciar (descumprimento)
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => executar('desc', () => postar(`/api/credenciamento/inscricoes/${i.id}/descredenciar`, { motivo: texto, iniciativa: 'ADMINISTRACAO_DENUNCIA' }, 'Erro'), 'Denúncia registrada (efeito após o aviso prévio).')}>
                    Denunciar (com aviso prévio)
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------------------------

function NovaContratacao({ c, executar, ocupado }: { c: any; executar: (k: string, fn: () => Promise<any>, ok?: string) => Promise<void>; ocupado: string | null }) {
  const regra = c.configuracao?.regra_distribuicao
  const aptos = (c.inscricoes || []).filter((i: any) => i.apto_a_contratar)
  const [descricao, setDescricao] = useState('')
  const [prazo, setPrazo] = useState('30')
  const [linhas, setLinhas] = useState<Array<{ item_id: string; quantidade: string }>>([{ item_id: c.itens?.[0]?.id ?? '', quantidade: '1' }])
  const [benef, setBenef] = useState({ inscricao_id: '', nome: '', documento: '', justificativa: '' })
  const [cot, setCot] = useState<Record<string, { valor: string; fonte: string }>>({})

  const enviar = () =>
    executar(
      'contratar',
      () =>
        postar(
          `/api/credenciamento/${c.id}/contratacoes`,
          {
            descricao,
            prazo_execucao_dias: Number(prazo),
            itens: linhas.filter((l) => l.item_id).map((l) => ({ item_id: l.item_id, quantidade: Number(l.quantidade) })),
            ...(regra === 'ESCOLHA_BENEFICIARIO' ? { beneficiario: benef } : {}),
            ...(regra === 'COTACAO_MERCADO'
              ? {
                  cotacoes: Object.entries(cot)
                    .filter(([, v]) => v.valor)
                    .map(([inscricao_id, v]) => ({ inscricao_id, valor_unitario: Number(v.valor.replace(',', '.')), fonte: v.fonte })),
                }
              : {}),
          },
          'Erro na contratação',
        ),
      'Demanda distribuída e contrato gerado (aguardando assinatura).',
    )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shuffle className="w-4 h-4" /> Nova contratação — {REGRAS[regra] ?? regra}
        </CardTitle>
        <CardDescription>
          O sistema escolhe o credenciado pela regra do edital e registra o critério (auditável). Contrato por inexigibilidade (art. 74, IV), enviado ao PNCP depois de
          assinado. {aptos.length} credenciado(s) apto(s).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <Input placeholder="Descrição da demanda" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        {linhas.map((l, k) => (
          <div key={k} className="flex gap-2">
            <select className="border rounded h-9 px-2 flex-1" value={l.item_id} onChange={(e) => setLinhas(linhas.map((x, j) => (j === k ? { ...x, item_id: e.target.value } : x)))}>
              {(c.itens || []).map((it: any) => (
                <option key={it.id} value={it.id}>
                  {it.numero_item}. {it.descricao_resumida} — {moeda(it.valor_unitario_estimado)}
                </option>
              ))}
            </select>
            <Input className="w-28" type="number" min={1} value={l.quantidade} onChange={(e) => setLinhas(linhas.map((x, j) => (j === k ? { ...x, quantidade: e.target.value } : x)))} />
          </div>
        ))}
        {regra !== 'COTACAO_MERCADO' && (
          <Button size="sm" variant="outline" onClick={() => setLinhas([...linhas, { item_id: c.itens?.[0]?.id ?? '', quantidade: '1' }])}>
            Outro item
          </Button>
        )}
        <label className="block">
          Prazo de execução (dias)
          <Input className="w-28" type="number" value={prazo} onChange={(e) => setPrazo(e.target.value)} />
        </label>
        {regra === 'ESCOLHA_BENEFICIARIO' && (
          <div className="grid md:grid-cols-2 gap-2 border rounded p-2">
            <select className="border rounded h-9 px-2" value={benef.inscricao_id} onChange={(e) => setBenef({ ...benef, inscricao_id: e.target.value })}>
              <option value="">Credenciado escolhido pelo beneficiário</option>
              {aptos.map((a: any) => (
                <option key={a.id} value={a.id}>
                  {a.fornecedor_razao_social}
                </option>
              ))}
            </select>
            <Input placeholder="Beneficiário (quem escolheu)" value={benef.nome} onChange={(e) => setBenef({ ...benef, nome: e.target.value })} />
            <Input placeholder="Documento do beneficiário" value={benef.documento} onChange={(e) => setBenef({ ...benef, documento: e.target.value })} />
            <Input placeholder="Justificativa / registro da escolha" value={benef.justificativa} onChange={(e) => setBenef({ ...benef, justificativa: e.target.value })} />
          </div>
        )}
        {regra === 'COTACAO_MERCADO' && (
          <div className="border rounded p-2 space-y-1">
            <div className="text-xs text-gray-600">Cotações vigentes no momento (art. 79, par. único, IV) — contrata-se a menor:</div>
            {aptos.map((a: any) => (
              <div key={a.id} className="flex gap-2 items-center">
                <span className="flex-1">{a.fornecedor_razao_social}</span>
                <Input className="w-32" placeholder="valor unitário" value={cot[a.id]?.valor ?? ''} onChange={(e) => setCot({ ...cot, [a.id]: { valor: e.target.value, fonte: cot[a.id]?.fonte ?? '' } })} />
                <Input className="w-48" placeholder="fonte" value={cot[a.id]?.fonte ?? ''} onChange={(e) => setCot({ ...cot, [a.id]: { valor: cot[a.id]?.valor ?? '', fonte: e.target.value } })} />
              </div>
            ))}
          </div>
        )}
        <Button onClick={enviar} disabled={ocupado === 'contratar' || !aptos.length}>
          {ocupado === 'contratar' && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Distribuir demanda e gerar contrato
        </Button>
      </CardContent>
    </Card>
  )
}

function ContratacaoCard({ k, executar }: { k: any; executar: (k: string, fn: () => Promise<any>, ok?: string) => Promise<void> }) {
  const [conferido, setConferido] = useState<boolean | null>(null)
  const r = k.registro || {}
  const conferir = async () => {
    const res = await authFetch(`${API_URL}/api/credenciamento/contratacoes/${k.id}/sorteio`)
    if (res.ok) setConferido((await res.json()).conferido)
  }
  return (
    <Card>
      <CardContent className="p-4 space-y-2 text-sm">
        <div className="flex justify-between gap-2 flex-wrap">
          <div>
            <b>Demanda nº {k.numero}</b> — {k.descricao}
            <div className="text-xs text-gray-500">
              {dataHora(k.ato_em)} · {k.regra_rotulo} · {moeda(k.valor_total)}
            </div>
          </div>
          <div className="text-right">
            <div className="font-medium flex items-center gap-1 justify-end">
              <Users className="w-3.5 h-3.5" /> {k.fornecedor_razao_social}
            </div>
            {k.contrato_id ? (
              <Link className="text-blue-600 text-xs inline-flex items-center gap-1" href={`/orgao/contratos/${k.contrato_id}`}>
                <FileText className="w-3 h-3" /> contrato (inexigibilidade — art. 74, IV)
              </Link>
            ) : (
              <Button size="sm" variant="outline" onClick={() => executar('ct', () => postar(`/api/credenciamento/contratacoes/${k.id}/contrato`, {}, 'Erro ao gerar o contrato'), 'Contrato gerado.')}>
                Gerar contrato {k.erro ? `(falhou: ${k.erro})` : ''}
              </Button>
            )}
          </div>
        </div>
        <div className="text-xs text-gray-600">{r.criterio}</div>
        {r.fila && (
          <div className="text-xs">
            Fila do rodízio: {r.fila.map((f: any) => `${f.ordem}. ${f.razao_social}`).join(' → ')} (último contratado: {r.ordem_do_ultimo ?? '—'})
          </div>
        )}
        {r.sorteio && (
          <div className="text-xs space-y-1 bg-slate-50 p-2 rounded">
            <div>
              Algoritmo {r.sorteio.algoritmo} · semente <code>{String(r.sorteio.semente).slice(0, 16)}…</code>
            </div>
            <div className="break-all">
              Entrada pública: <code>{r.sorteio.entrada}</code>
            </div>
            <Button size="sm" variant="outline" className="h-6" onClick={conferir}>
              Conferir sorteio
            </Button>
            {conferido != null && <span className={conferido ? 'text-green-700 ml-2' : 'text-red-700 ml-2'}>{conferido ? 'Conferido: mesma ordem' : 'Divergente!'}</span>}
          </div>
        )}
        {r.beneficiario && (
          <div className="text-xs">
            Escolha do beneficiário: {r.beneficiario.nome} {r.justificativa ? `— ${r.justificativa}` : ''}
          </div>
        )}
        {r.cotacoes && <div className="text-xs">Cotações: {r.cotacoes.map((x: any) => `${x.razao_social}: ${moeda(x.valor_unitario)}${x.fonte ? ` (${x.fonte})` : ''}`).join(' · ')}</div>}
      </CardContent>
    </Card>
  )
}
