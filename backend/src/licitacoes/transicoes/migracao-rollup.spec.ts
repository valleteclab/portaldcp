import { FaseLicitacao, SituacaoLicitacao } from '../entities/licitacao.entity';
import { inferirEstadoLegado, LinhaLegada, migrarSituacaoLegada } from './migracao-situacao';
import { avaliarRollupItens } from './rollup';

const F = FaseLicitacao;
const S = SituacaoLicitacao;

describe('roll-up dos itens → situação da licitação', () => {
  const it_ = (status: string, vencedor: string | null = null) => ({ status, fornecedor_vencedor_id: vencedor });
  test.each([
    ['todos desertos', [it_('DESERTO'), it_('DESERTO')], S.DESERTA],
    ['desertos + cancelado', [it_('DESERTO'), it_('CANCELADO')], S.DESERTA],
    ['fracassado + deserto, sem vencedor', [it_('FRACASSADO'), it_('DESERTO')], S.FRACASSADA],
    ['todos fracassados', [it_('FRACASSADO'), it_('FRACASSADO')], S.FRACASSADA],
    ['um item ainda ativo', [it_('DESERTO'), it_('ATIVO')], null],
    ['um item adjudicado', [it_('DESERTO'), it_('ADJUDICADO', 'f1')], null],
    ['vencedor gravado sem status', [it_('FRACASSADO'), it_('ATIVO', 'f1')], null],
    ['só cancelados', [it_('CANCELADO')], null],
    ['sem itens', [], null],
  ])('%s', (_nome, itens, esperado) => {
    expect(avaliarRollupItens(itens as any)).toBe(esperado);
  });
});

describe('migração da situação legada (inferência pura)', () => {
  const agora = new Date('2026-09-24T12:00:00');
  const passado = '2026-09-01T10:00:00';
  const futuro = '2026-10-30T10:00:00';
  const base = (p: Partial<LinhaLegada>): LinhaLegada => ({ id: 'x', fase: F.SUSPENSO, ...p });

  test.each<[string, Partial<LinhaLegada>, FaseLicitacao, SituacaoLicitacao, string]>([
    ['fase_anterior válida prevalece', { fase: F.SUSPENSO, fase_anterior: F.EM_DISPUTA, data_homologacao: passado }, F.EM_DISPUTA, S.SUSPENSA, 'fase_anterior'],
    ['fase_anterior legada é ignorada', { fase: F.REVOGADO, fase_anterior: F.SUSPENSO, data_publicacao_edital: passado }, F.PUBLICADO, S.REVOGADA, 'data_publicacao_edital'],
    ['CONCLUIDO → homologação', { fase: F.CONCLUIDO }, F.HOMOLOGACAO, S.CONCLUIDA, 'concluido'],
    ['homologada', { fase: F.ANULADO, data_homologacao: passado, data_adjudicacao: passado }, F.HOMOLOGACAO, S.ANULADA, 'data_homologacao'],
    ['adjudicada por data', { fase: F.REVOGADO, data_adjudicacao: passado }, F.ADJUDICACAO, S.REVOGADA, 'data_adjudicacao'],
    ['dispensa julgada (item com vencedor, sem data)', { fase: F.REVOGADO, tem_vencedor: true, data_fim_acolhimento: passado }, F.ADJUDICACAO, S.REVOGADA, 'item_com_vencedor'],
    ['disputa encerrada', { fase: F.FRACASSADO, data_fim_disputa: passado, data_inicio_disputa: passado }, F.JULGAMENTO, S.FRACASSADA, 'data_fim_disputa'],
    ['em disputa', { fase: F.SUSPENSO, data_inicio_disputa: passado }, F.EM_DISPUTA, S.SUSPENSA, 'data_inicio_disputa'],
    ['acolhimento encerrado', { fase: F.DESERTO, data_publicacao_edital: passado, data_fim_acolhimento: passado }, F.ANALISE_PROPOSTAS, S.DESERTA, 'fim_acolhimento_passou'],
    ['abertura (sem fim de acolhimento) passou', { fase: F.DESERTO, data_abertura_sessao: passado }, F.ANALISE_PROPOSTAS, S.DESERTA, 'fim_acolhimento_passou'],
    ['acolhimento em curso', { fase: F.SUSPENSO, data_publicacao_edital: passado, data_inicio_acolhimento: passado, data_fim_acolhimento: futuro }, F.ACOLHIMENTO_PROPOSTAS, S.SUSPENSA, 'inicio_acolhimento_passou'],
    ['só publicada', { fase: F.SUSPENSO, data_publicacao_edital: passado, data_inicio_acolhimento: futuro, data_fim_acolhimento: futuro }, F.PUBLICADO, S.SUSPENSA, 'data_publicacao_edital'],
    ['fase interna concluída', { fase: F.REVOGADO, fase_interna_concluida: true }, F.APROVACAO_INTERNA, S.REVOGADA, 'fase_interna_concluida'],
    ['nada', { fase: F.ANULADO }, F.PLANEJAMENTO, S.ANULADA, 'padrao'],
  ])('%s', (_nome, parcial, fase, situacao, regra) => {
    expect(inferirEstadoLegado(base(parcial), agora)).toEqual({ fase, situacao, regra });
  });

  test('linha não legada não é tocada', () => {
    expect(inferirEstadoLegado(base({ fase: F.ACOLHIMENTO_PROPOSTAS }), agora)).toBeNull();
    expect(inferirEstadoLegado(base({ fase: F.HOMOLOGACAO }), agora)).toBeNull();
  });
});

