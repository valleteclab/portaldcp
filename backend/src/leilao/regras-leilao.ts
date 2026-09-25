/**
 * ============================================================================
 * LEILÃO — regras PURAS (Lei 14.133/2021 arts. 6º XL, 31, 33 V, 55 III, 76;
 * Decreto 11.461/2023 como referência operacional federal) — plano E7c
 * ============================================================================
 *
 * Art. 31 §2º — o edital conterá: I descrição do bem (imóvel: situação,
 * divisas, matrícula e registros); II valor de avaliação, preço mínimo,
 * condições de pagamento e, se for o caso, a comissão do leiloeiro; III lugar
 * onde estão os móveis, veículos e semoventes; IV sítio e período do leilão;
 * V ônus, gravames ou pendências.
 * Art. 31 §4º — sem registro cadastral prévio, SEM fase de habilitação;
 * homologado depois da fase de lances, superada a fase recursal e efetivado o
 * pagamento pelo vencedor, na forma do edital.
 * Decreto 11.461/2023: art. 8º (proposta inicial fechada → lances →
 * julgamento → recurso → pagamento → homologação), art. 16 (lance só acima
 * do próprio último), art. 21 (vence o maior lance, observado o preço
 * mínimo), art. 26 §3º (inadimplente → lance imediatamente subsequente, na
 * ordem de classificação), art. 27 (adjudicação e homologação depois do
 * recurso e do pagamento), art. 6º §1º (comissão do leiloeiro até 5% — regra
 * federal usada aqui como ALERTA, não bloqueio).
 */

export const COMISSAO_REFERENCIA_MAXIMA = 5; // % — Decreto 11.461/2023 art. 6º §1º (referência)

export interface ConfiguracaoLeilaoEntrada {
  tipo_leiloeiro?: string | null;
  servidor_nome?: string | null;
  servidor_usuario_id?: string | null;
  ato_designacao?: string | null;
  leiloeiro_nome?: string | null;
  leiloeiro_cpf?: string | null;
  leiloeiro_matricula?: string | null;
  comissao_percentual?: number | string | null;
  leiloeiro_forma_selecao?: string | null;
  forma_pagamento?: string | null;
  prazo_pagamento_dias_uteis?: number | string | null;
  parcelas?: number | string | null;
  local_visitacao?: string | null;
  periodo_visitacao?: string | null;
}

export interface BemEntrada {
  numero_item: number;
  tipo_bem?: string | null;
  descricao?: string | null;
  valor_avaliacao?: number | string | null;
  valor_minimo?: number | string | null;
  localizacao?: string | null;
  matricula_imovel?: string | null;
  situacao_divisas?: string | null;
  autorizacao_legislativa?: string | null;
}

const vazio = (v: unknown) => !String(v ?? '').trim();
const num = (v: unknown) => (v == null || v === '' ? NaN : Number(v));

/** Erros da configuração do leilão (vazio = válida). */
export function validarConfiguracaoLeilao(c: ConfiguracaoLeilaoEntrada): string[] {
  const e: string[] = [];
  const tipo = String(c.tipo_leiloeiro ?? '');
  if (tipo !== 'SERVIDOR' && tipo !== 'OFICIAL') {
    e.push('Informe quem conduz o leilão: servidor designado ou leiloeiro oficial (art. 31, caput).');
  } else if (tipo === 'SERVIDOR') {
    if (vazio(c.servidor_nome) && vazio(c.servidor_usuario_id)) e.push('Informe o servidor designado para conduzir o leilão (art. 31, caput).');
  } else {
    if (vazio(c.leiloeiro_nome)) e.push('Informe o nome do leiloeiro oficial.');
    if (vazio(c.leiloeiro_matricula)) e.push('Informe a matrícula do leiloeiro oficial na Junta Comercial.');
    const p = num(c.comissao_percentual);
    if (!Number.isFinite(p) || p < 0 || p >= 100) e.push('Informe a comissão do leiloeiro (percentual sobre o valor arrematado — art. 31, §2º, II).');
    const forma = String(c.leiloeiro_forma_selecao ?? '');
    if (forma !== 'CREDENCIAMENTO' && forma !== 'PREGAO') {
      e.push('Leiloeiro oficial é selecionado por credenciamento ou pregão, com maior desconto na comissão (art. 31, §1º).');
    }
  }
  const forma = String(c.forma_pagamento ?? 'A_VISTA');
  if (forma !== 'A_VISTA' && forma !== 'PARCELADO') e.push('Forma de pagamento inválida (à vista ou parcelado, conforme o edital).');
  if (forma === 'PARCELADO' && !(num(c.parcelas) >= 2)) e.push('No pagamento parcelado, informe o número de parcelas (≥ 2).');
  const prazo = num(c.prazo_pagamento_dias_uteis ?? 1);
  if (!Number.isInteger(prazo) || prazo < 1 || prazo > 30) e.push('Prazo de pagamento: de 1 a 30 dias úteis contados da convocação.');
  return e;
}

