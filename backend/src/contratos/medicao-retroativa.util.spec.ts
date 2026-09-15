import {
  avisoPeriodoForaDoCiclo,
  calcularItensMedicaoRetroativa,
  normalizarDataPura,
  sugerirPeriodoDaOrdem,
  validarMotivoRetroativo,
  validarOsMedicaoRetroativa,
  type ItemCronogramaRetroativo,
} from './medicao-retroativa.util';

const CONTRATO = 'contrato-ata-001-2025';
const OUTRO_CONTRATO = 'contrato-013-2025';
const ORDEM_SERVICO = 'ORDEM_SERVICO';

// Caso real: Ata 001/2025, OS-0116/2026 — 240 unidades do item 01 a R$ 47,00
// (NF 14, R$ 11.280,00 pagos na contabilidade sem medição no sistema).
const ITEM_01: ItemCronogramaRetroativo & {
  valor_unitario: number;
  quantidade: number;
} = {
  id: 'item-01',
  descricao: 'Item 01 — coffee break',
  quantidade: 3300,
  valor_unitario: 47,
  valor_total: 155100,
};

const ITEM_02: ItemCronogramaRetroativo & {
  valor_unitario: number;
  quantidade: number;
} = {
  id: 'item-02',
  descricao: 'Item 02 — kit lanche',
  quantidade: 1000,
  valor_unitario: 12.5,
  valor_total: 12500,
};

const CRONOGRAMA = new Map<string, any>([
  [ITEM_01.id, ITEM_01],
  [ITEM_02.id, ITEM_02],
]);

const buscarItem = (id: string) => CRONOGRAMA.get(id) ?? null;
/** Espelha `calcularValorItemCronogramaMedicao` no caso simples (qtd × vu). */
const calcularValor = (item: any, quantidade: number) =>
  Math.round(quantidade * Number(item.valor_unitario) * 100) / 100;

describe('lançamento retroativo de medição — cálculo do valor', () => {
  it('soma quantidade × valor unitário dos itens informados', () => {
    const calculado = calcularItensMedicaoRetroativa(
      [{ item_cronograma_id: ITEM_01.id, quantidade_medida: 240 }],
      buscarItem,
      calcularValor,
    );
    expect(calculado.valor_medido).toBe(11280);
    expect(calculado.itens.length).toBe(1);
    expect(calculado.itens[0].quantidade_medida).toBe(240);
    expect(calculado.itens[0].valor_medido).toBe(11280);
  });

  it('acumula mais de um item na mesma medição', () => {
    const calculado = calcularItensMedicaoRetroativa(
      [
        { item_cronograma_id: ITEM_01.id, quantidade_medida: 240 },
        { item_cronograma_id: ITEM_02.id, quantidade_medida: 100 },
      ],
      buscarItem,
      calcularValor,
    );
    expect(calculado.valor_medido).toBe(12530);
    expect(calculado.itens.length).toBe(2);
  });

  it('ignora linha com quantidade zero, mas exige ao menos uma com quantidade', () => {
    const calculado = calcularItensMedicaoRetroativa(
      [
        { item_cronograma_id: ITEM_01.id, quantidade_medida: 240 },
        { item_cronograma_id: ITEM_02.id, quantidade_medida: 0 },
      ],
      buscarItem,
      calcularValor,
    );
    expect(calculado.itens.length).toBe(1);
    expect(calculado.valor_medido).toBe(11280);

    expect(() =>
      calcularItensMedicaoRetroativa(
        [{ item_cronograma_id: ITEM_01.id, quantidade_medida: 0 }],
        buscarItem,
        calcularValor,
      ),
    ).toThrow(/quantidade maior que zero/);
  });

  it('recusa item que não é do cronograma do contrato', () => {
    expect(() =>
      calcularItensMedicaoRetroativa(
        [{ item_cronograma_id: 'item-de-outro-contrato', quantidade_medida: 10 }],
        buscarItem,
        calcularValor,
      ),
    ).toThrow(/não encontrado neste contrato/);
  });

  it('recusa payload sem itens', () => {
    expect(() =>
      calcularItensMedicaoRetroativa([], buscarItem, calcularValor),
    ).toThrow(/pelo menos um item/);
  });

  it('percentual físico é proporcional ao valor total do item', () => {
    const calculado = calcularItensMedicaoRetroativa(
      [{ item_cronograma_id: ITEM_01.id, quantidade_medida: 240 }],
      buscarItem,
      calcularValor,
    );
    // 11.280 / 155.100 = 7,2727...%
    expect(Math.round(calculado.percentual_fisico_medido * 100) / 100).toBe(7.27);
  });
});

