/**
 * CLASSIFICAÇÃO DA DISPENSA ELETRÔNICA (IN SEGES 67/2021) — regra pura, usada
 * pelo julgamento (`LicitacoesService.julgarDispensa`) e pela leitura da
 * classificação por item na tela do processo: o valor final de cada
 * fornecedor no item é o MENOR entre a proposta inicial e os seus próprios
 * lances da janela; lance de quem não tem proposta válida não conta.
 * Desempate (art. 60) é do julgamento, não desta ordenação.
 */

export interface LinhaPropostaDispensa {
  item_licitacao_id: string;
  valor_unitario: string;
  proposta_id: string;
  fornecedor_id: string;
  razao_social: string;
}

export interface LanceDispensa {
  item_licitacao_id: string;
  fornecedor_id: string;
  valor_unitario: number | string;
}

/** Melhor valor por (item, fornecedor): chave `${item}|${fornecedor}`. */
export function valoresFinaisDispensa(linhas: LinhaPropostaDispensa[], lances: LanceDispensa[]): Map<string, LinhaPropostaDispensa> {
  const dadosFornecedor = new Map<string, { proposta_id: string; razao_social: string }>();
  for (const l of linhas) {
    if (!dadosFornecedor.has(l.fornecedor_id)) dadosFornecedor.set(l.fornecedor_id, { proposta_id: l.proposta_id, razao_social: l.razao_social });
  }
  const melhor = new Map<string, LinhaPropostaDispensa>();
  const chave = (item: string, forn: string) => `${item}|${forn}`;
  // começa nas propostas…
  for (const l of linhas) {
    const k = chave(l.item_licitacao_id, l.fornecedor_id);
    const atual = melhor.get(k);
    if (!atual || Number(l.valor_unitario) < Number(atual.valor_unitario)) melhor.set(k, l);
  }
  // …e é reduzido pelos lances (só de fornecedores com proposta válida)
  for (const lance of lances) {
    const forn = dadosFornecedor.get(lance.fornecedor_id);
    if (!forn) continue;
    const k = chave(lance.item_licitacao_id, lance.fornecedor_id);
    const atual = melhor.get(k);
    if (atual && Number(lance.valor_unitario) < Number(atual.valor_unitario)) {
      melhor.set(k, {
        item_licitacao_id: lance.item_licitacao_id,
        valor_unitario: String(lance.valor_unitario),
        proposta_id: forn.proposta_id,
        fornecedor_id: lance.fornecedor_id,
        razao_social: forn.razao_social,
      });
    }
  }
  return melhor;
}

/** Classificação por item (menor valor final primeiro). */
export function classificacaoPorItem(
  valores: Map<string, LinhaPropostaDispensa>,
): Map<string, Array<{ posicao: number; fornecedor_id: string; razao_social: string; valor_unitario: number }>> {
  const porItem = new Map<string, LinhaPropostaDispensa[]>();
  for (const v of valores.values()) {
    const l = porItem.get(v.item_licitacao_id) ?? [];
    l.push(v);
    porItem.set(v.item_licitacao_id, l);
  }
  const saida = new Map<string, Array<{ posicao: number; fornecedor_id: string; razao_social: string; valor_unitario: number }>>();
  for (const [item, lista] of porItem) {
    saida.set(
      item,
      lista
        .sort((a, b) => Number(a.valor_unitario) - Number(b.valor_unitario))
        .map((v, i) => ({ posicao: i + 1, fornecedor_id: v.fornecedor_id, razao_social: v.razao_social, valor_unitario: Number(v.valor_unitario) })),
    );
  }
  return saida;
}
