import { impressaoConteudoPeca } from '../../fase-interna/peca-regras';
import { posicaoNaOrdem } from './autos-regras';

/**
 * ============================================================================
 * AUTOS EM ORDEM CRONOLÓGICA DE JUNTADA — regras puras (decisão do dono,
 * 27/09/2026; Lei nº 9.784/1999, art. 22, §4º: folhas numeradas em sequência;
 * nada se retira dos autos sem termo de desentranhamento)
 * ============================================================================
 *
 *  - Cada documento entra nos autos na ordem em que foi JUNTADO (peça anexada,
 *    peça emitida/assinada no sistema, despacho de tramitação, despacho de
 *    etapa, termos, documentos da fase externa). A folha atribuída na juntada
 *    é DEFINITIVA: é a mesma que a tela mostra e a mesma do PDF dos autos.
 *  - O "livro de juntadas" (`juntadas_autos`) guarda cada juntada com a sua
 *    faixa de folhas, o arquivo tal como juntado e a data da juntada.
 *  - Versão substituída CONTINUA nos autos, na folha original, anotada
 *    "Substituída pela versão N — fl. X"; a nova cita "Substitui a fl. Y".
 *  - Buraco na numeração (juntada cancelada, dado antigo) não é renumerado: a
 *    folha sai com a certidão "folha sem documento" e o índice explica.
 *  - Capa, termo de abertura (com a autuação — o "despacho nº 1") e índice
 *    abrem os autos SEM folha (as folhas das peças começam na fl. 1 desde a
 *    primeira juntada); o termo de encerramento fecha, também sem folha.
 */

export type NaturezaJuntada = 'PECA' | 'DESPACHO_TRAMITACAO' | 'DESPACHO_ETAPA' | 'DOCUMENTO' | 'TERMO';
export type OrigemJuntada = 'GERADA' | 'ASSINADA' | 'ANEXADA' | 'DOCUMENTO' | 'TERMO';

export const ROTULO_ORIGEM_JUNTADA: Record<OrigemJuntada, string> = {
  GERADA: 'Gerada no sistema',
  ASSINADA: 'Assinada no sistema',
  ANEXADA: 'Anexada (feita fora)',
  DOCUMENTO: 'Documento do processo',
  TERMO: 'Termo dos autos',
};

/** Regime dos autos do processo (tabela `autos_processo`; sem linha = cronológico). */
export type RegimeAutos = 'CRONOLOGICO' | 'LOGICO_LEGADO';
export const REGIME_CRONOLOGICO = 'CRONOLOGICO' as const;
export const REGIME_LEGADO = 'LOGICO_LEGADO' as const;

/** "Vaga" de uma peça nos autos: uma juntada nova da mesma vaga substitui a anterior. */
export const vagaDaPeca = (tipo: string) => `peca:${tipo}`;
export const vagaDoDespacho = (tramitacaoId: string) => `tramitacao:${tramitacaoId}`;
export const vagaDoDespachoDeEtapa = (despachoId: string) => `despacho-etapa:${despachoId}`;

/** A peça foi feita fora (anexada, espelhada, juntada em lote)? */
export function pecaAnexada(d: { origem?: string | null }): boolean {
  return String(d.origem ?? 'INTERNO') !== 'INTERNO';
}

/** Origem da juntada da peça (índice dos autos). */
export function origemDaPeca(d: { origem?: string | null; status?: string | null }): OrigemJuntada {
  if (pecaAnexada(d)) return 'ANEXADA';
  return d.status === 'ASSINADO' ? 'ASSINADA' : 'GERADA';
}

/**
 * CONTEÚDO da peça tal como juntado: anexada/assinada → o arquivo (hash);
 * feita no sistema → a impressão do texto emitido. Juntada que já tem este
 * conteúdo não se repete; conteúdo novo (versão nova, via assinada, peça
 * reemitida depois de editada) é uma juntada nova, que substitui a anterior.
 */
export function chaveConteudoPeca(d: {
  origem?: string | null;
  status?: string | null;
  caminho_arquivo?: string | null;
  hash_arquivo?: string | null;
  descricao?: string | null;
  dados_estruturados?: any;
}): string {
  if (pecaAnexada(d) || d.status === 'ASSINADO') return `arq:${d.hash_arquivo || d.caminho_arquivo || ''}`;
  return `txt:${impressaoConteudoPeca(d)}`;
}

