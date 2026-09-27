/**
 * Copiloto (preparação automática) — regras puras.
 */

/** Minutos sem concluir a partir dos quais uma preparação EXECUTANDO é tida como interrompida. */
export const MINUTOS_PREPARACAO_TRAVADA = 30;

/** Preparação EXECUTANDO iniciada há mais de 30 min (ou sem data): interrompida. */
export function preparacaoTravada(p: { status?: string; iniciada_em?: string } | null | undefined, agora: Date): boolean {
  if (!p || p.status !== 'EXECUTANDO') return false;
  const inicio = p.iniciada_em ? Date.parse(p.iniciada_em) : NaN;
  if (!Number.isFinite(inicio)) return true;
  return agora.getTime() - inicio > MINUTOS_PREPARACAO_TRAVADA * 60_000;
}
