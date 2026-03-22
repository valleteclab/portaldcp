import { StatusDisputaItem } from '../itens/entities/item-licitacao.entity';

/**
 * Item em ENCERRADO ou NEGOCIACAO: identidade pode ser exibida (fim da disputa aberta).
 * Caso contrário, durante lances, nomes reais não devem ser expostos quando a sessão exige anonimização.
 */
export function itemEmFaseComAnonimizacaoObrigatoria(
  status: StatusDisputaItem | undefined,
): boolean {
  if (!status) return true;
  return (
    status !== StatusDisputaItem.ENCERRADO &&
    status !== StatusDisputaItem.NEGOCIACAO
  );
}
