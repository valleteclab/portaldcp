import {
  CATEGORIA_PROCESSO,
  CRITERIO_JULGAMENTO,
  CompraPncp,
  INSTRUMENTO_CONVOCATORIO,
  ItemCompraPncp,
  MODALIDADE_SISTEMA_PARA_PNCP,
  MODO_DISPUTA,
  PORTE_FORNECEDOR,
  ResultadoItemPncp,
  SITUACAO_COMPRA,
  SITUACAO_ITEM,
  TIPO_BENEFICIO,
  TIPO_DOCUMENTO,
} from './dto/pncp.dto';
import { falhaDefinitiva } from './fila/regras-fila';

/**
 * ============================================================================
 * MAPEAMENTO licitação → PNCP (funções puras — plano E7 item 8)
 * ============================================================================
 *
 * Fonte das tabelas: Manual de Integração PNCP 2.3.8 (seção 5) e
 * docs/Tabelas de Domínio e Regras de Conformid.md. Regras de conformidade
 * que o PNCP confere (recusa a compra se divergirem):
 *  - Instrumento × Modalidade × Amparo legal;
 *  - Instrumento × Modo de disputa: Edital ↔ aberto/fechado/aberto-fechado/
 *    fechado-aberto; Aviso de Contratação Direta ↔ "Dispensa com disputa";
 *    Ato que autoriza a Contratação Direta ↔ "Não se aplica".
 * Nada aqui inventa dado: data ausente é erro (definitivo) com o motivo.
 */

type Texto = string | null | undefined;
type Numero = number | string | null | undefined;
type DataLike = Date | string | null | undefined;

/** O que o mapeamento lê da licitação (subconjunto da entidade). */
export interface LicitacaoParaPncp {
  id: string;
  modalidade: string;
  criterio_julgamento?: Texto;
  modo_disputa?: Texto;
  tipo_contratacao?: Texto;
  srp?: boolean | null;
  sigilo_orcamento?: Texto;
  numero_processo: string;
  numero_edital?: Texto;
  objeto: string;
  data_publicacao_edital?: DataLike;
  data_inicio_acolhimento?: DataLike;
  data_fim_acolhimento?: DataLike;
  data_abertura_sessao?: DataLike;
  /** Concurso (E7c): TECNICO | CIENTIFICO | ARTISTICO — ARTISTICO → critério "conteúdo artístico". */
  natureza_trabalho_concurso?: Texto;
}

export interface ItemParaPncp {
  numero_item?: number | null;
  descricao_resumida?: Texto;
  descricao_detalhada?: Texto;
  quantidade: Numero;
  unidade_medida?: Texto;
  valor_unitario_estimado: Numero;
  valor_total_estimado?: Numero;
  tipo_item?: Texto;
  codigo_catmat?: Texto;
  codigo_catser?: Texto;
  margem_preferencia?: boolean | null;
  percentual_margem?: Numero;
  status?: Texto;
  /** Leilão (E7c): tipo do bem (IMOVEL → categoria "bens imóveis"; demais → "bens móveis"). */
  tipo_bem_leilao?: Texto;
}

/** Benefício ME/EPP da unidade (julgamento/me-epp — `beneficioDaUnidade`). */
export interface BeneficioParaPncp {
  tipo: 'NENHUM' | 'EXCLUSIVO' | 'COTA_RESERVADA';
  ehCota: boolean;
  somenteMpe: boolean;
}

const up = (v: Texto) => String(v || '').toUpperCase();
const num = (v: Numero) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
export const arred4 = (v: number) => Math.round(v * 10_000) / 10_000;

const ehContratacaoDireta = (modalidade: Texto) => /DISPENSA|INEXIGIBILIDADE/.test(up(modalidade));
const ehLeilao = (modalidade: Texto) => up(modalidade).startsWith('LEILAO');
const ehDispensa = (modalidade: Texto) => up(modalidade).startsWith('DISPENSA');
/** Credenciamento (procedimento auxiliar — art. 78 I): sem disputa nem julgamento; valor fixado no edital (art. 79). */
const ehCredenciamento = (modalidade: Texto) => up(modalidade) === 'CREDENCIAMENTO';

// ============================================================================
// Modalidade, instrumento, modo de disputa, amparo legal, critério
// ============================================================================

