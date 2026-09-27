import {
  LIMITES_DISPENSA_OFICIAIS,
  RegistroConsumo,
  consumoDoLimite,
  limiteDispensa,
  percentualDoLimite,
  ramoDoItem,
} from './limites-dispensa';

describe('limiteDispensa(exercicio, inciso)', () => {
  it('valores oficiais de cada exercício, com o ato normativo', () => {
    expect(limiteDispensa(2023, 'I')).toMatchObject({ valor: 114416.65, ato_normativo: 'Dec. 11.317/2022', provisorio: false });
    expect(limiteDispensa(2023, 'II')).toMatchObject({ valor: 57208.33, ato_normativo: 'Dec. 11.317/2022' });
    expect(limiteDispensa(2024, 'I')?.valor).toBe(119812.02);
    expect(limiteDispensa(2024, 'II')?.valor).toBe(59906.02);
    expect(limiteDispensa(2025, 'I')).toMatchObject({ valor: 125451.15, ato_normativo: 'Dec. 12.343/2024' });
    expect(limiteDispensa(2025, 'II')).toMatchObject({ valor: 62725.59, ato_normativo: 'Dec. 12.343/2024' });
    expect(limiteDispensa(2026, 'I')).toMatchObject({ valor: 130984.2, ato_normativo: 'Dec. 12.807/2025' });
    expect(limiteDispensa(2026, 'II')).toMatchObject({ valor: 65492.11, ato_normativo: 'Dec. 12.807/2025' });
  });

  it('exercício sem decreto cadastrado: vale o último publicado, marcado provisório', () => {
    const r = limiteDispensa(2027, 'II');
    expect(r).toMatchObject({ exercicio: 2026, exercicio_pedido: 2027, valor: 65492.11, provisorio: true });
    expect(limiteDispensa(2020, 'I')).toBeNull();
  });

  it('usa a tabela informada (a do banco, com o exercício cadastrado pelo admin)', () => {
    const tabela = [...LIMITES_DISPENSA_OFICIAIS, { exercicio: 2027, inciso: 'II' as const, valor: 68000, ato_normativo: 'Dec. X/2026' }];
    expect(limiteDispensa(2027, 'II', tabela)).toMatchObject({ valor: 68000, provisorio: false });
    expect(limiteDispensa(2027, 'I', tabela)).toMatchObject({ exercicio: 2026, provisorio: true });
  });
});

