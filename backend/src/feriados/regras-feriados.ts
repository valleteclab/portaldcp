import { FeriadoMovel, RegraFeriado, criarCalendario, dataDoFeriadoMovel, isoDoDia } from '../common/prazos/calendario';

/**
 * Regras PURAS do calendário por órgão (plano E7a): que linhas da tabela
 * `feriados` valem como dia sem expediente para um órgão (art. 183, III).
 */

export interface LinhaFeriado {
  id: string;
  descricao: string;
  data: string | null;
  movel: string | null;
  recorrente: boolean;
  abrangencia: string;
  uf: string | null;
  orgao_id: string | null;
  ponto_facultativo: boolean;
  ativo: boolean;
}

/** A linha se refere ao órgão (nacional, estadual da UF dele, ou dele)? */
export function feriadoAlcancaOrgao(f: LinhaFeriado, orgaoId: string | null, ufOrgao: string | null): boolean {
  if (!f.ativo) return false;
  if (f.orgao_id) return !!orgaoId && f.orgao_id === orgaoId;
  if (f.abrangencia === 'NACIONAL') return true;
  if (f.abrangencia === 'ESTADUAL') return !!ufOrgao && !!f.uf && f.uf.toUpperCase() === ufOrgao.toUpperCase();
  return false; // municipal sem órgão: não vale para ninguém
}

/**
 * Conta como dia SEM expediente para o órgão? Feriado: sempre que alcança.
 * Ponto facultativo: só o do próprio órgão ou o que o órgão adotou.
 */
export function feriadoContaParaOrgao(
  f: LinhaFeriado,
  orgaoId: string | null,
  ufOrgao: string | null,
  adotados: ReadonlySet<string>,
): boolean {
  if (!feriadoAlcancaOrgao(f, orgaoId, ufOrgao)) return false;
  if (!f.ponto_facultativo) return true;
  if (f.orgao_id && f.orgao_id === orgaoId) return true;
  return adotados.has(f.id);
}

export function paraRegra(f: Pick<LinhaFeriado, 'descricao' | 'data' | 'movel' | 'recorrente'>): RegraFeriado {
  return { descricao: f.descricao, data: f.data, movel: f.movel, recorrente: f.recorrente };
}

/** Datas (YYYY-MM-DD) em que a linha cai no ano. */
export function datasNoAno(f: Pick<LinhaFeriado, 'data' | 'movel' | 'recorrente'>, ano: number): string[] {
  if (f.movel && (Object.values(FeriadoMovel) as string[]).includes(f.movel)) {
    return [isoDoDia(dataDoFeriadoMovel(f.movel as FeriadoMovel, ano))];
  }
  const iso = String(f.data ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return [];
  if (f.recorrente) return [`${ano}-${iso.slice(5)}`];
  return iso.startsWith(`${ano}-`) ? [iso] : [];
}

/** Validação do cadastro (órgão ou administrador). Devolve o erro ou null. */
export function motivoFeriadoInvalido(d: {
  descricao?: string | null;
  data?: string | null;
  movel?: string | null;
  recorrente?: boolean | null;
}): string | null {
  if (!d.descricao || String(d.descricao).trim().length < 3) return 'Descrição do feriado obrigatória (mínimo 3 caracteres).';
  if (d.movel) {
    if (!(Object.values(FeriadoMovel) as string[]).includes(d.movel)) {
      return `Feriado móvel inválido: ${d.movel} (use ${Object.values(FeriadoMovel).join(', ')}).`;
    }
    return null;
  }
  const iso = String(d.data ?? '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || isNaN(new Date(`${iso}T00:00:00Z`).getTime())) {
    return 'Data do feriado obrigatória (AAAA-MM-DD) — ou informe um feriado móvel.';
  }
  const dt = new Date(`${iso}T00:00:00Z`);
  if (isoDoDia(dt) !== iso) return `Data inexistente: ${iso}.`;
  return null;
}

export { criarCalendario };
