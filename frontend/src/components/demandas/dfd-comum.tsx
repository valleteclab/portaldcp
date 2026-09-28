'use client'

/**
 * Peças comuns do DFD consolidado (unidade de planejamento): rótulos da
 * situação, formatação e o alerta de pedidos parecidos no exercício
 * (art. 12, VII, e art. 75, §1º — atenção, não bloqueio).
 */
import Link from 'next/link'
import { AlertTriangle, Check } from 'lucide-react'
import { SITUACAO_DFD, type PassoGuia } from '@/lib/demandas/proxima-acao-dfd'

export const ROTULO_STATUS_DFD: Record<string, string> = SITUACAO_DFD

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
export function AlertaParecidos({ alertas, compacto = false }: { alertas: Parecido[] | null | undefined; compacto?: boolean }) {
  if (!alertas?.length) return null
  return (
    <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="font-semibold flex items-center gap-2">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        Atenção: há {alertas.length === 1 ? 'outro pedido parecido' : `${alertas.length} pedidos parecidos`} no mesmo exercício
      </p>
      <p className={`text-xs mt-1 ${compacto ? 'hidden' : ''}`}>
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

const PASSOS_GUIA: Array<{ n: PassoGuia; titulo: string; texto: string }> = [
  { n: 1, titulo: 'Escolha as demandas', texto: 'Junte os pedidos parecidos dos setores' },
  { n: 2, titulo: 'Monte e confira o DFD', texto: 'Itens somados, ajustes e PDF' },
  { n: 3, titulo: 'Abra o processo', texto: 'Modalidade e fase interna' },
]

/**
 * Guia de 3 passos da unidade de planejamento (consolidação → DFD → processo),
 * com o passo em que o usuário está destacado. Cada passo pode ter link
 * (`links[n]`) — ex.: voltar à escolha das demandas.
 */
export function GuiaDfd({
  atual,
  concluidos = [],
  links = {},
}: {
  atual: PassoGuia | null
  concluidos?: PassoGuia[]
  links?: Partial<Record<PassoGuia, string>>
}) {
  return (
    <nav aria-label="Passos do DFD consolidado">
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PASSOS_GUIA.map((p) => {
          const feito = concluidos.includes(p.n) && atual !== p.n
          const agora = atual === p.n
          const conteudo = (
            <>
              <span
                className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
                  agora ? 'bg-blue-700 text-white' : feito ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-600'
                }`}
                aria-hidden="true"
              >
                {feito ? <Check className="h-4 w-4" /> : p.n}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-semibold ${agora ? 'text-blue-900' : 'text-gray-900'}`}>
                  {p.n}. {p.titulo}
                  {agora && <span className="sr-only"> (você está aqui)</span>}
                  {feito && <span className="sr-only"> (concluído)</span>}
                </span>
                <span className="block text-xs text-gray-600">{agora ? 'Você está aqui — ' : ''}{p.texto}</span>
              </span>
            </>
          )
          const classe = `flex items-center gap-3 rounded-lg border p-3 min-w-0 ${
            agora ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600' : 'bg-white'
          }`
          const href = links[p.n]
          return (
            <li key={p.n} aria-current={agora ? 'step' : undefined} className="min-w-0">
              {href && !agora ? (
                <Link href={href} className={`${classe} hover:bg-slate-50`}>{conteudo}</Link>
              ) : (
                <div className={classe}>{conteudo}</div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
