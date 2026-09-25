/**
 * ============================================================================
 * ME/EPP — REGRAS PURAS (plano E3 item 3; LC 123/2006 arts. 44–48; Lei
 * 14.133/2021 art. 4º)
 * ============================================================================
 *
 * Nada aqui toca o banco. Testado em `regras-me-epp.spec.ts`; o
 * `MeEppService` (e as funções SQL de `beneficio-mpe.sql.ts`) só juntam os
 * dados e chamam estas funções.
 *
 *  - ENQUADRAMENTO: ME/EPP = porte do CADASTRO (ME, EPP ou MEI — o MEI é
 *    microempresa para a LC 123, art. 18-A) E declaração de enquadramento na
 *    proposta (Lei 14.133 art. 63 IV / LC 123 art. 3º). O porte é retratado na
 *    proposta quando ela é criada (nunca vem do cliente).
 *  - BENEFÍCIO DA UNIDADE (item ou lote): EXCLUSIVO (art. 48 I), COTA
 *    RESERVADA (art. 48 III — a unidade principal continua AMPLA; a cota é uma
 *    unidade própria, EXCLUSIVA) ou NENHUM. O empate ficto (arts. 44/45) vale
 *    em toda unidade que NÃO é exclusiva.
 *  - EMPATE FICTO: melhor oferta de não-ME/EPP; ME/EPP com oferta até 5%
 *    (pregão — art. 44 §2º) ou 10% (demais — art. 44 §1º) acima dela; a
 *    melhor ME/EPP do intervalo é convocada a oferecer valor ESTRITAMENTE
 *    inferior (art. 45 I) em 5 minutos (art. 45 §3º, parâmetro); não
 *    exercendo, as seguintes do intervalo, na ordem (art. 45 II); valores
 *    iguais entre ME/EPP → sorteio (art. 45 III) — o sorteio auditável
 *    COMPARTILHADO com o desempate do art. 60 (`julgamento/sorteio.ts`),
 *    com a entrada fixada no encerramento da unidade (ninguém escolhe depois).
 */

import { ResultadoSorteio, sorteioAuditavel } from '../sorteio';

// ============================================================================
// ENQUADRAMENTO
// ============================================================================

/** Portes com o tratamento da LC 123 (o MEI é microempresa — art. 18-A §1º). */
export const PORTES_MPE: ReadonlyArray<string> = ['ME', 'EPP', 'MEI'];

export const ehPorteMpe = (porte: string | null | undefined): boolean => !!porte && PORTES_MPE.includes(String(porte).toUpperCase());

/**
 * Enquadramento para os benefícios: porte do cadastro ME/EPP/MEI E declaração
 * na proposta. Sem a declaração, a ME/EPP participa como as demais (o
 * benefício depende da declaração — Lei 14.133 art. 4º §§1º-2º).
 */
export function enquadramentoMpe(porteCadastro: string | null | undefined, declarou: boolean | null | undefined): boolean {
  return ehPorteMpe(porteCadastro) && !!declarou;
}

/**
 * Declaração de ME/EPP incompatível com o cadastro: quem declara precisa ter
 * porte ME/EPP/MEI registrado (a declaração falsa é infração — art. 155 VIII).
 */
export function motivoDeclaracaoIncompativel(porteCadastro: string | null | undefined, declarou: boolean | null | undefined): string | null {
  if (!declarou || ehPorteMpe(porteCadastro)) return null;
  return porteCadastro
    ? `Declaração de ME/EPP incompatível com o cadastro: o porte registrado é ${porteCadastro}. Atualize o cadastro (porte) ou desmarque a declaração.`
    : 'Declaração de ME/EPP sem porte no cadastro: informe o porte (ME, EPP ou MEI) no seu cadastro antes de declarar o enquadramento.';
}

// ============================================================================
// BENEFÍCIO DA UNIDADE (art. 48)
// ============================================================================

