'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
      setMensagem('')
    } catch (error: unknown) {
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
        <aside className="flex w-[300px] shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
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

          <section className="p-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Resumo da medicao
            </div>
            {!preview?.periodo_inicio &&
            !preview?.competencia &&
            !preview?.nota_fiscal_numero &&
            !preview?.valor_medido ? (
              <p className="text-xs italic text-slate-400">Preencha o formulario para ver o resumo.</p>
            ) : (
              <div className="space-y-2 text-xs">
                {preview?.periodo_inicio && (
                  <ResumoLinha label="Periodo Inicio" value={formatarData(preview.periodo_inicio)} />
                )}
                {preview?.periodo_fim && (
                  <ResumoLinha label="Periodo Fim" value={formatarData(preview.periodo_fim)} />
                )}
                {preview?.competencia && <ResumoLinha label="Competencia" value={preview.competencia} />}
                {preview?.nota_fiscal_numero && <ResumoLinha label="Nota Fiscal" value={preview.nota_fiscal_numero} />}
                {preview?.valor_medido != null && (
                  <ResumoLinha label="Valor da Medicao" value={formatarMoeda(preview.valor_medido)} destaque />
                )}
                {discriminacoes.length > 0 && (
                  <div className="pt-1">
                    <div className="mb-1 text-[11px] text-slate-500">Discriminacao</div>
                    <div className="space-y-1">
                      {discriminacoes.slice(0, 3).map((item, index) => (
                        <div key={`${item.descricao}-${index}`} className="flex justify-between gap-2 text-[11px]">
                          <span className="truncate text-slate-600">{item.descricao}</span>
                          <span className="font-mono text-slate-900">{formatarMoeda(item.valor)}</span>
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
                <MensagemChat key={`${item.created_at}-${index}`} item={item} />
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

            <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
              <span>{sessionData.session.confirmacao_pendente ? 'Confirmacao pendente' : `Etapa atual: ${STEPS[activeStep]?.label || 'Revisao'}`}</span>
              {sessionData.session.medicao_id && (
                <Link className="inline-flex items-center gap-1 font-medium text-blue-700 hover:underline" href={`/fornecedor/contratos/${params.id}?tab=medicoes&acao=continuar&medicaoId=${sessionData.session.medicao_id}`}>
                  <Upload className="h-3.5 w-3.5" />
                  Abrir rascunho para envio
                </Link>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}

function ResumoLinha({ label, value, destaque = false }: { label: string; value: string; destaque?: boolean }) {
  return (
    <div>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-0.5 font-medium ${destaque ? 'font-mono text-green-700' : 'text-slate-900'}`}>{value}</div>
    </div>
  )
}

function MensagemChat({ item }: { item: HistoricoMensagem }) {
  const user = item.role === 'user'
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
          <span className="whitespace-pre-wrap">{item.content}</span>
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
            {item.content}
          </ReactMarkdown>
        )}
      </div>
    </div>
  )
}
