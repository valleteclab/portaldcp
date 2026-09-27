import {
  alertasDaCotacao,
  cotacaoValida,
  estatisticaDePrecos,
  parametrosDaPesquisa,
  pendenciasDaPesquisa,
  propostasDiretas,
  regraDosTresPrecos,
  resumoDaPesquisa,
  somarMeses,
  validarParametro,
  valorPeloMetodo,
} from './pesquisa-regras';
import type { ItemPesquisaPrecos } from '../types/pesquisa-precos.type';

/** Caso real: PA 139/2025 — 3 cotações diretas (DMNEWS, Legado, EiTV). */
const item = (numero: number, quantidade: number, valores: Array<[string, number, string, string?, string?]>): ItemPesquisaPrecos => ({
  item_numero: numero,
  descricao: `Item ${numero}`,
  quantidade,
  unidade: 'UN',
  metodologia: 'MEDIANA',
  valor_referencial: 0,
  cotacoes: valores.map(([fornecedor, valor, grupo, emissao, validade]) => ({
    fonte: 'FORNECEDOR_DIRETO',
    descricao_fonte: fornecedor,
    fornecedor_razao_social: fornecedor,
    fornecedor_cnpj: '13.772.522/0001-53',
    valor_unitario: valor,
    data_pesquisa: emissao ?? '2025-11-20',
    grupo_id: grupo,
    data_emissao: emissao ?? '2025-11-20',
    validade_ate: validade,
  })) as any,
});

describe('pesquisa de preços — estatística e método', () => {
  it('menor, média e mediana (par e ímpar), ignorando zeros e inválidos', () => {
    expect(estatisticaDePrecos([61753.44, 62400, 67300])).toEqual({ quantidade: 3, menor: 61753.44, maior: 67300, media: 63817.8133, mediana: 62400 });
    expect(estatisticaDePrecos([10, 20, 30, 40])).toMatchObject({ mediana: 25, media: 25, menor: 10 });
    expect(estatisticaDePrecos([0, -1, null, 'x', 5])).toMatchObject({ quantidade: 1, menor: 5, mediana: 5 });
    expect(estatisticaDePrecos([])).toMatchObject({ quantidade: 0, menor: null, media: null, mediana: null });
  });

  it('valor pelo método adotado', () => {
    const e = estatisticaDePrecos([61753.44, 62400, 67300]);
    expect(valorPeloMetodo(e, 'MENOR')).toBe(61753.44);
    expect(valorPeloMetodo(e, 'MEDIANA')).toBe(62400);
    expect(valorPeloMetodo(e, 'MEDIA')).toBeCloseTo(63817.81, 2);
  });

  it('regra dos 3 preços: 3 atende; 2 só com justificativa', () => {
    expect(regraDosTresPrecos(3).atende).toBe(true);
    expect(regraDosTresPrecos(2).atende).toBe(false);
    expect(regraDosTresPrecos(2, 'curta').atende).toBe(false);
    expect(regraDosTresPrecos(2, 'Mercado restrito: só dois fornecedores atendem a região.').atende).toBe(true);
  });

  it('resumo: totais por método (Σ quantidade × valor) e total adotado', () => {
    const itens = [
      item(1, 1, [['DMNEWS', 7500, 'g1'], ['Legado', 8000, 'g2'], ['EiTV', 8500, 'g3']]),
      item(2, 12, [['DMNEWS', 4521.12, 'g1'], ['Legado', 4533.33, 'g2'], ['EiTV', 4900, 'g3']]),
    ];
    const r = resumoDaPesquisa(itens, 'MENOR', { hoje: '2025-12-10' });
    expect(r.totais.MENOR).toBeCloseTo(7500 + 12 * 4521.12, 2); // 61.753,44
    expect(r.totais.MEDIANA).toBeCloseTo(8000 + 12 * 4533.33, 2);
    expect(r.total_adotado).toBe(r.totais.MENOR);
    expect(r.tres_precos.atende).toBe(true);
    expect(r.itens[1].valor_unitario_adotado).toBe(4521.12);
  });

  it('cotação vencida ou com mais de 6 meses não conta como preço válido', () => {
    const itens = [item(1, 1, [['A', 100, 'g1', '2025-01-02'], ['B', 110, 'g2', '2025-11-01'], ['C', 120, 'g3', '2025-11-02', '2025-11-30']])];
    const r = resumoDaPesquisa(itens, 'MEDIANA', { hoje: '2025-12-10' });
    expect(r.itens[0].estatistica.quantidade).toBe(1); // A (>6 meses) e C (vencida) saem
    expect(r.tres_precos.atende).toBe(false);
  });

  it('pendências: método e justificativas obrigatórias; escolha dos fornecedores só com cotação direta', () => {
    const itens = [item(1, 1, [['A', 100, 'g1'], ['B', 110, 'g2'], ['C', 120, 'g3']])];
    const r = resumoDaPesquisa(itens, null, { hoje: '2025-12-10' });
    const p = pendenciasDaPesquisa(r, { tem_cotacao_direta: true });
    expect(p.bloqueios.join(' ')).toMatch(/método/);
    expect(p.bloqueios.join(' ')).toMatch(/escolha dos fornecedores/);
    const ok = pendenciasDaPesquisa(resumoDaPesquisa(itens, 'MENOR', { hoje: '2025-12-10' }), {
      tem_cotacao_direta: true,
      justificativa_metodo: 'Menor valor conforme art. 5º da Portaria 089/2024.',
      justificativa_fornecedores: 'Empresas do ramo com atuação comprovada no segmento de broadcast.',
    });
    expect(ok.bloqueios).toEqual([]);
    expect(pendenciasDaPesquisa(resumoDaPesquisa(itens, 'MENOR', { hoje: '2025-12-10' }), { tem_cotacao_direta: false, justificativa_metodo: 'Menor valor conforme regulamento.' }).bloqueios).toEqual([]);
  });
});

