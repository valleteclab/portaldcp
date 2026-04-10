/**
 * Quantidade física total contratada e rótulos para PDF / execução fiscal.
 * Alinha m² (ou outras unidades) × N execuções ao cronograma físico-financeiro.
 */

import { ItemCronograma } from './entities/item-cronograma.entity';

const FREQUENCIA_LABELS: Record<string, string> = {
  UNICA: 'Única',
  MENSAL: 'Mensal',
  BIMESTRAL: 'Bimestral',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
};

/** Metragem (ou qtd) acumulável no contrato = por execução × N (exceto MENSAL). */
export function quantidadeFisicaTotalContratada(ic: Pick<ItemCronograma, 'quantidade' | 'quantidade_meses' | 'unidade_medida'>): number {
  const q = Number(ic.quantidade) || 0;
  if ((ic.unidade_medida || '') === 'MENSAL') {
    return q;
  }
  const n =
    ic.quantidade_meses != null && Number(ic.quantidade_meses) > 0
      ? Number(ic.quantidade_meses)
      : 1;
  return q * n;
}

export function textoUnidadeCronogramaPdf(unidade: string | undefined | null): string {
  switch (unidade || '') {
    case 'METROS':
      return 'Serviço (preço por m²)';
    case 'LITROS':
      return 'Serviço (preço por litro)';
    case 'MENSAL':
      return 'Mensal (R$/mês)';
    case 'HORA':
      return 'Hora';
    case 'UNIDADE':
      return 'Unidade';
    default:
      return unidade || '—';
  }
}

export function textoFrequenciaCronogramaPdf(codigo: string | null | undefined): string {
  if (!codigo) return '—';
  return FREQUENCIA_LABELS[codigo] || codigo;
}

export function valorPorFrequenciaItemCronograma(ic: Pick<ItemCronograma, 'quantidade' | 'valor_unitario' | 'valor_mensal' | 'unidade_medida'>): number {
  const vm = Number(ic.valor_mensal);
  if (Number.isFinite(vm) && vm > 0) return vm;
  const q = Number(ic.quantidade) || 0;
  const vu = Number(ic.valor_unitario) || 0;
  if (ic.unidade_medida === 'MENSAL') {
    return vu;
  }
  return q * vu;
}

/**
 * Corta valor em reais em 2 casas decimais (sem arredondar).
 * Ex.: 15318,489 → 15318,48. Evita float (Math.trunc(n*100) pode errar o centavo).
 */
export function truncarMoedaReais2Casas(v: number): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  const neg = x < 0;
  const s = Math.abs(x).toFixed(14);
  const dot = s.indexOf('.');
  const intPart = dot < 0 ? s : s.slice(0, dot);
  const fracRaw = dot < 0 ? '' : s.slice(dot + 1);
  const frac2 = (fracRaw + '00').slice(0, 2);
  const n = Number(`${intPart}.${frac2}`);
  return neg ? -n : n;
}