describe('migração da situação legada (execução idempotente)', () => {
  /** Executor SQL em memória: entende só as 3 instruções da rotina. */
  function bancoFalso(linhas: Array<{ id: string; fase: string; situacao: string; [k: string]: any }>) {
    const historico: any[][] = [];
    return {
      linhas,
      historico,
      async query(sql: string, params: any[] = []) {
        if (/^\s*SELECT/i.test(sql)) {
          const legadas: string[] = params[0];
          return linhas.filter((l) => legadas.includes(l.fase)).map((l) => ({ ...l }));
        }
        if (/^\s*UPDATE licitacoes/i.test(sql)) {
          const [id, fase, situacao, faseLegada] = params;
          const l = linhas.find((x) => x.id === id && x.fase === faseLegada);
          if (!l) return [[], 0];
          l.fase = fase;
          l.situacao = situacao;
          return [[{ id }], 1];
        }
        if (/^\s*INSERT INTO licitacao_transicoes/i.test(sql)) {
          historico.push(params);
          return [];
        }
        throw new Error(`SQL inesperado: ${sql}`);
      },
    };
  }

  test('migra as legadas, registra histórico e é idempotente (2ª execução não faz nada)', async () => {
    const db = bancoFalso([
      { id: 'a', fase: 'SUSPENSO', situacao: 'ATIVA', data_publicacao_edital: '2026-09-01', observacoes: 'Suspenso: impugnação' },
      { id: 'b', fase: 'REVOGADO', situacao: 'ATIVA', data_homologacao: '2026-09-10' },
      { id: 'c', fase: 'ACOLHIMENTO_PROPOSTAS', situacao: 'ATIVA' },
    ]);
    const agora = new Date('2026-09-24T12:00:00');
    const r1 = await migrarSituacaoLegada(db, agora);
    expect(r1.encontradas).toBe(2);
    expect(r1.migradas).toBe(2);
    expect(db.linhas.map((l) => [l.id, l.fase, l.situacao])).toEqual([
      ['a', 'PUBLICADO', 'SUSPENSA'],
      ['b', 'HOMOLOGACAO', 'REVOGADA'],
      ['c', 'ACOLHIMENTO_PROPOSTAS', 'ATIVA'],
    ]);
    expect(db.linhas[0].observacoes).toBe('Suspenso: impugnação'); // preservada
    expect(db.historico).toHaveLength(2);
    expect(db.historico[0]).toEqual(
      expect.arrayContaining(['a', 'SUSPENSO', 'PUBLICADO', 'SUSPENSA', 'MIGRACAO_SITUACAO']),
    );

    const r2 = await migrarSituacaoLegada(db, agora);
    expect(r2).toEqual({ encontradas: 0, migradas: 0, detalhes: [] });
    expect(db.historico).toHaveLength(2);
  });

  test('corrida: se outra execução migrou a linha entre o SELECT e o UPDATE, não duplica', async () => {
    const db = bancoFalso([{ id: 'a', fase: 'ANULADO', situacao: 'ATIVA' }]);
    const original = db.query.bind(db);
    db.query = async (sql: string, params: any[] = []) => {
      const r = await original(sql, params);
      if (/^\s*SELECT/i.test(sql)) db.linhas[0].fase = 'PLANEJAMENTO'; // a "outra" execução
      return r;
    };
    const r = await migrarSituacaoLegada(db);
    expect(r.migradas).toBe(0);
    expect(db.historico).toHaveLength(0);
  });
});
