/**
 * Cartão de uma seção da demanda (1 Informações gerais, 2 Justificativa,
 * 3 Materiais/serviços, 4 Responsável) — mesmo `Card` das demais telas do órgão,
 * com número, título, ajuda curta e ações à direita.
 */
import { CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function SecaoDemanda({
  id,
  numero,
  titulo,
  descricao,
  completa,
  acoes,
  children,
}: {
  id: string
  numero: number
  titulo: string
  descricao?: React.ReactNode
  completa?: boolean
  acoes?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card id={id} className="scroll-mt-4 gap-4 min-w-0" aria-labelledby={`${id}-titulo`}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-6">
        <div className="min-w-0 flex-1 space-y-1.5">
          <CardTitle id={`${id}-titulo`} className="text-base flex items-center gap-2">
            <span
              className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                completa ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-700'
              }`}
              aria-hidden="true"
            >
              {completa ? <CheckCircle2 className="h-4 w-4" /> : numero}
            </span>
            {titulo}
          </CardTitle>
          {descricao && <CardDescription className="text-gray-600">{descricao}</CardDescription>}
        </div>
        {acoes && <div className="flex items-center gap-2 flex-wrap">{acoes}</div>}
      </CardHeader>
      <CardContent className="min-w-0 px-4 sm:px-6">{children}</CardContent>
    </Card>
  )
}
