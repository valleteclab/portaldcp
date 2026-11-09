import { anexoVisivel, faseDoLote } from './visao-lotes.regras';

describe('faseDoLote', () => {
  const base = { encerrada: true, itensStatus: ['ATIVO'], recursosPendentes: false };
  it('antes e durante a disputa', () => {
    expect(faseDoLote({ ...base, encerrada: false, statusDisputa: 'AGUARDANDO', ranking: [] })).toBe('AGUARDANDO');
    expect(faseDoLote({ ...base, encerrada: false, statusDisputa: 'EM_DISPUTA', ranking: [] })).toBe('DISPUTA');
  });
  it('pelo líder do ranking', () => {
    expect(faseDoLote({ ...base, ranking: [{ situacao: 'CLASSIFICADO', excluido: false }] })).toBe('JULGAMENTO');
    expect(faseDoLote({ ...base, ranking: [{ situacao: 'CONVOCADO_ACEITACAO', excluido: false }] })).toBe('JULGAMENTO');
    expect(faseDoLote({ ...base, ranking: [{ situacao: 'ACEITO', excluido: false }] })).toBe('HABILITACAO');
    expect(faseDoLote({ ...base, ranking: [{ situacao: 'HABILITADO', excluido: false }] })).toBe('EM_ADJUDICACAO');
    expect(faseDoLote({ ...base, recursosPendentes: true, ranking: [{ situacao: 'HABILITADO', excluido: false }] })).toBe('RECURSOS');
  });
  it('inabilitado sai: o próximo volta à aceitação', () => {
    expect(
      faseDoLote({ ...base, ranking: [{ situacao: 'INABILITADO', excluido: true }, { situacao: 'CLASSIFICADO', excluido: false }] }),
    ).toBe('JULGAMENTO');
  });
  it('desempate pendente', () => {
    expect(faseDoLote({ ...base, ranking: [{ situacao: 'CLASSIFICADO', excluido: false, desempatePendente: true }] })).toBe('DESEMPATE');
  });
  it('resultado pelos itens', () => {
    expect(faseDoLote({ ...base, itensStatus: ['ADJUDICADO', 'ADJUDICADO'], ranking: [] })).toBe('ADJUDICADO');
    expect(faseDoLote({ ...base, itensStatus: ['HOMOLOGADO'], ranking: [] })).toBe('HOMOLOGADO');
    expect(faseDoLote({ ...base, itensStatus: ['DESERTO'], ranking: [] })).toBe('SEM_RESULTADO');
  });
});

describe('anexoVisivel', () => {
  it('órgão e o próprio licitante sempre', () => {
    expect(anexoVisivel({ tipo: 'HABILITACAO', souOrgao: true, souDono: false })).toBe(true);
    expect(anexoVisivel({ tipo: 'HABILITACAO', souOrgao: false, souDono: true, statusHabilitacao: 'ENVIADA' })).toBe(true);
  });
  it('demais licitantes: só depois da decisão', () => {
    expect(anexoVisivel({ tipo: 'HABILITACAO', souOrgao: false, souDono: false, statusHabilitacao: 'ENVIADA' })).toBe(false);
    expect(anexoVisivel({ tipo: 'HABILITACAO', souOrgao: false, souDono: false, statusHabilitacao: 'HABILITADO' })).toBe(true);
    expect(anexoVisivel({ tipo: 'PROPOSTA_ADEQUADA', souOrgao: false, souDono: false, statusAceitacao: 'ENVIADA' })).toBe(false);
    expect(anexoVisivel({ tipo: 'PROPOSTA_ADEQUADA', souOrgao: false, souDono: false, statusAceitacao: 'ACEITA' })).toBe(true);
  });
});
