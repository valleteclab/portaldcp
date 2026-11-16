'use client'

/**
 * FORA DA DISPUTA (dono, 10/11/2026: a inabilitada "deve saber o motivo"). Quando
 * a proposta foi desclassificada — inclusive por inabilitação na habilitação
 * prévia da inversão de fases — a sala fechava com "Você não participa desta
 * licitação". Agora mostra o que aconteceu, o motivo e a data, e mantém à mão o
 * que o licitante ainda pode fazer: recorrer (art. 165) e baixar os comprovantes.
 */
import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { ComprovantesFornecedor } from '@/components/fornecedor/ComprovantesFornecedor'
import { RecursosFornecedorPanel } from '../RecursosFornecedorPanel'

interface Situacao {
  tipo: 'INABILITADO' | 'DESCLASSIFICADO'
  motivo: string | null
  em: string | null
}

export function ForaDaDisputa({ licitacaoId, sessaoId, erroPadrao }: { licitacaoId?: string; sessaoId: string; erroPadrao: string }) {
  // undefined = consultando; null = não é desclassificação/inabilitação (mostra o erro comum)
  const [situacao, setSituacao] = useState<Situacao | null | undefined>(licitacaoId ? undefined : null)

  useEffect(() => {
    if (!licitacaoId) return
    let vivo = true
    authFetch(`${API_URL}/api/propostas/licitacao/${licitacaoId}/minha-situacao`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { foraDaDisputa: Situacao | null } | null) => {
        if (vivo) setSituacao(j?.foraDaDisputa ?? null)
      })
      .catch(() => {
        if (vivo) setSituacao(null)
      })
    return () => {
      vivo = false
    }
  }, [licitacaoId])

  if (situacao === undefined) return null
  if (!situacao || !licitacaoId) {
    return (
      <Card className="border-red-200">
        <CardContent className="py-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-500" />
          <p className="font-medium text-red-700">{erroPadrao}</p>
        </CardContent>
      </Card>
    )
  }

  const inabilitado = situacao.tipo === 'INABILITADO'
  return (
    <div className="space-y-6">
      <Card className="border-amber-300 bg-amber-50/70">
        <CardContent className="space-y-3 py-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" />
            <div className="min-w-0 space-y-2">
              <h2 className="text-lg font-semibold text-amber-950">
                {inabilitado ? 'Você foi inabilitado nesta licitação' : 'Sua proposta foi desclassificada nesta licitação'}
              </h2>
              <p className="text-sm text-amber-900">
                {inabilitado
                  ? 'O agente de contratação julgou a sua habilitação e decidiu pela inabilitação. Por isso você não participa da etapa de lances.'
                  : 'O agente de contratação desclassificou a sua proposta. Por isso você não participa da etapa de lances.'}
              </p>
              <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Motivo registrado</div>
                <div className="whitespace-pre-wrap break-words text-slate-900">{situacao.motivo || 'O motivo não foi informado. Peça esclarecimento ao órgão.'}</div>
                {situacao.em && (
                  <div className="mt-1 text-xs text-slate-500">Decisão de {new Date(situacao.em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
                )}
              </div>
              <p className="text-sm text-amber-900">
                Você pode recorrer desta decisão (Lei 14.133/2021, art. 165): a intenção de recurso é manifestada abaixo, no prazo que o agente de
                contratação abrir depois do resultado da habilitação.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      <RecursosFornecedorPanel sessaoId={sessaoId} />
      <ComprovantesFornecedor licitacaoId={licitacaoId} ocultarSeVazio />
    </div>
  )
}
