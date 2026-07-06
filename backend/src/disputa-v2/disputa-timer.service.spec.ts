import { DisputaTimerService } from './disputa-timer.service';
import { ItemLicitacao } from '../itens/entities/item-licitacao.entity';

/**
 * Testes do cálculo de tempo do Modo Aberto (Lei 14.133/2021, Art. 56, §4º).
 * `calcularTempoRestante` é função pura — não depende de repositórios/WebSocket.
 */
describe('DisputaTimerService.calcularTempoRestante', () => {
  // Só o método puro é exercitado; deps são irrelevantes aqui.
  const service = new DisputaTimerService(
    null as any,
    null as any,
    null as any,
    null as any,
  );

  const TEMPO_INICIAL = 10; // min
  const PRORROGACAO = 2; // min

  function item(parcial: Partial<ItemLicitacao>): ItemLicitacao {
    return parcial as ItemLicitacao;
  }

  it('sem nenhum lance, dentro do tempo inicial: conta regressiva do tempo inicial', () => {
    const agora = Date.now();
    // Disputa começou há 1 minuto, nenhum lance ainda.
    const restante = service.calcularTempoRestante(
      item({
        disputa_iniciada_em: new Date(agora - 60 * 1000),
        ultimo_lance_em: undefined,
      }),
      TEMPO_INICIAL,
      PRORROGACAO,
    );
    // ~9 minutos restantes (540s), com folga de arredondamento.
    expect(restante).toBeGreaterThan(530);
    expect(restante).toBeLessThanOrEqual(540);
  });

  it('lance recente fora da janela de prorrogação: segue no tempo inicial', () => {
    const agora = Date.now();
    // Começou há 3 min; último lance no minuto 2 (longe dos últimos 2 min do inicial).
    const restante = service.calcularTempoRestante(
      item({
        disputa_iniciada_em: new Date(agora - 3 * 60 * 1000),
        ultimo_lance_em: new Date(agora - 60 * 1000),
      }),
      TEMPO_INICIAL,
      PRORROGACAO,
    );
    // Ainda governado pelo tempo inicial: ~7 min restantes.
    expect(restante).toBeGreaterThan(400);
    expect(restante).toBeLessThanOrEqual(420);
  });

  it('lance nos últimos 2 min do tempo inicial: entra em prorrogação (conta a partir do lance)', () => {
    const agora = Date.now();
    // Começou há 9 min; último lance há 30s (dentro dos últimos 2 min do inicial).
    const restante = service.calcularTempoRestante(
      item({
        disputa_iniciada_em: new Date(agora - 9 * 60 * 1000),
        ultimo_lance_em: new Date(agora - 30 * 1000),
      }),
      TEMPO_INICIAL,
      PRORROGACAO,
    );
    // Prorrogação de 2 min desde o último lance → ~1min30 restantes (90s).
    expect(restante).toBeGreaterThan(80);
    expect(restante).toBeLessThanOrEqual(90);
  });

  it('prorrogação expirada (sem lance há mais que a prorrogação): zero', () => {
    const agora = Date.now();
    // Começou há 12 min; último lance há 3 min (> 2 min de prorrogação).
    const restante = service.calcularTempoRestante(
      item({
        disputa_iniciada_em: new Date(agora - 12 * 60 * 1000),
        ultimo_lance_em: new Date(agora - 3 * 60 * 1000),
      }),
      TEMPO_INICIAL,
      PRORROGACAO,
    );
    expect(restante).toBe(0);
  });

  it('cada novo lance reinicia a prorrogação (autossuperação sucessiva)', () => {
    const agora = Date.now();
    const base = item({
      disputa_iniciada_em: new Date(agora - 15 * 60 * 1000),
      ultimo_lance_em: new Date(agora - 10 * 1000), // lance há 10s
    });
    const restante = service.calcularTempoRestante(base, TEMPO_INICIAL, PRORROGACAO);
    // Reinicia os 2 min a cada lance → ~1min50 (110s) restantes.
    expect(restante).toBeGreaterThan(100);
    expect(restante).toBeLessThanOrEqual(110);
  });

  it('respeita parâmetros configuráveis (tempo inicial de 5 min)', () => {
    const agora = Date.now();
    const restante = service.calcularTempoRestante(
      item({
        disputa_iniciada_em: new Date(agora - 60 * 1000),
        ultimo_lance_em: undefined,
      }),
      5, // tempo inicial parametrizado
      PRORROGACAO,
    );
    // 5 min - 1 min = ~4 min (240s).
    expect(restante).toBeGreaterThan(230);
    expect(restante).toBeLessThanOrEqual(240);
  });
});
