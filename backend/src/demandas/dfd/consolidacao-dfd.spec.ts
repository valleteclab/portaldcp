import {
  DemandaParaDfd,
  ajustesValidos,
  chaveDoItem,
  consolidarItens,
  marcasDosItens,
  parecidos,
  prioridadeDoDfd,
  sugestoesDoDfd,
  textoDoAlerta,
  valorTotalDosItens,
} from './consolidacao-dfd';

const item = (id: string, x: Partial<DemandaParaDfd['itens'][number]> = {}) => ({
  id,
  categoria: 'MATERIAL',
  descricao_objeto: 'Notebook 14 polegadas',
  quantidade_estimada: 1,
  unidade_medida: 'UN',
  valor_unitario_estimado: 4000,
  ...x,
});

const comunicacao: DemandaParaDfd = {
  id: 'd1',
  unidade_requisitante: 'Comunicação',
  descricao_sucinta_objeto: 'Notebooks para a equipe de vídeo',
  observacoes: 'Equipamentos atuais sem suporte.',
  data_desejada_contratacao: '2026-11-10',
  itens: [
    item('i1', { codigo_item_catalogo: 'M-451', codigo_classe: '7010', nome_classe: 'Equipamentos de informática', quantidade_estimada: 3, prioridade: 2, item_pca_id: 'pca-1' }),
    item('i2', { descricao_objeto: 'Toner HP 85A', codigo_classe: '7510', nome_classe: 'Suprimentos', quantidade_estimada: 5, valor_unitario_estimado: 100, item_pca_id: 'pca-1' }),
  ],
};
const gabinete: DemandaParaDfd = {
  id: 'd2',
  unidade_requisitante: 'Gabinete',
  descricao_sucinta_objeto: 'Notebook para o chefe de gabinete',
  data_desejada_contratacao: '2026-10-01',
  itens: [
    item('i3', { codigo_item_catalogo: 'm-451 ', codigo_classe: '7010', nome_classe: 'Equipamentos de informática', quantidade_estimada: 2, valor_unitario_estimado: 4600, prioridade: 1, item_pca_id: 'pca-1' }),
    item('i4', { descricao_objeto: 'toner  hp 85a', codigo_classe: '7510', nome_classe: 'Suprimentos', quantidade_estimada: '4', unidade_medida: 'UNIDADE', valor_unitario_estimado: 110, item_pca_id: 'pca-1' }),
  ],
};

