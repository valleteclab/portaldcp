import { StatusDisputaItem } from '../itens/entities/item-licitacao.entity';
import { itemEmFaseComAnonimizacaoObrigatoria } from './disputa-anonimizacao-helpers';

describe('disputa-anonimizacao-helpers', () => {
  it('considera ENCERRADO e NEGOCIACAO como fase em que nomes reais podem aparecer', () => {
    expect(
      itemEmFaseComAnonimizacaoObrigatoria(StatusDisputaItem.ENCERRADO),
    ).toBe(false);
    expect(
      itemEmFaseComAnonimizacaoObrigatoria(StatusDisputaItem.NEGOCIACAO),
    ).toBe(false);
  });

  it('considera EM_DISPUTA e demais como fase com anonimização ativa no fluxo de lances', () => {
    expect(
      itemEmFaseComAnonimizacaoObrigatoria(StatusDisputaItem.EM_DISPUTA),
    ).toBe(true);
    expect(
      itemEmFaseComAnonimizacaoObrigatoria(StatusDisputaItem.AGUARDANDO),
    ).toBe(true);
  });
});
