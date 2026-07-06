import { ParametrosLicitacaoService } from './parametros-licitacao.service';
import { ParametroLicitacao } from './entities/parametro-licitacao.entity';

/**
 * Testes da cadeia de resolução de parâmetros: parâmetro do órgão → default do sistema.
 * Garante que os defaults deixem de ser hardcoded e venham da parametrização (Fase 0).
 */
describe('ParametrosLicitacaoService.resolver', () => {
  function make(paramRepoOverrides: Partial<any>) {
    const paramRepo: any = {
      findOne: jest.fn(),
      create: jest.fn((d) => d),
      save: jest.fn((d) => Promise.resolve(d)),
      ...paramRepoOverrides,
    };
    const limiteRepo: any = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    const service = new ParametrosLicitacaoService(paramRepo, limiteRepo);
    return { service, paramRepo, limiteRepo };
  }

  it('retorna o parâmetro do próprio órgão quando existe (sem cair no default)', async () => {
    const doOrgao = { id: 'p1', orgao_id: 'org-1', tempo_inatividade_minutos: 15 } as ParametroLicitacao;
    const { service, paramRepo } = make({
      findOne: jest.fn().mockResolvedValueOnce(doOrgao),
    });

    const resolvido = await service.resolver('org-1');

    expect(resolvido).toBe(doOrgao);
    // Só uma consulta (a do órgão) — não buscou o default.
    expect(paramRepo.findOne).toHaveBeenCalledTimes(1);
  });

  it('cai no default do sistema quando o órgão não tem parâmetro próprio', async () => {
    const padrao = { id: 'p0', orgao_id: null, tempo_inatividade_minutos: 10 } as ParametroLicitacao;
    const { service, paramRepo } = make({
      findOne: jest
        .fn()
        .mockResolvedValueOnce(null) // órgão sem parâmetro
        .mockResolvedValueOnce(padrao), // default do sistema
    });

    const resolvido = await service.resolver('org-sem-config');

    expect(resolvido).toBe(padrao);
    expect(paramRepo.findOne).toHaveBeenCalledTimes(2);
  });

  it('cria o default do sistema se ainda não existir', async () => {
    const { service, paramRepo } = make({
      findOne: jest.fn().mockResolvedValue(null),
    });

    const resolvido = await service.resolver();

    expect(paramRepo.create).toHaveBeenCalledWith({ orgao_id: null });
    expect(paramRepo.save).toHaveBeenCalled();
    expect(resolvido).toMatchObject({ orgao_id: null });
  });

  it('sem orgaoId, vai direto ao default (não consulta parâmetro de órgão)', async () => {
    const padrao = { id: 'p0', orgao_id: null } as ParametroLicitacao;
    const { service, paramRepo } = make({
      findOne: jest.fn().mockResolvedValueOnce(padrao),
    });

    await service.resolver(undefined);

    // Única consulta é a do default.
    expect(paramRepo.findOne).toHaveBeenCalledTimes(1);
  });
});

describe('ParametrosLicitacaoService.salvar', () => {
  it('faz upsert e ignora campos imutáveis (id/orgao_id)', async () => {
    const existente = { id: 'p1', orgao_id: 'org-1', tempo_inatividade_minutos: 10 };
    const paramRepo: any = {
      findOne: jest.fn().mockResolvedValue(existente),
      create: jest.fn(),
      save: jest.fn((d) => Promise.resolve(d)),
    };
    const limiteRepo: any = {};
    const service = new ParametrosLicitacaoService(paramRepo, limiteRepo);

    const salvo = await service.salvar('org-1', {
      id: 'HACK',
      orgao_id: 'OUTRO',
      tempo_inatividade_minutos: 20,
    } as any);

    expect(salvo.id).toBe('p1'); // id preservado
    expect(salvo.orgao_id).toBe('org-1'); // orgao_id preservado
    expect(salvo.tempo_inatividade_minutos).toBe(20); // valor aplicado
  });
});
