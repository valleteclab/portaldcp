/**
 * RESERVA ORÇAMENTÁRIA — regras puras (Entrega 3A; SPEC §2 "ReservaOrcamentaria";
 * mockup Reserva.dc.html; caso PA 139/2025: contrato de 12 meses que cruza o
 * ano — 2025 R$ 6.021,12 + 2026 R$ 55.732,32 — e dotação RENOVADA na virada
 * do exercício).
 *
 *  - linhas por exercício (exercício, valor, situação RESERVADO ou PREVISAO);
 *  - conferência para emitir a informação orçamentária;
 *  - plano da renovação na virada do exercício (nova versão).
 */

export type SituacaoLinhaReserva = 'RESERVADO' | 'PREVISAO';

export interface LinhaReserva {
  exercicio: number;
  valor: number;
  situacao: SituacaoLinhaReserva;
  numero_reserva?: string | null;
}

const arred2 = (n: number) => Math.round(n * 100) / 100;

export function totalDasLinhas(linhas: Array<Pick<LinhaReserva, 'valor'>>): number {
  return arred2((linhas || []).reduce((s, l) => s + (Number(l.valor) || 0), 0));
}

/**
 * Normaliza e valida as linhas: exercício inteiro entre 2000 e 2100, valor
 * positivo com 2 casas, situação RESERVADO ou PREVISAO, um exercício por
 * linha. Devolve as linhas em ordem de exercício ou o erro.
 */
export function validarLinhas(entrada: unknown): { ok: true; linhas: LinhaReserva[] } | { ok: false; erro: string } {
  if (!Array.isArray(entrada)) return { ok: false, erro: 'Informe as linhas por exercício (lista).' };
  if (entrada.length > 10) return { ok: false, erro: 'No máximo 10 exercícios.' };
  const linhas: LinhaReserva[] = [];
  for (const [i, x] of entrada.entries()) {
    const exercicio = Number((x as any)?.exercicio);
    const valor = Number((x as any)?.valor);
    const situacao = String((x as any)?.situacao ?? 'PREVISAO').toUpperCase();
    if (!Number.isInteger(exercicio) || exercicio < 2000 || exercicio > 2100) return { ok: false, erro: `Linha ${i + 1}: exercício inválido.` };
    if (!Number.isFinite(valor) || valor <= 0) return { ok: false, erro: `Linha ${i + 1} (${exercicio}): o valor precisa ser maior que zero.` };
    if (situacao !== 'RESERVADO' && situacao !== 'PREVISAO') return { ok: false, erro: `Linha ${i + 1} (${exercicio}): situação deve ser RESERVADO ou PREVISAO.` };
    if (linhas.some((l) => l.exercicio === exercicio)) return { ok: false, erro: `O exercício ${exercicio} aparece mais de uma vez.` };
    const numero = String((x as any)?.numero_reserva ?? '').trim().slice(0, 40) || null;
    linhas.push({ exercicio, valor: arred2(valor), situacao, numero_reserva: numero });
  }
  return { ok: true, linhas: linhas.sort((a, b) => a.exercicio - b.exercicio) };
}

export interface ConferenciaReserva {
  bloqueios: string[];
  avisos: string[];
  total: number;
}

/**
 * Pode emitir a informação orçamentária?
 *  - dotação escolhida da tabela e lei (LDO) da tabela única;
 *  - ao menos uma linha; a do exercício corrente (se houver) vira RESERVADO
 *    na emissão; exercícios futuros ficam como PREVISÃO;
 *  - nenhuma linha de exercício passado (renove a dotação);
 *  - total diferente do valor estimado: aviso (não bloqueia — a reserva pode
 *    cobrir só o exercício, como nos autos).
 */
export function conferirParaEmitir(
  r: { dotacao_ok: boolean; lei_ldo_ok: boolean; linhas: LinhaReserva[]; declaracao_adequacao?: boolean; declaracao_lrf?: boolean },
  ctx: { exercicio_corrente: number; valor_estimado: number | null },
): ConferenciaReserva {
  const bloqueios: string[] = [];
  const avisos: string[] = [];
  if (!r.dotacao_ok) bloqueios.push('Escolha a dotação orçamentária (tabela de dotações do órgão).');
  if (!r.lei_ldo_ok) bloqueios.push('Escolha a LDO na tabela única de leis orçamentárias.');
  if (!r.linhas.length) bloqueios.push('Informe o valor por exercício.');
  const passadas = r.linhas.filter((l) => l.exercicio < ctx.exercicio_corrente);
  if (passadas.length) {
    bloqueios.push(`Há linha de exercício encerrado (${passadas.map((l) => l.exercicio).join(', ')}): use "Renovar dotação".`);
  }
  if (r.linhas.length && !r.linhas.some((l) => l.exercicio === ctx.exercicio_corrente)) {
    avisos.push(`Nenhuma linha no exercício corrente (${ctx.exercicio_corrente}): nada será reservado agora, só previsto.`);
  }
  if (!r.declaracao_adequacao) bloqueios.push('Declare a adequação à LOA, LDO e PPA.');
  if (!r.declaracao_lrf) bloqueios.push('Declare a compatibilidade com os arts. 15, 16 e 17 da LRF.');
  const total = totalDasLinhas(r.linhas);
  const estimado = Number(ctx.valor_estimado) || 0;
  if (estimado > 0 && Math.abs(total - estimado) >= 0.01) {
    avisos.push(
      `O total por exercício (${total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) é diferente do valor estimado da pesquisa (${estimado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`,
    );
  }
  return { bloqueios, avisos, total };
}

/** Na emissão: a linha do exercício corrente é RESERVADO; as futuras, PREVISAO. */
export function linhasNaEmissao(linhas: LinhaReserva[], exercicioCorrente: number): LinhaReserva[] {
  return linhas.map((l) => ({ ...l, situacao: l.exercicio === exercicioCorrente ? 'RESERVADO' : l.exercicio > exercicioCorrente ? 'PREVISAO' : l.situacao }));
}

/**
 * RENOVAR DOTAÇÃO (virada do exercício): a informação emitida para o
 * exercício N não serve para o contrato que só será assinado em N+1. A nova
 * versão:
 *  - soma no novo exercício o valor das linhas dos exercícios que acabaram
 *    (nada se perde) e mantém as linhas futuras;
 *  - volta tudo para PREVISAO (a Contabilidade confere o saldo e emite de novo);
 *  - não aproveita a dotação do exercício anterior (é outra LOA): a
 *    Contabilidade escolhe a do novo exercício.
 * O total é preservado.
 */
export function planoRenovacao(atual: LinhaReserva[], novoExercicio: number): LinhaReserva[] {
  const vencido = totalDasLinhas(atual.filter((l) => l.exercicio < novoExercicio));
  const mantidas = atual.filter((l) => l.exercicio >= novoExercicio).map((l) => ({ ...l, situacao: 'PREVISAO' as const, numero_reserva: null }));
  const doNovo = mantidas.find((l) => l.exercicio === novoExercicio);
  if (doNovo) doNovo.valor = arred2(doNovo.valor + vencido);
  else if (vencido > 0) mantidas.push({ exercicio: novoExercicio, valor: vencido, situacao: 'PREVISAO', numero_reserva: null });
  return mantidas.sort((a, b) => a.exercicio - b.exercicio);
}

/** A reserva emitida precisa ser renovada? (emitida para exercício anterior ao corrente) */
export function precisaRenovar(r: { status: string; exercicio_base: number | null }, exercicioCorrente: number): boolean {
  return r.status === 'EMITIDA' && !!r.exercicio_base && r.exercicio_base < exercicioCorrente;
}
