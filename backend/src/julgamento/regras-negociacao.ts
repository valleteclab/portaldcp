/**
 * ============================================================================
 * NEGOCIAÇÃO — REGRAS PURAS (plano E3 item 4)
 * ============================================================================
 *
 * Base legal:
 *  - Lei 14.133/2021 art. 61: definido o resultado do julgamento, a
 *    Administração poderá negociar condições mais vantajosas com o primeiro
 *    colocado; §1º a negociação é conduzida pelo agente de contratação e,
 *    concluída, tem o RESULTADO divulgado a todos os licitantes e anexado aos
 *    autos.
 *  - Lei 14.133 art. 59 III: é desclassificada a proposta que permanecer acima
 *    do orçamento estimado para a contratação.
 *  - IN SEGES 73/2022 art. 30: encerrados os lances, se a proposta do 1º
 *    permanecer acima do preço máximo, o agente negocia; §1º a negociação pode
 *    seguir com os demais, na ordem de classificação, quando o 1º, mesmo após
 *    a negociação, for desclassificado por permanecer acima do preço máximo;
 *    §3º resultado divulgado a todos; §4º a proposta adequada é solicitada
 *    depois da negociação, ajustada ao último lance negociado (prazo ≥ 2 h).
 *
 * Decisões do sistema (onde a norma é omissa):
 *  - a negociação é por UNIDADE (item, ou lote na disputa por lote) e sempre
 *    com o licitante NA VEZ do ranking único (a ordem não se pula);
 *  - preço máximo = soma do valor total estimado dos itens da unidade;
 *  - proposta acima do preço máximo ⇒ negociação OBRIGATÓRIA antes do aceite;
 *    depois de negociar, o aceite acima do máximo só com motivação expressa;
 *  - contraproposta do agente sempre MENOR que o valor atual do licitante (o
 *    motor recusa lance NEGOCIACAO que não reduz — modelo-lance.ts);
 *  - a negociação é feita no sistema e ACOMPANHADA pelos demais licitantes
 *    (IN 73 art. 30 §2º): mensagens, contrapropostas e respostas são eventos
 *    com `visibilidade: PARTICIPANTES` — leitura do órgão dono e de todo
 *    licitante com proposta válida na licitação; escrita só do agente e do
 *    licitante na vez. O público anônimo e outros órgãos veem só a abertura e
 *    o resultado (valor). Só vale para critérios de MENOR valor;
 *  - o preço máximo só é mostrado ao licitante se o orçamento NÃO for
 *    sigiloso (`sigilo_orcamento`, Lei 14.133 art. 24).
 */

import type { DirecaoLance } from '../disputa-v2/modos-disputa';

export enum StatusNegociacao {
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDA = 'CONCLUIDA',
  CANCELADA = 'CANCELADA',
}

export enum StatusContraproposta {
  PENDENTE = 'PENDENTE',
  /** Resposta de aceite em processamento (lance sendo registrado no motor). */
  PROCESSANDO = 'PROCESSANDO',
  ACEITA = 'ACEITA',
  RECUSADA = 'RECUSADA',
}

export enum ResultadoNegociacao {
  /** Contraproposta aceita: o valor negociado virou lance NEGOCIACAO. */
  REDUZIDO = 'REDUZIDO',
  /** Encerrada sem redução (licitante manteve o valor). */
  MANTIDO = 'MANTIDO',
  /** Permaneceu acima do preço máximo e foi desclassificado (art. 59 III). */
  DESCLASSIFICADO = 'DESCLASSIFICADO',
}

/** Visibilidade gravada em `dados_adicionais.visibilidade` do evento da sessão. */
export const VISIBILIDADE_PRIVADA = 'PRIVADA';
/** Negociação acompanhada pelos licitantes (IN 73 art. 30 §2º): órgão dono + participantes. */
export const VISIBILIDADE_PARTICIPANTES = 'PARTICIPANTES';

const TOLERANCIA = 0.005;
const arred = (v: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
};
export const brl = (v: number) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

/**
 * Valor TOTAL da unidade a partir do valor na base do lance: UNITARIO (item) →
 * unitário × quantidade; TOTAL_ITEM/TOTAL_LOTE → o próprio valor.
 */
export function totalDaBase(valorNaBase: number, baseLance: string, quantidade: number): number {
  if (baseLance === 'UNITARIO') return arred(Number(valorNaBase) * (Number(quantidade) > 0 ? Number(quantidade) : 1), 2);
  return arred(Number(valorNaBase), 2);
}