export function modalidadeIdPncp(modalidade: Texto): number {
  const id = MODALIDADE_SISTEMA_PARA_PNCP[up(modalidade)];
  if (!id) throw falhaDefinitiva(`Modalidade sem correspondência no PNCP: ${modalidade}`);
  return id;
}

/**
 * Instrumento convocatório: Edital (pregão, concorrência, concurso, leilão,
 * diálogo, credenciamento); Aviso de Contratação Direta (dispensa COM
 * disputa — a dispensa eletrônica da IN 67); Ato que autoriza a Contratação
 * Direta (dispensa sem disputa e inexigibilidade).
 */
export function instrumentoConvocatorioId(lic: Pick<LicitacaoParaPncp, 'modalidade' | 'modo_disputa'>): number {
  if (ehDispensa(lic.modalidade)) {
    return lic.modo_disputa ? INSTRUMENTO_CONVOCATORIO.AVISO_CONTRATACAO_DIRETA : INSTRUMENTO_CONVOCATORIO.ATO_AUTORIZA_CONTRATACAO_DIRETA;
  }
  if (up(lic.modalidade) === 'INEXIGIBILIDADE') return INSTRUMENTO_CONVOCATORIO.ATO_AUTORIZA_CONTRATACAO_DIRETA;
  return INSTRUMENTO_CONVOCATORIO.EDITAL;
}

export function modoDisputaIdPncp(lic: Pick<LicitacaoParaPncp, 'modalidade' | 'modo_disputa'>, instrumento: number): number {
  if (instrumento === INSTRUMENTO_CONVOCATORIO.AVISO_CONTRATACAO_DIRETA) return MODO_DISPUTA.DISPENSA_COM_DISPUTA;
  if (instrumento === INSTRUMENTO_CONVOCATORIO.ATO_AUTORIZA_CONTRATACAO_DIRETA) return MODO_DISPUTA.NAO_SE_APLICA;
  // Credenciamento (E7b): edital de chamamento sem disputa — "não se aplica"
  // (conferir a regra Edital × Modo de Disputa no PNCP de treinamento).
  if (ehCredenciamento(lic.modalidade)) return MODO_DISPUTA.NAO_SE_APLICA;
  // Concurso (E7c): julgamento de trabalhos, sem lances — propostas fechadas
  if (up(lic.modalidade) === 'CONCURSO') return MODO_DISPUTA.FECHADO;
  switch (up(lic.modo_disputa)) {
    case 'ABERTO':
      return MODO_DISPUTA.ABERTO;
    case 'FECHADO':
      return MODO_DISPUTA.FECHADO;
    case 'ABERTO_FECHADO':
      return MODO_DISPUTA.ABERTO_FECHADO;
    case 'FECHADO_ABERTO':
      return MODO_DISPUTA.FECHADO_ABERTO;
    default:
      // sem modo gravado: concurso é por propostas fechadas; os demais, aberto (art. 56 I)
      return up(lic.modalidade) === 'CONCURSO' ? MODO_DISPUTA.FECHADO : MODO_DISPUTA.ABERTO;
  }
}

/**
 * Amparo legal (tabela "Amparo Legal"): art. 28 I–V por modalidade
 * licitatória; dispensa pelo art. 75 I (obras e serviços de engenharia) ou II
 * (demais compras e serviços) — os valores da dispensa eletrônica; outras
 * hipóteses do art. 75 exigem o inciso próprio (o sistema ainda não o grava);
 * inexigibilidade pelo art. 74 caput (a hipótese concreta vem do processo);
 * credenciamento (procedimento auxiliar) pelo art. 78 I.
 */
export function amparoLegalIdPncp(lic: Pick<LicitacaoParaPncp, 'modalidade' | 'tipo_contratacao'>): number {
  const m = up(lic.modalidade);
  if (m.startsWith('PREGAO')) return 1; // art. 28, I
  if (m.startsWith('CONCORRENCIA')) return 2; // art. 28, II
  if (m === 'CONCURSO') return 3; // art. 28, III
  if (m.startsWith('LEILAO')) return 4; // art. 28, IV
  if (m === 'DIALOGO_COMPETITIVO') return 5; // art. 28, V
  if (m.startsWith('DISPENSA')) {
    const tc = up(lic.tipo_contratacao);
    return tc.includes('OBRA') || tc.includes('ENGENHARIA') ? 18 : 19; // art. 75, I | II
  }
  if (m === 'INEXIGIBILIDADE') return 50; // art. 74, caput
  if (m === 'CREDENCIAMENTO') return 47; // art. 78, I
  throw falhaDefinitiva(`Amparo legal não definido para a modalidade ${lic.modalidade}`);
}

