/**
 * DFD CONSOLIDADO — regras PURAS (sem banco).
 *
 * A DEMANDA é o pedido de qualquer setor (o que precisa, quanto, por quê,
 * para quando). O DFD é feito pela UNIDADE DE PLANEJAMENTO: junta os pedidos
 * parecidos de vários setores num único documento (Lei 14.133, art. 12, VII —
 * evita o fracionamento, art. 75, §1º) e abre UM processo.
 *
 *  - `chaveDoItem`: itens iguais somam pelo CÓDIGO do item do catálogo quando
 *    houver; senão pela classe + descrição (sempre na mesma unidade);
 *  - `consolidarItens`: soma as quantidades, guarda de qual demanda/setor veio
 *    cada quantidade e aplica os ajustes do planejamento;
 *  - `sugestoesDoDfd`: objeto, justificativa, data pretendida, prioridade e
 *    item do PCA sugeridos a partir das demandas;
 *  - `parecidos`: alerta de fracionamento (atenção, não bloqueio) — outra
 *    demanda aprovada não consolidada, outro DFD ou processo do exercício com
 *    itens do mesmo código ou da mesma classe.
 */

export interface ItemDeDemanda {
  id: string;
  categoria: string;
  codigo_classe?: string | null;
  nome_classe?: string | null;
  codigo_item_catalogo?: string | null;
  descricao_objeto: string;
  justificativa?: string | null;
  quantidade_estimada: number | string | null;
  unidade_medida?: string | null;
  valor_unitario_estimado?: number | string | null;
  valor_total_estimado?: number | string | null;
  prioridade?: number | null;
  item_pca_id?: string | null;
  data_desejada_contratacao?: string | Date | null;
}

export interface DemandaParaDfd {
  id: string;
  unidade_requisitante: string;
  setor_id?: string | null;
  descricao_sucinta_objeto?: string | null;
  observacoes?: string | null;
  data_desejada_contratacao?: string | Date | null;
  ano_referencia?: number | null;
  itens: ItemDeDemanda[];
}

export interface OrigemItem {
  demanda_id: string;
  item_demanda_id: string;
  setor: string;
  quantidade: number;
  valor_unitario: number;
}

export interface AjusteItem {
  quantidade?: number | null;
  valor_unitario_estimado?: number | null;
  descricao?: string | null;
  justificativa?: string | null;
  remover?: boolean;
}