describe('pesquisa de preços — validade e idade da cotação', () => {
  it('soma meses ajustando o fim do mês', () => {
    expect(somarMeses('2025-08-31', 6)).toBe('2026-02-28');
    expect(somarMeses('2025-06-10', 6)).toBe('2025-12-10');
  });

  it('vence antes da publicação prevista (PRECO-02) — caso Legado: vence 20/12, publicação em janeiro', () => {
    const a = alertasDaCotacao({ data_emissao: '2025-11-20', validade_ate: '2025-12-20' }, { hoje: '2025-12-10', publicacao_prevista: '2026-01-13' });
    expect(a.map((x) => x.codigo)).toEqual(['VENCE_ANTES_DA_PUBLICACAO']);
    expect(cotacaoValida(a)).toBe(true); // ainda vale hoje: alerta, não descarte
  });

  it('vencida hoje', () => {
    const a = alertasDaCotacao({ data_emissao: '2025-11-20', validade_ate: '2025-12-01' }, { hoje: '2025-12-10' });
    expect(a.map((x) => x.codigo)).toContain('VENCIDA');
    expect(cotacaoValida(a)).toBe(false);
  });

  it('emitida há mais de 6 meses da publicação prevista (PRECO-03)', () => {
    const a = alertasDaCotacao({ data_emissao: '2025-06-01' }, { hoje: '2025-12-01', publicacao_prevista: '2026-01-13' });
    expect(a.map((x) => x.codigo)).toEqual(['EMITIDA_HA_MAIS_DE_6_MESES']);
    // exatamente 6 meses: ainda vale
    expect(alertasDaCotacao({ data_emissao: '2025-06-10' }, { hoje: '2025-12-10' })).toEqual([]);
  });

  it('sem data de emissão gera aviso', () => {
    expect(alertasDaCotacao({}, { hoje: '2025-12-10' }).map((x) => x.codigo)).toEqual(['SEM_DATA_DE_EMISSAO']);
  });
});

