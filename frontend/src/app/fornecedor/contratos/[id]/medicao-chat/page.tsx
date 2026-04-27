'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import React from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Check,
  FileText,
  Loader2,
  Paperclip,
  RotateCcw,
  Send,
  Upload,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type HistoricoMensagem = {
  role: 'assistant' | 'user' | 'system'
  content: string
  created_at: string
}

type PreviewMedicao = {
  periodo_inicio?: string
  periodo_fim?: string
  competencia?: string
  nota_fiscal_numero?: string
  nota_fiscal_valor?: number
  valor_medido?: number
}

type DraftPreview = PreviewMedicao & {
  observacoes?: string | null
  discriminacoes?: Array<{ descricao: string; valor: number; percentual?: number }>
}

type ItemCronogramaContexto = {
  numero_item?: number
  descricao?: string
  unidade_medida?: string
  valor_mensal?: number
  valor_unitario?: number
  valor_total?: number
  quantidade?: number
  quantidade_meses?: number | null
}

type ContextoAssistido = {
  usar_itens_cronograma?: boolean
  itens_cronograma?: ItemCronogramaContexto[]
  etapas_cronograma?: Array<Record<string, unknown>>
  ultima_medicao?: {
    numero_medicao?: number
    valor_medido?: number
    competencia?: string
  } | null
}

type SessionResponse = {
  session: {
    id: string
    status: string
    etapa_atual: string
    medicao_id?: string | null
    pendencias: string[]
    historico_ia: HistoricoMensagem[]
    confirmacao_pendente?: Record<string, unknown> | null
    plano_agente?: Record<string, unknown> | null
  }
  contrato: {
    id: string
    numero_contrato: string
    objeto: string
    modalidade_execucao: string
    categoria?: string
    data_vigencia_inicio?: string
    data_vigencia_fim?: string
  }
  resumo?: {
    saldo_disponivel?: number
    valor_global?: number
    valor_em_analise?: number
  }
  preview: {
    modo: 'medicao' | 'draft'
    medicao?: PreviewMedicao | null
    discriminacoes?: Array<{ descricao: string; valor: number; percentual?: number }>
    draft?: DraftPreview | null
  }
  contexto_assistido?: ContextoAssistido
}

const STEPS = [
  { key: 'IDENTIFICACAO', label: 'Identificacao' },
  { key: 'PERIODO', label: 'Periodo' },
  { key: 'COMPETENCIA', label: 'Competencia' },
  { key: 'MEDICAO', label: 'Quantidade' },
  { key: 'NF', label: 'Nota Fiscal' },
  { key: 'DISCRIMINACOES', label: 'Discriminacao' },
  { key: 'OBSERVACOES', label: 'Observacoes' },
  { key: 'REVISAO', label: 'Revisao Final' },
]

function formatarMoeda(valor?: number | null) {
  return Number(valor || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  })
}

function formatarData(data?: string | null) {
  if (!data) return '-'
  const valor = String(data).substring(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    const [y, m, d] = valor.split('-')
    return `${d}/${m}/${y}`
  }
  return valor
}

function truncar(texto?: string, limite = 110) {
  if (!texto) return ''
  return texto.length > limite ? `${texto.slice(0, limite).trim()}...` : texto
}

function getPreviewAtual(sessionData: SessionResponse | null) {
  if (!sessionData) return null
  return sessionData.preview.modo === 'medicao'
    ? sessionData.preview.medicao || null
    : sessionData.preview.draft || null
}

function getDiscriminacoes(sessionData: SessionResponse | null) {
  return (
    sessionData?.preview.discriminacoes ||
    sessionData?.preview.draft?.discriminacoes ||
    []
  )
}

function getActiveStepIndex(sessionData: SessionResponse | null) {
  if (!sessionData) return 0
  const pendencias = sessionData.session.pendencias || []
  if (pendencias.includes('IDENTIFICACAO')) return 0
  if (pendencias.includes('PERIODO')) return 1
  if (pendencias.includes('COMPETENCIA')) return 2
  if (pendencias.includes('MEDICAO')) return 3
  if (pendencias.includes('NF')) return 4
  if (pendencias.includes('DISCRIMINACOES')) return 5
  if (pendencias.includes('OBSERVACOES')) return 6
  return 7
}

