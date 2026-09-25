/**
 * ============================================================================
 * REGRAS PURAS DA ATA DE REGISTRO DE PREÇOS (plano E6 — parte ARP)
 * Lei 14.133/2021 arts. 82–86; Decreto 11.462/2023 (referência).
 * ============================================================================
 * Sem banco, sem Nest: o serviço carrega os números e decide com estas funções
 * (testadas em regras-arp.spec.ts).
 */

/** Vigência padrão/máxima da ata: 1 ano (art. 84, caput). */
export const VIGENCIA_ATA_PADRAO_MESES = 12;
export const VIGENCIA_ATA_MAXIMA_MESES = 12;
/** Prorrogação: uma vez, por até igual período (art. 84). */
export const PRORROGACAO_MAXIMA_MESES = 12;

/** Adesão (art. 86 §4º): por órgão não participante, até 50% de cada item registrado. */
export const LIMITE_ADESAO_POR_ORGAO = 0.5;
/** Adesão (art. 86 §5º): o total das adesões não excede o dobro de cada item registrado. */
export const LIMITE_ADESAO_TOTAL = 2;
/** Prazo para o aderente contratar depois da autorização (Dec. 11.462/2023: 90 dias, dentro da vigência). */
export const PRAZO_CONTRATACAO_ADESAO_DIAS = 90;
/** Prazo para os demais licitantes aderirem ao cadastro de reserva (definição da plataforma; o edital pode fixar outro). */
export const PRAZO_CADASTRO_RESERVA_DIAS = 5;

/** Precisão das quantidades (decimal(15,4)). */
export const arred4 = (v: number) => Math.round((Number(v) || 0) * 10_000) / 10_000;
export const arred2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

// ============================================================================
// DATAS (UTC-3 — convenção do projeto: datas de Brasília)
// ============================================================================

/** Data de hoje em Brasília (YYYY-MM-DD). */
export function hojeBrasilia(agora: Date = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * Coluna `date` → 'YYYY-MM-DD'. O driver pg devolve `date` de consulta crua
 * como Date à MEIA-NOITE LOCAL (sem parser configurado) e a entidade devolve
 * string — os dois casos dão o mesmo dia.
 */
export function dataIso(d: string | Date | null | undefined): string | null {
  if (d == null || d === '') return null;
  if (d instanceof Date) {
    if (Number.isNaN(d.getTime())) return null;
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  return String(d).slice(0, 10);
}

const paraData = (d: string | Date): Date => {
  const s = dataIso(d) as string;
  const [a, m, dia] = s.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, dia));
};
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function somarDias(data: string | Date, dias: number): string {
  const d = paraData(data);
  d.setUTCDate(d.getUTCDate() + dias);
  return iso(d);
}

/**
 * Soma meses mantendo o dia (31/01 + 1 mês → 28/02 ou 29/02: último dia do mês).
 */
export function somarMeses(data: string | Date, meses: number): string {
  const d = paraData(data);
  const dia = d.getUTCDate();
  const alvo = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(dia, ultimo));
  return iso(alvo);
}

/** Meses de vigência da ata a partir do cadastro da licitação (padrão 12, máximo 12 — art. 84). */
export function mesesVigenciaAta(ataVigenciaMeses?: number | null): number {
  const n = Math.floor(Number(ataVigenciaMeses) || 0);
  if (n <= 0) return VIGENCIA_ATA_PADRAO_MESES;
  return Math.min(n, VIGENCIA_ATA_MAXIMA_MESES);
}

/** Fim da vigência: início + meses − 1 dia (ex.: 10/03/2026 + 12 meses → 09/03/2027). */
export function fimVigencia(inicio: string | Date, meses: number): string {
  return somarDias(somarMeses(inicio, meses), -1);
}

/** Vencida quando hoje (Brasília) é posterior ao último dia de vigência. */
export function ataVencida(dataVigenciaFim: string | Date | null | undefined, hoje: string = hojeBrasilia()): boolean {
  if (!dataVigenciaFim) return false;
  return iso(paraData(dataVigenciaFim)) < hoje;
}

/**
 * PRORROGAÇÃO (art. 84): uma única vez, por até 12 meses (igual período),
 * com motivo (comprovação do preço vantajoso), só com a ata vigente e ANTES
 * do fim da vigência. Devolve o motivo da recusa, ou null.
 */
