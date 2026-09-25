/**
 * ============================================================================
 * JULGAMENTO — REGRAS PURAS (plano E3)
 * ============================================================================
 *
 * Nada aqui toca o banco: ranking único, "chamar o próximo", máquina de estados
 * da ACEITAÇÃO da proposta (IN SEGES 73/2022 art. 29), validação da proposta
 * adequada ao último lance e alerta de exequibilidade (Lei 14.133 art. 59 §4º).
 * Testado em `regras-julgamento.spec.ts`; os serviços (RankingService,
 * AceitacaoService) só juntam os dados e chamam estas funções.
 */

import type { DirecaoLance } from '../disputa-v2/modos-disputa';

// ============================================================================
// SITUAÇÃO DO LICITANTE NA UNIDADE (item ou lote) — plano §2.3
// ============================================================================

export enum SituacaoLicitante {
  /** No ranking da unidade, aguardando a sua vez. */
  CLASSIFICADO = 'CLASSIFICADO',
  /** ME/EPP convocada para o desempate ficto (LC 123 art. 45) — gancho da etapa ME/EPP. */
  CONVOCADO_DESEMPATE = 'CONVOCADO_DESEMPATE',
  /** Convocado para enviar a proposta adequada ao último lance (IN 73 art. 29). */
  CONVOCADO_ACEITACAO = 'CONVOCADO_ACEITACAO',
  /** Proposta aceita pelo agente de contratação — segue para a habilitação. */
  ACEITO = 'ACEITO',
  /** Proposta recusada na aceitação (motivo registrado) — sai do ranking. */
  RECUSADO = 'RECUSADO',
  /** Proposta desclassificada (art. 59) — sai do ranking. */
  DESCLASSIFICADO = 'DESCLASSIFICADO',
  HABILITADO = 'HABILITADO',
  /** Inabilitado (art. 62–70) — sai do ranking; chama-se o próximo. */
  INABILITADO = 'INABILITADO',
  /** Vencedor declarado (adjudicação — E6). */
  VENCEDOR = 'VENCEDOR',
}

/** Situações que tiram o licitante do ranking da unidade (nunca é "o próximo", nunca vence). */
export const SITUACOES_EXCLUIDAS: ReadonlyArray<string> = [
  SituacaoLicitante.DESCLASSIFICADO,
  SituacaoLicitante.RECUSADO,
  SituacaoLicitante.INABILITADO,
];

/** Proposta já aceita (a unidade está resolvida no julgamento). */
export const SITUACOES_PROPOSTA_ACEITA: ReadonlyArray<string> = [
  SituacaoLicitante.ACEITO,
  SituacaoLicitante.HABILITADO,
  SituacaoLicitante.VENCEDOR,
];

export const ehExcluida = (s: string | null | undefined) => !!s && SITUACOES_EXCLUIDAS.includes(s);
export const ehPropostaAceita = (s: string | null | undefined) => !!s && SITUACOES_PROPOSTA_ACEITA.includes(s);

// ============================================================================
// RANKING ÚNICO
// ============================================================================

/** Melhor oferta ATIVA de um licitante na unidade (vem do motor: `rankingDoItem`). */
export interface OfertaRanking {
  fornecedorId: string;
  fornecedorNome: string;
  /** Valor comparável, na base do lance da licitação. */
  melhorValor: number;
  /** Registro da melhor oferta (desempate padrão: quem registrou primeiro). */
  registradoEm: Date;
  totalLances: number;
}

export interface EntradaRanking extends OfertaRanking {
  /** 1..n entre os NÃO excluídos; null para os excluídos. */
  posicao: number | null;
  situacao: SituacaoLicitante;
  excluido: boolean;
  /** Houve empate de valor com outro licitante (resolvido pelo desempatador). */
  empatado?: boolean;
}

/**
 * Desempate de ofertas de MESMO valor (Lei 14.133 art. 60 e, persistindo,
 * sorteio em ato público — IN 73 art. 28). Recebe o grupo empatado já na ordem
 * de registro e devolve a ordem final. GANCHO: a etapa de desempate (art. 60 /
 * sorteio) registra a sua implementação em `RankingService.definirDesempatador`.
 */
export type Desempatador = (
  empatados: EntradaRanking[],
  contexto: { licitacaoId: string | null; unidadeId: string },
) => EntradaRanking[] | Promise<EntradaRanking[]>;