export type TipoBeneficioMpe = 'NENHUM' | 'EXCLUSIVO' | 'COTA_RESERVADA';
export type ModoBeneficioMpe = 'GERAL' | 'POR_LOTE' | 'POR_ITEM';

export interface DadosBeneficio {
  /** Licitação */
  tratamentoDiferenciado?: boolean | null;
  modo?: string | null;
  tipoLicitacao?: string | null;
  /** Legado (somente leitura): só vale quando `tipoLicitacao` é NENHUM/vazio. */
  exclusivoLegado?: boolean | null;
  cotaLegado?: boolean | null;
  /** Lote da unidade (POR_LOTE) */
  tipoLote?: string | null;
  /** Item (POR_ITEM): AMPLA | EXCLUSIVO_MPE | COTA_RESERVADA. No lote: os itens do lote. */
  tiposParticipacaoItens?: Array<string | null | undefined>;
  /** A unidade é a COTA reservada gerada de outra (item/lote clonado). */
  ehCota?: boolean;
}

export interface BeneficioUnidade {
  tipo: TipoBeneficioMpe;
  /** Unidade-cota (art. 48 III) — disputada só por ME/EPP. */
  ehCota: boolean;
  /** Só ME/EPP participa (exclusiva ou cota). */
  somenteMpe: boolean;
  /** O empate ficto (arts. 44/45) se aplica (toda unidade não exclusiva). */
  empateFicto: boolean;
}

const normTipo = (t: string | null | undefined): TipoBeneficioMpe =>
  t === 'EXCLUSIVO' || t === 'COTA_RESERVADA' ? t : 'NENHUM';

const tipoDoItem = (t: string | null | undefined): TipoBeneficioMpe =>
  t === 'EXCLUSIVO_MPE' ? 'EXCLUSIVO' : t === 'COTA_RESERVADA' ? 'COTA_RESERVADA' : 'NENHUM';

/**
 * Benefício da unidade (item ou lote) conforme o modo da licitação:
 *  - GERAL (padrão): o tipo da licitação (legado `exclusivo_mpe`/`cota_reservada`
 *    só como leitura quando o tipo novo está vazio);
 *  - POR_LOTE: o tipo do lote;
 *  - POR_ITEM: o `tipo_participacao` do item (no lote: exclusivo só se TODOS
 *    os itens forem exclusivos);
 *  - a unidade-COTA é sempre exclusiva;
 *  - `tratamento_diferenciado_mpe = false` desliga o art. 48 (exclusivo/cota),
 *    nunca o empate ficto (arts. 44/45 são obrigatórios).
 */
export function beneficioDaUnidade(d: DadosBeneficio): BeneficioUnidade {
  const montar = (tipo: TipoBeneficioMpe, ehCota = false): BeneficioUnidade => {
    const somenteMpe = ehCota || tipo === 'EXCLUSIVO';
    return { tipo: ehCota ? 'EXCLUSIVO' : tipo, ehCota, somenteMpe, empateFicto: !somenteMpe };
  };
  if (d.ehCota) return montar('EXCLUSIVO', true);
  if (d.tratamentoDiferenciado === false) return montar('NENHUM');
  const modo = (d.modo || 'GERAL') as ModoBeneficioMpe;
  if (modo === 'POR_LOTE') return montar(normTipo(d.tipoLote));
  if (modo === 'POR_ITEM') {
    const tipos = (d.tiposParticipacaoItens ?? []).map(tipoDoItem);
    if (!tipos.length) return montar('NENHUM');
    if (tipos.every((t) => t === 'EXCLUSIVO')) return montar('EXCLUSIVO');
    if (tipos.length === 1) return montar(tipos[0]);
    return montar(tipos.some((t) => t === 'COTA_RESERVADA') ? 'COTA_RESERVADA' : 'NENHUM');
  }
  let tipo = normTipo(d.tipoLicitacao);
  if (tipo === 'NENHUM') {
    if (d.exclusivoLegado) tipo = 'EXCLUSIVO';
    else if (d.cotaLegado) tipo = 'COTA_RESERVADA';
  }
  return montar(tipo);
}

