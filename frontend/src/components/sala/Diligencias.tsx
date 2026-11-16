'use client'

/**
 * DILIGÊNCIA GERAL (Lei 14.133/2021, art. 64) — pedido do pregoeiro/agente a um
 * licitante, depois dos lances, com prazo. O licitante responde com texto e
 * anexos; o órgão pode juntar arquivos (parecer técnico, e-mail), prorrogar e
 * encerrar como atendida ou não atendida. Tudo fica na ata.
 *
 * `DiligenciasOrgao` vai no detalhe do item (aceitação, habilitação) e no
 * pós-julgamento da dispensa; `DiligenciasFornecedor`, na sala do licitante.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { ClipboardList, Download, Paperclip, Trash2 } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { abrirArquivoAutenticado } from '@/lib/arquivo-autenticado'
import { useConsultaAoVivo } from '@/hooks/useConsultaAoVivo'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface Anexo {
  id: string
  autor: 'FORNECEDOR' | 'ORGAO'
  autorNome: string | null
  nome: string
  tamanho: number
  descricao: string | null
  enviadoEm: string
}

export interface Diligencia {
  id: string
  unidadeId: string | null
  unidadeRotulo: string | null
  fornecedorId: string
  fornecedorNome: string | null
  fase: string
  pedido: string
  abertaEm: string
  prazoAte: string
  status: 'ABERTA' | 'RESPONDIDA' | 'ENCERRADA' | 'EXPIRADA'
  /** O licitante ainda pode anexar, trocar e atualizar a resposta (prazo correndo e não encerrada). */
  podeResponder?: boolean
  resposta: string | null
  respondidaEm: string | null
  resultado: 'ATENDIDA' | 'NAO_ATENDIDA' | null
  resultadoMotivo: string | null
  prorrogacoes: Array<{ em: string; horas: number; motivo: string }>
  abertaPor: string | null
  anexos: Anexo[]
}

const ACEITOS = '.pdf,.jpg,.jpeg,.png,.xlsx,.xls,.ods,.docx,.doc,.odt,.zip'
const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

async function erroDe(res: Response, padrao: string) {
  const c = await res.json().catch(() => null)
  const m = c?.message
  return Array.isArray(m) ? m.join(', ') : m || padrao
}

function selo(d: Diligencia) {
  if (d.status === 'ENCERRADA') {
    return d.resultado === 'ATENDIDA' ? (
      <Badge className="border-0 bg-emerald-100 text-emerald-800">Atendida</Badge>
    ) : (
      <Badge className="border-0 bg-red-100 text-red-800">Não atendida</Badge>
    )
  }
  if (d.status === 'RESPONDIDA') return <Badge className="border-0 bg-sky-100 text-sky-800">Respondida</Badge>
  if (d.status === 'EXPIRADA') return <Badge className="border-0 bg-amber-100 text-amber-800">Prazo vencido</Badge>
  return <Badge className="border-0 bg-violet-100 text-violet-800">Aguardando o licitante</Badge>
}

