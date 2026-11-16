import { erroConfiguracaoFila, proximaAcaoDaFila } from './fila-disputa.regras';

const agora = new Date('2026-11-09T15:00:00Z');
describe('proximaAcaoDaFila', () => {
  it('sem aviso: abre até preencher as vagas, na ordem', () => {
    expect(proximaAcaoDaFila({ maxSimultaneos: 2, avisoMinutos: 0, emDisputa: 0, aguardando: ['a', 'b', 'c'], proxima: null, agora })).toEqual({ tipo: 'INICIAR', ids: ['a', 'b'] });
    expect(proximaAcaoDaFila({ maxSimultaneos: 2, avisoMinutos: 0, emDisputa: 1, aguardando: ['c'], proxima: null, agora })).toEqual({ tipo: 'INICIAR', ids: ['c'] });
  });
  it('sem vaga: espera', () => {
    expect(proximaAcaoDaFila({ maxSimultaneos: 2, avisoMinutos: 0, emDisputa: 2, aguardando: ['c'], proxima: null, agora })).toEqual({ tipo: 'NADA' });
  });
  it('com aviso: anuncia, espera o prazo e abre', () => {
    const a = proximaAcaoDaFila({ maxSimultaneos: 1, avisoMinutos: 2, emDisputa: 0, aguardando: ['b', 'c'], proxima: null, agora });
    expect(a).toEqual({ tipo: 'AVISAR', unidadeId: 'b', em: new Date('2026-11-09T15:02:00Z') });
    expect(proximaAcaoDaFila({ maxSimultaneos: 1, avisoMinutos: 2, emDisputa: 0, aguardando: ['b', 'c'], proxima: { unidadeId: 'b', em: new Date('2026-11-09T15:02:00Z') }, agora })).toEqual({ tipo: 'NADA' });
    expect(
      proximaAcaoDaFila({ maxSimultaneos: 1, avisoMinutos: 2, emDisputa: 0, aguardando: ['b', 'c'], proxima: { unidadeId: 'b', em: new Date('2026-11-09T15:02:00Z') }, agora: new Date('2026-11-09T15:02:01Z') }),
    ).toEqual({ tipo: 'INICIAR', ids: ['b'] });
  });
  it('anunciada já iniciada à mão: anuncia a seguinte', () => {
    expect(proximaAcaoDaFila({ maxSimultaneos: 1, avisoMinutos: 1, emDisputa: 0, aguardando: ['c'], proxima: { unidadeId: 'b', em: agora }, agora }).tipo).toBe('AVISAR');
  });
  it('fila vazia: conclui quando nada mais está em disputa', () => {
    expect(proximaAcaoDaFila({ maxSimultaneos: 1, avisoMinutos: 0, emDisputa: 1, aguardando: [], proxima: null, agora })).toEqual({ tipo: 'NADA' });
    expect(proximaAcaoDaFila({ maxSimultaneos: 1, avisoMinutos: 0, emDisputa: 0, aguardando: [], proxima: null, agora })).toEqual({ tipo: 'CONCLUIR' });
  });
});

describe('erroConfiguracaoFila', () => {
  it('limites', () => {
    expect(erroConfiguracaoFila(1, 0)).toBeNull();
    expect(erroConfiguracaoFila(20, 10)).toBeNull();
    expect(erroConfiguracaoFila(0, 0)).toMatch(/1 a 20/);
    expect(erroConfiguracaoFila(21, 0)).toMatch(/1 a 20/);
    expect(erroConfiguracaoFila(2, 11)).toMatch(/0 a 10/);
  });
});
