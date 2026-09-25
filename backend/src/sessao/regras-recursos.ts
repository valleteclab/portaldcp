import { CalendarioDiasUteis, fimDoPrazoEmDiasUteis } from '../common/prazos/dias-uteis';
import { SituacaoLicitante } from '../julgamento/regras-julgamento';
import { AtoRecorrido, StatusRecurso } from './entities/recurso-administrativo.entity';

/**
 * ============================================================================
 * RECURSOS COM EFEITO — REGRAS PURAS (plano E5)
 * ============================================================================
 *
 * Base legal:
 *  - Lei 14.133/2021 art. 165 I "b": recurso contra o julgamento das propostas
 *    e a habilitação/inabilitação, em 3 dias úteis da intimação/lavratura da ata;
 *  - art. 165 §1º I: a INTENÇÃO de recorrer é manifestada IMEDIATAMENTE, sob
 *    pena de PRECLUSÃO; II: no pregão/concorrência (fases na ordem do art. 17)
 *    há uma só fase recursal, depois da habilitação;
 *  - IN SEGES 73/2022 art. 40: a janela de intenção dura no mínimo 10 minutos;
 *    §2º: contrarrazões em 3 dias úteis contados do FIM do prazo do recorrente;
 *  - art. 165 §2º: o recurso é dirigido à autoridade que praticou o ato, que
 *    pode RECONSIDERAR em 3 dias úteis ou encaminhá-lo, motivadamente, à
 *    AUTORIDADE SUPERIOR, que decide em 10 dias úteis;
 *  - art. 165 §3º: o acolhimento do recurso invalida só os atos insuscetíveis
 *    de aproveitamento;
 *  - art. 168: o recurso tem EFEITO SUSPENSIVO até a decisão final
 *    (adjudicação/homologação bloqueadas enquanto houver recurso pendente);
 *  - art. 183: prazos em dias úteis excluem o dia do começo e incluem o do
 *    vencimento (função única `common/prazos/dias-uteis.ts`, com o calendário de feriados do órgão — E7a).
 *
 * Prazos não são decididos sozinhos: vencido o prazo do agente/autoridade, o
 * recurso é SINALIZADO como atrasado — nunca decidido automaticamente. Já o
 * prazo das PARTES tem consequência: razões fora do prazo → não conhecido;
 * razões/contrarrazões após o prazo → 409.
 */

export const MINUTOS_MINIMOS_INTENCAO = 10; // IN 73 art. 40
export const DIAS_UTEIS_RAZOES_PADRAO = 3; // art. 165 I
export const DIAS_UTEIS_CONTRARRAZOES_PADRAO = 3; // art. 165 §4º; IN 73 art. 40 §2º
export const DIAS_UTEIS_RECONSIDERACAO = 3; // art. 165 §2º
export const DIAS_UTEIS_AUTORIDADE = 10; // art. 165 §2º
export const TAMANHO_MINIMO_FUNDAMENTACAO = 20;
export const TAMANHO_MINIMO_MOTIVACAO_INTENCAO = 10;

/** Recurso ainda sem decisão final (efeito suspensivo — art. 168). */
export const STATUS_RECURSO_PENDENTES: ReadonlyArray<string> = [
  StatusRecurso.INTENCAO,
  StatusRecurso.AGUARDANDO_RAZOES,
  StatusRecurso.RAZOES_APRESENTADAS,
  StatusRecurso.CONTRARRAZOES,
  StatusRecurso.EM_ANALISE,
  StatusRecurso.AGUARDANDO_AUTORIDADE,
];

export const STATUS_RECURSO_DECIDIDOS: ReadonlyArray<string> = [
  StatusRecurso.PROVIDO,
  StatusRecurso.IMPROVIDO,
  StatusRecurso.NAO_CONHECIDO,
  StatusRecurso.DESISTENCIA,
];

export const ehRecursoPendente = (s: string | null | undefined) => !!s && STATUS_RECURSO_PENDENTES.includes(s);

/** Pressupostos recursais cuja falta EVIDENTE permite não admitir a intenção. */
export const PRESSUPOSTOS_RECURSAIS = ['LEGITIMIDADE', 'INTERESSE', 'MOTIVACAO', 'TEMPESTIVIDADE'] as const;
export type PressupostoRecursal = (typeof PRESSUPOSTOS_RECURSAIS)[number];

// ============================================================================
// JANELA DE INTENÇÃO
// ============================================================================