/** Signatários da peça: as assinaturas colhidas; sem elas, os informados no anexo. */
export function signatariosDaPeca(d: { assinaturas?: any; signatarios_informados?: any }): string[] {
  const ass = Array.isArray(d.assinaturas) ? d.assinaturas : [];
  if (ass.length) return ass.map((a: any) => [a?.assinante_nome, a?.assinante_cargo].filter(Boolean).join(' — ')).filter(Boolean);
  const inf = Array.isArray(d.signatarios_informados) ? d.signatarios_informados : [];
  return inf.map((s: any) => [s?.nome, s?.cargo].filter(Boolean).join(' — ')).filter(Boolean);
}

/** Título do despacho de tramitação nos autos (envio ou devolução). */
export function tituloDoDespachoDeTramitacao(t: {
  sequencia: number;
  de_setor_nome?: string | null;
  para_setor_nome?: string | null;
  para_usuario_nome?: string | null;
  devolucao_de_id?: string | null;
  despacho?: string | null;
}): string {
  const devolucao = !!t.devolucao_de_id || /^DEVOLU[CÇ][AÃ]O:/i.test(String(t.despacho ?? ''));
  const para = [t.para_setor_nome, t.para_usuario_nome].filter(Boolean).join(' · ');
  return `${devolucao ? 'Despacho de devolução' : 'Despacho de tramitação'} nº ${t.sequencia}:${t.de_setor_nome ? ` de ${t.de_setor_nome}` : ''} para ${para || 'o destino'}`;
}

// ---------------------------------------------------------------------------
// Sequência das folhas (montagem)
// ---------------------------------------------------------------------------

export interface JuntadaNaSequencia {
  id: string;
  folha_inicial: number;
  folha_final: number;
  cancelada_em?: Date | string | null;
}

export type ItemDaSequencia<J> =
  | { tipo: 'JUNTADA'; juntada: J; folha_inicial: number; folha_final: number }
  | { tipo: 'SEM_DOCUMENTO'; folha_inicial: number; folha_final: number; cancelada: J | null };

/**
 * Folhas 1..N na ordem, SEM renumerar: cada juntada na sua faixa; folha sem
 * juntada (ou de juntada cancelada) vira "folha sem documento". Juntada que
 * cruza uma faixa já ocupada (dado inconsistente) fica de fora e é devolvida
 * em `conflitos` — nunca desloca as folhas das demais.
 */
export function sequenciaDeFolhas<J extends JuntadaNaSequencia>(juntadas: J[]): { itens: ItemDaSequencia<J>[]; total: number; conflitos: J[] } {
  const validas = juntadas
    .filter((j) => Number.isInteger(j.folha_inicial) && Number.isInteger(j.folha_final) && j.folha_inicial >= 1 && j.folha_final >= j.folha_inicial)
    .sort((a, b) => a.folha_inicial - b.folha_inicial || a.folha_final - b.folha_final);
  const itens: ItemDaSequencia<J>[] = [];
  const conflitos: J[] = [];
  let proxima = 1;
  for (const j of validas) {
    if (j.folha_inicial < proxima) {
      conflitos.push(j);
      continue;
    }
    if (j.folha_inicial > proxima) itens.push({ tipo: 'SEM_DOCUMENTO', folha_inicial: proxima, folha_final: j.folha_inicial - 1, cancelada: null });
    if (j.cancelada_em) itens.push({ tipo: 'SEM_DOCUMENTO', folha_inicial: j.folha_inicial, folha_final: j.folha_final, cancelada: j });
    else itens.push({ tipo: 'JUNTADA', juntada: j, folha_inicial: j.folha_inicial, folha_final: j.folha_final });
    proxima = j.folha_final + 1;
  }
  return { itens, total: proxima - 1, conflitos };
}

// ---------------------------------------------------------------------------
// Anotações das versões substituídas
// ---------------------------------------------------------------------------

export function rotuloFolhas(inicial: number, final?: number | null): string {
  return final && final > inicial ? `fls. ${inicial}–${final}` : `fl. ${inicial}`;
}

