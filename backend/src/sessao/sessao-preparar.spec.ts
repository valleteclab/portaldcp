import { dataHoraBrasilia, numeroComAno } from './sessao.service';

/** Pregão 2026/00070 (09/11/2026): a sala mostrava "PR 001/2026/2026" e a data crua do JavaScript. */
describe('preparação da sessão — textos', () => {
  it('número do edital com o ano uma vez só', () => {
    expect(numeroComAno('001/2026', '2026-11-08T12:00:00Z')).toBe('001/2026');
    expect(numeroComAno('7', '2026-11-08T12:00:00Z')).toBe('7/2026');
    expect(numeroComAno(null, '2026-11-08T12:00:00Z')).toBe('s/n/2026');
  });
  it('data no relógio de Brasília', () => {
    expect(dataHoraBrasilia('2026-11-09T03:29:00Z')).toBe('09/11/2026, 00:29');
    expect(dataHoraBrasilia(null)).toBe('—');
    expect(dataHoraBrasilia('x')).toBe('—');
  });
});
