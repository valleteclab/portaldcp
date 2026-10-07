import { pendenciasDemandaPura, pendenciasDfdPura, chaveDaEtapaDoNo } from './no-demanda-dfd.service';

describe('pendenciasDemandaPura', () => {
  it('exige o processo ligado antes de qualquer outra coisa', () => {
    expect(pendenciasDemandaPura({ processoLigado: false, demandaVinculadaId: null, demandaVinculadaValida: false, temDocumento: true })).toEqual([
      'Esta etapa precisa estar ligada a um processo.',
    ]);
  });

  it('sem vínculo e sem documento: pendência pedindo para escrever, anexar ou vincular', () => {
    expect(pendenciasDemandaPura({ processoLigado: true, demandaVinculadaId: null, demandaVinculadaValida: false, temDocumento: false })).toEqual([
      'Falta o documento da demanda: escreva, anexe ou vincule uma demanda já cadastrada.',
    ]);
  });

  it('sem vínculo, com documento juntado: sem pendência', () => {
    expect(pendenciasDemandaPura({ processoLigado: true, demandaVinculadaId: null, demandaVinculadaValida: false, temDocumento: true })).toEqual([]);
  });

  it('demanda vinculada e válida do órgão: sem pendência, mesmo sem documento', () => {
    expect(pendenciasDemandaPura({ processoLigado: true, demandaVinculadaId: 'd1', demandaVinculadaValida: true, temDocumento: false })).toEqual([]);
  });

  it('isolamento: demanda vinculada que não é deste órgão nunca passa em silêncio', () => {
    expect(pendenciasDemandaPura({ processoLigado: true, demandaVinculadaId: 'd1', demandaVinculadaValida: false, temDocumento: false })).toEqual([
      'A demanda vinculada não pertence a este órgão.',
    ]);
    // mesmo com documento juntado — o vínculo inválido é o que decide, nunca o documento.
    expect(pendenciasDemandaPura({ processoLigado: true, demandaVinculadaId: 'd1', demandaVinculadaValida: false, temDocumento: true })).toEqual([
      'A demanda vinculada não pertence a este órgão.',
    ]);
  });
});

describe('pendenciasDfdPura', () => {
  it('exige o processo ligado', () => {
    expect(pendenciasDfdPura({ processoLigado: false, temDocumento: true })).toEqual(['Esta etapa precisa estar ligada a um processo.']);
  });

  it('sem documento: pendência', () => {
    expect(pendenciasDfdPura({ processoLigado: true, temDocumento: false })).toEqual(['Falta o documento do DFD.']);
  });

  it('com documento: sem pendência', () => {
    expect(pendenciasDfdPura({ processoLigado: true, temDocumento: true })).toEqual([]);
  });
});

describe('chaveDaEtapaDoNo', () => {
  it('prefixa com "no:" para distinguir das etapas padrão do ADITIVO/RENOVACAO', () => {
    expect(chaveDaEtapaDoNo('abc-123')).toBe('no:abc-123');
  });
});