/** Participação na unidade: exclusiva/cota recusa quem não é ME/EPP enquadrada. */
export function motivoForaDaExclusividade(
  beneficio: Pick<BeneficioUnidade, 'somenteMpe' | 'ehCota'>,
  enquadrada: boolean,
  rotuloUnidade: string,
): string | null {
  if (!beneficio.somenteMpe || enquadrada) return null;
  return beneficio.ehCota
    ? `${rotuloUnidade} é a COTA RESERVADA a ME/EPP (LC 123/2006, art. 48, III): só microempresas e empresas de pequeno porte ` +
        'enquadradas (porte no cadastro + declaração na proposta) participam.'
    : `${rotuloUnidade} é EXCLUSIVO para ME/EPP (LC 123/2006, art. 48, I): só microempresas e empresas de pequeno porte ` +
        'enquadradas (porte no cadastro + declaração na proposta) participam.';
}

// ============================================================================
// LIMITES DO ART. 48 (exclusivo até R$ 80.000; cota até 25%)
// ============================================================================

/** LC 123/2006 art. 48 I — valor do item para a participação exclusiva (não é atualizado pelo Decreto 12.343). */
export const LIMITE_EXCLUSIVO_MPE = 80000;
/** Chave do limite legal (`limites_legais`) — editável sem deploy. */
export const CHAVE_LIMITE_EXCLUSIVO_MPE = 'MPE_EXCLUSIVO_ITEM';
/** LC 123/2006 art. 48 III — teto legal da cota reservada. */
export const PERCENTUAL_COTA_LEGAL = 25;

/** Percentual da cota: > 0 e ≤ parâmetro do órgão (nunca acima dos 25% legais). */
export function motivoPercentualCotaInvalido(percentual: number | string | null | undefined, maximoParametro?: number | null): string | null {
  const maximo = Math.min(PERCENTUAL_COTA_LEGAL, Number(maximoParametro) > 0 ? Number(maximoParametro) : PERCENTUAL_COTA_LEGAL);
  const p = Number(percentual);
  if (percentual == null || percentual === '' || !Number.isFinite(p) || p <= 0) {
    return 'Cota reservada ME/EPP: informe o percentual da cota (maior que zero).';
  }
  if (p > maximo + 1e-9) {
    return `Cota reservada ME/EPP de ${p}% acima do máximo de ${maximo}% (LC 123/2006, art. 48, III${maximo < PERCENTUAL_COTA_LEGAL ? ' e parâmetro do órgão' : ''}).`;
  }
  return null;
}

/**
 * Quantidade da cota: percentual da quantidade do item. Quantidade inteira →
 * cota inteira (arredondada para baixo — bens divisíveis por unidade); senão,
 * 4 casas. Devolve também o que resta na unidade principal.
 */
export function quantidadeDaCota(quantidade: number | string, percentual: number | string): { cota: number; principal: number } {
  const q = Number(quantidade);
  const p = Number(percentual);
  if (!(q > 0) || !(p > 0)) return { cota: 0, principal: q > 0 ? q : 0 };
  const bruta = (q * p) / 100;
  const inteira = Math.abs(q - Math.round(q)) < 1e-9;
  const cota = inteira ? Math.floor(bruta + 1e-9) : Math.floor(bruta * 10000 + 1e-6) / 10000;
  const principal = inteira ? Math.round(q - cota) : Math.round((q - cota) * 10000) / 10000;
  return { cota, principal };
}

/** Item exclusivo acima do limite do art. 48 I (conferência do edital). */
export function motivoExclusivoAcimaDoLimite(valorEstimado: number, limite: number = LIMITE_EXCLUSIVO_MPE, rotulo = 'Item'): string | null {
  if (!(Number(valorEstimado) > Number(limite))) return null;
  return `${rotulo}: participação exclusiva de ME/EPP só para itens de até R$ ${Number(limite).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ` +
    `(LC 123/2006, art. 48, I); o valor estimado é R$ ${Number(valorEstimado).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`;
}

