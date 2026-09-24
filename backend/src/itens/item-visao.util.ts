import { licitacaoParaOrgao, licitacaoParaPublico } from '../licitacoes/licitacao-visao.util';

/**
 * VISÕES DO ITEM DE LICITAÇÃO (E1a) — reaproveita as regras da licitação
 * (licitacao-visao.util.ts):
 *  - órgão dono / admin: item completo;
 *  - público / fornecedor / outro órgão: sem `melhor_lance_fornecedor_id`
 *    (identidade de licitante durante a disputa) e, com orçamento SIGILOSO
 *    (art. 24), sem os valores estimados.
 */

export interface LicitacaoDoItem {
  sigilo_orcamento?: string | null;
  [k: string]: any;
}

/** Itens na visão pública, conforme a licitação a que pertencem. */
export function itensParaPublico<T extends Record<string, any>>(itens: T[], lic: LicitacaoDoItem): T[] {
  const semRelacao = itens.map((i) => {
    const { licitacao: _lic, ...resto } = i as any;
    return resto;
  });
  const visao = licitacaoParaPublico({ sigilo_orcamento: lic?.sigilo_orcamento ?? null, itens: semRelacao });
  return visao.itens.map((item: any, idx: number) => {
    const original: any = itens[idx];
    return original && 'licitacao' in original && original.licitacao
      ? { ...item, licitacao: licitacaoParaPublico(original.licitacao) }
      : item;
  });
}

export function itemParaPublico<T extends Record<string, any>>(item: T, lic: LicitacaoDoItem): T {
  return itensParaPublico([item], lic)[0];
}

/** Item para o órgão dono: completo (licitação relacionada sem credenciais do órgão). */
export function itemParaOrgao<T extends Record<string, any>>(item: T): T {
  if (!item || typeof item !== 'object') return item;
  const i: any = item;
  return i.licitacao ? ({ ...i, licitacao: licitacaoParaOrgao(i.licitacao) } as T) : item;
}
