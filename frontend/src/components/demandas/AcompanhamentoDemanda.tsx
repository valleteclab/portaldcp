'use client'

/**
 * Acompanhamento da demanda depois de enviada: aprovação › DFD (planejamento)
 * › PCA › processo › contrato — o requisitante vê o pedido andando.
 * Dados de GET /api/demandas/:id/acompanhamento.
 */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarDataBR } from '@/lib/api'
import type { AcompanhamentoDaDemanda } from './tipos'

const pill = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium'
const PENDENTE = `${pill} bg-gray-50 text-gray-600 border-gray-200`

function Seta() {
  return <ChevronRight className="h-3.5 w-3.5 text-gray-400 shrink-0" aria-hidden="true" />
}

export function AcompanhamentoDemanda({ acomp, rejeitada }: { acomp: AcompanhamentoDaDemanda; rejeitada: boolean }) {
  const aprovadaEm = acomp.demanda?.data_aprovacao
  const contratos = acomp.contratos ?? []
  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4 sm:px-6">
        <CardTitle className="text-sm">Acompanhamento</CardTitle>
      </CardHeader>
      <CardContent className="px-4 sm:px-6">
        <ol className="flex items-center gap-1.5 flex-wrap text-sm" aria-label="Andamento da demanda">
          {/* 1. Aprovação */}
          <li className="flex items-center gap-1.5">
            <span className={`${pill} ${
              rejeitada
                ? 'bg-red-50 text-red-700 border-red-200'
                : aprovadaEm
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
            }`}>
              {rejeitada ? '✗ Rejeitada' : aprovadaEm ? '✓ Aprovada' : '⏳ Em aprovação'}
              {aprovadaEm && <span className="font-normal opacity-80">{formatarDataBR(aprovadaEm)}</span>}
            </span>
            <Seta />
          </li>
          {/* 2. DFD consolidado (unidade de planejamento) */}
          <li className="flex items-center gap-1.5">
            {acomp.dfd ? (
              <Link href={`/orgao/demandas/dfd/${acomp.dfd.id}`} title="DFD montado pela unidade de planejamento"
                className={`${pill} bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 transition-colors`}>
                ✓ No DFD nº {acomp.dfd.numero}/{acomp.dfd.ano}
              </Link>
            ) : (
              <span className={PENDENTE}>○ DFD (planejamento)</span>
            )}
            <Seta />
          </li>
          {/* 3. PCA */}
          <li className="flex items-center gap-1.5">
            <span className={acomp.pca?.consolidada ? `${pill} bg-green-50 text-green-700 border-green-200` : PENDENTE}>
              {acomp.pca?.consolidada
                ? `✓ No PCA ${acomp.pca.itens[0]?.ano_exercicio || ''} (item ${acomp.pca.itens.map((i) => i.numero_item).join(', ')})`
                : '○ PCA — não consolidada'}
            </span>
            <Seta />
          </li>
          {/* 4. Contratação */}
          <li className="flex items-center gap-1.5">
            {acomp.processo ? (
              <Link href={`/orgao/processos/${acomp.processo.id}`} title="Abrir o processo"
                className={`${pill} bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 transition-colors`}>
                {acomp.processo.data_homologacao ? '✓' : '⏳'} Processo {acomp.processo.numero_processo} · {String(acomp.processo.fase || '').replaceAll('_', ' ').toLowerCase()}
              </Link>
            ) : (
              <span className={PENDENTE}>○ Contratação não iniciada</span>
            )}
            <Seta />
          </li>
          {/* 5. Contrato */}
          <li>
            {contratos.length > 0 ? (
              <Link href={`/orgao/contratos/${contratos[0].id}`} title="Abrir o contrato"
                className={`${pill} bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-colors`}>
                ✓ Contrato {contratos.map((c) => c.numero_contrato).join(', ')}
                {contratos.some((c) => c.assinatura_status === 'CONCLUIDO') && ' · assinado'}
              </Link>
            ) : (
              <span className={PENDENTE}>○ Contrato</span>
            )}
          </li>
        </ol>
      </CardContent>
    </Card>
  )
}
