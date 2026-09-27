/**
 * TRAVAS DA LEI POR ATO (F1) — "quais regras do motor de conformidade seguram
 * cada ato, e com que severidade" em DADOS (`travas_ato_fluxo`). O "como
 * verificar" continua em código (`conformidade/regras.ts`).
 *
 * Semente = o comportamento até a F1 (`regrasDoPortao`): A (concluir a
 * pesquisa) = regras da pesquisa; B (autorizar) = pesquisa + art. 72, I, II e
 * IV; C (publicar) = todas as que não são do portão B.
 */
import { regrasDoPortao } from '../conformidade/motor';
import { REGRAS } from '../conformidade/regras';
import type { AtoProtegido, Portao, Regra, Severidade } from '../conformidade/tipos';

export const ATOS_PROTEGIDOS: AtoProtegido[] = ['CONCLUIR_PESQUISA', 'AUTORIZAR', 'PUBLICAR'];
export const PORTAO_DO_ATO: Record<AtoProtegido, Portao> = { CONCLUIR_PESQUISA: 'A', AUTORIZAR: 'B', PUBLICAR: 'C' };
export const ATO_DO_PORTAO: Record<Portao, AtoProtegido> = { A: 'CONCLUIR_PESQUISA', B: 'AUTORIZAR', C: 'PUBLICAR' };

export const ROTULO_ATO: Record<AtoProtegido, string> = {
  CONCLUIR_PESQUISA: 'Concluir a pesquisa de preços (mapa e certidão)',
  AUTORIZAR: 'Autorizar a contratação',
  PUBLICAR: 'Publicar o aviso/edital',
};

export interface TravaAto {
  ato: AtoProtegido;
  regra: string;
  severidade: Severidade;
  ativa: boolean;
  ordem: number;
}

export function travasSemente(regras: Regra[] = REGRAS): TravaAto[] {
  const r: TravaAto[] = [];
  for (const ato of ATOS_PROTEGIDOS) {
    regrasDoPortao(PORTAO_DO_ATO[ato], regras).forEach((regra) => {
      r.push({ ato, regra: regra.codigo, severidade: regra.severidade, ativa: true, ordem: regras.indexOf(regra) });
    });
  }
  return r;
}

/**
 * Regras que valem para o ato (as travas ativas), com a severidade APLICADA
 * no ato: a do dado quando difere da regra (rebaixar um bloqueio a atenção,
 * ou endurecer uma atenção); igual à da regra = comportamento de sempre.
 */
export function regrasDaTrava(travas: TravaAto[], ato: AtoProtegido, regras: Regra[] = REGRAS): Array<{ regra: Regra; severidade: Severidade }> {
  return travas
    .filter((t) => t.ato === ato && t.ativa)
    .sort((a, b) => a.ordem - b.ordem)
    .map((t) => ({ regra: regras.find((x) => x.codigo === t.regra), severidade: t.severidade }))
    .filter((x): x is { regra: Regra; severidade: Severidade } => !!x.regra);
}
