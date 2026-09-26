/**
 * ============================================================================
 * MODO DA DISPENSA ELETRÔNICA — com ou sem disputa de lances
 * (fase interna, Entrega 5 — decisão 5 do dono; ajuste de 26/09/2026)
 * ============================================================================
 *
 * É ESCOLHA DO AGENTE NO PROCESSO (`licitacoes.dispensa_com_lances`), feita na
 * fase interna, onde se define a forma de contratação:
 *  - COM disputa de lances (sessão de lances em tempo real — IN SEGES 67/2021,
 *    quando adotada pelo órgão): encerrado o prazo de propostas, a janela de
 *    lances de 6 a 10 horas é OBRIGATÓRIA antes do julgamento (arts. 11 e 15);
 *    o valor final é o menor entre a proposta e os próprios lances; empate →
 *    art. 60 e sorteio no ato (julgarDispensa);
 *  - SEM disputa de lances (Lei 14.133, art. 75, §3º — aviso por no mínimo 3
 *    dias úteis para propostas adicionais, escolhida a mais vantajosa): só o
 *    recebimento de propostas no prazo do aviso; vence o MENOR PREÇO; EMPATE →
 *    a proposta registrada PRIMEIRO (como no aviso real da Câmara de LEM).
 * Nos dois modos cabe a negociação com o vencedor.
 *
 * A configuração do órgão (`configuracoes_fase_interna.dispensa_com_lances`)
 * é só o PADRÃO SUGERIDO: vale enquanto o agente não escolheu (NULL na fase
 * interna). A escolha é CONGELADA no ato PUBLICAR (o PUBLICAR grava o efetivo)
 * e não muda depois. Processo publicado antes (NULL) = com lances.
 * Funções puras (testadas em `modo-disputa-dispensa.spec.ts`).
 */

export interface ProcessoParaModo {
  modalidade?: string | null;
  fase?: string | null;
  dispensa_com_lances?: boolean | null;
}

export interface ModoDisputaDispensa {
  /** O modo só existe na dispensa eletrônica. */
  aplica: boolean;
  com_lances: boolean;
  /** true = gravado no processo na publicação (não muda mais). */
  congelado: boolean;
  /**
   * De onde veio: ESCOLHA (o agente escolheu no processo), SUGERIDO (padrão do
   * órgão, ainda sem escolha), PROCESSO (congelado na publicação) ou LEGADO
   * (publicado antes da escolha por processo existir — com lances).
   */
  fonte: 'ESCOLHA' | 'SUGERIDO' | 'PROCESSO' | 'LEGADO' | 'NAO_SE_APLICA';
  /** Base legal mostrada na tela e no aviso. */
  referencia: string;
  /** Rótulo curto ("Com disputa de lances" / "Sem disputa de lances"). */
  rotulo: string;
  /** Frase para a tela e o aviso. */
  descricao: string;
  /** Ainda pode mudar (fase interna)? */
  editavel: boolean;
}

/** Fases anteriores ao PUBLICAR (enquanto nelas, a escolha pode mudar). */
const FASES_INTERNAS = new Set(['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA']);

export const REFERENCIA_COM_LANCES = 'IN SEGES nº 67/2021, quando adotada pelo órgão';
export const REFERENCIA_SEM_LANCES = 'Lei nº 14.133/2021, art. 75, §3º (aviso de 3 dias úteis para propostas adicionais)';

/** Duração da janela da IN 67, art. 11 (em horas) — para os textos. */
export const JANELA_HORAS = { minima: 6, maxima: 10 };

/** As duas opções, como a tela mostra (uma linha de explicação cada). */
export const OPCOES_MODO_DISPUTA = [
  {
    com_lances: true,
    rotulo: 'Com disputa de lances (sessão de lances em tempo real)',
    explicacao: `Depois do prazo de propostas, os fornecedores reduzem os próprios valores numa sessão de lances de ${JANELA_HORAS.minima} a ${JANELA_HORAS.maxima} horas; vence o menor valor final. Base: ${REFERENCIA_COM_LANCES}.`,
  },
  {
    com_lances: false,
    rotulo: 'Sem disputa de lances (só recebimento de propostas no prazo do aviso)',
    explicacao: `O aviso fica divulgado por no mínimo 3 dias úteis para propostas adicionais; vence a de menor preço (no empate, a registrada primeiro). Base: ${REFERENCIA_SEM_LANCES}.`,
  },
];

/**
 * Modo efetivo do processo: na fase interna, a ESCOLHA do agente (ou, sem
 * escolha, o padrão sugerido do órgão); publicado, o GRAVADO no PUBLICAR
 * (NULL = publicado antes → com lances; a configuração nunca muda o passado).
 */
