/**
 * Item "quantidade por mês × meses" que NÃO é MENSAL — ex.: 20 veículos/mês
 * por 12 meses (051/2023 4ºAD, BSM). O saldo do sistema é em unidade-mês
 * (20 × 12 = 240), mas o boletim é lido por mês: a execução fiscal sai em
 * meses (1 de 12) e uma linha à parte mostra as unidades do mês (19 de 20)
 * e o que ficou sem uso no ciclo.
 */

export interface MedicaoRecorrente {
  /** Meses cobertos pelo período da medição (0 a 1 por medição). */
  meses: number;
  /** Unidades medidas nessa medição. */
  unidades: number;
}

export interface ResumoRecorrente {
  unidades_por_mes: number;
  meses_total: number;
  meses_no_periodo: number;
  meses_ate_periodo: number;
  meses_a_executar: number;
  unidades_no_periodo: number;
  unidades_ate_periodo: number;
  unidades_total: number;
  unidades_nao_utilizadas: number;
}

const arred2 = (n: number) => Math.round(n * 100) / 100;

export function ehItemRecorrenteMensal(item: {
  unidade_medida?: string | null;
  quantidade_meses?: number | string | null;
}): boolean {
  const meses = Number(item.quantidade_meses || 0);
  const unidade = String(item.unidade_medida || '').trim().toUpperCase();
  return meses > 1 && unidade !== 'MENSAL';
}

/** Dias inclusivos ÷ 30, teto 1: 01–30/09 = 1 mês; 16–30/09 = 0,5. */
export function mesesDoPeriodo(
  inicio: Date | string | null | undefined,
  fim: Date | string | null | undefined,
): number {
  const iso = (d: Date | string) =>
    d instanceof Date
      ? Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
      : Date.parse(String(d).slice(0, 10) + 'T00:00:00Z');
  if (!inicio || !fim) return 0;
  const a = iso(inicio);
  const b = iso(fim);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0;
  const dias = Math.round((b - a) / 86400000) + 1;
  return Math.min(1, arred2(dias / 30));
}

export function resumoRecorrente(
  unidadesPorMes: number,
  mesesTotal: number,
  anteriores: MedicaoRecorrente[],
  atual: MedicaoRecorrente | null,
): ResumoRecorrente {
  const soma = (l: MedicaoRecorrente[], k: keyof MedicaoRecorrente) =>
    l.reduce((s, m) => s + (Number(m[k]) || 0), 0);
  const todas = atual ? [...anteriores, atual] : anteriores;
  const mesesAte = arred2(soma(todas, 'meses'));
  const unidadesAte = arred2(soma(todas, 'unidades'));
  // O que ficou sem uso: em cada medição, (unidades/mês × meses) − medido.
  const naoUtilizadas = arred2(
    todas.reduce(
      (s, m) => s + Math.max(0, unidadesPorMes * m.meses - m.unidades),
      0,
    ),
  );
  return {
    unidades_por_mes: unidadesPorMes,
    meses_total: mesesTotal,
    meses_no_periodo: arred2(atual?.meses || 0),
    meses_ate_periodo: mesesAte,
    meses_a_executar: arred2(Math.max(0, mesesTotal - mesesAte)),
    unidades_no_periodo: arred2(atual?.unidades || 0),
    unidades_ate_periodo: unidadesAte,
    unidades_total: arred2(unidadesPorMes * mesesTotal),
    unidades_nao_utilizadas: naoUtilizadas,
  };
}

const fmtNum = (n: number) =>
  Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

function plural(n: number, um: string, varios: string) {
  return `${fmtNum(n)} ${n === 1 ? um : varios}`;
}

/** Colunas da execução fiscal: "1 mês" · "1 de 12 meses" · "11 meses". */
export function textoMesesFiscal(r: ResumoRecorrente): {
  no_periodo: string;
  ate_periodo: string;
  a_executar: string;
} {
  return {
    no_periodo: plural(r.meses_no_periodo, 'mês', 'meses'),
    ate_periodo: `${fmtNum(r.meses_ate_periodo)} de ${plural(r.meses_total, 'mês', 'meses')}`,
    a_executar: plural(r.meses_a_executar, 'mês', 'meses'),
  };
}

/** Linha sob a descrição: "19 de 20 un no mês · acumulado 19 de 240 un · 1 un não utilizada". */
export function textoLinhaUnidades(r: ResumoRecorrente, unidade?: string | null): string {
  const u = String(unidade || 'UN').trim().toUpperCase();
  const un = u === 'UN' || u === 'UNIDADE' ? 'un' : String(unidade).toLowerCase();
  const partes = [
    `${fmtNum(r.unidades_no_periodo)} de ${fmtNum(r.unidades_por_mes)} ${un} no mês`,
    `acumulado ${fmtNum(r.unidades_ate_periodo)} de ${fmtNum(r.unidades_total)} ${un}`,
  ];
  if (r.unidades_nao_utilizadas > 0) {
    partes.push(
      `${fmtNum(r.unidades_nao_utilizadas)} ${un} não utilizada${r.unidades_nao_utilizadas === 1 ? '' : 's'} no ciclo`,
    );
  }
  return partes.join(' · ');
}
