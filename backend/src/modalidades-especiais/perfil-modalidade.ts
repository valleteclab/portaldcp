/**
 * ============================================================================
 * PERFIL DAS MODALIDADES ESPECIAIS (plano E7c) — regras PURAS
 * ============================================================================
 *
 * Leilão (Lei 14.133/2021 arts. 6º XL e 31), concurso (arts. 6º XXXIX e 30)
 * e diálogo competitivo (arts. 6º XLII e 32) usam a MESMA base (máquina de
 * estados, motor de disputa, ranking único, recursos, resultado, PNCP). O que
 * muda está aqui, num lugar só:
 *
 *  - RESULTADO DECLARADO (leilão e concurso): não há aceitação de proposta
 *    readequada (IN 73 art. 29) nem habilitação da E4. O resultado de cada
 *    unidade é DECLARADO pelo agente (arrematante — art. 31; trabalho
 *    vencedor com a qualificação conferida — art. 30 I) e o licitante fica
 *    ACEITO em `licitantes_unidade`. A fase recursal (art. 165) começa no
 *    JULGAMENTO (não na HABILITACAO).
 *      · Leilão: "não exigirá registro cadastral prévio, não terá fase de
 *        habilitação e deverá ser homologado assim que concluída a fase de
 *        lances, superada a fase recursal e efetivado o pagamento pelo
 *        licitante vencedor, na forma definida no edital" (art. 31 §4º).
 *        Referência operacional federal: Decreto 11.461/2023 (arts. 8º, 21,
 *        25, 26 §3º e 27 — recurso após o julgamento, pagamento e só então
 *        adjudicação e homologação; inadimplente → lance subsequente).
 *      · Concurso: a qualificação exigida dos participantes é regra do edital
 *        (art. 30 I) — conferida no envelope de identificação do vencedor,
 *        aberto só depois do julgamento (sigilo de autoria).
 *  - Diálogo competitivo: fases de pré-seleção e diálogo antes da fase
 *    competitiva; a partir dela, o rito é o da concorrência (julgamento,
 *    habilitação, recursos, adjudicação, contrato).
 */

export const MODALIDADES_ESPECIAIS = ['LEILAO', 'CONCURSO', 'DIALOGO_COMPETITIVO'] as const;

/** Modalidades cujo resultado é DECLARADO (sem aceitação de proposta readequada nem habilitação da E4). */
export const MODALIDADES_RESULTADO_DECLARADO: ReadonlyArray<string> = ['LEILAO', 'CONCURSO'];

export const ehLeilao = (m: string | null | undefined) => String(m ?? '') === 'LEILAO';
export const ehConcurso = (m: string | null | undefined) => String(m ?? '') === 'CONCURSO';
export const ehDialogo = (m: string | null | undefined) => String(m ?? '') === 'DIALOGO_COMPETITIVO';

export function resultadoDeclarado(modalidade: string | null | undefined): boolean {
  return MODALIDADES_RESULTADO_DECLARADO.includes(String(modalidade ?? ''));
}

/** Fase em que se abre a janela de intenção de recurso (art. 165 §1º I). */
export function faseDaJanelaRecursal(modalidade: string | null | undefined): 'JULGAMENTO' | 'HABILITACAO' {
  return resultadoDeclarado(modalidade) ? 'JULGAMENTO' : 'HABILITACAO';
}

/** Situações do licitante "na vez" que valem como resultado para abrir a janela. */
export function situacoesDeResultado(modalidade: string | null | undefined): string[] {
  return resultadoDeclarado(modalidade) ? ['ACEITO', 'VENCEDOR'] : ['HABILITADO', 'VENCEDOR'];
}

/**
 * Modalidade × critério de julgamento (art. 33 e arts. 30–32):
 *  - leilão só por MAIOR LANCE (art. 6º XL; art. 33 V) e com etapa de lances
 *    (o modo fechado isolado não tem lances — art. 31 §2º IV "período em que
 *    ocorrerá o leilão");
 *  - maior lance só no leilão;
 *  - concurso: melhor técnica ou conteúdo artístico (art. 6º XXXIX; art. 33
 *    III — o sistema usa o critério MELHOR_TECNICA; a natureza técnica,
 *    científica ou artística fica no regulamento do concurso).
 * Diálogo: o critério da fase competitiva é definido no edital dessa fase
 * (art. 32 §1º VIII) — qualquer critério exceto maior lance.
 */
export function motivoModalidadeCriterioInvalido(
  modalidade: string | null | undefined,
  criterio: string | null | undefined,
  modo?: string | null,
): string | null {
  const m = String(modalidade ?? '');
  const c = String(criterio ?? 'MENOR_PRECO');
  if (m === 'LEILAO') {
    if (c !== 'MAIOR_LANCE') return 'O leilão é julgado pelo critério de MAIOR LANCE (Lei 14.133/2021, art. 6º, XL e art. 33, V).';
    if (String(modo ?? '') === 'FECHADO') {
      return 'O leilão tem etapa de lances (art. 31, §2º, IV): use o modo aberto, aberto e fechado ou fechado e aberto.';
    }
    return null;
  }
  if (c === 'MAIOR_LANCE') return 'O critério de maior lance é exclusivo do leilão (Lei 14.133/2021, art. 33, V e art. 6º, XL).';
  if (m === 'CONCURSO' && c !== 'MELHOR_TECNICA') {
    return 'O concurso é julgado pelo critério de melhor técnica ou conteúdo artístico (Lei 14.133/2021, art. 6º, XXXIX e art. 33, III).';
  }
  return null;
}