describe('pesquisa de preços — parâmetros do art. 23, §1º e propostas', () => {
  it('"consultado sem retorno" registrado vale; sem registro e sem cotação fica pendente; cotação direta atende o IV', () => {
    const itens = [item(1, 1, [['A', 100, 'g1'], ['B', 110, 'g2'], ['C', 120, 'g3']])];
    const ps = parametrosDaPesquisa(
      [
        { inciso: 'I', situacao: 'SEM_RETORNO', data_consulta: '2025-12-10', resultado: '0 resultados equivalentes' },
        { inciso: 'II', situacao: 'SEM_RETORNO', data_consulta: '2025-12-10', resultado: null },
      ],
      itens,
    );
    expect(ps.map((p) => [p.inciso, p.situacao_tela])).toEqual([
      ['I', 'SEM_RETORNO'],
      ['II', 'SEM_RETORNO'],
      ['III', 'PENDENTE'],
      ['IV', 'ATENDIDO'],
      ['V', 'PENDENTE'],
    ]);
    expect(ps[0].evidencia_resumo).toBe('Consultado 10/12/2025 · sem retorno — 0 resultados equivalentes');
    expect(ps[3].evidencia_resumo).toMatch(/3 propostas/);
    expect(ps[2].evidencia_resumo).toBe('Não consultado');
  });

  it('3 fornecedores com 2 itens = 3 propostas (não 6 — homologação 26/09/2026)', () => {
    const itens = [item(1, 12, [['A', 100, 'g1'], ['B', 110, 'g2'], ['C', 120, 'g3']]), item(2, 1, [['A', 1000, 'g1'], ['B', 900, 'g2'], ['C', 950, 'g3']])];
    const iv = parametrosDaPesquisa([], itens).find((p) => p.inciso === 'IV')!;
    expect(iv.evidencia_resumo).toMatch(/· 3 propostas/);
    expect(iv.cotacoes).toBe(6); // preços por item continuam contados como preços
    // sem o grupo da tela: conta pelo CNPJ/fornecedor
    const semGrupo = itens.map((i) => ({ ...i, cotacoes: i.cotacoes.map((c: any, n: number) => ({ ...c, grupo_id: undefined, fornecedor_cnpj: `0000000000000${n}` })) }));
    expect(parametrosDaPesquisa([], semGrupo as any).find((p) => p.inciso === 'IV')!.evidencia_resumo).toMatch(/· 3 propostas/);
  });

  it('validação do registro manual', () => {
    expect(validarParametro({ inciso: 'I', situacao: 'SEM_RETORNO', data_consulta: '2025-12-10' }, '2025-12-10')).toBeNull();
    expect(validarParametro({ inciso: 'I', situacao: 'SEM_RETORNO' }, '2025-12-10')).toMatch(/data/);
    expect(validarParametro({ inciso: 'I', situacao: 'CONSULTADO', data_consulta: '2025-12-11' }, '2025-12-10')).toMatch(/futura/);
    expect(validarParametro({ inciso: 'VI' as any, situacao: 'CONSULTADO' }, '2025-12-10')).toMatch(/Inciso/);
    expect(validarParametro({ inciso: 'III', situacao: 'NAO_CONSULTADO' }, '2025-12-10')).toBeNull();
  });

  it('propostas diretas agrupadas por proposta, com total, validade e ordenadas pelo menor', () => {
    const itens = [
      item(1, 1, [['DMNEWS', 7500, 'g1'], ['EiTV', 8500, 'g3']]),
      item(2, 12, [['DMNEWS', 4521.12, 'g1'], ['EiTV', 4900, 'g3']]),
    ];
    const ps = propostasDiretas(itens, { hoje: '2025-12-10' });
    expect(ps.map((p) => [p.fornecedor, p.total])).toEqual([
      ['DMNEWS', 61753.44],
      ['EiTV', 67300],
    ]);
    expect(ps[0].itens).toHaveLength(2);
  });
});
