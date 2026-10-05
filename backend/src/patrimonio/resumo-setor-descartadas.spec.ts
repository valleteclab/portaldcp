import { leituraContaNoRelatorio } from './confirmacao-presenca.util';
import { SituacaoLeitura } from './entities/enums';

/**
 * Regressão: a leitura negada pelo conferente ("não está nesta sala") não pode
 * entrar na contagem de divergências do setor.
 *
 * O furo que isto trava: a regra existia e estava testada, mas o resumo do
 * setor contava TODAS as leituras por situação, sem passar por ela. Resultado
 * em produção: um bem lido através da parede e negado continuava saindo como
 * divergência, e a comissão receberia uma transferência que ninguém pediu.
 */
describe('resumo do setor: leitura negada fica fora da contagem', () => {
  type L = { id: string; situacao: SituacaoLeitura; presenca_confirmada: boolean | null };

  /** A mesma conta do resumoDoSetor, isolada. */
  const contar = (leituras: L[]) => {
    const valem = leituras.filter((l) => leituraContaNoRelatorio(l));
    const cont = (sit: SituacaoLeitura) => valem.filter((l) => l.situacao === sit).length;
    return {
      outro_setor: cont(SituacaoLeitura.OUTRO_SETOR),
      desconhecidos: cont(SituacaoLeitura.DESCONHECIDO),
      baixados_presentes: cont(SituacaoLeitura.BAIXADO_PRESENTE),
      descartadas: leituras.length - valem.length,
      leituras: valem.length,
    };
  };

  it('o caso real: 1357 confirmado, 1360 negado pela parede', () => {
    const r = contar([
      { id: '1688', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: null },
      { id: '1357', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: true },
      { id: '1360', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: false },
    ]);
    expect(r.outro_setor).toBe(1); // só o 1357 vira transferência
    expect(r.descartadas).toBe(1);
    expect(r.leituras).toBe(2);
  });

  it('desconhecido negado também sai da conta', () => {
    const r = contar([
      { id: 'a', situacao: SituacaoLeitura.DESCONHECIDO, presenca_confirmada: true },
      { id: 'b', situacao: SituacaoLeitura.DESCONHECIDO, presenca_confirmada: false },
      { id: 'c', situacao: SituacaoLeitura.BAIXADO_PRESENTE, presenca_confirmada: false },
    ]);
    expect(r.desconhecidos).toBe(1);
    expect(r.baixados_presentes).toBe(0);
    expect(r.descartadas).toBe(2);
  });

  it('sem resposta ainda, a leitura continua contando (o fechamento é que trava)', () => {
    const r = contar([{ id: 'x', situacao: SituacaoLeitura.OUTRO_SETOR, presenca_confirmada: null }]);
    expect(r.outro_setor).toBe(1);
    expect(r.descartadas).toBe(0);
  });

  it('leitura da própria sala nunca é descartada', () => {
    const r = contar([
      { id: 'p', situacao: SituacaoLeitura.ENCONTRADO, presenca_confirmada: null },
      { id: 'q', situacao: SituacaoLeitura.SEM_PLAQUETA, presenca_confirmada: null },
    ]);
    expect(r.descartadas).toBe(0);
    expect(r.leituras).toBe(2);
  });
});
