/**
 * ============================================================================
 * MODOS DE DISPUTA — regras PURAS das estratégias do motor único (plano E2.4)
 * ============================================================================
 *
 * Lei 14.133/2021 art. 56; IN SEGES/ME 73/2022 arts. 22–25 e 27.
 *
 * Os quatro modos são ESTRATÉGIAS do mesmo motor (`DisputaService`): mesma
 * tabela de lances, mesmo `registrarLance`, mesmo relógio (DisputaTimerService).
 * Cada estratégia só decide (a) que fase o item está, (b) quem pode dar lance
 * nessa fase e com que origem, (c) o que acontece quando o relógio da fase
 * zera. Nada aqui toca banco — testado em `modos-disputa.spec.ts`; quem
 * persiste é o `ModoDisputaService`.
 *
 *  ABERTO (IN 73 art. 23): etapa de 10 min; lance nos últimos 2 min prorroga
 *    2 min, sucessivamente; sem lance na prorrogação encerra. Tempos pelo
 *    resolvedor de parâmetros. Reinício para as demais colocações (Lei art.
 *    56 §4º) = ato do pregoeiro sobre item encerrado (`REINICIO_DEMAIS`).
 *  ABERTO_FECHADO (IN 73 art. 24): etapa aberta de 15 min (parâmetro, SEM
 *    prorrogação) → aviso de fechamento iminente → tempo aleatório de até
 *    10 min (sorteado, sigiloso; lances continuam) → etapa fechada: o autor da
 *    melhor oferta e os das ofertas até 10% (20% com margem de preferência)
 *    — mínimo de 3, na ordem de classificação — mandam UM lance final fechado
 *    em 5 min (parâmetro), sigiloso até o fim do prazo → ranking final pelo
 *    melhor valor de cada licitante (aberto + fechado).
 *  FECHADO_ABERTO (IN 73 art. 25): as propostas são a etapa fechada; o
 *    sistema classifica a melhor + até 10% (mín. 3) para a etapa aberta (regras
 *    do art. 23); os demais não dão lance mas continuam no ranking.
 *  FECHADO (Lei art. 56 I): sem lances; ranking só pelas propostas.
 */

export type ModoDisputaMotor = 'ABERTO' | 'ABERTO_FECHADO' | 'FECHADO_ABERTO' | 'FECHADO';

/**
 * Fase do item dentro do modo (tabela `disputa_estado_modo_item`):
 *  ABERTA          — etapa de lances abertos (todos os modos com lance);
 *  ALEATORIO       — aberto-fechado: aviso de fechamento iminente dado, tempo aleatório correndo;
 *  FECHADA         — aberto-fechado: prazo do lance final fechado;
 *  REINICIO_DEMAIS — reinício da disputa aberta para as demais colocações (art. 56 §4º);
 *  ENCERRADA       — fim (o item está ENCERRADO).
 */
export type FaseModo = 'ABERTA' | 'ALEATORIO' | 'FECHADA' | 'REINICIO_DEMAIS' | 'ENCERRADA';

/** Direção do ranking: MENOR valor é melhor, ou MAIOR valor é melhor. */
export type DirecaoLance = 'MENOR' | 'MAIOR';

export const MODOS_MOTOR: ModoDisputaMotor[] = ['ABERTO', 'ABERTO_FECHADO', 'FECHADO_ABERTO', 'FECHADO'];

/** Padrões legais dos modos (quando nem sessão nem parâmetro do órgão definem). */
export const PADROES_MODOS = {
  /** IN 73 art. 24 caput: etapa aberta do aberto-fechado = 15 min. */
  etapaAbertaHibridaMinutos: 15,
  /** IN 73 art. 24 §1º: "período de até dez minutos, aleatoriamente determinado". */
  tempoAleatorioMaxMinutos: 10,
  /** IN 73 art. 24 §2º: lance final e fechado "em até cinco minutos". */
  lanceFinalFechadoMinutos: 5,
  /** IN 73 arts. 24 §2º e 25: ofertas "até dez por cento" da melhor. */
  faixaClassificacaoPercentual: 10,
  /** Decreto 11.890/2024 (margem de preferência): a faixa sobe para 20%. */
  faixaComMargemPreferenciaPercentual: 20,
  /** IN 73 arts. 24 §4º e 25 §1º: sem 3 ofertas na faixa, os melhores seguintes até o máximo de 3. */
  minimoClassificados: 3,
  /** IN 73 art. 27 §1º: desconexão do agente por mais de 10 min suspende a sessão. */
  desconexaoLimiteMinutos: 10,
  /** IN 73 art. 27 §1º: reinício só 24 h após a comunicação aos participantes. */
  antecedenciaRetomadaHoras: 24,
} as const;