/** Duração da janela: o maior entre 10 min (IN 73), o parâmetro do órgão e o pedido do agente. */
export function minutosDaJanela(parametroOrgao?: number | null, pedido?: number | null): number {
  const valores = [MINUTOS_MINIMOS_INTENCAO, Number(parametroOrgao) || 0];
  if (pedido != null && Number.isFinite(Number(pedido))) valores.push(Math.floor(Number(pedido)));
  return Math.max(...valores);
}

/** Pedido de duração abaixo do mínimo → mensagem (400); null = ok. */
export function motivoMinutosInvalidos(pedido: number | null | undefined, minimo: number): string | null {
  if (pedido == null) return null;
  const n = Number(pedido);
  if (!Number.isFinite(n) || n < minimo || n > 24 * 60) {
    return `A janela de intenção de recurso dura no mínimo ${minimo} minutos (IN SEGES 73/2022, art. 40) e no máximo 24 horas.`;
  }
  return null;
}

export interface JanelaLike {
  aberta_em: Date | string;
  fecha_em: Date | string;
  superada_em?: Date | string | null;
}

export type EstadoJanela = 'ABERTA' | 'ENCERRADA' | 'SUPERADA';

export function estadoJanela(j: JanelaLike, agora = new Date()): EstadoJanela {
  if (j.superada_em) return 'SUPERADA';
  return agora.getTime() < new Date(j.fecha_em).getTime() ? 'ABERTA' : 'ENCERRADA';
}

/** Intenção fora da janela → preclusão (409). null = pode manifestar. */
export function motivoNaoRegistraIntencao(j: JanelaLike | null | undefined, agora = new Date()): string | null {
  if (!j) {
    return 'Não há janela de intenção de recurso aberta nesta sessão: a intenção só pode ser manifestada no prazo aberto pelo agente de contratação (art. 165 §1º I).';
  }
  const estado = estadoJanela(j, agora);
  if (estado === 'ABERTA') return null;
  return 'Prazo para manifestar intenção de recurso encerrado — preclusão (Lei 14.133/2021, art. 165 §1º I; IN SEGES 73/2022, art. 40).';
}

// ============================================================================
// PRAZOS (art. 165; IN 73 art. 40; art. 183)
// ============================================================================

export function prazoRazoes(admitidaEm: Date, dias = DIAS_UTEIS_RAZOES_PADRAO, cal?: CalendarioDiasUteis): Date {
  return fimDoPrazoEmDiasUteis(admitidaEm, dias, cal);
}

/** Contrarrazões: 3 dias úteis contados do FIM do prazo das razões (IN 73 art. 40 §2º). */
export function prazoContrarrazoes(fimPrazoRazoes: Date, dias = DIAS_UTEIS_CONTRARRAZOES_PADRAO, cal?: CalendarioDiasUteis): Date {
  return fimDoPrazoEmDiasUteis(fimPrazoRazoes, dias, cal);
}

/** Reconsideração pelo agente: 3 dias úteis do fim das contrarrazões (art. 165 §2º). */
export function prazoReconsideracao(fimContrarrazoes: Date, cal?: CalendarioDiasUteis): Date {
  return fimDoPrazoEmDiasUteis(fimContrarrazoes, DIAS_UTEIS_RECONSIDERACAO, cal);
}

/** Decisão da autoridade superior: 10 dias úteis do encaminhamento (art. 165 §2º). */
export function prazoAutoridade(encaminhadoEm: Date, cal?: CalendarioDiasUteis): Date {
  return fimDoPrazoEmDiasUteis(encaminhadoEm, DIAS_UTEIS_AUTORIDADE, cal);
}

export interface RecursoLike {
  status: string;
  fornecedor_id: string;
  prazo_razoes?: Date | string | null;
  prazo_contrarrazoes?: Date | string | null;
  prazo_reconsideracao?: Date | string | null;
  prazo_decisao_autoridade?: Date | string | null;
}

const passou = (limite: Date | string | null | undefined, agora: Date) =>
  !!limite && agora.getTime() > new Date(limite).getTime();

/**
 * Evolução pelo decurso dos prazos das PARTES (lazy — aplicada em toda leitura
 * e todo ato): razões não apresentadas no prazo → NAO_CONHECIDO; prazo de
 * contrarrazões encerrado → EM_ANALISE (abre o prazo de reconsideração).
 * Devolve null quando nada muda.
 */
