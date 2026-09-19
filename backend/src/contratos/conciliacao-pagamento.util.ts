import { createHash } from 'crypto';
import type { EmpenhoFator } from './fator-transparencia.service';

export const centavos = (valor: number) => Math.round(Number(valor) * 100);

// Sem índice da lista: a chave se mantém quando a ordem da consulta muda.
// Alteração de valor gera pendência de revisão, nunca transfere vínculo silenciosamente.
export function chavePagamento(p: EmpenhoFator): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        (p.cnpj || '').replace(/\D/g, ''),
        p.numero_empenho,
        p.numero_liquidacao,
        p.data,
        p.fase_tipo,
        p.fase,
        centavos(p.valor),
      ]),
    )
    .digest('hex');
}

export function validarRateio(
  valor: number,
  pagamento: number,
  jaVinculado: number,
  medido: number,
  pagoMedicao: number,
): string | null {
  if (
    !Number.isFinite(valor) ||
    centavos(valor) === 0 ||
    Math.abs(valor * 100 - centavos(valor)) > 0.00001
  )
    return 'Informe um valor não nulo com até duas casas decimais.';
  const v = centavos(valor),
    p = centavos(pagamento),
    usado = centavos(jaVinculado);
  if (
    Math.sign(v) !== Math.sign(p) ||
    Math.sign(v) !== Math.sign(p - usado) ||
    Math.abs(v) > Math.abs(p - usado)
  )
    return 'O valor excede o disponível deste pagamento/estorno.';
  const total = centavos(pagoMedicao) + v;
  if (total < 0 || total > centavos(medido))
    return 'O vínculo deixaria o total conciliado da medição negativo ou acima do valor medido. Confira retenções e divergências.';
  return null;
}
