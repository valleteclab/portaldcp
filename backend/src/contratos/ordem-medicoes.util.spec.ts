import { chaveCompetencia, renumerarPorCompetencia } from './ordem-medicoes.util';

describe('ordem-medicoes.util', () => {
  it('chave vem do período de início', () => {
    expect(chaveCompetencia({ id: 'a', numero_medicao: 1, periodo_inicio: '2026-05-01' })).toBe('202605');
    expect(chaveCompetencia({ id: 'a', numero_medicao: 1, periodo_inicio: new Date('2026-08-01T00:00:00Z') })).toBe('202608');
  });

  it('sem período, usa a competência escrita', () => {
    expect(chaveCompetencia({ id: 'a', numero_medicao: 1, competencia: 'AGOSTO/2026' })).toBe('202608');
    expect(chaveCompetencia({ id: 'a', numero_medicao: 1, competencia: 'março/2026' })).toBe('202603');
    expect(chaveCompetencia({ id: 'a', numero_medicao: 1, competencia: '06/2026' })).toBe('202606');
  });

  it('caso real do contrato 001/2026: a 1ª medição vira a última', () => {
    const novas = renumerarPorCompetencia([
      { id: 'set', numero_medicao: 1, periodo_inicio: '2026-09-01' },
      { id: 'ago', numero_medicao: 2, periodo_inicio: '2026-08-01' },
      { id: 'jun', numero_medicao: 3, periodo_inicio: '2026-06-01' },
      { id: 'mai', numero_medicao: 4, periodo_inicio: '2026-05-01' },
    ]);
    expect(novas).toEqual([
      { id: 'mai', numero_atual: 4, numero_novo: 1 },
      { id: 'jun', numero_atual: 3, numero_novo: 2 },
      { id: 'ago', numero_atual: 2, numero_novo: 3 },
      { id: 'set', numero_atual: 1, numero_novo: 4 },
    ]);
  });

  it('já em ordem: nada a mudar', () => {
    const novas = renumerarPorCompetencia([
      { id: 'a', numero_medicao: 1, periodo_inicio: '2026-05-01' },
      { id: 'b', numero_medicao: 2, periodo_inicio: '2026-06-01' },
    ]);
    expect(novas).toEqual([]);
  });

  it('mesma competência mantém a ordem dos números atuais', () => {
    const novas = renumerarPorCompetencia([
      { id: 'b', numero_medicao: 3, periodo_inicio: '2026-05-01' },
      { id: 'a', numero_medicao: 2, periodo_inicio: '2026-05-01' },
    ]);
    expect(novas).toEqual([
      { id: 'a', numero_atual: 2, numero_novo: 1 },
      { id: 'b', numero_atual: 3, numero_novo: 2 },
    ]);
  });

  it('sem período nem competência, cai para a data de criação e depois para o fim da fila', () => {
    expect(chaveCompetencia({ id: 'a', numero_medicao: 1, created_at: '2026-07-15T10:00:00Z' })).toBe('202607');
    expect(chaveCompetencia({ id: 'a', numero_medicao: 1 })).toBe('999999');
  });
});
