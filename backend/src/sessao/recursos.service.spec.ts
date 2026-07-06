import { RecursosService } from './recursos.service';
import { StatusRecurso } from './entities/recurso-administrativo.entity';
import { EtapaSessao } from './entities/sessao-disputa.entity';

/**
 * Testes do ciclo de recursos (Art. 165): admissão → razões → contrarrazões →
 * decisão, e o cálculo de prazo em dias úteis.
 */
describe('RecursosService', () => {
  function build() {
    const recursos: any[] = [];
    const recursoRepo: any = {
      create: (d: any) => ({ id: `r${recursos.length + 1}`, contrarrazoes: null, ...d }),
      save: jest.fn((r: any) => {
        const idx = recursos.findIndex((x) => x.id === r.id);
        if (idx >= 0) recursos[idx] = r;
        else recursos.push(r);
        return Promise.resolve(r);
      }),
      findOneBy: jest.fn(({ id }: any) => Promise.resolve(recursos.find((r) => r.id === id) || null)),
      count: jest.fn(() => Promise.resolve(0)),
      find: jest.fn(() => Promise.resolve(recursos)),
    };
    const sessao = { id: 's1', licitacao_id: 'l1', etapa: EtapaSessao.INTENCAO_RECURSO, pregoeiro_nome: 'Preg' };
    const sessaoRepo: any = {
      findOneBy: jest.fn(() => Promise.resolve(sessao)),
      save: jest.fn((s: any) => Promise.resolve(s)),
    };
    const eventoRepo: any = { create: (d: any) => d, save: jest.fn(() => Promise.resolve({})) };
    const licitacaoRepo: any = { findOneBy: jest.fn(() => Promise.resolve({ id: 'l1', orgao_id: 'org1' })) };
    const parametros: any = {
      resolver: jest.fn(() =>
        Promise.resolve({ prazo_recursal_dias_uteis: 3, prazo_contrarrazoes_dias_uteis: 3 }),
    ),
    };
    const service = new RecursosService(recursoRepo, sessaoRepo, eventoRepo, licitacaoRepo, parametros);
    return { service, recursoRepo, sessaoRepo, eventoRepo, sessao, recursos };
  }

  it('admitir intenção cria recurso AGUARDANDO_RAZOES e leva a sessão a PRAZO_RECURSAL', async () => {
    const { service, sessao } = build();
    const recurso = await service.admitirIntencao('s1', 'forn-1', {
      fornecedorNome: 'ACME',
      motivacao: 'discordo da habilitação',
    });
    expect(recurso.status).toBe(StatusRecurso.AGUARDANDO_RAZOES);
    expect(recurso.intencao_aceita).toBe(true);
    expect(recurso.prazo_razoes).toBeInstanceOf(Date);
    expect(sessao.etapa).toBe(EtapaSessao.PRAZO_RECURSAL);
  });

  it('recusar intenção marca NAO_CONHECIDO com motivo', async () => {
    const { service } = build();
    const recurso = await service.recusarIntencao('s1', 'forn-2', 'intempestivo');
    expect(recurso.status).toBe(StatusRecurso.NAO_CONHECIDO);
    expect(recurso.intencao_aceita).toBe(false);
    expect(recurso.motivo_recusa_intencao).toBe('intempestivo');
  });

  it('apresentar razões avança para CONTRARRAZOES', async () => {
    const { service } = build();
    const r = await service.admitirIntencao('s1', 'forn-1', {});
    const atualizado = await service.apresentarRazoes(r.id, 'minhas razões fundamentadas');
    expect(atualizado.status).toBe(StatusRecurso.CONTRARRAZOES);
    expect(atualizado.razoes).toBe('minhas razões fundamentadas');
    expect(atualizado.prazo_contrarrazoes).toBeInstanceOf(Date);
  });

  it('contrarrazões acumulam na lista', async () => {
    const { service } = build();
    const r = await service.admitirIntencao('s1', 'forn-1', {});
    await service.apresentarRazoes(r.id, 'razões');
    const c1 = await service.apresentarContrarrazoes(r.id, {
      fornecedorId: 'forn-9',
      texto: 'discordo do recurso',
    });
    expect(c1.contrarrazoes).toHaveLength(1);
    const c2 = await service.apresentarContrarrazoes(r.id, {
      fornecedorId: 'forn-8',
      texto: 'também discordo',
    });
    expect(c2.contrarrazoes).toHaveLength(2);
  });

  it('decidir (provido) fecha o recurso e, sem pendências, avança para ADJUDICACAO', async () => {
    const { service, sessao, recursoRepo } = build();
    const r = await service.admitirIntencao('s1', 'forn-1', {});
    await service.apresentarRazoes(r.id, 'razões');
    recursoRepo.count.mockResolvedValue(0); // nenhum pendente após decidir
    const decidido = await service.decidir(r.id, {
      provido: true,
      decisao: 'assiste razão ao recorrente',
      decididoPor: 'Autoridade X',
    });
    expect(decidido.status).toBe(StatusRecurso.PROVIDO);
    expect(sessao.etapa).toBe(EtapaSessao.ADJUDICACAO);
  });

  it('não permite decidir recurso ainda aguardando razões', async () => {
    const { service } = build();
    const r = await service.admitirIntencao('s1', 'forn-1', {});
    await expect(
      service.decidir(r.id, { provido: false, decisao: 'x' }),
    ).rejects.toThrow();
  });

  it('prazo de razões cai em dia útil (não sábado/domingo)', async () => {
    const { service } = build();
    const r = await service.admitirIntencao('s1', 'forn-1', {});
    const dow = new Date(r.prazo_razoes).getDay();
    expect(dow).not.toBe(0); // domingo
    expect(dow).not.toBe(6); // sábado
  });
});
