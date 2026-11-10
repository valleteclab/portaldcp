'use client'

/**
 * DETALHE DO LOTE — sala da pregoeira (dono, 09/11/2026): ao abrir um lote na
 * tabela por fases, abaixo dela aparecem, em largura cheia, só as ações da fase
 * daquele lote. As etapas já passadas ficam para consulta, recolhidas.
 */
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { ResultadoPanel } from '@/components/resultado/ResultadoPanel'
import { AceitacaoPanel } from '../AceitacaoPanel'
import { BeneficioMeEppPanel } from '../BeneficioMeEppPanel'
import { DesempatePanel } from '../DesempatePanel'
import { HabilitacaoPanel } from '../HabilitacaoPanel'
import { NegociacaoPanel } from '../NegociacaoPanel'
import { RecursosPanel } from '../RecursosPanel'
import { LancesAoVivo } from '../LancesAoVivo'
import type { LoteVisao } from '../SalaPorFases'
import type { DisputaV3Contexto, DisputaV3ItemBoard } from '../types'
import { formatarMoeda } from '../utils'
import { ItemEmFocoOrgao } from './ItemEmFocoOrgao'

const ORDEM = ['AGUARDANDO', 'DISPUTA', 'DESEMPATE', 'JULGAMENTO', 'HABILITACAO', 'RECURSOS', 'EM_ADJUDICACAO', 'ADJUDICADO', 'HOMOLOGADO', 'SEM_RESULTADO']

function Consulta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <details className="rounded-xl border border-slate-200 bg-white">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">{titulo}</summary>
      <div className="space-y-4 border-t p-3">{children}</div>
    </details>
  )
}

export function DetalheLoteOrgao({
  sessaoId,
  contexto,
  lote,
  item,
  negociacaoVersao,
  onEncerrar,
  onReiniciarDemais,
}: {
  sessaoId: string
  contexto?: DisputaV3Contexto | null
  lote: LoteVisao
  /** Unidade no quadro em tempo real (lances, relógio). */
  item: DisputaV3ItemBoard | null
  negociacaoVersao: number
  onEncerrar: (itemId: string) => void
  onReiniciarDemais: () => void
}) {
  const licitacaoId = contexto?.licitacaoId
  const unidade = { tipo: lote.tipo, numero: lote.numero }
  const pos = ORDEM.indexOf(lote.fase)
  const passou = (fase: string) => pos > ORDEM.indexOf(fase)
  const rotulo = lote.tipo === 'ITEM' ? 'Item' : 'Lote'
  const lances = item ? (
    <>
      <ItemEmFocoOrgao item={item} contexto={contexto} onEncerrar={onEncerrar} onReiniciarDemais={onReiniciarDemais} />
      {/* Colocação de todos e últimos lances: recarrega quando muda o que importa, não a cada tique do relógio */}
      <LancesAoVivo sessaoId={sessaoId} unidadeId={lote.id} atualizacao={`${item.status}|${item.faseModo}|${item.totalLances}|${item.melhorLance?.valor}`} />
    </>
  ) : null

  let principal: ReactNode = null
  switch (lote.fase) {
    case 'AGUARDANDO':
    case 'DISPUTA':
      principal = lances
      break
    case 'DESEMPATE':
      principal = (
        <>
          <BeneficioMeEppPanel sessaoId={sessaoId} sempreVisivel />
          <DesempatePanel sessaoId={sessaoId} />
        </>
      )
      break
    case 'JULGAMENTO':
      principal = (
        <>
          <AceitacaoPanel sessaoId={sessaoId} unidadeId={lote.id} />
          <NegociacaoPanel sessaoId={sessaoId} versao={negociacaoVersao} unidadeId={lote.id} />
        </>
      )
      break
    case 'HABILITACAO':
      principal = licitacaoId ? <HabilitacaoPanel licitacaoId={licitacaoId} unidade={unidade} /> : null
      break
    case 'RECURSOS':
      principal = <RecursosPanel sessaoId={sessaoId} />
      break
    case 'EM_ADJUDICACAO':
    case 'ADJUDICADO':
    case 'HOMOLOGADO':
      principal = licitacaoId ? <ResultadoPanel licitacaoId={licitacaoId} /> : null
      break
    default:
      principal = <div className="rounded-xl border bg-white px-4 py-6 text-sm text-slate-500">Sem resultado nesta unidade (deserta ou fracassada).</div>
  }

  return (
    <section aria-label={`${rotulo} ${lote.numero}`} className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-900 px-4 py-3 text-white">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-slate-300">{rotulo} em foco</div>
          <div className="text-lg font-semibold">
            {rotulo} {lote.numero} — {lote.descricao}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Badge className="border-0 bg-white/15 text-white">{lote.faseRotulo}</Badge>
          {lote.primeiro && (
            <span>
              1º <b>{lote.primeiro.nome}</b> · {formatarMoeda(lote.primeiro.valor)}
            </span>
          )}
        </div>
      </div>

      {principal}

      {/* Etapas já passadas deste lote, para consulta */}
      {passou('DISPUTA') && lances && <Consulta titulo={`Lances deste ${rotulo.toLowerCase()} (consulta)`}>{lances}</Consulta>}
      {passou('JULGAMENTO') && (
        <Consulta titulo={`Proposta aceita${passou('HABILITACAO') && licitacaoId ? ' e documentos de habilitação' : ''} (consulta)`}>
          <AceitacaoPanel sessaoId={sessaoId} unidadeId={lote.id} />
          {passou('HABILITACAO') && licitacaoId && <HabilitacaoPanel licitacaoId={licitacaoId} unidade={unidade} />}
        </Consulta>
      )}
    </section>
  )
}