/** Normaliza o modo da licitação (enum ModoDisputa) — desconhecido/nulo = ABERTO. */
export function modoDoMotor(modo: string | null | undefined): ModoDisputaMotor {
  return (MODOS_MOTOR as string[]).includes(String(modo)) ? (modo as ModoDisputaMotor) : 'ABERTO';
}

// ============================================================================
// MODO × CRITÉRIO (Lei 14.133 art. 56 §§1º e 2º)
// ============================================================================

/**
 * Mensagem de recusa da combinação modo × critério (null = permitida).
 *  - §1º: "A utilização isolada do modo de disputa fechado será vedada quando
 *    adotados os critérios de julgamento de menor preço ou de maior desconto."
 *  - §2º: "A utilização do modo de disputa aberto será vedada quando adotado o
 *    critério de julgamento de técnica e preço."
 * Decisão: só as vedações da LEI são bloqueadas. A tabela da IN 73 (que só trata
 * de pregão/concorrência) não é usada para proibir outras combinações — ex.:
 * maior lance (leilão, E7c) com aberto é o uso normal.
 */
export function motivoModoCriterioInvalido(modo: string | null | undefined, criterio: string | null | undefined): string | null {
  const m = modoDoMotor(modo);
  const c = String(criterio ?? 'MENOR_PRECO');
  if (m === 'FECHADO' && (c === 'MENOR_PRECO' || c === 'MAIOR_DESCONTO')) {
    return (
      'O modo de disputa FECHADO não pode ser usado isoladamente com o critério ' +
      `${c === 'MENOR_PRECO' ? 'menor preço' : 'maior desconto'} (Lei 14.133/2021, art. 56 §1º). ` +
      'Use o modo aberto, aberto e fechado ou fechado e aberto.'
    );
  }
  if (m === 'ABERTO' && c === 'TECNICA_E_PRECO') {
    return (
      'O modo de disputa ABERTO não pode ser usado com o critério técnica e preço (Lei 14.133/2021, art. 56 §2º). ' +
      'Use o modo aberto e fechado, fechado e aberto ou fechado.'
    );
  }
  return null;
}

// ============================================================================
// DIREÇÃO DO LANCE POR CRITÉRIO
// ============================================================================

/**
 * Direção do ranking pelo critério de julgamento.
 *
 * MAIOR_DESCONTO: o licitante informa o PREÇO resultante (proposta_itens só
 * guarda valor_unitario/valor_total, não percentual) — o desconto é
 * `(referência − valor) / referência`, estritamente decrescente no valor.
 * Ordenar o desconto em ordem DECRESCENTE é, portanto, ordenar o valor em
 * ordem CRESCENTE: direção MENOR, como o menor preço. As faixas de
 * classificação (10%/20%) do maior desconto são medidas no DESCONTO (ver
 * `selecionarClassificados`), e a tela mostra o desconto equivalente.
 *
 * MAIOR_LANCE (leilão, art. 33 V): direção MAIOR — o motor já ordena, valida e
 * classifica ao contrário; o E7c só precisa dos dados (bens, avaliação).
 */
export function direcaoDoCriterio(criterio: string | null | undefined): DirecaoLance {
  return criterio === 'MAIOR_LANCE' ? 'MAIOR' : 'MENOR';
}

/** `a` é melhor que `b` na direção? */
export function melhorQue(a: number, b: number, direcao: DirecaoLance): boolean {
  return direcao === 'MAIOR' ? a > b : a < b;
}

/** Comparador para ordenar do melhor para o pior. */
export function comparar(direcao: DirecaoLance) {
  return (a: number, b: number) => (direcao === 'MAIOR' ? b - a : a - b);
}

/** SQL do ORDER BY do valor na direção (nunca vem de fora — só os dois literais). */
export function ordemSql(direcao: DirecaoLance): 'ASC' | 'DESC' {
  return direcao === 'MAIOR' ? 'DESC' : 'ASC';
}

/** Desconto (%) de um valor sobre a referência. */
export function descontoPercentual(valor: number, referencia: number): number {
  if (!(referencia > 0)) return 0;
  return ((referencia - valor) / referencia) * 100;
}

// ============================================================================
// CLASSIFICAÇÃO PARA A ETAPA SEGUINTE (10% / 20%, mínimo 3, empates)
// ============================================================================

