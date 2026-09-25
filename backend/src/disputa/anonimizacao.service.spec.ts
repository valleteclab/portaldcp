import { AnonimizacaoService } from './anonimizacao.service';
import { codigoAnonimoDoIndice } from './migracao-lances';

/**
 * Atribuição ATÔMICA do código anônimo (E2 — simulador 5c/7b): trava por
 * sessão ANTES de ler o maior índice, mantém quem já tem código e insere com
 * ON CONFLICT. O banco real (índice único) é coberto pelo simulador e-2-e.
 */
describe('AnonimizacaoService.atribuirCodigos', () => {
  function servico(existentes: Array<{ fornecedor_id: string; codigo_anonimo: string; indice: number }>) {
    const chamadas: Array<{ sql: string; params: any[] }> = [];
    const m = {
      query: jest.fn(async (sql: string, params: any[] = []) => {
        chamadas.push({ sql, params });
        if (/^SELECT fornecedor_id, codigo_anonimo, indice/.test(sql.trim())) return existentes;
        return [];
      }),
    };
    const repo: any = {
      findOne: jest.fn(async ({ where }: any) => {
        const e = existentes.find((x) => x.fornecedor_id === where.fornecedor_id);
        return e ? { ...e } : null;
      }),
      manager: { transaction: (fn: any) => fn(m) },
    };
    return { svc: new AnonimizacaoService(repo, {} as any), chamadas };
  }

  it('trava a sessão antes de ler e insere em sequência, sem repetir código', async () => {
    const { svc, chamadas } = servico([{ fornecedor_id: 'f1', codigo_anonimo: 'Fornecedor A', indice: 1 }]);
    const mapa = await svc.atribuirCodigos('s1', ['f1', 'f2', 'f3', 'f2']);

    expect(chamadas[0].sql).toMatch(/pg_advisory_xact_lock/);
    expect(chamadas[0].params).toEqual(['mapeamento_anonimo:s1']);
    expect([...mapa.entries()]).toEqual([
      ['f1', 'Fornecedor A'],
      ['f2', 'Fornecedor B'],
      ['f3', 'Fornecedor C'],
    ]);
    const inserts = chamadas.filter((c) => /INSERT INTO mapeamento_anonimo/.test(c.sql));
    expect(inserts).toHaveLength(2);
    for (const i of inserts) expect(i.sql).toMatch(/ON CONFLICT \(sessao_id, fornecedor_id\) DO NOTHING/);
    expect(inserts.map((i) => i.params[3])).toEqual([2, 3]);
  });

  it('obterCodigoAnonimo devolve o código existente sem abrir transação', async () => {
    const { svc, chamadas } = servico([{ fornecedor_id: 'f9', codigo_anonimo: 'Fornecedor C', indice: 3 }]);
    expect(await svc.obterCodigoAnonimo('s1', 'f9')).toBe('Fornecedor C');
    expect(chamadas).toHaveLength(0);
  });

  it('códigos: 1 → A, 26 → Z, 27 → AA', () => {
    expect(codigoAnonimoDoIndice(1)).toBe('Fornecedor A');
    expect(codigoAnonimoDoIndice(26)).toBe('Fornecedor Z');
    expect(codigoAnonimoDoIndice(27)).toBe('Fornecedor AA');
  });
});
