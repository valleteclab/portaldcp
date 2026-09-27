'use client'

/**
 * Peças comuns do DFD consolidado (unidade de planejamento): rótulos da
 * situação, formatação e o alerta de pedidos parecidos no exercício
 * (art. 12, VII, e art. 75, §1º — atenção, não bloqueio).
 */
import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

export const ROTULO_STATUS_DFD: Record<string, string> = {
  RASCUNHO: 'Em elaboração',
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADO: 'Aprovado',
  EM_PROCESSO: 'Processo aberto',
  CANCELADO: 'Cancelado',
}

export const COR_STATUS_DFD: Record<string, string> = {
  RASCUNHO: 'bg-gray-100 text-gray-800',
  AGUARDANDO_APROVACAO: 'bg-amber-100 text-amber-800',
  APROVADO: 'bg-green-100 text-green-800',
  EM_PROCESSO: 'bg-indigo-100 text-indigo-800',
  CANCELADO: 'bg-red-100 text-red-800',
}

export interface Parecido {
  tipo: 'DEMANDA' | 'DFD' | 'PROCESSO'
  id: string
  rotulo: string
  link: string
  situacao: string | null
  motivos: string[]
}

export const formatarMoeda = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0)

const NOME_TIPO: Record<Parecido['tipo'], string> = { DEMANDA: 'Demanda', DFD: 'DFD', PROCESSO: 'Processo' }

/** Alerta de parecidos: lista o que bate (mesmo item do catálogo ou mesma classe), com link. */
export function AlertaParecidos({ alertas }: { alertas: Parecido[] | null | undefined }) {
  if (!alertas?.length) return null
  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Atenção: há {alertas.length === 1 ? 'outro pedido parecido' : `${alertas.length} pedidos parecidos`} no mesmo exercício
      </p>
      <p className="text-xs mt-1">
        Lei 14.133, art. 12, VII, e art. 75, §1º: itens da mesma natureza devem ser planejados em conjunto (evita o fracionamento). Avalie
        juntar num único DFD ou registre por que a contratação é separada. Não impede continuar.
      </p>
      <ul className="mt-2 space-y-1">
        {alertas.map((a) => (
          <li key={`${a.tipo}-${a.id}`} className="text-xs">
            <span className="font-medium">{NOME_TIPO[a.tipo]}:</span>{' '}
            <Link href={a.link} className="text-blue-800 underline">{a.rotulo}</Link>
            {' — '}
            {a.motivos.join('; ')}
          </li>
        ))}
      </ul>
    </div>
  )
}
