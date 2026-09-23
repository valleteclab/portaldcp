import {
  cotaDaMedicao,
  ehItemRecorrenteMensal,
  mesesDoPeriodo,
  resumoRecorrente,
  textoColunasFiscal,
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
      unidades_a_executar: 220, // 11 meses × 20 — o veículo de setembro não volta
    });
    expect(textoMesesFiscal(r)).toEqual({
      no_periodo: '1 mês',
      ate_periodo: '1 de 12 meses',
      a_executar: '11 meses',
    });
    expect(textoLinhaUnidades(r, 'UNIDADE')).toBe(
      '19 de 20 un no mês · acumulado 19 de 240 un · 1 un não utilizada no ciclo',
    );
    // cada coluna: meses em cima, unidades embaixo
    expect(textoColunasFiscal(r, 'UNIDADE')).toEqual({
      no_periodo: '1 mês\n19 de 20 un',
      ate_periodo: '1 de 12 meses\n19 de 240 un',
      a_executar: '11 meses\n220 un (1 não utilizada)',
    });
  });

  it('o não utilizado sai do a executar em valor: 1 veículo = R$ 5.142,85', () => {
    const r = resumoRecorrente(20, 12, [], { meses: 1, unidades: 19 });
    const vu = 5142.85;
    const previsto = 20 * 12 * vu; // 1.234.284,00
    const atePeriodo = 19 * vu; // 97.714,15
    const naoUtilizado = r.unidades_nao_utilizadas * vu; // 5.142,85
    expect(+(previsto - atePeriodo - naoUtilizado).toFixed(2)).toBe(1131427.0);
    expect(+(r.unidades_a_executar * vu).toFixed(2)).toBe(1131427.0);
  });

  it('cota do período: 20 por mês cheio, 10 por meio mês, e nada além disso', () => {
    expect(cotaDaMedicao(20, 1)).toBe(20);
    expect(cotaDaMedicao(20, 0.5)).toBe(10);
    expect(cotaDaMedicao(20, 0)).toBe(0);
    // em outubro, 21 veículos (para "recuperar" setembro) estoura a cota de 20
    expect(21 > cotaDaMedicao(20, 1) + 0.0001).toBe(true);
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