/** Padrão: prevalece a oferta registrada primeiro (a entrada já vem nessa ordem). */
export const desempatePorRegistro: Desempatador = (empatados) =>
  [...empatados].sort((a, b) => a.registradoEm.getTime() - b.registradoEm.getTime());

const centavosInt = (v: number) => Math.round(Number(v) * 100);

/** Ordena pelo valor na direção do critério e, no mesmo valor, pelo registro. */
export function ordenarOfertas<T extends OfertaRanking>(ofertas: T[], direcao: DirecaoLance): T[] {
  const sinal = direcao === 'MAIOR' ? -1 : 1;
  return [...ofertas].sort(
    (a, b) =>
      sinal * (centavosInt(a.melhorValor) - centavosInt(b.melhorValor)) ||
      a.registradoEm.getTime() - b.registradoEm.getTime(),
  );
}

/**
 * Ranking ÚNICO da unidade: melhores ofertas (motor) na direção do critério,
 * situação de cada licitante, excluídos (desclassificado/recusado/inabilitado)
 * no fim sem posição, empates de valor resolvidos pelo desempatador.
 */
export async function montarRanking(
  ofertas: OfertaRanking[],
  situacoes: Map<string, string>,
  direcao: DirecaoLance,
  opts: { desempatar?: Desempatador; licitacaoId?: string | null; unidadeId?: string } = {},
): Promise<EntradaRanking[]> {
  const desempatar = opts.desempatar ?? desempatePorRegistro;
  const ordenadas = ordenarOfertas(ofertas, direcao).map<EntradaRanking>((o) => {
    const situacao = (situacoes.get(o.fornecedorId) as SituacaoLicitante) ?? SituacaoLicitante.CLASSIFICADO;
    return { ...o, situacao, excluido: ehExcluida(situacao), posicao: null };
  });
  const validas = ordenadas.filter((e) => !e.excluido);
  const excluidas = ordenadas.filter((e) => e.excluido);

  // Grupos de mesmo valor (ao centavo) → desempatador
  const final: EntradaRanking[] = [];
  for (let i = 0; i < validas.length; ) {
    let j = i + 1;
    while (j < validas.length && centavosInt(validas[j].melhorValor) === centavosInt(validas[i].melhorValor)) j++;
    const grupo = validas.slice(i, j);
    if (grupo.length > 1) {
      const resolvido = await desempatar(
        grupo.map((g) => ({ ...g, empatado: true })),
        { licitacaoId: opts.licitacaoId ?? null, unidadeId: opts.unidadeId ?? '' },
      );
      final.push(...resolvido);
    } else {
      final.push(grupo[0]);
    }
    i = j;
  }
  final.forEach((e, idx) => (e.posicao = idx + 1));
  return [...final, ...excluidas];
}

/**
 * Quem está "na vez" na unidade: o melhor colocado NÃO excluído. É o que a
 * aceitação convoca, o que a habilitação analisa e o que o resultado adjudica —
 * recusado/inabilitado/desclassificado saem do ranking e o próximo sobe.
 */
export function atualDaUnidade(ranking: EntradaRanking[]): EntradaRanking | null {
  return ranking.find((e) => !e.excluido) ?? null;
}

/**
 * Vencedor para adjudicar/homologar: o licitante na vez, desde que a proposta
 * dele tenha sido aceita (ACEITO/HABILITADO/VENCEDOR). Unidade sem NENHUM
 * registro de licitante (dado legado anterior à E3) → o 1º do ranking de lances.
 * Nunca devolve RECUSADO, INABILITADO ou DESCLASSIFICADO.
 */
export function vencedorDaUnidade(ranking: EntradaRanking[], temRegistros: boolean): EntradaRanking | null {
  const atual = atualDaUnidade(ranking);
  if (!atual) return null;
  if (!temRegistros) return atual;
  return ehPropostaAceita(atual.situacao) ? atual : null;
}

/**
 * Ranking agregado da licitação (telas de habilitação/negociação/recurso, que
 * são por licitante): ordem pela MELHOR posição do licitante em qualquer
 * unidade, depois pela soma das posições; excluídos em todas as unidades no fim.
 */
