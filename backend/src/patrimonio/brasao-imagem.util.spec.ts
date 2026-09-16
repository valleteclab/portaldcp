import { PNG } from 'pngjs';
import * as jpeg from 'jpeg-js';
import { caberNaCaixa, decodificarImagem, monocromatico, recortarMargem, reduzir, zplGrafico } from './brasao-imagem.util';

/** Imagem 20x10 branca com um quadrado preto de 4x2 em (8,3). */
function imagemTeste() {
  const png = new PNG({ width: 20, height: 10 });
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 20; x++) {
      const i = (y * 20 + x) * 4;
      const preto = x >= 8 && x < 12 && y >= 3 && y < 5;
      png.data[i] = png.data[i + 1] = png.data[i + 2] = preto ? 0 : 255;
      png.data[i + 3] = 255;
    }
  }
  return png;
}

describe('brasao-imagem.util', () => {
  it('decodifica PNG e JPEG pelo cabeçalho do arquivo', () => {
    const png = PNG.sync.write(imagemTeste());
    expect(decodificarImagem(png).width).toBe(20);
    const rgba = imagemTeste();
    const jpg = jpeg.encode({ width: 20, height: 10, data: rgba.data }, 90).data;
    const img = decodificarImagem(jpg);
    expect(img.width).toBe(20);
    expect(img.height).toBe(10);
    expect(() => decodificarImagem(Buffer.from('GIF89a......'))).toThrow();
  });

  it('recorta a margem branca', () => {
    const img = recortarMargem(decodificarImagem(PNG.sync.write(imagemTeste())));
    expect(img.width).toBe(4);
    expect(img.height).toBe(2);
  });

  it('transparente conta como branco e imagem vazia não é recortada', () => {
    const png = new PNG({ width: 5, height: 5 }); // tudo zero = preto transparente
    const img = recortarMargem(decodificarImagem(PNG.sync.write(png)));
    expect(img.width).toBe(5);
  });

  it('caberNaCaixa mantém proporção', () => {
    expect(caberNaCaixa(200, 100, 50, 50)).toEqual({ width: 50, height: 25 });
    expect(caberNaCaixa(100, 200, 50, 50)).toEqual({ width: 25, height: 50 });
  });

  it('reduzir limita a largura e mantém proporção', () => {
    const img = reduzir(decodificarImagem(PNG.sync.write(imagemTeste())), 10);
    expect(img.width).toBe(10);
    expect(img.height).toBe(5);
    expect(img.data.length).toBe(10 * 5 * 4);
  });

  it('monocromático: preto vira preto, branco e cinza claro viram branco', () => {
    const m = monocromatico(recortarMargem(decodificarImagem(PNG.sync.write(imagemTeste()))), 4, 2);
    expect(m.every((l) => l.every(Boolean))).toBe(true);
    const claro = new PNG({ width: 4, height: 4 });
    for (let i = 0; i < 16; i++) { claro.data[i * 4] = claro.data[i * 4 + 1] = claro.data[i * 4 + 2] = 215; claro.data[i * 4 + 3] = 255; }
    const m2 = monocromatico(decodificarImagem(PNG.sync.write(claro)), 4, 4);
    expect(m2.every((l) => l.every((p) => !p))).toBe(true);
  });

  it('zplGrafico empacota 8 pontos por byte, bit mais alto à esquerda', () => {
    const z = zplGrafico([
      [true, false, false, false, false, false, false, false, true],
      [false, false, false, false, false, false, false, true, false],
    ]);
    expect(z).toBe('^GFA,4,4,2,80800100');
  });
});