describe('lançamento retroativo de medição — validações', () => {
  it('recusa motivo curto e aceita motivo com o mínimo de caracteres', () => {
    expect(() => validarMotivoRetroativo('NF 14')).toThrow(/mínimo 10 caracteres/);
    expect(() => validarMotivoRetroativo('   ')).toThrow(/mínimo 10 caracteres/);
    expect(() => validarMotivoRetroativo(null)).toThrow(/mínimo 10 caracteres/);
    expect(
      validarMotivoRetroativo('  NF 14 paga em 03/09 sem medição no sistema  '),
    ).toBe('NF 14 paga em 03/09 sem medição no sistema');
  });

  it('recusa OS inexistente', () => {
    expect(() =>
      validarOsMedicaoRetroativa(null, CONTRATO, ORDEM_SERVICO),
    ).toThrow(/não encontrada/);
  });

  it('recusa OS de outro contrato', () => {
    expect(() =>
      validarOsMedicaoRetroativa(
        {
          id: 'os-1',
          numero: 'OS-0116/2026',
          contrato_id: OUTRO_CONTRATO,
          tipo: ORDEM_SERVICO,
        },
        CONTRATO,
        ORDEM_SERVICO,
      ),
    ).toThrow(/pertence a outro contrato/);
  });

  it('recusa requisição que não é ordem de serviço', () => {
    expect(() =>
      validarOsMedicaoRetroativa(
        {
          id: 'req-1',
          numero: 'REQ-0009/2026',
          contrato_id: CONTRATO,
          tipo: 'MATERIAL',
        },
        CONTRATO,
        ORDEM_SERVICO,
      ),
    ).toThrow(/não é uma ordem de serviço/);
  });

  it('recusa OS que já tem medição ativa (evita consumo em dobro)', () => {
    expect(() =>
      validarOsMedicaoRetroativa(
        {
          id: 'os-1',
          numero: 'OS-0116/2026',
          contrato_id: CONTRATO,
          tipo: ORDEM_SERVICO,
          medicao_ativa: { numero_medicao: 7, status: 'APROVADA' },
        },
        CONTRATO,
        ORDEM_SERVICO,
      ),
    ).toThrow(/já está vinculada/);
  });

  it('aceita OS do contrato, do tipo certo e sem medição', () => {
    expect(() =>
      validarOsMedicaoRetroativa(
        {
          id: 'os-1',
          numero: 'OS-0116/2026',
          contrato_id: CONTRATO,
          tipo: ORDEM_SERVICO,
          medicao_ativa: null,
        },
        CONTRATO,
        ORDEM_SERVICO,
      ),
    ).not.toThrow();
  });
});

describe('lançamento retroativo de medição — período sugerido pela data da OS', () => {
  it('sugere do primeiro ao último dia do mês da OS', () => {
    // Caso real: OS-0116/2026 é de 22/06/2026 — o suporte digitou 01/05 a 30/05.
    expect(sugerirPeriodoDaOrdem('2026-06-22')).toEqual({
      inicio: '2026-06-01',
      fim: '2026-06-30',
    });
  });

  it('mês de 31 dias', () => {
    expect(sugerirPeriodoDaOrdem('2026-01-15')).toEqual({
      inicio: '2026-01-01',
      fim: '2026-01-31',
    });
  });

  it('dezembro não vira janeiro do ano seguinte', () => {
    expect(sugerirPeriodoDaOrdem('2026-12-31')).toEqual({
      inicio: '2026-12-01',
      fim: '2026-12-31',
    });
  });

  it('fevereiro comum tem 28 dias e bissexto tem 29', () => {
    expect(sugerirPeriodoDaOrdem('2026-02-10')).toEqual({
      inicio: '2026-02-01',
      fim: '2026-02-28',
    });
    expect(sugerirPeriodoDaOrdem('2024-02-29')).toEqual({
      inicio: '2024-02-01',
      fim: '2024-02-29',
    });
    // 2100 não é bissexto (regra dos séculos).
    expect(sugerirPeriodoDaOrdem('2100-02-05')).toEqual({
      inicio: '2100-02-01',
      fim: '2100-02-28',
    });
  });

  it('aceita Date e timestamp sem recuar um dia por fuso', () => {
    expect(sugerirPeriodoDaOrdem(new Date('2026-06-22T00:00:00Z'))).toEqual({
      inicio: '2026-06-01',
      fim: '2026-06-30',
    });
    expect(sugerirPeriodoDaOrdem('2026-06-01T03:00:00.000Z')).toEqual({
      inicio: '2026-06-01',
      fim: '2026-06-30',
    });
  });

  it('sugere mesmo quando a OS é anterior ao corte do ciclo (é informação, não regra)', () => {
    expect(sugerirPeriodoDaOrdem('2026-04-03')).toEqual({
      inicio: '2026-04-01',
      fim: '2026-04-30',
    });
  });

  it('devolve null sem data', () => {
    expect(sugerirPeriodoDaOrdem(null)).toBe(null);
    expect(sugerirPeriodoDaOrdem(undefined)).toBe(null);
    expect(sugerirPeriodoDaOrdem('')).toBe(null);
  });

  it('normaliza data pura para YYYY-MM-DD', () => {
    expect(normalizarDataPura('2026-05-14')).toBe('2026-05-14');
    expect(normalizarDataPura('2026-05-14T10:20:30.000Z')).toBe('2026-05-14');
    expect(normalizarDataPura(new Date('2026-05-14T00:00:00Z'))).toBe('2026-05-14');
    expect(normalizarDataPura(null)).toBe(null);
  });
});

describe('lançamento retroativo de medição — aviso de período fora do ciclo', () => {
  const CORTE = '2026-05-14'; // renovação de ciclo da Ata 001/2025

  it('avisa quando o período começa antes do corte do ciclo', () => {
    const aviso = avisoPeriodoForaDoCiclo('2026-05-01', CORTE);
    expect(typeof aviso === 'string').toBe(true);
    expect(/01\/05\/2026/.test(String(aviso))).toBe(true);
    expect(/14\/05\/2026/.test(String(aviso))).toBe(true);
    expect(/NÃO consome/.test(String(aviso))).toBe(true);
  });

  it('não avisa quando o período começa no corte ou depois', () => {
    expect(avisoPeriodoForaDoCiclo(CORTE, CORTE)).toBe(null);
    expect(avisoPeriodoForaDoCiclo('2026-06-01', CORTE)).toBe(null);
  });

  it('não avisa quando o contrato não tem renovação de ciclo', () => {
    expect(avisoPeriodoForaDoCiclo('2020-01-01', null)).toBe(null);
  });
});