/** Tempo restante, atualizado a cada 30 s. */
function Restante({ ate }: { ate: string }) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])
  const ms = new Date(ate).getTime() - agora
  if (ms <= 0) return <span className="text-amber-700">prazo vencido em {dataHora(ate)}</span>
  const min = Math.floor(ms / 60_000)
  const txt = min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`
  return (
    <span>
      até {dataHora(ate)} (faltam {txt})
    </span>
  )
}

function ListaAnexos({ anexos, podeRemover, onRemovido }: { anexos: Anexo[]; podeRemover?: (a: Anexo) => boolean; onRemovido?: () => void }) {
  if (!anexos.length) return null
  const remover = async (a: Anexo) => {
    const res = await authFetch(`${API_URL}/api/diligencias/anexos/${a.id}`, { method: 'DELETE' })
    if (res.ok) onRemovido?.()
  }
  return (
    <ul className="space-y-1">
      {anexos.map((a) => (
        <li key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-white px-3 py-1.5 text-sm">
          <Paperclip className="h-3.5 w-3.5 text-slate-400" />
          <button type="button" className="font-medium text-sky-700 hover:underline" onClick={() => void abrirArquivoAutenticado(`${API_URL}/api/diligencias/anexos/${a.id}/arquivo`)}>
            {a.nome}
          </button>
          <span className="text-xs text-slate-500">
            {a.autor === 'ORGAO' ? 'juntado pelo órgão' : 'enviado pelo licitante'} · {dataHora(a.enviadoEm)} · {(a.tamanho / 1024).toFixed(0)} KB
            {a.descricao ? ` · ${a.descricao}` : ''}
          </span>
          <Download className="h-3.5 w-3.5 text-slate-400" />
          {podeRemover?.(a) && (
            <button type="button" title="Remover anexo" className="ml-auto text-slate-400 hover:text-red-600" onClick={() => void remover(a)}>
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Botão de anexar (um arquivo por vez; pode repetir). */
function Anexar({ diligenciaId, rotulo, onEnviado, onErro }: { diligenciaId: string; rotulo: string; onEnviado: () => void; onErro: (m: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [enviando, setEnviando] = useState(false)
  const enviar = async (arquivo: File | undefined) => {
    if (!arquivo) return
    setEnviando(true)
    onErro(null)
    try {
      const fd = new FormData()
      fd.append('arquivo', arquivo)
      const res = await authFetch(`${API_URL}/api/diligencias/${diligenciaId}/anexos`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error(await erroDe(res, 'Não foi possível anexar o arquivo'))
      onEnviado()
    } catch (e) {
      onErro(e instanceof Error ? e.message : 'Não foi possível anexar o arquivo')
    } finally {
      setEnviando(false)
      if (ref.current) ref.current.value = ''
    }
  }
  return (
    <>
      <input ref={ref} type="file" accept={ACEITOS} className="hidden" aria-label={rotulo} onChange={(e) => void enviar(e.target.files?.[0])} />
      <Button type="button" variant="outline" size="sm" disabled={enviando} onClick={() => ref.current?.click()}>
        <Paperclip className="mr-1.5 h-4 w-4" />
        {enviando ? 'Enviando...' : rotulo}
      </Button>
    </>
  )
}

type Dados = { diligencias: Diligencia[]; licitantes?: Array<{ id: string; nome: string }> }

function useDiligencias(licitacaoId: string, unidadeId: string | null | undefined, atualizacao: unknown) {
  // `versao` muda depois de cada ato feito nesta tela; `atualizacao`, quando a sala avisa
  const [versao, setVersao] = useState(0)
  const url = `${API_URL}/api/diligencias/licitacao/${licitacaoId}${unidadeId ? `?unidadeId=${unidadeId}` : ''}`
  const [dados] = useConsultaAoVivo<Dados>(url, `${String(atualizacao)}|${versao}`, { intervaloMs: 20_000, minimoMs: 300 })
  const carregar = useCallback(() => setVersao((v) => v + 1), [])
  return { dados, carregar }
}

// ---------------------------------------------------------------------------
// Órgão
// ---------------------------------------------------------------------------

export function DiligenciasOrgao({
  licitacaoId,
  unidadeId,
  fase,
  atualizacao,
  fornecedorSugeridoId,
}: {
  licitacaoId: string
  unidadeId?: string | null
  fase: 'ACEITACAO' | 'HABILITACAO' | 'DISPENSA' | 'OUTRA'
  /** Muda quando a sala recebe o aviso `diligencia_atualizada`. */
  atualizacao?: unknown
  /** Licitante na vez (1º colocado): vem pré-selecionado no diálogo. */
  fornecedorSugeridoId?: string | null
}) {
  const { dados, carregar } = useDiligencias(licitacaoId, unidadeId, atualizacao)
  const [dialogo, setDialogo] = useState<null | { tipo: 'abrir' } | { tipo: 'prorrogar' | 'encerrar'; d: Diligencia }>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [fornecedorId, setFornecedorId] = useState('')
  const [pedido, setPedido] = useState('')
  const [horas, setHoras] = useState('2')
  const [motivo, setMotivo] = useState('')
  const [resultado, setResultado] = useState<'ATENDIDA' | 'NAO_ATENDIDA'>('ATENDIDA')

  if (!dados) return null
  const licitantes = dados.licitantes ?? []
  if (!licitantes.length && !dados.diligencias.length) return null

  const abrirDialogo = () => {
    setErro(null)
    setPedido('')
    setHoras('2')
    setFornecedorId(fornecedorSugeridoId && licitantes.some((l) => l.id === fornecedorSugeridoId) ? fornecedorSugeridoId : (licitantes[0]?.id ?? ''))
    setDialogo({ tipo: 'abrir' })
  }
  const ato = async (url: string, corpo: Record<string, unknown>, padrao: string) => {
    setEnviando(true)
    setErro(null)
    try {
      const res = await authFetch(url, { method: 'POST', body: JSON.stringify(corpo) })
      if (!res.ok) throw new Error(await erroDe(res, padrao))
      setDialogo(null)
      carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : padrao)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section aria-label="Diligências" className="rounded-xl border bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-900">
            <ClipboardList className="h-4 w-4" /> Diligências
          </h3>
          <p className="text-xs text-slate-500">
            Lei 14.133/2021, art. 64 — peça a um licitante um esclarecimento ou documento complementar (planilha de custos, catálogo, produto equivalente). O pedido, a resposta
            e a conclusão vão para a ata.
          </p>
        </div>
        {licitantes.length > 0 && (
          <Button type="button" variant="outline" onClick={abrirDialogo}>
            Abrir diligência
          </Button>
        )}
      </div>

      {erro && !dialogo && <p className="mt-2 text-sm text-red-700">{erro}</p>}

      <div className="mt-3 space-y-3">
        {dados.diligencias.length === 0 && <p className="text-sm text-slate-500">Nenhuma diligência aberta{unidadeId ? ' para esta unidade' : ''}.</p>}
        {dados.diligencias.map((d) => (
          <div key={d.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">{d.fornecedorNome}</span>
              {d.unidadeRotulo && <Badge variant="outline">{d.unidadeRotulo}</Badge>}
              {selo(d)}
              <span className="text-xs text-slate-500">
                aberta em {dataHora(d.abertaEm)}
                {d.abertaPor ? ` por ${d.abertaPor}` : ''}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">
              <b>Pedido:</b> {d.pedido}
            </p>
            {d.status !== 'ENCERRADA' && (
              <p className="mt-1 text-xs text-slate-600">
                Prazo: <Restante ate={d.prazoAte} />
                {d.prorrogacoes.length > 0 ? ` · prorrogado ${d.prorrogacoes.length}x` : ''}
                {d.status === 'RESPONDIDA' && d.podeResponder ? ' · o licitante ainda pode complementar ou trocar documentos até o fim do prazo' : ''}
              </p>
            )}
            {d.resposta && (
              <p className="mt-2 whitespace-pre-wrap rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                <b>Resposta do licitante</b> ({d.respondidaEm ? dataHora(d.respondidaEm) : ''}): {d.resposta}
              </p>
            )}
            <div className="mt-2">
              <ListaAnexos anexos={d.anexos} podeRemover={(a) => a.autor === 'ORGAO' && d.status !== 'ENCERRADA'} onRemovido={() => void carregar()} />
            </div>
            {d.status === 'ENCERRADA' ? (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                <b>Conclusão:</b> {d.resultadoMotivo}
              </p>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                <Anexar diligenciaId={d.id} rotulo="Juntar arquivo" onEnviado={() => void carregar()} onErro={setErro} />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setErro(null)
                    setHoras('2')
                    setMotivo('')
                    setDialogo({ tipo: 'prorrogar', d })
                  }}
                >
                  Prorrogar prazo
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setErro(null)
                    setMotivo('')
                    setResultado('ATENDIDA')
                    setDialogo({ tipo: 'encerrar', d })
                  }}
                >
                  Encerrar diligência
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={dialogo?.tipo === 'abrir'} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir diligência</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Licitante</span>
              <select className="w-full rounded-md border px-3 py-2" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
                {licitantes.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">O que está sendo pedido</span>
              <Textarea
                value={pedido}
                onChange={(e) => setPedido(e.target.value)}
                rows={4}
                placeholder="Ex.: Envie a planilha de custos que demonstre a exequibilidade do preço. / A marca ofertada não atende ao item 3.2 do termo de referência: informe se há produto equivalente, mantido o preço."
              />
            </label>
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Prazo para responder (horas)</span>
              <input type="number" min={2} step={1} className="w-32 rounded-md border px-3 py-2" value={horas} onChange={(e) => setHoras(e.target.value)} />
              <span className="ml-2 text-xs text-slate-500">mínimo de 2 horas (IN SEGES 73/2022, art. 29 §2º)</span>
            </label>
            {erro && <p className="text-red-700">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Voltar
            </Button>
            <Button
              disabled={enviando || !fornecedorId || pedido.trim().length < 15 || !(Number(horas) > 0)}
              onClick={() =>
                void ato(`${API_URL}/api/diligencias/licitacao/${licitacaoId}`, { fornecedorId, unidadeId: unidadeId ?? null, pedido: pedido.trim(), prazoHoras: Number(horas), fase }, 'Não foi possível abrir a diligência')
              }
            >
              Abrir diligência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo?.tipo === 'prorrogar'} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prorrogar o prazo da diligência</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block font-medium text-slate-700">Prorrogar por (horas)</span>
              <input type="number" min={1} step={1} className="w-32 rounded-md border px-3 py-2" value={horas} onChange={(e) => setHoras(e.target.value)} />
              <span className="ml-2 text-xs text-slate-500">conta do prazo atual, ou de agora se já venceu</span>
            </label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Motivo da prorrogação (vai para a ata)..." />
            {erro && <p className="text-red-700">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Voltar
            </Button>
            <Button
              disabled={enviando || motivo.trim().length < 10 || !(Number(horas) > 0)}
              onClick={() => dialogo?.tipo === 'prorrogar' && void ato(`${API_URL}/api/diligencias/${dialogo.d.id}/prorrogar`, { horas: Number(horas), motivo: motivo.trim() }, 'Não foi possível prorrogar')}
            >
              Prorrogar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogo?.tipo === 'encerrar'} onOpenChange={(o) => !o && setDialogo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar a diligência</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div className="flex gap-2">
              <Button type="button" variant={resultado === 'ATENDIDA' ? 'default' : 'outline'} onClick={() => setResultado('ATENDIDA')}>
                Atendida
              </Button>
              <Button type="button" variant={resultado === 'NAO_ATENDIDA' ? 'destructive' : 'outline'} onClick={() => setResultado('NAO_ATENDIDA')}>
                Não atendida
              </Button>
            </div>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={4}
              placeholder="Conclusão da análise (vai para a ata). Se não atendida, diga o item do edital e o ponto que não foi atendido."
            />
            {dialogo?.tipo === 'encerrar' && dialogo.d.podeResponder && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                O prazo do licitante ainda está correndo. Ao encerrar agora, ele não poderá mais enviar nem trocar documentos.
              </p>
            )}
            <p className="text-xs text-slate-500">
              Encerrar a diligência não aceita nem recusa a proposta: depois da conclusão, use Aceitar, Recusar, Habilitar ou Inabilitar, conforme o caso.
            </p>
            {erro && <p className="text-red-700">{erro}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogo(null)}>
              Voltar
            </Button>
            <Button
              disabled={enviando || motivo.trim().length < 10}
              onClick={() => dialogo?.tipo === 'encerrar' && void ato(`${API_URL}/api/diligencias/${dialogo.d.id}/encerrar`, { resultado, motivo: motivo.trim() }, 'Não foi possível encerrar')}
            >
              Encerrar diligência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Licitante
// ---------------------------------------------------------------------------

export function DiligenciasFornecedor({ licitacaoId, atualizacao }: { licitacaoId: string; atualizacao?: unknown }) {
  const { dados, carregar } = useDiligencias(licitacaoId, null, atualizacao)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  if (!dados || dados.diligencias.length === 0) return null

  const responder = async (d: Diligencia) => {
    setEnviando(true)
    setErro(null)
    try {
      const res = await authFetch(`${API_URL}/api/diligencias/${d.id}/responder`, { method: 'POST', body: JSON.stringify({ resposta: (respostas[d.id] ?? d.resposta ?? '').trim() }) })
      if (!res.ok) throw new Error(await erroDe(res, 'Não foi possível responder a diligência'))
      carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível responder a diligência')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section aria-label="Diligências" className="space-y-3">
      {dados.diligencias.map((d) => {
        const aberta = d.podeResponder ?? d.status === 'ABERTA'
        const jaRespondeu = d.status === 'RESPONDIDA'
        const meus = d.anexos.filter((a) => a.autor === 'FORNECEDOR')
        return (
          <div key={d.id} className={`rounded-xl border p-4 ${aberta ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white'}`}>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="flex items-center gap-2 font-semibold text-slate-900">
                <ClipboardList className="h-4 w-4" /> Diligência do órgão
              </h3>
              {d.unidadeRotulo && <Badge variant="outline">{d.unidadeRotulo}</Badge>}
              {selo(d)}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-slate-900">{d.pedido}</p>
            {d.status !== 'ENCERRADA' && (
              <p className="mt-1 text-sm font-medium text-violet-900">
                Prazo: <Restante ate={d.prazoAte} />
              </p>
            )}
            {aberta && jaRespondeu && (
              <p className="mt-1 text-sm text-slate-700">
                Resposta enviada em {d.respondidaEm ? dataHora(d.respondidaEm) : ''}. Até o fim do prazo você ainda pode anexar outros documentos, remover ou trocar um arquivo e atualizar a resposta.
              </p>
            )}
            <div className="mt-2">
              <ListaAnexos anexos={d.anexos} podeRemover={(a) => aberta && a.autor === 'FORNECEDOR'} onRemovido={() => void carregar()} />
            </div>
            {aberta && (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={respostas[d.id] ?? d.resposta ?? ''}
                  onChange={(e) => setRespostas((r) => ({ ...r, [d.id]: e.target.value }))}
                  rows={3}
                  placeholder="Sua resposta ao pregoeiro (opcional se você anexar documentos)..."
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Anexar diligenciaId={d.id} rotulo="Anexar documento" onEnviado={() => void carregar()} onErro={setErro} />
                  <Button type="button" disabled={enviando || (!(respostas[d.id] ?? d.resposta ?? '').trim() && meus.length === 0)} onClick={() => void responder(d)}>
                    {jaRespondeu ? 'Atualizar resposta' : 'Enviar resposta'}
                  </Button>
                  <span className="text-xs text-slate-600">
                    Enviou errado? Dentro do prazo você pode remover o arquivo (lixeira) e anexar o correto. O envio só se encerra no fim do prazo ou quando o pregoeiro concluir a diligência.
                  </span>
                </div>
              </div>
            )}
            {d.status === 'EXPIRADA' && <p className="mt-2 text-sm text-amber-800">O prazo terminou. Se precisar de mais tempo, peça a prorrogação ao pregoeiro pelo chat da sala.</p>}
            {d.resposta && !aberta && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                <b>Sua resposta</b> ({d.respondidaEm ? dataHora(d.respondidaEm) : ''}): {d.resposta}
              </p>
            )}
            {d.status === 'ENCERRADA' && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                <b>Conclusão do pregoeiro:</b> {d.resultadoMotivo}
              </p>
            )}
          </div>
        )
      })}
      {erro && <p className="text-sm text-red-700">{erro}</p>}
    </section>
  )
}
