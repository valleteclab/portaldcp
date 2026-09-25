import { ResultadoService } from './resultado.service';

/**
 * Plano da adjudicação (E6): o ResultadoService lê o vencedor do RANKING
 * ÚNICO e os valores da proposta adequada ACEITA — nunca o lance cru.
 */
describe('ResultadoService.planoAdjudicacao', () => {
  const unidadeItem = {
    tipo: 'ITEM' as const,
    id: 'item-1',
    licitacaoId: 'lic',
    numero: 1,
    descricao: 'Cadeira',
    encerrada: true,
    baseLance: 'TOTAL_ITEM' as any,
    itens: [{ id: 'item-1', numero: 1, descricao: 'Cadeira', quantidade: 10, unidadeMedida: 'UNIDADE', valorUnitarioEstimado: 100, valorTotalEstimado: 1000, status: 'ATIVO' }],
  };
  const unidadeLote = {
    tipo: 'LOTE' as const,
    id: 'lote-1',
    licitacaoId: 'lic',
    numero: 1,
    descricao: 'Lote 1',
    encerrada: true,
    baseLance: 'TOTAL_LOTE' as any,
    itens: [
      { id: 'a', numero: 1, descricao: 'A', quantidade: 10, unidadeMedida: null, valorUnitarioEstimado: 50, valorTotalEstimado: 500, status: 'ATIVO' },
      { id: 'b', numero: 2, descricao: 'B', quantidade: 20, unidadeMedida: null, valorUnitarioEstimado: 25, valorTotalEstimado: 500, status: 'ATIVO' },
    ],
  };
  const deserta = { ...unidadeItem, id: 'item-2', numero: 2, itens: [{ ...unidadeItem.itens[0], id: 'item-2', numero: 2, status: 'DESERTO' }] };

  function servico(opts: { unidades: any[]; vencedor: Record<string, any>; aceitas: Record<string, any> }) {
    const ranking = {
      unidades: jest.fn().mockResolvedValue(opts.unidades),
      vencedor: jest.fn(async (u: any) => opts.vencedor[u.id] ?? null),
    };
    const m = {
      query: jest.fn(async (_sql: string, params: any[]) => {
        const a = opts.aceitas[`${params[0]}|${params[1]}`];
        return a ? [a] : [];
      }),
    };
    const s = new ResultadoService({ manager: m } as any, {} as any, ranking as any, {} as any, {} as any, {} as any, {} as any);
    return { s, m };
  }

  test('lance 900 → proposta readequada 890: adjudica 890 ao HABILITADO', async () => {
    const { s, m } = servico({
      unidades: [unidadeItem, deserta],
      vencedor: { 'item-1': { fornecedorId: 'D', situacao: 'HABILITADO', melhorValor: 900 } },
      aceitas: { 'item-1|D': { id: 'ac1', valores_itens: [{ itemId: 'item-1', valorUnitario: 89, valorTotal: 890 }] } },
    });
    const plano = await s.planoAdjudicacao('lic', m as any);
    expect(plano.pendencias).toEqual([]);
    expect(plano.unidades).toEqual([
      {
        tipo: 'ITEM',
        unidadeId: 'item-1',
        numero: 1,
        fornecedorId: 'D',
        aceitacaoId: 'ac1',
        valores: [{ itemId: 'item-1', numero: 1, quantidade: 10, valorUnitario: 89, valorTotal: 890 }],
      },
    ]);
  });

  test('vencedor só ACEITO (sem habilitação) → pendência, nada a adjudicar', async () => {
    const { s, m } = servico({
      unidades: [unidadeItem],
      vencedor: { 'item-1': { fornecedorId: 'A', situacao: 'ACEITO' } },
      aceitas: { 'item-1|A': { id: 'x', valores_itens: [{ itemId: 'item-1', valorUnitario: 90, valorTotal: 900 }] } },
    });
    const plano = await s.planoAdjudicacao('lic', m as any);
    expect(plano.unidades).toEqual([]);
    expect(plano.pendencias[0]).toMatch(/Item 1: .*só se adjudica ao HABILITADO/);
  });

  test('habilitado sem proposta adequada aceita → pendência', async () => {
    const { s, m } = servico({
      unidades: [unidadeItem],
      vencedor: { 'item-1': { fornecedorId: 'D', situacao: 'HABILITADO' } },
      aceitas: {},
    });
    const plano = await s.planoAdjudicacao('lic', m as any);
    expect(plano.pendencias[0]).toMatch(/proposta adequada aceita do vencedor não encontrada/);
  });

  test('lote: valores por item dentro do lote vêm da proposta aceita (soma = total aceito)', async () => {
    const { s, m } = servico({
      unidades: [unidadeLote],
      vencedor: { 'lote-1': { fornecedorId: 'V', situacao: 'VENCEDOR' } },
      aceitas: {
        'lote-1|V': {
          id: 'acL',
          valores_itens: [
            { itemId: 'a', valorUnitario: 45, valorTotal: 450 },
            { itemId: 'b', valorUnitario: 22.5, valorTotal: 450 },
          ],
        },
      },
    });
    const plano = await s.planoAdjudicacao('lic', m as any);
    expect(plano.pendencias).toEqual([]);
    expect(plano.unidades[0].valores.map((v) => [v.itemId, v.valorTotal])).toEqual([
      ['a', 450],
      ['b', 450],
    ]);
    expect(plano.unidades[0].valores.reduce((t, v) => t + v.valorTotal, 0)).toBe(900);
  });
});
