import { chavePagamento, validarRateio } from './conciliacao-pagamento.util';
import type { EmpenhoFator } from './fator-transparencia.service';

describe('Rateio de pagamentos consultados', () => {
  it('permite parcelas e rateio em múltiplas medições', () => {
    expect(validarRateio(300, 1000, 400, 800, 200)).toBeNull();
    expect(validarRateio(600, 1000, 400, 800, 200)).toBeNull();
  });
  it('impede reutilizar valor já vinculado e exceder a medição', () => {
    expect(validarRateio(600.01, 1000, 400, 2000, 0)).not.toBeNull();
    expect(validarRateio(600.01, 1000, 0, 800, 200)).not.toBeNull();
    expect(validarRateio(1, 1000, 1000, 2000, 0)).not.toBeNull();
  });
  it('estorno reduz o conciliado, sem permitir valor negativo na medição', () => {
    expect(validarRateio(-100, -200, 0, 1000, 100)).toBeNull();
    expect(validarRateio(-100.01, -200, 0, 1000, 100)).not.toBeNull();
    expect(validarRateio(-100, -200, -150, 1000, 500)).not.toBeNull();
    expect(validarRateio(100, -200, 0, 1000, 500)).not.toBeNull();
  });
  it('rejeita valores inválidos e precisão maior que centavos', () => {
    for (const valor of [0, NaN, Infinity, 0.001])
      expect(validarRateio(valor, 100, 0, 100, 0)).not.toBeNull();
    expect(validarRateio(0.1, 0.3, 0.2, 0.3, 0.2)).toBeNull();
  });
  it('chave independe do histórico e muda quando o valor contábil muda', () => {
    const p = {
      cnpj: '12.345',
      numero_empenho: '1/2026',
      numero_liquidacao: '2',
      data: '01/01/2026',
      fase_tipo: 'PAGAMENTO',
      fase: 'Pago',
      valor: 100,
    } as EmpenhoFator;
    expect(chavePagamento(p)).toBe(
      chavePagamento({ ...p, bem_servico: 'Histórico atualizado' }),
    );
    expect(chavePagamento(p)).not.toBe(chavePagamento({ ...p, valor: 90 }));
    expect(chavePagamento(p)).not.toBe(
      chavePagamento({ ...p, data: '01/01/2025' }),
    );
  });
});
