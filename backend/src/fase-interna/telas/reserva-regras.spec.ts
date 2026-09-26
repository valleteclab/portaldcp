import { conferirParaEmitir, linhasNaEmissao, planoRenovacao, precisaRenovar, totalDasLinhas, validarLinhas } from './reserva-regras';

/** PA 139/2025: contrato de 12 meses que cruza o ano. */
const PA139 = [
  { exercicio: 2025, valor: 6021.12, situacao: 'RESERVADO' as const },
  { exercicio: 2026, valor: 55732.32, situacao: 'PREVISAO' as const },
];

describe('reserva orçamentária — linhas por exercício', () => {
  it('valida, normaliza e ordena; total = 61.753,44', () => {
    const r = validarLinhas([PA139[1], { exercicio: '2025', valor: '6021.12', situacao: 'reservado' }]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.linhas.map((l) => [l.exercicio, l.valor, l.situacao])).toEqual([
      [2025, 6021.12, 'RESERVADO'],
      [2026, 55732.32, 'PREVISAO'],
    ]);
    expect(totalDasLinhas(r.linhas)).toBe(61753.44);
  });

  it('recusa exercício repetido, valor zero, situação inválida e não-lista', () => {
    expect(validarLinhas([PA139[0], PA139[0]])).toMatchObject({ ok: false });
    expect(validarLinhas([{ exercicio: 2025, valor: 0, situacao: 'PREVISAO' }])).toMatchObject({ ok: false });
    expect(validarLinhas([{ exercicio: 2025, valor: 10, situacao: 'LIQUIDADO' }])).toMatchObject({ ok: false });
    expect(validarLinhas('x')).toMatchObject({ ok: false });
    expect(validarLinhas([{ exercicio: 1990, valor: 10 }])).toMatchObject({ ok: false });
  });

  it('na emissão: exercício corrente RESERVADO, futuro PREVISAO', () => {
    const l = linhasNaEmissao(
      [
        { exercicio: 2025, valor: 6021.12, situacao: 'PREVISAO' },
        { exercicio: 2026, valor: 55732.32, situacao: 'RESERVADO' },
      ],
      2025,
    );
    expect(l.map((x) => x.situacao)).toEqual(['RESERVADO', 'PREVISAO']);
  });

  it('conferência para emitir: dotação, LDO, declarações e exercício encerrado bloqueiam; total ≠ estimado é aviso', () => {
    const c = conferirParaEmitir({ dotacao_ok: false, lei_ldo_ok: false, linhas: [] }, { exercicio_corrente: 2025, valor_estimado: 61753.44 });
    expect(c.bloqueios.length).toBeGreaterThanOrEqual(4);
    const ok = conferirParaEmitir(
      { dotacao_ok: true, lei_ldo_ok: true, linhas: PA139, declaracao_adequacao: true, declaracao_lrf: true },
      { exercicio_corrente: 2025, valor_estimado: 61753.44 },
    );
    expect(ok).toMatchObject({ bloqueios: [], avisos: [], total: 61753.44 });
    const passado = conferirParaEmitir(
      { dotacao_ok: true, lei_ldo_ok: true, linhas: PA139, declaracao_adequacao: true, declaracao_lrf: true },
      { exercicio_corrente: 2026, valor_estimado: 70000 },
    );
    expect(passado.bloqueios.join(' ')).toMatch(/Renovar dotação/);
    expect(passado.avisos.join(' ')).toMatch(/diferente do valor estimado/);
  });
});

describe('reserva orçamentária — renovação na virada do exercício', () => {
  it('o valor do exercício encerrado passa para o novo; tudo volta a PREVISÃO; total preservado', () => {
    const r = planoRenovacao(PA139, 2026);
    expect(r).toEqual([{ exercicio: 2026, valor: 61753.44, situacao: 'PREVISAO', numero_reserva: null }]);
    expect(totalDasLinhas(r)).toBe(totalDasLinhas(PA139));
  });

  it('sem linha no novo exercício, cria; linhas futuras mantidas', () => {
    const r = planoRenovacao(
      [
        { exercicio: 2025, valor: 1000, situacao: 'RESERVADO' },
        { exercicio: 2027, valor: 500, situacao: 'PREVISAO' },
      ],
      2026,
    );
    expect(r.map((l) => [l.exercicio, l.valor, l.situacao])).toEqual([
      [2026, 1000, 'PREVISAO'],
      [2027, 500, 'PREVISAO'],
    ]);
  });

  it('precisa renovar: emitida para exercício anterior ao corrente', () => {
    expect(precisaRenovar({ status: 'EMITIDA', exercicio_base: 2025 }, 2026)).toBe(true);
    expect(precisaRenovar({ status: 'EMITIDA', exercicio_base: 2026 }, 2026)).toBe(false);
    expect(precisaRenovar({ status: 'RASCUNHO', exercicio_base: 2025 }, 2026)).toBe(false);
  });
});
