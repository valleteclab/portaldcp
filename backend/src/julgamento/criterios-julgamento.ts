/**
 * ============================================================================
 * CRITÉRIOS DE JULGAMENTO PONTUADOS — REGRAS PURAS (Lei 14.133/2021)
 * ============================================================================
 *
 *  - MELHOR TÉCNICA (art. 35): "considerará exclusivamente as propostas
 *    técnicas"; o edital fixa o prêmio/remuneração. Ranking pela NOTA TÉCNICA.
 *    A negociação de preço do "melhor técnica" da Lei 8.666 (art. 46 §1º) NÃO
 *    existe na Lei 14.133 — o valor é o fixado no edital (a proposta de preço
 *    serve só como a remuneração declarada).
 *  - TÉCNICA E PREÇO (art. 36): notas técnicas avaliadas e ponderadas e, em
 *    seguida, as propostas de preço, "na proporção máxima de 70% de valoração
 *    para a proposta técnica" (§2º). Normalização adotada (documentada):
 *        índice técnico  IT = NT / maior NT entre os classificados
 *        índice de preço IP = menor preço entre os classificados / preço
 *        índice final    IF = pT × IT + pP × IP   (pT ≤ 0,70; pT + pP = 1)
 *    ranking decrescente de IF (4 casas decimais; IF igual = empate → art. 60).
 *  - MAIOR RETORNO ECONÔMICO (art. 39 — contrato de eficiência): proposta de
 *    trabalho com a economia estimada (R$) + proposta de preço como PERCENTUAL
 *    sobre a economia; §3º: "o retorno econômico será o resultado da economia
 *    que se estima gerar com a execução da proposta de trabalho, deduzida a
 *    proposta de preço" → retorno = economia − economia × percentual.
 *    Ranking decrescente do retorno.
 *
 *  NOTA TÉCNICA (art. 37 II — quesitos com notas atribuídas por banca):
 *    nota do quesito = média das notas dos membros da banca;
 *    NT = 100 × Σ(peso_q × nota_q / nota máxima_q) / Σ peso_q   (escala 0–100, 4 casas).
 *  Banca com no mínimo 3 membros (art. 37 §1º).
 */

import {
  DetalheCriterioRanking,
  Desempatador,
  EntradaRanking,
  OfertaRanking,
  SituacaoLicitante,
  desempatePorRegistro,
  ehExcluida,
} from './regras-julgamento';

export type CriterioPontuado = 'MELHOR_TECNICA' | 'TECNICA_E_PRECO' | 'MAIOR_RETORNO_ECONOMICO';

export const CRITERIOS_TECNICOS: ReadonlyArray<string> = ['MELHOR_TECNICA', 'TECNICA_E_PRECO'];
export const CRITERIOS_PONTUADOS: ReadonlyArray<string> = [...CRITERIOS_TECNICOS, 'MAIOR_RETORNO_ECONOMICO'];

export const ehCriterioTecnico = (c: string | null | undefined) => !!c && CRITERIOS_TECNICOS.includes(c);
export const ehCriterioPontuado = (c: string | null | undefined): c is CriterioPontuado => !!c && CRITERIOS_PONTUADOS.includes(c);

/** Art. 36 §2º: proporção máxima de 70% para a proposta técnica. */
export const PESO_TECNICA_MAXIMO = 70;
/** Art. 37 §1º: banca com no mínimo 3 membros. */
export const MINIMO_MEMBROS_BANCA = 3;
/** Casas decimais da nota técnica e dos índices (igualdade nesta precisão = empate). */
export const CASAS_INDICE = 4;

const arred = (v: number, casas = CASAS_INDICE) => {
  const f = 10 ** casas;
  return Math.round((v + Number.EPSILON) * f) / f;
};

// ============================================================================
// CONFIGURAÇÃO (edital)
// ============================================================================

export interface QuesitoConfig {
  id?: string;
  descricao: string;
  peso: number;
  notaMaxima: number;
  criterioAvaliacao?: string | null;
}

export interface ConfiguracaoTecnicaEntrada {
  criterio: string;
  /** Percentual (0–100) de valoração da técnica — só técnica e preço. */
  pesoTecnica?: number | null;
  /** Nota técnica mínima (0–100) para seguir na licitação; null = sem mínimo. */
  notaMinima?: number | null;
  quesitos: QuesitoConfig[];
}

