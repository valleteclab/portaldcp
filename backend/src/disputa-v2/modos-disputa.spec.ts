import {
  calcularRelogioModo,
  desconexaoExcedida,
  direcaoDoCriterio,
  motivoModoCriterioInvalido,
  motivoRetomadaInvalida,
  percentualFaixa,
  selecionarClassificados,
  sortearTempoAleatorioSegundos,
} from './modos-disputa';
import { LanceRecusado, OrigemLance, validarLance, ContextoValidacaoLance } from './modelo-lance';
import { ModoDisputaService } from './modo-disputa.service';

const MIN = 60_000;

describe('modos de disputa — modo × critério (Lei 14.133 art. 56 §§1º-2º)', () => {
  test('FECHADO isolado é vedado com menor preço e maior desconto (§1º)', () => {
    expect(motivoModoCriterioInvalido('FECHADO', 'MENOR_PRECO')).toMatch(/art\. 56 §1º/);
    expect(motivoModoCriterioInvalido('FECHADO', 'MAIOR_DESCONTO')).toMatch(/art\. 56 §1º/);
    expect(motivoModoCriterioInvalido('FECHADO', 'TECNICA_E_PRECO')).toBeNull();
    expect(motivoModoCriterioInvalido('FECHADO', 'MELHOR_TECNICA')).toBeNull();
  });
  test('ABERTO é vedado com técnica e preço (§2º)', () => {
    expect(motivoModoCriterioInvalido('ABERTO', 'TECNICA_E_PRECO')).toMatch(/art\. 56 §2º/);
    expect(motivoModoCriterioInvalido('ABERTO_FECHADO', 'TECNICA_E_PRECO')).toBeNull();
    expect(motivoModoCriterioInvalido('FECHADO_ABERTO', 'TECNICA_E_PRECO')).toBeNull();
  });
  test('combinações comuns são permitidas; modo ausente = ABERTO', () => {
    for (const m of ['ABERTO', 'ABERTO_FECHADO', 'FECHADO_ABERTO']) {
      expect(motivoModoCriterioInvalido(m, 'MENOR_PRECO')).toBeNull();
      expect(motivoModoCriterioInvalido(m, 'MAIOR_DESCONTO')).toBeNull();
    }
    expect(motivoModoCriterioInvalido(undefined, 'TECNICA_E_PRECO')).toMatch(/§2º/);
    expect(motivoModoCriterioInvalido('ABERTO', 'MAIOR_LANCE')).toBeNull();
  });
  test('direção por critério: só maior lance é decrescente; maior desconto guarda o preço (crescente)', () => {
    expect(direcaoDoCriterio('MENOR_PRECO')).toBe('MENOR');
    expect(direcaoDoCriterio('MAIOR_DESCONTO')).toBe('MENOR');
    expect(direcaoDoCriterio('MAIOR_LANCE')).toBe('MAIOR');
  });
});