// ============================================================================
// EMPATE FICTO (arts. 44 e 45)
// ============================================================================

/** Prazo padrão para a ME/EPP convocada (LC 123 art. 45 §3º, pregão). */
export const PRAZO_DESEMPATE_MPE_MINUTOS = 5;

/** Modalidades em que o empate ficto do art. 44 é apurado pelo motor. */
const MODALIDADES_COM_EMPATE_FICTO = ['PREGAO_ELETRONICO', 'PREGAO_PRESENCIAL', 'CONCORRENCIA'];

export const ehPregao = (modalidade: string | null | undefined) => String(modalidade || '').startsWith('PREGAO');

/** Intervalo do art. 44: 5% no pregão (§2º), 10% nas demais (§1º) — parâmetros do órgão. */
export function percentualEmpateFicto(
  modalidade: string | null | undefined,
  params: { percentual_empate_ficto_pregao?: number | string | null; percentual_empate_ficto_demais?: number | string | null } | null | undefined,
): number {
  const pregao = Number(params?.percentual_empate_ficto_pregao);
  const demais = Number(params?.percentual_empate_ficto_demais);
  return ehPregao(modalidade) ? (pregao > 0 ? pregao : 5) : demais > 0 ? demais : 10;
}

const centavos = (v: number) => Math.round(Number(v) * 100);

/**
 * Oferta `valor` está no intervalo do empate ficto em relação à `melhor`
 * (menor preço): valor ≤ melhor × (1 + p%), em centavos inteiros (sem erro de
 * ponto flutuante). Igual à melhor também é empate.
 */
export function noIntervaloDoEmpateFicto(valor: number, melhor: number, percentual: number): boolean {
  const v = centavos(valor);
  const b = centavos(melhor);
  const p = Math.round(Number(percentual) * 100); // p% em centésimos de ponto
  return v * 10000 <= b * (10000 + p);
}

/** Valor-limite do intervalo (informativo, ao centavo). */
export const limiteDoIntervalo = (melhor: number, percentual: number) => Math.floor(centavos(melhor) * (1 + Number(percentual) / 100)) / 100;

export interface OfertaDesempate {
  fornecedorId: string;
  /** Melhor oferta ativa na unidade (na base do lance). */
  valor: number;
  /** Posição no ranking único (1..n entre os não excluídos). */
  posicao: number;
  excluido?: boolean;
}

export interface CandidatoDesempate {
  fornecedorId: string;
  valor: number;
  posicao: number;
  /** Ordem de convocação (1..n). */
  ordem: number;
  /** Ordem definida por sorteio (valores iguais — art. 45 III). */
  sorteado?: boolean;
}

export interface SorteioRegistro {
  /** Um sorteio por grupo de ME/EPP com o MESMO valor no intervalo (art. 45 III). */
  grupos: Array<{ valor: number } & ResultadoSorteio>;
}

export type ResultadoAnalise =
  | { aplica: false; motivo: string; melhor?: { fornecedorId: string; valor: number } | null }
  | {
      aplica: true;
      melhor: { fornecedorId: string; valor: number };
      percentual: number;
      limite: number;
      candidatos: CandidatoDesempate[];
      sorteio: SorteioRegistro | null;
    };

/**
 * Análise do empate ficto de UMA unidade (ranking único já ordenado, na
 * direção do critério):
 *  - não se aplica: critério de maior valor (leilão), modalidade sem o
 *    art. 44 no motor, unidade exclusiva/cota (todos são ME/EPP), sem
 *    oferta, melhor oferta já de ME/EPP (art. 45 §2º), nenhuma ME/EPP no
 *    intervalo;
 *  - aplica-se: candidatos = ME/EPP (não excluídas) no intervalo, na ordem de
 *    classificação; valores iguais entre ME/EPP → sorteio auditável.
 */