/** Erros da configuração técnica (vazio = válida). */
export function validarConfiguracaoTecnica(c: ConfiguracaoTecnicaEntrada): string[] {
  const erros: string[] = [];
  if (!ehCriterioTecnico(c.criterio)) {
    erros.push('Quesitos técnicos só se aplicam aos critérios melhor técnica e técnica e preço (Lei 14.133, arts. 35 e 36).');
    return erros;
  }
  if (!Array.isArray(c.quesitos) || !c.quesitos.length) erros.push('Defina ao menos um quesito técnico (art. 37, II).');
  (c.quesitos ?? []).forEach((q, i) => {
    const n = i + 1;
    if (!q || !String(q.descricao ?? '').trim()) erros.push(`Quesito ${n}: descrição obrigatória`);
    if (!(Number(q?.peso) > 0)) erros.push(`Quesito ${n}: peso deve ser maior que zero`);
    if (!(Number(q?.notaMaxima) > 0)) erros.push(`Quesito ${n}: nota máxima deve ser maior que zero`);
  });
  if (c.criterio === 'TECNICA_E_PRECO') {
    const p = Number(c.pesoTecnica);
    if (c.pesoTecnica == null || !Number.isFinite(p) || p <= 0) {
      erros.push('Informe o peso da proposta técnica (percentual) — técnica e preço (art. 36).');
    } else if (p > PESO_TECNICA_MAXIMO) {
      erros.push(`O peso da proposta técnica não pode passar de ${PESO_TECNICA_MAXIMO}% (Lei 14.133/2021, art. 36, §2º).`);
    } else if (p >= 100) {
      erros.push('O peso do preço deve ser maior que zero.');
    }
  }
  if (c.notaMinima != null) {
    const m = Number(c.notaMinima);
    if (!Number.isFinite(m) || m < 0 || m > 100) erros.push('A nota técnica mínima é de 0 a 100.');
  }
  return erros;
}

/** Pesos efetivos (fração): melhor técnica = só técnica; técnica e preço = pT/(100−pT). */
export function pesosEfetivos(criterio: string, pesoTecnica: number | null | undefined): { tecnica: number; preco: number } {
  if (criterio === 'TECNICA_E_PRECO') {
    const p = Math.min(PESO_TECNICA_MAXIMO, Math.max(0, Number(pesoTecnica) || 0));
    return { tecnica: p / 100, preco: (100 - p) / 100 };
  }
  if (criterio === 'MELHOR_TECNICA') return { tecnica: 1, preco: 0 };
  return { tecnica: 0, preco: 1 };
}

// ============================================================================
// NOTA TÉCNICA
// ============================================================================

export interface NotaMembro {
  quesitoId: string;
  fornecedorId: string;
  membroId: string;
  nota: number;
}

export function motivoNotaInvalida(nota: number, notaMaxima: number): string | null {
  const n = Number(nota);
  if (!Number.isFinite(n) || n < 0) return 'Nota inválida';
  if (n > Number(notaMaxima)) return `A nota não pode passar da nota máxima do quesito (${notaMaxima})`;
  return null;
}

/** Nota técnica (0–100) de um licitante: média por quesito entre os membros, ponderada pelos pesos. */
export function notaTecnica(
  quesitos: Array<Required<Pick<QuesitoConfig, 'id' | 'peso' | 'notaMaxima'>>>,
  notas: NotaMembro[],
  fornecedorId: string,
): { nota: number; porQuesito: Array<{ quesitoId: string; media: number; notas: number }> } {
  const somaPesos = quesitos.reduce((s, q) => s + Number(q.peso), 0);
  const porQuesito = quesitos.map((q) => {
    const doQuesito = notas.filter((n) => n.quesitoId === q.id && n.fornecedorId === fornecedorId).map((n) => Number(n.nota));
    const media = doQuesito.length ? doQuesito.reduce((s, v) => s + v, 0) / doQuesito.length : 0;
    return { quesitoId: q.id, media: arred(media), notas: doQuesito.length };
  });
  if (!(somaPesos > 0)) return { nota: 0, porQuesito };
  const ponderada = quesitos.reduce((s, q, i) => s + (Number(q.peso) * porQuesito[i].media) / Number(q.notaMaxima), 0);
  return { nota: arred((100 * ponderada) / somaPesos), porQuesito };
}

/**
 * Pendências para PUBLICAR as notas técnicas: banca com o mínimo legal e
 * todas as notas de todos os membros, em todos os quesitos, para todos os
 * licitantes.
 */
