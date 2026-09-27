/**
 * Resumo lateral da demanda (padrão das telas de etapa): checklist das 4
 * seções com atalho para cada cartão, estimativa preliminar e o PCA do ano,
 * mais a explicação curta do que é a demanda.
 */
import { AlertTriangle, CheckCircle2, Circle } from 'lucide-react'
import { fmtMoeda, type Demanda } from './tipos'

export interface ItemChecklist {
  secao: number
  texto: string
  ok: boolean
  obrigatorio?: boolean
}

export function checklistDaDemanda(demanda: Demanda): ItemChecklist[] {
  return [
    { secao: 1, texto: 'Informações gerais (descrição do pedido)', ok: !!demanda.descricao_sucinta_objeto?.trim(), obrigatorio: true },
    { secao: 2, texto: 'Justificativa da necessidade', ok: !!demanda.observacoes?.trim() },
    { secao: 3, texto: 'Materiais e serviços (ao menos 1 item)', ok: (demanda.itens?.length ?? 0) > 0, obrigatorio: true },
    { secao: 4, texto: 'Responsável pelo pedido', ok: !!demanda.responsavel_nome?.trim() },
  ]
}

export function ResumoDemanda({
  demanda,
  total,
  editavel,
}: {
  demanda: Demanda
  total: number
  editavel: boolean
}) {
  const checklist = checklistDaDemanda(demanda)
  const nItens = demanda.itens?.length ?? 0
  return (
    <div className="space-y-4 xl:sticky xl:top-4">
      <section className="rounded-lg border bg-white p-4 space-y-2" aria-labelledby="resumo-checklist">
        <h2 id="resumo-checklist" className="text-sm font-semibold text-gray-900">
          {editavel ? 'Antes de enviar' : 'Seções da demanda'}
        </h2>
        <ul className="space-y-1.5 text-sm">
          {checklist.map((c) => (
            <li key={c.secao}>
              <a href={`#secao-${c.secao}`} className="flex items-start gap-2 rounded px-1 -mx-1 py-0.5 hover:bg-slate-50">
                {c.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-green-700 shrink-0 mt-0.5" aria-label="feito" />
                ) : c.obrigatorio && editavel ? (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" aria-label="pendente" />
                ) : (
                  <Circle className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" aria-label="não preenchido" />
                )}
                <span className="text-gray-800">
                  <span className="font-mono text-xs text-gray-500 mr-1">{c.secao}</span>
                  {c.texto}
                  {c.obrigatorio && !c.ok && editavel && <span className="block text-xs text-amber-800">obrigatório para enviar</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border bg-white p-4 space-y-1" aria-labelledby="resumo-estimativa">
        <h2 id="resumo-estimativa" className="text-sm font-semibold text-gray-900">Estimativa preliminar</h2>
        <p className="text-xl font-semibold text-gray-900">{fmtMoeda(total)}</p>
        <p className="text-xs text-gray-600">
          {nItens} {nItens === 1 ? 'item' : 'itens'} · PCA {demanda.ano_referencia}
        </p>
      </section>

      <section className="rounded-lg border bg-slate-50 p-4 space-y-1.5 text-sm text-gray-700">
        <h2 className="text-sm font-semibold text-gray-900">O que é a demanda?</h2>
        <p>É o pedido do seu setor: o que precisa, quanto, por quê e para quando.</p>
        <p>Depois de enviada, ela é aprovada e o planejamento junta pedidos parecidos de outros setores num DFD.</p>
      </section>
    </div>
  )
}