export function analisarEmpateFicto(p: {
  ranking: OfertaDesempate[];
  mpe: ReadonlySet<string>;
  percentual: number;
  direcao: 'MENOR' | 'MAIOR';
  modalidade: string | null | undefined;
  beneficio: Pick<BeneficioUnidade, 'empateFicto' | 'somenteMpe'>;
  /** Entrada pública do sorteio: licitação, unidade e instante do encerramento da unidade. */
  sorteio: { licitacaoId: string; unidadeId: string; atoEm: Date | string };
}): ResultadoAnalise {
  if (p.direcao !== 'MENOR') return { aplica: false, motivo: 'Critério de maior valor: o empate ficto da LC 123 não se aplica.' };
  if (!MODALIDADES_COM_EMPATE_FICTO.includes(String(p.modalidade || ''))) {
    return { aplica: false, motivo: `Modalidade ${p.modalidade || '—'}: empate ficto não apurado nesta etapa.` };
  }
  if (!p.beneficio.empateFicto || p.beneficio.somenteMpe) {
    return { aplica: false, motivo: 'Unidade exclusiva de ME/EPP (art. 48): todas as participantes são ME/EPP — não há empate ficto.' };
  }
  const validos = p.ranking.filter((e) => !e.excluido).sort((a, b) => a.posicao - b.posicao);
  const melhor = validos[0];
  if (!melhor) return { aplica: false, motivo: 'Sem oferta válida na unidade.', melhor: null };
  const m = { fornecedorId: melhor.fornecedorId, valor: melhor.valor };
  if (p.mpe.has(melhor.fornecedorId)) {
    return { aplica: false, motivo: 'A melhor oferta já é de ME/EPP (LC 123/2006, art. 45, §2º).', melhor: m };
  }
  const noIntervalo = validos.filter(
    (e) => e.fornecedorId !== melhor.fornecedorId && p.mpe.has(e.fornecedorId) && noIntervaloDoEmpateFicto(e.valor, melhor.valor, p.percentual),
  );
  if (!noIntervalo.length) {
    return {
      aplica: false,
      motivo: `Nenhuma ME/EPP com oferta até ${p.percentual}% acima da melhor (LC 123/2006, art. 44) — sem empate ficto.`,
      melhor: m,
    };
  }
  // Ordem de classificação; valores iguais → sorteio (art. 45 III)
  const porValor = new Map<number, OfertaDesempate[]>();
  for (const e of noIntervalo) {
    const k = centavos(e.valor);
    porValor.set(k, [...(porValor.get(k) ?? []), e]);
  }
  const chaves = [...porValor.keys()].sort((a, b) => a - b);
  const candidatos: CandidatoDesempate[] = [];
  const grupos: SorteioRegistro['grupos'] = [];
  for (const k of chaves) {
    const grupo = porValor.get(k)!;
    if (grupo.length === 1) {
      candidatos.push({ fornecedorId: grupo[0].fornecedorId, valor: grupo[0].valor, posicao: grupo[0].posicao, ordem: candidatos.length + 1 });
      continue;
    }
    const s = sorteioAuditavel({
      ...p.sorteio,
      candidatos: grupo.map((g) => g.fornecedorId),
      contexto: `LC123-ART45-III|valor=${k}`,
    });
    grupos.push({ valor: k / 100, ...s });
    for (const id of s.ordem) {
      const g = grupo.find((x) => x.fornecedorId === id)!;
      candidatos.push({ fornecedorId: id, valor: g.valor, posicao: g.posicao, ordem: candidatos.length + 1, sorteado: true });
    }
  }
  return {
    aplica: true,
    melhor: m,
    percentual: p.percentual,
    limite: limiteDoIntervalo(melhor.valor, p.percentual),
    candidatos,
    sorteio: grupos.length ? { grupos } : null,
  };
}

// ============================================================================
// CONVOCAÇÃO (art. 45 I e §3º)
// ============================================================================

