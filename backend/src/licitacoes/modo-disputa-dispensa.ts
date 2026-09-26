/**
 * ============================================================================
 * MODO DA DISPENSA ELETRÔNICA — com ou sem etapa de lances
 * (fase interna, Entrega 5 — decisão 5 do dono, 26/09/2026)
 * ============================================================================
 *
 * O órgão escolhe (Configurações › Fase interna e tarefas):
 *  - COM etapa de lances (padrão — IN SEGES 67/2021): encerrado o prazo de
 *    propostas, a janela de lances de 6 a 10 horas é OBRIGATÓRIA antes do
 *    julgamento (arts. 11 e 15); o valor final de cada fornecedor é o menor
 *    entre a proposta e os próprios lances; empate → critérios do art. 60 e
 *    sorteio no ato (julgarDispensa);
 *  - SEM etapa de lances (regulamento do órgão que não adota a IN 67 — ex.:
 *    o aviso da Câmara de LEM, "nos termos da Portaria 089 não há previsão de
 *    disputa de lances"): só o cadastro de propostas até o fim do prazo;
 *    julgamento pelo MENOR PREÇO das propostas; EMPATE → prevalece a proposta
 *    registrada PRIMEIRO no sistema (como no aviso real da Câmara).
 * Nos dois modos vale a negociação com o vencedor (IN 67, art. 16).
 *
 * O valor é GRAVADO no processo no ato PUBLICAR (`licitacoes.dispensa_com_lances`)
 * e fica congelado: mudar a configuração depois não altera processo já
 * publicado. Funções puras (testadas em `modo-disputa-dispensa.spec.ts`).
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
  /** true = gravado no processo na publicação (a configuração não o altera mais). */
  congelado: boolean;
  /** De onde veio: PROCESSO (gravado no PUBLICAR), CONFIGURACAO (fase interna) ou LEGADO (publicado antes da Entrega 5). */
  fonte: 'PROCESSO' | 'CONFIGURACAO' | 'LEGADO' | 'NAO_SE_APLICA';
  /** Referência legal mostrada na tela. */
  referencia: string;
  /** Rótulo curto ("Com etapa de lances" / "Sem disputa de lances"). */
  rotulo: string;
  /** Frase para a tela e o aviso. */
  descricao: string;
}

/** Fases anteriores ao PUBLICAR (enquanto nelas, o modo segue a configuração do órgão). */
const FASES_INTERNAS = new Set(['PLANEJAMENTO', 'TERMO_REFERENCIA', 'PESQUISA_PRECOS', 'ANALISE_JURIDICA', 'APROVACAO_INTERNA']);

export const REFERENCIA_COM_LANCES = 'IN SEGES nº 67/2021, arts. 11 a 16';
export const REFERENCIA_SEM_LANCES = 'regulamento do órgão (sem etapa de lances; IN SEGES nº 67/2021, art. 16, para a negociação)';

/** Duração da janela da IN 67, art. 11 (em horas) — para os textos. */
export const JANELA_HORAS = { minima: 6, maxima: 10 };

/**
 * Modo efetivo do processo: na fase interna, o da configuração do órgão;
 * publicado, o GRAVADO no PUBLICAR (NULL = publicado antes desta entrega →
 * com lances, a regra que valia; a configuração nunca muda o passado).
 */
export function modoDisputaDaDispensa(p: ProcessoParaModo, configComLances: boolean | null | undefined): ModoDisputaDispensa {
  if (p.modalidade !== 'DISPENSA_ELETRONICA') {
    return { aplica: false, com_lances: false, congelado: false, fonte: 'NAO_SE_APLICA', referencia: '', rotulo: '', descricao: '' };
  }
  const interna = FASES_INTERNAS.has(String(p.fase ?? ''));
  let com: boolean;
  let fonte: ModoDisputaDispensa['fonte'];
  if (interna) {
    com = configComLances !== false;
    fonte = 'CONFIGURACAO';
  } else if (p.dispensa_com_lances === true || p.dispensa_com_lances === false) {
    com = p.dispensa_com_lances;
    fonte = 'PROCESSO';
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
    rotulo: com ? 'Com etapa de lances' : 'Sem disputa de lances',
    descricao: com
      ? `Com etapa de lances de ${JANELA_HORAS.minima} a ${JANELA_HORAS.maxima} horas depois do prazo de propostas (IN SEGES nº 67/2021, arts. 11 e 15)`
      : 'Sem disputa de lances, apenas cadastro de propostas (regulamento do órgão) — vence o menor preço; no empate, a proposta registrada primeiro',
  };
}

/** O processo publicado está SEM etapa de lances? (NULL/legado = com lances) */
export function dispensaSemLances(p: ProcessoParaModo): boolean {
  return p.modalidade === 'DISPENSA_ELETRONICA' && p.dispensa_com_lances === false;
}

/**
 * Texto da forma de disputa para o aviso de contratação direta e para a
 * minuta do aviso (variável `{{licitacao.forma_disputa}}`).
 */
export function textoFormaDisputa(comLances: boolean): string {
  return comLances
    ? `Encerrado o prazo de recebimento de propostas, haverá etapa de lances com duração de ${JANELA_HORAS.minima} (seis) a ${JANELA_HORAS.maxima} (dez) horas, sem identificação dos fornecedores (IN SEGES nº 67/2021, arts. 11 e 13), e o julgamento pelo menor preço (art. 15); o órgão poderá negociar condições mais vantajosas com o vencedor (art. 16).`
    : 'Não haverá disputa de lances: apenas o cadastro de propostas até o fim do prazo, nos termos do regulamento do órgão. Será vencedora a proposta de menor preço e, em caso de empate, prevalecerá a proposta registrada primeiro no sistema; o órgão poderá negociar condições mais vantajosas com o vencedor (IN SEGES nº 67/2021, art. 16).';
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
