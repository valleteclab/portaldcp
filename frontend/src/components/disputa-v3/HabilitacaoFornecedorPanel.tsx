'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clock3, Database, FileText, FileUp, RefreshCw, Send, Trash2, UserCheck } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
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

/**
 * ENVIO DOS DOCUMENTOS DE HABILITAÇÃO (licitante — plano E4). O backend
 * identifica o licitante pelo token e mostra só a própria habilitação:
 *  - checklist das exigências do edital, com o que o REGISTRO CADASTRAL já
 *    atende (art. 70) — o licitante envia só o que falta;
 *  - envio por exigência (PDF/JPG/PNG, até 10 MB) no prazo; antes de entregar,
 *    pode retirar o que anexou; ao ENTREGAR (ou no fim do prazo) acabou: não há
 *    substituição nem documento novo (art. 64);
 *  - diligência aberta pelo agente: complementa só as exigências indicadas,
 *    no prazo dela, e responde;
 *  - resultado de cada documento (atende / não atende com motivo) e a decisão.
 * Na inversão de fases (art. 17 §1º) o mesmo painel aparece com a proposta,
 * durante o recebimento das propostas.
 * Não renderiza nada se o licitante não foi convocado (e não há inversão aberta).
 */

interface PainelFornecedor {
  licitacaoId: string
  fase: string
  inversaoFases: boolean
  envioInversaoAberto: boolean
  prazoInversao: string | null
  exigencias: Exigencia[]
  minha: Habilitacao | null
  coberturaCadastro: Array<{ exigenciaId: string; coberta: boolean; motivo: string | null; documento: { tipo: string; validade: string | null } | null }> | null
}

