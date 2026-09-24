import { SituacaoLicitacao } from '../entities/licitacao.entity';

/**
 * ROLL-UP do resultado por item → situação da licitação (plano §2.3).
 *
 * O status por item continua valendo (um item pode ser deserto/fracassado
 * sozinho); a licitação inteira só vira:
 *  - DESERTA    quando TODOS os itens (não cancelados) estão DESERTO;
 *  - FRACASSADA quando nenhum item tem vencedor, todos já foram encerrados
 *                (DESERTO/FRACASSADO) e ao menos um é FRACASSADO.
 * Itens CANCELADO não contam. Qualquer item com vencedor (ou ainda em
 * andamento) → sem roll-up (null).
 */
export interface ItemParaRollup {
  status: string | null | undefined;
  fornecedor_vencedor_id?: string | null;
}

const COM_VENCEDOR = ['ADJUDICADO', 'HOMOLOGADO'];

export function avaliarRollupItens(
  itens: ItemParaRollup[],
): SituacaoLicitacao.DESERTA | SituacaoLicitacao.FRACASSADA | null {
  const considerados = itens.filter((i) => i.status !== 'CANCELADO');
  if (considerados.length === 0) return null;
  if (considerados.some((i) => !!i.fornecedor_vencedor_id || COM_VENCEDOR.includes(String(i.status)))) {
    return null;
  }
  if (considerados.every((i) => i.status === 'DESERTO')) return SituacaoLicitacao.DESERTA;
  const encerrados = considerados.every((i) => i.status === 'DESERTO' || i.status === 'FRACASSADO');
  if (encerrados && considerados.some((i) => i.status === 'FRACASSADO')) return SituacaoLicitacao.FRACASSADA;
  return null;
}