export function pendenciasPublicacao(p: {
  quesitos: Array<{ id: string; descricao: string }>;
  membros: Array<{ id: string; nome: string }>;
  licitantes: Array<{ id: string; nome: string }>;
  notas: NotaMembro[];
  minimoMembros?: number;
}): string[] {
  const pend: string[] = [];
  const minimo = p.minimoMembros ?? MINIMO_MEMBROS_BANCA;
  if (!p.quesitos.length) pend.push('Nenhum quesito técnico definido');
  if (p.membros.length < minimo) pend.push(`A banca precisa de no mínimo ${minimo} membros (Lei 14.133/2021, art. 37, §1º) — há ${p.membros.length}`);
  if (!p.licitantes.length) pend.push('Nenhum licitante com proposta válida');
  const tem = new Set(p.notas.map((n) => `${n.quesitoId}|${n.fornecedorId}|${n.membroId}`));
  for (const m of p.membros) {
    let faltam = 0;
    for (const q of p.quesitos) for (const l of p.licitantes) if (!tem.has(`${q.id}|${l.id}|${m.id}`)) faltam++;
    if (faltam) pend.push(`${m.nome}: faltam ${faltam} nota(s)`);
  }
  return pend;
}

// ============================================================================
// TÉCNICA E PREÇO — normalização
// ============================================================================

export function indiceTecnicaPreco(p: {
  nota: number;
  maiorNota: number;
  preco: number;
  menorPreco: number;
  pesoTecnica: number; // percentual
}): { indiceTecnico: number; indicePreco: number; indiceFinal: number } {
  const { tecnica, preco } = pesosEfetivos('TECNICA_E_PRECO', p.pesoTecnica);
  const it = p.maiorNota > 0 ? Number(p.nota) / Number(p.maiorNota) : 0;
  const ip = Number(p.preco) > 0 ? Number(p.menorPreco) / Number(p.preco) : 0;
  return { indiceTecnico: arred(it), indicePreco: arred(ip), indiceFinal: arred(tecnica * it + preco * ip) };
}

// ============================================================================
// MAIOR RETORNO ECONÔMICO
// ============================================================================

export function retornoEconomico(p: { economiaEstimada: number; percentualRemuneracao: number }): { remuneracao: number; retorno: number } {
  const economia = Number(p.economiaEstimada);
  const perc = Number(p.percentualRemuneracao);
  const remuneracao = Math.round(economia * perc) / 100; // centavos: economia × perc / 100
  return { remuneracao: arred(remuneracao, 2), retorno: arred(economia - remuneracao, 2) };
}

export function motivoRetornoInvalido(p: { economiaEstimada: number; percentualRemuneracao: number }): string | null {
  const e = Number(p.economiaEstimada);
  const perc = Number(p.percentualRemuneracao);
  if (!Number.isFinite(e) || e <= 0) return 'Informe a economia estimada (R$) maior que zero (art. 39 §1º I)';
  if (!Number.isFinite(perc) || perc <= 0 || perc >= 100) return 'O percentual sobre a economia deve ser maior que 0 e menor que 100 (art. 39 §1º II)';
  return null;
}

// ============================================================================
// RANKING PONTUADO (estratégia do RankingService por critério)
// ============================================================================

export interface DadosPontuacao {
  /** Nota técnica publicada por fornecedor (melhor técnica / técnica e preço). */
  notas?: Map<string, number>;
  /** Percentual de valoração da técnica (técnica e preço). */
  pesoTecnica?: number | null;
  /** Proposta de retorno econômico por fornecedor (na unidade). */
  retornos?: Map<string, { economiaEstimada: number; percentualRemuneracao: number }>;
  /** Nota técnica abaixo da mínima do edital (resultado publicado): desclassificados. */
  desclassificados?: Set<string>;
}

const chaveIgual = (a: number | null, b: number | null) =>
  a != null && b != null && Math.round(a * 10 ** CASAS_INDICE) === Math.round(b * 10 ** CASAS_INDICE);

/**
 * Ranking dos critérios pontuados: excluídos (desclassificado/recusado/
 * inabilitado) no fim sem posição; os demais em ordem DECRESCENTE da
 * pontuação (nota técnica, índice final ou retorno); sem pontuação depois dos
 * pontuados (pelo registro); pontuação igual (4 casas) → desempatador (art. 60).
 * A normalização da técnica e preço usa só os NÃO excluídos (maior nota e
 * menor preço entre os classificados).
 */
