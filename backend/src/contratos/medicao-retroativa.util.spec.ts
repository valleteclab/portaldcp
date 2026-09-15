import {
  calcularItensMedicaoRetroativa,
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
