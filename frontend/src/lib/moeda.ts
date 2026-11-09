/**
 * Valores em reais nos campos de digitação (lances, propostas, desempate).
 * Máscara de moeda: os dígitos entram pelos centavos, como nos aplicativos de
 * banco — "5340000" vira "R$ 53.400,00" (pedido do dono, 09/11/2026: o lance
 * era digitado como número solto, "69600").
 */
const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export function mascararMoeda(texto: string): string {
  const digitos = String(texto ?? '').replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 15)
  if (!digitos) return ''
  return BRL.format(Number(digitos) / 100)
}

/** Número no formato da máscara ("R$ 1.234,56" → 1234.56). */
export function moedaDeNumero(valor: number | null | undefined): string {
  return valor === null || valor === undefined || !Number.isFinite(valor) ? '' : BRL.format(valor)
}

/**
 * Valor digitado → número. Com vírgula: formato brasileiro ("R$ 1.234,56");
 * sem vírgula: ponto decimal ("1234.56"). Nunca remove o ponto de "1234.56".
 */
export function lerValorMonetario(texto: string): number {
  const t = String(texto ?? '').trim().replace(/[R$\s ]/g, '')
  if (!t) return NaN
  return t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
}
