/**
 * APROVAÇÃO DA DEMANDA (decisão do dono, 08/11/2026 — opção 2): a contratação
 * pode nascer sem demanda (processo feito fora, Novo processo), mas o DFD de
 * quem abriu precisa ser aprovado antes de seguir. A etapa conclui SOZINHA
 * quando a aprovação já existe por outro caminho — o mesmo critério do motor
 * antigo (`verificarAprovacaoAutomatica`):
 *  - todas as demandas de origem (a ligada à licitação e as do DFD consolidado)
 *    aprovadas pelos setores, e o DFD consolidado aprovado quando exige;
 *  - o DFD juntado feito fora (a aprovação consta da própria peça).
 * Senão fica com o aprovador (Aprovar / Devolver / Indeferir).
 */

export const STATUS_DEMANDA_APROVADA = ['APROVADA', 'CONSOLIDADA', 'EM_CONTRATACAO', 'CONTRATADA'];

export interface EstadoDaDemanda {
  demandas: Array<{ status: string }>;
  dfdConsolidado: { numero: number | string; ano: number | string; exige_aprovacao: boolean; aprovado: boolean } | null;
  /** Origem do documento DFD vigente da licitação (INTERNO = feito no sistema). */
  origemDoDfd: string | null;
}

/** Motivo para o histórico quando a aprovação já existe; nulo = a etapa fica com o aprovador. */
export function aprovacaoJaFeita(e: EstadoDaDemanda): string | null {
  const dfd = e.dfdConsolidado;
  const dfdOk = !dfd || !dfd.exige_aprovacao || dfd.aprovado;
  if (e.demandas.length && e.demandas.every((d) => STATUS_DEMANDA_APROVADA.includes(String(d.status))) && dfdOk) {
    return dfd
      ? `Aprovada pelos setores: DFD consolidado nº ${dfd.numero}/${dfd.ano} com ${e.demandas.length} demanda(s) aprovada(s).`
      : 'Aprovada pelo setor: a contratação veio de uma demanda aprovada.';
  }
  if (e.origemDoDfd && e.origemDoDfd !== 'INTERNO') return 'DFD juntado feito fora: a aprovação consta da própria peça.';
  return null;
}
