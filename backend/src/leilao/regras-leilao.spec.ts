import {
  alertasConfiguracaoLeilao,
  escolherArrematante,
  motivoLanceInicialAbaixoDoMinimo,
  motivoTransicaoPagamentoInvalida,
  pendenciasEditalLeilao,
  pendenciasPagamento,
  validarBem,
  validarConfiguracaoLeilao,
  valorComissao,
} from './regras-leilao';

describe('Leilão — regras puras (Lei 14.133 art. 31; Decreto 11.461/2023)', () => {
  const servidor = { tipo_leiloeiro: 'SERVIDOR', servidor_nome: 'Fulana', forma_pagamento: 'A_VISTA', prazo_pagamento_dias_uteis: 1 };

  test('configuração: servidor designado ou leiloeiro oficial (art. 31 caput e §1º)', () => {
    expect(validarConfiguracaoLeilao(servidor)).toEqual([]);
    expect(validarConfiguracaoLeilao({ ...servidor, servidor_nome: '' }).join()).toMatch(/servidor designado/);
    expect(validarConfiguracaoLeilao({ tipo_leiloeiro: 'X' }).join()).toMatch(/quem conduz/);
    const oficial = { tipo_leiloeiro: 'OFICIAL', leiloeiro_nome: 'Leiloeiro', leiloeiro_matricula: 'JUCEB 1', comissao_percentual: 5, leiloeiro_forma_selecao: 'CREDENCIAMENTO', forma_pagamento: 'A_VISTA' };
    expect(validarConfiguracaoLeilao(oficial)).toEqual([]);
    expect(validarConfiguracaoLeilao({ ...oficial, leiloeiro_forma_selecao: 'INDICACAO' }).join()).toMatch(/credenciamento ou pregão/);
    expect(validarConfiguracaoLeilao({ ...oficial, leiloeiro_matricula: '' }).join()).toMatch(/Junta Comercial/);
    expect(alertasConfiguracaoLeilao({ ...oficial, comissao_percentual: 6 }).join()).toMatch(/5%/);
    expect(validarConfiguracaoLeilao({ ...servidor, forma_pagamento: 'PARCELADO' }).join()).toMatch(/parcelas/);
    expect(validarConfiguracaoLeilao({ ...servidor, prazo_pagamento_dias_uteis: 0 }).join()).toMatch(/1 a 30 dias úteis/);
  });

  test('bem: descrição, avaliação, preço mínimo, localização; imóvel exige matrícula, divisas e lei autorizativa (art. 31 §2º; art. 76 I)', () => {
    const movel = { numero_item: 1, tipo_bem: 'VEICULO', descricao: 'Caminhonete', valor_avaliacao: 50000, valor_minimo: 40000, localizacao: 'Pátio' };
    expect(validarBem(movel)).toEqual([]);
    expect(validarBem({ ...movel, localizacao: '' }).join()).toMatch(/§2º, III/);
    expect(validarBem({ ...movel, valor_minimo: 0 }).join()).toMatch(/preço mínimo/);
    expect(validarBem({ ...movel, valor_minimo: 10.123 }).join()).toMatch(/2 casas/);
    const imovel = { numero_item: 2, tipo_bem: 'IMOVEL', descricao: 'Terreno', valor_avaliacao: 1, valor_minimo: 1 };
    const e = validarBem(imovel).join();
    expect(e).toMatch(/matrícula/);
    expect(e).toMatch(/divisas/);
    expect(e).toMatch(/art. 76, I/);
  });

  test('edital: critério maior lance, alienação, configuração e bem para cada item', () => {
    const itens = [{ id: 'i1', numero_item: 1, valor_total_estimado: 40000 }];
    const bens = [{ item_licitacao_id: 'i1', numero_item: 1, tipo_bem: 'MOVEL', descricao: 'Mesa', valor_avaliacao: 100, valor_minimo: 80, localizacao: 'Depósito' }];
    expect(pendenciasEditalLeilao({ criterio: 'MAIOR_LANCE', tipoContratacao: 'ALIENACAO', config: servidor, itens, bens })).toEqual([]);
    const p = pendenciasEditalLeilao({ criterio: 'MENOR_PRECO', tipoContratacao: 'COMPRA', config: null, itens, bens: [] }).join('|');
    expect(p).toMatch(/maior lance/);
    expect(p).toMatch(/ALIENAÇÃO/);
    expect(p).toMatch(/Configure o leilão/);
    expect(p).toMatch(/Item 1: cadastre o bem/);
  });

  test('arrematante = maior lance ≥ preço mínimo; ignora inadimplentes; abaixo do mínimo → ninguém', () => {
    const ranking = [
      { fornecedorId: 'A', melhorValor: 1200 },
      { fornecedorId: 'B', melhorValor: 1100 },
      { fornecedorId: 'C', melhorValor: 900 },
    ];
    expect(escolherArrematante(ranking, 1000)?.fornecedorId).toBe('A');
    expect(escolherArrematante(ranking, 1000, ['A'])?.fornecedorId).toBe('B');
    expect(escolherArrematante(ranking, 1000, ['A', 'B'])).toBeNull();
    expect(escolherArrematante([{ fornecedorId: 'A', melhorValor: 1200, excluido: true }, ...ranking.slice(1)], 1000)?.fornecedorId).toBe('B');
  });

  test('lance inicial (proposta fechada) nunca abaixo do preço mínimo', () => {
    expect(motivoLanceInicialAbaixoDoMinimo(1, 999.99, 1000)).toMatch(/preço mínimo/);
    expect(motivoLanceInicialAbaixoDoMinimo(1, 1000, 1000)).toBeNull();
  });

  test('comissão do leiloeiro e fluxo do pagamento (art. 31 §4º)', () => {
    expect(valorComissao(1000, 5)).toBe(50);
    expect(valorComissao(1000, null)).toBeNull();
    expect(motivoTransicaoPagamentoInvalida('DECLARADA', 'PAGA')).toMatch(/não é possível/);
    expect(motivoTransicaoPagamentoInvalida('AGUARDANDO_PAGAMENTO', 'PAGAMENTO_INFORMADO')).toBeNull();
    expect(motivoTransicaoPagamentoInvalida('PAGAMENTO_INFORMADO', 'PAGA')).toBeNull();
    expect(motivoTransicaoPagamentoInvalida('PAGA', 'INADIMPLENTE')).toMatch(/não é possível/);
    const unidades = [
      { id: 'u1', rotulo: 'Item 1', comResultado: true },
      { id: 'u2', rotulo: 'Item 2', comResultado: true },
      { id: 'u3', rotulo: 'Item 3', comResultado: false },
    ];
    const p = pendenciasPagamento(unidades, [
      { unidade_id: 'u1', status: 'PAGA' },
      { unidade_id: 'u2', status: 'INADIMPLENTE' },
      { unidade_id: 'u2', status: 'AGUARDANDO_PAGAMENTO' },
    ]);
    expect(p).toEqual(['Item 2: pagamento do arrematante não confirmado (art. 31, §4º).']);
  });
});
