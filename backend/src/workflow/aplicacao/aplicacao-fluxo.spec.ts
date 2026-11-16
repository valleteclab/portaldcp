import { cobertura, conflitosDeAplicacao, escolherFluxo, normalizarAplicacao, rotulosDaAplicacao, type FluxoAtivo } from './aplicacao-fluxo';

const fluxo = (id: string, aplicacao: FluxoAtivo['aplicacao']): FluxoAtivo => ({ id, nome: id, versao: 1, aplicacao });

const pequenoValor = fluxo('pequeno-valor', { modalidades: ['DISPENSA_ELETRONICA'], fundamentos: ['ART75_I', 'ART75_II'], padrao: false });
const inex = fluxo('inex', { modalidades: ['INEXIGIBILIDADE'], fundamentos: [], padrao: false });
const licitacao = fluxo('licitacao', { modalidades: ['PREGAO_ELETRONICO', 'CONCORRENCIA'], fundamentos: [], padrao: false });
const padrao = fluxo('padrao', { modalidades: [], fundamentos: [], padrao: true });

describe('escolherFluxo', () => {
  const ativos = [pequenoValor, inex, licitacao, padrao];

  it('enquadramento específico vence', () => {
    expect(escolherFluxo(ativos, 'DISPENSA_ELETRONICA', 'ART75_II')).toEqual({ fluxo: pequenoValor, motivo: 'ENQUADRAMENTO' });
  });

  it('outro inciso da dispensa cai no padrão', () => {
    expect(escolherFluxo(ativos, 'DISPENSA_ELETRONICA', 'ART75_VIII')?.fluxo.id).toBe('padrao');
  });

  it('modalidade inteira', () => {
    expect(escolherFluxo(ativos, 'INEXIGIBILIDADE', 'ART74_III_F')).toEqual({ fluxo: inex, motivo: 'MODALIDADE' });
    expect(escolherFluxo(ativos, 'CONCORRENCIA', 'ART28_II')?.fluxo.id).toBe('licitacao');
  });

  it('sem fluxo próprio nem padrão: nenhum', () => {
    expect(escolherFluxo([pequenoValor], 'LEILAO', 'ART28_IV')).toBeNull();
  });

  it('fluxo antigo, sem "onde vale", vale como padrão', () => {
    const antigo = fluxo('antigo', null);
    expect(escolherFluxo([antigo], 'DISPENSA_ELETRONICA', 'ART75_II')).toEqual({ fluxo: antigo, motivo: 'PADRAO' });
  });

  it('dois no mesmo nível (dado antigo): não escolhe às cegas', () => {
    expect(escolherFluxo([fluxo('a', null), fluxo('b', null)], 'DISPENSA_ELETRONICA', 'ART75_II')).toBeNull();
  });
});

describe('conflitosDeAplicacao', () => {
  it('mesmo inciso em dois fluxos é conflito; incisos diferentes, não', () => {
    expect(conflitosDeAplicacao({ modalidades: ['DISPENSA_ELETRONICA'], fundamentos: ['ART75_II'], padrao: false }, [pequenoValor])).toHaveLength(1);
    expect(conflitosDeAplicacao({ modalidades: ['DISPENSA_ELETRONICA'], fundamentos: ['ART75_VIII'], padrao: false }, [pequenoValor])).toEqual([]);
  });

  it('modalidade inteira x específico convivem (o específico vence)', () => {
    expect(conflitosDeAplicacao({ modalidades: ['DISPENSA_ELETRONICA'], fundamentos: [], padrao: false }, [pequenoValor])).toEqual([]);
  });

  it('modalidade inteira repetida e dois padrões são conflito', () => {
    expect(conflitosDeAplicacao({ modalidades: ['CONCORRENCIA'], fundamentos: [], padrao: false }, [licitacao])[0]).toMatch(/Concorrência já está no fluxo "licitacao"/);
    expect(conflitosDeAplicacao(null, [padrao])[0]).toMatch(/padrão/);
  });
});

describe('normalizarAplicacao', () => {
  it('exige modalidade ou padrão', () => {
    expect(() => normalizarAplicacao({ modalidades: [], padrao: false })).toThrow(/ao menos uma modalidade/);
  });

  it('recusa enquadramento de outra modalidade', () => {
    expect(() => normalizarAplicacao({ modalidades: ['INEXIGIBILIDADE'], fundamentos: ['ART75_II'] })).toThrow(/não pertence/);
  });

  it('limpa repetidos e caixa', () => {
    expect(normalizarAplicacao({ modalidades: ['dispensa_eletronica', 'DISPENSA_ELETRONICA'], fundamentos: ['art75_ii'] })).toEqual({ modalidades: ['DISPENSA_ELETRONICA'], fundamentos: ['ART75_II'], padrao: false });
  });
});

describe('cobertura e rótulos', () => {
  it('linha do enquadramento próprio + "Demais casos" da mesma modalidade', () => {
    const linhas = cobertura([pequenoValor, padrao]).filter((l) => l.modalidade === 'DISPENSA_ELETRONICA');
    expect(linhas.map((l) => [l.enquadramento, l.fluxo?.id, l.motivo])).toEqual([
      ['art. 75, I; art. 75, II', 'pequeno-valor', 'ENQUADRAMENTO'],
      ['Demais casos', 'padrao', 'PADRAO'],
    ]);
  });

  it('sem padrão: modalidade sem fluxo fica NENHUM', () => {
    expect(cobertura([inex]).find((l) => l.modalidade === 'LEILAO')?.motivo).toBe('NENHUM');
  });

  it('rótulos de "Vale para"', () => {
    expect(rotulosDaAplicacao(pequenoValor.aplicacao)).toEqual(['Dispensa · art. 75, I; art. 75, II']);
    expect(rotulosDaAplicacao(null)).toEqual(['Padrão: o que não tem fluxo próprio']);
  });
});
