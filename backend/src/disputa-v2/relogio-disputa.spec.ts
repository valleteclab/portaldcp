import { calcularRelogio } from './relogio-disputa';

/**
 * Fórmula ÚNICA do tempo restante (IN SEGES 73/2022 art. 23: 10 min +
 * prorrogações sucessivas de 2 min; TEMPO_ALEATORIO como gancho dos modos).
 */
describe('calcularRelogio', () => {
  const agora = Date.parse('2026-09-25T12:00:00Z');
  const MIN = 60_000;
  const aberto = (inicioHaMs: number, ultimoHaMs?: number, tempoInicialMinutos = 10, prorrogacaoMinutos = 2) =>
    calcularRelogio({
      status: 'EM_DISPUTA',
      disputaIniciadaEm: new Date(agora - inicioHaMs),
      ultimoLanceEm: ultimoHaMs === undefined ? null : new Date(agora - ultimoHaMs),
      tempoInicialMinutos,
      prorrogacaoMinutos,
      agora,
    });

  it('sem lance, dentro do tempo inicial: conta o tempo inicial', () => {
    const r = aberto(1 * MIN);
    expect(r.restanteSegundos).toBe(540);
    expect(r.fase).toBe('ETAPA_ABERTA');
    expect(r.emProrrogacao).toBe(false);
    expect(r.expirado).toBe(false);
  });

  it('lance fora da janela final: segue no tempo inicial', () => {
    expect(aberto(3 * MIN, 1 * MIN).restanteSegundos).toBe(420);
  });

  it('lance nos últimos 2 min do tempo inicial: prorroga 2 min a partir do lance', () => {
    const r = aberto(9 * MIN, 30_000);
    expect(r.restanteSegundos).toBe(90);
    expect(r.fase).toBe('PRORROGACAO');
    expect(r.emProrrogacao).toBe(true);
  });

  it('sem lance nos 2 min finais, encerra ao fim do tempo inicial', () => {
    const r = aberto(10 * MIN + 5_000, 10 * MIN + 5_000);
    expect(r.expirado).toBe(true);
    expect(r.restanteSegundos).toBe(0);
    expect(r.fase).toBe('ENCERRADO');
  });

  it('aos 9min30s sem lance: restam 30 s da etapa inicial', () => {
    expect(aberto(9.5 * MIN, 9.5 * MIN).restanteSegundos).toBe(30);
  });

  it('prorrogação expirada', () => expect(aberto(12 * MIN, 3 * MIN).expirado).toBe(true));

  it('cada lance reinicia a prorrogação (sucessiva)', () => expect(aberto(15 * MIN, 10_000).restanteSegundos).toBe(110));

  it('respeita os parâmetros (tempo inicial de 5 min)', () => expect(aberto(1 * MIN, undefined, 5).restanteSegundos).toBe(240));

  it('item fora de disputa: sem relógio e não expira', () => {
    const r = calcularRelogio({ status: 'ENCERRADO', disputaIniciadaEm: null, ultimoLanceEm: null, tempoInicialMinutos: 10, prorrogacaoMinutos: 2, agora });
    expect(r).toMatchObject({ restanteSegundos: 0, expirado: false, fase: 'ENCERRADO' });
  });

  it('TEMPO_ALEATORIO (gancho dos modos): encerra no fim do tempo sorteado', () => {
    const base = { status: 'TEMPO_ALEATORIO', disputaIniciadaEm: null, ultimoLanceEm: null, tempoInicialMinutos: 10, prorrogacaoMinutos: 2, agora };
    const corrente = calcularRelogio({ ...base, inicioTempoAleatorio: new Date(agora - 60_000), tempoAleatorioSorteadoSegundos: 300 });
    expect(corrente).toMatchObject({ fase: 'TEMPO_ALEATORIO', restanteSegundos: 240, expirado: false });
    const acabou = calcularRelogio({ ...base, inicioTempoAleatorio: new Date(agora - 301_000), tempoAleatorioSorteadoSegundos: 300 });
    expect(acabou.expirado).toBe(true);
  });
});
