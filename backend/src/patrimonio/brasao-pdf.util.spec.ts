import { brasaoParaPdf, medidaBrasao } from './brasao-pdf.util';

describe('brasão no PDF', () => {
  describe('medidaBrasao', () => {
    const quadrado = { dataUrl: '', largura: 300, altura: 300, proporcao: 1 };
    const deitado = { dataUrl: '', largura: 900, altura: 200, proporcao: 4.5 };
    const empe = { dataUrl: '', largura: 200, altura: 400, proporcao: 0.5 };

    it('brasão quadrado usa a altura pedida', () => {
      expect(medidaBrasao(quadrado, 16, 24)).toEqual({ largura: 16, altura: 16 });
    });

    it('brasão em pé fica estreito, sem esticar', () => {
      expect(medidaBrasao(empe, 16, 24)).toEqual({ largura: 8, altura: 16 });
    });

    it('brasão deitado é limitado pela largura, para não empurrar o nome do órgão', () => {
      const m = medidaBrasao(deitado, 16, 24);
      expect(m.largura).toBe(24);
      expect(m.altura).toBeCloseTo(24 / 4.5, 5);
      expect(m.altura).toBeLessThan(16);
    });

    it('a proporção é sempre preservada', () => {
      for (const b of [quadrado, deitado, empe]) {
        const m = medidaBrasao(b, 18, 26);
        expect(m.largura / m.altura).toBeCloseTo(b.proporcao, 5);
      }
    });
  });

  describe('brasaoParaPdf', () => {
    it('órgão sem logo não quebra o documento', () => {
      expect(brasaoParaPdf(null)).toBeNull();
      expect(brasaoParaPdf(undefined)).toBeNull();
      expect(brasaoParaPdf('')).toBeNull();
    });

    it('arquivo inexistente devolve null em vez de derrubar a geração', () => {
      expect(brasaoParaPdf('/api/uploads/nao-existe-mesmo-12345.png')).toBeNull();
    });
  });
});
