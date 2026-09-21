import { RequisicaoService } from './requisicao.service';

/**
 * OS emitida depois de uma medição já aprovada (o fornecedor mediu antes de a OS
 * sair). O consumo daquela medição precisa voltar ao saldo, senão a OS que cobre
 * a própria medição fica travada — caso do contrato 088/2021 4ºAD, cujo último
 * mês (0,7 = R$ 2.800) foi medido antes da OS.
 */
describe('RequisicaoService — OS que regulariza medição aprovada', () => {
  const ITEM = 'item-cronograma-1';
  const MEDICAO = 'medicao-7';
  const CONTRATO = 'contrato-088';

  let linhas: Record<string, any[]>;
  let service: any;

  const criarService = () => {
    const dataSource = {
      query: jest.fn(async (sql: string) => {
        if (/FROM medicoes/i.test(sql)) return linhas.medicao;
        if (/FROM itens_medicao_item/i.test(sql)) return linhas.itens;
        return [];
      }),
    };
    const s = Object.create(RequisicaoService.prototype);
    Object.assign(s, { dataSource });
    return s;
  };

  beforeEach(() => {
    linhas = {
      medicao: [
        { id: MEDICAO, contrato_id: CONTRATO, status: 'APROVADA', numero_medicao: 7 },
      ],
      itens: [{ item_cronograma_id: ITEM, qtd: '0.7000' }],
    };
    service = criarService();
  });

  it('devolve ao saldo o que a medição consumiu, por item', async () => {
    const consumo = await service.consumoDaMedicaoRegularizada(MEDICAO, CONTRATO);
    expect(consumo.get(ITEM)).toBeCloseTo(0.7, 4);
  });

  it('sem medição informada, não mexe no saldo', async () => {
    const consumo = await service.consumoDaMedicaoRegularizada(undefined, CONTRATO);
    expect(consumo.size).toBe(0);
  });

  it('recusa medição de outro contrato', async () => {
    linhas.medicao[0].contrato_id = 'outro-contrato';
    await expect(
      service.consumoDaMedicaoRegularizada(MEDICAO, CONTRATO),
    ).rejects.toThrow('outro contrato');
  });

  it('recusa medição que ainda não foi aprovada', async () => {
    linhas.medicao[0].status = 'AGUARDANDO_APROVACAO';
    await expect(
      service.consumoDaMedicaoRegularizada(MEDICAO, CONTRATO),
    ).rejects.toThrow('APROVADA');
  });

  it('recusa medição inexistente', async () => {
    linhas.medicao = [];
    await expect(
      service.consumoDaMedicaoRegularizada(MEDICAO, CONTRATO),
    ).rejects.toThrow('não encontrada');
  });

  it('com a devolução, o saldo cobre exatamente a OS da medição (caso 088/2021)', async () => {
    const consumo = await service.consumoDaMedicaoRegularizada(MEDICAO, CONTRATO);
    // 12 meses contratados, 12 já consumidos (5,3 de migração + 6,7 medidos)
    const qtdTotal = 12;
    const medido = 12;
    const comprometido = 0;
    const saldo = qtdTotal - medido - comprometido + (consumo.get(ITEM) || 0);
    expect(saldo).toBeCloseTo(0.7, 4);
    expect(0.7 <= saldo + 0.0001).toBe(true);
  });
});
