import { dimensoesPlaqueta, gradeA4, layoutPlaqueta, tomboImpresso } from './plaqueta-layout.util';

describe('plaqueta-layout.util', () => {
  it('dimensoesPlaqueta aceita os tamanhos e cai em 50x25 no resto', () => {
    expect(dimensoesPlaqueta('50x20')).toEqual({ w: 50, h: 20, tamanho: '50x20' });
    expect(dimensoesPlaqueta('100x25')).toEqual({ w: 100, h: 25, tamanho: '100x25' });
    expect(dimensoesPlaqueta('30x10').tamanho).toBe('50x25');
    expect(dimensoesPlaqueta(undefined).tamanho).toBe('50x25');
  });

  it('nada sai da etiqueta e o texto não invade o QR, em todos os tamanhos', () => {
    for (const t of ['50x20', '50x25', '100x25']) {
      const { w, h } = dimensoesPlaqueta(t);
      for (const temLogo of [true, false]) {
        const L = layoutPlaqueta(w, h, temLogo);
        expect(L.qr.x + L.qr.w <= w).toBe(true);
        expect(L.qr.y >= 0 && L.qr.y + L.qr.h <= h).toBe(true);
        expect(L.texto.x + L.texto.w < L.qr.x).toBe(true);
        expect(L.texto.w > 10).toBe(true);
        if (temLogo) expect(L.logo!.x + L.logo!.w < L.texto.x).toBe(true);
        else expect(L.logo).toBeNull();
      }
    }
  });

  it('QR de 50x20 tem pelo menos 16 mm (legível pela câmera)', () => {
    expect(layoutPlaqueta(50, 20, true).qr.w >= 16).toBe(true);
  });

  it('só a etiqueta larga tem espaço para descrição e EPC em uma linha', () => {
    expect(layoutPlaqueta(100, 25, true).cabeDescricao).toBe(true);
    expect(layoutPlaqueta(100, 25, true).epcUmaLinha).toBe(true);
    expect(layoutPlaqueta(50, 20, true).cabeDescricao).toBe(false);
    expect(layoutPlaqueta(50, 20, true).epcUmaLinha).toBe(false);
  });

  it('gradeA4 cabe na folha', () => {
    for (const [w, h, cols, lins] of [[50, 20, 3, 13], [50, 25, 3, 10], [100, 25, 2, 10]]) {
      const g = gradeA4(w, h);
      expect(g.colunas).toBe(cols);
      expect(g.linhas).toBe(lins);
      expect(g.x0 >= 0 && g.x0 * 2 + g.colunas * w + (g.colunas - 1) * g.espaco <= 210.0001).toBe(true);
      expect(g.y0 >= 0 && g.y0 * 2 + g.linhas * h + (g.linhas - 1) * g.espaco <= 297.0001).toBe(true);
    }
  });

  it('tomboImpresso completa número curto com zeros', () => {
    expect(tomboImpresso('87')).toBe('000087');
    expect(tomboImpresso('003312')).toBe('003312');
    expect(tomboImpresso('1234567')).toBe('1234567');
    expect(tomboImpresso('CM-12')).toBe('CM-12');
    expect(tomboImpresso('')).toBe('—');
  });
});
