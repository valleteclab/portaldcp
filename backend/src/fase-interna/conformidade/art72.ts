/**
 * ART. 72 DA LEI 14.133/2021 — instrução da contratação direta, inciso a
 * inciso, mapeado às peças (Entrega 4; antes em `telas/autorizacao-regras.ts`,
 * que reexporta daqui). ÚNICA implementação usada:
 *  - pelo PORTÃO B do motor de conformidade (regras A72-I … A72-VIII);
 *  - pelo resumo da autorização no celular (E3B);
 *  - pelo roteiro do parecer (itens A72_*).
 *
 * Momento de cada inciso: I, II e IV são exigidos ANTES da autorização (portão
 * B); VIII é a própria autorização; III (parecer) vem depois; V (habilitação)
 * é da fase externa. VI (razão da escolha) e VII (preço) dependem da
 * modalidade: após a seleção na dispensa eletrônica e no credenciamento; antes
 * da autorização na contratação direta sem aviso (`momentoDoInciso`).
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

/**
 * Incisos que NÃO admitem "não se aplica": o IV (compatibilidade da previsão
 * de recursos orçamentários) não é "se for o caso" — toda contratação tem
 * dotação. A informação orçamentária é emitida (reserva) ou anexada; um "não
 * se aplica" gravado antes desta regra (processo antigo) não supre o inciso.
 */
export const INCISOS_SEM_NAO_SE_APLICA = new Set(['IV']);
export const SO_PRONTA = new Set(['OK']);

/** Statuses que contam como "pronta" para o inciso (o IV só aceita a peça feita/anexada). */
export const prontaNoInciso = (inciso: string): Set<string> => (INCISOS_SEM_NAO_SE_APLICA.has(inciso) ? SO_PRONTA : PRONTA);

/**
 * RAZÃO DA ESCOLHA (VI) E JUSTIFICATIVA DE PREÇO (VII) — o momento depende de
 * COMO o contratado é escolhido (homologação 26/09/2026):
 *  - dispensa ELETRÔNICA (com ou sem lances): o contratado e o preço final
 *    resultam das propostas recebidas depois da divulgação do aviso (Lei
 *    14.133/2021, art. 75, §3º; IN SEGES/ME 67/2021) — cumpridos APÓS A
 *    SELEÇÃO, conferidos no parecer da fase externa, antes da adjudicação;
 *  - credenciamento: contrata-se todo interessado que atenda ao edital de
 *    chamamento (art. 79) — idem, depois do chamamento;
 *  - contratação direta SEM aviso (inexigibilidade, art. 74): o contratado é
 *    definido antes — VI e VII são exigidos ANTES da autorização (portão B).
 */
export const MODALIDADES_SELECAO_POSTERIOR = ['DISPENSA_ELETRONICA', 'CREDENCIAMENTO'];

export const selecaoPosterior = (modalidade: string | null | undefined) => MODALIDADES_SELECAO_POSTERIOR.includes(String(modalidade ?? ''));

/** Contratação direta SEM aviso nem disputa: o contratado é definido antes da autorização (inexigibilidade, art. 74). */
export const MODALIDADES_SEM_AVISO = ['INEXIGIBILIDADE'];
export const contratacaoSemAviso = (modalidade: string | null | undefined) => MODALIDADES_SEM_AVISO.includes(String(modalidade ?? ''));

/** Peças que trazem a razão da escolha e a justificativa do preço (VI e VII). */
export const TIPOS_ESCOLHA_PRECO = ['RAG', 'JC'];

export function motivoEscolhaAposSelecao(modalidade: string | null | undefined): string {
  return modalidade === 'CREDENCIAMENTO'
    ? 'Cumprido após o chamamento: no credenciamento contrata-se todo interessado que atenda ao edital (art. 79); a escolha e o preço decorrem do chamamento.'
    : 'Cumprido após a seleção do fornecedor: na dispensa eletrônica (com ou sem lances) o contratado e o preço final resultam das propostas recebidas depois da divulgação do aviso (art. 75, §3º; IN SEGES/ME 67/2021). A razão da escolha e a justificativa do preço final são conferidas no parecer da fase externa, antes da adjudicação.';
}

/** Momento do inciso para a modalidade do processo (VI e VII mudam — ver acima). */
export function momentoDoInciso(inciso: string, modalidade?: string | null): MomentoInciso {
  const def = INCISOS_ART72.find((i) => i.inciso === inciso);
  if ((inciso === 'VI' || inciso === 'VII') && contratacaoSemAviso(modalidade)) return 'ANTES';
  return def?.momento ?? 'DEPOIS';
}

/**
 * VI/VII na contratação direta sem aviso: ao menos UMA peça pronta (feita e
 * emitida, anexada ou assinada) com a razão da escolha e o preço — o relatório
 * do agente ou a justificativa da contratação direta. "Não se aplica" não
 * supre: os incisos VI e VII não são "se for o caso".
 */