/** Preço máximo (estimado) da unidade: soma dos totais estimados; 0/ausente = sem preço máximo. */
export function precoMaximoDaUnidade(itens: Array<{ valorTotalEstimado: number }>): number | null {
  const soma = arred(itens.reduce((s, i) => s + (Number(i.valorTotalEstimado) || 0), 0), 2);
  return soma > 0 ? soma : null;
}

/** A proposta (valor total) está acima do preço máximo? Sem preço máximo, nunca. */
export function acimaDoPrecoMaximo(valorTotal: number | null | undefined, precoMaximo: number | null | undefined): boolean {
  if (valorTotal == null || precoMaximo == null || !(Number(precoMaximo) > 0)) return false;
  return Number(valorTotal) > Number(precoMaximo) + TOLERANCIA;
}

// ============================================================================
// GUARDAS DOS ATOS
// ============================================================================

export interface EstadoNegociacao {
  status: string;
  contraproposta_status?: string | null;
  rodadas?: Array<{ status: string }> | null;
}

/** Abrir negociação com o licitante na vez da unidade. */
export function motivoNaoAbre(p: {
  direcao: DirecaoLance;
  unidadeEncerrada: boolean;
  comResultado: boolean;
  situacaoAtual: string | null;
  jaHaAtiva: boolean;
}): string | null {
  if (p.direcao !== 'MENOR') {
    return 'A negociação de preço (Lei 14.133 art. 61) se aplica aos critérios de menor valor; no maior lance não há contraproposta de redução.';
  }
  if (!p.unidadeEncerrada) return 'A negociação ocorre depois do encerramento da etapa de lances da unidade';
  if (!p.comResultado) return 'Unidade deserta/fracassada/cancelada — não há com quem negociar';
  if (!p.situacaoAtual) return 'Não há licitante classificado na unidade para negociar';
  if (!['CLASSIFICADO', 'CONVOCADO_ACEITACAO'].includes(p.situacaoAtual)) {
    return p.situacaoAtual === 'CONVOCADO_DESEMPATE'
      ? 'Há desempate ME/EPP pendente na unidade — a negociação vem depois do desempate'
      : 'A proposta do licitante na vez já foi aceita — a negociação ocorre antes do aceite';
  }
  if (p.jaHaAtiva) return 'Já há uma negociação em andamento nesta unidade';
  return null;
}

/**
 * Contraproposta do agente: valor válido (até 4 casas; 2 no lote), sem outra
 * pendente, e MENOR que o valor atual do licitante (na base do lance).
 */
export function motivoContrapropostaInvalida(
  neg: EstadoNegociacao,
  valor: number,
  valorAtualNaBase: number,
  opts: { casas?: number } = {},
): string | null {
  if (neg.status !== StatusNegociacao.EM_ANDAMENTO) return 'Esta negociação já foi concluída';
  if (neg.contraproposta_status === StatusContraproposta.PENDENTE || neg.contraproposta_status === StatusContraproposta.PROCESSANDO) {
    return 'Há uma contraproposta aguardando a resposta do licitante';
  }
  const v = Number(valor);
  if (!Number.isFinite(v) || v <= 0) return 'Informe o valor da contraproposta';
  const casas = opts.casas ?? 4;
  if (Math.abs(arred(v, casas) - v) > 1e-9) return `Valor com mais de ${casas} casas decimais`;
  if (!(v < Number(valorAtualNaBase) - 1e-9)) {
    return `A contraproposta deve ser menor que o valor atual do licitante (${brl(valorAtualNaBase)})`;
  }
  return null;
}

/** Resposta do licitante: só com contraproposta pendente. */
export function motivoNaoResponde(neg: EstadoNegociacao): string | null {
  if (neg.status !== StatusNegociacao.EM_ANDAMENTO) return 'Esta negociação já foi concluída';
  if (neg.contraproposta_status === StatusContraproposta.PROCESSANDO) return 'A resposta já está sendo processada';
  if (neg.contraproposta_status !== StatusContraproposta.PENDENTE) return 'Não há contraproposta aguardando resposta';
  return null;
}

/** Encerrar sem (nova) redução: sem contraproposta pendente. */
export function motivoNaoEncerra(neg: EstadoNegociacao): string | null {
  if (neg.status !== StatusNegociacao.EM_ANDAMENTO) return 'Esta negociação já foi concluída';
  if (neg.contraproposta_status === StatusContraproposta.PENDENTE || neg.contraproposta_status === StatusContraproposta.PROCESSANDO) {
    return 'Aguarde a resposta do licitante à contraproposta antes de encerrar';
  }
  return null;
}

