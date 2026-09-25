'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Clock, Gavel, Loader2 } from 'lucide-react'
import { API_URL, authFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { SalaFornecedor } from '@/components/sala/fornecedor/SalaFornecedor'
import { SalaDispensaFornecedor } from '@/components/sala/fornecedor/SalaDispensaFornecedor'
import { ResultadoLicitacaoCard } from '@/components/licitacao/ResultadoLicitacaoCard'
import { LeilaoFornecedor } from '@/components/modalidades/LeilaoFornecedor'
import { ConcursoFornecedor } from '@/components/modalidades/ConcursoFornecedor'
import { DialogoFornecedor } from '@/components/modalidades/DialogoFornecedor'

interface LicitacaoResumo {
  id: string
  numero_processo?: string
  numero_edital?: string
  objeto: string
  modalidade: string
  fase: string
  data_abertura_sessao?: string | null
}

/**
 * SALA ÚNICA DO FORNECEDOR (plano E8 item 6; decisão 5 — rota aprovada).
 * Pregão/concorrência/leilão: sala do motor único (lances + painéis pós-disputa).
 * Dispensa: janela de lances + chat na mesma rota. Concurso e diálogo (sem
 * lances): o painel da modalidade. Em todas: o resultado depois da homologação.
 */
export default function SalaFornecedorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: licitacaoId } = use(params)
  const [licitacao, setLicitacao] = useState<LicitacaoResumo | null>(null)
  const [sessaoId, setSessaoId] = useState<string | null | undefined>(undefined)
  const [erro, setErro] = useState<string | null>(null)
  const [fornecedorId, setFornecedorId] = useState<string | null>(null)

  useEffect(() => {
    try {
      setFornecedorId(JSON.parse(localStorage.getItem('fornecedor') || 'null')?.id ?? null)
    } catch {
      setFornecedorId(null)
    }
    let ativo = true
    ;(async () => {
      try {
        const resLic = await authFetch(`${API_URL}/api/licitacoes/${licitacaoId}`)
        if (!resLic.ok) throw new Error('Licitação não encontrada.')
        const lic: LicitacaoResumo = await resLic.json()
        if (!ativo) return
        setLicitacao(lic)
        const resSessao = await authFetch(`${API_URL}/api/sessao/licitacao/${licitacaoId}`)
        const sessao = resSessao.ok ? await resSessao.json().catch(() => null) : null
        if (ativo) setSessaoId(sessao?.id ?? null)
      } catch (e) {
        if (ativo) setErro(e instanceof Error ? e.message : 'Erro ao abrir a sala')
      }
    })()
    return () => {
      ativo = false
    }
  }, [licitacaoId])

  const voltar = (
    <Link href={`/fornecedor/licitacoes/${licitacaoId}`}>
      <Button variant="outline">
        <ArrowLeft className="mr-2 h-4 w-4" /> Licitação
      </Button>
    </Link>
  )
  const resultado = <ResultadoLicitacaoCard licitacaoId={licitacaoId} destaqueFornecedorId={fornecedorId} ocultarSeVazio />

  if (erro) {
    return (
      <Card className="border-red-200">
        <CardContent className="space-y-4 py-12 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-red-500" />
          <p className="font-medium text-red-700">{erro}</p>
          {voltar}
        </CardContent>
      </Card>
    )
  }
  if (!licitacao || sessaoId === undefined) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-600">
        <Loader2 className="mr-2 h-6 w-6 animate-spin" /> Abrindo a sala...
      </div>
    )
  }

  const cabecalho = (titulo: string) => (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-900">
          <Gavel className="h-6 w-6 text-emerald-700" /> {titulo}
        </h1>
        <p className="text-sm text-slate-600">
          {licitacao.numero_edital || licitacao.numero_processo} — {licitacao.objeto}
        </p>
      </div>
      {voltar}
    </div>
  )

  // Dispensa eletrônica: janela de lances + chat (ex-/lances)
  if (licitacao.modalidade === 'DISPENSA_ELETRONICA') {
    return (
      <div className="mx-auto max-w-4xl space-y-4 p-6">
        {cabecalho('Sala de lances — Dispensa Eletrônica')}
        <SalaDispensaFornecedor licitacaoId={licitacaoId} />
        {resultado}
      </div>
    )
  }

  const painelModalidade =
    licitacao.modalidade === 'LEILAO' ? (
      <LeilaoFornecedor licitacaoId={licitacaoId} />
    ) : licitacao.modalidade === 'CONCURSO' ? (
      <ConcursoFornecedor licitacaoId={licitacaoId} />
    ) : licitacao.modalidade === 'DIALOGO_COMPETITIVO' ? (
      <DialogoFornecedor licitacaoId={licitacaoId} />
    ) : null

  if (sessaoId) {
    return (
      <SalaFornecedor
        sessaoId={sessaoId}
        acoesCabecalho={voltar}
        rodape={
          <>
            {painelModalidade}
            {resultado}
          </>
        }
      />
    )
  }

  // Sem sessão: concurso/diálogo não têm lances; demais aguardam a abertura
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      {cabecalho('Sala da sessão')}
      {painelModalidade ?? (
        <Card>
          <CardContent className="flex items-center gap-3 py-8 text-slate-700">
            <Clock className="h-6 w-6 text-amber-600" />
            <div>
              <p className="font-medium">A sessão pública ainda não foi aberta.</p>
              <p className="text-sm text-slate-500">
                {licitacao.data_abertura_sessao
                  ? `Abertura prevista: ${new Date(licitacao.data_abertura_sessao).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
                  : 'A sala abre quando o agente de contratação iniciar a sessão.'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}
      {resultado}
    </div>
  )
}
