import {
  agruparConsumoForaSistema,
  quantidadeConsumidaItemOs,
  resolverConsumoItem,
  somarMapasConsumo,
} from './consumo-ciclo.util';

const ITEM = 'item-cronograma-1';
const OUTRO_ITEM = 'item-cronograma-2';

/**
 * Simula o que `calcularQuantidadeAprovadaPorItem` monta: medições aprovadas do
 * ciclo + OS atendidas fora do sistema no ciclo.
 */
function consumoDoCiclo(
  aprovadas: Array<{ item_cronograma_id: string; quantidade_medida: number }>,
  osForaSistema: Array<{
    item_cronograma_id: string;
    quantidade_solicitada: number;
    meses_solicitados: number | null;
    unidade_medida: string | null;
  }>,
): Map<string, number> {
  const mapaAprovadas = new Map<string, number>();
  for (const linha of aprovadas) {
    mapaAprovadas.set(
      linha.item_cronograma_id,
      (mapaAprovadas.get(linha.item_cronograma_id) || 0) + linha.quantidade_medida,
    );
  }
  return somarMapasConsumo(mapaAprovadas, agruparConsumoForaSistema(osForaSistema));
}

describe('consumo do ciclo por item do cronograma', () => {
  it('contrato SEM ciclo usa o acumulado itens_cronograma.quantidade_medida', () => {
    // consumoCiclo = null → o chamador deve cair no acumulado do cronograma.
    expect(resolverConsumoItem(ITEM, 2685, null)).toBe(2685);
    expect(resolverConsumoItem(ITEM, null, null)).toBe(0);
  });

  it('contrato SEM ciclo: a OS paga por fora já entra no acumulado do cronograma', () => {
    // atenderForaDoSistema incrementou quantidade_medida de 2445 para 2685.
    const antes = resolverConsumoItem(ITEM, 2445, null);
    const depois = resolverConsumoItem(ITEM, 2685, null);
    expect(depois - antes).toBe(240);
  });

  it('contrato COM ciclo soma as medições APROVADAS do ciclo', () => {
    const consumo = consumoDoCiclo(
      [
        { item_cronograma_id: ITEM, quantidade_medida: 400 },
        { item_cronograma_id: ITEM, quantidade_medida: 215 },
        { item_cronograma_id: OUTRO_ITEM, quantidade_medida: 10 },
      ],
      [],
    );
    expect(consumo.get(ITEM)).toBe(615);
    expect(consumo.get(OUTRO_ITEM)).toBe(10);
  });

  it('contrato COM ciclo: OS atendida fora do sistema CONSOME saldo (não libera)', () => {
    // Cenário da ata 001/2025: 615 já medidos no ciclo + OS de 240 paga por fora.
    // Antes da correção o total ficava em 615 (saldo subia de 615 para 855 livres).
    const consumo = consumoDoCiclo(
      [{ item_cronograma_id: ITEM, quantidade_medida: 615 }],
      [
        {
          item_cronograma_id: ITEM,
          quantidade_solicitada: 240,
          meses_solicitados: null,
          unidade_medida: 'UN',
        },
      ],
    );
    expect(consumo.get(ITEM)).toBe(855);
  });

  it('item por tempo (MENSAL/POSTO) consome os meses solicitados, não a quantidade', () => {
    expect(
      quantidadeConsumidaItemOs({
        item_cronograma_id: ITEM,
        quantidade_solicitada: 30,
        meses_solicitados: 3,
        unidade_medida: 'MENSAL',
      }),
    ).toBe(3);
    expect(
      quantidadeConsumidaItemOs({
        item_cronograma_id: ITEM,
        quantidade_solicitada: 30,
        meses_solicitados: 3,
        unidade_medida: 'UN',
      }),
    ).toBe(30);
    // POSTO sem meses informados cai na quantidade (mesmo fallback do serviço).
    expect(
      quantidadeConsumidaItemOs({
        item_cronograma_id: ITEM,
        quantidade_solicitada: 12,
        meses_solicitados: null,
        unidade_medida: 'posto',
      }),
    ).toBe(12);
  });

  it('não há dupla contagem: a OS fora do sistema entra em um balde só', () => {
    // A OS paga por fora vira ATENDIDA → sai do COMPROMETIDO
    // (somarQuantidadeComprometidaPorItemOS só conta RASCUNHO/AGUARDANDO/AUTORIZADA)
    // e não gera itens_medicao_item → não aparece nas APROVADAS.
    const comprometidoDepoisDeAtender = 0;
    const consumo = consumoDoCiclo(
      [{ item_cronograma_id: ITEM, quantidade_medida: 615 }],
      [
        {
          item_cronograma_id: ITEM,
          quantidade_solicitada: 240,
          meses_solicitados: null,
          unidade_medida: 'UN',
        },
      ],
    );
    const contratado = 3300;
    const saldo =
      contratado - (consumo.get(ITEM) || 0) - comprometidoDepoisDeAtender;
    expect(consumo.get(ITEM)).toBe(855);
    expect(saldo).toBe(2445);
  });

  it('ignora linhas sem item do cronograma ou com quantidade zerada', () => {
    const consumo = agruparConsumoForaSistema([
      {
        item_cronograma_id: null as unknown as string,
        quantidade_solicitada: 100,
        meses_solicitados: null,
        unidade_medida: 'UN',
      },
      {
        item_cronograma_id: ITEM,
        quantidade_solicitada: 0,
        meses_solicitados: null,
        unidade_medida: 'UN',
      },
      {
        item_cronograma_id: ITEM,
        quantidade_solicitada: '25.5',
        meses_solicitados: null,
        unidade_medida: 'UN',
      },
    ]);
    expect(consumo.size).toBe(1);
    expect(consumo.get(ITEM)).toBe(25.5);
  });
});