export function modoDisputaDaDispensa(p: ProcessoParaModo, padraoDoOrgao: boolean | null | undefined): ModoDisputaDispensa {
  if (p.modalidade !== 'DISPENSA_ELETRONICA') {
    return { aplica: false, com_lances: false, congelado: false, fonte: 'NAO_SE_APLICA', referencia: '', rotulo: '', descricao: '', editavel: false };
  }
  const interna = FASES_INTERNAS.has(String(p.fase ?? ''));
  const escolhido = p.dispensa_com_lances === true || p.dispensa_com_lances === false;
  let com: boolean;
  let fonte: ModoDisputaDispensa['fonte'];
  if (escolhido) {
    com = p.dispensa_com_lances as boolean;
    fonte = interna ? 'ESCOLHA' : 'PROCESSO';
  } else if (interna) {
    com = padraoDoOrgao !== false;
    fonte = 'SUGERIDO';
  } else {
    com = true;
    fonte = 'LEGADO';
  }
  return {
    aplica: true,
    com_lances: com,
    congelado: !interna,
    fonte,
    referencia: com ? REFERENCIA_COM_LANCES : REFERENCIA_SEM_LANCES,
    rotulo: com ? 'Com disputa de lances' : 'Sem disputa de lances',
    descricao: com
      ? `Com disputa de lances — sessão de lances em tempo real de ${JANELA_HORAS.minima} a ${JANELA_HORAS.maxima} horas depois do prazo de propostas`
      : 'Sem disputa de lances — só o recebimento de propostas no prazo do aviso; vence o menor preço (no empate, a proposta registrada primeiro)',
    editavel: interna,
  };
}

/** Valor a CONGELAR no PUBLICAR: a escolha do processo; sem escolha, o padrão do órgão (padrão: com lances). */
export function modoParaCongelar(escolha: boolean | null | undefined, padraoDoOrgao: boolean | null | undefined): boolean {
  if (escolha === true || escolha === false) return escolha;
  return padraoDoOrgao !== false;
}

/** O processo publicado está SEM disputa de lances? (NULL/legado = com lances) */
export function dispensaSemLances(p: ProcessoParaModo): boolean {
  return p.modalidade === 'DISPENSA_ELETRONICA' && p.dispensa_com_lances === false;
}

/**
 * Texto da forma de disputa para o aviso de contratação direta e para a
 * minuta do aviso (variável `{{licitacao.forma_disputa}}`).
 */
export function textoFormaDisputa(comLances: boolean): string {
  return comLances
    ? `Encerrado o prazo de recebimento de propostas, haverá sessão de disputa de lances em tempo real, com duração de ${JANELA_HORAS.minima} (seis) a ${JANELA_HORAS.maxima} (dez) horas, sem identificação dos fornecedores (IN SEGES nº 67/2021, arts. 11 e 13, adotada pelo órgão), e o julgamento pelo menor preço (art. 15); o órgão poderá negociar condições mais vantajosas com o vencedor (art. 16).`
    : 'Não haverá disputa de lances: o aviso permanece divulgado por no mínimo 3 (três) dias úteis para o recebimento de propostas adicionais (Lei nº 14.133/2021, art. 75, §3º), e será escolhida a mais vantajosa — a de menor preço; em caso de empate, prevalecerá a proposta registrada primeiro no sistema. O órgão poderá negociar condições mais vantajosas com o vencedor.';
}

// ---------------------------------------------------------------------------
// Julgamento SEM etapa de lances
// ---------------------------------------------------------------------------

export interface PropostaSemLances {
  item_licitacao_id: string;
  valor_unitario: string | number;
  proposta_id: string;
  fornecedor_id: string;
  razao_social: string;
  /** Momento do registro da proposta no sistema (data de envio; senão, criação). */
  registrada_em: Date | string | null;
}

const centesimos = (v: string | number) => Math.round(Number(v) * 10_000);
const instante = (d: Date | string | null) => (d ? new Date(d).getTime() : Number.POSITIVE_INFINITY);

/**
 * Vencedor por item, sem lances: o menor valor unitário das propostas; no
 * empate (mesmo valor com 4 casas), a proposta registrada PRIMEIRO. Sem data
 * de registro, vai para o fim (e, persistindo, a ordem da proposta).
 */
export function vencedoresSemLances<T extends PropostaSemLances>(linhas: T[]): Map<string, T> {
  const porItem = new Map<string, T>();
  for (const l of linhas) {
    const atual = porItem.get(l.item_licitacao_id);
    if (!atual) {
      porItem.set(l.item_licitacao_id, l);
      continue;
    }
    const dv = centesimos(l.valor_unitario) - centesimos(atual.valor_unitario);
    if (dv < 0) porItem.set(l.item_licitacao_id, l);
    else if (dv === 0) {
      const dt = instante(l.registrada_em) - instante(atual.registrada_em);
      if (dt < 0 || (dt === 0 && String(l.proposta_id) < String(atual.proposta_id))) porItem.set(l.item_licitacao_id, l);
    }
  }
  return porItem;
}
