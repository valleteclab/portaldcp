import { resolverParametrosDisputa, valoresIniciaisDaSessao } from './parametros-disputa';
import { BaseLance } from './modelo-lance';

/** Resolvedor único: sessão → licitação → órgão → sistema → padrão legal. */
describe('resolverParametrosDisputa', () => {
  const sistema = {
    tempo_inatividade_minutos: 10,
    tempo_prorrogacao_minutos: 2,
    intervalo_minimo_lances_minutos: 0,
    cancelamento_direto_segundos: 15,
    percentual_reinicio_disputa: '5.00',
    tempo_aleatorio_min_minutos: 2,
    tempo_aleatorio_max_minutos: 30,
  };

  it('sem nada: padrões legais (IN 73 art. 23 e art. 21 §3º; Lei art. 56 §4º); intervalo de tempo desligado', () => {
    const p = resolverParametrosDisputa({});
    expect(p).toMatchObject({
      tempoInicialMinutos: 10,
      prorrogacaoMinutos: 2,
      intervaloProprioSegundos: 0,
      cancelamentoDiretoSegundos: 15,
      percentualReinicioDisputa: 5,
      diferencaMinima: null,
      baseLance: BaseLance.TOTAL_ITEM,
    });
  });

  it('órgão sobrepõe o sistema; licitação sobrepõe o órgão; NULL da licitação herda', () => {
    const orgao = { ...sistema, tempo_inatividade_minutos: 15, intervalo_minimo_lances_minutos: 1, cancelamento_direto_segundos: 20 };
    const p = resolverParametrosDisputa({
      sistema,
      orgao,
      licitacao: { tempo_inatividade: 12, intervalo_minimo_lances: null, tempo_prorrogacao: null },
    });
    expect(p.tempoInicialMinutos).toBe(12);
    expect(p.intervaloProprioSegundos).toBe(60);
    expect(p.prorrogacaoMinutos).toBe(2);
    expect(p.cancelamentoDiretoSegundos).toBe(20);
  });

  it('a sessão (cópia ajustável pelo pregoeiro) tem precedência nos tempos', () => {
    const p = resolverParametrosDisputa({
      sistema,
      licitacao: { tempo_inatividade: 12 },
      sessao: { tempo_inatividade_minutos: 11, tempo_prorrogacao_minutos: 3, intervalo_minimo_lances_minutos: 0 },
    });
    expect(p).toMatchObject({ tempoInicialMinutos: 11, prorrogacaoMinutos: 3, intervaloProprioSegundos: 0 });
  });

  it('diferença mínima e base vêm do edital (licitação)', () => {
    const p = resolverParametrosDisputa({
      sistema,
      licitacao: { diferenca_minima_lances: '5.00', tipo_diferenca_minima_lances: 'PERCENTUAL', base_lance: 'UNITARIO' },
    });
    expect(p.diferencaMinima).toEqual({ tipo: 'PERCENTUAL', valor: 5 });
    expect(p.baseLance).toBe(BaseLance.UNITARIO);
  });

  it('valores iniciais da sessão: licitação → órgão → sistema (sem a sessão)', () => {
    expect(valoresIniciaisDaSessao({ sistema, licitacao: { tempo_prorrogacao: 3 } })).toEqual({
      tempo_inatividade_minutos: 10,
      tempo_prorrogacao_minutos: 3,
      intervalo_minimo_lances_minutos: 0,
      tempo_aleatorio_min_minutos: 2,
      tempo_aleatorio_max_minutos: 30,
    });
  });
});