describe('consumoDoLimite(orgao, exercicio, ramo) — art. 75, §1º', () => {
  const softwareUG1 = ramoDoItem({ codigo_catser: '27502', classe: '0859', tipo_item: 'SERVICO' }, '1');
  const reg = (p: Partial<RegistroConsumo>): RegistroConsumo => ({
    licitacao_id: 'L1',
    orgao_id: 'A',
    exercicio: 2025,
    inciso: 'II',
    ramo: softwareUG1,
    valor: 0,
    ...p,
  });

  it('ramo = classe do CATMAT/CATSER + unidade gestora', () => {
    expect(softwareUG1).toEqual({ classe: 'SERVICO:0859', unidade_gestora: '1' });
    expect(ramoDoItem({ codigo_catmat: '446820', classe: null }, null)).toEqual({ classe: 'MATERIAL:COD:446820', unidade_gestora: '' });
    expect(ramoDoItem({ tipo_item: 'SERVICO' }, '2')).toEqual({ classe: 'SERVICO:SEM_CODIGO', unidade_gestora: '2', sem_classificacao: true });
  });

  it('soma só o mesmo órgão, exercício, ramo e inciso', () => {
    const registros = [
      reg({ licitacao_id: 'L1', valor: 30000 }),
      reg({ licitacao_id: 'L1', valor: 1753.44 }), // 2º item do mesmo processo
      reg({ licitacao_id: 'L2', valor: 30000 }),
      reg({ licitacao_id: 'L3', valor: 99999, orgao_id: 'B' }), // outro órgão
      reg({ licitacao_id: 'L4', valor: 99999, exercicio: 2024 }), // outro exercício
      reg({ licitacao_id: 'L5', valor: 99999, ramo: { classe: 'SERVICO:0859', unidade_gestora: '2' } }), // outra UG
      reg({ licitacao_id: 'L6', valor: 99999, ramo: { classe: 'MATERIAL:7010', unidade_gestora: '1' } }), // outro ramo
      reg({ licitacao_id: 'L7', valor: 99999, inciso: 'I' }), // inciso I (limite próprio)
    ];
    const c = consumoDoLimite(registros, 'A', 2025, softwareUG1, 'II');
    expect(c.total).toBe(61753.44);
    expect(c.processos).toEqual([
      { licitacao_id: 'L1', valor: 31753.44 },
      { licitacao_id: 'L2', valor: 30000 },
    ]);
  });

  it('E6 (homologação multiusuário): item SEM código não soma com os sem código das outras dispensas — R$ 300 de papel não viram 119% do limite', () => {
    const papel = ramoDoItem({ tipo_item: 'MATERIAL' }, '');
    expect(papel.sem_classificacao).toBe(true);
    const registros: RegistroConsumo[] = [
      reg({ licitacao_id: 'PAPEL', ramo: papel, valor: 300 }),
      // 11 outras dispensas do exercício, também sem código (objetos diversos): R$ 77.730,00
      ...Array.from({ length: 11 }, (_, i) => reg({ licitacao_id: `OUTRA-${i}`, ramo: ramoDoItem({ tipo_item: 'MATERIAL' }, ''), valor: i === 0 ? 77730 - 10 * 7000 : 7000 })),
    ];
    // Antes: tudo num ramo "MATERIAL:SEM_CODIGO" → R$ 78.030,00 (119,1% de R$ 65.492,11)
    const c = consumoDoLimite(registros, 'A', 2025, papel, 'II', 'PAPEL');
    expect(c.total).toBe(300);
    expect(c.processos).toEqual([{ licitacao_id: 'PAPEL', valor: 300 }]);
    expect(percentualDoLimite(c.total, 65492.11)).toBe(0.4);
    // Sem o processo em análise, o ramo sem classificação não soma ninguém (não há ramo conhecido)
    expect(consumoDoLimite(registros, 'A', 2025, papel, 'II').total).toBe(0);
  });

  it('E6: item com código do catálogo continua somando no ramo (classe) — só o sem código fica isolado', () => {
    const resma = ramoDoItem({ codigo_catmat: '461872', classe: '7510', tipo_item: 'MATERIAL' }, '');
    expect(resma.sem_classificacao).toBeUndefined();
    const registros: RegistroConsumo[] = [
      reg({ licitacao_id: 'L1', ramo: resma, valor: 300 }),
      reg({ licitacao_id: 'L2', ramo: ramoDoItem({ codigo_catmat: '999', classe: '7510' }, ''), valor: 60000 }),
      reg({ licitacao_id: 'L3', ramo: ramoDoItem({ tipo_item: 'MATERIAL' }, ''), valor: 50000 }), // sem código: não entra
    ];
    expect(consumoDoLimite(registros, 'A', 2025, resma, 'II', 'L1').total).toBe(60300);
    // classe do catálogo próprio (sem CATMAT) vale como ramo
    expect(ramoDoItem({ codigo_catalogo: 'CP-10', classe: 'PAPELARIA' }, '')).toEqual({ classe: 'MATERIAL:PAPELARIA', unidade_gestora: '' });
  });

  it('percentual do limite — caso da Dispensa 029/2025 (98,4% de R$ 62.725,59)', () => {
    const limite = limiteDispensa(2025, 'II')!.valor;
    expect(percentualDoLimite(61753.44, limite)).toBe(98.4);
    expect(percentualDoLimite(100, 0)).toBe(0);
  });
});