/** Critério de julgamento do item (art. 33) — contratação direta sem disputa: "não se aplica". */
export function criterioJulgamentoIdPncp(lic: Pick<LicitacaoParaPncp, 'modalidade' | 'criterio_julgamento' | 'natureza_trabalho_concurso'>, instrumento: number): number {
  if (instrumento === INSTRUMENTO_CONVOCATORIO.ATO_AUTORIZA_CONTRATACAO_DIRETA) return CRITERIO_JULGAMENTO.NAO_SE_APLICA;
  if (ehCredenciamento(lic.modalidade)) return CRITERIO_JULGAMENTO.NAO_SE_APLICA; // sem julgamento (E7b)
  if (ehLeilao(lic.modalidade)) return CRITERIO_JULGAMENTO.MAIOR_LANCE;
  switch (up(lic.criterio_julgamento)) {
    case 'MAIOR_DESCONTO':
      return CRITERIO_JULGAMENTO.MAIOR_DESCONTO;
    case 'TECNICA_E_PRECO':
      return CRITERIO_JULGAMENTO.TECNICA_PRECO;
    case 'MAIOR_LANCE':
      return CRITERIO_JULGAMENTO.MAIOR_LANCE;
    case 'MAIOR_RETORNO_ECONOMICO':
      return CRITERIO_JULGAMENTO.MAIOR_RETORNO_ECONOMICO;
    case 'MELHOR_TECNICA':
      // Concurso de trabalho ARTÍSTICO → "conteúdo artístico" (art. 33 III; E7c)
      return up(lic.modalidade) === 'CONCURSO' && up(lic.natureza_trabalho_concurso) === 'ARTISTICO'
        ? CRITERIO_JULGAMENTO.CONTEUDO_ARTISTICO
        : CRITERIO_JULGAMENTO.MELHOR_TECNICA;
    default:
      return CRITERIO_JULGAMENTO.MENOR_PRECO;
  }
}

// ============================================================================
// Itens
// ============================================================================

/** Tipo do item quando não informado: compra/alienação → material; serviço, obra, engenharia, locação → serviço. */
export function tipoItemPadrao(tipoContratacao: Texto): 'MATERIAL' | 'SERVICO' {
  const tc = up(tipoContratacao);
  return tc === 'SERVICO' || tc === 'OBRA' || tc === 'SERVICO_ENGENHARIA' || tc === 'LOCACAO' ? 'SERVICO' : 'MATERIAL';
}

/**
 * Material ou serviço do item: o tipo do item (`tipo_item`); sem ele, o
 * catálogo (CATSER → serviço, CATMAT → material); sem catálogo, o tipo da
 * contratação. Leilão é sempre "M" (manual 6.3.1, 18.2).
 */
export function materialOuServico(item: Pick<ItemParaPncp, 'tipo_item' | 'codigo_catmat' | 'codigo_catser'>, lic: Pick<LicitacaoParaPncp, 'modalidade' | 'tipo_contratacao'>): 'M' | 'S' {
  if (ehLeilao(lic.modalidade)) return 'M';
  const t = up(item.tipo_item);
  if (t === 'SERVICO') return 'S';
  if (t === 'MATERIAL') return 'M';
  if (item.codigo_catser && !item.codigo_catmat) return 'S';
  if (item.codigo_catmat && !item.codigo_catser) return 'M';
  return tipoItemPadrao(lic.tipo_contratacao) === 'SERVICO' ? 'S' : 'M';
}

/** Tipo de benefício ME/EPP do item: cota reservada (3), exclusiva (1), sem benefício (4); leilão "não se aplica" (5). */
export function tipoBeneficioIdPncp(beneficio: BeneficioParaPncp | null | undefined, modalidade: Texto): number {
  if (ehLeilao(modalidade)) return TIPO_BENEFICIO.NAO_SE_APLICA;
  if (beneficio?.ehCota) return TIPO_BENEFICIO.COTA_RESERVADA_ME_EPP;
  if (beneficio?.tipo === 'EXCLUSIVO') return TIPO_BENEFICIO.EXCLUSIVA_ME_EPP;
  return TIPO_BENEFICIO.SEM_BENEFICIO;
}