/**
 * Desclassificar por preço acima do máximo (art. 59 III; IN 73 art. 30 §1º):
 * só depois de negociar (ao menos uma contraproposta respondida), sem
 * pendência, e com o valor atual de fato acima do preço máximo.
 */
export function motivoNaoDesclassifica(neg: EstadoNegociacao, valorAtualTotal: number, precoMaximo: number | null): string | null {
  const erro = motivoNaoEncerra(neg);
  if (erro) return erro;
  if (!(neg.rodadas ?? []).some((r) => r.status === StatusContraproposta.RECUSADA || r.status === StatusContraproposta.ACEITA)) {
    return 'Negocie antes de desclassificar: envie ao menos uma contraproposta ao licitante (IN 73 art. 30 §1º)';
  }
  if (!acimaDoPrecoMaximo(valorAtualTotal, precoMaximo)) {
    return 'O valor atual do licitante não está acima do preço máximo — a desclassificação por preço não se aplica (art. 59 III)';
  }
  return null;
}

/**
 * Gate do ACEITE da proposta (aceitação): acima do preço máximo, o aceite
 * exige negociação concluída com este licitante na unidade e, persistindo
 * acima do máximo, motivação expressa (mín. 20 caracteres). Negociação em
 * andamento sempre bloqueia.
 */
export function motivoNaoAceitaPreco(p: {
  valorTotal: number | null;
  precoMaximo: number | null;
  negociacaoEmAndamento: boolean;
  negociou: boolean;
  justificativa?: string | null;
}): string | null {
  if (p.negociacaoEmAndamento) {
    return 'Há negociação em andamento com este licitante nesta unidade: conclua-a antes de aceitar a proposta (Lei 14.133 art. 61).';
  }
  if (!acimaDoPrecoMaximo(p.valorTotal, p.precoMaximo)) return null;
  const msgValores = `${brl(Number(p.valorTotal))} acima do preço máximo de ${brl(Number(p.precoMaximo))}`;
  if (!p.negociou) {
    return `Proposta ${msgValores}: negocie com o licitante antes de aceitar (Lei 14.133 art. 61; IN SEGES 73/2022 art. 30), ` +
      'ou desclassifique-a se permanecer acima do máximo (art. 59 III).';
  }
  if (!(p.justificativa && p.justificativa.trim().length >= 20)) {
    return `Proposta ${msgValores} mesmo após a negociação: desclassifique-a (art. 59 III) ou informe a motivação do aceite ` +
      'acima do preço máximo (mín. 20 caracteres).';
  }
  return null;
}

// ============================================================================
// VISIBILIDADE DOS EVENTOS (mensagens privadas da negociação)
// ============================================================================

export type VisaoEvento = { tipo: 'ORGAO' } | { tipo: 'FORNECEDOR'; fornecedorId: string } | { tipo: 'PUBLICO' };

/**
 * Visibilidade dos eventos da sessão:
 *  - PARTICIPANTES (negociação — IN 73 art. 30 §2º): órgão dono e licitantes
 *    participantes (a visão FORNECEDOR só existe para quem tem proposta
 *    válida); público anônimo e outros órgãos (visão PUBLICO) não;
 *  - PRIVADA: só o órgão dono e o licitante do evento.
 * Os demais eventos não mudam de regra.
 */
export function eventoVisivel(evento: { dados_adicionais?: Record<string, any> | null }, visao: VisaoEvento): boolean {
  const d = evento?.dados_adicionais;
  if (!d || (d.visibilidade !== VISIBILIDADE_PRIVADA && d.visibilidade !== VISIBILIDADE_PARTICIPANTES)) return true;
  if (visao.tipo === 'ORGAO') return true;
  if (d.visibilidade === VISIBILIDADE_PARTICIPANTES) return visao.tipo === 'FORNECEDOR';
  return visao.tipo === 'FORNECEDOR' && !!d.fornecedor_id && String(d.fornecedor_id) === String(visao.fornecedorId);
}

export function filtrarEventosVisiveis<T extends { dados_adicionais?: Record<string, any> | null }>(eventos: T[], visao: VisaoEvento): T[] {
  return eventos.filter((e) => eventoVisivel(e, visao));
}