describe('classificação para a etapa seguinte (IN 73 arts. 24 §§2º/4º e 25)', () => {
  const o = (fornecedorId: string, valor: number, t = 0) => ({ fornecedorId, valor, registradoEm: t });

  test('melhor + até 10% acima (menor preço) — 4 na faixa, 1 fora', () => {
    const r = selecionarClassificados([o('A', 100), o('B', 105), o('C', 110), o('D', 109.99), o('E', 110.01)], { percentual: 10 });
    expect(r.classificados).toEqual(['A', 'B', 'D', 'C']);
    expect(r.naFaixa).toBe(4);
    expect(r.completadoPeloMinimo).toBe(false);
    expect(r.limiteFaixa).toBe(110);
  });

  test('menos de 3 na faixa → os melhores seguintes até completar 3 (mínimo)', () => {
    const r = selecionarClassificados([o('A', 100), o('B', 150), o('C', 120), o('D', 200)], { percentual: 10 });
    expect(r.classificados).toEqual(['A', 'C', 'B']);
    expect(r.naFaixa).toBe(1);
    expect(r.completadoPeloMinimo).toBe(true);
  });

  test('empate no corte do mínimo: todos os empatados entram', () => {
    const r = selecionarClassificados([o('A', 100), o('B', 150), o('C', 150, 5), o('D', 150, 9), o('E', 200)], { percentual: 10 });
    expect(r.classificados).toEqual(['A', 'B', 'C', 'D']);
  });

  test('empate na borda da faixa também entra (e a faixa já tem 3)', () => {
    const r = selecionarClassificados([o('A', 100), o('B', 101), o('C', 110), o('D', 110, 3)], { percentual: 10 });
    expect(r.classificados).toEqual(['A', 'B', 'C', 'D']);
  });

  test('margem de preferência → 20%', () => {
    expect(percentualFaixa(false)).toBe(10);
    expect(percentualFaixa(true)).toBe(20);
    const r = selecionarClassificados([o('A', 100), o('B', 115), o('C', 119), o('D', 121), o('E', 125)], { percentual: percentualFaixa(true) });
    expect(r.classificados).toEqual(['A', 'B', 'C']);
    expect(r.naFaixa).toBe(3);
  });

  test('menos de 3 licitantes no total → todos', () => {
    expect(selecionarClassificados([o('A', 100), o('B', 300)], { percentual: 10 }).classificados).toEqual(['A', 'B']);
  });

  test('uma oferta por licitante (a melhor dele) e ordem por registro no empate', () => {
    const r = selecionarClassificados([o('A', 120), o('A', 100), o('B', 100, 5), o('C', 130)], { percentual: 10 });
    expect(r.classificados).toEqual(['A', 'B', 'C']);
  });

  test('maior lance (direção MAIOR): até 10% abaixo do melhor', () => {
    const r = selecionarClassificados([o('A', 1000), o('B', 950), o('C', 899), o('D', 900)], { percentual: 10, direcao: 'MAIOR' });
    expect(r.classificados).toEqual(['A', 'B', 'D']);
  });

  test('maior desconto: faixa medida no DESCONTO (até 10% inferior ao melhor desconto)', () => {
    // referência 100: A = 20% de desconto; faixa ≥ 18% → preço ≤ 82
    const r = selecionarClassificados([o('A', 80), o('B', 82), o('C', 83), o('D', 88)], {
      percentual: 10,
      criterio: 'MAIOR_DESCONTO',
      referencia: 100,
    });
    expect(r.naFaixa).toBe(2);
    expect(r.classificados).toEqual(['A', 'B', 'C']); // completado pelo mínimo de 3
    expect(r.limiteFaixa).toBe(82);
  });
});

describe('tempo aleatório (IN 73 art. 24 §1º — até 10 minutos)', () => {
  test('nunca passa de 10 min, mesmo com máximo configurado maior', () => {
    expect(sortearTempoAleatorioSegundos(2, 30, () => 0.999999)).toBe(600);
    expect(sortearTempoAleatorioSegundos(2, 30, () => 0)).toBe(120);
  });
  test('respeita o intervalo configurado dentro do teto', () => {
    const v = sortearTempoAleatorioSegundos(1, 3, () => 0.5);
    expect(v).toBeGreaterThanOrEqual(60);
    expect(v).toBeLessThanOrEqual(180);
  });
  test('mínimo maior que o máximo é ajustado', () => {
    expect(sortearTempoAleatorioSegundos(20, 5, () => 0.3)).toBe(300);
  });
});

