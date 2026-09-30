import { truncarMoedaReais2Casas } from './cronograma-medicao-pdf.util';

describe('truncarMoedaReais2Casas', () => {
  it('neutraliza ruído de ponto flutuante em saldos monetários', () => {
    const saldo = 744869.94 - 315593.61;

    expect(saldo).toBe(429276.32999999996);
    expect(truncarMoedaReais2Casas(saldo)).toBe(429276.33);
  });

  it('mantém o truncamento de frações reais além dos centavos', () => {
    expect(truncarMoedaReais2Casas(1.239)).toBe(1.23);
  });
});