export interface OfertaClassificacao {
  fornecedorId: string;
  /** Melhor valor do licitante (proposta ou lance), na base do lance. */
  valor: number;
  registradoEm?: Date | string | number;
}

export interface OpcoesClassificacao {
  /** 10 (IN 73) ou 20 (margem de preferência). */
  percentual: number;
  direcao?: DirecaoLance;
  /** Critério — no MAIOR_DESCONTO a faixa é medida no desconto sobre `referencia`. */
  criterio?: string | null;
  referencia?: number | null;
  /** Mínimo de classificados (IN 73: 3). */
  minimo?: number;
}

export interface ResultadoClassificacao {
  /** Fornecedores classificados, na ordem de classificação. */
  classificados: string[];
  /** Quantos estavam na faixa percentual. */
  naFaixa: number;
  /** A regra do mínimo (os melhores seguintes, até 3) foi usada. */
  completadoPeloMinimo: boolean;
  /** Valor-limite da faixa (na base do lance). */
  limiteFaixa: number | null;
}

const EPS = 0.00005;

/**
 * Quem vai para a etapa seguinte (IN 73 art. 24 §§2º e 4º — lance final
 * fechado; art. 25 caput e §1º — etapa aberta do fechado-aberto):
 *  1. o autor da melhor oferta e os das ofertas até `percentual`% piores que ela
 *     (menor preço: valor ≤ melhor × (1 + p); maior lance: valor ≥ melhor ×
 *     (1 − p); maior desconto: desconto ≥ melhorDesconto × (1 − p));
 *  2. se forem menos de `minimo` (3), entram os autores das melhores ofertas
 *     seguintes, na ordem de classificação, até completar 3 ("até o máximo de
 *     três" — o total, contando os da faixa);
 *  3. EMPATE no corte: quem tem o MESMO valor do último classificado também
 *     entra (decisão: a IN não trata o empate no corte; excluir um de dois
 *     valores idênticos por ordem de envio seria arbitrário — o empate
 *     definitivo só se resolve no fim, pelo art. 60 da Lei / art. 28 da IN).
 */
export function selecionarClassificados(ofertas: OfertaClassificacao[], opts: OpcoesClassificacao): ResultadoClassificacao {
  const direcao = opts.direcao ?? 'MENOR';
  const minimo = opts.minimo ?? PADROES_MODOS.minimoClassificados;
  const p = Math.max(0, Number(opts.percentual) || 0) / 100;
  const tempo = (o: OfertaClassificacao) => (o.registradoEm != null ? new Date(o.registradoEm).getTime() : 0);

  // Uma oferta por licitante (a melhor), ordenadas do melhor para o pior
  const porFornecedor = new Map<string, OfertaClassificacao>();
  for (const o of ofertas) {
    if (!o?.fornecedorId || !(Number(o.valor) > 0)) continue;
    const atual = porFornecedor.get(o.fornecedorId);
    if (!atual || melhorQue(Number(o.valor), Number(atual.valor), direcao)) porFornecedor.set(o.fornecedorId, o);
  }
  const ordenadas = [...porFornecedor.values()].sort(
    (a, b) => comparar(direcao)(Number(a.valor), Number(b.valor)) || tempo(a) - tempo(b),
  );
  if (!ordenadas.length) return { classificados: [], naFaixa: 0, completadoPeloMinimo: false, limiteFaixa: null };

  const melhor = Number(ordenadas[0].valor);
  const ref = Number(opts.referencia) || 0;
  let naFaixaFn: (v: number) => boolean;
  let limiteFaixa: number;
  if (opts.criterio === 'MAIOR_DESCONTO' && ref > 0 && descontoPercentual(melhor, ref) > 0) {
    // Faixa medida no desconto: "percentuais até dez por cento inferiores" (art. 24 §2º)
    const dMin = descontoPercentual(melhor, ref) * (1 - p);
    limiteFaixa = ref * (1 - dMin / 100);
    naFaixaFn = (v) => descontoPercentual(v, ref) + EPS >= dMin;
  } else if (direcao === 'MAIOR') {
    limiteFaixa = melhor * (1 - p);
    naFaixaFn = (v) => v + EPS >= limiteFaixa;
  } else {
    limiteFaixa = melhor * (1 + p);
    naFaixaFn = (v) => v <= limiteFaixa + EPS;
  }

  const naFaixa = ordenadas.filter((o) => naFaixaFn(Number(o.valor)));
  let escolhidas = naFaixa;
  let completado = false;
  if (naFaixa.length < minimo) {
    escolhidas = ordenadas.slice(0, Math.min(minimo, ordenadas.length));
    completado = escolhidas.length > naFaixa.length;
  }
  // Empate no corte
  const ultimo = Number(escolhidas[escolhidas.length - 1].valor);
  for (const o of ordenadas.slice(escolhidas.length)) {
    if (Math.abs(Number(o.valor) - ultimo) < EPS) escolhidas = [...escolhidas, o];
    else break;
  }
  return {
    classificados: escolhidas.map((o) => o.fornecedorId),
    naFaixa: naFaixa.length,
    completadoPeloMinimo: completado,
    limiteFaixa: Math.round(limiteFaixa * 100) / 100,
  };
}