export function montarItemCompra(
  item: ItemParaPncp,
  indice: number,
  lic: LicitacaoParaPncp,
  beneficio: BeneficioParaPncp | null | undefined,
  instrumento: number,
): ItemCompraPncp {
  const quantidade = num(item.quantidade);
  const valorUnitario = num(item.valor_unitario_estimado);
  const valorTotal = item.valor_total_estimado != null && num(item.valor_total_estimado) > 0 ? num(item.valor_total_estimado) : quantidade * valorUnitario;
  const leilao = ehLeilao(lic.modalidade);
  const margem = !leilao && item.margem_preferencia === true;
  const dto: ItemCompraPncp = {
    numeroItem: item.numero_item || indice + 1,
    materialOuServico: materialOuServico(item, lic),
    tipoBeneficioId: tipoBeneficioIdPncp(beneficio, lic.modalidade),
    incentivoProdutivoBasico: false,
    descricao: String(item.descricao_resumida || item.descricao_detalhada || '').slice(0, 2048),
    quantidade: arred4(quantidade),
    unidadeMedida: String(item.unidade_medida || 'Unidade').slice(0, 30),
    valorUnitarioEstimado: arred4(valorUnitario),
    valorTotal: arred4(valorTotal),
    criterioJulgamentoId: criterioJulgamentoIdPncp(lic, instrumento),
    orcamentoSigiloso: !leilao && up(lic.sigilo_orcamento) === 'SIGILOSO',
    aplicabilidadeMargemPreferenciaNormal: margem,
    aplicabilidadeMargemPreferenciaAdicional: false,
  };
  if (margem) {
    dto.percentualMargemPreferenciaNormal = arred4(num(item.percentual_margem));
    dto.percentualMargemPreferenciaAdicional = null;
  }
  if (leilao) dto.itemCategoriaId = up(item.tipo_bem_leilao) === 'IMOVEL' ? 1 : 2; // bens imóveis | bens móveis (E7c — cadastro do bem)
  return dto;
}

// ============================================================================
// Datas (horário de Brasília — convenção do projeto, UTC-3 fixo)
// ============================================================================

const BRASILIA_MS = 3 * 3_600_000;

