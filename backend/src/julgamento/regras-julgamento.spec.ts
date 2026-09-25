import {
  EntradaRanking,
  OfertaRanking,
  PRAZO_MINIMO_ACEITACAO_HORAS,
  SituacaoLicitante,
  StatusAceitacao,
  alertaExequibilidade,
  atualDaUnidade,
  montarRanking,
  motivoNaoAceita,
  motivoNaoEnvia,
  motivoNaoProrroga,
  motivoNaoRecusa,
  motivoPrazoInvalido,
  prazoAte,
  prazoExpirado,
  rankingAgregado,
  validarValoresReadequados,
  vencedorDaUnidade,
} from './regras-julgamento';

const t0 = new Date('2026-09-24T12:00:00Z').getTime();
const oferta = (f: string, valor: number, segundos = 0): OfertaRanking => ({
  fornecedorId: f,
  fornecedorNome: f,
  melhorValor: valor,
  registradoEm: new Date(t0 + segundos * 1000),
  totalLances: 1,
});
const ids = (r: EntradaRanking[]) => r.map((e) => e.fornecedorId);

describe('Ranking único (plano E3)', () => {
  test('menor preço: ordem crescente de valor; posições 1..n', async () => {
    const r = await montarRanking([oferta('B', 940), oferta('A', 900), oferta('D', 920)], new Map(), 'MENOR');
    expect(ids(r)).toEqual(['A', 'D', 'B']);
    expect(r.map((e) => e.posicao)).toEqual([1, 2, 3]);
    expect(r.every((e) => e.situacao === SituacaoLicitante.CLASSIFICADO)).toBe(true);
  });

  test('maior lance (leilão): ordem DECRESCENTE', async () => {
    const r = await montarRanking([oferta('A', 100), oferta('B', 130), oferta('C', 120)], new Map(), 'MAIOR');
    expect(ids(r)).toEqual(['B', 'C', 'A']);
  });

  test('recusado, inabilitado e desclassificado saem do ranking (fim, sem posição)', async () => {
    const sit = new Map([
      ['A', SituacaoLicitante.INABILITADO],
      ['D', SituacaoLicitante.RECUSADO],
      ['X', SituacaoLicitante.DESCLASSIFICADO],
    ]);
    const r = await montarRanking([oferta('A', 900), oferta('D', 920), oferta('B', 940), oferta('X', 800), oferta('C', 990)], sit, 'MENOR');
    expect(ids(r.filter((e) => !e.excluido))).toEqual(['B', 'C']);
    expect(r.filter((e) => !e.excluido).map((e) => e.posicao)).toEqual([1, 2]);
    expect(r.filter((e) => e.excluido).every((e) => e.posicao === null)).toBe(true);
    expect(atualDaUnidade(r)?.fornecedorId).toBe('B');
  });

  test('empate de valor: padrão = registrado primeiro; desempatador plugável (art. 60 / sorteio)', async () => {
    const ofertas = [oferta('A', 900, 30), oferta('B', 900, 10), oferta('C', 950)];
    const padrao = await montarRanking(ofertas, new Map(), 'MENOR');
    expect(ids(padrao)).toEqual(['B', 'A', 'C']);
    expect(padrao[0].empatado).toBe(true);
    const chamadas: string[][] = [];
    const sorteio = await montarRanking(ofertas, new Map(), 'MENOR', {
      desempatar: (grupo) => {
        chamadas.push(ids(grupo));
        return [...grupo].reverse();
      },
      unidadeId: 'u1',
    });
    expect(chamadas).toEqual([['B', 'A']]);
    expect(ids(sorteio)).toEqual(['A', 'B', 'C']);
    expect(sorteio.map((e) => e.posicao)).toEqual([1, 2, 3]);
  });

  test('"o próximo" é o melhor não excluído: recusar o 1º chama o 2º pelos lances', async () => {
    const ofertas = [oferta('A', 900), oferta('D', 920), oferta('B', 940)];
    const antes = await montarRanking(ofertas, new Map([['A', SituacaoLicitante.CONVOCADO_ACEITACAO]]), 'MENOR');
    expect(atualDaUnidade(antes)?.fornecedorId).toBe('A');
    const depois = await montarRanking(ofertas, new Map([['A', SituacaoLicitante.RECUSADO]]), 'MENOR');
    expect(atualDaUnidade(depois)?.fornecedorId).toBe('D');
    const nenhum = await montarRanking(
      ofertas,
      new Map([
        ['A', SituacaoLicitante.RECUSADO],
        ['D', SituacaoLicitante.INABILITADO],
        ['B', SituacaoLicitante.DESCLASSIFICADO],
      ]),
      'MENOR',
    );
    expect(atualDaUnidade(nenhum)).toBeNull();
  });

  test('vencedor: só com proposta aceita/habilitado; nunca excluído; legado sem registros = 1º', async () => {
    const ofertas = [oferta('A', 900), oferta('D', 920)];
    const semAceite = await montarRanking(ofertas, new Map([['A', SituacaoLicitante.CLASSIFICADO]]), 'MENOR');
    expect(vencedorDaUnidade(semAceite, true)).toBeNull();
    expect(vencedorDaUnidade(semAceite, false)?.fornecedorId).toBe('A');
    const habilitadoD = await montarRanking(
      ofertas,
      new Map([
        ['A', SituacaoLicitante.INABILITADO],
        ['D', SituacaoLicitante.HABILITADO],
      ]),
      'MENOR',
    );
    expect(vencedorDaUnidade(habilitadoD, true)?.fornecedorId).toBe('D');
  });

  test('ranking agregado por licitante: melhor posição, soma, excluídos no fim', async () => {
    const u1 = await montarRanking([oferta('A', 900), oferta('D', 920), oferta('B', 940)], new Map(), 'MENOR');
    const u2 = await montarRanking([oferta('D', 400), oferta('A', 410)], new Map([['A', SituacaoLicitante.INABILITADO]]), 'MENOR');
    const ag = rankingAgregado([{ ranking: u1 }, { ranking: u2 }]);
    // A: 1º em u1 (soma 1); D: 2º em u1 e 1º em u2 (soma 3) → A antes
    expect(ag.map((a) => a.fornecedorId)).toEqual(['A', 'D', 'B']);
    expect(ag.find((a) => a.fornecedorId === 'A')?.excluidoEmTodas).toBe(false);
  });
});

