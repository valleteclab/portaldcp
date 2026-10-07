import { ehDiaUtil, mesmaData, proximoDiaUtil } from './dias-uteis';

describe('dias úteis', () => {
  it('considera sábado e domingo não úteis', () => {
    expect(ehDiaUtil(new Date('2026-10-10T12:00:00'))).toBe(false); // sábado
    expect(ehDiaUtil(new Date('2026-10-11T12:00:00'))).toBe(false); // domingo
    expect(ehDiaUtil(new Date('2026-10-09T12:00:00'))).toBe(true); // sexta
  });

  it('pula o fim de semana ao calcular o próximo dia útil', () => {
    const sexta = new Date(2026, 9, 9); // 09/10/2026, sexta
    const proximo = proximoDiaUtil(sexta);
    expect(proximo.getDay()).toBe(1); // segunda
    expect(proximo.getDate()).toBe(12);
  });

  it('em dia de semana normal, o próximo dia útil é o dia seguinte', () => {
    const terca = new Date(2026, 9, 6);
    const proximo = proximoDiaUtil(terca);
    expect(proximo.getDay()).toBe(3);
    expect(proximo.getDate()).toBe(7);
  });

  it('mesmaData ignora a hora', () => {
    expect(mesmaData(new Date('2026-10-09T23:59:00'), new Date('2026-10-09T00:01:00'))).toBe(true);
    expect(mesmaData(new Date('2026-10-09T00:00:00'), new Date('2026-10-10T00:00:00'))).toBe(false);
  });
});
