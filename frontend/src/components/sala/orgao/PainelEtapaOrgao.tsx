'use client'

import type { ReactNode } from 'react'
import type { DisputaMensagem, DisputaV3Contexto } from '../types'
import { AceitacaoPanel } from '../AceitacaoPanel'
import { BeneficioMeEppPanel } from '../BeneficioMeEppPanel'
import { ChatSala } from '../ChatSala'
import { DesempatePanel } from '../DesempatePanel'
import { HabilitacaoPanel } from '../HabilitacaoPanel'
import { NegociacaoPanel } from '../NegociacaoPanel'
import { RecursosPanel } from '../RecursosPanel'
import { ResultadoPanel } from '@/components/resultado/ResultadoPanel'
import { LeilaoPainel } from '@/components/modalidades/LeilaoPainel'

/**
 * Coluna de etapa da sala do pregoeiro: um painel real por etapa da sessão
 * (plano E8 item 4). Os atos são dos painéis (cada um com a sua rota do
 * backend); esta coluna só escolhe o que mostrar pela etapa vinda do backend.
 */
export function PainelEtapaOrgao({
  sessaoId,
  contexto,
  negociacaoVersao,
  mensagens,
  onEnviarMensagem,
  enviandoMensagem,
}: {
  sessaoId: string
  contexto?: DisputaV3Contexto | null
  negociacaoVersao: number
  mensagens: DisputaMensagem[]
  onEnviarMensagem: (texto: string) => void
  enviandoMensagem?: boolean
}) {
  const etapa = contexto?.etapa?.codigo || ''
  const licitacaoId = contexto?.licitacaoId

  const chat = (
    <ChatSala
      mensagens={mensagens}
      onEnviar={onEnviarMensagem}
      enviando={enviandoMensagem}
      habilitado={!!contexto?.operacao.chatHabilitado}
      descricao="Mensagens oficiais do pregoeiro — ficam registradas na ata da sessão."
      placeholder="Envie uma orientação oficial para a sala..."
      altura="h-[calc(100vh-560px)] min-h-[220px]"
    />
  )

  let painel: ReactNode = null
  if (contexto?.criterioJulgamento === 'MAIOR_LANCE' && licitacaoId && ['ACEITACAO', 'RECURSOS'].includes(etapa)) {
    // LEILÃO (art. 31 §4º; E7c): sem aceitação nem habilitação — arrematantes, recursos e resultado
    painel = (
      <>
        <LeilaoPainel licitacaoId={licitacaoId} modo="sala" />
        <RecursosPanel sessaoId={sessaoId} />
        <ResultadoPanel licitacaoId={licitacaoId} />
      </>
    )
  } else if (etapa === 'ACEITACAO') {
    // Aceitação da proposta (IN 73 art. 29) + negociação (art. 61)
    painel = (
      <>
        <AceitacaoPanel sessaoId={sessaoId} />
        <NegociacaoPanel sessaoId={sessaoId} versao={negociacaoVersao} />
      </>
    )
  } else if (etapa === 'NEGOCIACAO') {
    painel = <NegociacaoPanel sessaoId={sessaoId} versao={negociacaoVersao} />
  } else if (etapa === 'HABILITACAO') {
    // Habilitação (arts. 62–70; IN 73 art. 39) — plano E4
    painel = licitacaoId ? <HabilitacaoPanel licitacaoId={licitacaoId} /> : null
  } else if (etapa === 'RECURSOS') {
    // Recursos (art. 165) — E5; sem recurso ou decididos → adjudicação (E6)
    painel = (
      <>
        <RecursosPanel sessaoId={sessaoId} />
        {licitacaoId && <ResultadoPanel licitacaoId={licitacaoId} />}
      </>
    )
  } else if (['ADJUDICACAO', 'HOMOLOGACAO', 'ENCERRAMENTO'].includes(etapa)) {
    // Resultado (art. 71) — adjudicação e homologação (E6)
    painel = licitacaoId ? <ResultadoPanel licitacaoId={licitacaoId} /> : null
  }

  return (
    <div className="space-y-4">
      {/* Benefício ME/EPP (LC 123 arts. 44–45): com desempate em curso ou na etapa própria */}
      <BeneficioMeEppPanel sessaoId={sessaoId} sempreVisivel={etapa === 'BENEFICIO_MPE'} />
      {/* Desempate (Lei 14.133 art. 60; IN 73 art. 28): só com empate nas unidades encerradas */}
      <DesempatePanel sessaoId={sessaoId} />
      {/* Inversão de fases (art. 17 §1º): habilitação de todos antes da disputa */}
      {licitacaoId && (etapa === 'ABERTURA' || etapa === 'ANALISE_PROPOSTAS') && (
        <HabilitacaoPanel licitacaoId={licitacaoId} somentePreviaInversao />
      )}
      {painel}
      {chat}
    </div>
  )
}
