'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { JulgamentoTecnicoConfig } from '@/components/julgamento/JulgamentoTecnicoConfig'
import { NotasTecnicasPanel } from '@/components/julgamento/NotasTecnicasPanel'

/**
 * JULGAMENTO TÉCNICO da licitação (órgão) — Lei 14.133/2021 arts. 35–37:
 * edital (quesitos, pesos, banca) e a avaliação da banca com a publicação das
 * notas, que libera a etapa de preços na sala.
 */
export default function JulgamentoTecnicoPage() {
  const params = useParams()
  const id = params.id as string
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Link href={`/orgao/processos/${id}`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Processo
          </Button>
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">Julgamento técnico</h1>
      </div>
      <JulgamentoTecnicoConfig licitacaoId={id} />
      <NotasTecnicasPanel licitacaoId={id} />
    </div>
  )
}