function getChips(sessionData: SessionResponse | null) {
  if (!sessionData) return []
  const etapa = sessionData.session.etapa_atual
  if (etapa === 'COMPETENCIA') return ['usar automatica']
  if (etapa === 'MEDICAO') return ['periodo cheio', 'item 1 = 1']
  if (etapa === 'DISCRIMINACOES') return ['reaproveitar ultima', 'ISS 2%, Despesas operacionais 48%, Servicos 50%']
  if (etapa === 'OBSERVACOES') return ['sem observacoes']
  if (sessionData.session.confirmacao_pendente) return ['sim', 'nao']
  return []
}

export default function MedicaoChatFornecedorPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [fornecedorId, setFornecedorId] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [sessionData, setSessionData] = useState<SessionResponse | null>(null)
  const [mensagem, setMensagem] = useState('')
  const [arquivoPendente, setArquivoPendente] = useState<File | null>(null)

  useEffect(() => {
    try {
      const fornecedorRaw = localStorage.getItem('fornecedor')
      if (!fornecedorRaw) return
      const fornecedor = JSON.parse(fornecedorRaw) as { id?: string }
      if (fornecedor.id) setFornecedorId(fornecedor.id)
    } catch {
      // noop
    }
  }, [])

  useEffect(() => {
    if (!fornecedorId || !params?.id) return

    const iniciar = async () => {
      setLoading(true)
      try {
        const medicaoId = searchParams.get('medicaoId') || undefined
        const res = await authFetch(
          `${API_URL}/api/fornecedor/contratos/${params.id}/medicao-chat/sessoes`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fornecedor_id: fornecedorId,
              medicao_id: medicaoId,
            }),
          },
        )
        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err.message || 'Nao foi possivel iniciar a sessao assistida')
        }
        setSessionData((await res.json()) as SessionResponse)
      } catch (error: unknown) {
        toast.error(error instanceof Error ? error.message : 'Erro ao iniciar agente')
      } finally {
        setLoading(false)
      }
    }

    void iniciar()
  }, [fornecedorId, params?.id, searchParams])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionData?.session.historico_ia])

  const preview = useMemo(() => getPreviewAtual(sessionData), [sessionData])
  const discriminacoes = useMemo(() => getDiscriminacoes(sessionData), [sessionData])
  const activeStep = useMemo(() => getActiveStepIndex(sessionData), [sessionData])
  const chips = useMemo(() => getChips(sessionData), [sessionData])

  const itemPrincipal = sessionData?.contexto_assistido?.itens_cronograma?.[0]
  const valorUnitario =
    Number(itemPrincipal?.valor_mensal || 0) ||
    Number(itemPrincipal?.valor_unitario || 0) ||
    undefined
  const quantidadeTotal =
    Number(itemPrincipal?.quantidade_meses || 0) ||
    Number(itemPrincipal?.quantidade || 0) ||
    undefined

  const enviarMensagem = async (texto?: string) => {
    const conteudo = (texto ?? mensagem).trim()
    if (!sessionData?.session.id || !conteudo || !fornecedorId) return

    const sessionDataAnterior = sessionData
    const mensagemOtimista: HistoricoMensagem = {
      role: 'user',
      content: conteudo,
      created_at: new Date().toISOString(),
    }

    setSessionData((atual) =>
      atual
        ? {
            ...atual,
            session: {
              ...atual.session,
              historico_ia: [...(atual.session.historico_ia || []), mensagemOtimista],
            },
          }
        : atual,
    )
    setMensagem('')
    setSending(true)
    try {
      const res = await authFetch(
        `${API_URL}/api/fornecedor/contratos/medicao-chat/sessoes/${sessionData.session.id}/mensagens`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fornecedor_id: fornecedorId,
            mensagem: conteudo,
          }),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Erro ao enviar mensagem')
      }
      setSessionData((await res.json()) as SessionResponse)
    } catch (error: unknown) {
      setSessionData(sessionDataAnterior)
      if (texto == null) {
        setMensagem(conteudo)
      }
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar mensagem')
    } finally {
      setSending(false)
    }
  }

  const handleUpload = async (file: File) => {
    if (!sessionData?.session.id || !fornecedorId) return
    setUploading(true)
    setArquivoPendente(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('fornecedor_id', fornecedorId)
      const res = await authFetch(
        `${API_URL}/api/fornecedor/contratos/medicao-chat/sessoes/${sessionData.session.id}/anexos`,
        {
          method: 'POST',
          body: formData,
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Erro ao enviar anexo')
      }
      setSessionData((await res.json()) as SessionResponse)
      toast.success('Arquivo enviado para o agente')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar arquivo')
    } finally {
      setUploading(false)
    }
  }

  const resetarConversa = async () => {
    if (!sessionData?.session.id || !fornecedorId) return
    setResetting(true)
    try {
      const res = await authFetch(
        `${API_URL}/api/fornecedor/contratos/medicao-chat/sessoes/${sessionData.session.id}/reset`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fornecedor_id: fornecedorId,
            limpar_rascunho: true,
          }),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Erro ao resetar conversa')
      }
      setSessionData((await res.json()) as SessionResponse)
      setMensagem('')
      toast.success('Conversa e rascunho reiniciados')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erro ao resetar conversa')
    } finally {
      setResetting(false)
    }
  }

  const selecionarArquivo = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.xml,image/png,image/jpeg,image/jpg'
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0]
      if (file) setArquivoPendente(file)
    }
    input.click()
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-blue-700" />
          <p className="mt-4 text-sm text-slate-600">Iniciando agente de medicao...</p>
        </div>
      </div>
    )
  }

  if (!sessionData) {
    return (
      <div className="p-8">
        <p className="text-red-600">Nao foi possivel carregar a sessao assistida.</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f0f2f5] text-slate-900">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-[#1a4fa0] px-6 text-white shadow-md">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/15 text-sm font-semibold">
          D
        </div>
        <div>
          <div className="text-sm font-semibold leading-tight">Portal DCP IA</div>
          <div className="text-xs text-white/70">Agente de Medicao</div>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="h-2 w-2 rounded-full bg-green-400 shadow-[0_0_0_3px_rgba(74,222,128,0.25)]" />
          <span className="text-xs text-white/85">Agente ativo</span>
          <Button variant="secondary" size="sm" asChild className="h-8 bg-white/10 text-white hover:bg-white/20">
            <Link href={`/fornecedor/contratos/${params.id}?tab=medicoes`}>
              <ArrowLeft className="mr-1 h-3.5 w-3.5" />
              Voltar
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
          <section className="border-b border-slate-200 p-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Contrato
            </div>
            <div className="mb-2 inline-flex rounded bg-blue-50 px-2 py-1 font-mono text-xs font-semibold text-blue-800">
              {sessionData.contrato.numero_contrato}
            </div>
            <p className="text-xs leading-5 text-slate-600">{truncar(sessionData.contrato.objeto)}</p>
          </section>

          <section className="border-b border-slate-200 p-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Dados financeiros
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Vigencia</span>
                <span className="text-right font-medium text-blue-800">
                  {formatarData(sessionData.contrato.data_vigencia_inicio)} a{' '}
                  {formatarData(sessionData.contrato.data_vigencia_fim)}
                </span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Valor unit.</span>
                <span className="font-medium">{valorUnitario ? formatarMoeda(valorUnitario) : '-'}</span>
              </div>
              <div className="flex justify-between gap-3">
                <span className="text-slate-500">Qtd. total</span>
                <span className="font-medium">{quantidadeTotal ? `${quantidadeTotal} meses` : '-'}</span>
              </div>
            </div>
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3">
              <div className="mb-1 text-[11px] font-semibold text-green-700">SALDO DISPONIVEL</div>
              <div className="font-mono text-xl font-semibold text-green-700">
                {formatarMoeda(sessionData.resumo?.saldo_disponivel)}
              </div>
            </div>
          </section>

          <section className="border-b border-slate-200 p-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Etapas
            </div>
            <div className="space-y-2">
              {STEPS.map((step, index) => {
                const done = index < activeStep
                const active = index === activeStep
                return (
                  <div
                    key={step.key}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 text-xs ${
                      active ? 'bg-blue-50 text-blue-800' : done ? 'bg-green-50 text-green-700' : 'text-slate-500'
                    }`}
                  >
                    <div
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        active ? 'bg-blue-700 text-white' : done ? 'bg-green-700 text-white' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
                    </div>
                    <span className={active || done ? 'font-medium' : ''}>{step.label}</span>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="p-5">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Resumo da medição
            </div>
            {!preview?.periodo_inicio &&
            !preview?.competencia &&
            !preview?.nota_fiscal_numero &&
            !preview?.valor_medido ? (
              <p className="text-xs italic text-slate-400">Preencha o formulário para ver o resumo.</p>
            ) : (
              <div className="space-y-3 text-xs">
                {preview?.periodo_inicio && (
                  <ResumoLinha label="Período início" value={formatarData(preview.periodo_inicio)} />
                )}
                {preview?.periodo_fim && (
                  <ResumoLinha label="Período fim" value={formatarData(preview.periodo_fim)} />
                )}
                {preview?.competencia && <ResumoLinha label="Competência" value={preview.competencia} />}
                {preview?.nota_fiscal_numero && <ResumoLinha label="Nota Fiscal" value={preview.nota_fiscal_numero} />}
                {preview?.valor_medido != null && (
                  <ResumoLinha label="Valor da medição" value={formatarMoeda(preview.valor_medido)} destaque />
                )}
                {discriminacoes.length > 0 && (
                  <div className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">Discriminação</div>
                    <div className="space-y-2">
                      {discriminacoes.map((item, index) => (
                        <div key={`${item.descricao}-${index}`} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
                          <div className="break-words text-[12px] leading-4 text-slate-600">{item.descricao}</div>
                          <div className="mt-1 font-mono text-sm font-semibold text-slate-900">{formatarMoeda(item.valor)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-[#1a4fa0] to-blue-600 text-sm font-semibold text-white">
              IA
            </div>
            <div>
              <div className="text-sm font-semibold">Assistente de Medicao</div>
              <div className="text-xs text-slate-500">Preenchimento guiado do boletim em tempo real</div>
            </div>
            <Badge className="ml-auto rounded-full border-amber-300 bg-amber-50 px-3 py-1 font-mono text-xs text-amber-700 hover:bg-amber-50">
              Boletim {sessionData.contexto_assistido?.ultima_medicao?.numero_medicao ? `#${Number(sessionData.contexto_assistido.ultima_medicao.numero_medicao) + 1}` : '#1'}
            </Badge>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/fornecedor/contratos/${params.id}?tab=medicoes&acao=${searchParams.get('acao') || 'nova'}${sessionData.session.medicao_id ? `&medicaoId=${sessionData.session.medicao_id}` : ''}`}
              >
                <FileText className="mr-1 h-3.5 w-3.5" />
                Formulario classico
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => void resetarConversa()} disabled={resetting}>
              {resetting ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="mr-1 h-3.5 w-3.5" />}
              Reiniciar
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-col gap-3">
              {sessionData.session.historico_ia.map((item, index) => (
                <MensagemChat key={`${item.created_at}-${index}`} item={item} onEnviarMensagem={(texto) => void enviarMensagem(texto)} disabled={sending} />
              ))}
              {sending && (
                <div className="flex max-w-[85%] gap-2">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-800">
                    IA
                  </div>
                  <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white px-5 py-3">
            {chips.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-2">
                {chips.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => void enviarMensagem(chip)}
                    disabled={sending}
                    className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-800 transition hover:bg-blue-700 hover:text-white disabled:opacity-50"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            {arquivoPendente && (
              <div className="mb-2 flex w-fit items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                <FileText className="h-4 w-4" />
                <span className="max-w-[260px] truncate font-medium">{arquivoPendente.name}</span>
                <Button size="sm" className="h-7 bg-amber-600 px-2 text-xs hover:bg-amber-700" onClick={() => void handleUpload(arquivoPendente)} disabled={uploading}>
                  {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Enviar'}
                </Button>
                <button type="button" onClick={() => setArquivoPendente(null)} className="text-amber-600 hover:text-amber-900">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <Button variant="outline" size="icon" className="h-10 w-10 shrink-0" onClick={selecionarArquivo} disabled={uploading}>
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
              </Button>
              <div className="flex min-h-10 flex-1 items-center rounded-xl border border-slate-200 bg-slate-50 px-3 focus-within:border-blue-700">
                <Textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Digite sua resposta..."
                  rows={1}
                  disabled={sending}
                  className="max-h-28 min-h-7 resize-none border-0 bg-transparent px-0 py-2 text-sm shadow-none focus-visible:ring-0"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void enviarMensagem()
                    }
                  }}
                />
              </div>
              <Button onClick={() => void enviarMensagem()} disabled={sending || !mensagem.trim()} className="h-10 w-10 shrink-0 rounded-lg bg-blue-700 p-0 hover:bg-blue-900">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>{sessionData.session.confirmacao_pendente ? 'Confirmação pendente' : `Etapa atual: ${STEPS[activeStep]?.label || 'Revisão'}`}</span>
              {sessionData.session.medicao_id && (
                <Button asChild size="sm" className="h-8 bg-green-700 px-3 text-xs font-semibold text-white shadow-sm hover:bg-green-800">
                  <Link href={`/fornecedor/contratos/${params.id}?tab=medicoes&acao=continuar&medicaoId=${sessionData.session.medicao_id}`}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                    Revisar e enviar rascunho
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

type ItemMedicaoJson = {
  numero_item: number
  descricao: string
  unidade_medida: string
  quantidade_contratada: number
  quantidade_medida_anterior: number
  saldo_disponivel: number
  valor_unitario: number
  bloqueado: boolean
  motivo_bloqueio?: string
}

type TabelaItensChat = {
  aviso?: string
  itens: ItemMedicaoJson[]
}

type DiscriminacaoJson = {
  descricao: string
  valor: number
  percentual: number
}

type TabelaDiscriminacaoChat = {
  discriminacoes: DiscriminacaoJson[]
}

function limparMarcadoresInternosChat(content: string) {
  return content
    .replace(/<!--ITENS_MEDICAO_JSON:[\s\S]*?-->/g, '')
    .replace(/<!--DISCRIMINACOES_JSON:[\s\S]*?-->/g, '')
    .replace(/<!--DISCRIMINACOES_CONFIRMACAO_JSON:[\s\S]*?-->/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
}

function extrairTabelaItensChat(content: string): TabelaItensChat | null {
  const match = content.match(/<!--ITENS_MEDICAO_JSON:([\s\S]+?)-->/)
  if (!match) return null
  try {
    const itens = JSON.parse(match[1]) as ItemMedicaoJson[]
    if (!Array.isArray(itens) || itens.length === 0) return null
    const linhas = content.split('\n')
    const avisoLinha = linhas.find((l) => l.includes('Itens já medidos neste período:'))
    return {
      aviso: avisoLinha?.trim(),
      itens,
    }
  } catch {
    return null
  }
}

function extrairTabelaDiscriminacaoChat(content: string): TabelaDiscriminacaoChat | null {
  const match = content.match(/<!--DISCRIMINACOES_JSON:([\s\S]+?)-->/)
  if (!match) return null
  try {
    const discriminacoes = JSON.parse(match[1]) as DiscriminacaoJson[]
    if (!Array.isArray(discriminacoes) || discriminacoes.length === 0) return null
    return { discriminacoes }
  } catch {
    return null
  }
}

function formatarQtd(valor: number, casas = 2) {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: 4 })
}

function formatarReais(valor: number) {
  return valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

type FiltroStatusTabela = 'todos' | 'disponivel' | 'bloqueado'

function CardTabelaItensChat({
  content,
  onEnviarMensagem,
  disabled,
}: {
  content: string
  onEnviarMensagem: (texto: string) => void
  disabled?: boolean
}) {
  const tabela = extrairTabelaItensChat(content)
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusTabela>('todos')
  const [selecionados, setSelecionados] = useState<Record<number, boolean>>({})
  const [quantidades, setQuantidades] = useState<Record<number, string>>(() => {
    if (!tabela) return {}
    const map: Record<number, string> = {}
    for (const item of tabela.itens) {
      if (item.bloqueado) continue
      if (item.unidade_medida === 'MENSAL') {
        map[item.numero_item] = '1'
      } else {
        map[item.numero_item] = ''
      }
    }
    return map
  })

  if (!tabela) return null

  const itensFiltrados = tabela.itens.filter((item) => {
    if (busca.trim()) {
      const alvo = `${item.numero_item} ${item.descricao}`.toLowerCase()
      if (!alvo.includes(busca.toLowerCase())) return false
    }
    if (filtroStatus === 'disponivel' && (item.bloqueado || item.saldo_disponivel <= 0)) return false
    if (filtroStatus === 'bloqueado' && !item.bloqueado) return false
    return true
  })

  const totalSelecionados = Object.values(selecionados).filter(Boolean).length

  const toggleItem = (numero: number) => {
    setSelecionados((prev) => ({ ...prev, [numero]: !prev[numero] }))
  }

  const toggleTodos = (marcar: boolean) => {
    const novos: Record<number, boolean> = {}
    for (const item of itensFiltrados) {
      if (!item.bloqueado && item.saldo_disponivel > 0) novos[item.numero_item] = marcar
    }
    setSelecionados((prev) => ({ ...prev, ...novos }))
  }

  const handleMedirSelecionados = () => {
    const partes: string[] = []
    for (const item of tabela.itens) {
      if (!selecionados[item.numero_item]) continue
      const qtdStr = (quantidades[item.numero_item] || '').trim()
      if (!qtdStr) continue
      partes.push(`item ${item.numero_item} = ${qtdStr}`)
    }
    if (partes.length === 0) return
    onEnviarMensagem(partes.join(', '))
  }

  return (
    <div className="space-y-3">
      {tabela.aviso ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {tabela.aviso.replace(/^⚠️\s*/, '')}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="relative flex-1 min-w-[200px]">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="🔍 Buscar item, descricao..."
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-1 text-xs">
            <label className="text-slate-500">Status:</label>
            <select
              value={filtroStatus}
              onChange={(e) => setFiltroStatus(e.target.value as FiltroStatusTabela)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs outline-none focus:border-blue-500"
            >
              <option value="todos">Todos</option>
              <option value="disponivel">Disponível</option>
              <option value="bloqueado">Bloqueado</option>
            </select>
          </div>
          <div className="ml-auto text-xs text-slate-500">
            <span className="font-semibold text-slate-700">{totalSelecionados}</span> selecionado(s)
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#163b73] text-white">
              <tr>
                <th className="px-2 py-2 text-left">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 cursor-pointer"
                    checked={
                      itensFiltrados.length > 0 &&
                      itensFiltrados.filter((i) => !i.bloqueado && i.saldo_disponivel > 0).every((i) => selecionados[i.numero_item])
                    }
                    onChange={(e) => toggleTodos(e.target.checked)}
                  />
                </th>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">DESCRIÇÃO DO ITEM</th>
                <th className="px-2 py-2 text-left">UNID.</th>
                <th className="px-2 py-2 text-left">QTD.</th>
                <th className="px-2 py-2 text-left">VALOR UNIT.</th>
                <th className="px-2 py-2 text-left">VALOR TOTAL</th>
                <th className="px-2 py-2 text-left">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {itensFiltrados.map((item) => {
                const podeSelecionar = !item.bloqueado && item.saldo_disponivel > 0
                const selecionado = !!selecionados[item.numero_item]
                const medicaoNumero = item.motivo_bloqueio?.match(/#(\d+)/)?.[1]
                return (
                  <tr
                    key={item.numero_item}
                    className={`border-b border-slate-100 last:border-b-0 ${selecionado ? 'bg-blue-50/40' : ''}`}
                  >
                    <td className="px-2 py-2 align-top">
                      <input
                        type="checkbox"
                        className="h-3.5 w-3.5 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                        disabled={!podeSelecionar}
                        checked={selecionado}
                        onChange={() => toggleItem(item.numero_item)}
                      />
                    </td>
                    <td className="px-2 py-2 align-top font-semibold text-slate-700">{item.numero_item}</td>
                    <td className="px-2 py-2 align-top">
                      <div className="max-w-[340px] whitespace-normal text-[11px] leading-4 text-slate-700">{item.descricao}</div>
                    </td>
                    <td className="px-2 py-2 align-top text-slate-600">{item.unidade_medida}</td>
                    <td className="px-2 py-2 align-top">
                      {podeSelecionar ? (
                        <input
                          type="text"
                          inputMode="decimal"
                          value={quantidades[item.numero_item] ?? ''}
                          onChange={(e) =>
                            setQuantidades((prev) => ({ ...prev, [item.numero_item]: e.target.value }))
                          }
                          onFocus={() => setSelecionados((prev) => ({ ...prev, [item.numero_item]: true }))}
                          className="w-20 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                          placeholder={formatarQtd(item.saldo_disponivel, 0)}
                        />
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-2 py-2 align-top font-mono text-slate-700">R$ {formatarReais(item.valor_unitario)}</td>
                    <td className="px-2 py-2 align-top font-mono font-semibold text-slate-800">
                      R${' '}
                      {formatarReais(
                        Number(quantidades[item.numero_item]?.replace(',', '.') || 0) * item.valor_unitario,
                      )}
                    </td>
                    <td className="px-2 py-2 align-top">
                      {item.bloqueado ? (
                        <Badge className="rounded-full border-amber-300 bg-amber-50 text-[10px] font-semibold text-amber-700 hover:bg-amber-50">
                          MEDIDO{medicaoNumero ? ` #${medicaoNumero}` : ''}
                        </Badge>
                      ) : item.saldo_disponivel > 0 ? (
                        <Badge className="rounded-full border-green-300 bg-green-50 text-[10px] font-semibold text-green-700 hover:bg-green-50">
                          DISPONÍVEL
                        </Badge>
                      ) : (
                        <Badge className="rounded-full border-slate-300 bg-slate-100 text-[10px] font-semibold text-slate-600 hover:bg-slate-100">
                          ESGOTADO
                        </Badge>
                      )}
                    </td>
                  </tr>
                )
              })}
              {itensFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-xs text-slate-500">
                    Nenhum item encontrado para os filtros aplicados.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-500">
            Exibindo {itensFiltrados.length} de {tabela.itens.length} itens
          </div>
          <Button
            size="sm"
            onClick={handleMedirSelecionados}
            disabled={disabled || totalSelecionados === 0}
            className="h-8 bg-blue-700 px-3 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            Medir itens selecionados
          </Button>
        </div>
      </div>
    </div>
  )
}

