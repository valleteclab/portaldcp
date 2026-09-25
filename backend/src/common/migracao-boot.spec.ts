import { executarMigracaoDeBoot } from './migracao-boot';

function dataSourceFalso(registro: string[]) {
  return {
    createQueryRunner: () => ({
      connect: async () => undefined,
      query: async (sql: string) => {
        registro.push(sql.includes('unlock') ? 'unlock' : 'lock');
      },
      release: async () => undefined,
    }),
  } as any;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('executarMigracaoDeBoot', () => {
  it('roda as migrações uma de cada vez, na ordem em que foram chamadas', async () => {
    const eventos: string[] = [];
    const ds = dataSourceFalso([]);
    const migracao = (nome: string, ms: number) => async () => {
      eventos.push(`inicio:${nome}`);
      await esperar(ms);
      eventos.push(`fim:${nome}`);
      return nome;
    };

    // Disparadas "ao mesmo tempo", como o Nest faz com os providers de um módulo
    const r = await Promise.all([
      executarMigracaoDeBoot(ds, migracao('lances', 30)),
      executarMigracaoDeBoot(ds, migracao('dispensa', 5)),
      executarMigracaoDeBoot(ds, migracao('lote', 1)),
    ]);

    expect(r).toEqual(['lances', 'dispensa', 'lote']);
    expect(eventos).toEqual([
      'inicio:lances', 'fim:lances',
      'inicio:dispensa', 'fim:dispensa',
      'inicio:lote', 'fim:lote',
    ]);
  });

  it('uma migração que falha não impede as seguintes e sempre libera o lock', async () => {
    const sqls: string[] = [];
    const ds = dataSourceFalso(sqls);
    const falha = executarMigracaoDeBoot(ds, async () => {
      throw new Error('deadlock detected');
    });
    const seguinte = executarMigracaoDeBoot(ds, async () => 'ok');

    await expect(falha).rejects.toThrow('deadlock detected');
    await expect(seguinte).resolves.toBe('ok');
    expect(sqls).toEqual(['lock', 'unlock', 'lock', 'unlock']);
  });
});