export enum StatusConvocacaoMpe {
  AGUARDANDO = 'AGUARDANDO',
  /** Resposta em processamento (lance sendo registrado) — trava contra corrida com o prazo. */
  PROCESSANDO = 'PROCESSANDO',
  EXERCIDA = 'EXERCIDA',
  DECLINADA = 'DECLINADA',
  EXPIRADA = 'EXPIRADA',
  CANCELADA = 'CANCELADA',
}

export enum StatusDesempateMpe {
  /** Há ME/EPP convocada (ou a convocar) — aceitação da unidade bloqueada. */
  EM_CURSO = 'EM_CURSO',
  /** Uma ME/EPP ofertou valor inferior e passou a 1ª. */
  EXERCIDO = 'EXERCIDO',
  /** Nenhuma ME/EPP do intervalo exerceu (recusa/prazo) — mantido o 1º original. */
  NAO_EXERCIDO = 'NAO_EXERCIDO',
  /** Sem empate ficto (motivo registrado). */
  NAO_APLICAVEL = 'NAO_APLICAVEL',
  CANCELADO = 'CANCELADO',
}

export const prazoConvocacaoAte = (inicio: Date, minutos: number) => new Date(inicio.getTime() + Number(minutos) * 60_000);

export interface EstadoConvocacaoMpe {
  status: string;
  prazo_ate: Date | string;
}

export const convocacaoExpirada = (c: EstadoConvocacaoMpe, agora: Date = new Date()) => agora.getTime() > new Date(c.prazo_ate).getTime();

/**
 * Oferta da ME/EPP convocada: dentro do prazo, convocação aguardando, valor
 * válido e ESTRITAMENTE inferior à melhor oferta (art. 45 I). O motor
 * confere de novo (validarDesempateMpe) contra o melhor lance atual.
 */
export function motivoNaoExerce(c: EstadoConvocacaoMpe, valor: unknown, melhorValor: number, agora: Date = new Date()): string | null {
  if (c.status !== StatusConvocacaoMpe.AGUARDANDO) return 'Esta convocação para o desempate ME/EPP não está aberta.';
  if (convocacaoExpirada(c, agora)) return 'O prazo para a oferta de desempate terminou (LC 123/2006, art. 45, §3º) — direito precluso.';
  const v = Number(valor);
  if (valor == null || valor === '' || !Number.isFinite(v) || v <= 0) return 'Informe o valor da nova oferta.';
  // casas decimais: o motor confere (4 no item; 2 no lote)
  if (Math.round(v * 10000) >= Math.round(Number(melhorValor) * 10000)) {
    return `A nova oferta deve ser MENOR que a melhor oferta (R$ ${Number(melhorValor).toFixed(2).replace('.', ',')}) — LC 123/2006, art. 45, I.`;
  }
  return null;
}

// ============================================================================
// ESCRITA DOS CAMPOS DA LICITAÇÃO (fonte da verdade = tipo_beneficio_mpe)
// ============================================================================

/**
 * Normaliza o benefício ME/EPP do corpo da licitação: o campo NOVO
 * (`tipo_beneficio_mpe`) é a fonte da verdade; o legado (`exclusivo_mpe`,
 * `cota_reservada`) só é aceito como entrada de clientes antigos e é sempre
 * DERIVADO do tipo (coerência para leitores antigos). Cota: percentual > 0 e
 * ≤ 25% (art. 48 III); ausente → 25%. Corpo sem nenhum dos campos → nada muda.
 */