/** Alertas (não bloqueiam): comissão acima da referência federal. */
export function alertasConfiguracaoLeilao(c: ConfiguracaoLeilaoEntrada): string[] {
  const a: string[] = [];
  const p = num(c.comissao_percentual);
  if (String(c.tipo_leiloeiro) === 'OFICIAL' && Number.isFinite(p) && p > COMISSAO_REFERENCIA_MAXIMA) {
    a.push(`Comissão de ${p}% acima da referência federal de ${COMISSAO_REFERENCIA_MAXIMA}% (Decreto 11.461/2023, art. 6º, §1º).`);
  }
  return a;
}

/** Erros do cadastro de um bem (vazio = válido). */
export function validarBem(b: BemEntrada): string[] {
  const e: string[] = [];
  const r = `Item ${b.numero_item}`;
  const tipo = String(b.tipo_bem ?? 'MOVEL');
  if (!['MOVEL', 'VEICULO', 'SEMOVENTE', 'IMOVEL'].includes(tipo)) e.push(`${r}: tipo de bem inválido.`);
  if (vazio(b.descricao)) e.push(`${r}: descreva o bem e suas características (art. 31, §2º, I).`);
  const av = num(b.valor_avaliacao);
  const min = num(b.valor_minimo);
  if (!(av > 0)) e.push(`${r}: informe o valor da avaliação (art. 31, §2º, II; art. 76 — avaliação prévia).`);
  if (!(min > 0)) e.push(`${r}: informe o preço mínimo de arrematação (art. 31, §2º, II).`);
  if (Number.isFinite(min) && Math.abs(Math.round(min * 100) - min * 100) > 1e-6) e.push(`${r}: preço mínimo com no máximo 2 casas decimais.`);
  if (tipo === 'IMOVEL') {
    if (vazio(b.matricula_imovel)) e.push(`${r}: imóvel exige a matrícula e os registros (art. 31, §2º, I).`);
    if (vazio(b.situacao_divisas)) e.push(`${r}: imóvel exige a situação e as divisas (art. 31, §2º, I).`);
    if (vazio(b.autorizacao_legislativa)) e.push(`${r}: alienação de imóvel exige autorização legislativa (art. 76, I) — informe a lei.`);
  } else if (vazio(b.localizacao)) {
    e.push(`${r}: indique o lugar onde está o bem (art. 31, §2º, III).`);
  }
  return e;
}

/** Pendências do PUBLICAR no leilão (edital — art. 31 §2º). */
export function pendenciasEditalLeilao(p: {
  criterio: string | null | undefined;
  tipoContratacao: string | null | undefined;
  config: ConfiguracaoLeilaoEntrada | null;
  itens: Array<{ id: string; numero_item: number; valor_total_estimado: number }>;
  bens: Array<BemEntrada & { item_licitacao_id: string }>;
}): string[] {
  const pend: string[] = [];
  if (String(p.criterio ?? '') !== 'MAIOR_LANCE') pend.push('Leilão exige o critério de maior lance (art. 33, V).');
  if (String(p.tipoContratacao ?? '') !== 'ALIENACAO') pend.push('Leilão é para alienação de bens (art. 6º, XL): classifique a contratação como ALIENAÇÃO.');
  if (!p.config) pend.push('Configure o leilão: quem conduz, pagamento e visitação (art. 31).');
  else pend.push(...validarConfiguracaoLeilao(p.config));
  if (!p.itens.length) pend.push('Cadastre os bens a leiloar (itens do edital).');
  for (const it of p.itens) {
    const bem = p.bens.find((b) => b.item_licitacao_id === it.id);
    if (!bem) {
      pend.push(`Item ${it.numero_item}: cadastre o bem (descrição, avaliação, preço mínimo, localização — art. 31, §2º).`);
      continue;
    }
    pend.push(...validarBem({ ...bem, numero_item: it.numero_item }));
  }
  return pend;
}