describe('relógio por modo', () => {
  const agora = Date.parse('2026-09-24T12:00:00Z');
  const base = {
    tempoInicialMinutos: 10,
    prorrogacaoMinutos: 2,
    etapaAbertaHibridaMinutos: 15,
    agora,
  };

  test('aberto: art. 23 (10 min + prorrogação) e encerra ao zerar', () => {
    const r = calcularRelogioModo({
      ...base, modo: 'ABERTO', fase: null, status: 'EM_DISPUTA',
      disputaIniciadaEm: new Date(agora - 9 * MIN), ultimoLanceEm: new Date(agora - 10_000),
    });
    expect(r.fase).toBe('PRORROGACAO');
    expect(r.restanteSegundos).toBe(110);
    expect(r.aoExpirar).toBe('ENCERRAR');
  });

  test('aberto-fechado: etapa aberta FIXA de 15 min — lance no fim NÃO prorroga; ao zerar inicia o aleatório', () => {
    const r = calcularRelogioModo({
      ...base, modo: 'ABERTO_FECHADO', fase: 'ABERTA', status: 'EM_DISPUTA',
      disputaIniciadaEm: new Date(agora - 14 * MIN), ultimoLanceEm: new Date(agora - 1000),
    });
    expect(r.fase).toBe('ETAPA_ABERTA');
    expect(r.restanteSegundos).toBe(60);
    expect(r.emProrrogacao).toBe(false);
    const fim = calcularRelogioModo({
      ...base, modo: 'ABERTO_FECHADO', fase: 'ABERTA', status: 'EM_DISPUTA',
      disputaIniciadaEm: new Date(agora - 15 * MIN), ultimoLanceEm: new Date(agora - 1000),
    });
    expect(fim.expirado).toBe(true);
    expect(fim.aoExpirar).toBe('INICIAR_ALEATORIO');
  });

  test('tempo aleatório: restante OCULTO (0) e, ao zerar, abre a etapa fechada', () => {
    const r = calcularRelogioModo({
      ...base, modo: 'ABERTO_FECHADO', fase: 'ALEATORIO', status: 'TEMPO_ALEATORIO',
      disputaIniciadaEm: null, ultimoLanceEm: null,
      inicioAleatorio: new Date(agora - 60_000), aleatorioSorteadoSegundos: 300,
    });
    expect(r.oculto).toBe(true);
    expect(r.restanteSegundos).toBe(0);
    expect(r.expirado).toBe(false);
    expect(r.fase).toBe('TEMPO_ALEATORIO');
    const fim = calcularRelogioModo({
      ...base, modo: 'ABERTO_FECHADO', fase: 'ALEATORIO', status: 'TEMPO_ALEATORIO',
      disputaIniciadaEm: null, ultimoLanceEm: null,
      inicioAleatorio: new Date(agora - 301_000), aleatorioSorteadoSegundos: 300,
    });
    expect(fim.expirado).toBe(true);
    expect(fim.aoExpirar).toBe('INICIAR_FECHADA');
  });

  test('etapa fechada: prazo próprio e encerra ao zerar', () => {
    const r = calcularRelogioModo({
      ...base, modo: 'ABERTO_FECHADO', fase: 'FECHADA', status: 'EM_DISPUTA',
      disputaIniciadaEm: new Date(agora - 30 * MIN), ultimoLanceEm: null, fimFaseEm: new Date(agora + 4 * MIN),
    });
    expect(r.fase).toBe('LANCE_FECHADO');
    expect(r.restanteSegundos).toBe(240);
    expect(r.aoExpirar).toBe('ENCERRAR');
  });

  test('fechado-aberto e reinício usam o art. 23', () => {
    for (const fase of ['ABERTA', 'REINICIO_DEMAIS'] as const) {
      const r = calcularRelogioModo({
        ...base, modo: 'FECHADO_ABERTO', fase, status: 'EM_DISPUTA',
        disputaIniciadaEm: new Date(agora - 2 * MIN), ultimoLanceEm: new Date(agora - 2 * MIN),
      });
      expect(r.fase).toBe('ETAPA_ABERTA');
      expect(r.restanteSegundos).toBe(8 * 60);
    }
  });
});

describe('sigilo do lance fechado nas leituras', () => {
  test('lance fechado só aparece com o item encerrado', () => {
    expect(ModoDisputaService.lanceVisivel('LANCE_FECHADO', 'EM_DISPUTA')).toBe(false);
    expect(ModoDisputaService.lanceVisivel('LANCE_FECHADO', 'TEMPO_ALEATORIO')).toBe(false);
    expect(ModoDisputaService.lanceVisivel('LANCE_FECHADO', 'ENCERRADO')).toBe(true);
    expect(ModoDisputaService.lanceVisivel('LANCE', 'EM_DISPUTA')).toBe(true);
  });
});

