import {
  ehFluxoDeInstrucao, errosDaInstrucao, fundamentoDaDefinicao, lerDefinicao, pendenciasDaDefinicao, proximoNumeroDaModalidade, rotuloDaDefinicao, textoDoDespacho,
} from './definicao-modalidade';

const justificativa = 'Conforme o ETP, capacitação de agente público com empresa de notória especialização.';

describe('pendenciasDaDefinicao', () => {
  it('modalidade, enquadramento da modalidade e justificativa', () => {
    expect(pendenciasDaDefinicao(lerDefinicao({ modalidade: 'inexigibilidade', fundamento: 'art74_iii_f', justificativa }))).toEqual([]);
    expect(pendenciasDaDefinicao(lerDefinicao({}))).toHaveLength(2);
    expect(pendenciasDaDefinicao(lerDefinicao({ modalidade: 'INEXIGIBILIDADE', fundamento: 'ART75_II', justificativa }))[0]).toMatch(/não se aplica/);
    expect(pendenciasDaDefinicao(lerDefinicao({ modalidade: 'PREGAO_ELETRONICO', justificativa: 'curta' }))[0]).toMatch(/justificativa/);
  });

  it('sem enquadramento vale o padrão da modalidade', () => {
    expect(fundamentoDaDefinicao(lerDefinicao({ modalidade: 'DISPENSA_ELETRONICA' }))).toBe('ART75_II');
    expect(fundamentoDaDefinicao(lerDefinicao({ modalidade: 'DISPENSA_ELETRONICA' }), 'OBRA')).toBe('ART75_I');
    expect(fundamentoDaDefinicao(lerDefinicao({ modalidade: 'INEXIGIBILIDADE', fundamento: 'ART74_I' }))).toBe('ART74_I');
  });
});

describe('número e despacho', () => {
  it('próximo número da modalidade no ano', () => {
    expect(proximoNumeroDaModalidade(['032/2026', '033/2026', '038/2026', '010/2025', null, 'X'], 2026)).toBe('039/2026');
    expect(proximoNumeroDaModalidade([], 2026)).toBe('001/2026');
  });

  it('texto do despacho cita modalidade, fundamento, número e justificativa', () => {
    const d = lerDefinicao({ modalidade: 'INEXIGIBILIDADE', fundamento: 'ART74_III_F', justificativa });
    const t = textoDoDespacho(d, 'ART74_III_F', '034/2026');
    expect(t).toContain('Inexigibilidade');
    expect(t).toContain('art. 74, III, "f"');
    expect(t).toContain('Inexigibilidade nº 034/2026');
    expect(t).toContain(justificativa);
    expect(rotuloDaDefinicao('INEXIGIBILIDADE', 'ART74_III_F')).toBe('Inexigibilidade · art. 74, III, "f"');
  });
});

describe('fluxo de instrução', () => {
  it('é o que tem a Definição da modalidade, sempre por último e uma só vez', () => {
    expect(ehFluxoDeInstrucao(['DFD', 'ETP', 'DEFINICAO_MODALIDADE'])).toBe(true);
    expect(ehFluxoDeInstrucao(['DFD', 'PARECER_JURIDICO'])).toBe(false);
    expect(errosDaInstrucao(['DFD', 'DEFINICAO_MODALIDADE'])).toEqual([]);
    expect(errosDaInstrucao(['DEFINICAO_MODALIDADE', 'PARECER_JURIDICO'])[0]).toMatch(/última etapa/);
    expect(errosDaInstrucao(['DEFINICAO_MODALIDADE', 'DEFINICAO_MODALIDADE'])[0]).toMatch(/mais de uma vez/);
  });
});
