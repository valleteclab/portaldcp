/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { ModalidadeExecucao } from '../contratos/entities/contrato.entity';
import { RequisicaoService } from './requisicao.service';

const criarQueryBuilder = () => {
  const qb: any = {
    select: jest.fn(),
    addSelect: jest.fn(),
    innerJoin: jest.fn(),
    where: jest.fn(),
    andWhere: jest.fn(),
    groupBy: jest.fn(),
    getRawMany: jest.fn().mockResolvedValue([]),
  };
  for (const metodo of [
    'select',
    'addSelect',
    'innerJoin',
    'where',
    'andWhere',
    'groupBy',
  ]) {
    qb[metodo].mockReturnValue(qb);
  }
  return qb;
};

const criarService = (modalidade: ModalidadeExecucao) => {
  const qb = criarQueryBuilder();
  const service = Object.create(
    RequisicaoService.prototype,
  ) as RequisicaoService & Record<string, any>;
  service.contratoRepository = {
    findOne: jest.fn().mockResolvedValue({
      id: 'contrato-1',
      data_renovacao_ciclo: new Date('2026-06-26'),
      modalidade_execucao: modalidade,
    }),
  };
  service.requisicaoItemOSRepository = {
    createQueryBuilder: jest.fn().mockReturnValue(qb),
  };
  return { service, qb };
};

describe('RequisicaoService - saldo de OS por ciclo', () => {
  it('mantem a OS como consumo na modalidade ORDEM_SERVICO, mesmo se houver medicao', async () => {
    const { service, qb } = criarService(ModalidadeExecucao.ORDEM_SERVICO);

    await service.somarQuantidadeComprometidaPorItemOS('contrato-1');

    const filtros = qb.andWhere.mock.calls.map(([sql]: [string]) => sql);
    expect(filtros.some((sql: string) => sql.includes('NOT EXISTS'))).toBe(
      false,
    );
    expect(filtros).toContain('r.data_solicitacao >= :inicioCicloVigente');
  });

  it('transfere a reserva da OS para a medicao quando a modalidade volta a MEDICAO', async () => {
    const { service, qb } = criarService(ModalidadeExecucao.MEDICAO);

    await service.somarQuantidadeComprometidaPorItemOS('contrato-1');

    const filtros = qb.andWhere.mock.calls.map(([sql]: [string]) => sql);
    expect(filtros.some((sql: string) => sql.includes('NOT EXISTS'))).toBe(
      true,
    );
    expect(filtros).toContain('r.data_solicitacao >= :inicioCicloVigente');
  });
});