/** Faixa de classificação: 10%, ou 20% com margem de preferência (Decreto 11.890/2024). */
export function percentualFaixa(margemPreferencia: boolean): number {
  return margemPreferencia ? PADROES_MODOS.faixaComMargemPreferenciaPercentual : PADROES_MODOS.faixaClassificacaoPercentual;
}

// ============================================================================
// TEMPO ALEATÓRIO (IN 73 art. 24 §1º)
// ============================================================================

/**
 * Sorteia a duração do tempo aleatório em SEGUNDOS, "até dez minutos". O
 * intervalo configurado na sessão (tempo_aleatorio_min/max_minutos) é
 * respeitado, mas o máximo nunca passa de 10 min e o mínimo nunca é negativo
 * ou maior que o máximo. `aleatorio` ∈ [0, 1) — injetável para teste; em
 * produção vem de `crypto.randomInt`.
 */
export function sortearTempoAleatorioSegundos(
  minMinutos: number | null | undefined,
  maxMinutos: number | null | undefined,
  aleatorio: () => number,
): number {
  const teto = PADROES_MODOS.tempoAleatorioMaxMinutos * 60;
  const max = Math.min(teto, Math.max(1, Math.round((Number(maxMinutos) > 0 ? Number(maxMinutos) : PADROES_MODOS.tempoAleatorioMaxMinutos) * 60)));
  const min = Math.min(max, Math.max(1, Math.round((Number(minMinutos) > 0 ? Number(minMinutos) : 0) * 60)));
  const r = Math.min(0.999999, Math.max(0, aleatorio()));
  return min + Math.floor(r * (max - min + 1));
}

// ============================================================================
// RELÓGIO POR MODO (usa a fórmula única do art. 23 para as etapas abertas)
// ============================================================================

export type FaseRelogioModo = 'ETAPA_ABERTA' | 'PRORROGACAO' | 'TEMPO_ALEATORIO' | 'LANCE_FECHADO' | 'ENCERRADO';

/** O que o relógio pede quando a fase zera. */
export type AcaoExpiracao = 'ENCERRAR' | 'INICIAR_ALEATORIO' | 'INICIAR_FECHADA';

export interface EntradaRelogioModo {
  modo: ModoDisputaMotor;
  fase: FaseModo | null | undefined;
  status: string | null | undefined;
  disputaIniciadaEm: Date | string | null | undefined;
  ultimoLanceEm: Date | string | null | undefined;
  /** Art. 23 (aberto; etapa aberta do fechado-aberto; reinício). */
  tempoInicialMinutos: number;
  prorrogacaoMinutos: number;
  /** Aberto-fechado: duração fixa da etapa aberta. */
  etapaAbertaHibridaMinutos: number;
  /** Aberto-fechado: tempo aleatório (início + sorteio em s) e fim do prazo fechado. */
  inicioAleatorio?: Date | string | null;
  aleatorioSorteadoSegundos?: number | null;
  fimFaseEm?: Date | string | null;
  agora?: number;
}

export interface SaidaRelogioModo {
  fase: FaseRelogioModo;
  restanteMs: number;
  restanteSegundos: number;
  emProrrogacao: boolean;
  expirado: boolean;
  /** O tempo restante NÃO pode ser mostrado a ninguém (tempo aleatório — sigiloso). */
  oculto: boolean;
  aoExpirar: AcaoExpiracao | null;
}

const msDe = (d: Date | string | null | undefined): number | null => (d ? new Date(d).getTime() : null);

