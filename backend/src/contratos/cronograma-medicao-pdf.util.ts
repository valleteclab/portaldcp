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
    case 'SERVICO':
      return 'Serviço';
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

/**
 * q e vu com até 2 casas (ex.: 2831,40 e 6,94): produto truncado em 2 casas em reais, em centavos inteiros.
 * 283140×694 → floor(196499160/100)=1964991 centavos = 19.649,91 (não 19.649,90 por float).
 */
export function produtoQuantidadeValorUnitarioCentavos(quantidade: number, valorUnitario: number): number {
  const qC = Math.round((Number(quantidade) || 0) * 100);
  const vuC = Math.round((Number(valorUnitario) || 0) * 100);
  return Math.floor((qC * vuC) / 100);
}

export function centavosParaReaisTrunc2(centavos: number): number {
  return Number((centavos / 100).toFixed(2));
}

/**
 * Corta valor em reais em 2 casas sem arredondar.
 * Usa +1e-9 para neutralizar o ruído IEEE 754 de floats já truncados
 * (ex.: 19310.14 é armazenado como 19310.13999... → sem epsilon o floor daria 19310.13).
 */
export function truncarMoedaReais2Casas(v: number): number {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  // O epsilon fixo (1e-9) falhava para valores grandes: 1.074.855,65 × 100 =
  // 107.485.564,99999999 (erro IEEE ~1e-8 > 1e-9) → truncava p/ ...,64 e, na
  // segunda passada, ...,63 (caso BSM 051/2023 med 7). toFixed(6) elimina o
  // ruído de representação antes do floor sem afetar truncamentos reais.
  const centavos = Math.floor(Number((Math.abs(x) * 100).toFixed(6)));
  return ((x < 0 ? -1 : 1) * centavos) / 100;
}

export function valorPorFrequenciaItemCronograma(ic: Pick<ItemCronograma, 'quantidade' | 'valor_unitario' | 'valor_mensal' | 'unidade_medida'>): number {
  const vm = Number(ic.valor_mensal);
  if (Number.isFinite(vm) && vm > 0) return truncarMoedaReais2Casas(vm);
  const q = Number(ic.quantidade) || 0;
  const vu = Number(ic.valor_unitario) || 0;
  if (ic.unidade_medida === 'MENSAL') {
    return truncarMoedaReais2Casas(vu);
  }
  return centavosParaReaisTrunc2(produtoQuantidadeValorUnitarioCentavos(q, vu));
}
