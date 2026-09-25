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

/**
 * Formalização (decisão do usuário 25/09/2026 — art. 71 IV): o OPERADOR
 * (pregoeiro/agente) registra; a AUTORIDADE escolhida pratica o ato. O ato
 * guarda os dois; no modo ASSINATURA_ELETRONICA nada muda até a assinatura.
 */
describe('ResultadoService.homologar — operador × autoridade', () => {
  const autoridade = {
    id: 'aut-1',
    nome: 'Maria Prefeita',
    cargo: 'Prefeita Municipal',
    cpf: null,
    email: 'prefeita@x.gov.br',
    ato_delegacao_numero: null,
    ato_delegacao_data: null,
  };
  const pregoeiro = { tipo: 'USUARIO', id: 'u-1', usuarioId: 'u-1', orgaoId: 'org-1', fornecedorId: null, admin: false, role: 'PREGOEIRO' } as any;

  function montar(modo: string) {
    const lic: any = { id: 'lic-1', orgao_id: 'org-1', numero_processo: 'P-1', fase: 'ADJUDICACAO', selecao_externa: true, demanda_id: null };
    const inseridas: any[] = [];
    const repo = (nome: string) => ({
      findOne: jest.fn(async () => (nome === 'Licitacao' ? lic : (inseridas[inseridas.length - 1] ?? null))),
      insert: jest.fn(async (x: any) => inseridas.push(x)),
    });
    const m: any = {
      query: jest.fn(async (sql: string) => {
        if (/FROM itens_licitacao WHERE licitacao_id/.test(sql) && /SELECT/.test(sql)) {
          return [{ id: 'i1', status: 'ADJUDICADO', fornecedor_vencedor_id: 'F', valor_total_homologado: 890 }];
        }
        if (/UPDATE itens_licitacao/.test(sql)) return [[], 1];
        return [];
      }),
      getRepository: (e: any) => repo(e?.name ?? String(e)),
    };
    const ds: any = { manager: m, query: m.query, getRepository: m.getRepository, transaction: async (cb: any) => cb(m) };
    const transicoes = {
      executar: jest.fn(async (_id: string, _ato: string, opts: any) => {
        await opts.aplicar(lic, m);
        return { ...lic, fase: 'HOMOLOGACAO' };
      }),
      verificar: jest.fn(async () => undefined),
    };
    const formalizacao = {
      modoDoOrgao: jest.fn(async () => modo),
      autoridadeDoAto: jest.fn(async () => autoridade),
      nomeOperador: jest.fn(async () => 'Pedro Pregoeiro (agente de contratação/pregoeiro)'),
      dadosDoTermo: jest.fn(async () => ({})),
      gerarPdf: jest.fn(() => ({ buffer: Buffer.from('pdf'), ultimaPagina: 1 })),
      gravarTermo: jest.fn(async () => 'resultados/lic-1/termo.pdf'),
      criarDocumentoAssinatura: jest.fn(async () => ({ id: 'doc-1' })),
    };
    const contratos = { gerarContratoAutomatico: jest.fn(async () => []) };
    const s = new ResultadoService(ds, transicoes as any, {} as any, contratos as any, {} as any, {} as any, formalizacao as any);
    return { s, lic, transicoes, formalizacao, inseridas };
  }

  test('REGISTRO_DIRETO: o pregoeiro registra, o ato é da autoridade (transição, licitação e formalização)', async () => {
    const { s, lic, transicoes, inseridas } = montar('REGISTRO_DIRETO');
    const r: any = await s.homologar('lic-1', pregoeiro, { autoridadeId: 'aut-1' });
    expect(r).toMatchObject({ pendente_assinatura: false, valorHomologado: 890, autoridade: { nome: 'Maria Prefeita', cargo: 'Prefeita Municipal' } });
    const [, ato, opts] = transicoes.executar.mock.calls[0];
    expect(ato).toBe('HOMOLOGAR');
    expect(opts.ator).toEqual({ tipo: 'USUARIO', id: 'u-1' }); // quem registrou
    expect(opts.registro).toMatchObject({
      autoridade: { id: 'aut-1', nome: 'Maria Prefeita' },
      operador: { tipo: 'USUARIO', id: 'u-1', nome: expect.stringMatching(/Pedro Pregoeiro/) },
      modo: 'REGISTRO_DIRETO',
    });
    expect(lic.homologacao_autoridade_nome).toBe('Maria Prefeita');
    expect(inseridas).toEqual([
      expect.objectContaining({
        tipo: 'HOMOLOGACAO',
        status: 'EFETIVADO',
        autoridade_nome: 'Maria Prefeita',
        operador_tipo: 'USUARIO',
        operador_id: 'u-1',
        operador_nome: expect.stringMatching(/Pedro Pregoeiro/),
        valor_total: 890,
      }),
    ]);
  });

  test('ASSINATURA_ELETRONICA: só verifica e cria o pedido PENDENTE com o termo no assinador — sem transição', async () => {
    const { s, transicoes, formalizacao, inseridas } = montar('ASSINATURA_ELETRONICA');
    const r: any = await s.homologar('lic-1', pregoeiro, {});
    expect(r).toMatchObject({ pendente_assinatura: true, valorHomologado: null, valorAHomologar: 890 });
    expect(transicoes.verificar).toHaveBeenCalled();
    expect(transicoes.executar).not.toHaveBeenCalled();
    expect(inseridas).toEqual([expect.objectContaining({ status: 'PENDENTE_ASSINATURA', autoridade_email: 'prefeita@x.gov.br', operador_id: 'u-1' })]);
    expect(formalizacao.criarDocumentoAssinatura).toHaveBeenCalled();
  });

  test('equipe de apoio não registra (403); TERMO_EXTERNO sem arquivo → 400', async () => {
    const { s } = montar('REGISTRO_DIRETO');
    await expect(s.homologar('lic-1', { ...pregoeiro, role: 'EQUIPE_APOIO' })).rejects.toMatchObject({ status: 403 });
    const t = montar('TERMO_EXTERNO');
    await expect(t.s.homologar('lic-1', pregoeiro, {})).rejects.toMatchObject({ status: 400 });
    expect(t.transicoes.executar).not.toHaveBeenCalled();
  });
});
