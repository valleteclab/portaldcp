import { elegibilidadeNoLote, ratearLanceLote, totalPropostaLote } from './rateio-lote';

const soma = (xs: number[]) => Math.round(xs.reduce((s, v) => s + v, 0) * 100) / 100;

describe('rateio do lance do lote (E2 item 5)', () => {
  const itens = [
    { itemId: 'a', numero: 1, quantidade: 10, valorTotalProposta: 1000 },
    { itemId: 'b', numero: 2, quantidade: 3, valorTotalProposta: 500 },
    { itemId: 'c', numero: 3, quantidade: 7, valorTotalProposta: 250 },
  ];

  test('proporcional à proposta do licitante; soma exatamente o lance', () => {
    const r = ratearLanceLote(itens, 1575); // fator 0,9
    expect(r.map((p) => p.valor_total)).toEqual([900, 450, 225]);
    expect(r.map((p) => p.valor_unitario)).toEqual([90, 150, 32.1429]);
    expect(soma(r.map((p) => p.valor_total))).toBe(1575);
  });

  test('arredondamento ao centavo com o RESÍDUO no último item', () => {
    const tres = [
      { itemId: 'a', numero: 1, quantidade: 1, valorTotalProposta: 100 },
      { itemId: 'b', numero: 2, quantidade: 1, valorTotalProposta: 100 },
      { itemId: 'c', numero: 3, quantidade: 1, valorTotalProposta: 100 },
    ];
    const r = ratearLanceLote(tres, 100); // 33,333… cada
    expect(r.map((p) => p.valor_total)).toEqual([33.33, 33.33, 33.34]);
    expect(soma(r.map((p) => p.valor_total))).toBe(100);
  });

  test('meio centavo arredonda para cima (exceto o último, que fecha a conta)', () => {
    const dois = [
      { itemId: 'a', numero: 1, quantidade: 1, valorTotalProposta: 1 },
      { itemId: 'b', numero: 2, quantidade: 1, valorTotalProposta: 1 },
    ];
    const r = ratearLanceLote(dois, 0.03); // 0,015 → 0,02 e resíduo 0,01
    expect(r.map((p) => p.valor_total)).toEqual([0.02, 0.01]);
  });

  test('ordem do rateio é a do número do item (independe da ordem de entrada)', () => {
    const r = ratearLanceLote([...itens].reverse(), 1575.01);
    expect(r.map((p) => p.numero)).toEqual([1, 2, 3]);
    expect(soma(r.map((p) => p.valor_total))).toBe(1575.01);
    // 900,0057 → 900,01; 450,0029 → 450,00; o último fecha a conta
    expect(r.map((p) => p.valor_total)).toEqual([900.01, 450, 225]);
  });

  test('soma exata em muitos valores quebrados (propriedade)', () => {
    let semente = 7;
    const aleat = () => ((semente = (semente * 9301 + 49297) % 233280) / 233280);
    for (let k = 0; k < 200; k++) {
      const n = 2 + Math.floor(aleat() * 6);
      const xs = Array.from({ length: n }, (_, i) => ({
        itemId: `i${i}`,
        numero: i + 1,
        quantidade: 1 + Math.floor(aleat() * 50),
        valorTotalProposta: Math.round((1 + aleat() * 100000) * 100) / 100,
      }));
      const total = totalPropostaLote(xs);
      const lance = Math.round(total * (0.5 + aleat() * 0.49) * 100) / 100;
      const r = ratearLanceLote(xs, lance);
      expect(soma(r.map((p) => p.valor_total))).toBe(lance);
      for (const p of r) expect(p.valor_total).toBeGreaterThan(0);
    }
  });

  test('valores grandes (bilhões) sem perda de precisão', () => {
    const r = ratearLanceLote(
      [
        { itemId: 'a', numero: 1, quantidade: 1, valorTotalProposta: 1_234_567_890.12 },
        { itemId: 'b', numero: 2, quantidade: 1, valorTotalProposta: 987_654_321.98 },
      ],
      2_000_000_000.01,
    );
    expect(soma(r.map((p) => p.valor_total))).toBe(2_000_000_000.01);
  });

  test('proposta sem valor ou lance inválido → erro', () => {
    expect(() => ratearLanceLote([{ itemId: 'a', numero: 1, quantidade: 1, valorTotalProposta: 0 }], 10)).toThrow();
    expect(() => ratearLanceLote(itens, 0)).toThrow();
    expect(() => ratearLanceLote([], 10)).toThrow();
  });
});

describe('elegibilidade no lote: cotou TODOS os itens', () => {
  const lote = [
    { id: 'a', numero: 1, quantidade: 10 },
    { id: 'b', numero: 2, quantidade: 2 },
  ];

  test('cotou todos → elegível; total = soma dos totais (unitário × quantidade quando falta o total)', () => {
    const e = elegibilidadeNoLote(lote, [
      { itemId: 'a', valor_unitario: 9.5, valor_total: 95 },
      { itemId: 'b', valor_unitario: 12.345, valor_total: null },
    ]);
    expect(e.elegivel).toBe(true);
    expect(e.totalProposta).toBe(119.69); // 95 + 24,69
    expect(e.itensNaoCotados).toEqual([]);
  });

  test('faltou um item → inelegível, com os números faltantes', () => {
    const e = elegibilidadeNoLote(lote, [{ itemId: 'a', valor_unitario: 9.5, valor_total: 95 }]);
    expect(e.elegivel).toBe(false);
    expect(e.itensNaoCotados).toEqual([2]);
    expect(e.totalProposta).toBe(0);
  });

  test('item cotado com zero conta como não cotado; lote vazio não é elegível', () => {
    expect(elegibilidadeNoLote(lote, [
      { itemId: 'a', valor_unitario: 1, valor_total: 10 },
      { itemId: 'b', valor_unitario: 0, valor_total: 0 },
    ]).itensNaoCotados).toEqual([2]);
    expect(elegibilidadeNoLote([], []).elegivel).toBe(false);
  });
});
