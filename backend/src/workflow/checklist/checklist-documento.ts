import { MODELOS_PADRAO } from '../../fase-interna/modelos-padrao';

/**
 * CHECKLIST DO DOCUMENTO DA ETAPA (mockup aprovado em 06/10/2026, tela
 * "Contratação 1"): os elementos que o documento precisa conter, conferidos
 * etapa a etapa. Para o ETP são os 13 incisos do art. 18, § 1º — a lista vem
 * do mesmo modelo padrão da fase interna (uma fonte só). Pela lei (art. 18,
 * § 2º) os incisos I, IV, VI, VIII e XIII são obrigatórios; os demais podem
 * faltar desde que justificados.
 */

export interface ItemChecklist {
  codigo: string;
  rotulo: string;
  fundamento: string;
  obrigatorio: boolean;
}

export type SituacaoItem = 'ATENDIDO' | 'NAO_SE_APLICA';

export interface MarcacaoItem {
  status: SituacaoItem;
  justificativa?: string | null;
  /** Quem marcou: a pessoa ou a leitura do documento pela IA (a pessoa confere). */
  origem: 'MANUAL' | 'IA';
  trecho?: string | null;
  em: string;
  por: string | null;
}

export type EstadoChecklist = Record<string, MarcacaoItem>;

/** Tipos de documento com checklist (por enquanto o ETP). */
const TIPOS_COM_CHECKLIST = ['ETP'];

const limparRotulo = (t: string) => t.replace(/^\d+\.\s*/, '').replace(/\s*\(inc\.[^)]*\)\s*\*?\s*$/i, '').replace(/\s*\*\s*$/, '').trim();

export function checklistDoDocumento(tipoDocumento: string | null | undefined): ItemChecklist[] {
  if (!tipoDocumento || !TIPOS_COM_CHECKLIST.includes(tipoDocumento)) return [];
  const modelo = MODELOS_PADRAO.find((m) => String(m.tipo) === tipoDocumento);
  return (modelo?.secoes ?? []).map((s: any) => ({
    codigo: String(s.id),
    rotulo: limparRotulo(String(s.titulo ?? s.id)),
    fundamento: String(s.fundamento_legal ?? ''),
    obrigatorio: !!s.obrigatorio,
  }));
}

/** O que impede concluir a etapa pelo checklist (vazio = pode). */
export function pendenciasDoChecklist(itens: ItemChecklist[], estado: EstadoChecklist | null | undefined): string[] {
  const e = estado ?? {};
  const pend: string[] = [];
  for (const i of itens) {
    const m = e[i.codigo];
    if (i.obrigatorio) {
      if (m?.status !== 'ATENDIDO') pend.push(`${i.rotulo} (${i.fundamento}) é obrigatório no documento (art. 18, § 2º).`);
    } else if (!m || (m.status === 'NAO_SE_APLICA' && !String(m.justificativa ?? '').trim())) {
      pend.push(`${i.rotulo} (${i.fundamento}): marque como atendido ou justifique por que não se aplica.`);
    }
  }
  return pend;
}

export function resumoDoChecklist(itens: ItemChecklist[], estado: EstadoChecklist | null | undefined) {
  const e = estado ?? {};
  const atendidos = itens.filter((i) => e[i.codigo]?.status === 'ATENDIDO').length;
  const justificados = itens.filter((i) => e[i.codigo]?.status === 'NAO_SE_APLICA' && String(e[i.codigo]?.justificativa ?? '').trim()).length;
  return { total: itens.length, atendidos, justificados, pendencias: pendenciasDoChecklist(itens, estado) };
}

/** Aplica a marcação de um item (null = desmarcar); valida código e justificativa. */
export function marcarItem(
  itens: ItemChecklist[],
  estado: EstadoChecklist | null | undefined,
  codigo: string,
  status: SituacaoItem | null,
  justificativa: string | null,
  por: string | null,
  agora = new Date(),
): EstadoChecklist {
  const item = itens.find((i) => i.codigo === codigo);
  if (!item) throw new Error('Elemento do checklist inexistente.');
  const novo = { ...(estado ?? {}) };
  if (status === null) {
    delete novo[codigo];
    return novo;
  }
  if (status === 'NAO_SE_APLICA') {
    if (item.obrigatorio) throw new Error(`${item.rotulo} é obrigatório (art. 18, § 2º): não pode ser marcado como "não se aplica".`);
    const j = String(justificativa ?? '').trim();
    if (j.length < 10) throw new Error('Justifique em pelo menos 10 caracteres por que o elemento não se aplica.');
    novo[codigo] = { status, justificativa: j.slice(0, 2000), origem: 'MANUAL', em: agora.toISOString(), por };
    return novo;
  }
  novo[codigo] = { status: 'ATENDIDO', justificativa: null, origem: 'MANUAL', em: agora.toISOString(), por };
  return novo;
}

/**
 * Resultado da leitura pela IA: marca como atendidos os elementos encontrados,
 * sem desfazer o que a pessoa já marcou à mão.
 */
export function aplicarLeituraDaIa(
  itens: ItemChecklist[],
  estado: EstadoChecklist | null | undefined,
  leitura: Array<{ codigo: string; presente: boolean; trecho?: string | null }>,
  agora = new Date(),
): EstadoChecklist {
  const novo = { ...(estado ?? {}) };
  const validos = new Set(itens.map((i) => i.codigo));
  for (const l of leitura) {
    if (!validos.has(l.codigo) || !l.presente) continue;
    if (novo[l.codigo]?.origem === 'MANUAL') continue;
    novo[l.codigo] = { status: 'ATENDIDO', origem: 'IA', trecho: l.trecho ? String(l.trecho).slice(0, 300) : null, justificativa: null, em: agora.toISOString(), por: null };
  }
  return novo;
}