describe('Aceitação da proposta — prazos (IN 73 art. 29)', () => {
  const agora = new Date(t0);
  const base = (over: Partial<Record<string, any>> = {}) => ({
    status: StatusAceitacao.AGUARDANDO_ENVIO,
    prazo_horas: 2,
    prazo_ate: prazoAte(agora, 2),
    prorrogada_em: null,
    ...over,
  });

  test('prazo mínimo de 2 h (e o do órgão, se maior)', () => {
    expect(PRAZO_MINIMO_ACEITACAO_HORAS).toBe(2);
    expect(motivoPrazoInvalido(1.5, 2)).toMatch(/mínimo 2 hora/);
    expect(motivoPrazoInvalido(2, 2)).toBeNull();
    expect(motivoPrazoInvalido(3, 4)).toMatch(/mínimo 4 hora/);
    expect(motivoPrazoInvalido(3, 1)).toBeNull(); // parâmetro abaixo do legal não reduz o piso
    expect(motivoPrazoInvalido(1, 1)).toMatch(/mínimo 2 hora/);
    expect(motivoPrazoInvalido(undefined, 2)).toBeNull();
  });

  test('prorrogação: uma vez, antes do fim do prazo, só aguardando envio', () => {
    expect(motivoNaoProrroga(base(), agora)).toBeNull();
    expect(motivoNaoProrroga(base({ prorrogada_em: agora }), agora)).toMatch(/uma vez/);
    expect(motivoNaoProrroga(base(), new Date(t0 + 3 * 3600_000))).toMatch(/terminou/);
    expect(motivoNaoProrroga(base({ status: StatusAceitacao.ENVIADA }), agora)).toMatch(/aguardando/);
  });

  test('envio só dentro do prazo (reenvio antes da decisão permitido)', () => {
    expect(motivoNaoEnvia(base(), agora)).toBeNull();
    expect(motivoNaoEnvia(base({ status: StatusAceitacao.ENVIADA }), agora)).toBeNull();
    expect(motivoNaoEnvia(base(), new Date(t0 + 2 * 3600_000 + 1000))).toMatch(/terminou/);
    expect(motivoNaoEnvia(base({ status: StatusAceitacao.ACEITA }), agora)).toMatch(/não está aberta/);
    expect(prazoExpirado(base(), new Date(t0 + 2 * 3600_000 + 1))).toBe(true);
  });

  test('recusa: proposta enviada, ou prazo vencido sem envio', () => {
    expect(motivoNaoRecusa(base({ status: StatusAceitacao.ENVIADA }), agora)).toBeNull();
    expect(motivoNaoRecusa(base(), agora)).toMatch(/ainda está no prazo/);
    expect(motivoNaoRecusa(base(), new Date(t0 + 3 * 3600_000))).toBeNull();
    expect(motivoNaoRecusa(base({ status: StatusAceitacao.RECUSADA }), agora)).toMatch(/decidida/);
  });

  test('aceite: só enviada; com alerta de exequibilidade exige justificativa', () => {
    expect(motivoNaoAceita(base())).toMatch(/ainda não foi enviada/);
    expect(motivoNaoAceita(base({ status: StatusAceitacao.ENVIADA }))).toBeNull();
    const comAlerta = base({ status: StatusAceitacao.ENVIADA, alerta_exequibilidade: { percentualDoOrcado: 40 } });
    expect(motivoNaoAceita(comAlerta)).toMatch(/justificativa/);
    expect(motivoNaoAceita(comAlerta, 'curta')).toMatch(/justificativa/);
    expect(motivoNaoAceita(comAlerta, 'Planilha de custos demonstra a exequibilidade')).toBeNull();
  });
});