export async function montarRankingPontuado(
  criterio: CriterioPontuado,
  ofertas: OfertaRanking[],
  situacoes: Map<string, string>,
  dados: DadosPontuacao,
  opts: { desempatar?: Desempatador; licitacaoId?: string | null; unidadeId?: string } = {},
): Promise<EntradaRanking[]> {
  const desempatar = opts.desempatar ?? desempatePorRegistro;
  const porRegistro = [...ofertas].sort((a, b) => a.registradoEm.getTime() - b.registradoEm.getTime());
  const entradas = porRegistro.map<EntradaRanking>((o) => {
    const situacao =
      (situacoes.get(o.fornecedorId) as SituacaoLicitante) ??
      (dados.desclassificados?.has(o.fornecedorId) ? SituacaoLicitante.DESCLASSIFICADO : SituacaoLicitante.CLASSIFICADO);
    return { ...o, situacao, excluido: ehExcluida(situacao) || !!dados.desclassificados?.has(o.fornecedorId), posicao: null };
  });
  const validas = entradas.filter((e) => !e.excluido);
  const excluidas = entradas.filter((e) => e.excluido);

  const notaDe = (id: string) => (dados.notas?.has(id) ? Number(dados.notas.get(id)) : null);
  const { tecnica: pT, preco: pP } = pesosEfetivos(criterio, dados.pesoTecnica);
  const notasValidas = validas.map((e) => notaDe(e.fornecedorId)).filter((n): n is number => n != null);
  const maiorNota = notasValidas.length ? Math.max(...notasValidas) : 0;
  const precosValidos = validas.filter((e) => notaDe(e.fornecedorId) != null && e.melhorValor > 0).map((e) => e.melhorValor);
  const menorPreco = precosValidos.length ? Math.min(...precosValidos) : 0;

  const detalhe = (e: EntradaRanking): DetalheCriterioRanking => {
    if (criterio === 'MAIOR_RETORNO_ECONOMICO') {
      const r = dados.retornos?.get(e.fornecedorId);
      if (!r) return { tipo: criterio, pontuacao: null, semPontuacao: true };
      const { remuneracao, retorno } = retornoEconomico(r);
      return {
        tipo: criterio,
        pontuacao: retorno,
        economiaEstimada: Number(r.economiaEstimada),
        percentualRemuneracao: Number(r.percentualRemuneracao),
        remuneracao,
        retornoEconomico: retorno,
      };
    }
    const nota = notaDe(e.fornecedorId);
    if (nota == null) return { tipo: criterio, pontuacao: null, notaTecnica: null, semPontuacao: true };
    if (criterio === 'MELHOR_TECNICA') return { tipo: criterio, pontuacao: nota, notaTecnica: nota, pesoTecnica: 100, pesoPreco: 0 };
    const idx = indiceTecnicaPreco({ nota, maiorNota, preco: e.melhorValor, menorPreco, pesoTecnica: Number(dados.pesoTecnica) || 0 });
    return {
      tipo: criterio,
      pontuacao: idx.indiceFinal,
      notaTecnica: nota,
      ...idx,
      pesoTecnica: arred(pT * 100, 2),
      pesoPreco: arred(pP * 100, 2),
    };
  };

  const comDetalhe = validas.map((e) => ({ ...e, criterio: detalhe(e) }));
  const pontuadas = comDetalhe
    .filter((e) => e.criterio.pontuacao != null)
    .sort((a, b) => Number(b.criterio.pontuacao) - Number(a.criterio.pontuacao) || a.registradoEm.getTime() - b.registradoEm.getTime());
  const semPontuacao = comDetalhe.filter((e) => e.criterio.pontuacao == null);

  const final: EntradaRanking[] = [];
  for (let i = 0; i < pontuadas.length; ) {
    let j = i + 1;
    while (j < pontuadas.length && chaveIgual(pontuadas[j].criterio.pontuacao ?? null, pontuadas[i].criterio.pontuacao ?? null)) j++;
    const grupo = pontuadas.slice(i, j);
    if (grupo.length > 1) {
      final.push(
        ...(await desempatar(
          grupo.map((g) => ({ ...g, empatado: true })),
          { licitacaoId: opts.licitacaoId ?? null, unidadeId: opts.unidadeId ?? '' },
        )),
      );
    } else {
      final.push(grupo[0]);
    }
    i = j;
  }
  final.push(...semPontuacao);
  final.forEach((e, idx) => (e.posicao = idx + 1));
  // Excluídos: só a nota (índices dependem da normalização entre os classificados)
  return [...final, ...excluidas.map((e) => ({ ...e, criterio: { tipo: criterio, pontuacao: null, notaTecnica: notaDe(e.fornecedorId) } }))];
}

/** Chave de ordenação da entrada (maior é melhor nos pontuados; no valor, depende da direção). */
export function chaveDaEntrada(e: EntradaRanking): number {
  return e.criterio?.pontuacao != null ? Number(e.criterio.pontuacao) : Number(e.melhorValor);
}
