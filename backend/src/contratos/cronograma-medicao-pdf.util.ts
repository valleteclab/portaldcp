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
