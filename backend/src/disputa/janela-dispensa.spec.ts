import { calcularRelogioJanela, prorrogacaoDaJanela } from './relogio-disputa';
import { ContextoValidacaoLance, LanceRecusado, OrigemLance, validarLance, valorAtualNaJanela } from './modelo-lance';

/** Janela de lances da dispensa (IN SEGES 67/2021) — relógio e regra do lance, funções puras. */
describe('janela da dispensa — relógio único', () => {
  const t0 = new Date('2026-09-25T12:00:00Z').getTime();
  const min = 60_000;

  it('aberta entre início e fim; encerrada depois do fim; sem janela = nem aberta nem encerrada', () => {
    const e = { inicio: new Date(t0), fim: new Date(t0 + 30 * min) };
    expect(calcularRelogioJanela({ ...e, agora: t0 + min })).toMatchObject({ aberta: true, encerrada: false, restanteSegundos: 29 * 60 });
    expect(calcularRelogioJanela({ ...e, agora: t0 + 30 * min })).toMatchObject({ aberta: false, encerrada: true });
    expect(calcularRelogioJanela({ inicio: null, fim: null, agora: t0 })).toMatchObject({ aberta: false, encerrada: false });
    expect(calcularRelogioJanela({ ...e, agora: t0 - 1 })).toMatchObject({ aberta: false, encerrada: false });
  });

  it('prorrogação: só com P > 0 e lance nos últimos P minutos; novo fim = agora + P', () => {
    const fim = new Date(t0 + 30 * min);
    expect(prorrogacaoDaJanela({ fim, prorrogacaoMinutos: 0, agora: t0 + 29 * min })).toBeNull();
    expect(prorrogacaoDaJanela({ fim, prorrogacaoMinutos: 2, agora: t0 + 27 * min })).toBeNull();
    expect(prorrogacaoDaJanela({ fim, prorrogacaoMinutos: 2, agora: t0 + 29 * min })?.getTime()).toBe(t0 + 31 * min);
    expect(prorrogacaoDaJanela({ fim, prorrogacaoMinutos: 2, agora: t0 + 30 * min })).toBeNull(); // já fechou
  });
});

describe('janela da dispensa — validarLance (origem JANELA_DISPENSA)', () => {
  const base: ContextoValidacaoLance = {
    origem: OrigemLance.JANELA_DISPENSA,
    valor: 90,
    statusItem: 'EM_DISPUTA',
    sessaoSuspensa: false,
    propostaNaBase: 95,
    meuUltimo: null,
    melhor: { valor: 80, fornecedorId: 'outro' },
    valoresDeOutros: [80, 90],
    diferencaMinima: null,
    intervaloProprioSegundos: 0,
    agora: new Date(),
    janelaAberta: true,
  };
  const recusa = (c: Partial<ContextoValidacaoLance>) => {
    try {
      validarLance({ ...base, ...c });
      return null;
    } catch (e) {
      return e as LanceRecusado;
    }
  };

  it('aceita reduzir o próprio valor mesmo acima do melhor e igual ao de outro licitante (IN 67)', () => {
    expect(recusa({})).toBeNull();
  });

  it('janela fechada → estado (409)', () => {
    expect(recusa({ janelaAberta: false })).toMatchObject({ codigo: 'JANELA_FECHADA', estado: true });
  });

  it('valor inválido, sem proposta, igual/maior que o próprio valor → 400', () => {
    expect(recusa({ valor: 0 })).toMatchObject({ codigo: 'VALOR_INVALIDO', message: 'Valor de lance inválido' });
    expect(recusa({ valor: 1.23456 })).toMatchObject({ codigo: 'VALOR_INVALIDO' });
    expect(recusa({ propostaNaBase: null })).toMatchObject({ codigo: 'SEM_PROPOSTA' });
    expect(recusa({ valor: 95 })).toMatchObject({ codigo: 'ACIMA_DO_PROPRIO' });
    expect(recusa({ valor: 90, meuUltimo: { valor: 90, origem: OrigemLance.JANELA_DISPENSA, criadoEm: new Date() } })).toMatchObject({
      codigo: 'ACIMA_DO_PROPRIO',
    });
  });

  it('diferença mínima do aviso (se houver) vale em relação ao próprio valor', () => {
    expect(recusa({ valor: 94.5, diferencaMinima: { tipo: 'VALOR', valor: 1 } })).toMatchObject({ codigo: 'DIFERENCA_MINIMA' });
    expect(recusa({ valor: 94, diferencaMinima: { tipo: 'VALOR', valor: 1 } })).toBeNull();
  });

  it('valor atual = menor entre proposta e próprios lances', () => {
    expect(valorAtualNaJanela(95, [])).toBe(95);
    expect(valorAtualNaJanela(95, [93, 91.5])).toBe(91.5);
  });
});