describe('Proposta adequada ao último lance — valores por item', () => {
  test('item: total = unitário × quantidade, ≤ último lance', () => {
    const itens = [{ itemId: 'i1', numero: 1, quantidade: 10, valorMaximoTotal: 900 }];
    expect(validarValoresReadequados(itens, [{ itemId: 'i1', valorUnitario: 90 }], 900)).toEqual({
      itens: [{ itemId: 'i1', numero: 1, quantidade: 10, valorUnitario: 90, valorTotal: 900 }],
      total: 900,
    });
    expect(() => validarValoresReadequados(itens, [{ itemId: 'i1', valorUnitario: 90.01 }], 900)).toThrow(/acima do limite|supera/);
    expect(validarValoresReadequados(itens, [{ itemId: 'i1', valorUnitario: '89.5' }], 900).total).toBe(895);
  });

  test('lote: cada item ≤ rateio e soma ≤ lance; todos os itens, uma vez', () => {
    const itens = [
      { itemId: 'a', numero: 1, quantidade: 10, valorMaximoTotal: 600 },
      { itemId: 'b', numero: 2, quantidade: 2, valorMaximoTotal: 400 },
    ];
    expect(validarValoresReadequados(itens, [{ itemId: 'a', valorUnitario: 60 }, { itemId: 'b', valorUnitario: 200 }], 1000).total).toBe(1000);
    // redistribuir para cima num item viola o rateio mesmo com soma menor
    expect(() => validarValoresReadequados(itens, [{ itemId: 'a', valorUnitario: 61 }, { itemId: 'b', valorUnitario: 150 }], 1000)).toThrow(
      /Item 1.*acima do limite/,
    );
    expect(() => validarValoresReadequados(itens, [{ itemId: 'a', valorUnitario: 60 }], 1000)).toThrow(/item 2/);
    expect(() =>
      validarValoresReadequados(itens, [{ itemId: 'a', valorUnitario: 60 }, { itemId: 'b', valorUnitario: 1 }, { itemId: 'z', valorUnitario: 1 }], 1000),
    ).toThrow(/não pertence/);
    expect(() => validarValoresReadequados(itens, [{ itemId: 'a', valorUnitario: 0 }, { itemId: 'b', valorUnitario: 1 }], 1000)).toThrow(/inválido/);
    expect(() => validarValoresReadequados(itens, null, 1000)).toThrow(/Informe/);
  });

  test('maior lance: soma não pode ficar abaixo do lance', () => {
    const itens = [{ itemId: 'x', numero: 1, quantidade: 1, valorMaximoTotal: null }];
    expect(() => validarValoresReadequados(itens, [{ itemId: 'x', valorUnitario: 99 }], 100, 'MAIOR')).toThrow(/inferior/);
    expect(validarValoresReadequados(itens, [{ itemId: 'x', valorUnitario: 120 }], 100, 'MAIOR').total).toBe(120);
  });
});

describe('Exequibilidade — alerta, não bloqueio', () => {
  test('obras e serviços de engenharia: abaixo de 75% do orçado (Lei 14.133 art. 59 §4º)', () => {
    expect(alertaExequibilidade({ tipoContratacao: 'OBRA', valorProposta: 740, valorOrcado: 1000 })).toMatchObject({
      limitePercentual: 75,
      percentualDoOrcado: 74,
      baseLegal: expect.stringContaining('59'),
    });
    expect(alertaExequibilidade({ tipoContratacao: 'SERVICO_ENGENHARIA', valorProposta: 750, valorOrcado: 1000 })).toBeNull();
  });

  test('bens e serviços em geral: abaixo de 50% (IN 73 art. 34)', () => {
    expect(alertaExequibilidade({ tipoContratacao: 'COMPRA', valorProposta: 499, valorOrcado: 1000 })?.limitePercentual).toBe(50);
    expect(alertaExequibilidade({ tipoContratacao: 'COMPRA', valorProposta: 900, valorOrcado: 1000 })).toBeNull();
    expect(alertaExequibilidade({ tipoContratacao: 'OBRA', valorProposta: 100, valorOrcado: 0 })).toBeNull();
  });
});