export function motivoProrrogacaoInvalida(p: {
  status: string;
  prorrogada: boolean;
  dataVigenciaFim: string | Date;
  meses: number;
  motivo?: string | null;
  hoje?: string;
}): string | null {
  if (!['VIGENTE', 'ESGOTADA'].includes(p.status)) return `Só a ata vigente pode ser prorrogada (situação atual: ${p.status}).`;
  if (p.prorrogada) return 'A ata já foi prorrogada — a prorrogação é admitida uma única vez (art. 84 da Lei 14.133/2021).';
  if (ataVencida(p.dataVigenciaFim, p.hoje)) return 'A vigência da ata já terminou — a prorrogação deve ser feita antes do fim da vigência.';
  const m = Number(p.meses);
  if (!Number.isInteger(m) || m < 1 || m > PRORROGACAO_MAXIMA_MESES) {
    return `Prorrogação de 1 a ${PRORROGACAO_MAXIMA_MESES} meses (por até igual período — art. 84).`;
  }
  if (!p.motivo || String(p.motivo).trim().length < 10) {
    return 'Informe o motivo da prorrogação, com a comprovação de que o preço continua vantajoso (art. 84).';
  }
  return null;
}

// ============================================================================
// SALDO
// ============================================================================

/** Saldo do gerenciador/participantes no item = registrado − consumido (sem adesões). */
export function saldoItem(quantidadeRegistrada: number, consumidoGerenciador: number): number {
  return arred4(Math.max(0, Number(quantidadeRegistrada) - Number(consumidoGerenciador)));
}

/**
 * Consumo pedido cabe no saldo? Devolve a mensagem de recusa ou null.
 * (Quantidade > 0; nunca além do saldo — o serviço aplica sob lock da linha.)
 */
export function motivoConsumoInvalido(p: { quantidade: number; saldo: number; rotulo: string }): string | null {
  const q = Number(p.quantidade);
  if (!Number.isFinite(q) || q <= 0) return `${p.rotulo}: quantidade deve ser maior que zero.`;
  if (arred4(q) > arred4(p.saldo)) {
    return `${p.rotulo}: quantidade ${fmtQ(q)} maior que o saldo disponível (${fmtQ(p.saldo)}).`;
  }
  return null;
}

const fmtQ = (v: number) => arred4(v).toLocaleString('pt-BR', { maximumFractionDigits: 4 });

/** Valores agregados da ata a partir dos itens (nunca zera o consumo — fim do B10). */
export function totaisDaAta(
  itens: Array<{ quantidade_registrada: number; quantidade_utilizada: number; valor_unitario: number; ativo?: boolean }>,
): { valorTotal: number; valorUtilizado: number; valorSaldo: number } {
  let valorTotal = 0;
  let valorUtilizado = 0;
  for (const i of itens) {
    if (i.ativo === false) continue;
    valorTotal += Number(i.quantidade_registrada) * Number(i.valor_unitario);
    valorUtilizado += Math.min(Number(i.quantidade_utilizada), Number(i.quantidade_registrada)) * Number(i.valor_unitario);
  }
  return { valorTotal: arred2(valorTotal), valorUtilizado: arred2(valorUtilizado), valorSaldo: arred2(valorTotal - valorUtilizado) };
}

// ============================================================================
// ADESÃO (art. 86)
// ============================================================================

/**
 * LIMITES DA ADESÃO por item (art. 86 §§4º e 5º):
 *  - por órgão aderente: a soma das suas adesões (não recusadas/canceladas,
 *    esta incluída) ≤ 50% da quantidade registrada;
 *  - no total: a soma de TODAS as adesões (não recusadas/canceladas, esta
 *    incluída) ≤ 2× a quantidade registrada.
 * Quantidades "reservadas" pelas adesões em andamento contam — o gerenciador
 * nunca autoriza além do limite. Devolve a mensagem da recusa ou null.
 */
export function motivoLimiteAdesao(p: {
  rotulo: string;
  quantidadeRegistrada: number;
  solicitada: number;
  jaDoOrgao: number;
  jaTotal: number;
}): string | null {
  const q = Number(p.solicitada);
  if (!Number.isFinite(q) || q <= 0) return `${p.rotulo}: quantidade da adesão deve ser maior que zero.`;
  const reg = Number(p.quantidadeRegistrada);
  const limOrgao = arred4(reg * LIMITE_ADESAO_POR_ORGAO);
  const limTotal = arred4(reg * LIMITE_ADESAO_TOTAL);
  if (arred4(Number(p.jaDoOrgao) + q) > limOrgao) {
    return (
      `${p.rotulo}: a adesão (${fmtQ(q)}${Number(p.jaDoOrgao) ? ` + ${fmtQ(p.jaDoOrgao)} já pedidas por este órgão` : ''}) excede 50% ` +
      `da quantidade registrada (${fmtQ(limOrgao)} de ${fmtQ(reg)}) — art. 86 §4º da Lei 14.133/2021.`
    );
  }
  if (arred4(Number(p.jaTotal) + q) > limTotal) {
    return (
      `${p.rotulo}: o total das adesões (${fmtQ(Number(p.jaTotal) + q)}) excederia o dobro da quantidade registrada ` +
      `(${fmtQ(limTotal)}) — art. 86 §5º da Lei 14.133/2021.`
    );
  }
  return null;
}