export function rankingAgregado(
  porUnidade: Array<{ ranking: EntradaRanking[] }>,
): Array<{ fornecedorId: string; fornecedorNome: string; melhorPosicao: number | null; unidades: number; excluidoEmTodas: boolean }> {
  const mapa = new Map<string, { fornecedorId: string; fornecedorNome: string; posicoes: number[]; unidades: number; excluidas: number; ordem: number }>();
  let ordem = 0;
  for (const u of porUnidade) {
    for (const e of u.ranking) {
      const atual = mapa.get(e.fornecedorId) ?? {
        fornecedorId: e.fornecedorId,
        fornecedorNome: e.fornecedorNome,
        posicoes: [],
        unidades: 0,
        excluidas: 0,
        ordem: ordem++,
      };
      atual.unidades++;
      if (e.posicao != null) atual.posicoes.push(e.posicao);
      else atual.excluidas++;
      mapa.set(e.fornecedorId, atual);
    }
  }
  const lista = [...mapa.values()].map((m) => ({
    fornecedorId: m.fornecedorId,
    fornecedorNome: m.fornecedorNome,
    melhorPosicao: m.posicoes.length ? Math.min(...m.posicoes) : null,
    soma: m.posicoes.reduce((s, p) => s + p, 0),
    unidades: m.unidades,
    excluidoEmTodas: m.excluidas === m.unidades,
    ordem: m.ordem,
  }));
  lista.sort((a, b) => {
    if (a.excluidoEmTodas !== b.excluidoEmTodas) return a.excluidoEmTodas ? 1 : -1;
    return (a.melhorPosicao ?? Infinity) - (b.melhorPosicao ?? Infinity) || a.soma - b.soma || a.ordem - b.ordem;
  });
  return lista.map(({ fornecedorId, fornecedorNome, melhorPosicao, unidades, excluidoEmTodas }) => ({
    fornecedorId,
    fornecedorNome,
    melhorPosicao,
    unidades,
    excluidoEmTodas,
  }));
}

// ============================================================================
// ACEITAÇÃO DA PROPOSTA (IN 73 art. 29) — máquina de estados
// ============================================================================

export enum StatusAceitacao {
  /** Convocado; prazo correndo para enviar a proposta adequada. */
  AGUARDANDO_ENVIO = 'AGUARDANDO_ENVIO',
  /** Proposta adequada enviada; aguardando a decisão do agente. */
  ENVIADA = 'ENVIADA',
  ACEITA = 'ACEITA',
  RECUSADA = 'RECUSADA',
  /** Convocação cancelada (licitante inabilitado/desclassificado por outro ato, reinício). */
  CANCELADA = 'CANCELADA',
}

export const STATUS_ACEITACAO_ATIVOS: ReadonlyArray<string> = [StatusAceitacao.AGUARDANDO_ENVIO, StatusAceitacao.ENVIADA];

/** Prazo mínimo legal para a proposta adequada: 2 horas (IN 73 art. 29 §2º). */
export const PRAZO_MINIMO_ACEITACAO_HORAS = 2;

export interface EstadoAceitacao {
  status: string;
  prazo_ate: Date | string;
  prazo_horas: number | string;
  prorrogada_em?: Date | string | null;
  alerta_exequibilidade?: object | null;
}

const ms = (d: Date | string) => new Date(d).getTime();

export function prazoAte(inicio: Date, horas: number): Date {
  return new Date(inicio.getTime() + Number(horas) * 3_600_000);
}

/** Prazo do ato: ≥ mínimo (parâmetro do órgão, nunca abaixo das 2 h legais). */
export function motivoPrazoInvalido(horas: number | undefined | null, minimo: number): string | null {
  const piso = Math.max(PRAZO_MINIMO_ACEITACAO_HORAS, Number(minimo) || PRAZO_MINIMO_ACEITACAO_HORAS);
  if (horas == null) return null;
  const h = Number(horas);
  if (!Number.isFinite(h) || h <= 0) return 'Prazo inválido';
  if (h < piso) return `O prazo para a proposta adequada é de no mínimo ${piso} hora(s) (IN SEGES 73/2022, art. 29).`;
  if (h > 24 * 30) return 'Prazo acima do razoável (máximo 30 dias)';
  return null;
}

export function prazoExpirado(a: EstadoAceitacao, agora: Date = new Date()): boolean {
  return agora.getTime() > ms(a.prazo_ate);
}

/** Prorrogação: uma única vez, pelo mesmo período, antes do fim do prazo (de ofício ou a pedido). */
export function motivoNaoProrroga(a: EstadoAceitacao, agora: Date = new Date()): string | null {
  if (a.status !== StatusAceitacao.AGUARDANDO_ENVIO) return 'Só se prorroga o prazo de convocação aguardando o envio da proposta';
  if (a.prorrogada_em) return 'O prazo já foi prorrogado uma vez (prorrogação única, pelo mesmo período)';
  if (prazoExpirado(a, agora)) return 'O prazo já terminou — não é possível prorrogá-lo';
  return null;
}