const paraDate = (v: DataLike): Date | null => {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Data/hora no relógio de Brasília, sem fuso: 'YYYY-MM-DDTHH:mm:ss' (o PNCP espera horário de Brasília). */
export function formatarDataHoraBrasilia(v: DataLike): string | null {
  const d = paraDate(v);
  return d ? new Date(d.getTime() - BRASILIA_MS).toISOString().slice(0, 19) : null;
}

/** Dia em Brasília: 'YYYY-MM-DD'. Coluna `date` (string 'YYYY-MM-DD') é devolvida como está. */
export function dataBrasilia(v: DataLike): string | null {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = paraDate(v);
  return d ? new Date(d.getTime() - BRASILIA_MS).toISOString().slice(0, 10) : null;
}

/** Ano da contratação = ano da PUBLICAÇÃO (Brasília); ainda não publicada → o ano de agora (a publicação é o envio). */
export function anoCompraPncp(lic: Pick<LicitacaoParaPncp, 'data_publicacao_edital'>, agora: Date = new Date()): number {
  return Number((dataBrasilia(lic.data_publicacao_edital) ?? dataBrasilia(agora))!.slice(0, 4));
}

/** "Número da contratação no sistema de origem SEM o ano" (manual 6.3.1, campo 8). */
export function numeroCompraPncp(lic: Pick<LicitacaoParaPncp, 'numero_edital' | 'numero_processo'>): string {
  const base = String(lic.numero_edital || lic.numero_processo || '').trim();
  return base.replace(/\s*\/\s*\d{4}$/, '').slice(0, 50) || base.slice(0, 50);
}

/** Início/fim do recebimento de propostas (obrigatórios para Edital e Aviso; o Ato os despreza). */
export function datasDasPropostas(lic: LicitacaoParaPncp, instrumento: number): { dataAberturaProposta?: string; dataEncerramentoProposta?: string } {
  if (instrumento === INSTRUMENTO_CONVOCATORIO.ATO_AUTORIZA_CONTRATACAO_DIRETA) return {};
  const abertura = formatarDataHoraBrasilia(lic.data_inicio_acolhimento ?? lic.data_publicacao_edital);
  const encerramento = formatarDataHoraBrasilia(lic.data_fim_acolhimento ?? lic.data_abertura_sessao);
  const faltam = [!abertura && 'início do recebimento de propostas', !encerramento && 'fim do recebimento de propostas'].filter(Boolean);
  if (faltam.length) throw falhaDefinitiva(`Cronograma incompleto para o PNCP: ${faltam.join(' e ')} não informado(s).`);
  return { dataAberturaProposta: abertura!, dataEncerramentoProposta: encerramento! };
}

// ============================================================================
// Compra
// ============================================================================

export interface OpcoesCompra {
  codigoUnidade: string;
  linkSistemaOrigem: string;
  agora?: Date;
  beneficioDoItem?: (indice: number) => BeneficioParaPncp | null | undefined;
}

export function montarCompra(lic: LicitacaoParaPncp, itens: ItemParaPncp[], opts: OpcoesCompra): CompraPncp {
  if (!opts.codigoUnidade) throw falhaDefinitiva('Código da unidade compradora não definido (licitação ou órgão) — configure em Configurações > PNCP.');
  const instrumento = instrumentoConvocatorioId(lic);
  const leilao = ehLeilao(lic.modalidade);
  return {
    codigoUnidadeCompradora: String(opts.codigoUnidade),
    anoCompra: anoCompraPncp(lic, opts.agora),
    numeroCompra: numeroCompraPncp(lic),
    numeroProcesso: String(lic.numero_processo || '').slice(0, 50),
    objetoCompra: String(lic.objeto || '').slice(0, 5120),
    tipoInstrumentoConvocatorioId: instrumento,
    modalidadeId: modalidadeIdPncp(lic.modalidade),
    modoDisputaId: modoDisputaIdPncp(lic, instrumento),
    srp: !leilao && !!lic.srp,
    ...datasDasPropostas(lic, instrumento),
    informacaoComplementar: '',
    amparoLegalId: amparoLegalIdPncp(lic),
    linkSistemaOrigem: opts.linkSistemaOrigem,
    itensCompra: itens.map((it, i) => montarItemCompra(it, i, lic, opts.beneficioDoItem?.(i), instrumento)),
  };
}

/** Documento obrigatório da inclusão da compra, pelo instrumento convocatório. */
export function documentoDaCompra(lic: Pick<LicitacaoParaPncp, 'modalidade' | 'modo_disputa'>): {
  tipoDocumentoId: number;
  titulo: string;
  fonte: 'EDITAL' | 'AVISO_CONTRATACAO_DIRETA' | 'ATO_AUTORIZACAO';
} {
  const instrumento = instrumentoConvocatorioId(lic);
  if (instrumento === INSTRUMENTO_CONVOCATORIO.AVISO_CONTRATACAO_DIRETA) {
    return { tipoDocumentoId: TIPO_DOCUMENTO.AVISO_CONTRATACAO_DIRETA, titulo: 'Aviso de Contratacao Direta', fonte: 'AVISO_CONTRATACAO_DIRETA' };
  }
  if (instrumento === INSTRUMENTO_CONVOCATORIO.ATO_AUTORIZA_CONTRATACAO_DIRETA) {
    return { tipoDocumentoId: TIPO_DOCUMENTO.ATO_AUTORIZA_CONTRATACAO_DIRETA, titulo: 'Ato que autoriza a Contratacao Direta', fonte: 'ATO_AUTORIZACAO' };
  }
  return { tipoDocumentoId: TIPO_DOCUMENTO.EDITAL, titulo: 'Edital', fonte: 'EDITAL' };
}

// ============================================================================
// Situação (substitui o antigo FASE_SISTEMA_PARA_PNCP, que nunca foi usado)
// ============================================================================

/**
 * Situação da licitação → PNCP. Suspensa/revogada/anulada/divulgada são
 * situações da COMPRA; deserta e fracassada são situações dos ITENS (a tabela
 * "Situação da Contratação" não as tem).
 */
export function situacaoPncpDaSituacao(situacao: Texto): { compra?: number; itens?: number } | null {
  switch (up(situacao)) {
    case 'ATIVA':
      return { compra: SITUACAO_COMPRA.DIVULGADA };
    case 'SUSPENSA':
      return { compra: SITUACAO_COMPRA.SUSPENSA };
    case 'REVOGADA':
      return { compra: SITUACAO_COMPRA.REVOGADA };
    case 'ANULADA':
      return { compra: SITUACAO_COMPRA.ANULADA };
    case 'DESERTA':
      return { itens: SITUACAO_ITEM.DESERTO };
    case 'FRACASSADA':
      return { itens: SITUACAO_ITEM.FRACASSADO };
    default:
      return null;
  }
}

/** Atos da máquina de estados que mudam a situação no PNCP. */
export const ATOS_DE_SITUACAO: ReadonlyArray<string> = ['SUSPENDER', 'RETOMAR', 'REVOGAR', 'ANULAR', 'DECLARAR_DESERTA', 'DECLARAR_FRACASSADA'];

/** Situação do item no PNCP pelo status do item (null = sem mudança a informar). */
export function situacaoItemPncpDoStatus(status: Texto): number | null {
  switch (up(status)) {
    case 'HOMOLOGADO':
      return SITUACAO_ITEM.HOMOLOGADO;
    case 'CANCELADO':
      return SITUACAO_ITEM.ANULADO_REVOGADO_CANCELADO;
    case 'DESERTO':
      return SITUACAO_ITEM.DESERTO;
    case 'FRACASSADO':
      return SITUACAO_ITEM.FRACASSADO;
    default:
      return null;
  }
}

// ============================================================================
// Resultado do item
// ============================================================================

export const tipoPessoaDoNi = (ni: string): 'PF' | 'PJ' => (String(ni).replace(/\D/g, '').length === 11 ? 'PF' : 'PJ');

/** Porte do fornecedor (5.14): ME (inclui MEI) 1, EPP 2, demais 3; pessoa física "não se aplica" (4); sem porte "não informado" (5). */
export function portePncp(porte: Texto, tipoPessoa: 'PF' | 'PJ' = 'PJ'): number {
  if (tipoPessoa === 'PF') return PORTE_FORNECEDOR.NAO_SE_APLICA;
  const p = up(porte);
  if (!p) return PORTE_FORNECEDOR.NAO_INFORMADO;
  if (p.includes('EPP') || p.includes('PEQUENO')) return PORTE_FORNECEDOR.EPP;
  if (p === 'ME' || p === 'MEI' || p.includes('MICRO')) return PORTE_FORNECEDOR.ME;
  return PORTE_FORNECEDOR.DEMAIS;
}

/** Percentual de desconto (4 casas) — só no critério MAIOR DESCONTO (o sistema guarda o preço resultante). */
export function percentualDescontoPncp(criterio: Texto, valorUnitarioEstimado: Numero, valorUnitarioHomologado: Numero): number {
  if (up(criterio) !== 'MAIOR_DESCONTO') return 0;
  const est = num(valorUnitarioEstimado);
  const hom = num(valorUnitarioHomologado);
  if (!(est > 0) || hom >= est) return 0;
  return arred4(((est - hom) / est) * 100);
}

export interface DadosResultadoItem {
  quantidade: Numero;
  valorUnitario: Numero;
  valorTotal: Numero;
  fornecedor: { ni: string; razaoSocial: string; porte: Texto };
  criterio: Texto;
  valorUnitarioEstimado: Numero;
  /** Posição do vencedor na classificação final da unidade (1 = primeiro). */
  ordemClassificacao: number;
  dataResultado: DataLike;
  /** O vencedor ganhou pelo benefício ME/EPP: desempate ficto (LC 123 art. 45) ou unidade exclusiva/cota (art. 48). */
  beneficioMeEpp: boolean;
  /** Houve desempate do art. 60 da Lei 14.133 envolvendo o vencedor. */
  criterioDesempate: boolean;
  amparoLegalCriterioDesempateId?: number | null;
  modalidade?: Texto;
}

/** O critério decisivo é um dos do art. 60 (I a IV e §1º I a IV)? Sorteio (IN 73 art. 28 §2º) não é. */
export function criterioDoArt60(criterio: Texto): boolean {
  const c = up(criterio);
  return !!c && c !== 'SORTEIO';
}

/**
 * Amparo legal do inciso do art. 60 na tabela do PNCP. `baseLegal` =
 * "Lei 14.133/2021, art. 60, §1º, I"; casa o nome do amparo pelo inciso EXATO
 * ("art. 60, I" não casa "art. 60, II" nem "art. 60, §1º, I").
 */
export function amparoDoInciso(lista: ReadonlyArray<{ id: number; nome: string }>, baseLegal: string): number | null {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[º°]/g, '')
      .replace(/inciso/g, '')
      .replace(/\s+/g, '');
  const alvo = norm(baseLegal).match(/art\.60,(.+)$/)?.[1];
  if (!alvo) return null;
  const escapado = alvo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`art\\.?60,${escapado}(?![a-z0-9])`);
  const achado = lista.find((a) => re.test(norm(a.nome)));
  return achado ? achado.id : null;
}