export function normalizarBeneficioMpeLicitacao(
  dto: { tipo_beneficio_mpe?: string | null; exclusivo_mpe?: boolean | null; cota_reservada?: boolean | null; percentual_cota_reservada?: number | string | null },
  atual?: { tipo_beneficio_mpe?: string | null; percentual_cota_reservada?: number | string | null } | null,
): Partial<{ tipo_beneficio_mpe: TipoBeneficioMpe; exclusivo_mpe: boolean; cota_reservada: boolean; percentual_cota_reservada: number | null }> {
  const tocou =
    dto.tipo_beneficio_mpe !== undefined ||
    dto.exclusivo_mpe !== undefined ||
    dto.cota_reservada !== undefined ||
    dto.percentual_cota_reservada !== undefined;
  if (!tocou) return {};
  let tipo: TipoBeneficioMpe;
  if (dto.tipo_beneficio_mpe != null && dto.tipo_beneficio_mpe !== '') {
    if (!['NENHUM', 'EXCLUSIVO', 'COTA_RESERVADA'].includes(String(dto.tipo_beneficio_mpe))) {
      throw new Error('tipo_beneficio_mpe inválido: use NENHUM, EXCLUSIVO ou COTA_RESERVADA');
    }
    tipo = dto.tipo_beneficio_mpe as TipoBeneficioMpe;
  } else if (dto.exclusivo_mpe === true) tipo = 'EXCLUSIVO';
  else if (dto.cota_reservada === true) tipo = 'COTA_RESERVADA';
  else {
    tipo = normTipo(atual?.tipo_beneficio_mpe);
    if (dto.exclusivo_mpe === false && tipo === 'EXCLUSIVO') tipo = 'NENHUM';
    if (dto.cota_reservada === false && tipo === 'COTA_RESERVADA') tipo = 'NENHUM';
  }
  let percentual: number | null = null;
  if (tipo === 'COTA_RESERVADA') {
    const bruto = dto.percentual_cota_reservada ?? atual?.percentual_cota_reservada;
    percentual = bruto == null || bruto === '' ? PERCENTUAL_COTA_LEGAL : Number(bruto);
    const erro = motivoPercentualCotaInvalido(percentual);
    if (erro) throw new Error(erro);
  }
  return {
    tipo_beneficio_mpe: tipo,
    exclusivo_mpe: tipo === 'EXCLUSIVO',
    cota_reservada: tipo === 'COTA_RESERVADA',
    percentual_cota_reservada: percentual,
  };
}

// ============================================================================
// PRAZO PAUSADO NA SUSPENSÃO (devido processo: ninguém age com a sessão ou a
// licitação suspensa — o prazo do art. 45 §3º não corre)
// ============================================================================

/** Marco de suspensão/retomada (instantes em ms, todos no MESMO relógio — o do banco). */
export interface MarcoSuspensao {
  emMs: number;
  fonte: 'SESSAO' | 'LICITACAO';
  suspende: boolean;
}

/**
 * Tempo suspenso desde `desdeMs` até `agoraMs`: a sessão OU a licitação
 * suspensa pausa o prazo (união dos intervalos). `estadoAtual` cobre a
 * suspensão vigente sem marco registrado (conta a partir de agora).
 */
export function tempoSuspenso(
  marcos: MarcoSuspensao[],
  desdeMs: number,
  agoraMs: number,
  estadoAtual: { sessao?: boolean; licitacao?: boolean } = {},
): { pausadoMs: number; suspensaAgora: boolean } {
  const ordem = [...marcos].sort((a, b) => a.emMs - b.emMs);
  const estado = { SESSAO: false, LICITACAO: false };
  for (const m of ordem) if (m.emMs <= desdeMs) estado[m.fonte] = m.suspende;
  let cursor = desdeMs;
  let pausadoMs = 0;
  for (const m of ordem) {
    if (m.emMs <= desdeMs || m.emMs > agoraMs) continue;
    if (estado.SESSAO || estado.LICITACAO) pausadoMs += m.emMs - cursor;
    estado[m.fonte] = m.suspende;
    cursor = m.emMs;
  }
  if (estado.SESSAO || estado.LICITACAO) pausadoMs += Math.max(0, agoraMs - cursor);
  return { pausadoMs, suspensaAgora: estado.SESSAO || estado.LICITACAO || !!estadoAtual.sessao || !!estadoAtual.licitacao };
}

/**
 * Prazo efetivo da convocação: `totalMs` (5 min) de tempo ATIVO desde a
 * convocação, descontado o tempo suspenso. Suspensa → nunca expira (o prazo
 * fica pausado com o restante guardado); ao retomar, o restante volta a correr.
 */