describe('DFD consolidado — soma e agrupamento dos itens', () => {
  it('soma pelo CÓDIGO do item do catálogo (caixa e espaços não importam)', () => {
    expect(chaveDoItem(comunicacao.itens[0])).toBe(chaveDoItem(gabinete.itens[0]));
    const itens = consolidarItens([comunicacao, gabinete]);
    const nb = itens.find((i) => i.codigo_item_catalogo === 'M-451')!;
    expect(nb.quantidade_somada).toBe(5);
    expect(nb.quantidade).toBe(5);
    // média ponderada: (3×4000 + 2×4600) / 5
    expect(nb.valor_unitario_estimado).toBe(4240);
    expect(nb.valor_total_estimado).toBe(21200);
    expect(nb.origens).toEqual([
      { demanda_id: 'd1', item_demanda_id: 'i1', setor: 'Comunicação', quantidade: 3, valor_unitario: 4000 },
      { demanda_id: 'd2', item_demanda_id: 'i3', setor: 'Gabinete', quantidade: 2, valor_unitario: 4600 },
    ]);
    expect(nb.prioridade).toBe(1);
    expect(nb.item_pca_id).toBe('pca-1');
  });

  it('sem código: soma pela classe + descrição (acentos, caixa e espaços normalizados; UN = UNIDADE)', () => {
    const itens = consolidarItens([comunicacao, gabinete]);
    expect(itens).toHaveLength(2);
    const toner = itens.find((i) => i.codigo_classe === '7510')!;
    expect(toner.quantidade_somada).toBe(9);
    expect(toner.origens.map((o) => o.setor)).toEqual(['Comunicação', 'Gabinete']);
    expect(itens.map((i) => i.numero)).toEqual([1, 2]);
  });

  it('unidades diferentes ou descrições diferentes na mesma classe NÃO se somam', () => {
    const a: DemandaParaDfd = { id: 'a', unidade_requisitante: 'A', itens: [item('x', { codigo_classe: '7510', descricao_objeto: 'Toner', unidade_medida: 'CX' })] };
    const b: DemandaParaDfd = { id: 'b', unidade_requisitante: 'B', itens: [item('y', { codigo_classe: '7510', descricao_objeto: 'Toner', unidade_medida: 'UN' }), item('z', { codigo_classe: '7510', descricao_objeto: 'Cartucho' })] };
    expect(consolidarItens([a, b])).toHaveLength(3);
  });

  it('item do PCA diferente entre as origens: o item consolidado fica sem PCA', () => {
    const b = { ...gabinete, itens: [{ ...gabinete.itens[0], item_pca_id: 'pca-2' }] };
    const nb = consolidarItens([comunicacao, b]).find((i) => i.codigo_item_catalogo === 'M-451')!;
    expect(nb.item_pca_id).toBeNull();
  });

  it('ajustes do planejamento: quantidade, valor, descrição e remover — com a soma original preservada', () => {
    const base = consolidarItens([comunicacao, gabinete]);
    const nb = base.find((i) => i.codigo_item_catalogo === 'M-451')!;
    const toner = base.find((i) => i.codigo_classe === '7510')!;
    const itens = consolidarItens([comunicacao, gabinete], {
      [nb.chave]: { quantidade: 4, valor_unitario_estimado: 4100, justificativa: 'Um notebook remanejado do almoxarifado' },
      [toner.chave]: { remover: true },
    });
    expect(itens).toHaveLength(1);
    expect(itens[0]).toMatchObject({ quantidade_somada: 5, quantidade: 4, valor_unitario_estimado: 4100, valor_total_estimado: 16400, ajustado: true, justificativa_ajuste: 'Um notebook remanejado do almoxarifado', numero: 1 });
    expect(valorTotalDosItens(itens)).toBe(16400);
  });

  it('ajuste de item que saiu do DFD (demanda retirada) é descartado', () => {
    const base = consolidarItens([comunicacao]);
    const r = ajustesValidos(base, { [base[0].chave]: { quantidade: 2 }, 'COD:OUTRO|UNIDADE': { quantidade: 9 } });
    expect(Object.keys(r)).toEqual([base[0].chave]);
  });

  it('sugestões: objeto da classe comum, data mais cedo, prioridade mais alta e o item do PCA comum', () => {
    const itens = consolidarItens([comunicacao, gabinete]);
    const s = sugestoesDoDfd([comunicacao, gabinete], itens);
    expect(s.setores).toEqual(['Comunicação', 'Gabinete']);
    expect(s.objeto).toMatch(/2 demandas \(Comunicação, Gabinete\)/);
    expect(s.data_pretendida).toBe('2026-10-01');
    expect(s.prioridade).toBe('URGENTE');
    expect(s.item_pca_id).toBe('pca-1');
    expect(s.justificativa).toContain('Comunicação: Notebooks para a equipe de vídeo — Equipamentos atuais sem suporte.');
    const umaClasse = sugestoesDoDfd([{ ...comunicacao, itens: [comunicacao.itens[0]] }, { ...gabinete, itens: [gabinete.itens[0]] }], consolidarItens([{ ...comunicacao, itens: [comunicacao.itens[0]] }, { ...gabinete, itens: [gabinete.itens[0]] }]));
    expect(umaClasse.objeto).toMatch(/^Aquisição de Equipamentos de informática — consolidação das demandas de Comunicação, Gabinete/);
    expect(sugestoesDoDfd([comunicacao], consolidarItens([comunicacao])).objeto).toBe('Notebooks para a equipe de vídeo');
  });

  it('prioridade do item (1 a 5) → prioridade da peça DFD', () => {
    expect([1, 2, 3, 4, 5, null].map((p) => prioridadeDoDfd(p))).toEqual(['URGENTE', 'ALTA', 'MEDIA', 'BAIXA', 'BAIXA', null]);
  });
});

describe('DFD consolidado — alerta de parecidos (art. 12, VII; art. 75, §1º)', () => {
  const alvo = marcasDosItens(consolidarItens([comunicacao]));

  it('aponta demanda, DFD e processo do exercício com o mesmo código ou a mesma classe — atenção, com o motivo', () => {
    const r = parecidos(alvo, [
      { tipo: 'PROCESSO', id: 'p1', rotulo: '2026/00010 — Computadores', link: '/orgao/processos/p1', itens: [{ codigo: 'M-451', classe: null }] },
      { tipo: 'DEMANDA', id: 'd9', rotulo: 'Educação — toner', link: '/orgao/demandas/d9', itens: [{ codigo: null, classe: '7510' }] },
      { tipo: 'DFD', id: 'f2', rotulo: 'DFD nº 2/2026 — Cadeiras', link: '/orgao/demandas/dfd/f2', itens: [{ codigo: 'M-999', classe: '7110' }] },
    ]);
    expect(r.map((x) => [x.tipo, x.id])).toEqual([
      ['DEMANDA', 'd9'],
      ['PROCESSO', 'p1'],
    ]);
    expect(r[0].motivos).toEqual(['mesma classe (7510)']);
    expect(r[1].motivos).toEqual(['mesmo item do catálogo (M-451)']);
    expect(r[1].link).toBe('/orgao/processos/p1');
    expect(textoDoAlerta(r)).toMatch(/^Atenção \(art\. 12, VII, e art\. 75, §1º.*2 pedidos parecidos/);
  });

  it('nada parecido → lista vazia e sem texto', () => {
    expect(parecidos(alvo, [{ tipo: 'DEMANDA', id: 'x', rotulo: 'X', link: '/x', itens: [{ codigo: 'Z', classe: '9999' }] }])).toEqual([]);
    expect(textoDoAlerta([])).toBeNull();
  });
});
