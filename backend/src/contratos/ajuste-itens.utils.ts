export type ArredondamentoPrecoAditivo =
  | 'PRECISAO_4'
  | 'ARREDONDAR_2'
  | 'TRUNCAR_2';

export type ArredondamentoQuantidadeAditivo =
  | 'DECIMAL_4'
  | 'INTEIRO_SEM_EXCEDER'
  | 'INTEIRO_PROXIMO'
  | 'INTEIRO_ACIMA';

function arredondar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return Math.round((valor + Number.EPSILON) * fator) / fator;
}

function truncar(valor: number, casas: number): number {
  const fator = 10 ** casas;
  return (valor >= 0 ? Math.floor(valor * fator) : Math.ceil(valor * fator)) / fator;
}

export function calcularPrecoAditivado(
  valorAtual: number,
  percentual: number,
  criterio: ArredondamentoPrecoAditivo = 'PRECISAO_4',
): number {
  const calculado = valorAtual * (1 + percentual / 100);
  if (criterio === 'ARREDONDAR_2') return arredondar(calculado, 2);
  if (criterio === 'TRUNCAR_2') return truncar(calculado, 2);
  return arredondar(calculado, 4);
}

export function calcularQuantidadeAditivada(
  quantidadeAtual: number,
  percentual: number,
  criterio: ArredondamentoQuantidadeAditivo = 'DECIMAL_4',
): number {
  const calculada = quantidadeAtual * (1 + percentual / 100);
  if (criterio === 'INTEIRO_PROXIMO') return Math.round(calculada);
  if (criterio === 'INTEIRO_ACIMA') return Math.ceil(calculada);
  if (criterio === 'INTEIRO_SEM_EXCEDER') {
    return percentual >= 0 ? Math.floor(calculada) : Math.ceil(calculada);
  }
  return arredondar(calculada, 4);
}
