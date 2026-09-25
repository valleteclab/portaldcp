import {
  EtapaSessao,
  StatusSessao,
} from '../sessao/entities/sessao-disputa.entity';
import {
  inferirModoDisputaV3,
  mapearEtapaSessaoV3,
  mapearStatusSessaoV3,
  montarCronometriaSessaoV3,
  mapearItemBoardV3,
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

  it('modos hibridos rodam no motor unico (sem fluxo paralelo) com os padroes da IN 73 art. 24', () => {
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
    expect(cronometria.requerFluxoEspecificoNaV3).toBe(false);
    expect(cronometria.observacao).not.toMatch(/V2/);
    // etapa aberta 15 min e aleatorio limitado a 10 min (art. 24 caput e §1º)
    expect(cronometria.etapaAbertaMinutos).toBe(15);
    expect(cronometria.fechamentoIminenteAleatorioMaxMinutos).toBe(10);
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

  it('o modo da LICITACAO prevalece sobre os flags legados da sessao', () => {
    expect(inferirModoDisputaV3({ modo_aberto: true, modo_aberto_fechado: false }, 'FECHADO_ABERTO')).toBe('FECHADO_ABERTO');
    expect(inferirModoDisputaV3({ modo_aberto: true, modo_aberto_fechado: false }, 'X')).toBe('ABERTO');
  });

  it('item em tempo aleatorio nunca expõe o tempo restante; etapa fechada vira LANCE_FECHADO', () => {
    const base: any = {
      id: 'i', numero: 1, descricao: '', quantidade: 1, unidade: 'UN', valorReferencia: 100, valorReferenciaUnitario: 100,
      baseLance: 'TOTAL_ITEM', status: 'EM_DISPUTA', tempoRestante: 321, emProrrogacao: false, totalPropostas: 3, totalLances: 5,
    };
    const aleatorio = mapearItemBoardV3({ ...base, faseModo: 'ALEATORIO', tempoOculto: true });
    expect(aleatorio.cronometro).toEqual({ tempoRestanteSegundos: 0, fase: 'TEMPO_ALEATORIO', oculto: true });
    const fechada = mapearItemBoardV3({ ...base, faseModo: 'FECHADA', tempoRestante: 200, meuLanceFechado: 90 });
    expect(fechada.cronometro.fase).toBe('LANCE_FECHADO');
    expect(fechada.cronometro.tempoRestanteSegundos).toBe(200);
    expect(fechada.meuLanceFechado).toBe(90);
  });
});
