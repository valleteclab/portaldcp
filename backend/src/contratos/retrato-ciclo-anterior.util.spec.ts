import { retratoDeCicloAnteriorCongelado } from './retrato-ciclo-anterior.util';

describe('retrato de medição de ciclo anterior (050/2023 BRFIBRA)', () => {
  const corte = '2026-08-11';

  it('medição do ciclo antigo com retrato fica congelada', () => {
    expect(retratoDeCicloAnteriorCongelado('2026-03-01', corte, true)).toBe(true);
    // agosto começa antes do corte: também é do ciclo anterior para o recálculo
    expect(retratoDeCicloAnteriorCongelado('2026-08-01', corte, true)).toBe(true);
  });

  it('medição do ciclo novo segue recalculando', () => {
    expect(retratoDeCicloAnteriorCongelado('2026-09-01', corte, true)).toBe(false);
    expect(retratoDeCicloAnteriorCongelado('2026-08-11', corte, true)).toBe(false);
  });

  it('sem retrato ainda, grava normalmente (primeira vez)', () => {
    expect(retratoDeCicloAnteriorCongelado('2026-07-01', corte, false)).toBe(false);
  });

  it('contrato sem renovação de ciclo: nada muda', () => {
    expect(retratoDeCicloAnteriorCongelado('2026-03-01', null, true)).toBe(false);
    expect(retratoDeCicloAnteriorCongelado(null, corte, true)).toBe(false);
  });

  it('aceita Date (dia UTC) e texto com hora', () => {
    expect(retratoDeCicloAnteriorCongelado(new Date('2026-07-01T00:00:00Z'), new Date('2026-08-11T00:00:00Z'), true)).toBe(true);
    expect(retratoDeCicloAnteriorCongelado('2026-09-01T03:00:00.000Z', corte, true)).toBe(false);
  });
});
