'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, CheckCircle2, AlertTriangle, Scale, ChevronDown, ChevronUp } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'

interface Conciliacao {
  exercicio: number
  sistema: {
    migracao_no_exercicio: number
    medido_aprovado_no_exercicio: number
    total_no_exercicio: number
    acumulado_vigencia: number
    valor_global: number
    a_executar: number
    ultima_medicao?: { numero: number; periodo_fim: string; valor: number } | null
  }
  fator: {
    disponivel: boolean
    total_empenhado_liquido: number
    total_liquidado: number
    total_pago: number
    saldo_a_liquidar: number
  }
  diferenca: number
  tolerancia: number
  status: 'CONCILIADO' | 'DIVERGENTE' | 'SEM_DADOS_FATOR'
  atravessa_exercicios: boolean
  alertas: { tipo: string; mensagem: string }[]
}

const fmtBRL = (v: number | null | undefined) =>
  v == null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))

export default function ConciliacaoFatorCard({ contratoId }: { contratoId: string }) {
  const [dados, setDados] = useState<Conciliacao | null>(null)
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState(false)
  const [aberto, setAberto] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro(false)
    try {
      const res = await authFetch(`${API_URL}/api/contratos/${contratoId}/conciliacao-fator`)
      if (res.ok) setDados(await res.json())
      else setErro(true)
    } catch {
      setErro(true)
    } finally {
      setLoading(false)
    }
  }, [contratoId])

  useEffect(() => { carregar() }, [carregar])

  if (loading && !dados) {
    return (
      <Card className="border-slate-200">
        <CardContent className="py-3 flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Conciliando com o portal de transparência…
        </CardContent>
      </Card>
    )
  }
  if (erro || !dados) return null
  if (dados.status === 'SEM_DADOS_FATOR' && dados.alertas.length === 0) return null

  const divergente = dados.status === 'DIVERGENTE' || dados.alertas.length > 0
  const corBorda = divergente ? 'border-amber-300 bg-amber-50/50' : 'border-emerald-200 bg-emerald-50/40'

  return (
    <Card className={corBorda}>
      <CardContent className="py-3 space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Scale className="w-4 h-4 text-gray-500" />
            <span className="font-medium">Conciliação com a transparência ({dados.exercicio})</span>
            {dados.status === 'CONCILIADO' && dados.alertas.length === 0 ? (
              <span className="inline-flex items-center gap-1 text-emerald-700 text-xs font-medium">
                <CheckCircle2 className="w-4 h-4" /> Conciliado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-700 text-xs font-medium">
                <AlertTriangle className="w-4 h-4" />
                {dados.status === 'DIVERGENTE' ? `Divergência de ${fmtBRL(Math.abs(dados.diferenca))}` : 'Verificar consistência'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={carregar} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setAberto((a) => !a)}>
              {aberto ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div><span className="text-gray-500">Sistema (competência {dados.exercicio}):</span> <span className="font-semibold">{fmtBRL(dados.sistema.total_no_exercicio)}</span></div>
          <div><span className="text-gray-500">Liquidado (Fator):</span> <span className="font-semibold">{fmtBRL(dados.fator.total_liquidado)}</span></div>
          <div><span className="text-gray-500">Pago (Fator):</span> <span className="font-semibold">{fmtBRL(dados.fator.total_pago)}</span></div>
          <div><span className="text-gray-500">A executar (contrato):</span> <span className="font-semibold">{fmtBRL(dados.sistema.a_executar)}</span></div>
        </div>

        {aberto && (
          <div className="pt-2 border-t space-y-2 text-xs text-gray-600">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>Migração no exercício: <strong>{fmtBRL(dados.sistema.migracao_no_exercicio)}</strong></div>
              <div>Medições aprovadas ({dados.exercicio}): <strong>{fmtBRL(dados.sistema.medido_aprovado_no_exercicio)}</strong></div>
              <div>Empenhado líquido ({dados.exercicio}): <strong>{fmtBRL(dados.fator.total_empenhado_liquido)}</strong></div>
              <div>Saldo a liquidar (empenho): <strong>{fmtBRL(dados.fator.saldo_a_liquidar)}</strong></div>
            </div>
            <p className="text-gray-500">
              Diferença (sistema − liquidado): <strong>{fmtBRL(dados.diferenca)}</strong> · tolerância {fmtBRL(dados.tolerancia)}
              {dados.sistema.ultima_medicao && (
                <> · última medição #{dados.sistema.ultima_medicao.numero} ({fmtBRL(dados.sistema.ultima_medicao.valor)}) — se recém-aprovada, pode ainda não estar liquidada (defasagem normal).</>
              )}
            </p>
            {dados.atravessa_exercicios && (
              <p className="text-amber-700">
                ⚠ Este contrato atravessa exercícios: o empenho de {dados.exercicio} cobre só até dezembro — o saldo do empenho não é o saldo do contrato. Apostilamento/novo empenho é esperado em {dados.exercicio + 1}.
              </p>
            )}
            {dados.alertas.map((a, i) => (
              <p key={i} className="text-amber-800 bg-amber-100/60 rounded px-2 py-1">⚠ {a.mensagem}</p>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
