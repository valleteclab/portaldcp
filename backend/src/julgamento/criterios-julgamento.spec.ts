import {
  PESO_TECNICA_MAXIMO,
  indiceTecnicaPreco,
  montarRankingPontuado,
  notaTecnica,
  pendenciasPublicacao,
  retornoEconomico,
  validarConfiguracaoTecnica,
} from './criterios-julgamento';
import { OfertaRanking, SituacaoLicitante } from './regras-julgamento';

const oferta = (id: string, valor: number, t = 0): OfertaRanking => ({
  fornecedorId: id,
  fornecedorNome: id,
  melhorValor: valor,
  registradoEm: new Date(1_700_000_000_000 + t),
  totalLances: 1,
});

describe('critérios pontuados — Lei 14.133/2021 arts. 35, 36, 37 e 39', () => {
  describe('configuração técnica (edital)', () => {
    const q = [{ descricao: 'Metodologia', peso: 2, notaMaxima: 10 }];
    test('técnica e preço: peso da técnica ≤ 70% (art. 36 §2º)', () => {
      expect(PESO_TECNICA_MAXIMO).toBe(70);
      expect(validarConfiguracaoTecnica({ criterio: 'TECNICA_E_PRECO', pesoTecnica: 70, quesitos: q })).toEqual([]);
      expect(validarConfiguracaoTecnica({ criterio: 'TECNICA_E_PRECO', pesoTecnica: 70.01, quesitos: q }).join()).toMatch(/70%.*art\. 36/);
      expect(validarConfiguracaoTecnica({ criterio: 'TECNICA_E_PRECO', pesoTecnica: null, quesitos: q }).join()).toMatch(/peso da proposta técnica/);
      expect(validarConfiguracaoTecnica({ criterio: 'TECNICA_E_PRECO', pesoTecnica: 0, quesitos: q }).length).toBeGreaterThan(0);
    });
    test('melhor técnica: sem peso; quesitos obrigatórios e válidos; menor preço recusado', () => {
      expect(validarConfiguracaoTecnica({ criterio: 'MELHOR_TECNICA', quesitos: q })).toEqual([]);
      expect(validarConfiguracaoTecnica({ criterio: 'MELHOR_TECNICA', quesitos: [] }).join()).toMatch(/ao menos um quesito/);
      expect(validarConfiguracaoTecnica({ criterio: 'MELHOR_TECNICA', quesitos: [{ descricao: '', peso: 0, notaMaxima: -1 }] })).toHaveLength(3);
      expect(validarConfiguracaoTecnica({ criterio: 'MENOR_PRECO', quesitos: q }).join()).toMatch(/só se aplicam/);
      expect(validarConfiguracaoTecnica({ criterio: 'MELHOR_TECNICA', notaMinima: 120, quesitos: q }).join()).toMatch(/0 a 100/);
    });
  });

  describe('nota técnica', () => {
    const quesitos = [
      { id: 'q1', peso: 3, notaMaxima: 10 },
      { id: 'q2', peso: 1, notaMaxima: 5 },
    ];
    test('média dos membros por quesito, ponderada pelos pesos, escala 0–100', () => {
      const notas = [
        { quesitoId: 'q1', fornecedorId: 'A', membroId: 'm1', nota: 8 },
        { quesitoId: 'q1', fornecedorId: 'A', membroId: 'm2', nota: 10 },
        { quesitoId: 'q2', fornecedorId: 'A', membroId: 'm1', nota: 5 },
        { quesitoId: 'q2', fornecedorId: 'A', membroId: 'm2', nota: 3 },
      ];
      // q1 média 9/10 × 3 = 2,7 ; q2 média 4/5 × 1 = 0,8 ; (2,7+0,8)/4 × 100 = 87,5
      const r = notaTecnica(quesitos, notas, 'A');
      expect(r.nota).toBe(87.5);
      expect(r.porQuesito).toEqual([
        { quesitoId: 'q1', media: 9, notas: 2 },
        { quesitoId: 'q2', media: 4, notas: 2 },
      ]);
    });
    test('publicação exige banca de 3 (art. 37 §1º) e todas as notas', () => {
      const p = pendenciasPublicacao({
        quesitos: [{ id: 'q1', descricao: 'x' }],
        membros: [
          { id: 'm1', nome: 'Ana' },
          { id: 'm2', nome: 'Bia' },
        ],
        licitantes: [{ id: 'A', nome: 'A' }],
        notas: [{ quesitoId: 'q1', fornecedorId: 'A', membroId: 'm1', nota: 1 }],
      });
      expect(p.join()).toMatch(/mínimo 3 membros/);
      expect(p.join()).toMatch(/Bia: faltam 1/);
      expect(p.join()).not.toMatch(/Ana/);
    });
  });

  describe('técnica e preço — normalização', () => {
    test('IT = NT/maior NT; IP = menor preço/preço; IF = pT·IT + pP·IP', () => {
      const r = indiceTecnicaPreco({ nota: 80, maiorNota: 100, preco: 1000, menorPreco: 800, pesoTecnica: 70 });
      expect(r).toEqual({ indiceTecnico: 0.8, indicePreco: 0.8, indiceFinal: 0.8 });
      const s = indiceTecnicaPreco({ nota: 100, maiorNota: 100, preco: 1250, menorPreco: 1000, pesoTecnica: 60 });
      // 0,6 × 1 + 0,4 × 0,8 = 0,92
      expect(s.indiceFinal).toBe(0.92);
    });

    test('ranking por índice final; excluídos fora da normalização; sem nota depois', async () => {
      const notas = new Map([
        ['A', 100],
        ['B', 80],
        ['C', 90],
        ['X', 100],
      ]);
      const ofertas = [oferta('A', 1250, 1), oferta('B', 1000, 2), oferta('C', 1100, 3), oferta('D', 900, 4), oferta('X', 500, 5)];
      const r = await montarRankingPontuado('TECNICA_E_PRECO', ofertas, new Map([['X', SituacaoLicitante.DESCLASSIFICADO]]), {
        notas,
        pesoTecnica: 60,
      });
      // menor preço entre os classificados com nota = 1000 (X excluído, D sem nota)
      // A: 0,6·1 + 0,4·0,8 = 0,92 · B: 0,6·0,8 + 0,4·1 = 0,88 · C: 0,6·0,9 + 0,4·0,90909 = 0,9036
      expect(r.map((e) => [e.fornecedorId, e.posicao, e.criterio?.indiceFinal ?? null])).toEqual([
        ['A', 1, 0.92],
        ['C', 2, 0.9036],
        ['B', 3, 0.88],
        ['D', 4, null],
        ['X', null, null],
      ]);
      expect(r[3].criterio?.semPontuacao).toBe(true);
      expect(r[4].excluido).toBe(true);
    });

    test('índice igual (4 casas) → desempatador (art. 60)', async () => {
      const chamadas: string[][] = [];
      const r = await montarRankingPontuado(
        'TECNICA_E_PRECO',
        [oferta('A', 1000, 1), oferta('B', 1000, 2)],
        new Map(),
        { notas: new Map([['A', 90], ['B', 90]]), pesoTecnica: 50 },
        {
          desempatar: (g) => {
            chamadas.push(g.map((e) => e.fornecedorId));
            return [...g].reverse();
          },
          unidadeId: 'u',
        },
      );
      expect(chamadas).toEqual([['A', 'B']]);
      expect(r.map((e) => e.fornecedorId)).toEqual(['B', 'A']);
      expect(r.every((e) => e.empatado)).toBe(true);
    });

    test('nota abaixo da mínima (desclassificados do resultado publicado) sai do ranking', async () => {
      const r = await montarRankingPontuado('MELHOR_TECNICA', [oferta('A', 100), oferta('B', 100, 1)], new Map(), {
        notas: new Map([['A', 40], ['B', 90]]),
        desclassificados: new Set(['A']),
      });
      expect(r.map((e) => [e.fornecedorId, e.posicao, e.situacao])).toEqual([
        ['B', 1, SituacaoLicitante.CLASSIFICADO],
        ['A', null, SituacaoLicitante.DESCLASSIFICADO],
      ]);
    });
  });

  describe('melhor técnica (art. 35) e maior retorno econômico (art. 39)', () => {
    test('melhor técnica: só a nota técnica ordena (o preço não pesa)', async () => {
      const r = await montarRankingPontuado('MELHOR_TECNICA', [oferta('A', 100, 1), oferta('B', 999, 2)], new Map(), {
        notas: new Map([['A', 70], ['B', 95]]),
      });
      expect(r.map((e) => e.fornecedorId)).toEqual(['B', 'A']);
      expect(r[0].criterio).toMatchObject({ pontuacao: 95, notaTecnica: 95, pesoTecnica: 100, pesoPreco: 0 });
    });

    test('retorno = economia − economia × percentual (art. 39 §3º); ranking decrescente', async () => {
      expect(retornoEconomico({ economiaEstimada: 100000, percentualRemuneracao: 20 })).toEqual({ remuneracao: 20000, retorno: 80000 });
      const r = await montarRankingPontuado('MAIOR_RETORNO_ECONOMICO', [oferta('A', 1, 1), oferta('B', 1, 2), oferta('C', 1, 3)], new Map(), {
        retornos: new Map([
          ['A', { economiaEstimada: 100000, percentualRemuneracao: 20 }],
          ['B', { economiaEstimada: 120000, percentualRemuneracao: 30 }],
        ]),
      });
      expect(r.map((e) => [e.fornecedorId, e.criterio?.retornoEconomico ?? null])).toEqual([
        ['B', 84000],
        ['A', 80000],
        ['C', null],
      ]);
    });
  });
});