function saidaModo(fase: FaseRelogioModo, restanteMs: number, aoExpirar: AcaoExpiracao, oculto = false): SaidaRelogioModo {
  const r = Math.max(0, restanteMs);
  return {
    fase: r > 0 ? fase : 'ENCERRADO',
    restanteMs: r,
    restanteSegundos: oculto ? 0 : Math.floor(r / 1000),
    emProrrogacao: r > 0 && fase === 'PRORROGACAO',
    expirado: r <= 0,
    oculto,
    aoExpirar,
  };
}

/** Relógio art. 23 (mesma fórmula de `relogio-disputa.ts`, reproduzida sem o status). */
function relogioArt23(e: EntradaRelogioModo, agora: number): SaidaRelogioModo {
  const T = Math.max(0, Number(e.tempoInicialMinutos) || 0) * 60_000;
  const P = Math.max(0, Number(e.prorrogacaoMinutos) || 0) * 60_000;
  const inicio = msDe(e.disputaIniciadaEm) ?? agora;
  const ultimo = msDe(e.ultimoLanceEm) ?? inicio;
  const decorrido = agora - inicio;
  const momentoUltimo = ultimo - inicio;
  if (decorrido < T && momentoUltimo < T - P) return saidaModo('ETAPA_ABERTA', T - decorrido, 'ENCERRAR');
  const fim = Math.max(ultimo + P, momentoUltimo < T - P ? inicio + T : ultimo + P);
  return saidaModo('PRORROGACAO', fim - agora, 'ENCERRAR');
}

/**
 * Relógio do item conforme o modo e a fase. Fora de EM_DISPUTA/TEMPO_ALEATORIO
 * não há relógio (expirado = false: o timer não age).
 */
export function calcularRelogioModo(e: EntradaRelogioModo): SaidaRelogioModo {
  const agora = e.agora ?? Date.now();
  if (e.status === 'TEMPO_ALEATORIO') {
    const inicio = msDe(e.inicioAleatorio);
    const dur = Number(e.aleatorioSorteadoSegundos) * 1000;
    const acao: AcaoExpiracao = e.modo === 'ABERTO_FECHADO' ? 'INICIAR_FECHADA' : 'ENCERRAR';
    if (inicio === null || !(dur > 0)) return saidaModo('TEMPO_ALEATORIO', 0, acao, true);
    return saidaModo('TEMPO_ALEATORIO', inicio + dur - agora, acao, true);
  }
  if (e.status !== 'EM_DISPUTA') {
    return { fase: 'ENCERRADO', restanteMs: 0, restanteSegundos: 0, emProrrogacao: false, expirado: false, oculto: false, aoExpirar: null };
  }
  if (e.modo === 'ABERTO_FECHADO') {
    if (e.fase === 'FECHADA') {
      const fim = msDe(e.fimFaseEm);
      return saidaModo('LANCE_FECHADO', fim === null ? 0 : fim - agora, 'ENCERRAR');
    }
    // Etapa aberta de duração FIXA (art. 24 caput) — lances não prorrogam
    const inicio = msDe(e.disputaIniciadaEm) ?? agora;
    const T = Math.max(0, Number(e.etapaAbertaHibridaMinutos) || 0) * 60_000;
    return saidaModo('ETAPA_ABERTA', inicio + T - agora, 'INICIAR_ALEATORIO');
  }
  return relogioArt23(e, agora);
}

// ============================================================================
// DESCONEXÃO DO AGENTE (IN 73 art. 27)
// ============================================================================

/** Passou do limite de desconexão (> 10 min) — a sessão deve ser suspensa. */
export function desconexaoExcedida(desconectadoEm: number | null | undefined, agora: number, limiteMinutos: number = PADROES_MODOS.desconexaoLimiteMinutos): boolean {
  if (!desconectadoEm) return false;
  return agora - desconectadoEm > limiteMinutos * 60_000;
}

/**
 * A data de retomada comunicada respeita a antecedência mínima (24 h após a
 * comunicação — art. 27 §1º)? Devolve a mensagem de recusa ou null.
 */
export function motivoRetomadaInvalida(retomadaEm: Date, comunicadoEm: Date, horas: number = PADROES_MODOS.antecedenciaRetomadaHoras): string | null {
  if (!(retomadaEm instanceof Date) || Number.isNaN(retomadaEm.getTime())) return 'Data de retomada inválida';
  if (retomadaEm.getTime() - comunicadoEm.getTime() < horas * 3_600_000) {
    return `A retomada da sessão suspensa por desconexão do agente de contratação só pode ocorrer decorridas ${horas} horas da comunicação aos participantes (IN SEGES 73/2022, art. 27 §1º).`;
  }
  return null;
}
