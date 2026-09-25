import { DesconexaoPregoeiroService, desconexaoSuspendeModalidade } from './desconexao-pregoeiro.service';

describe('desconexão do agente (IN 73 art. 27) — escopo', () => {
  test('vale para pregão e concorrência; nunca para a dispensa (IN 67, modo JANELA)', () => {
    expect(desconexaoSuspendeModalidade('PREGAO_ELETRONICO')).toBe(true);
    expect(desconexaoSuspendeModalidade('CONCORRENCIA')).toBe(true);
    expect(desconexaoSuspendeModalidade('DISPENSA_ELETRONICA')).toBe(false);
    expect(desconexaoSuspendeModalidade(null)).toBe(false);
  });

  test('sessão de dispensa desconectada há mais de 10 min não é suspensa', async () => {
    const updates: any[] = [];
    const m: any = {
      findOne: async () => ({ id: 's1', licitacao_id: 'l1', status: 'MODO_ABERTO' }),
      query: async (sql: string) => {
        if (sql.includes('situacao')) return [{ situacao: 'ATIVA' }];
        if (sql.includes('modalidade')) return [{ modalidade: 'DISPENSA_ELETRONICA' }];
        return [{ n: 1 }];
      },
      update: async (...a: any[]) => updates.push(a),
      save: async (x: any) => x,
      create: (_: any, x: any) => x,
    };
    const ds: any = { transaction: async (fn: any) => fn(m) };
    const svc = new DesconexaoPregoeiroService(ds);
    const t = Date.now();
    svc.pregoeiroEntrou('s1', 'sock');
    svc.pregoeiroSaiu('s1', 'sock', t);
    expect(await svc.verificarDesconexoes(t + 11 * 60_000)).toEqual([]);
    expect(updates).toHaveLength(0);
  });

  test('pregão desconectado há mais de 10 min é suspenso; até 10 min não', async () => {
    const updates: any[] = [];
    const m: any = {
      findOne: async () => ({ id: 's2', licitacao_id: 'l2', status: 'MODO_ABERTO' }),
      query: async (sql: string) => {
        if (sql.includes('situacao')) return [{ situacao: 'ATIVA' }];
        if (sql.includes('modalidade')) return [{ modalidade: 'PREGAO_ELETRONICO' }];
        return [{ n: 1 }];
      },
      update: async (...a: any[]) => updates.push(a),
      save: async (x: any) => ({ id: 'e', created_at: new Date(), ...x }),
      create: (_: any, x: any) => x,
    };
    const svc = new DesconexaoPregoeiroService({ transaction: async (fn: any) => fn(m) } as any);
    const t = Date.now();
    svc.pregoeiroEntrou('s2', 'sock');
    svc.pregoeiroSaiu('s2', 'sock', t);
    expect(await svc.verificarDesconexoes(t + 10 * 60_000)).toEqual([]);
    expect(await svc.verificarDesconexoes(t + 10 * 60_000 + 1)).toEqual(['s2']);
    expect(updates[0][2]).toMatchObject({ status: 'SUSPENSA' });
  });
});