export function estadoDoPrazoMpe(p: { totalMs: number; convocadaMs: number; agoraMs: number; pausadoMs: number; suspensaAgora: boolean }) {
  const ativoMs = Math.max(0, p.agoraMs - p.convocadaMs - p.pausadoMs);
  const restanteMs = p.totalMs - ativoMs;
  return { restanteMs: Math.max(0, restanteMs), suspensa: p.suspensaAgora, expirada: !p.suspensaAgora && restanteMs < 0 };
}

// ============================================================================
// PUBLICAÇÃO × ART. 48 I (pré-condição do ato PUBLICAR)
// ============================================================================

/** Unidade na conferência do art. 48 I (item; na disputa por lote, o LOTE pelo valor total). */
export interface UnidadeConferenciaArt48 {
  rotulo: string;
  valorEstimado: number;
  exclusiva: boolean;
  ehCota: boolean;
}

export interface ConferenciaArt48 {
  limite: number;
  unidades: UnidadeConferenciaArt48[];
}

/** Mínimo da justificativa (art. 49) para publicar com itens até o limite sem exclusividade. */
export const JUSTIFICATIVA_ART49_MINIMO = 20;

/**
 * Pendências do PUBLICAR pelo art. 48 I (LC 123/2006):
 *  - BLOQUEIO: unidade EXCLUSIVA de ME/EPP com valor estimado ACIMA do limite
 *    (R$ 80.000 — `MPE_EXCLUSIVO_ITEM`); a unidade-cota do inciso III não entra
 *    (a cota é exclusiva por definição, qualquer que seja o valor). No lote
 *    vale o valor TOTAL do lote (decisão: o "item de contratação" disputado é o lote).
 *  - JUSTIFICATIVA: unidade até o limite SEM exclusividade — o art. 48 I manda
 *    reservar, mas o art. 49 admite exceções (ex.: menos de 3 fornecedores ME/EPP
 *    competitivos, desvantagem à Administração); publicar exige a justificativa
 *    (≥ 20 caracteres), registrada na transição. Na listagem de atos
 *    (`somenteAvaliacao`), só o bloqueio é avaliado.
 */
export function pendenciasPublicacaoArt48(
  c: ConferenciaArt48 | null | undefined,
  justificativa: string | null | undefined,
  somenteAvaliacao = false,
): string[] {
  if (!c) return [];
  const brl = (v: number) => `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pend: string[] = [];
  const acima = c.unidades.filter((u) => u.exclusiva && !u.ehCota && Number(u.valorEstimado) > Number(c.limite));
  if (acima.length) {
    pend.push(
      `Participação EXCLUSIVA de ME/EPP só é admitida em itens de até ${brl(c.limite)} (LC 123/2006, art. 48, I). ` +
        `Acima do limite: ${acima.map((u) => `${u.rotulo} (${brl(u.valorEstimado)})`).join('; ')}. ` +
        'Retire a exclusividade (ampla ou cota reservada — art. 48, III) antes de publicar.',
    );
  }
  const semExclusividade = c.unidades.filter((u) => !u.exclusiva && Number(u.valorEstimado) <= Number(c.limite));
  if (!somenteAvaliacao && semExclusividade.length && String(justificativa ?? '').trim().length < JUSTIFICATIVA_ART49_MINIMO) {
    pend.push(
      `Itens de até ${brl(c.limite)} sem participação exclusiva de ME/EPP (LC 123/2006, art. 48, I): ` +
        `${semExclusividade.map((u) => u.rotulo).join(', ')}. Informe a justificativa da exceção (art. 49) em ` +
        `"justificativa_nao_exclusividade_mpe" (mín. ${JUSTIFICATIVA_ART49_MINIMO} caracteres — no cockpit da licitação: aba Itens → ` +
        '"Tratamento ME/EPP") ou marque-os como exclusivos.',
    );
  }
  return pend;
}
