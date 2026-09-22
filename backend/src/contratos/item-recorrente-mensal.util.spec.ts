import {
  ehItemRecorrenteMensal,
  mesesDoPeriodo,
  resumoRecorrente,
  textoLinhaUnidades,
  textoMesesFiscal,
} from './item-recorrente-mensal.util';

describe('item recorrente mensal (quantidade × meses)', () => {
  it('reconhece 20 un × 12 meses e ignora MENSAL e quantidade simples', () => {
    expect(ehItemRecorrenteMensal({ unidade_medida: 'UNIDADE', quantidade_meses: 12 })).toBe(true);
    expect(ehItemRecorrenteMensal({ unidade_medida: 'MENSAL', quantidade_meses: 12 })).toBe(false);
    expect(ehItemRecorrenteMensal({ unidade_medida: 'UNIDADE', quantidade_meses: 1 })).toBe(false);
    expect(ehItemRecorrenteMensal({ unidade_medida: 'PESSOA', quantidade_meses: null })).toBe(false);
  });

  it('meses do período: mês cheio vale 1, meio mês vale 0,5, teto em 1', () => {
    expect(mesesDoPeriodo('2026-09-01', '2026-09-30')).toBe(1);
    expect(mesesDoPeriodo('2026-08-31', '2026-09-29')).toBe(1);
    expect(mesesDoPeriodo('2026-09-16', '2026-09-30')).toBe(0.5);
    expect(mesesDoPeriodo('2026-10-01', '2026-10-31')).toBe(1);
    expect(mesesDoPeriodo(null, '2026-09-30')).toBe(0);
    expect(mesesDoPeriodo('2026-09-30', '2026-09-01')).toBe(0);
  });

  it('9ª medição do 051/2023: 19 de 20 veículos no 1º de 12 meses', () => {
    const r = resumoRecorrente(20, 12, [], { meses: 1, unidades: 19 });
    expect(r).toMatchObject({
      meses_no_periodo: 1,
      meses_ate_periodo: 1,
      meses_a_executar: 11,
      unidades_no_periodo: 19,
      unidades_ate_periodo: 19,
      unidades_total: 240,
      unidades_nao_utilizadas: 1,
    });
    expect(textoMesesFiscal(r)).toEqual({
      no_periodo: '1 mês',
      ate_periodo: '1 de 12 meses',
      a_executar: '11 meses',
    });
    expect(textoLinhaUnidades(r, 'UNIDADE')).toBe(
      '19 de 20 un no mês · acumulado 19 de 240 un · 1 un não utilizada no ciclo',
    );
  });

  it('acumula meses e unidades não utilizadas ao longo do ciclo', () => {
    const r = resumoRecorrente(
      20,
      12,
      [{ meses: 1, unidades: 19 }, { meses: 1, unidades: 18 }],
      { meses: 1, unidades: 20 },
    );
    expect(r.meses_ate_periodo).toBe(3);
    expect(r.meses_a_executar).toBe(9);
    expect(r.unidades_ate_periodo).toBe(57);
    expect(r.unidades_nao_utilizadas).toBe(3);
    expect(textoLinhaUnidades(r, 'UNIDADE')).toContain('3 un não utilizadas');
  });

  it('sem medição atual (visão do contrato) só acumula as anteriores', () => {
    const r = resumoRecorrente(20, 12, [{ meses: 1, unidades: 19 }], null);
    expect(r.meses_no_periodo).toBe(0);
    expect(r.unidades_no_periodo).toBe(0);
    expect(r.meses_ate_periodo).toBe(1);
  });

  it('meses não passam do total e medição acima da cota não vira negativo', () => {
    const r = resumoRecorrente(20, 2, [{ meses: 1, unidades: 20 }, { meses: 1, unidades: 20 }], { meses: 1, unidades: 21 });
    expect(r.meses_a_executar).toBe(0);
    expect(r.unidades_nao_utilizadas).toBe(0);
  });
});