function Envio({ licitacaoId, exigencia, complemento, onEnviado }: { licitacaoId: string; exigencia: Exigencia; complemento: boolean; onEnviado: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [validade, setValidade] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const enviar = async () => {
    if (!arquivo) return
    setEnviando(true)
    setErro(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', arquivo)
      if (validade) fd.append('validade', validade)
      const res = await authFetch(`${API_URL}/api/habilitacao/licitacao/${licitacaoId}/exigencias/${exigencia.id}/documentos`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await mensagemDeErro(res, 'Não foi possível enviar o documento'))
      setArquivo(null)
      setValidade('')
      onEnviado()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="mt-2 space-y-1">
      {erro && <div className="text-xs text-red-700">{erro}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <Input type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-8 max-w-xs text-xs" onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
        {exigencia.exige_validade && (
          <Input type="date" className="h-8 w-40 text-xs" value={validade} onChange={(e) => setValidade(e.target.value)} title="Validade do documento" />
        )}
        <Button size="sm" className="h-8" disabled={!arquivo || enviando} onClick={enviar}>
          <FileUp className="mr-1 h-3.5 w-3.5" /> {enviando ? 'Enviando...' : complemento ? 'Enviar complemento' : 'Anexar'}
        </Button>
      </div>
    </div>
  )
}

export function HabilitacaoFornecedorPanel({ licitacaoId, somenteInversao = false }: { licitacaoId: string; somenteInversao?: boolean }) {
  const [painel, setPainel] = useState<PainelFornecedor | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [agora, setAgora] = useState(Date.now())
  const [confirmarEntrega, setConfirmarEntrega] = useState(false)
  const [resposta, setResposta] = useState('')
  const [dialogResposta, setDialogResposta] = useState(false)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    if (!licitacaoId) return
    try {
      const res = await authFetch(`${API_URL}/api/habilitacao/licitacao/${licitacaoId}`)
      if (res.ok) setPainel(await res.json())
    } catch {
      /* polling */
    }
  }, [licitacaoId])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 15_000)
    const r = setInterval(() => setAgora(Date.now()), 1000)
    return () => {
      clearInterval(t)
      clearInterval(r)
    }
  }, [carregar])

  const post = async (url: string, corpo: Record<string, unknown>, padrao: string, metodo = 'POST') => {
    setSalvando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}${url}`, { method: metodo, headers: { 'Content-Type': 'application/json' }, body: metodo === 'DELETE' ? undefined : JSON.stringify(corpo) })
      if (!res.ok) throw new Error(await mensagemDeErro(res, padrao))
      await carregar()
      return true
    } catch (e) {
      setErro(e instanceof Error ? e.message : padrao)
      return false
    } finally {
      setSalvando(false)
    }
  }

  if (!painel) return null
  const minha = painel.minha
  if (!minha && !painel.envioInversaoAberto) return null
  if (somenteInversao && !painel.inversaoFases) return null

  // Antes do 1º envio (inversão): checklist com a cobertura do cadastro, sem gravar nada
  const exigencias: ExigenciaHab[] = minha
    ? minha.exigencias
    : painel.exigencias.map((e) => {
        const c = painel.coberturaCadastro?.find((x) => x.exigenciaId === e.id)
        return { ...e, situacao: 'SEM_DOCUMENTO', cobertaPeloCadastro: !!c?.coberta, motivoCadastro: c?.motivo ?? null, documentos: [], podeEnviar: true, envioComo: 'ENVIO' }
      })

  const st = minha ? ROTULO_STATUS_HAB[minha.status] : null
  const prazo = minha?.prazoAte ?? painel.prazoInversao
  const diligencia = minha?.diligencias.find((d) => d.id === minha.diligenciaVigenteId) ?? null
  const faltando = exigencias.filter((e) => e.obrigatorio && !e.cobertaPeloCadastro && e.documentos.length === 0)

  return (
    <Card className="border-emerald-200">
      <CardHeader className="border-b bg-emerald-50">
        <CardTitle className="flex items-center gap-2 text-emerald-800">
          <UserCheck className="h-4 w-4" />
          {painel.inversaoFases && painel.envioInversaoAberto ? 'Documentos de habilitação (com a proposta)' : 'Enviar documentos de habilitação'}
          {st && <Badge className={st.cls}>{st.label}</Badge>}
        </CardTitle>
        <CardDescription>
          {painel.inversaoFases
            ? 'Inversão de fases (Lei 14.133/2021, art. 17 §1º): a habilitação de todos é julgada antes da disputa.'
            : 'Lei 14.133/2021, arts. 62–70. O que o seu registro cadastral já atende não precisa ser enviado de novo (art. 70).'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="flex items-center justify-between text-sm">
          {prazo && (!minha || minha.status === 'AGUARDANDO_ENVIO') ? (
            <div className="flex items-center gap-1 text-blue-700">
              <Clock3 className="h-4 w-4" /> Envio até {dataHora(prazo)} ({contagem(prazo, agora)})
            </div>
          ) : (
            <span />
          )}
          <Button variant="ghost" size="sm" onClick={carregar}><RefreshCw className="h-3.5 w-3.5" /></Button>
        </div>
        {erro && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</div>}

        {diligencia && (
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
            <div className="flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4" /> Diligência (art. 64) — até {dataHora(diligencia.prazoAte)} ({contagem(diligencia.prazoAte, agora)})</div>
            <div className="mt-1">{diligencia.motivo}</div>
            <div className="mt-1 text-xs">Complemente só as exigências indicadas abaixo e depois clique em “Responder diligência”.</div>
          </div>
        )}

        {minha && ['HABILITADO', 'INABILITADO'].includes(minha.status) && (
          <div className={`rounded-lg border p-3 text-sm ${minha.status === 'HABILITADO' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}>
            {minha.status === 'HABILITADO' ? 'Você foi HABILITADO(A) nesta licitação.' : `Você foi INABILITADO(A). Motivo: ${minha.decisaoMotivo ?? '-'}`}
          </div>
        )}

        {porCategoria(exigencias).map((g) => (
          <div key={g.categoria} className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{ROTULO_CATEGORIA[g.categoria] ?? g.categoria}</div>
            {g.itens.map((e) => {
              const sit = ROTULO_SITUACAO_EXIGENCIA[e.situacao]
              const podeEnviar = minha ? e.podeEnviar : painel.envioInversaoAberto
              return (
                <div key={e.id} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-slate-800">{e.descricao}{!e.obrigatorio && <span className="ml-1 text-xs text-slate-400">(facultativa)</span>}</div>
                      {e.cobertaPeloCadastro ? (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700"><Database className="h-3 w-3" /> Já atendida pelo seu registro cadastral</div>
                      ) : e.aceita_registro_cadastral && e.motivoCadastro ? (
                        <div className="mt-0.5 text-xs text-slate-500">Cadastro: {e.motivoCadastro}</div>
                      ) : null}
                    </div>
                    {minha && <Badge className={sit.cls}>{sit.label}</Badge>}
                  </div>
                  {e.documentos.map((d) => {
                    const an = ROTULO_ANALISE[d.analise]
                    return (
                      <div key={d.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-md bg-slate-50 p-2 text-xs">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5" />
                          {d.arquivo ? (
                            <button type="button" className="underline" onClick={() => abrirDocumento(d.id).catch((x) => setErro(x.message))}>{d.arquivo.nome}</button>
                          ) : (
                            <span>{ROTULO_TIPO_DOC[d.cadastro?.tipo ?? ''] ?? d.cadastro?.tipo}</span>
                          )}
                          <span className="text-slate-400">· {ROTULO_ORIGEM_DOC[d.origem]}</span>
                          {d.validade && <span className="text-slate-400">· validade {data(d.validade)}</span>}
                        </div>
                        <div className="flex items-center gap-1">
                          <Badge className={an.cls}>{an.label}</Badge>
                          {d.podeRemover && (
                            <Button size="sm" variant="ghost" className="h-6 px-1 text-red-600" disabled={salvando} onClick={() => post(`/api/habilitacao/documentos/${d.id}`, {}, 'Não foi possível retirar', 'DELETE')}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        {d.analiseMotivo && <div className="w-full text-red-700">{d.analiseMotivo}</div>}
                      </div>
                    )
                  })}
                  {podeEnviar && (
                    <Envio licitacaoId={licitacaoId} exigencia={e} complemento={e.envioComo === 'COMPLEMENTO'} onEnviado={carregar} />
                  )}
                </div>
              )
            })}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          {minha?.podeConcluirEnvio && (
            <Button className="bg-emerald-600 hover:bg-emerald-700" disabled={salvando} onClick={() => setConfirmarEntrega(true)}>
              <Send className="mr-1 h-4 w-4" /> Entregar documentação
            </Button>
          )}
          {minha?.podeResponderDiligencia && (
            <Button variant="outline" className="text-violet-700" disabled={salvando} onClick={() => setDialogResposta(true)}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Responder diligência
            </Button>
          )}
        </div>
      </CardContent>

      <Dialog open={confirmarEntrega} onOpenChange={setConfirmarEntrega}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Entregar a documentação de habilitação</DialogTitle>
            <DialogDescription>
              Depois de entregue, não é possível substituir nem incluir documentos — só complementar se o agente abrir diligência (Lei 14.133/2021, art. 64).
            </DialogDescription>
          </DialogHeader>
          {faltando.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm text-amber-900">
              Exigência(s) obrigatória(s) sem documento: {faltando.map((e) => e.descricao).join('; ')}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmarEntrega(false)}>Voltar</Button>
            <Button
              disabled={salvando}
              onClick={async () => {
                if (await post(`/api/habilitacao/licitacao/${licitacaoId}/entregar`, {}, 'Não foi possível entregar')) setConfirmarEntrega(false)
              }}
            >
              Entregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogResposta} onOpenChange={setDialogResposta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responder diligência</DialogTitle>
            <DialogDescription>Conclui a complementação antes do prazo. O que foi anexado fica registrado.</DialogDescription>
          </DialogHeader>
          <Textarea rows={3} value={resposta} onChange={(e) => setResposta(e.target.value)} placeholder="Esclarecimento (opcional)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogResposta(false)}>Voltar</Button>
            <Button
              disabled={salvando || !minha?.diligenciaVigenteId}
              onClick={async () => {
                if (minha?.diligenciaVigenteId && (await post(`/api/habilitacao/diligencias/${minha.diligenciaVigenteId}/responder`, { resposta }, 'Não foi possível responder'))) {
                  setDialogResposta(false)
                  setResposta('')
                }
              }}
            >
              Responder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