/** Envio (ou reenvio, antes da decisão) da proposta adequada, sempre dentro do prazo. */
export function motivoNaoEnvia(a: EstadoAceitacao, agora: Date = new Date()): string | null {
  if (a.status !== StatusAceitacao.AGUARDANDO_ENVIO && a.status !== StatusAceitacao.ENVIADA) {
    return 'Esta convocação não está aberta para envio de proposta';
  }
  if (prazoExpirado(a, agora)) return 'O prazo para envio da proposta adequada terminou';
  return null;
}

/** Recusa: proposta enviada, ou prazo vencido sem envio. */
export function motivoNaoRecusa(a: EstadoAceitacao, agora: Date = new Date()): string | null {
  if (a.status === StatusAceitacao.ENVIADA) return null;
  if (a.status === StatusAceitacao.AGUARDANDO_ENVIO) {
    return prazoExpirado(a, agora)
      ? null
      : 'O licitante ainda está no prazo para enviar a proposta adequada — aguarde o envio ou o fim do prazo';
  }
  return 'Esta convocação já foi decidida';
}

/** Aceite: só proposta enviada; com alerta de exequibilidade, exige justificativa. */
export function motivoNaoAceita(a: EstadoAceitacao, justificativa?: string | null): string | null {
  if (a.status !== StatusAceitacao.ENVIADA) {
    return a.status === StatusAceitacao.AGUARDANDO_ENVIO
      ? 'A proposta adequada ainda não foi enviada'
      : 'Esta convocação já foi decidida';
  }
  if (a.alerta_exequibilidade && !(justificativa && justificativa.trim().length >= 10)) {
    return 'Proposta com indício de inexequibilidade (art. 59 §4º): informe a justificativa do aceite (mín. 10 caracteres), ' +
      'por exemplo a demonstração de exequibilidade apresentada pelo licitante (art. 59 §2º).';
  }
  return null;
}

// ============================================================================
// PROPOSTA ADEQUADA AO ÚLTIMO LANCE — valores por item
// ============================================================================

export interface ItemDaUnidade {
  itemId: string;
  numero: number;
  descricao?: string;
  quantidade: number;
  /**
   * Teto do TOTAL do item: no lote, a parcela do rateio do lance final do
   * licitante (a proposta readequada não pode subir nenhum item acima do
   * rateio); no item, o próprio lance final.
   */
  valorMaximoTotal: number | null;
}

export interface ValorReadequadoEntrada {
  itemId: string;
  valorUnitario: number | string;
}

export interface ValorReadequado {
  itemId: string;
  numero: number;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
}

const arred = (v: number, casas: number) => {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
};
const TOLERANCIA = 0.005;
const brl = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

/**
 * Valida os valores da proposta adequada: todo item da unidade, uma vez;
 * unitário > 0 (até 4 casas); total = unitário × quantidade (centavos); cada
 * item ≤ o seu teto (rateio, no lote) e a soma ≤ o valor final da unidade
 * (último lance). Critério "maior" (leilão): a soma não pode ser MENOR.
 * Devolve os valores normalizados ou lança Error com a lista de problemas.
 */