export function situacaoEscolhaPreco(itens: LinhaInstrucaoPortao[]): { ok: boolean; pecas: Array<{ tipo: string; titulo: string; status: string; documento_id?: string | null }> } {
  const pecas = pecasDoInciso(itens, TIPOS_ESCOLHA_PRECO);
  return { ok: pecas.some((p) => p.status === 'OK'), pecas };
}

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
 * peça do inciso presente na instrução pronta ou "não se aplica") e, na
 * contratação direta SEM aviso (inexigibilidade), também VI e VII (`modalidade`;
 * ver `momentoDoInciso`). Uma peça do inciso fora da instrução do processo
 * (ex.: rito completo) não conta.
 */
export function portaoBArt72(itens: LinhaInstrucaoPortao[], modalidade?: string | null): { linhas: LinhaPortaoB[]; ok: boolean; pendentes: string[] } {
  const linhas: LinhaPortaoB[] = INCISOS_ART72.map((i) => {
    const pecas = pecasDoInciso(itens, i.tipos);
    const momento = momentoDoInciso(i.inciso, modalidade);
    const exigido = momento === 'ANTES';
    let situacao: LinhaPortaoB['situacao'];
    if ((i.inciso === 'VI' || i.inciso === 'VII') && momento === 'ANTES') {
      const s = situacaoEscolhaPreco(itens);
      situacao = s.ok ? 'OK' : s.pecas.some((p) => p.status !== 'PENDENTE' && p.status !== 'NAO_SE_APLICA') ? 'EM_ANDAMENTO' : 'PENDENTE';
      return { inciso: i.inciso, referencia: `Art. 72, ${i.inciso}`, texto: i.texto, momento, exigido, situacao, pecas };
    }
    const pronta = prontaNoInciso(i.inciso);
    if (momento !== 'ANTES' && momento !== 'ESTA_ETAPA') situacao = pecas.length && pecas.every((p) => pronta.has(p.status)) ? 'OK' : 'DEPOIS';
    else if (!pecas.length) situacao = 'OK';
    else if (pecas.every((p) => pronta.has(p.status))) situacao = 'OK';
    // "não se aplica" num inciso que não o admite (IV) não é "em andamento": continua pendente
    else if (pecas.some((p) => p.status !== 'PENDENTE' && !(pronta === SO_PRONTA && p.status === 'NAO_SE_APLICA'))) situacao = 'EM_ANDAMENTO';
    else situacao = 'PENDENTE';
    return { inciso: i.inciso, referencia: `Art. 72, ${i.inciso}`, texto: i.texto, momento, exigido, situacao, pecas };
  });
  const pendentes = linhas.filter((l) => l.exigido && l.situacao !== 'OK').map((l) => `${l.referencia} — ${l.texto}`);
  return { linhas, ok: pendentes.length === 0, pendentes };
}

const ROTULO_STATUS: Record<string, string> = {
  PENDENTE: 'pendente',
  EM_ELABORACAO: 'em elaboração',
  EM_APROVACAO: 'em aprovação',
  EM_ASSINATURA: 'aguardando assinaturas',
  NAO_SE_APLICA: 'marcada "não se aplica" — o inciso não admite',
};

/**
 * Situação das peças de um conjunto de tipos (roteiro do parecer e regras
 * A72-*): fora da instrução → NAO_SE_APLICA; todas prontas → CONFORME; senão
 * PENDENTE com o que falta. `prontas`: statuses que contam (o inciso IV não
 * aceita "não se aplica" — `prontaNoInciso`).
 */
export function situacaoDasPecasDoArt72(
  itens: LinhaInstrucaoPortao[],
  tipos: string[],
  rotulo: string,
  prontas: Set<string> = PRONTA,
): { situacao: 'NAO_SE_APLICA' | 'CONFORME' | 'PENDENTE'; detalhe: string; faltam: Array<{ tipo: string; titulo: string; status: string; documento_id?: string | null }> } {
  const presentes = pecasDoInciso(itens, tipos);
  if (!presentes.length) return { situacao: 'NAO_SE_APLICA', detalhe: `${rotulo}: fora da instrução deste processo`, faltam: [] };
  const faltam = presentes.filter((x) => !prontas.has(x.status));
  if (!faltam.length) return { situacao: 'CONFORME', detalhe: `${rotulo}: juntadas`, faltam: [] };
  return { situacao: 'PENDENTE', detalhe: `Falta(m): ${faltam.map((x) => x.tipo).join(', ')}`, faltam };
}

/** "ETP (em elaboração), TR (pendente)". */
export const descreverFaltantes = (faltam: Array<{ tipo: string; titulo: string; status: string }>) =>
  faltam.map((f) => `${f.titulo || f.tipo} (${ROTULO_STATUS[f.status] ?? f.status.toLowerCase()})`).join('; ');
