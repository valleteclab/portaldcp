import {
  calcularPrecoAditivado,
  calcularQuantidadeAditivada,
} from './ajuste-itens.utils';

describe('cálculo dos itens de aditivo', () => {
  it('mantém quatro casas quando o preço deve refletir o percentual exato', () => {
    expect(calcularPrecoAditivado(12.5, 4.39, 'PRECISAO_4')).toBe(13.0488);
  });

  it('permite arredondar ou truncar o preço em centavos conforme o documento', () => {
    expect(calcularPrecoAditivado(12.5, 4.39, 'ARREDONDAR_2')).toBe(13.05);
    expect(calcularPrecoAditivado(12.5, 4.39, 'TRUNCAR_2')).toBe(13.04);
  });

  it('não cria fração nem ultrapassa o percentual quando esse critério é escolhido', () => {
    expect(calcularQuantidadeAditivada(35, 25, 'INTEIRO_SEM_EXCEDER')).toBe(43);
    expect(calcularQuantidadeAditivada(375, 25, 'INTEIRO_SEM_EXCEDER')).toBe(468);
  });

  it('oferece os demais critérios para itens divisíveis ou para seguir a tabela', () => {
    expect(calcularQuantidadeAditivada(35, 25, 'DECIMAL_4')).toBe(43.75);
    expect(calcularQuantidadeAditivada(35, 25, 'INTEIRO_PROXIMO')).toBe(44);
    expect(calcularQuantidadeAditivada(35, 25, 'INTEIRO_ACIMA')).toBe(44);
  });
});
