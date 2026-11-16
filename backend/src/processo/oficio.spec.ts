import { anoDeBrasilia, chaveSequenciaOficio, numerarTexto, numeroDoOficio, tituloDoOficio } from './oficio';

describe('ofício', () => {
  it('numera com três dígitos e o ano', () => {
    expect(numeroDoOficio(14, 2026)).toBe('014/2026');
    expect(numeroDoOficio(1203, 2026)).toBe('1203/2026');
    expect(tituloDoOficio('014/2026')).toBe('Ofício nº 014/2026');
  });

  it('recusa sequência inválida', () => {
    expect(() => numeroDoOficio(0, 2026)).toThrow();
    expect(() => numeroDoOficio(1.5, 2026)).toThrow();
  });

  it('o ano é o de Brasília: 31/12 às 22h ainda é do ano que termina', () => {
    expect(anoDeBrasilia(new Date('2027-01-01T01:00:00Z'))).toBe(2026);
    expect(anoDeBrasilia(new Date('2027-01-01T03:00:00Z'))).toBe(2027);
  });

  it('troca todas as marcas de número no texto', () => {
    expect(numerarTexto('<p>Ofício nº [número do ofício]</p><p>Ref. [número do ofício]</p>', '014/2026')).toBe('<p>Ofício nº 014/2026</p><p>Ref. 014/2026</p>');
    expect(numerarTexto('sem marca', '014/2026')).toBe('sem marca');
  });

  it('sequência separada por órgão, setor e ano', () => {
    expect(chaveSequenciaOficio('o1', 's1', 2026)).not.toBe(chaveSequenciaOficio('o1', 's2', 2026));
    expect(chaveSequenciaOficio('o1', null, 2026)).toBe('oficio:o1:sem-setor:2026');
  });
});