export function evolucaoPorPrazo(
  r: RecursoLike,
  agora = new Date(),
  cal?: CalendarioDiasUteis,
): { status: StatusRecurso; prazo_reconsideracao?: Date; motivo?: string } | null {
  if (r.status === StatusRecurso.AGUARDANDO_RAZOES && passou(r.prazo_razoes, agora)) {
    return {
      status: StatusRecurso.NAO_CONHECIDO,
      motivo: 'Razões não apresentadas no prazo de 3 dias úteis (art. 165 I) — recurso não conhecido.',
    };
  }
  if (
    (r.status === StatusRecurso.CONTRARRAZOES || r.status === StatusRecurso.RAZOES_APRESENTADAS) &&
    r.prazo_contrarrazoes &&
    passou(r.prazo_contrarrazoes, agora)
  ) {
    return { status: StatusRecurso.EM_ANALISE, prazo_reconsideracao: prazoReconsideracao(new Date(r.prazo_contrarrazoes), cal) };
  }
  return null;
}

/** Atrasos do agente/autoridade (sinalizados, nunca decididos automaticamente). */
export function atrasosDoRecurso(r: RecursoLike, agora = new Date()) {
  return {
    reconsideracaoAtrasada: r.status === StatusRecurso.EM_ANALISE && passou(r.prazo_reconsideracao, agora),
    autoridadeAtrasada: r.status === StatusRecurso.AGUARDANDO_AUTORIDADE && passou(r.prazo_decisao_autoridade, agora),
  };
}

/** Razões: só o recorrente, com o recurso aguardando razões e dentro do prazo. */
export function motivoNaoApresentaRazoes(
  r: RecursoLike,
  fornecedorId: string,
  agora = new Date(),
): { status: 403 | 409; mensagem: string } | null {
  if (r.fornecedor_id !== fornecedorId) {
    return { status: 403, mensagem: 'Apenas o recorrente apresenta as razões do recurso.' };
  }
  if (r.status === StatusRecurso.AGUARDANDO_RAZOES && passou(r.prazo_razoes, agora)) {
    return { status: 409, mensagem: 'Prazo das razões encerrado (3 dias úteis — art. 165 I): não é mais possível apresentá-las.' };
  }
  if (r.status !== StatusRecurso.AGUARDANDO_RAZOES) {
    return { status: 409, mensagem: 'Este recurso não está aguardando razões.' };
  }
  return null;
}

/** Contrarrazões: qualquer licitante que NÃO seja o recorrente, na fase e no prazo. */
export function motivoNaoApresentaContrarrazoes(
  r: RecursoLike,
  fornecedorId: string,
  agora = new Date(),
): { status: 403 | 409; mensagem: string } | null {
  if (r.fornecedor_id === fornecedorId) {
    return { status: 403, mensagem: 'O recorrente não apresenta contrarrazões ao próprio recurso.' };
  }
  const fase = r.status === StatusRecurso.CONTRARRAZOES || r.status === StatusRecurso.RAZOES_APRESENTADAS;
  if (fase && passou(r.prazo_contrarrazoes, agora)) {
    return {
      status: 409,
      mensagem: 'Prazo das contrarrazões encerrado (3 dias úteis do fim do prazo das razões — IN SEGES 73/2022, art. 40 §2º).',
    };
  }
  if (!fase) return { status: 409, mensagem: 'Este recurso não está na fase de contrarrazões.' };
  return null;
}

// ============================================================================
// EFEITO DO PROVIMENTO (art. 165 §3º)
// ============================================================================

/** Situações que o PRÓPRIO recorrente tem de estar para recorrer do ato. */
export function situacoesDoAtoProprio(ato: string): string[] {
  switch (ato) {
    case AtoRecorrido.INABILITACAO:
      return [SituacaoLicitante.INABILITADO];
    case AtoRecorrido.RECUSA_PROPOSTA:
      return [SituacaoLicitante.RECUSADO];
    case AtoRecorrido.DESCLASSIFICACAO:
      return [SituacaoLicitante.DESCLASSIFICADO];
    default:
      return [];
  }
}

/** Situações em que o LICITANTE ALVO tem de estar (ato de terceiro). */
export function situacoesDoAlvo(ato: string): string[] {
  switch (ato) {
    case AtoRecorrido.HABILITACAO_TERCEIRO:
      return [SituacaoLicitante.HABILITADO, SituacaoLicitante.VENCEDOR];
    case AtoRecorrido.ACEITACAO_TERCEIRO:
      return [SituacaoLicitante.ACEITO, SituacaoLicitante.HABILITADO, SituacaoLicitante.VENCEDOR];
    default:
      return [];
  }
}

