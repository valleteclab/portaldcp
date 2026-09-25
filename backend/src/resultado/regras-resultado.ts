/**
 * ============================================================================
 * REGRAS PURAS DO RESULTADO (plano E6 — Lei 14.133/2021 arts. 71, 90–95;
 * IN SEGES 73/2022 arts. 42 e seguintes). Sem banco, sem Nest.
 * ============================================================================
 *
 * - O VENCEDOR adjudicado de uma unidade (item, ou lote na disputa por lote)
 *   é o licitante na vez do ranking único que passou pela habilitação
 *   (HABILITADO; VENCEDOR = já adjudicado, pedido idempotente) — art. 71 IV
 *   só depois do julgamento e da habilitação (art. 17 IV-V; B3).
 * - O VALOR ADJUDICADO de cada item é o da PROPOSTA ADEQUADA ACEITA
 *   (IN 73 art. 29): unitário e total readequados pelo licitante — nunca o
 *   lance cru (no lote, o valor de cada item dentro do lote).
 * - O VALOR HOMOLOGADO é a SOMA dos valores adjudicados dos itens com
 *   vencedor — calculado, nunca vindo do corpo (plano §0 regra 2, §2.3).
 */

/** Situações do licitante que permitem adjudicar a unidade a ele. */
export const SITUACOES_ADJUDICAVEIS: ReadonlyArray<string> = ['HABILITADO', 'VENCEDOR'];

/** Status de item que já têm resultado (vencedor adjudicado/homologado). */
export const STATUS_ITEM_COM_RESULTADO: ReadonlyArray<string> = ['ADJUDICADO', 'HOMOLOGADO'];

/** Status de item sem resultado possível (não entram na adjudicação). */
export const STATUS_ITEM_SEM_RESULTADO: ReadonlyArray<string> = ['DESERTO', 'FRACASSADO', 'CANCELADO'];

/** Origem do resultado gravado (registro na trilha e no evento). */
export type OrigemResultado = 'SALA' | 'DISPENSA' | 'SELECAO_EXTERNA';

export interface ItemDaUnidadeResultado {
  itemId: string;
  numero: number;
  quantidade: number;
}

/** Valores por item vindos da proposta adequada aceita (aceitacoes_proposta.valores_itens). */
export interface ValorItemAceito {
  itemId: string;
  valorUnitario: number;
  valorTotal: number;
}

export interface ValorAdjudicado {
  itemId: string;
  numero: number;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

export const arred = (v: number, casas = 2): number => {
  const f = 10 ** casas;
  return Math.round((Number(v) + Number.EPSILON) * f) / f;
};

/**
 * Motivo pelo qual o licitante na vez NÃO pode receber a adjudicação, ou null.
 * Sem vencedor → a unidade precisa ser resolvida (aceitação/habilitação) ou
 * declarada deserta/fracassada.
 */
export function motivoVencedorInvalido(
  rotulo: string,
  vencedor: { fornecedorId: string; situacao: string } | null | undefined,
): string | null {
  if (!vencedor) {
    return `${rotulo}: não há licitante com proposta aceita e habilitado — conclua a aceitação/habilitação ou declare a unidade deserta/fracassada.`;
  }
  if (!SITUACOES_ADJUDICAVEIS.includes(String(vencedor.situacao))) {
    return `${rotulo}: o licitante na vez está ${String(vencedor.situacao).toLowerCase()} — só se adjudica ao HABILITADO (Lei 14.133/2021, arts. 17 V e 71 IV).`;
  }
  return null;
}

/**
 * Valores adjudicados da unidade a partir da proposta adequada ACEITA: cada
 * item da unidade precisa ter o seu unitário/total readequado (no lote, todos
 * os itens do lote). Unitário com 4 casas, total com 2 (como a aceitação grava).
 */
export function valoresAdjudicadosDaAceitacao(
  rotulo: string,
  itens: ItemDaUnidadeResultado[],
  valoresAceitos: ValorItemAceito[] | null | undefined,
): ValorAdjudicado[] {
  const porItem = new Map((valoresAceitos ?? []).map((v) => [String(v.itemId), v]));
  const faltando: number[] = [];
  const saida: ValorAdjudicado[] = [];
  for (const it of [...itens].sort((a, b) => a.numero - b.numero)) {
    const v = porItem.get(String(it.itemId));
    const unit = Number(v?.valorUnitario);
    const total = Number(v?.valorTotal);
    if (!v || !(unit > 0) || !(total > 0)) {
      faltando.push(it.numero);
      continue;
    }
    saida.push({ itemId: it.itemId, numero: it.numero, quantidade: it.quantidade, valorUnitario: arred(unit, 4), valorTotal: arred(total, 2) });
  }
  if (faltando.length) {
    throw new Error(
      `${rotulo}: a proposta adequada aceita não traz o valor do(s) item(ns) ${faltando.join(', ')} (IN SEGES 73/2022, art. 29).`,
    );
  }
  return saida;
}

/**
 * Valores adjudicados quando não há etapa de aceitação (dispensa — IN 67/2021:
 * vale a melhor oferta final do fornecedor, proposta ou lance; seleção
 * externa: o valor registrado da plataforma de origem): unitário × quantidade.
 */
export function valorAdjudicadoDoUnitario(item: ItemDaUnidadeResultado, valorUnitario: number): ValorAdjudicado {
  const unit = arred(Number(valorUnitario), 4);
  if (!(unit > 0)) throw new Error(`Item ${item.numero}: valor unitário inválido`);
  const qtd = Number(item.quantidade) > 0 ? Number(item.quantidade) : 0;
  return { itemId: item.itemId, numero: item.numero, quantidade: qtd, valorUnitario: unit, valorTotal: arred(unit * qtd, 2) };
}

/**
 * Valor homologado = soma dos valores TOTAIS adjudicados dos itens com
 * vencedor (ADJUDICADO/HOMOLOGADO), ao centavo.
 */
export function valorHomologado(
  itens: Array<{ status: string; fornecedor_vencedor_id: string | null; valor_total_homologado: number | string | null }>,
): number {
  const soma = itens
    .filter((i) => !!i.fornecedor_vencedor_id && STATUS_ITEM_COM_RESULTADO.includes(String(i.status)))
    .reduce((s, i) => s + Number(i.valor_total_homologado || 0), 0);
  return arred(soma, 2);
}

// Quem REGISTRA × quem PRATICA a adjudicação/homologação: formalizacao/regras-formalizacao.ts
