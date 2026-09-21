import { StatusMedicao } from './entities/medicao.entity';

/**
 * Decide se o acumulado ("até o período" / "a executar") de uma medição deve
 * somar as OUTRAS medições que ainda estão em análise (submetidas, em ateste,
 * aguardando aprovação) e vêm antes dela na numeração.
 *
 * - Medição APROVADA: não. O retrato dela é congelado na aprovação só com o
 *   que estava aprovado; uma pendente que depois fosse rejeitada deixaria o
 *   boletim aprovado errado.
 * - Medição ainda em análise: sim. É o caso da Ata 001/2025: a 9ª (300 pessoas)
 *   estava submetida e a 10ª (240) saía com "a executar" ignorando a 9ª, como
 *   se as 300 pessoas ainda estivessem disponíveis.
 * - Sem medição de referência (visão do contrato): sim, como já era.
 */
export function incluirEmAnaliseNoAcumulado(
  medicaoAtual: { status?: StatusMedicao | string | null } | null | undefined,
): boolean {
  if (!medicaoAtual) return true;
  return String(medicaoAtual.status || '').toUpperCase() !== StatusMedicao.APROVADA;
}
