'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { FlaskConical, Play, Square, CheckCircle2, XCircle, Clock, Loader2, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { adminFetch, API_URL } from '@/lib/api'

// ============================================================================
// Tipos
// ============================================================================

type StepStatus = 'pending' | 'running' | 'pass' | 'fail'
type RunStatus = 'idle' | 'running' | 'passed' | 'failed'

interface TestStep {
  id: number
  descricao: string
  status: StepStatus
  durationMs?: number
  detalhe?: string
}

interface TestRunResult {
  status: RunStatus
  startedAt?: string
  finishedAt?: string
  durationMs?: number
  steps: TestStep[]
  summary: { total: number; passed: number; failed: number; pending: number }
}

// ============================================================================
// Helpers de UI
// ============================================================================

function StepIcon({ status }: { status: StepStatus }) {
  if (status === 'pass') return <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
  if (status === 'fail') return <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
  if (status === 'running') return <Loader2 className="h-4 w-4 text-blue-500 animate-spin flex-shrink-0" />
  return <Clock className="h-4 w-4 text-slate-300 flex-shrink-0" />
}

function RunBadge({ status }: { status: RunStatus }) {
  const map: Record<RunStatus, { label: string; className: string }> = {
    idle: { label: 'Aguardando', className: 'bg-slate-100 text-slate-600 border-slate-200' },
    running: { label: 'Executando…', className: 'bg-blue-100 text-blue-700 border-blue-200 animate-pulse' },
    passed: { label: 'PASSOU ✓', className: 'bg-green-100 text-green-700 border-green-200' },
    failed: { label: 'FALHOU ✗', className: 'bg-red-100 text-red-700 border-red-200' },
  }
  const { label, className } = map[status]
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold border ${className}`}>
      {label}
    </span>
  )
}

function formatMs(ms?: number): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ============================================================================
// Página principal
// ============================================================================

export default function TestesE2EPage() {
  const [resultado, setResultado] = useState<TestRunResult | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const activeStepRef = useRef<HTMLTableRowElement | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ── Buscar resultado (polling) ────────────────────────────────────────────

  const buscarResultado = useCallback(async () => {
    try {
      const res = await adminFetch(`${API_URL}/api/admin/testes/resultado`)
      if (res.ok) {
        const data: TestRunResult = await res.json()
        setResultado(data)
        // Para polling quando não está mais rodando
        if (data.status !== 'running' && pollingRef.current) {
          clearInterval(pollingRef.current)
          pollingRef.current = null
        }
      }
    } catch {
      // silencioso — não interrompe a UI
    }
  }, [])

  // Carga inicial
  useEffect(() => {
    buscarResultado()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-scroll para o step ativo
  useEffect(() => {
    if (activeStepRef.current) {
      activeStepRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [resultado])

  // ── Ações ─────────────────────────────────────────────────────────────────

  const executar = async () => {
    setIniciando(true)
    try {
      await adminFetch(`${API_URL}/api/admin/testes/executar`, { method: 'POST' })
      // Inicia polling
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = setInterval(buscarResultado, 2_000)
      await buscarResultado()
    } finally {
      setIniciando(false)
    }
  }

  const cancelar = async () => {
    await adminFetch(`${API_URL}/api/admin/testes/cancelar`, { method: 'POST' })
    await buscarResultado()
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  // Limpa polling ao desmontar
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [])

  // Retomar polling se a página for carregada com run ativo
  useEffect(() => {
    if (resultado?.status === 'running' && !pollingRef.current) {
      pollingRef.current = setInterval(buscarResultado, 2_000)
    }
  }, [resultado?.status, buscarResultado])

  // ── Dados derivados ───────────────────────────────────────────────────────

  const isRunning = resultado?.status === 'running'
  const steps = resultado?.steps ?? []
  const summary = resultado?.summary ?? { total: 20, passed: 0, failed: 0, pending: 20 }
  const progressoPct = summary.total > 0
    ? Math.round(((summary.passed + summary.failed) / summary.total) * 100)
    : 0

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-purple-100">
          <FlaskConical className="h-6 w-6 text-purple-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Testes E2E</h1>
          <p className="text-sm text-slate-500">
            Pregão Eletrônico — fluxo completo (Lei 14.133/2021)
          </p>
        </div>
      </div>

      {/* Card de status e controles */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <CardTitle className="text-base">Status do Teste</CardTitle>
            <RunBadge status={resultado?.status ?? 'idle'} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Métricas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Metric label="Total" value={summary.total} color="text-slate-700" />
            <Metric label="Passou" value={summary.passed} color="text-green-600" />
            <Metric label="Falhou" value={summary.failed} color="text-red-600" />
            <Metric
              label="Duração"
              value={formatMs(resultado?.durationMs)}
              color="text-slate-600"
            />
          </div>

          {/* Barra de progresso */}
          {resultado && resultado.status !== 'idle' && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Progresso</span>
                <span>{summary.passed + summary.failed}/{summary.total} passos</span>
              </div>
              <Progress value={progressoPct} className="h-2" />
            </div>
          )}

          {/* Botões */}
          <div className="flex gap-3 flex-wrap">
            <Button
              onClick={executar}
              disabled={isRunning || iniciando}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {iniciando ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              {iniciando ? 'Iniciando…' : 'Executar Teste'}
            </Button>

            {isRunning && (
              <Button variant="outline" onClick={cancelar} className="border-red-200 text-red-600 hover:bg-red-50">
                <Square className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={buscarResultado}
              className="text-slate-500"
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Atualizar
            </Button>
          </div>

          {/* Timestamps */}
          {resultado?.startedAt && (
            <p className="text-xs text-slate-400">
              Iniciado: {new Date(resultado.startedAt).toLocaleString('pt-BR')}
              {resultado.finishedAt && (
                <> · Finalizado: {new Date(resultado.finishedAt).toLocaleString('pt-BR')}</>
              )}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tabela de passos */}
      {steps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Passos do Teste</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600 w-10">#</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600">Descrição</th>
                    <th className="text-center px-4 py-2.5 font-medium text-slate-600 w-24">Status</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-600 w-24">Tempo</th>
                    <th className="text-left px-4 py-2.5 font-medium text-slate-600 max-w-xs">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((step) => {
                    const isActive = step.status === 'running'
                    return (
                      <tr
                        key={step.id}
                        ref={isActive ? activeStepRef : null}
                        className={[
                          'border-b transition-colors',
                          step.status === 'pass' ? 'bg-white' : '',
                          step.status === 'fail' ? 'bg-red-50' : '',
                          step.status === 'running' ? 'bg-blue-50' : '',
                          step.status === 'pending' ? 'bg-white opacity-50' : '',
                        ].join(' ')}
                      >
                        <td className="px-4 py-2.5 text-slate-400 font-mono text-xs">
                          {step.id}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <StepIcon status={step.status} />
                            <span className={step.status === 'pending' ? 'text-slate-400' : 'text-slate-700'}>
                              {step.descricao}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <StatusBadge status={step.status} />
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-xs text-slate-500">
                          {formatMs(step.durationMs)}
                        </td>
                        <td className="px-4 py-2.5 max-w-xs">
                          {step.detalhe && (
                            <span
                              className={[
                                'text-xs font-mono break-all',
                                step.status === 'fail' ? 'text-red-600' : 'text-slate-500',
                              ].join(' ')}
                            >
                              {step.detalhe}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultado final */}
      {resultado?.status === 'passed' && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
          <CheckCircle2 className="h-6 w-6 text-green-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-green-800">Todos os passos passaram!</p>
            <p className="text-sm text-green-600">
              {summary.passed}/{summary.total} passos · {formatMs(resultado.durationMs)}
            </p>
          </div>
        </div>
      )}

      {resultado?.status === 'failed' && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-red-50 border border-red-200">
          <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
          <div>
            <p className="font-semibold text-red-800">Falha na execução</p>
            <p className="text-sm text-red-600">
              {summary.passed} passados · {summary.failed} falhados · {formatMs(resultado.durationMs)}
            </p>
            <p className="text-xs text-red-500 mt-1">
              Verifique o detalhe do passo com erro na tabela acima.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Subcomponentes ────────────────────────────────────────────────────────────

function Metric({
  label,
  value,
  color,
}: {
  label: string
  value: number | string
  color: string
}) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: StepStatus }) {
  const map: Record<StepStatus, { label: string; className: string }> = {
    pending: { label: 'Aguardando', className: 'bg-slate-100 text-slate-400' },
    running: { label: 'Rodando', className: 'bg-blue-100 text-blue-700' },
    pass: { label: 'Passou', className: 'bg-green-100 text-green-700' },
    fail: { label: 'Falhou', className: 'bg-red-100 text-red-700' },
  }
  const { label, className } = map[status]
  return (
    <Badge className={`text-xs ${className} hover:${className}`} variant="outline">
      {label}
    </Badge>
  )
}
