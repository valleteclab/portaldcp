import {
  ALGORITMO_SORTEIO,
  conferirSorteio,
  entradaDoSorteio,
  sementeDoSorteio,
  sortear,
  sorteioAuditavel,
} from './sorteio';

/** Sorteio auditável — IN SEGES 73/2022 art. 28 §2º (desempate do art. 60 e ME/EPP). */
describe('sorteio auditável', () => {
  const base = { licitacaoId: 'lic-1', unidadeId: 'item-1', candidatos: ['c', 'a', 'b'], atoEm: new Date('2026-09-24T15:00:00.123Z') };

  test('entrada canônica: algoritmo, contexto, ids e instante (candidatos em ordem crescente)', () => {
    expect(entradaDoSorteio(base)).toBe(
      `${ALGORITMO_SORTEIO}|ART60|licitacao=lic-1|unidade=item-1|candidatos=a,b,c|ato=2026-09-24T15:00:00.123Z`,
    );
  });

  test('determinístico: mesma entrada → mesma ordem, qualquer que seja a ordem dos candidatos', () => {
    const e = entradaDoSorteio(base);
    const r1 = sortear(e, ['a', 'b', 'c']);
    const r2 = sortear(e, ['c', 'b', 'a']);
    expect(r1).toEqual(r2);
    expect([...r1].sort()).toEqual(['a', 'b', 'c']);
  });

  test('semente = SHA-256 da entrada (hex)', () => {
    expect(sementeDoSorteio('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });

  test('instante do ato diferente → (em geral) outra ordem; registro completo confere', () => {
    const r = sorteioAuditavel(base);
    expect(r.semente).toBe(sementeDoSorteio(r.entrada));
    expect(conferirSorteio(r)).toBe(true);
    expect(conferirSorteio({ ...r, ordem: [...r.ordem].reverse() })).toBe(false);
    expect(conferirSorteio({ ...r, semente: '00' })).toBe(false);
    const ordens = new Set<string>();
    for (let i = 0; i < 30; i++) ordens.add(sortear(entradaDoSorteio({ ...base, atoEm: new Date(1_700_000_000_000 + i) }), base.candidatos).join());
    expect(ordens.size).toBeGreaterThan(1);
  });

  test('distribuição: cada candidato vence ~1/n das vezes (sem viés grosseiro)', () => {
    const cand = ['f1', 'f2', 'f3', 'f4'];
    const vitorias: Record<string, number> = { f1: 0, f2: 0, f3: 0, f4: 0 };
    const posicoes: Record<string, number[]> = { f1: [0, 0, 0, 0], f2: [0, 0, 0, 0], f3: [0, 0, 0, 0], f4: [0, 0, 0, 0] };
    const N = 4000;
    for (let i = 0; i < N; i++) {
      const ordem = sortear(`teste-distribuicao-${i}`, cand);
      vitorias[ordem[0]]++;
      ordem.forEach((c, p) => posicoes[c][p]++);
    }
    for (const c of cand) {
      // esperado 1000; tolerância larga (~6 desvios-padrão)
      expect(vitorias[c]).toBeGreaterThan(820);
      expect(vitorias[c]).toBeLessThan(1180);
      for (const p of posicoes[c]) expect(Math.abs(p - N / 4)).toBeLessThan(180);
    }
  });

  test('um candidato: ordem trivial; candidato repetido: erro', () => {
    expect(sortear('x', ['so'])).toEqual(['so']);
    expect(() => sortear('x', ['a', 'a'])).toThrow(/repetido/);
  });
});
