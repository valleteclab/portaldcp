import { aprovacaoJaFeita } from './aprovacao-demanda';

describe('aprovação da demanda (pula sozinha quando já existe)', () => {
  const sem = { demandas: [], dfdConsolidado: null, origemDoDfd: null };
  it('processo sem demanda e DFD feito no sistema: fica com o aprovador', () => {
    expect(aprovacaoJaFeita({ ...sem, origemDoDfd: 'INTERNO' })).toBeNull();
    expect(aprovacaoJaFeita(sem)).toBeNull();
  });
  it('demanda aprovada pelo setor: pula', () => {
    expect(aprovacaoJaFeita({ ...sem, demandas: [{ status: 'EM_CONTRATACAO' }] })).toContain('demanda aprovada');
  });
  it('DFD consolidado com demandas aprovadas: pula; com 2ª aprovação pendente, não', () => {
    const dfd = { numero: 3, ano: 2026, exige_aprovacao: false, aprovado: false };
    expect(aprovacaoJaFeita({ ...sem, demandas: [{ status: 'CONSOLIDADA' }, { status: 'APROVADA' }], dfdConsolidado: dfd })).toContain('DFD consolidado nº 3/2026');
    expect(aprovacaoJaFeita({ ...sem, demandas: [{ status: 'CONSOLIDADA' }], dfdConsolidado: { ...dfd, exige_aprovacao: true } })).toBeNull();
  });
  it('alguma demanda não aprovada: não pula pelas demandas', () => {
    expect(aprovacaoJaFeita({ ...sem, demandas: [{ status: 'APROVADA' }, { status: 'RASCUNHO' }] })).toBeNull();
  });
  it('DFD juntado feito fora: a aprovação consta da peça', () => {
    expect(aprovacaoJaFeita({ ...sem, origemDoDfd: 'ANEXADO' })).toContain('feito fora');
  });
});
