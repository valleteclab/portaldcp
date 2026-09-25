'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Database, FileSearch, FileText, RefreshCw, Scale, TimerReset, UserCheck, XCircle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DocumentoHab,
  Exigencia,
  ExigenciaHab,
  Habilitacao,
  ROTULO_ANALISE,
  ROTULO_CATEGORIA,
  ROTULO_ORIGEM_DOC,
  ROTULO_SITUACAO_EXIGENCIA,
  ROTULO_STATUS_HAB,
  ROTULO_TIPO_DOC,
  abrirDocumento,
  contagem,
  data,
  dataHora,
  mensagemDeErro,
  porCategoria,
} from '@/components/habilitacao/comum'
import { formatarMoeda } from './utils'

/**
 * PAINEL DE HABILITAÇÃO DO AGENTE (plano E4 — Lei 14.133/2021 arts. 62–70;
 * IN SEGES 73/2022 art. 39). Por licitante:
 *  - convocação de quem tem proposta aceita, com prazo (≥ 2 h) e prorrogação
 *    única; resultado da consulta ao registro cadastral (art. 70);
 *  - documentos por exigência do edital, com ATENDE / NÃO ATENDE (motivo) /
 *    DILIGÊNCIA (art. 64 — complementação com motivo e prazo próprios);
 *  - HABILITAR (todas as obrigatórias atendidas) ou INABILITAR (motivo — o
 *    próximo pelos lances é convocado para a aceitação pelo backend);
 *  - inversão de fases (art. 17 §1º): julgamento de todos antes da disputa e
 *    confirmação do vencedor depois da aceitação.
 * A análise fica no banco (/api/habilitacao) — nada de checklist no navegador.
 */

interface LicitanteRanking {
  posicao: number
  fornecedorId: string
  razaoSocial: string
  cpfCnpj: string
  valorTotal: number
  propostaAceita: boolean
  habilitacaoId: string | null
  statusHabilitacao: string | null
  podeConvocar: boolean
  unidades: Array<{ tipo: string; numero: number; situacao: string }>
}
interface Painel {
  licitacaoId: string
  sessaoId: string | null
  etapa: string | null
  fase: string
  inversaoFases: boolean
  prazoMinimoHoras: number
  exigencias: Exigencia[]
  ranking: LicitanteRanking[]
  excluidos: Array<{ fornecedorId: string; razaoSocial: string }>
  habilitacoes: Habilitacao[]
}

type Acao =
  | { tipo: 'convocar'; licitante: LicitanteRanking }
  | { tipo: 'prorrogar'; hab: Habilitacao }
  | { tipo: 'naoAtende'; hab: Habilitacao; doc: DocumentoHab; exigencia: ExigenciaHab }
  | { tipo: 'diligencia'; hab: Habilitacao; exigenciaIds: string[] }
  | { tipo: 'habilitar'; hab: Habilitacao; confirmacaoInversao?: boolean }
  | { tipo: 'inabilitar'; hab: Habilitacao }