export function montarResultadoItem(d: DadosResultadoItem): ResultadoItemPncp {
  const ni = String(d.fornecedor.ni || '').replace(/\D/g, '');
  if (!ni) throw falhaDefinitiva('Fornecedor vencedor sem CPF/CNPJ no cadastro.');
  const tipoPessoaId = tipoPessoaDoNi(ni);
  const dataResultado = dataBrasilia(d.dataResultado);
  if (!dataResultado) throw falhaDefinitiva('Data da homologação não registrada na licitação.');
  if (d.criterioDesempate && !d.amparoLegalCriterioDesempateId) {
    throw falhaDefinitiva('Critério de desempate (art. 60) aplicado, mas o amparo legal do inciso não foi localizado na tabela do PNCP — configure PNCP_AMPARO_DESEMPATE_<CRITERIO> (ex.: PNCP_AMPARO_DESEMPATE_EMPRESA_DO_ESTADO) e reenvie.');
  }
  const valorUnitario = num(d.valorUnitario);
  const quantidade = num(d.quantidade);
  const dto: ResultadoItemPncp = {
    quantidadeHomologada: arred4(quantidade),
    valorUnitarioHomologado: arred4(valorUnitario),
    valorTotalHomologado: arred4(d.valorTotal != null && num(d.valorTotal) > 0 ? num(d.valorTotal) : valorUnitario * quantidade),
    percentualDesconto: percentualDescontoPncp(d.criterio, d.valorUnitarioEstimado, valorUnitario),
    tipoPessoaId,
    niFornecedor: ni,
    nomeRazaoSocialFornecedor: String(d.fornecedor.razaoSocial || '').slice(0, 100),
    porteFornecedorId: portePncp(d.fornecedor.porte, tipoPessoaId),
    codigoPais: 'BRA',
    indicadorSubcontratacao: false,
    ordemClassificacaoSrp: Math.max(1, Math.floor(d.ordemClassificacao || 1)),
    dataResultado,
    aplicacaoMargemPreferencia: false,
    aplicacaoBeneficioMeEpp: !ehLeilao(d.modalidade) && !!d.beneficioMeEpp,
    aplicacaoCriterioDesempate: !!d.criterioDesempate,
    situacaoCompraItemResultadoId: 1, // Informado
  };
  if (d.criterioDesempate) dto.amparoLegalCriterioDesempateId = Number(d.amparoLegalCriterioDesempateId);
  return dto;
}

// ============================================================================
// Contrato
// ============================================================================

/** Categoria do processo (5.11) pela natureza do objeto. */
export function categoriaProcessoId(tipoContratacao: Texto): number {
  switch (up(tipoContratacao)) {
    case 'OBRA':
      return CATEGORIA_PROCESSO.OBRAS;
    case 'SERVICO_ENGENHARIA':
      return CATEGORIA_PROCESSO.SERVICOS_ENGENHARIA;
    case 'SERVICO':
      return CATEGORIA_PROCESSO.SERVICOS;
    case 'LOCACAO':
      return CATEGORIA_PROCESSO.LOCACAO_IMOVEIS;
    case 'ALIENACAO':
      return CATEGORIA_PROCESSO.ALIENACAO;
    default:
      return CATEGORIA_PROCESSO.COMPRAS;
  }
}

/** Contratação direta: art. 94 II (10 dias úteis) × licitação: art. 94 I (20 dias úteis). Informativo para a tela. */
export const prazoEficaciaContratoDiasUteis = (modalidade: Texto) => (ehContratacaoDireta(modalidade) ? 10 : 20);