describe('desconexão do agente (IN 73 art. 27)', () => {
  test('suspende só depois de MAIS de 10 min', () => {
    const t = Date.now();
    expect(desconexaoExcedida(t - 10 * MIN, t)).toBe(false);
    expect(desconexaoExcedida(t - 10 * MIN - 1, t)).toBe(true);
    expect(desconexaoExcedida(null, t)).toBe(false);
  });
  test('retomada só 24 h após a comunicação', () => {
    const c = new Date('2026-09-24T12:00:00Z');
    expect(motivoRetomadaInvalida(new Date('2026-09-25T11:59:00Z'), c)).toMatch(/24 horas/);
    expect(motivoRetomadaInvalida(new Date('2026-09-25T12:00:00Z'), c)).toBeNull();
  });
});

describe('validação do lance por modo (modelo-lance)', () => {
  const ctx = (over: Partial<ContextoValidacaoLance>): ContextoValidacaoLance => ({
    origem: OrigemLance.LANCE_FECHADO,
    valor: 90,
    statusItem: 'EM_DISPUTA',
    sessaoSuspensa: false,
    propostaNaBase: 100,
    meuUltimo: { valor: 95, origem: OrigemLance.LANCE, criadoEm: new Date() },
    melhor: { valor: 80, fornecedorId: 'x' },
    valoresDeOutros: [90],
    diferencaMinima: null,
    intervaloProprioSegundos: 0,
    agora: new Date(),
    ...over,
  });
  const codigo = (f: () => void) => {
    try {
      f();
      return null;
    } catch (e) {
      return (e as LanceRecusado).codigo;
    }
  };

  test('lance fechado: precisa melhorar o próprio último; valores iguais a outros NÃO são recusados (sigilo)', () => {
    expect(codigo(() => validarLance(ctx({})))).toBeNull();
    expect(codigo(() => validarLance(ctx({ valor: 95 })))).toBe('FECHADO_NAO_MELHORA');
    expect(codigo(() => validarLance(ctx({ statusItem: 'ENCERRADO' })))).toBe('FECHADO_FORA_DO_PRAZO');
    expect(codigo(() => validarLance(ctx({ propostaNaBase: null })))).toBe('SEM_PROPOSTA');
    expect(codigo(() => validarLance(ctx({ valor: 94.5, diferencaMinima: { tipo: 'VALOR', valor: 1 } })))).toBe('DIFERENCA_MINIMA');
  });

  test('direção MAIOR (maior lance): sobe sobre o próprio e cobre o melhor com a diferença mínima', () => {
    const maior = (over: Partial<ContextoValidacaoLance>) =>
      ctx({ origem: OrigemLance.LANCE, direcao: 'MAIOR', propostaNaBase: 100, meuUltimo: null, melhor: { valor: 120, fornecedorId: 'x' }, valoresDeOutros: [120], ...over });
    expect(codigo(() => validarLance(maior({ valor: 130 })))).toBeNull();
    expect(codigo(() => validarLance(maior({ valor: 99 })))).toBe('ABAIXO_DA_PROPOSTA');
    expect(codigo(() => validarLance(maior({ valor: 120 })))).toBe('IGUAL_AO_MELHOR');
    expect(codigo(() => validarLance(maior({ valor: 103, melhor: null, valoresDeOutros: [], diferencaMinima: { tipo: 'VALOR', valor: 5 } })))).toBe('DIFERENCA_MINIMA');
    expect(codigo(() => validarLance(maior({ valor: 122, meuUltimo: { valor: 110, origem: OrigemLance.LANCE, criadoEm: new Date() }, diferencaMinima: { tipo: 'VALOR', valor: 5 } })))).toBe('DIFERENCA_MINIMA_MELHOR');
  });
});
