/**
 * SITUAÇÃO da licitação (E1) — separada da FASE.
 *
 * `fase` = onde o processo está (publicado, disputa, homologação...);
 * `situacao` = como ele está: ATIVA, SUSPENSA ou encerrada por um ato
 * (REVOGADA, ANULADA, DESERTA, FRACASSADA, CONCLUIDA). Suspender/revogar não
 * mudam mais a fase — as telas mostram a fase E, quando não for ATIVA, o selo
 * da situação.
 *
 * Linhas antigas (antes da migração) podem trazer a situação dentro da fase
 * (fase = 'SUSPENSO', 'REVOGADO'...): `situacaoDaLicitacao` cobre os dois casos.
 */
export type SituacaoLicitacao =
  | 'ATIVA'
  | 'SUSPENSA'
  | 'REVOGADA'
  | 'ANULADA'
  | 'DESERTA'
  | 'FRACASSADA'
  | 'CONCLUIDA'

export const SITUACOES_TERMINAIS: SituacaoLicitacao[] = ['REVOGADA', 'ANULADA', 'DESERTA', 'FRACASSADA', 'CONCLUIDA']

const DE_FASE_LEGADA: Record<string, SituacaoLicitacao> = {
  SUSPENSO: 'SUSPENSA',
  REVOGADO: 'REVOGADA',
  ANULADO: 'ANULADA',
  DESERTO: 'DESERTA',
  FRACASSADO: 'FRACASSADA',
  CONCLUIDO: 'CONCLUIDA',
}

export const ROTULO_SITUACAO: Record<SituacaoLicitacao, string> = {
  ATIVA: 'Ativa',
  SUSPENSA: 'Suspensa',
  REVOGADA: 'Revogada',
  ANULADA: 'Anulada',
  DESERTA: 'Deserta',
  FRACASSADA: 'Fracassada',
  CONCLUIDA: 'Concluída',
}

export const COR_SITUACAO: Record<SituacaoLicitacao, string> = {
  ATIVA: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-100',
  SUSPENSA: 'bg-amber-100 text-amber-800 hover:bg-amber-100',
  REVOGADA: 'bg-gray-200 text-gray-800 hover:bg-gray-200',
  ANULADA: 'bg-gray-200 text-gray-800 hover:bg-gray-200',
  DESERTA: 'bg-slate-200 text-slate-800 hover:bg-slate-200',
  FRACASSADA: 'bg-red-100 text-red-800 hover:bg-red-100',
  CONCLUIDA: 'bg-green-100 text-green-800 hover:bg-green-100',
}

export function situacaoDaLicitacao(lic: { situacao?: string | null; fase?: string | null } | null | undefined): SituacaoLicitacao {
  if (!lic) return 'ATIVA'
  if (lic.situacao && lic.situacao in ROTULO_SITUACAO) return lic.situacao as SituacaoLicitacao
  return (lic.fase && DE_FASE_LEGADA[lic.fase]) || 'ATIVA'
}

export function licitacaoEncerrada(lic: { situacao?: string | null; fase?: string | null } | null | undefined): boolean {
  return SITUACOES_TERMINAIS.includes(situacaoDaLicitacao(lic))
}

export function licitacaoSuspensa(lic: { situacao?: string | null; fase?: string | null } | null | undefined): boolean {
  return situacaoDaLicitacao(lic) === 'SUSPENSA'
}