/** Comissão do leiloeiro (centavos, meio para cima). */
export function valorComissao(valor: number, percentual: number | null | undefined): number | null {
  const p = Number(percentual);
  if (!Number.isFinite(p) || p <= 0) return null;
  return Math.round(Number(valor) * p) / 100;
}

export interface CandidatoArrematacao {
  fornecedorId: string;
  melhorValor: number;
  excluido?: boolean;
  situacao?: string;
}

/**
 * Arrematante da unidade: o 1º do ranking (maior lance — ordem decrescente)
 * ainda não excluído e com valor ≥ preço mínimo (Decreto 11.461 art. 21).
 * `ignorar` = licitantes já inadimplentes/desclassificados na unidade.
 */
export function escolherArrematante(
  ranking: CandidatoArrematacao[],
  precoMinimo: number,
  ignorar: ReadonlyArray<string> = [],
): CandidatoArrematacao | null {
  for (const r of ranking) {
    if (r.excluido || ignorar.includes(r.fornecedorId)) continue;
    if (Number(r.melhorValor) + 0.00001 < Number(precoMinimo)) return null; // ranking decrescente: os demais também ficam abaixo
    return r;
  }
  return null;
}

/** Lance inicial (proposta) do leilão: ≥ preço mínimo do bem (art. 31 §2º II; Dec. 11.461 art. 21). */
export function motivoLanceInicialAbaixoDoMinimo(numeroItem: number, valorTotal: number, precoMinimo: number): string | null {
  if (Number(valorTotal) + 0.00001 < Number(precoMinimo)) {
    return `Item ${numeroItem}: o lance inicial (R$ ${Number(valorTotal).toFixed(2)}) não pode ser menor que o preço mínimo de arrematação (R$ ${Number(precoMinimo).toFixed(2)}) — art. 31, §2º, II.`;
  }
  return null;
}

export const STATUS_ARREMATACAO_ATIVA = ['DECLARADA', 'AGUARDANDO_PAGAMENTO', 'PAGAMENTO_INFORMADO', 'PAGA'];

/** Pendências de pagamento por unidade (art. 31 §4º): toda unidade com resultado possível precisa de arrematação PAGA. */
export function pendenciasPagamento(
  unidades: Array<{ id: string; rotulo: string; comResultado: boolean }>,
  arrematacoes: Array<{ unidade_id: string; status: string }>,
): string[] {
  const pend: string[] = [];
  for (const u of unidades) {
    if (!u.comResultado) continue;
    const ativa = arrematacoes.find((a) => a.unidade_id === u.id && STATUS_ARREMATACAO_ATIVA.includes(a.status));
    if (!ativa) pend.push(`${u.rotulo}: declare o arrematante (ou a unidade deserta/fracassada).`);
    else if (ativa.status !== 'PAGA') pend.push(`${u.rotulo}: pagamento do arrematante não confirmado (art. 31, §4º).`);
  }
  return pend;
}

/** Transição de status válida para o fluxo do pagamento. */
export function motivoTransicaoPagamentoInvalida(de: string, para: string): string | null {
  const ok: Record<string, string[]> = {
    DECLARADA: ['AGUARDANDO_PAGAMENTO', 'CANCELADA'],
    AGUARDANDO_PAGAMENTO: ['PAGAMENTO_INFORMADO', 'PAGA', 'INADIMPLENTE', 'CANCELADA'],
    PAGAMENTO_INFORMADO: ['PAGA', 'INADIMPLENTE', 'AGUARDANDO_PAGAMENTO'],
  };
  return (ok[de] ?? []).includes(para) ? null : `Arrematação ${de.toLowerCase().replace(/_/g, ' ')}: não é possível passar a ${para.toLowerCase().replace(/_/g, ' ')}.`;
}
