import { PatrimonioService } from './patrimonio.service';

/**
 * Listagem de bens: sem página devolve tudo (etiquetas e movimentações contam
 * com isso); com página, devolve só a fatia e o total, para a tela não montar
 * uma lista infinita.
 */
describe('PatrimonioService.listarBens — paginação', () => {
  let qb: any;
  let service: PatrimonioService;

  beforeEach(() => {
    qb = {
      leftJoinAndSelect: jest.fn(() => qb),
      where: jest.fn(() => qb),
      andWhere: jest.fn(() => qb),
      orderBy: jest.fn(() => qb),
      skip: jest.fn(() => qb),
      take: jest.fn(() => qb),
      getMany: jest.fn(async () => [{ id: 'a' }]),
      getManyAndCount: jest.fn(async () => [[{ id: 'a' }], 2132]),
    };
    const repo = { createQueryBuilder: () => qb } as any;
    service = new PatrimonioService(
      repo, repo, repo, repo, repo, repo, repo, repo, repo,
    );
  });

  it('sem página devolve a lista inteira', async () => {
    const r = await service.listarBens('orgao');
    expect(Array.isArray(r)).toBe(true);
    expect(qb.skip).not.toHaveBeenCalled();
    expect(qb.getMany).toHaveBeenCalled();
  });

  it('com página devolve a fatia, o total e o número de páginas', async () => {
    const r: any = await service.listarBens('orgao', { pagina: 3, limite: 50 });
    expect(qb.skip).toHaveBeenCalledWith(100);
    expect(qb.take).toHaveBeenCalledWith(50);
    expect(r).toMatchObject({ total: 2132, pagina: 3, limite: 50, paginas: 43 });
    expect(r.dados.length).toBe(1);
  });

  it('limite fora da faixa é ajustado e página mínima é 1', async () => {
    await service.listarBens('orgao', { pagina: 0, limite: 5000 });
    expect(qb.take).toHaveBeenCalledWith(200);
    expect(qb.skip).toHaveBeenCalledWith(0);
  });

  it('o filtro continua valendo junto com a página', async () => {
    await service.listarBens('orgao', { busca: 'mesa', pagina: 2 });
    expect(qb.andWhere).toHaveBeenCalledWith(expect.stringContaining('ILIKE'), { busca: '%mesa%' });
    expect(qb.take).toHaveBeenCalledWith(50);
  });
});
