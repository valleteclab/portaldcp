import { casarPagamentosComOrdens, normalizarNumeroOs } from './ordem-paga.util';

const pag = (numero_empenho: string, valor: number, extras: any = {}) => ({
  numero_empenho,
  data: '16/09/2026',
  valor,
  ...extras,
});

describe('ordem-paga.util', () => {
  it('normalizarNumeroOs tira prefixo e zeros à esquerda', () => {
    expect(normalizarNumeroOs('OS-0242/2026')).toBe('242/2026');
    expect(normalizarNumeroOs('OS nº 242/2026')).toBe('242/2026');
    expect(normalizarNumeroOs('OS 0067')).toBe('67');
    expect(normalizarNumeroOs('')).toBe('');
    expect(normalizarNumeroOs(null)).toBe('');
  });

  it('casa pela OS citada no histórico, mesmo com formatos diferentes', () => {
    const r = casarPagamentosComOrdens(
      [{ id: 'a', numero: 'OS-0242/2026', valor: 1500 }],
      [pag('455-2026', 1500, { os_citada: 'OS nº 242/2026' })],
    );
    expect(r.get('a')).toMatchObject({ criterio: 'OS_CITADA', numero_empenho: '455-2026' });
  });

  it('casa pelo empenho anotado na OS quando não há OS citada', () => {
    const r = casarPagamentosComOrdens(
      [{ id: 'a', numero: 'OS-0189/2026', valor: 8700, numeros_empenhos: ['385/2026'] }],
      [pag('385-2026', 8700)],
    );
    expect(r.get('a')).toMatchObject({ criterio: 'EMPENHO_DA_OS' });
  });

  it('casa pelo valor exato como último critério', () => {
    const r = casarPagamentosComOrdens(
      [{ id: 'a', numero: 'OS-0101/2026', valor: 6160 }],
      [pag('299-2026', 6160)],
    );
    expect(r.get('a')).toMatchObject({ criterio: 'VALOR', valor: 6160 });
  });

  it('cada pagamento serve a uma OS só', () => {
    const r = casarPagamentosComOrdens(
      [
        { id: 'a', numero: 'OS-0067/2026', valor: 8800 },
        { id: 'b', numero: 'OS-0068/2026', valor: 8800 },
      ],
      [pag('259-2026', 8800)],
    );
    expect(r.get('a')).toMatchObject({ criterio: 'VALOR' });
    expect(r.get('b')).toBeNull();
  });

  it('a OS citada tem prioridade sobre o valor', () => {
    const r = casarPagamentosComOrdens(
      [
        { id: 'a', numero: 'OS-0242/2026', valor: 1500 },
        { id: 'b', numero: 'OS-0243/2026', valor: 1500 },
      ],
      [pag('455-2026', 1500), pag('456-2026', 1500, { os_citada: 'OS-0243/2026' })],
    );
    expect(r.get('b')).toMatchObject({ criterio: 'OS_CITADA', numero_empenho: '456-2026' });
    expect(r.get('a')).toMatchObject({ criterio: 'VALOR', numero_empenho: '455-2026' });
  });

  it('sem pagamento correspondente devolve null', () => {
    const r = casarPagamentosComOrdens(
      [{ id: 'a', numero: 'OS-0242/2026', valor: 1500 }],
      [pag('455-2026', 999)],
    );
    expect(r.get('a')).toBeNull();
  });

  it('ignora estornos (valor negativo)', () => {
    const r = casarPagamentosComOrdens(
      [{ id: 'a', numero: 'OS-0242/2026', valor: 1500 }],
      [pag('455-2026', -1500, { os_citada: 'OS-0242/2026' })],
    );
    expect(r.get('a')).toBeNull();
  });
});