export function HabilitacaoPanel({ licitacaoId, somentePreviaInversao = false }: { licitacaoId: string; somentePreviaInversao?: boolean }) {
  const [painel, setPainel] = useState<Painel | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [acao, setAcao] = useState<Acao | null>(null)
  const [texto, setTexto] = useState('')
  const [horas, setHoras] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [agora, setAgora] = useState(Date.now())
  const [aberta, setAberta] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!licitacaoId) return
    setCarregando(true)
    try {
      const res = await authFetch(`${API_URL}/api/habilitacao/licitacao/${licitacaoId}`)
      if (res.ok) setPainel(await res.json())
    } catch {
      /* polling: ignora falha pontual */
    } finally {
      setCarregando(false)
    }
  }, [licitacaoId])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 10_000)
    const r = setInterval(() => setAgora(Date.now()), 1000)
    return () => {
      clearInterval(t)
      clearInterval(r)
    }
  }, [carregar])

  const ato = async (url: string, corpo: Record<string, unknown>, padrao: string) => {
    setSalvando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}${url}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) })
      if (!res.ok) throw new Error(await mensagemDeErro(res, padrao))
      setAcao(null)
      setTexto('')
      setHoras('')
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : padrao)
    } finally {
      setSalvando(false)
    }
  }

  const analisar = (doc: DocumentoHab) => ato(`/api/habilitacao/documentos/${doc.id}/analisar`, { resultado: 'ATENDE' }, 'Não foi possível registrar a análise')

  const confirmar = async () => {
    if (!acao) return
    switch (acao.tipo) {
      case 'convocar':
        return ato(`/api/habilitacao/licitacao/${licitacaoId}/convocar`, { fornecedorId: acao.licitante.fornecedorId, prazoHoras: horas ? Number(horas) : undefined }, 'Não foi possível convocar')
      case 'prorrogar':
        return ato(`/api/habilitacao/${acao.hab.id}/prorrogar`, { motivo: texto }, 'Não foi possível prorrogar')
      case 'naoAtende':
        return ato(`/api/habilitacao/documentos/${acao.doc.id}/analisar`, { resultado: 'NAO_ATENDE', motivo: texto }, 'Não foi possível registrar a análise')
      case 'diligencia':
        return ato(`/api/habilitacao/${acao.hab.id}/diligencia`, { motivo: texto, prazoHoras: Number(horas), exigenciaIds: acao.exigenciaIds }, 'Não foi possível abrir a diligência')
      case 'habilitar':
        return ato(`/api/habilitacao/${acao.hab.id}/habilitar`, { observacao: texto || undefined }, 'Não foi possível habilitar')
      case 'inabilitar':
        return ato(`/api/habilitacao/${acao.hab.id}/inabilitar`, { motivo: texto }, 'Não foi possível inabilitar')
    }
  }

  if (!painel) {
    if (somentePreviaInversao) return null
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-slate-400">
          <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin" />
          Carregando habilitação...
        </CardContent>
      </Card>
    )
  }

  const previa = painel.inversaoFases && painel.fase === 'ANALISE_PROPOSTAS'
  if (somentePreviaInversao && !previa) return null

  const posFaseInversao = painel.inversaoFases && (painel.fase === 'JULGAMENTO' || painel.fase === 'HABILITACAO')
  const aceitos = new Set(painel.ranking.filter((r) => r.unidades.some((u) => u.situacao === 'ACEITO')).map((r) => r.fornecedorId))
  const convocaveis = painel.ranking.filter((r) => r.podeConvocar)
  const ordenadas = [...painel.habilitacoes].sort((a, b) => {
    const peso = (h: Habilitacao) => (['AGUARDANDO_ENVIO', 'ENVIADA', 'EM_DILIGENCIA'].includes(h.status) ? 0 : 1)
    return peso(a) - peso(b)
  })

  const tituloAcao: Record<Acao['tipo'], string> = {
    convocar: 'Convocar para a habilitação',
    prorrogar: 'Prorrogar o prazo de envio',
    naoAtende: 'Documento não atende',
    diligencia: 'Abrir diligência (art. 64)',
    habilitar: 'Habilitar licitante',
    inabilitar: 'Inabilitar licitante',
  }

  const podeConfirmar = (() => {
    if (!acao) return false
    if (acao.tipo === 'prorrogar') return texto.trim().length > 0
    if (acao.tipo === 'naoAtende' || acao.tipo === 'inabilitar') return texto.trim().length >= 10
    if (acao.tipo === 'diligencia') return texto.trim().length >= 10 && Number(horas) >= 2 && acao.exigenciaIds.length > 0
    if (acao.tipo === 'convocar') return !horas || Number(horas) >= painel.prazoMinimoHoras
    return true
  })()

  return (
    <Card>
      <CardHeader className="border-b bg-emerald-50">
        <CardTitle className="flex items-center gap-2 text-emerald-800">
          <UserCheck className="h-4 w-4" />
          {previa ? 'Habilitação prévia (inversão de fases)' : 'Habilitação'}
          {painel.inversaoFases && <Badge className="bg-violet-100 text-violet-800">Inversão de fases — art. 17 §1º</Badge>}
        </CardTitle>
        <CardDescription>
          {previa
            ? 'Julgue a habilitação de todos os licitantes antes da disputa: só os habilitados participam dos lances.'
            : 'Arts. 62–70 da Lei 14.133/2021. Documentos por exigência do edital; o registro cadastral substitui o que já estiver válido (art. 70).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={carregar} disabled={carregando}>
            <RefreshCw className={`mr-1 h-3.5 w-3.5 ${carregando ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        {!painel.inversaoFases && convocaveis.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Proposta aceita — convocar para a habilitação</div>
            {convocaveis.map((r) => (
              <div key={r.fornecedorId} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-3">
                <div>
                  <div className="text-xs text-slate-500">{r.posicao}º colocado</div>
                  <div className="font-medium text-slate-900">{r.razaoSocial}</div>
                  <div className="text-sm text-slate-600">{r.cpfCnpj} · {formatarMoeda(r.valorTotal)}</div>
                </div>
                <Button size="sm" onClick={() => { setAcao({ tipo: 'convocar', licitante: r }); setHoras(String(painel.prazoMinimoHoras)) }}>
                  Convocar
                </Button>
              </div>
            ))}
          </div>
        )}

        {ordenadas.length === 0 && convocaveis.length === 0 && (
          <div className="rounded-lg border border-dashed px-3 py-5 text-sm text-slate-400">
            {painel.inversaoFases ? 'Nenhum licitante com proposta.' : 'Nenhum licitante com proposta aceita aguardando habilitação.'}
          </div>
        )}

        {ordenadas.map((h) => {
          const st = ROTULO_STATUS_HAB[h.status] ?? { label: h.status, cls: 'bg-slate-100' }
          const expandida = aberta === h.id || (aberta === null && ['ENVIADA', 'EM_DILIGENCIA', 'AGUARDANDO_ENVIO'].includes(h.status))
          const confirmarInversao = posFaseInversao && h.status === 'HABILITADO' && aceitos.has(h.fornecedorId)
          const exigenciasSemAtender = h.exigencias.filter((e) => e.situacao !== 'ATENDIDA').map((e) => e.id)
          return (
            <div key={h.id} className="rounded-xl border border-slate-200">
              <button type="button" className="flex w-full items-start justify-between gap-2 p-3 text-left" onClick={() => setAberta(expandida ? '' : h.id)}>
                <div>
                  <div className="font-semibold text-slate-900">{h.razaoSocial ?? h.fornecedorId}</div>
                  <div className="text-xs text-slate-500">{h.cpfCnpj}</div>
                  {h.status === 'AGUARDANDO_ENVIO' && h.prazoAte && (
                    <div className="mt-1 flex items-center gap-1 text-xs text-blue-700">
                      <Clock3 className="h-3.5 w-3.5" /> Prazo até {dataHora(h.prazoAte)} ({contagem(h.prazoAte, agora)})
                      {h.prorrogadaEm && <span className="ml-1 text-slate-500">— prorrogado</span>}
                    </div>
                  )}
                  {h.decisaoMotivo && <div className="mt-1 text-xs text-slate-600">Motivo: {h.decisaoMotivo}</div>}
                </div>
                <Badge className={st.cls}>{st.label}</Badge>
              </button>

              {expandida && (
                <div className="space-y-3 border-t p-3">
                  {porCategoria(h.exigencias).map((g) => (
                    <div key={g.categoria} className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ROTULO_CATEGORIA[g.categoria] ?? g.categoria}</div>
                      {g.itens.map((e) => {
                        const sit = ROTULO_SITUACAO_EXIGENCIA[e.situacao]
                        return (
                          <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-slate-800">{e.descricao}{!e.obrigatorio && <span className="ml-1 text-xs text-slate-400">(facultativa)</span>}</div>
                                {e.base_legal && <div className="text-xs text-slate-400">{e.base_legal}</div>}
                                {e.cobertaPeloCadastro && (
                                  <div className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700"><Database className="h-3 w-3" /> Atendida pelo registro cadastral (art. 70)</div>
                                )}
                                {!e.cobertaPeloCadastro && e.motivoCadastro && e.aceita_registro_cadastral && (
                                  <div className="mt-0.5 text-xs text-slate-500">Cadastro: {e.motivoCadastro}</div>
                                )}
                              </div>
                              <Badge className={sit.cls}>{sit.label}</Badge>
                            </div>
                            {e.documentos.map((d) => {
                              const an = ROTULO_ANALISE[d.analise]
                              // arquivo do registro cadastral: baixado pela habilitação (autenticado), nunca por link direto
                              const link = d.origem === 'CADASTRO' && !!d.cadastro?.caminhoArquivo
                              return (
                                <div key={d.id} className="mt-2 rounded-md bg-slate-50 p-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-xs text-slate-700">
                                      <FileText className="h-3.5 w-3.5" />
                                      {d.arquivo ? (
                                        <button type="button" className="underline" onClick={() => abrirDocumento(d.id).catch((x) => setErro(x.message))}>
                                          {d.arquivo.nome}
                                        </button>
                                      ) : link ? (
                                        <button type="button" className="underline" onClick={() => abrirDocumento(d.id).catch((x) => setErro(x.message))}>
                                          {ROTULO_TIPO_DOC[d.cadastro?.tipo ?? ''] ?? d.cadastro?.tipo} {d.cadastro?.numero ? `nº ${d.cadastro.numero}` : ''}
                                        </button>
                                      ) : (
                                        <span>{ROTULO_TIPO_DOC[d.cadastro?.tipo ?? ''] ?? d.cadastro?.tipo ?? 'Documento'}</span>
                                      )}
                                      <span className="text-slate-400">· {ROTULO_ORIGEM_DOC[d.origem]}</span>
                                      {d.validade && <span className="text-slate-400">· validade {data(d.validade)}</span>}
                                    </div>
                                    <Badge className={an.cls}>{an.label}</Badge>
                                  </div>
                                  {d.analiseMotivo && <div className="mt-1 text-xs text-red-700">{d.analiseMotivo}</div>}
                                  {h.podeAnalisar && (
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      <Button size="sm" variant="outline" className="h-7 text-emerald-700" disabled={salvando || d.analise === 'ATENDE'} onClick={() => analisar(d)}>
                                        <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Atende
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 text-red-700" disabled={salvando} onClick={() => { setTexto(''); setAcao({ tipo: 'naoAtende', hab: h, doc: d, exigencia: e }) }}>
                                        <XCircle className="mr-1 h-3.5 w-3.5" /> Não atende
                                      </Button>
                                      <Button size="sm" variant="outline" className="h-7 text-violet-700" disabled={salvando || !!h.diligenciaVigenteId} onClick={() => { setTexto(''); setHoras('2'); setAcao({ tipo: 'diligencia', hab: h, exigenciaIds: [e.id] }) }}>
                                        <FileSearch className="mr-1 h-3.5 w-3.5" /> Diligência
                                      </Button>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  ))}

                  {h.diligencias.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Diligências (art. 64)</div>
                      {h.diligencias.map((d) => (
                        <div key={d.id} className="rounded-md border border-violet-200 bg-violet-50 p-2 text-xs text-violet-900">
                          <div className="flex justify-between"><span>{d.motivo}</span><span className="font-semibold">{d.status}</span></div>
                          <div>Prazo até {dataHora(d.prazoAte)}{d.status === 'ABERTA' ? ` (${contagem(d.prazoAte, agora)})` : ''}</div>
                          {d.resposta && <div className="mt-1 text-slate-700">Resposta: {d.resposta}</div>}
                        </div>
                      ))}
                    </div>
                  )}

                  {h.pendencias.length > 0 && !['HABILITADO', 'INABILITADO', 'CANCELADA'].includes(h.status) && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                      <div className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-3.5 w-3.5" /> Pendências para habilitar</div>
                      <ul className="list-disc pl-4">{h.pendencias.map((p) => <li key={p}>{p}</li>)}</ul>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    {h.podeProrrogar && (
                      <Button size="sm" variant="outline" onClick={() => { setTexto(''); setAcao({ tipo: 'prorrogar', hab: h }) }}>
                        <TimerReset className="mr-1 h-4 w-4" /> Prorrogar prazo
                      </Button>
                    )}
                    {h.podeAnalisar && !h.diligenciaVigenteId && (
                      <Button size="sm" variant="outline" className="text-violet-700" onClick={() => { setTexto(''); setHoras('2'); setAcao({ tipo: 'diligencia', hab: h, exigenciaIds: exigenciasSemAtender }) }}>
                        <Scale className="mr-1 h-4 w-4" /> Abrir diligência
                      </Button>
                    )}
                    {h.podeHabilitar && (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setTexto(''); setAcao({ tipo: 'habilitar', hab: h }) }}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Habilitar
                      </Button>
                    )}
                    {confirmarInversao && (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setTexto(''); setAcao({ tipo: 'habilitar', hab: h, confirmacaoInversao: true }) }}>
                        <CheckCircle2 className="mr-1 h-4 w-4" /> Confirmar habilitação do vencedor
                      </Button>
                    )}
                    {h.podeInabilitar && (
                      <Button size="sm" variant="destructive" onClick={() => { setTexto(''); setAcao({ tipo: 'inabilitar', hab: h }) }}>
                        <XCircle className="mr-1 h-4 w-4" /> Inabilitar
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {painel.excluidos.length > 0 && (
          <div className="text-xs text-slate-500">Fora do ranking: {painel.excluidos.map((e) => e.razaoSocial).join(', ')}</div>
        )}
      </CardContent>

      <Dialog open={!!acao} onOpenChange={(o) => !o && setAcao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{acao ? tituloAcao[acao.tipo] : ''}</DialogTitle>
            <DialogDescription>
              {acao?.tipo === 'convocar' && `${acao.licitante.razaoSocial} — prazo mínimo de ${painel.prazoMinimoHoras} h (IN SEGES 73/2022, art. 39). O registro cadastral é consultado na convocação.`}
              {acao?.tipo === 'prorrogar' && `Prorrogação única, pelo mesmo período (${acao.hab.prazoHoras ?? '-'} h).`}
              {acao?.tipo === 'naoAtende' && `${acao.exigencia.descricao} — informe o motivo (fica registrado e visível ao licitante).`}
              {acao?.tipo === 'diligencia' && 'O licitante só poderá complementar as exigências marcadas, dentro do prazo. Não se admite substituição nem documento novo além do indicado (art. 64).'}
              {acao?.tipo === 'habilitar' &&
                (acao.confirmacaoInversao
                  ? 'Habilitação julgada antes da disputa (art. 17 §1º): confirmar para o vencedor com proposta aceita.'
                  : 'Todas as exigências obrigatórias foram atendidas. O licitante fica HABILITADO nas unidades com proposta aceita.')}
              {acao?.tipo === 'inabilitar' && 'O licitante sai do ranking; o próximo classificado pelos lances é convocado para a aceitação da proposta.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(acao?.tipo === 'convocar' || acao?.tipo === 'diligencia') && (
              <div>
                <label className="text-xs text-slate-600">Prazo (horas)</label>
                <Input type="number" min={acao.tipo === 'convocar' ? painel.prazoMinimoHoras : 2} value={horas} onChange={(e) => setHoras(e.target.value)} />
              </div>
            )}
            {acao?.tipo === 'diligencia' && (
              <div className="max-h-56 space-y-1 overflow-y-auto rounded border p-2">
                {acao.hab.exigencias.map((e) => (
                  <label key={e.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={acao.exigenciaIds.includes(e.id)}
                      onChange={(ev) =>
                        setAcao({ ...acao, exigenciaIds: ev.target.checked ? [...acao.exigenciaIds, e.id] : acao.exigenciaIds.filter((x) => x !== e.id) })
                      }
                    />
                    <span>{e.descricao}</span>
                  </label>
                ))}
              </div>
            )}
            {acao && acao.tipo !== 'convocar' && (
              <Textarea
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={3}
                placeholder={acao.tipo === 'habilitar' ? 'Observação (opcional)' : 'Motivo (obrigatório, mín. 10 caracteres)'}
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={salvando || !podeConfirmar} variant={acao?.tipo === 'inabilitar' ? 'destructive' : 'default'}>
              {salvando ? 'Registrando...' : 'Confirmar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