function CardTabelaDiscriminacaoChat({
  content,
  onEnviarMensagem,
  disabled,
}: {
  content: string
  onEnviarMensagem: (texto: string) => void
  disabled?: boolean
}) {
  const tabela = extrairTabelaDiscriminacaoChat(content)
  const [busca, setBusca] = useState('')
  const [valores, setValores] = useState<Record<number, string>>(() => {
    if (!tabela) return {}
    const map: Record<number, string> = {}
    tabela.discriminacoes.forEach((d, i) => {
      map[i] = d.percentual != null ? String(d.percentual) : ''
    })
    return map
  })

  if (!tabela) return null

  const discriminacoesFiltradas = tabela.discriminacoes.filter((item, idx) => {
    if (busca.trim()) {
      const alvo = `${idx + 1} ${item.descricao}`.toLowerCase()
      if (!alvo.includes(busca.toLowerCase())) return false
    }
    return true
  })

  const handleConfirmar = () => {
    const discriminacoes = tabela.discriminacoes.flatMap((d, i) => {
      const pct = (valores[i] ?? '').trim()
      if (!pct) return []
      return [{
        descricao: d.descricao,
        percentual: Number(pct.replace(',', '.')) || 0,
        valor: d.valor || 0,
      }]
    })
    if (discriminacoes.length === 0) return
    onEnviarMensagem(
      `Confirmar discriminações ajustadas. <!--DISCRIMINACOES_CONFIRMACAO_JSON:${JSON.stringify(discriminacoes)}-->`
    )
  }

  const totalPercentual = tabela.discriminacoes.reduce((acc, _, i) => {
    const v = Number((valores[i] ?? '').replace(',', '.')) || 0
    return acc + v
  }, 0)

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="relative flex-1 min-w-[200px]">
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="🔍 Buscar discriminação..."
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-blue-500"
            />
          </div>
          <div className="ml-auto text-xs text-slate-500">
            Total: <span className={`font-semibold ${totalPercentual === 100 ? 'text-green-600' : totalPercentual > 100 ? 'text-red-600' : 'text-slate-700'}`}>{totalPercentual.toFixed(1)}%</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-[#163b73] text-white">
              <tr>
                <th className="px-2 py-2 text-left">#</th>
                <th className="px-2 py-2 text-left">DESCRIÇÃO</th>
                <th className="px-2 py-2 text-left">%</th>
                <th className="px-2 py-2 text-left">VALOR</th>
              </tr>
            </thead>
            <tbody>
              {discriminacoesFiltradas.map((item, idx) => {
                const indexOriginal = tabela.discriminacoes.indexOf(item)
                return (
                  <tr
                    key={idx}
                    className="border-b border-slate-100 last:border-b-0"
                  >
                    <td className="px-2 py-2 align-top font-semibold text-slate-700">{idx + 1}</td>
                    <td className="px-2 py-2 align-top">
                      <div className="max-w-[340px] whitespace-normal text-[11px] leading-4 text-slate-700">{item.descricao}</div>
                    </td>
                    <td className="px-2 py-2 align-top">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valores[indexOriginal] ?? ''}
                        onChange={(e) =>
                          setValores((prev) => ({ ...prev, [indexOriginal]: e.target.value }))
                        }
                        className="w-16 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs outline-none focus:border-blue-500"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-2 py-2 align-top font-mono text-slate-700">
                      R$ {formatarReais(item.valor || 0)}
                    </td>
                  </tr>
                )
              })}
              {discriminacoesFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-xs text-slate-500">
                    Nenhuma discriminação encontrada.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-[11px] text-slate-500">
            Exibindo {discriminacoesFiltradas.length} de {tabela.discriminacoes.length} discriminações
          </div>
          <Button
            size="sm"
            onClick={handleConfirmar}
            disabled={disabled}
            className="h-8 bg-blue-700 px-3 text-xs font-semibold text-white hover:bg-blue-800 disabled:opacity-50"
          >
            <Check className="mr-1 h-3.5 w-3.5" />
            Confirmar discriminações
          </Button>
        </div>
      </div>
    </div>
  )
}