/** Carimbo da juntada substituída: "Substituída pela versão 2 — fl. 9". */
export function anotacaoSubstituida(nova: { versao?: number | null; folha_inicial: number; folha_final?: number | null; origem?: string | null } | null): string {
  if (!nova) return 'Substituída';
  const versao = nova.versao ? `pela versão ${nova.versao}${nova.origem === 'ASSINADA' ? ' assinada' : ''}` : 'por nova juntada';
  return `Substituída ${versao} — ${rotuloFolhas(nova.folha_inicial, nova.folha_final)}`;
}

/** Carimbo da juntada que substitui outra: "Substitui a fl. 5". */
export function anotacaoSubstitui(anterior: { folha_inicial: number; folha_final?: number | null }): string {
  const r = rotuloFolhas(anterior.folha_inicial, anterior.folha_final);
  return `Substitui a${r.startsWith('fls.') ? 's' : ''} ${r}`;
}

// ---------------------------------------------------------------------------
// Pendências de juntada (montagem e sincronização)
// ---------------------------------------------------------------------------

/**
 * Ordem em que as pendências são juntadas numa mesma rodada: pelo momento do
 * documento (quando nasceu/foi emitido) e, no empate, pela ordem lógica dos
 * autos (a peça antes do termo que a cita).
 */
export function ordenarPendencias<T extends { chave: string; momento?: Date | string | null }>(itens: T[]): T[] {
  const t = (d?: Date | string | null) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);
  return itens
    .map((p, i) => ({ p, i }))
    .sort((a, b) => t(a.p.momento) - t(b.p.momento) || posicaoNaOrdem(a.p.chave) - posicaoNaOrdem(b.p.chave) || a.i - b.i)
    .map((x) => x.p);
}

// ---------------------------------------------------------------------------
// Migração (dados existentes): recálculo UMA vez pela ordem cronológica
// ---------------------------------------------------------------------------

export interface ItemParaRenumerar {
  chave_item: string;
  momento: Date | string | null;
  /** Folha antiga (desempate: preserva a ordem que já existia). */
  folha_atual?: number | null;
  paginas: number;
}

/**
 * Folhas novas pela ordem cronológica de juntada (momento; desempate pela
 * folha antiga e pela ordem de chegada), contínuas a partir da fl. 1.
 */
export function planoDeRenumeracao<T extends ItemParaRenumerar>(itens: T[]): Array<T & { folha_inicial: number; folha_final: number }> {
  const t = (d: Date | string | null) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);
  let proxima = 1;
  return itens
    .map((it, i) => ({ it, i }))
    .sort((a, b) => t(a.it.momento) - t(b.it.momento) || (a.it.folha_atual ?? 1e9) - (b.it.folha_atual ?? 1e9) || a.i - b.i)
    .map(({ it }) => {
      const n = Math.max(1, Math.floor(Number(it.paginas) || 1));
      const faixa = { folha_inicial: proxima, folha_final: proxima + n - 1 };
      proxima += n;
      return { ...it, ...faixa };
    });
}

/**
 * Momento da juntada de uma peça que já existia (migração): anexada → quando
 * foi anexada; assinada → a última assinatura; feita no sistema → a emissão.
 */
export function momentoDaJuntadaDaPeca(d: {
  origem?: string | null;
  status?: string | null;
  data_importacao?: Date | string | null;
  created_at?: Date | string | null;
  updated_at?: Date | string | null;
  data_documento?: Date | string | null;
  data_geracao_arquivo?: Date | string | null;
  assinaturas?: any;
  dados_estruturados?: any;
}): Date | null {
  const data = (v: unknown): Date | null => {
    if (!v) return null;
    const x = new Date(v as any);
    return Number.isNaN(x.getTime()) ? null : x;
  };
  if (pecaAnexada(d)) return data(d.data_importacao) ?? data(d.created_at);
  const assinaturas = Array.isArray(d.assinaturas) ? d.assinaturas.map((a: any) => data(a?.data_assinatura)).filter(Boolean) as Date[] : [];
  if (d.status === 'ASSINADO' || assinaturas.length) {
    if (assinaturas.length) return new Date(Math.max(...assinaturas.map((x) => x.getTime())));
    return data(d.data_documento) ?? data(d.updated_at) ?? data(d.created_at);
  }
  const emitido = d.dados_estruturados?._emitido;
  if (emitido && !emitido.legado && data(emitido.em)) return data(emitido.em);
  return data(d.data_geracao_arquivo) ?? data(d.created_at);
}
