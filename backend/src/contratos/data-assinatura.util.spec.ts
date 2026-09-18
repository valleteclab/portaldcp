import { literalDataAssinatura } from './data-assinatura.util';

describe('literalDataAssinatura', () => {
  it('mantém a hora digitada na tela, sem converter fuso', () => {
    expect(literalDataAssinatura('2026-09-11T10:08')).toBe('2026-09-11 10:08:00');
    expect(literalDataAssinatura('2026-09-11T10:08:27')).toBe('2026-09-11 10:08:27');
    expect(literalDataAssinatura('2026-09-11 10:08:27')).toBe('2026-09-11 10:08:27');
  });

  it('data sem hora fica ao meio-dia', () => {
    expect(literalDataAssinatura('2026-09-11')).toBe('2026-09-11 12:00:00');
  });

  it('com fuso explícito, converte para Brasília', () => {
    expect(literalDataAssinatura('2026-09-11T13:08:27Z')).toBe('2026-09-11 10:08:27');
    expect(literalDataAssinatura('2026-09-11T10:08:27-03:00')).toBe('2026-09-11 10:08:27');
  });

  it('aceita Date', () => {
    expect(literalDataAssinatura(new Date('2026-09-11T13:08:27Z'))).toBe('2026-09-11 10:08:27');
  });

  it('recusa data inválida', () => {
    expect(literalDataAssinatura('2026-02-31T10:00')).toBeNull();
    expect(literalDataAssinatura('2026-09-11T25:00')).toBeNull();
    expect(literalDataAssinatura('qualquer coisa')).toBeNull();
    expect(literalDataAssinatura('')).toBeNull();
    expect(literalDataAssinatura(new Date('x'))).toBeNull();
  });
});
