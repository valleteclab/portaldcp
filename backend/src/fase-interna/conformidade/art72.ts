/**
 * ART. 72 DA LEI 14.133/2021 — instrução da contratação direta, inciso a
 * inciso, mapeado às peças (Entrega 4; antes em `telas/autorizacao-regras.ts`,
 * que reexporta daqui). ÚNICA implementação usada:
 *  - pelo PORTÃO B do motor de conformidade (regras A72-I … A72-VIII);
 *  - pelo resumo da autorização no celular (E3B);
 *  - pelo roteiro do parecer (itens A72_*).
 *
 * Momento de cada inciso: I, II e IV são exigidos ANTES da autorização (portão
 * B); VIII é a própria autorização; III (parecer) vem depois; V e VI
 * (habilitação e razão da escolha) e VII (preço) são da fase externa / do
 * relatório do agente e não bloqueiam a autorização.
 */

export interface LinhaInstrucaoPortao {
  tipo: string;
  titulo: string;
  status: string; // OK | NAO_SE_APLICA | PENDENTE | EM_ELABORACAO | EM_APROVACAO | EM_ASSINATURA
  obrigatorio?: boolean;
  documento_id?: string | null;
}

export type MomentoInciso = 'ANTES' | 'ESTA_ETAPA' | 'DEPOIS' | 'FASE_EXTERNA';

export const INCISOS_ART72: Array<{ inciso: string; texto: string; tipos: string[]; momento: MomentoInciso }> = [
  { inciso: 'I', texto: 'Formalização da demanda e, se for o caso, estudo técnico, análise de riscos e termo de referência', tipos: ['DFD', 'ETP', 'AR', 'TR'], momento: 'ANTES' },
  { inciso: 'II', texto: 'Estimativa de despesa (art. 23)', tipos: ['PP'], momento: 'ANTES' },
  { inciso: 'III', texto: 'Parecer jurídico e pareceres técnicos, se for o caso', tipos: ['PJ'], momento: 'DEPOIS' },
  { inciso: 'IV', texto: 'Compatibilidade da previsão de recursos orçamentários', tipos: ['DO'], momento: 'ANTES' },
  { inciso: 'V', texto: 'Habilitação e qualificação mínima do contratado', tipos: [], momento: 'FASE_EXTERNA' },
  { inciso: 'VI', texto: 'Razão da escolha do contratado', tipos: ['RAG', 'JC'], momento: 'FASE_EXTERNA' },
  { inciso: 'VII', texto: 'Justificativa de preço', tipos: ['RAG', 'JC'], momento: 'FASE_EXTERNA' },
  { inciso: 'VIII', texto: 'Autorização da autoridade competente', tipos: ['AA'], momento: 'ESTA_ETAPA' },
];

export const PRONTA = new Set(['OK', 'NAO_SE_APLICA']);

export interface LinhaPortaoB {
  inciso: string;
  referencia: string;
  texto: string;
  momento: MomentoInciso;
  /** Exigido para autorizar (I, II e IV). */
  exigido: boolean;
  situacao: 'OK' | 'PENDENTE' | 'EM_ANDAMENTO' | 'DEPOIS';
  pecas: Array<{ tipo: string; titulo: string; status: string; documento_id?: string | null }>;
}

/** Peças do inciso presentes na instrução do processo (fora dela não contam). */
export function pecasDoInciso(itens: LinhaInstrucaoPortao[], tipos: string[]) {
  return tipos
    .map((t) => itens.find((x) => x.tipo === t))
    .filter((x): x is LinhaInstrucaoPortao => !!x)
    .map((x) => ({ tipo: x.tipo, titulo: x.titulo, status: x.status, documento_id: x.documento_id ?? null }));
}

/**
 * PORTÃO B — checklist do art. 72. Exigidos para autorizar: I, II e IV (toda
 * peça do inciso presente na instrução pronta ou "não se aplica"). Uma peça
 * do inciso fora da instrução do processo (ex.: rito completo) não conta.
 */
export function portaoBArt72(itens: LinhaInstrucaoPortao[]): { linhas: LinhaPortaoB[]; ok: boolean; pendentes: string[] } {
  const linhas: LinhaPortaoB[] = INCISOS_ART72.map((i) => {
    const pecas = pecasDoInciso(itens, i.tipos);
    const exigido = i.momento === 'ANTES';
    let situacao: LinhaPortaoB['situacao'];
    if (i.momento !== 'ANTES' && i.momento !== 'ESTA_ETAPA') situacao = pecas.length && pecas.every((p) => PRONTA.has(p.status)) ? 'OK' : 'DEPOIS';
    else if (!pecas.length) situacao = 'OK';
    else if (pecas.every((p) => PRONTA.has(p.status))) situacao = 'OK';
    else if (pecas.some((p) => p.status !== 'PENDENTE')) situacao = 'EM_ANDAMENTO';
    else situacao = 'PENDENTE';
    return { inciso: i.inciso, referencia: `Art. 72, ${i.inciso}`, texto: i.texto, momento: i.momento, exigido, situacao, pecas };
  });
  const pendentes = linhas.filter((l) => l.exigido && l.situacao !== 'OK').map((l) => `${l.referencia} — ${l.texto}`);
  return { linhas, ok: pendentes.length === 0, pendentes };
}

const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: 'pendente',
  EM_ELABORACAO: 'em elaboração',
  EM_APROVACAO: 'em aprovação',
  EM_ASSINATURA: 'aguardando assinaturas',
};

/**
 * Situação das peças de um conjunto de tipos (roteiro do parecer e regras
 * A72-*): fora da instrução → NAO_SE_APLICA; todas prontas → CONFORME; senão
 * PENDENTE com o que falta.
 */
export function situacaoDasPecasDoArt72(
  itens: LinhaInstrucaoPortao[],
  tipos: string[],
  rotulo: string,
): { situacao: 'NAO_SE_APLICA' | 'CONFORME' | 'PENDENTE'; detalhe: string; faltam: Array<{ tipo: string; titulo: string; status: string; documento_id?: string | null }> } {
  const presentes = pecasDoInciso(itens, tipos);
  if (!presentes.length) return { situacao: 'NAO_SE_APLICA', detalhe: `${rotulo}: fora da instrução deste processo`, faltam: [] };
  const faltam = presentes.filter((x) => !PRONTA.has(x.status));
  if (!faltam.length) return { situacao: 'CONFORME', detalhe: `${rotulo}: juntadas`, faltam: [] };
  return { situacao: 'PENDENTE', detalhe: `Falta(m): ${faltam.map((x) => x.tipo).join(', ')}`, faltam };
}

/** "ETP (em elaboração), TR (pendente)". */
export const descreverFaltantes = (faltam: Array<{ tipo: string; titulo: string; status: string }>) =>
  faltam.map((f) => `${f.titulo || f.tipo} (${ROTULO_STATUS[f.status] ?? f.status.toLowerCase()})`).join('; ');
