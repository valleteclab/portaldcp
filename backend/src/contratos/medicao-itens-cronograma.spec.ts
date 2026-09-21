import { MedicaoService } from './medicao.service';

/**
 * `listarMedicoes` precisa devolver os itens de CRONOGRAMA além dos de etapa.
 * Sem isso, a OS que regulariza uma medição aprovada recebia a medição sem
 * quantidade e o campo ficava travado em zero (caso 088/2021 4ºAD, 0,7 mês).
 */
describe('MedicaoService.listarMedicoes — itens de cronograma', () => {
  const MEDICAO = 'medicao-7';
  const ITEM_CRON = 'item-cronograma-1';

  const montar = (itensCronograma: any[], itensEtapa: any[] = []) => {
    const service: any = Object.create(MedicaoService.prototype);
    Object.assign(service, {
      medicaoRepository: {
        find: async () => [{ id: MEDICAO, numero_medicao: 7, contrato_id: 'c1' }],
      },
      itemMedicaoItemRepository: { find: async () => itensCronograma },
      itemMedicaoRepository: { find: async () => itensEtapa },
    });
    return service;
  };

  it('traz item_cronograma_id e quantidade medida como número', async () => {
    const service = montar([
      { id: 'i1', item_cronograma_id: ITEM_CRON, quantidade_medida: '0.7000', valor_medido: '2800.00' },
    ]);
    const [medicao] = await service.listarMedicoes('c1');
    expect(medicao.itens_cronograma).toEqual([
      { id: 'i1', item_cronograma_id: ITEM_CRON, quantidade_medida: 0.7, valor_medido: 2800 },
    ]);
  });

  it('medição sem itens de cronograma devolve lista vazia, não quebra', async () => {
    const service = montar([]);
    const [medicao] = await service.listarMedicoes('c1');
    expect(medicao.itens_cronograma).toEqual([]);
  });

  it('continua devolvendo os itens de etapa em `itens`', async () => {
    const service = montar([], [{ id: 'e1', etapa: { descricao: 'Etapa 1', numero_etapa: 1, valor_previsto: 10, percentual_fisico: 5 } }]);
    const [medicao] = await service.listarMedicoes('c1');
    expect(medicao.itens[0]).toMatchObject({ id: 'e1', etapa_descricao: 'Etapa 1', etapa_numero: 1 });
  });
});