export const atoDeTerceiro = (ato: string) =>
  ato === AtoRecorrido.HABILITACAO_TERCEIRO || ato === AtoRecorrido.ACEITACAO_TERCEIRO;

export const atoProprio = (ato: string) =>
  ato === AtoRecorrido.INABILITACAO || ato === AtoRecorrido.RECUSA_PROPOSTA || ato === AtoRecorrido.DESCLASSIFICACAO;

/**
 * Situação a que o RECORRENTE volta com o provimento contra o próprio ato:
 *  - inabilitação reformada: HABILITADO onde a proposta dele estava aceita
 *    (a aceitação é ato aproveitável); nas demais unidades volta ao ranking
 *    (CLASSIFICADO);
 *  - recusa/desclassificação reformada: volta ao ranking (CLASSIFICADO) e, se
 *    for o melhor, é convocado de novo para a aceitação.
 */
export function situacaoRestaurada(ato: string, propostaAceitaNaUnidade: boolean): SituacaoLicitante {
  if (ato === AtoRecorrido.INABILITACAO && propostaAceitaNaUnidade) return SituacaoLicitante.HABILITADO;
  return SituacaoLicitante.CLASSIFICADO;
}

/** Situação imposta ao ALVO com o provimento contra o ato de terceiro. */
export function situacaoDoAlvoProvido(ato: string): SituacaoLicitante | null {
  if (ato === AtoRecorrido.HABILITACAO_TERCEIRO) return SituacaoLicitante.INABILITADO;
  if (ato === AtoRecorrido.ACEITACAO_TERCEIRO) return SituacaoLicitante.DESCLASSIFICADO;
  return null;
}

/** Situações "promovidas" (atos praticados porque o recorrente estava fora) — invalidáveis. */
export const SITUACOES_PROMOVIDAS: ReadonlyArray<string> = [
  SituacaoLicitante.CONVOCADO_ACEITACAO,
  SituacaoLicitante.ACEITO,
  SituacaoLicitante.HABILITADO,
  SituacaoLicitante.VENCEDOR,
];

/**
 * Atos insuscetíveis de aproveitamento (art. 165 §3º) depois de restaurar o
 * recorrente: licitantes ABAIXO dele no ranking recalculado que foram
 * convocados/aceitos/habilitados no lugar dele voltam a CLASSIFICADO. Quem
 * está acima (ou foi excluído por ato próprio) não é tocado.
 */
export function planejarInvalidacoes(
  rankingAposRestauracao: Array<{ fornecedorId: string; situacao: string; excluido: boolean }>,
  recorrenteId: string,
): Array<{ fornecedorId: string; de: string }> {
  const validos = rankingAposRestauracao.filter((e) => !e.excluido);
  const idx = validos.findIndex((e) => e.fornecedorId === recorrenteId);
  if (idx < 0) return [];
  return validos
    .slice(idx + 1)
    .filter((e) => SITUACOES_PROMOVIDAS.includes(e.situacao))
    .map((e) => ({ fornecedorId: e.fornecedorId, de: e.situacao }));
}

/**
 * Como a fase recursal termina, decididos todos os recursos (sem janela aberta):
 *  - alguma unidade sem proposta aceita (provimento devolveu o julgamento) →
 *    RETORNAR_JULGAMENTO e o licitante na vez é convocado para a aceitação;
 *  - resultado alterado por provimento, mas completo (ex.: inabilitação
 *    reformada — o recorrente volta HABILITADO) → RETORNAR_HABILITACAO: a
 *    licitação volta à habilitação com o novo resultado; segue a adjudicação;
 *  - nenhum resultado alterado → DECIDIR_RECURSOS (→ adjudicação).
 */
export function desfechoDaFaseRecursal(opts: {
  unidadesSemAceite: number;
  resultadoAlterado: boolean;
}): 'RETORNAR_JULGAMENTO' | 'RETORNAR_HABILITACAO' | 'DECIDIR_RECURSOS' {
  if (opts.unidadesSemAceite > 0) return 'RETORNAR_JULGAMENTO';
  if (opts.resultadoAlterado) return 'RETORNAR_HABILITACAO';
  return 'DECIDIR_RECURSOS';
}