function ResumoLinha({ label, value, destaque = false }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${destaque ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
      <div className="text-[11px] font-medium uppercase tracking-[0.06em] text-slate-500">{label}</div>
      <div className={`mt-1 break-words font-semibold ${destaque ? 'font-mono text-base text-green-700' : 'text-sm text-slate-900'}`}>{value}</div>
    </div>
  )
}

function MensagemChat({
  item,
  onEnviarMensagem,
  disabled,
}: {
  item: HistoricoMensagem
  onEnviarMensagem: (texto: string) => void
  disabled?: boolean
}) {
  const user = item.role === 'user'
  const tabelaItens = !user ? extrairTabelaItensChat(item.content) : null
  const tabelaDiscriminacao = !user ? extrairTabelaDiscriminacaoChat(item.content) : null
  const conteudoSemMarker = limparMarcadoresInternosChat(item.content)
  const conteudoSemTabelaMarkdown = conteudoSemMarker
    .replace(/📋 \*\*Itens disponíveis para medição:\*\*/g, '')
    .replace(/📊 \*\*Discriminações da despesa:\*\*/g, '')
    .replace(/\|[^\n]+\|\n\|[-: |]+\|\n(\|[^\n]+\|\n?)+/g, '')
    .replace(/Selecione os itens na tabela[\s\S]+/g, '')
    .replace(/Ajuste os valores ou percentuais[\s\S]+/g, '')
    .trim()
  const textoIntroducao = tabelaItens || tabelaDiscriminacao ? conteudoSemTabelaMarkdown : conteudoSemMarker

  if (tabelaItens) {
    return (
      <div className={`flex w-full gap-2 ${user ? 'ml-auto flex-row-reverse' : ''}`}>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full text-xs font-semibold ${
            user ? 'bg-slate-200 text-slate-600' : 'bg-blue-50 text-blue-800'
          }`}
        >
          {user ? 'F' : 'IA'}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {textoIntroducao ? (
            <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed shadow-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                }}
              >
                {textoIntroducao}
              </ReactMarkdown>
            </div>
          ) : null}
          <CardTabelaItensChat content={item.content} onEnviarMensagem={onEnviarMensagem} disabled={disabled} />
        </div>
      </div>
    )
  }

  if (tabelaDiscriminacao) {
    return (
      <div className={`flex w-full gap-2 ${user ? 'ml-auto flex-row-reverse' : ''}`}>
        <div
          className={`flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-full text-xs font-semibold ${
            user ? 'bg-slate-200 text-slate-600' : 'bg-blue-50 text-blue-800'
          }`}
        >
          {user ? 'F' : 'IA'}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {textoIntroducao ? (
            <div className="rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed shadow-sm">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                }}
              >
                {textoIntroducao}
              </ReactMarkdown>
            </div>
          ) : null}
          <CardTabelaDiscriminacaoChat content={item.content} onEnviarMensagem={onEnviarMensagem} disabled={disabled} />
        </div>
      </div>
    )
  }

  return (
    <div className={`flex max-w-[85%] gap-2 ${user ? 'ml-auto flex-row-reverse' : ''}`}>
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center self-end rounded-full text-xs font-semibold ${
          user ? 'bg-slate-200 text-slate-600' : 'bg-blue-50 text-blue-800'
        }`}
      >
        {user ? 'F' : 'IA'}
      </div>
      <div
        className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
          user
            ? 'rounded-br-md bg-blue-700 text-white'
            : 'rounded-bl-md border border-slate-200 bg-white shadow-sm'
        }`}
      >
        {user ? (
          <span className="whitespace-pre-wrap">{conteudoSemMarker}</span>
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
              ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
              li: ({ children }) => <li>{children}</li>,
              code: ({ children }) => <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">{children}</code>,
            }}
          >
            {conteudoSemMarker}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}
