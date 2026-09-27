/**
 * MINUTAS GERADAS POR MODELO (Entrega 3B) — regras puras.
 *
 *  - Toda peça gerada pelo modelo guarda a "impressão" do texto gerado
 *    (`dados_estruturados._gerado.hash`). Se o texto atual das seções ainda é
 *    o gerado, a peça NÃO foi editada à mão e pode ser REGERADA quando o
 *    processo muda (fundamento legal, número, sigilo) — critério de aceite da
 *    SPEC: "mudar `fundamento_legal` atualiza as minutas geradas por modelo".
 *  - Editada à mão, assinada ou em assinatura: não se mexe no texto; a peça
 *    ganha o aviso "desatualizada — regerar?".
 *  - Conferência de vinculação (VINC-01) e enquadramento citado (ENQ-01):
 *    implementadas no motor de conformidade (`conformidade/texto.ts`, Entrega
 *    4) e reexportadas aqui — uma implementação só.
 */
import { createHash } from 'crypto';

/** Peças geradas pelo modelo que acompanham os dados do processo. */
export const TIPOS_REGERAVEIS = ['AA', 'RAG', 'ME', 'MC'] as const;
export type TipoRegeravel = (typeof TIPOS_REGERAVEIS)[number];

/** Seções (texto) de uma peça — ignora as chaves internas (`_…`) e as não-texto. */
export function secoesDaPeca(dados: unknown): Record<string, string> {
  if (!dados || typeof dados !== 'object') return {};
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(dados as Record<string, unknown>)) {
    if (k.startsWith('_') || typeof v !== 'string') continue;
    if (['nao_se_aplica', 'justificativa_nao_se_aplica'].includes(k)) continue;
    r[k] = v;
  }
  return r;
}

/** Impressão estável do texto das seções (ordem das chaves não importa). */
export function hashSecoes(secoes: Record<string, string>): string {
  const ordenado = Object.keys(secoes)
    .sort()
    .map((k) => [k, String(secoes[k] ?? '').trim()]);
  return createHash('sha256').update(JSON.stringify(ordenado)).digest('hex');
}

export interface PecaParaRegerar {
  id: string;
  tipo: string;
  status: string;
  origem: string;
  dados_estruturados: any;
}

export type DecisaoRegeracao =
  | { acao: 'REGERAR' }
  | { acao: 'MARCAR_DESATUALIZADA'; motivo: 'EDITADA' | 'ASSINADA' | 'EM_ASSINATURA' | 'APROVADA' }
  | { acao: 'IGNORAR'; motivo: 'NAO_GERADA' | 'ANEXADA' | 'NAO_SE_APLICA' | 'SUBSTITUIDA' };

/** A peça foi editada à mão depois de gerada? */
export function pecaEditadaAMao(doc: Pick<PecaParaRegerar, 'dados_estruturados'>): boolean {
  const g = doc.dados_estruturados?._gerado;
  if (!g?.hash) return false;
  return hashSecoes(secoesDaPeca(doc.dados_estruturados)) !== g.hash;
}

/**
 * O que fazer com a peça quando o processo muda (fundamento, número, sigilo):
 *  - não gerada pelo modelo, anexada (feita fora), "não se aplica" ou versão
 *    antiga → nada;
 *  - assinada ou aguardando assinatura → aviso (não se reescreve peça assinada);
 *  - editada à mão → aviso "desatualizada, regerar?";
 *  - gerada e intocada → regerar.
 */
export function decidirRegeracao(doc: PecaParaRegerar): DecisaoRegeracao {
  const dados = doc.dados_estruturados || {};
  if (doc.status === 'SUBSTITUIDO') return { acao: 'IGNORAR', motivo: 'SUBSTITUIDA' };
  if (dados.nao_se_aplica) return { acao: 'IGNORAR', motivo: 'NAO_SE_APLICA' };
  if (doc.origem !== 'INTERNO') return { acao: 'IGNORAR', motivo: 'ANEXADA' };
  if (!dados._gerado?.hash) return { acao: 'IGNORAR', motivo: 'NAO_GERADA' };
  if (doc.status === 'ASSINADO') return { acao: 'MARCAR_DESATUALIZADA', motivo: 'ASSINADA' };
  if (doc.status === 'AGUARDANDO_ASSINATURA') return { acao: 'MARCAR_DESATUALIZADA', motivo: 'EM_ASSINATURA' };
  if (doc.status === 'APROVADO') return { acao: 'MARCAR_DESATUALIZADA', motivo: 'APROVADA' };
  if (pecaEditadaAMao(doc)) return { acao: 'MARCAR_DESATUALIZADA', motivo: 'EDITADA' };
  return { acao: 'REGERAR' };
}

/** Rótulo (do `MinutasSubscriber`) da mudança do modo de disputa da dispensa. */
export const CAMPO_DISPUTA_DISPENSA = 'disputa da dispensa (com/sem lances)';

/**
 * O que, da mudança do processo, afeta ESTA peça. Decisão do dono
 * (homologação 26/09/2026): com ou sem lances é escolha do agente de
 * contratação no processo (Lei 14.133/2021, art. 75, §3º — a condução da
 * seleção), não da autoridade — trocar o modo de disputa NÃO desatualiza o
 * despacho de autorização (art. 72, VIII: a autoridade autoriza o objeto, o
 * enquadramento, o teto e a dotação; o texto do despacho não cita a disputa).
 * A minuta do aviso continua acompanhando (ela cita a forma de disputa).
 */
export function camposQueAfetamAPeca(tipo: string, campos: string[]): string[] {
  if (tipo === 'AA') return campos.filter((c) => c !== CAMPO_DISPUTA_DISPENSA);
  return campos;
}

/** A marca "desatualizada" ainda vale para a peça? (a do despacho só pela disputa deixou de valer). */
export function desatualizacaoRelevante(tipo: string, marca: { campos?: unknown } | null | undefined): boolean {
  if (!marca) return false;
  if (!Array.isArray(marca.campos)) return true;
  return camposQueAfetamAPeca(tipo, marca.campos.map(String)).length > 0;
}

// ---------------------------------------------------------------------------
// Conferências de texto — a implementação é a do motor de conformidade
// (Entrega 4: `conformidade/texto.ts`); reexportadas aqui para quem já usava.
// ---------------------------------------------------------------------------

export { textoPuro, normalizarNumero, referenciasDivergentes, incisosDoArt75Citados } from '../conformidade/texto';

/**
 * Sigilo do orçamento (art. 24): sigiloso exige justificativa (mínimo 20
 * caracteres). Regra única — tela das minutas (`salvarSigilo`) e a entrada
 * "fase interna feita fora".
 */
export function motivoSigiloInvalido(sigiloso: boolean, justificativa: string | null | undefined): string | null {
  if (sigiloso && String(justificativa ?? '').trim().length < 20) return 'Justifique o sigilo do orçamento (art. 24 da Lei 14.133/2021).';
  return null;
}
