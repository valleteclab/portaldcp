import { itensMedidosDaEtapa, resumoContrato, situacaoEtapas, valorAPagar } from './boletim-obra-v2.util';

const contratadas = [
  { numero: 2, descricao: 'Mobilização', valor_previsto: 22446 },
  { numero: 1, descricao: 'Logística', valor_previsto: 571861.25 },
  { numero: 4, descricao: 'Reforços', valor_previsto: 164504.34 },
  { numero: 14, descricao: 'MO RSD', valor_previsto: 21375 },
];
const medidas = [
  {
    numero: 4, percentual_executado_anterior: 60.98, percentual_executado_atual: 39.02, percentual_executado_acumulado: 100,
    valor_acumulado_anterior: 100309.52, valor_medido: 64194.82, valor_ate_periodo: 164504.34, valor_a_executar: 0,
  },
  {
    numero: 14, percentual_executado_anterior: 0, percentual_executado_atual: 50, percentual_executado_acumulado: 50,
    valor_acumulado_anterior: 0, valor_medido: 10687.5, valor_ate_periodo: 10687.5, valor_a_executar: 10687.5,
  },
];

describe('boletim-obra-v2.util', () => {
  const anteriores = new Map([[1, { percentual: 100, valor: 571861.25 }]]);
  const linhas = situacaoEtapas(contratadas, medidas, anteriores);

  it('uma linha por etapa, em ordem, medidas marcadas', () => {
    expect(linhas.map((l) => l.numero)).toEqual([1, 2, 4, 14]);
    expect(linhas.map((l) => l.medida_no_periodo)).toEqual([false, false, true, true]);
  });

  it('etapa fora do período usa o acumulado anterior; sem medição fica zerada', () => {
    expect(linhas[0].valor_acumulado).toBe(571861.25);
    expect(linhas[0].valor_saldo).toBe(0);
    expect(linhas[1].pct_acumulado).toBe(0);
    expect(linhas[1].valor_saldo).toBe(22446);
  });

  it('etapa medida usa os números do boletim oficial', () => {
    expect(linhas[2].valor_periodo).toBe(64194.82);
    expect(linhas[2].valor_anterior).toBe(100309.52);
    expect(linhas[3].valor_saldo).toBe(10687.5);
  });

  it('anterior nunca passa do previsto da etapa', () => {
    const l = situacaoEtapas([{ numero: 9, descricao: 'x', valor_previsto: 100 }], [], new Map([[9, { percentual: 130, valor: 130 }]]));
    expect(l[0].valor_acumulado).toBe(100);
    expect(l[0].pct_acumulado).toBe(100);
  });

  it('resumo fecha: anterior + período = acumulado; saldo = contrato − acumulado', () => {
    const r = resumoContrato(linhas, 780186.59);
    expect(r.valor_periodo).toBe(74882.32);
    expect(r.valor_anterior).toBe(672170.77);
    expect(r.valor_acumulado).toBe(747053.09);
    expect(r.valor_saldo).toBe(33133.5);
    expect(r.pct_acumulado).toBe(95.75);
  });

  it('resumo sem valor do contrato usa a soma das etapas', () => {
    expect(resumoContrato(linhas, null).valor_contrato).toBe(780186.59);
  });

  it('itens da etapa: quantidades pelo percentual e valor fecha com o medido', () => {
    const itens = itensMedidosDaEtapa(medidas[0], [
      { descricao: 'Perfil U', unidade: 'M', quantidade: 890, valor_unitario: 106.25, valor_total: 94562.5 },
      { descricao: 'Soldador', unidade: 'H', quantidade: 360, valor_unitario: 49.62, valor_total: 17865 },
      { descricao: 'Resto', unidade: 'UN', quantidade: 1, valor_unitario: 52076.84, valor_total: 52076.84 },
    ]);
    expect(itens[0].qtd_periodo).toBe(347.28);
    expect(itens[0].qtd_anterior).toBe(542.72);
    expect(itens[0].qtd_saldo).toBe(0);
    const soma = Math.round(itens.reduce((s, i) => s + i.valor_periodo, 0) * 100) / 100;
    expect(soma).toBe(64194.82);
  });

  it('etapa sem itens devolve lista vazia', () => {
    expect(itensMedidosDaEtapa(medidas[1], [])).toEqual([]);
  });

  it('valor a pagar: tributos descontados, "SERVIÇOS" não conta como desconto', () => {
    const v = valorAPagar(246941.88, [
      { descricao: 'ISS', valor: 12347.09, percentual: 5 },
      { descricao: 'IRRF', valor: 2963.3, percentual: 1.2 },
      { descricao: 'INSS', valor: 19001.18, percentual: 7.69 },
      { descricao: 'SERVIÇOS', valor: 212630.31, percentual: 86.11 },
    ]);
    expect(v.descontos.map((d) => d.descricao)).toEqual(['ISS', 'IRRF', 'INSS']);
    expect(v.liquido).toBe(212630.31);
  });
});