export function validarValoresReadequados(
  itens: ItemDaUnidade[],
  valores: ValorReadequadoEntrada[] | null | undefined,
  valorFinalUnidade: number,
  direcao: DirecaoLance = 'MENOR',
): { itens: ValorReadequado[]; total: number } {
  const erros: string[] = [];
  const entrada = Array.isArray(valores) ? valores : [];
  const porId = new Map<string, ValorReadequadoEntrada>();
  for (const v of entrada) {
    if (!v || typeof v.itemId !== 'string') {
      erros.push('Valor sem item');
      continue;
    }
    if (porId.has(v.itemId)) erros.push(`Item informado mais de uma vez`);
    porId.set(v.itemId, v);
  }
  const idsUnidade = new Set(itens.map((i) => i.itemId));
  for (const id of porId.keys()) if (!idsUnidade.has(id)) erros.push('Item informado não pertence a esta unidade');

  const saida: ValorReadequado[] = [];
  for (const it of [...itens].sort((a, b) => a.numero - b.numero)) {
    const v = porId.get(it.itemId);
    if (!v) {
      erros.push(`Informe o valor unitário do item ${it.numero}`);
      continue;
    }
    const unit = Number(v.valorUnitario);
    if (!Number.isFinite(unit) || unit <= 0) {
      erros.push(`Valor unitário inválido no item ${it.numero}`);
      continue;
    }
    const unit4 = arred(unit, 4);
    const qtd = Number(it.quantidade) > 0 ? Number(it.quantidade) : 1;
    const total = arred(unit4 * qtd, 2);
    if (it.valorMaximoTotal != null && direcao === 'MENOR' && total > Number(it.valorMaximoTotal) + TOLERANCIA) {
      erros.push(`Item ${it.numero}: total ${brl(total)} acima do limite ${brl(Number(it.valorMaximoTotal))} (rateio do último lance)`);
    }
    saida.push({ itemId: it.itemId, numero: it.numero, quantidade: qtd, valorUnitario: unit4, valorTotal: total });
  }
  const soma = arred(saida.reduce((s, i) => s + i.valorTotal, 0), 2);
  if (!erros.length) {
    if (direcao === 'MENOR' && soma > valorFinalUnidade + TOLERANCIA) {
      erros.push(`A soma dos itens (${brl(soma)}) supera o último lance (${brl(valorFinalUnidade)})`);
    }
    if (direcao === 'MAIOR' && soma < valorFinalUnidade - TOLERANCIA) {
      erros.push(`A soma dos itens (${brl(soma)}) é inferior ao último lance (${brl(valorFinalUnidade)})`);
    }
  }
  if (erros.length) throw new Error(erros.join('; '));
  return { itens: saida, total: soma };
}

// ============================================================================
// EXEQUIBILIDADE (Lei 14.133 art. 59 §4º)
// ============================================================================

export interface AlertaExequibilidade {
  percentualDoOrcado: number;
  limitePercentual: number;
  valorProposta: number;
  valorOrcado: number;
  baseLegal: string;
  mensagem: string;
}

const OBRAS_E_ENGENHARIA = ['OBRA', 'SERVICO_ENGENHARIA'];

/** Lei 14.133 art. 59 §4º: obras/serviços de engenharia abaixo de 75% do orçado. */
export const LIMITE_EXEQUIBILIDADE_ENGENHARIA = 75;
/** IN SEGES 73/2022 art. 34: bens e serviços em geral abaixo de 50% do orçado (indício). */
export const LIMITE_EXEQUIBILIDADE_GERAL = 50;

/**
 * Indício de inexequibilidade da proposta:
 *  - obras e serviços de engenharia: abaixo de 75% do valor orçado (Lei
 *    14.133 art. 59 §4º);
 *  - bens e serviços em geral: abaixo de 50% do valor orçado (IN SEGES
 *    73/2022 art. 34 — indício, apurado por diligência).
 * É ALERTA: o aceite exige justificativa (o licitante pode demonstrar a
 * exequibilidade — art. 59 §2º), nunca bloqueio automático. Sem orçamento
 * (valor estimado zero/sigiloso ausente) não há alerta.
 */
export function alertaExequibilidade(p: {
  tipoContratacao: string | null | undefined;
  valorProposta: number;
  valorOrcado: number;
}): AlertaExequibilidade | null {
  const orcado = Number(p.valorOrcado);
  const valor = Number(p.valorProposta);
  if (!(orcado > 0) || !(valor > 0)) return null;
  const engenharia = OBRAS_E_ENGENHARIA.includes(String(p.tipoContratacao || ''));
  const limite = engenharia ? LIMITE_EXEQUIBILIDADE_ENGENHARIA : LIMITE_EXEQUIBILIDADE_GERAL;
  const percentual = arred((valor / orcado) * 100, 2);
  if (percentual >= limite) return null;
  return {
    percentualDoOrcado: percentual,
    limitePercentual: limite,
    valorProposta: valor,
    valorOrcado: orcado,
    baseLegal: engenharia ? 'Lei 14.133/2021, art. 59, §4º' : 'IN SEGES/ME 73/2022, art. 34',
    mensagem:
      `Proposta de ${brl(valor)} corresponde a ${percentual.toFixed(2).replace('.', ',')}% do valor orçado (${brl(orcado)}), ` +
      `abaixo de ${limite}% — indício de inexequibilidade${engenharia ? ' em obras e serviços de engenharia' : ''}. ` +
      'O aceite exige justificativa (demonstração de exequibilidade, art. 59 §2º).',
  };
}
