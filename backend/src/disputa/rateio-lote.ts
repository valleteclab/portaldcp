/**
 * ============================================================================
 * DISPUTA POR LOTE (grupo) — regras PURAS de elegibilidade e rateio (E2 item 5)
 * ============================================================================
 *
 * Na licitação com `base_lance = TOTAL_LOTE` a UNIDADE DE DISPUTA é o lote: o
 * licitante dá lances pelo VALOR GLOBAL do lote e o ranking é do lote. Os
 * valores por item (adjudicação, homologação, ata, contrato) saem do RATEIO
 * PROPORCIONAL do lance do lote sobre a proposta do próprio licitante.
 *
 * ELEGIBILIDADE (regra usual dos editais de adjudicação por grupo — modelos da
 * AGU/SEGES: "o licitante deverá cotar TODOS os itens que compõem o grupo, sob
 * pena de desclassificação da proposta para o grupo"; Lei 14.133 art. 40 §3º e
 * art. 82 §1º): só disputa o lote quem cotou TODOS os itens do lote com valor
 * positivo, numa proposta válida (CLASSIFICADA/RECEBIDA). Quem deixou de cotar
 * algum item continua na licitação (pode disputar OUTROS lotes que cotou por
 * inteiro), mas não entra no lote incompleto — nem proposta-lance nem lance.
 *
 * VALOR INICIAL do licitante no lote = soma dos TOTAIS dos itens da proposta
 * dele no lote (a proposta é convertida num lance de origem PROPOSTA do lote).
 *
 * RATEIO DO LANCE (como se derivam os valores adjudicados por item):
 *   fator     = lance do lote ÷ total da proposta do licitante no lote
 *   total_i   = proposta_i × fator, arredondado ao CENTAVO (meio para cima),
 *               para todos os itens menos o último (ordem do número do item);
 *   total_ult = lance do lote − Σ(total_i dos demais) — o RESÍDUO do
 *               arredondamento vai para o último item, e a soma dos totais
 *               por item é EXATAMENTE o lance do lote;
 *   unitário  = total_i ÷ quantidade_i, com 4 casas (mesma escala de
 *               `itens_licitacao.valor_unitario_*`). O TOTAL é o valor que
 *               manda (unitário × quantidade pode diferir em frações de
 *               centavo); homologação/ata leem os dois explícitos.
 * Conta feita em inteiros (centavos, BigInt) — sem erro de ponto flutuante.
 * O vencedor, na aceitação (E3), apresenta a proposta READEQUADA ao lance; o
 * rateio é o ponto de partida objetivo e documentado, não a proposta final.
 */

/** Item do lote com o valor da proposta do licitante (total do item, em R$). */
export interface ItemPropostaLote {
  itemId: string;
  numero: number;
  quantidade: number;
  /** Total cotado para o item (R$, 2 casas). */
  valorTotalProposta: number;
}

export interface ParcelaRateio {
  itemId: string;
  numero: number;
  quantidade: number;
  valor_total: number;
  valor_unitario: number;
}

const paraCentavos = (v: number): bigint => BigInt(Math.round(Number(v) * 100));
const deCentavos = (c: bigint): number => Number(c) / 100;
const arred4 = (v: number) => Math.round((v + Number.EPSILON) * 10_000) / 10_000;

/** Total da proposta do licitante no lote (soma dos totais por item, ao centavo). */
export function totalPropostaLote(itens: Array<Pick<ItemPropostaLote, 'valorTotalProposta'>>): number {
  return deCentavos(itens.reduce((s, i) => s + paraCentavos(i.valorTotalProposta), 0n));
}

/**
 * Rateio proporcional do lance do lote entre os itens (regra no cabeçalho).
 * Lança Error se a proposta for vazia/zero ou se o rateio produzir item com
 * total ≤ 0 (lance irrisório frente a um item de valor ínfimo).
 */
export function ratearLanceLote(itens: ItemPropostaLote[], valorLote: number): ParcelaRateio[] {
  if (!itens.length) throw new Error('Lote sem itens para ratear');
  const ordenados = [...itens].sort((a, b) => a.numero - b.numero);
  const propostas = ordenados.map((i) => paraCentavos(i.valorTotalProposta));
  const P = propostas.reduce((s, v) => s + v, 0n);
  if (P <= 0n || propostas.some((p) => p <= 0n)) throw new Error('Proposta do lote sem valor em algum item');
  const L = paraCentavos(valorLote);
  if (L <= 0n) throw new Error('Valor do lance do lote inválido');

  const totais: bigint[] = [];
  let acumulado = 0n;
  for (let i = 0; i < ordenados.length - 1; i++) {
    // round(p × L ÷ P), meio para cima, em inteiros
    const t = (2n * propostas[i] * L + P) / (2n * P);
    totais.push(t);
    acumulado += t;
  }
  totais.push(L - acumulado);
  if (totais.some((t) => t <= 0n)) {
    throw new Error('O lance do lote não permite ratear um valor positivo para todos os itens');
  }

  return ordenados.map((item, idx) => {
    const total = deCentavos(totais[idx]);
    const qtd = Number(item.quantidade) > 0 ? Number(item.quantidade) : 1;
    return {
      itemId: item.itemId,
      numero: item.numero,
      quantidade: qtd,
      valor_total: total,
      valor_unitario: arred4(total / qtd),
    };
  });
}

export interface ItemDoLote {
  id: string;
  numero: number;
  quantidade: number;
}

export interface PropostaItemFornecedor {
  itemId: string;
  valor_unitario?: number | string | null;
  valor_total?: number | string | null;
}

export interface ElegibilidadeLote {
  elegivel: boolean;
  /** Números dos itens do lote que o licitante não cotou (ou cotou sem valor). */
  itensNaoCotados: number[];
  /** Itens com o valor da proposta (só quando elegível). */
  itens: ItemPropostaLote[];
  /** Soma dos totais da proposta no lote (só quando elegível; senão 0). */
  totalProposta: number;
}

/** Total do item na proposta: `valor_total`, ou unitário × quantidade (ao centavo). */
function totalDoItemNaProposta(p: PropostaItemFornecedor, quantidade: number): number {
  const t = Number(p.valor_total);
  if (t > 0) return Math.round(t * 100) / 100;
  const u = Number(p.valor_unitario);
  return u > 0 ? Math.round(u * (Number(quantidade) || 1) * 100) / 100 : 0;
}

/**
 * O licitante pode disputar o lote? Só se cotou TODOS os itens do lote com
 * valor positivo (regra no cabeçalho). Lote sem itens: ninguém é elegível.
 */
export function elegibilidadeNoLote(itensDoLote: ItemDoLote[], propostaItens: PropostaItemFornecedor[]): ElegibilidadeLote {
  const porItem = new Map(propostaItens.map((p) => [String(p.itemId), p]));
  const itens: ItemPropostaLote[] = [];
  const itensNaoCotados: number[] = [];
  for (const item of [...itensDoLote].sort((a, b) => a.numero - b.numero)) {
    const p = porItem.get(String(item.id));
    const total = p ? totalDoItemNaProposta(p, item.quantidade) : 0;
    if (!(total > 0)) {
      itensNaoCotados.push(item.numero);
      continue;
    }
    itens.push({ itemId: item.id, numero: item.numero, quantidade: Number(item.quantidade) || 1, valorTotalProposta: total });
  }
  const elegivel = itensDoLote.length > 0 && itensNaoCotados.length === 0;
  return {
    elegivel,
    itensNaoCotados,
    itens: elegivel ? itens : [],
    totalProposta: elegivel ? totalPropostaLote(itens) : 0,
  };
}
