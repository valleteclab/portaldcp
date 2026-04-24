'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useParams, useSearchParams } from 'next/navigation'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  ArrowLeft,
  Bot,
  FileText,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  User,
} from 'lucide-react'
import { toast } from 'sonner'

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
  execucao_financeira?: {
    totais?: {
      no_periodo?: number
      ate_periodo?: number
      a_executar?: number
    }
  }
}

type DraftPreview = {
  periodo_inicio?: string
  periodo_fim?: string
  competencia?: string
  nota_fiscal_numero?: string
  nota_fiscal_valor?: number
  valor_medido?: number
  discriminacoes?: Array<{ descricao: string; valor: number; percentual: number }>
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
    discriminacoes?: Array<{ descricao: string; valor: number; percentual: number }>
    draft?: DraftPreview | null
  }
}

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

function labelPendencia(pendencia: string) {
  const labels: Record<string, string> = {
    PERIODO: 'Periodo',
    COMPETENCIA: 'Competencia',
    NF: 'Nota fiscal',
    MEDICAO: 'Execucao da medicao',
    DISCRIMINACOES: 'Discriminacoes',
    OBSERVACOES: 'Observacoes',
  }
  return labels[pendencia] || pendencia
}

export default function MedicaoChatFornecedorPage() {
  const params = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [fornecedorId, setFornecedorId] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [sessionData, setSessionData] = useState<SessionResponse | null>(null)
  const [mensagem, setMensagem] = useState('')

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
        const data = (await res.json()) as SessionResponse
        setSessionData(data)
      } catch (error: unknown) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Erro ao iniciar assistente de medicao',
        )
      } finally {
        setLoading(false)
      }
    }

    void iniciar()
  }, [fornecedorId, params?.id, searchParams])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [sessionData?.session.historico_ia])

  const enviarMensagem = async () => {
    if (!sessionData?.session.id || !mensagem.trim() || !fornecedorId) return
    setSending(true)
    try {
      const res = await authFetch(
        `${API_URL}/api/fornecedor/contratos/medicao-chat/sessoes/${sessionData.session.id}/mensagens`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fornecedor_id: fornecedorId,
            mensagem,
          }),
        },
      )
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.message || 'Erro ao enviar mensagem')
      }
      const data = (await res.json()) as SessionResponse
      setSessionData(data)
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
      const data = (await res.json()) as SessionResponse
      setSessionData(data)
      toast.success('Arquivo enviado para o assistente')
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Erro ao enviar arquivo')
    } finally {
      setUploading(false)
    }
  }

  const previewFinanceiro = useMemo(() => {
    if (!sessionData || sessionData.preview.modo !== 'medicao') return null
    return sessionData.preview.medicao?.execucao_financeira?.totais || null
  }, [sessionData])

  const discriminacoes =
    sessionData?.preview.discriminacoes ||
    sessionData?.preview.draft?.discriminacoes ||
    []

  if (loading) {
    return (
      <div className="p-8 text-center">
        <Loader2 className="w-10 h-10 animate-spin mx-auto text-blue-600" />
        <p className="mt-4 text-gray-600">Iniciando assistente de medicao...</p>
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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge className="bg-purple-100 text-purple-700">Assistente IA</Badge>
            <span className="text-sm text-gray-500">
              {sessionData.contrato.numero_contrato}
            </span>
          </div>
          <h1 className="text-2xl font-bold">Medicao Assistida por Conversa</h1>
          <p className="text-sm text-gray-600">{sessionData.contrato.objeto}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/fornecedor/contratos/${params.id}?tab=medicoes`}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Voltar
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link
              href={`/fornecedor/contratos/${params.id}?tab=medicoes&acao=${searchParams.get('acao') || 'nova'}${sessionData.session.medicao_id ? `&medicaoId=${sessionData.session.medicao_id}` : ''}`}
            >
              <FileText className="w-4 h-4 mr-1" />
              Formulario classico
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-4">
        <Card className="min-h-[720px] flex flex-col">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-600" />
              Conversa
            </CardTitle>
            <CardDescription>
              A IA conduz o preenchimento e atualiza o rascunho em tempo real.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col gap-4">
            <div className="flex-1 overflow-y-auto rounded-lg border bg-slate-50 p-4 space-y-3 min-h-[460px]">
              {sessionData.session.historico_ia.map((item, index) => (
                <div
                  key={`${item.created_at}-${index}`}
                  className={`flex gap-3 ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  {item.role !== 'user' && (
                    <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4" />
                    </div>
                  )}
                  <div
                    className={`${item.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border'} rounded-2xl px-4 py-3 max-w-[85%] text-sm whitespace-pre-wrap`}
                  >
                    {item.content}
                  </div>
                  {item.role === 'user' && (
                    <div className="w-8 h-8 rounded-full bg-slate-600 text-white flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4" />
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                disabled={uploading}
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.pdf,.xml,image/png,image/jpeg,image/jpg'
                  input.onchange = async (event) => {
                    const file = (event.target as HTMLInputElement).files?.[0]
                    if (file) await handleUpload(file)
                  }
                  input.click()
                }}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                ) : (
                  <Paperclip className="w-4 h-4 mr-1" />
                )}
                Enviar NF / anexo
              </Button>
              {sessionData.session.confirmacao_pendente && (
                <Badge className="bg-amber-100 text-amber-700">
                  Confirmacao pendente
                </Badge>
              )}
              <Badge className="bg-slate-100 text-slate-700">
                Etapa: {labelPendencia(sessionData.session.etapa_atual)}
              </Badge>
            </div>

            <div className="flex items-end gap-2">
              <Textarea
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                placeholder='Ex.: "01/04/2026 a 30/04/2026", "usar automatica", "item 1 = 2"...'
                rows={4}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void enviarMensagem()
                  }
                }}
              />
              <Button
                onClick={() => void enviarMensagem()}
                disabled={sending || !mensagem.trim()}
                className="h-11"
              >
                {sending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rascunho em tempo real</CardTitle>
              <CardDescription>
                O painel ao lado mostra o que ja foi aplicado ao boletim.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-gray-500 uppercase">Saldo disponivel</p>
                  <p className="font-semibold text-blue-700">
                    {formatarMoeda(sessionData.resumo?.saldo_disponivel)}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-gray-500 uppercase">Em analise</p>
                  <p className="font-semibold text-amber-700">
                    {formatarMoeda(sessionData.resumo?.valor_em_analise)}
                  </p>
                </div>
              </div>

              <div className="rounded-lg border p-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Periodo</span>
                  <span className="font-medium">
                    {sessionData.preview.modo === 'medicao'
                      ? `${formatarData(sessionData.preview.medicao?.periodo_inicio)} a ${formatarData(sessionData.preview.medicao?.periodo_fim)}`
                      : `${formatarData(sessionData.preview.draft?.periodo_inicio)} a ${formatarData(sessionData.preview.draft?.periodo_fim)}`}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Competencia</span>
                  <span className="font-medium">
                    {sessionData.preview.modo === 'medicao'
                      ? sessionData.preview.medicao?.competencia || '-'
                      : sessionData.preview.draft?.competencia || '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">NF</span>
                  <span className="font-medium">
                    {sessionData.preview.modo === 'medicao'
                      ? sessionData.preview.medicao?.nota_fiscal_numero || '-'
                      : sessionData.preview.draft?.nota_fiscal_numero || '-'}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Valor NF</span>
                  <span className="font-medium">
                    {formatarMoeda(
                      sessionData.preview.modo === 'medicao'
                        ? sessionData.preview.medicao?.nota_fiscal_valor
                        : sessionData.preview.draft?.nota_fiscal_valor,
                    )}
                  </span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-500">Valor medido</span>
                  <span className="font-medium text-green-700">
                    {formatarMoeda(
                      sessionData.preview.modo === 'medicao'
                        ? sessionData.preview.medicao?.valor_medido
                        : sessionData.preview.draft?.valor_medido,
                    )}
                  </span>
                </div>
              </div>

              {previewFinanceiro && (
                <div className="rounded-lg border border-green-200 bg-green-50/40 p-3 space-y-2 text-sm">
                  <p className="font-semibold text-green-800">Execucao financeira</p>
                  <div className="flex justify-between">
                    <span>No periodo</span>
                    <span className="font-medium">
                      {formatarMoeda(previewFinanceiro.no_periodo)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Ate o periodo</span>
                    <span className="font-medium">
                      {formatarMoeda(previewFinanceiro.ate_periodo)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>A executar</span>
                    <span className="font-medium">
                      {formatarMoeda(previewFinanceiro.a_executar)}
                    </span>
                  </div>
                </div>
              )}

              <div>
                <p className="text-sm font-semibold mb-2">Pendencias</p>
                <div className="flex flex-wrap gap-2">
                  {sessionData.session.pendencias.length === 0 ? (
                    <Badge className="bg-green-100 text-green-700">
                      Rascunho completo
                    </Badge>
                  ) : (
                    sessionData.session.pendencias.map((item) => (
                      <Badge key={item} className="bg-amber-100 text-amber-700">
                        {labelPendencia(item)}
                      </Badge>
                    ))
                  )}
                </div>
              </div>

              <div>
                <p className="text-sm font-semibold mb-2">Discriminacoes</p>
                <div className="space-y-2">
                  {discriminacoes.length === 0 ? (
                    <p className="text-sm text-gray-500">Ainda nao preenchidas.</p>
                  ) : (
                    discriminacoes.map((disc, index) => (
                      <div
                        key={`${disc.descricao}-${index}`}
                        className="rounded-lg border p-2 text-sm flex items-center justify-between gap-3"
                      >
                        <span className="truncate">{disc.descricao}</span>
                        <span className="font-medium whitespace-nowrap">
                          {formatarMoeda(disc.valor)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {sessionData.session.medicao_id && (
                <Button asChild className="w-full bg-blue-600 hover:bg-blue-700">
                  <Link
                    href={`/fornecedor/contratos/${params.id}?tab=medicoes&acao=continuar&medicaoId=${sessionData.session.medicao_id}`}
                  >
                    Abrir rascunho no fluxo de envio manual
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
