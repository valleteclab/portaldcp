import { proximoCodigoClassificacao } from './catalogo-proprio.service';

describe('Próximo código de classificação do catálogo próprio', () => {
  const servicos = ['100', '200', '300', '400', '500', '600', '700', '800', '900', '1821', '8715'];
  const materiais = ['1000', '1100', '1200', '1300', '1400', '1500', '1600', '7040', '7050', '7060', '7160'];
  const todos = [...servicos, ...materiais];

  it('usa o maior código NUMÉRICO do tipo (o maior por texto seria "900" → 1000, que já é de material)', () => {
    expect(proximoCodigoClassificacao(100, servicos, todos)).toBe('8815');
    expect(proximoCodigoClassificacao(1000, materiais, todos)).toBe('7260');
  });

  it('pula código já usado por outro tipo', () => {
    expect(proximoCodigoClassificacao(100, ['900'], ['900', '1000', '1100'])).toBe('1200');
  });

  it('sem nenhuma classificação do tipo, começa no prefixo (ou no próximo livre)', () => {
    expect(proximoCodigoClassificacao(100, [], [])).toBe('100');
    expect(proximoCodigoClassificacao(1000, [], ['1000'])).toBe('1100');
  });
});