/** Prazo para o aderente contratar: autorização + 90 dias, sem passar do fim da vigência da ata. */
export function prazoContratacaoAdesao(autorizadaEm: string | Date, fimVigenciaAta: string | Date): string {
  const p = somarDias(autorizadaEm, PRAZO_CONTRATACAO_ADESAO_DIAS);
  const fim = iso(paraData(fimVigenciaAta));
  return p < fim ? p : fim;
}

// ============================================================================
// CADASTRO DE RESERVA (art. 82 VII; Dec. 11.462 art. 18)
// ============================================================================

export interface CandidatoReserva {
  fornecedorId: string;
  posicao: number | null;
  valor: number | null;
  situacao: string;
}

/** Situações que NUNCA entram no cadastro de reserva (fora do ranking) — e o próprio vencedor. */
const FORA_DA_RESERVA = ['DESCLASSIFICADO', 'RECUSADO', 'INABILITADO', 'VENCEDOR'];

/**
 * Candidatos ao cadastro de reserva de uma unidade, na ORDEM DO RANKING
 * (posição final do encerramento; sem posição → pelo valor, na direção do
 * critério; persistindo, pelo id para ser determinístico). O vencedor e os
 * excluídos ficam de fora.
 */
export function ordenarCandidatosReserva(
  candidatos: CandidatoReserva[],
  direcao: 'ASC' | 'DESC' = 'ASC',
): Array<CandidatoReserva & { ordem: number }> {
  const sinal = direcao === 'DESC' ? -1 : 1;
  return candidatos
    .filter((c) => !FORA_DA_RESERVA.includes(String(c.situacao)))
    .sort((a, b) => {
      const pa = a.posicao ?? Number.MAX_SAFE_INTEGER;
      const pb = b.posicao ?? Number.MAX_SAFE_INTEGER;
      if (pa !== pb) return pa - pb;
      const va = a.valor ?? Number.MAX_SAFE_INTEGER * sinal;
      const vb = b.valor ?? Number.MAX_SAFE_INTEGER * sinal;
      if (va !== vb) return (va - vb) * sinal;
      return String(a.fornecedorId).localeCompare(String(b.fornecedorId));
    })
    .map((c, i) => ({ ...c, ordem: i + 2 }));
}

/**
 * Próximo do cadastro de reserva a convocar no item: o de menor posição que
 * ADERIU ao preço do vencedor (Dec. 11.462 art. 18 §… / art. 28).
 */
export function proximoDaReserva<T extends { posicao: number; status: string }>(reservas: T[]): T | null {
  return [...reservas].filter((r) => r.status === 'ADERIU').sort((a, b) => a.posicao - b.posicao)[0] ?? null;
}

// ============================================================================
// CANCELAMENTO DO REGISTRO DO FORNECEDOR (Dec. 11.462/2023 arts. 28–29)
// ============================================================================

export const HIPOTESES_CANCELAMENTO: Record<string, string> = {
  DESCUMPRIMENTO: 'Descumprimento das condições da ata sem motivo justificado',
  NAO_RETIRADA_INSTRUMENTO: 'Não assinatura/retirada do instrumento contratual no prazo, sem justificativa aceitável',
  PRECO_SUPERIOR_MERCADO: 'Preço registrado superior ao de mercado, sem aceitar a redução (renegociação frustrada)',
  SANCAO_IMPEDITIVA: 'Sanção de impedimento de licitar e contratar ou declaração de inidoneidade (art. 156 III/IV)',
  CASO_FORTUITO_FORCA_MAIOR: 'Caso fortuito ou força maior que prejudique o cumprimento da ata (a pedido do fornecedor)',
  INTERESSE_PUBLICO: 'Razões de interesse público, devidamente motivadas',
};

export function motivoCancelamentoInvalido(p: { status: string; hipotese?: string | null; motivo?: string | null }): string | null {
  if (!['VIGENTE', 'ESGOTADA', 'AGUARDANDO_ASSINATURA'].includes(p.status)) {
    return `A ata não pode ter o registro cancelado na situação ${p.status}.`;
  }
  if (!p.hipotese || !HIPOTESES_CANCELAMENTO[p.hipotese]) {
    return `Informe a hipótese do cancelamento: ${Object.keys(HIPOTESES_CANCELAMENTO).join(', ')}.`;
  }
  if (!p.motivo || String(p.motivo).trim().length < 10) return 'Informe o motivo do cancelamento (fato e fundamento).';
  return null;
}
