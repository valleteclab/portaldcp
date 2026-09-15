/**
 * ============================================================================
 * CONSUMO DE SALDO POR CICLO — regras puras (sem banco)
 * ============================================================================
 *
 * REGRA FINAL DO CONSUMO DE UM ITEM DO CRONOGRAMA
 *
 * 1) Contrato SEM renovação de ciclo (`data_renovacao_ciclo` vazia):
 *    consumo = `itens_cronograma.quantidade_medida` (acumulado de toda a vigência).
 *
 * 2) Contrato COM renovação de ciclo: o acumulado do cronograma é ignorado (ele
 *    não "reseta" no novo ciclo) e o consumo do ciclo vigente é a SOMA de:
 *      a) `itens_medicao_item.quantidade_medida` das medições APROVADAS do contrato
 *         com `periodo_inicio >= data de corte do ciclo`; MAIS
 *      b) as quantidades dos itens (`requisicao_itens_os`) das OS marcadas como
 *         ATENDIDAS FORA DO SISTEMA (`requisicoes.consumo_fora_sistema_em` preenchido)
 *         com `data_solicitacao >= data de corte do ciclo`.
 *
 * Por que (b) é necessário: `atenderForaDoSistema` incrementa apenas
 * `itens_cronograma.quantidade_medida`, que o cálculo do ciclo não lê. Como a OS muda
 * de status para ATENDIDA, ela também sai do saldo COMPROMETIDO
 * (`somarQuantidadeComprometidaPorItemOS` só conta RASCUNHO / AGUARDANDO_AUTORIZACAO /
 * AUTORIZADA). Sem (b), marcar uma OS paga como atendida fora do sistema LIBERAVA o
 * saldo em vez de consumi-lo.
 *
 * SEM DUPLA CONTAGEM: uma OS entra em exatamente um dos três baldes —
 *   • comprometida  → status ainda aberto (RASCUNHO/AGUARDANDO_AUTORIZACAO/AUTORIZADA);
 *   • medida        → tem medição APROVADA vinculada (a OS não pode ser marcada como
 *                     atendida fora do sistema se tiver medição ativa — validação em
 *                     `atenderForaDoSistema`);
 *   • fora sistema  → status ATENDIDA com `consumo_fora_sistema_em` preenchido.
 */

/** Unidades cujo consumo é contado em MESES (e não na quantidade física). */
export const UNIDADES_POR_TEMPO = ['MENSAL', 'MES', 'MÊS', 'POSTO'];

export interface LinhaItemOsForaSistema {
  item_cronograma_id: string;
  quantidade_solicitada: number | string | null;
  meses_solicitados: number | string | null;
  unidade_medida: string | null;
}

/**
 * Quantidade que uma linha de item de OS consome do saldo do cronograma.
 * Espelha exatamente o incremento aplicado por `RequisicaoService.atenderForaDoSistema`.
 */
export function quantidadeConsumidaItemOs(linha: LinhaItemOsForaSistema): number {
  const porTempo = UNIDADES_POR_TEMPO.includes(
    (linha.unidade_medida || '').trim().toUpperCase(),
  );
  const valor = porTempo
    ? Number(linha.meses_solicitados ?? linha.quantidade_solicitada ?? 0)
    : Number(linha.quantidade_solicitada ?? 0);
  return Number.isFinite(valor) && valor > 0 ? valor : 0;
}

/** Agrupa linhas de itens de OS fora do sistema em um mapa item_cronograma_id → quantidade. */
export function agruparConsumoForaSistema(
  linhas: LinhaItemOsForaSistema[],
): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const linha of linhas) {
    if (!linha.item_cronograma_id) continue;
    const quantidade = quantidadeConsumidaItemOs(linha);
    if (quantidade <= 0) continue;
    mapa.set(
      linha.item_cronograma_id,
      (mapa.get(linha.item_cronograma_id) || 0) + quantidade,
    );
  }
  return mapa;
}

/** Soma dois mapas de consumo por item (medições aprovadas + OS fora do sistema). */
export function somarMapasConsumo(
  ...mapas: Array<Map<string, number> | null | undefined>
): Map<string, number> {
  const total = new Map<string, number>();
  for (const mapa of mapas) {
    if (!mapa) continue;
    for (const [itemId, quantidade] of mapa) {
      total.set(itemId, (total.get(itemId) || 0) + Number(quantidade || 0));
    }
  }
  return total;
}

/**
 * Consumo final de um item, aplicando a regra 1/2 acima.
 * `consumoCiclo` é null quando o contrato NÃO tem renovação de ciclo.
 */
export function resolverConsumoItem(
  itemCronogramaId: string,
  quantidadeMedidaCronograma: number | string | null | undefined,
  consumoCiclo: Map<string, number> | null,
): number {
  if (consumoCiclo) return Number(consumoCiclo.get(itemCronogramaId) || 0);
  return Number(quantidadeMedidaCronograma || 0);
}
