import {
  EtapaSessao,
  StatusSessao,
} from '../sessao/entities/sessao-disputa.entity';
import {
  inferirModoDisputaV3,
  mapearEtapaSessaoV3,
  mapearStatusSessaoV3,
  montarCronometriaSessaoV3,
} from './disputa-v3.presenter';

describe('disputa-v3.presenter', () => {
  it('infere corretamente os modos de disputa a partir dos flags legados', () => {
    expect(
      inferirModoDisputaV3({ modo_aberto: true, modo_aberto_fechado: false }),
    ).toBe('ABERTO');
    expect(
      inferirModoDisputaV3({ modo_aberto: true, modo_aberto_fechado: true }),
    ).toBe('ABERTO_FECHADO');
    expect(
      inferirModoDisputaV3({ modo_aberto: false, modo_aberto_fechado: true }),
    ).toBe('FECHADO_ABERTO');
    expect(
      inferirModoDisputaV3({ modo_aberto: false, modo_aberto_fechado: false }),
    ).toBe('FECHADO');
  });

  it('normaliza status e etapas para a jornada da V3', () => {
    expect(mapearStatusSessaoV3(StatusSessao.AGUARDANDO_INICIO)).toBe(
      'AGENDADA',
    );
    expect(mapearStatusSessaoV3(StatusSessao.MODO_ABERTO)).toBe('EM_SESSAO');
    expect(mapearStatusSessaoV3(StatusSessao.SUSPENSA)).toBe('SUSPENSA');
    expect(mapearEtapaSessaoV3(EtapaSessao.DISPUTA_LANCES)).toBe('DISPUTA');
    expect(mapearEtapaSessaoV3(EtapaSessao.ANALISE_HABILITACAO)).toBe(
      'HABILITACAO',
    );
    expect(mapearEtapaSessaoV3(EtapaSessao.INTENCAO_RECURSO)).toBe('RECURSOS');
    expect(mapearEtapaSessaoV3(EtapaSessao.HOMOLOGACAO)).toBe('HOMOLOGACAO');
  });

  it('expoe cronometria do modo aberto sem tempo aleatorio como regra principal', () => {
    const cronometria = montarCronometriaSessaoV3({
      modo_aberto: true,
      modo_aberto_fechado: false,
      intervalo_minimo_lances_minutos: 3,
      tempo_inatividade_minutos: 10,
      tempo_prorrogacao_minutos: 2,
      tempo_aleatorio_max_minutos: 30,
      etapa_aberta_minutos_hibrido: null,
      lance_final_fechado_minutos: null,
    });

    expect(cronometria.modo).toBe('ABERTO');
    expect(cronometria.baseLegal).toContain('art. 23');
    expect(cronometria.etapaAbertaMinutos).toBe(10);
    expect(cronometria.janelaGatilhoProrrogacaoMinutos).toBe(2);
    expect(cronometria.duracaoProrrogacaoMinutos).toBe(2);
    expect(cronometria.usaTempoAleatorioNoModoAberto).toBe(false);
    expect(cronometria.requerFluxoEspecificoNaV3).toBe(false);
  });

  it('sinaliza modos hibridos como dependentes de fluxo dedicado na V3', () => {
    const cronometria = montarCronometriaSessaoV3({
      modo_aberto: true,
      modo_aberto_fechado: true,
      intervalo_minimo_lances_minutos: 1,
      tempo_inatividade_minutos: 10,
      tempo_prorrogacao_minutos: 2,
      tempo_aleatorio_max_minutos: 30,
      etapa_aberta_minutos_hibrido: null,
      lance_final_fechado_minutos: null,
    });

    expect(cronometria.modo).toBe('ABERTO_FECHADO');
    expect(cronometria.baseLegal).toContain('art. 24');
    expect(cronometria.requerFluxoEspecificoNaV3).toBe(true);
    // null => fallback para o padrao da IN 73/2022, art. 24
    expect(cronometria.lanceFinalFechadoMinutos).toBe(5);
  });

  it('usa valores configurados na sessao quando disponiveis para modos hibridos', () => {
    const cronometria = montarCronometriaSessaoV3({
      modo_aberto: true,
      modo_aberto_fechado: true,
      intervalo_minimo_lances_minutos: 1,
      tempo_inatividade_minutos: 10,
      tempo_prorrogacao_minutos: 2,
      tempo_aleatorio_max_minutos: 8,
      etapa_aberta_minutos_hibrido: 20,
      lance_final_fechado_minutos: 7,
    });

    expect(cronometria.etapaAbertaMinutos).toBe(20);
    expect(cronometria.lanceFinalFechadoMinutos).toBe(7);
    expect(cronometria.fechamentoIminenteAleatorioMaxMinutos).toBe(8);
  });
});