export interface ItemConsolidado {
  chave: string;
  numero: number;
  categoria: 'MATERIAL' | 'SERVICO';
  codigo_item_catalogo: string | null;
  codigo_classe: string | null;
  nome_classe: string | null;
  descricao: string;
  unidade_medida: string;
  /** Soma das quantidades pedidas pelas demandas. */
  quantidade_somada: number;
  /** Quantidade do DFD (a somada, ou a ajustada pelo planejamento). */
  quantidade: number;
  valor_unitario_estimado: number;
  valor_total_estimado: number;
  /** Item do PCA comum a todas as origens (senão null). */
  item_pca_id: string | null;
  justificativa: string | null;
  /** Maior prioridade entre as origens (1 = muito alta … 5 = muito baixa). */
  prioridade: number | null;
  origens: OrigemItem[];
  ajustado: boolean;
  justificativa_ajuste: string | null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const arred = (n: number, casas = 2) => {
  const f = 10 ** casas;
  return Math.round((n + Number.EPSILON) * f) / f;
};
const limpo = (v: unknown) => String(v ?? '').trim();
/** Descrição/unidade comparáveis: sem acento, maiúsculas, espaços simples. */
export const normalizar = (v: unknown) =>
  limpo(v)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ');

const UNIDADE_EQUIVALENTE: Record<string, string> = {
  UN: 'UNIDADE',
  UND: 'UNIDADE',
  UNID: 'UNIDADE',
  PC: 'PECA',
  CX: 'CAIXA',
  PCT: 'PACOTE',
  KG: 'QUILOGRAMA',
  L: 'LITRO',
  LT: 'LITRO',
  M: 'METRO',
  H: 'HORA',
  HR: 'HORA',
  MES: 'MES',
  MESES: 'MES',
};
export const normalizarUnidade = (u: unknown) => {
  const v = normalizar(u) || 'UNIDADE';
  return UNIDADE_EQUIVALENTE[v] ?? v;
};

const categoriaDe = (c: unknown): 'MATERIAL' | 'SERVICO' => (normalizar(c) === 'SERVICO' ? 'SERVICO' : 'MATERIAL');

/**
 * Chave de soma do item: pelo CÓDIGO do item do catálogo quando houver;
 * senão pela classe + descrição. Sempre na mesma unidade (unidades
 * diferentes não se somam).
 */
export function chaveDoItem(i: Pick<ItemDeDemanda, 'categoria' | 'codigo_item_catalogo' | 'codigo_classe' | 'nome_classe' | 'descricao_objeto' | 'unidade_medida'>): string {
  const unidade = normalizarUnidade(i.unidade_medida);
  const codigo = normalizar(i.codigo_item_catalogo);
  if (codigo) return `COD:${codigo}|${unidade}`;
  const classe = normalizar(i.codigo_classe) || normalizar(i.nome_classe);
  return `CLS:${categoriaDe(i.categoria)}|${classe}|${normalizar(i.descricao_objeto)}|${unidade}`;
}

/**
 * Soma os itens das demandas por `chaveDoItem`, guardando a origem (demanda,
 * item e setor) de cada quantidade, e aplica os ajustes do planejamento
 * (quantidade, valor unitário, descrição; remover). Valor unitário somado =
 * média ponderada (total ÷ quantidade). A numeração segue a ordem de entrada.
 */
export function consolidarItens(demandas: DemandaParaDfd[], ajustes: Record<string, AjusteItem> = {}): ItemConsolidado[] {
  const mapa = new Map<string, ItemConsolidado & { _total: number; _pcas: Set<string | null>; _just: string[] }>();
  for (const d of demandas) {
    for (const i of d.itens ?? []) {
      const chave = chaveDoItem(i);
      const qtd = num(i.quantidade_estimada) || 0;
      const unit = num(i.valor_unitario_estimado);
      const total = i.valor_total_estimado !== null && i.valor_total_estimado !== undefined && limpo(i.valor_total_estimado) !== '' ? num(i.valor_total_estimado) : qtd * unit;
      let atual = mapa.get(chave);
      if (!atual) {
        atual = {
          chave,
          numero: mapa.size + 1,
          categoria: categoriaDe(i.categoria),
          codigo_item_catalogo: limpo(i.codigo_item_catalogo) || null,
          codigo_classe: limpo(i.codigo_classe) || null,
          nome_classe: limpo(i.nome_classe) || null,
          descricao: limpo(i.descricao_objeto),
          unidade_medida: limpo(i.unidade_medida) || 'UN',
          quantidade_somada: 0,
          quantidade: 0,
          valor_unitario_estimado: 0,
          valor_total_estimado: 0,
          item_pca_id: null,
          justificativa: null,
          prioridade: null,
          origens: [],
          ajustado: false,
          justificativa_ajuste: null,
          _total: 0,
          _pcas: new Set(),
          _just: [],
        };
        mapa.set(chave, atual);
      }
      atual.quantidade_somada = arred(atual.quantidade_somada + qtd, 4);
      atual._total += total;
      atual._pcas.add(limpo(i.item_pca_id) || null);
      if (limpo(i.justificativa)) atual._just.push(`${d.unidade_requisitante}: ${limpo(i.justificativa)}`);
      const p = Number(i.prioridade);
      if (Number.isFinite(p) && p > 0) atual.prioridade = atual.prioridade === null ? p : Math.min(atual.prioridade, p);
      atual.origens.push({ demanda_id: d.id, item_demanda_id: i.id, setor: d.unidade_requisitante, quantidade: qtd, valor_unitario: unit });
    }
  }
  const saida: ItemConsolidado[] = [];
  for (const a of mapa.values()) {
    const { _total, _pcas, _just, ...item } = a;
    item.valor_unitario_estimado = item.quantidade_somada > 0 ? arred(_total / item.quantidade_somada) : 0;
    item.quantidade = item.quantidade_somada;
    item.item_pca_id = _pcas.size === 1 ? [..._pcas][0] : null;
    item.justificativa = _just.length ? _just.join(' | ').slice(0, 4000) : null;
    const aj = ajustes[item.chave];
    if (aj?.remover) continue;
    if (aj) {
      if (aj.quantidade !== undefined && aj.quantidade !== null && num(aj.quantidade) > 0 && num(aj.quantidade) !== item.quantidade_somada) {
        item.quantidade = arred(num(aj.quantidade), 4);
        item.ajustado = true;
      }
      if (aj.valor_unitario_estimado !== undefined && aj.valor_unitario_estimado !== null && num(aj.valor_unitario_estimado) >= 0 && num(aj.valor_unitario_estimado) !== item.valor_unitario_estimado) {
        item.valor_unitario_estimado = arred(num(aj.valor_unitario_estimado));
        item.ajustado = true;
      }
      if (limpo(aj.descricao) && limpo(aj.descricao) !== item.descricao) {
        item.descricao = limpo(aj.descricao).slice(0, 4000);
        item.ajustado = true;
      }
      item.justificativa_ajuste = limpo(aj.justificativa) || null;
    }
    item.valor_total_estimado = arred(item.quantidade * item.valor_unitario_estimado);
    saida.push(item);
  }
  saida.forEach((i, n) => (i.numero = n + 1));
  return saida;
}

/** Ajustes que ainda apontam para itens existentes (demanda retirada leva o ajuste junto). */
export function ajustesValidos(itens: Pick<ItemConsolidado, 'chave'>[], ajustes: Record<string, AjusteItem>, chavesRemovidas: string[] = []): Record<string, AjusteItem> {
  const existentes = new Set([...itens.map((i) => i.chave), ...chavesRemovidas]);
  const r: Record<string, AjusteItem> = {};
  for (const [k, v] of Object.entries(ajustes ?? {})) if (existentes.has(k)) r[k] = v;
  return r;
}

export const valorTotalDosItens = (itens: Pick<ItemConsolidado, 'valor_total_estimado'>[]) => arred(itens.reduce((s, i) => s + num(i.valor_total_estimado), 0));

export type PrioridadeDfd = 'URGENTE' | 'ALTA' | 'MEDIA' | 'BAIXA';
export const PRIORIDADES_DFD: PrioridadeDfd[] = ['BAIXA', 'MEDIA', 'ALTA', 'URGENTE'];

/** Prioridade do item (1 = muito alta … 5 = muito baixa) → prioridade da peça DFD. */
export function prioridadeDoDfd(p: number | null | undefined): PrioridadeDfd | null {
  if (p === null || p === undefined || !Number.isFinite(Number(p)) || Number(p) <= 0) return null;
  const n = Number(p);
  return n <= 1 ? 'URGENTE' : n === 2 ? 'ALTA' : n === 3 ? 'MEDIA' : 'BAIXA';
}

const dataIso = (d: string | Date | null | undefined): string | null => {
  if (!d) return null;
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  const s = String(d).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

export interface SugestoesDfd {
  objeto: string;
  justificativa: string;
  data_pretendida: string | null;
  prioridade: PrioridadeDfd | null;
  item_pca_id: string | null;
  categoria: 'MATERIAL' | 'SERVICO';
  setores: string[];
}

/**
 * Campos sugeridos do DFD a partir das demandas: objeto (a demanda única, a
 * classe comum ou "consolidação de N demandas"), justificativa (a de cada
 * setor), a data pretendida mais cedo, a prioridade mais alta e o item do
 * PCA quando TODOS os itens apontam o mesmo.
 */
export function sugestoesDoDfd(demandas: DemandaParaDfd[], itens: ItemConsolidado[]): SugestoesDfd {
  const setores = [...new Set(demandas.map((d) => limpo(d.unidade_requisitante)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  let objeto: string;
  const classes = new Set(itens.map((i) => normalizar(i.nome_classe) || normalizar(i.codigo_classe)).filter(Boolean));
  if (demandas.length === 1) {
    const d = demandas[0];
    objeto = limpo(d.descricao_sucinta_objeto) || (itens.length === 1 ? itens[0].descricao : `Contratação referente à demanda de ${d.unidade_requisitante}`);
  } else if (classes.size === 1 && itens[0]?.nome_classe) {
    objeto = `${itens.some((i) => i.categoria === 'SERVICO') ? 'Contratação de' : 'Aquisição de'} ${itens[0].nome_classe} — consolidação das demandas de ${setores.join(', ')}`;
  } else {
    objeto = `Contratação consolidada de ${demandas.length} demandas (${setores.join(', ')})`;
  }
  const justificativa = demandas
    .map((d) => {
      const partes = [limpo(d.descricao_sucinta_objeto), limpo(d.observacoes)].filter(Boolean);
      return partes.length ? `${d.unidade_requisitante}: ${partes.join(' — ')}` : '';
    })
    .filter(Boolean)
    .join('\n');
  const datas = [
    ...demandas.map((d) => dataIso(d.data_desejada_contratacao)),
    ...demandas.flatMap((d) => (d.itens ?? []).map((i) => dataIso(i.data_desejada_contratacao))),
  ].filter((x): x is string => !!x);
  const prioridades = itens.map((i) => i.prioridade).filter((p): p is number => p !== null);
  const todosPcas = demandas.flatMap((d) => (d.itens ?? []).map((i) => limpo(i.item_pca_id) || null));
  const unicoPca = todosPcas.length > 0 && todosPcas.every((p) => p && p === todosPcas[0]) ? todosPcas[0] : null;
  return {
    objeto: objeto.slice(0, 4000),
    justificativa: justificativa.slice(0, 8000),
    data_pretendida: datas.length ? datas.sort()[0] : null,
    prioridade: prioridadeDoDfd(prioridades.length ? Math.min(...prioridades) : null),
    item_pca_id: unicoPca,
    categoria: itens.some((i) => i.categoria === 'SERVICO') ? 'SERVICO' : 'MATERIAL',
    setores,
  };
}

// ---------------------------------------------------------------------------
// Alerta de parecidos (fracionamento — art. 12, VII, e art. 75, §1º)
// ---------------------------------------------------------------------------

export interface MarcaItem {
  categoria?: string | null;
  codigo?: string | null;
  classe?: string | null;
}

export interface CandidatoParecido {
  tipo: 'DEMANDA' | 'DFD' | 'PROCESSO';
  id: string;
  rotulo: string;
  link: string;
  situacao?: string | null;
  itens: MarcaItem[];
}

export interface Parecido {
  tipo: CandidatoParecido['tipo'];
  id: string;
  rotulo: string;
  link: string;
  situacao: string | null;
  /** O que bate: "código X" / "classe Y". */
  motivos: string[];
}

/** Códigos e classes dos itens (o que o alerta compara). */
export function marcasDosItens(itens: Array<Pick<ItemConsolidado, 'categoria' | 'codigo_item_catalogo' | 'codigo_classe' | 'nome_classe'>>): MarcaItem[] {
  return itens.map((i) => ({ categoria: i.categoria, codigo: i.codigo_item_catalogo, classe: i.codigo_classe || i.nome_classe }));
}

/**
 * Outros pedidos do exercício com itens do MESMO código do catálogo ou da
 * MESMA classe. É ATENÇÃO (a Administração decide juntar ou justificar),
 * nunca bloqueio. Um candidato aparece uma vez, com os motivos.
 */
export function parecidos(alvo: MarcaItem[], candidatos: CandidatoParecido[]): Parecido[] {
  const codigos = new Set(alvo.map((m) => normalizar(m.codigo)).filter(Boolean));
  const classes = new Set(alvo.map((m) => normalizar(m.classe)).filter(Boolean));
  const saida: Parecido[] = [];
  for (const c of candidatos) {
    const motivos = new Set<string>();
    for (const m of c.itens) {
      const cod = normalizar(m.codigo);
      const cls = normalizar(m.classe);
      if (cod && codigos.has(cod)) motivos.add(`mesmo item do catálogo (${limpo(m.codigo)})`);
      else if (cls && classes.has(cls)) motivos.add(`mesma classe (${limpo(m.classe)})`);
    }
    if (motivos.size) saida.push({ tipo: c.tipo, id: c.id, rotulo: c.rotulo, link: c.link, situacao: c.situacao ?? null, motivos: [...motivos] });
  }
  const ordem = { DEMANDA: 0, DFD: 1, PROCESSO: 2 } as const;
  return saida.sort((a, b) => ordem[a.tipo] - ordem[b.tipo] || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
}

/** Texto curto do alerta (histórico do processo / resposta da API). */
export function textoDoAlerta(lista: Parecido[]): string | null {
  if (!lista.length) return null;
  const nomes = { DEMANDA: 'demanda', DFD: 'DFD', PROCESSO: 'processo' } as const;
  const partes = lista.slice(0, 8).map((p) => `${nomes[p.tipo]} ${p.rotulo} (${p.motivos.join('; ')})`);
  return (
    `Atenção (art. 12, VII, e art. 75, §1º, da Lei nº 14.133/2021): há no mesmo exercício ${lista.length === 1 ? 'outro pedido parecido' : `${lista.length} pedidos parecidos`} — ` +
    `${partes.join('; ')}${lista.length > 8 ? '; …' : ''}. Avalie juntar num único DFD ou justifique a contratação em separado.`
  );
}
