import {
  CriterioJulgamento,
  ModalidadeLicitacao,
  RegimeExecucao,
  TipoContratacao,
} from '../licitacoes/entities/licitacao.entity';
import {
  CalendarioDiasUteis,
  calendarioDoOrgao,
  diaEmBrasilia,
  fimDoPrazoEmDiasUteis,
  inicioDoDia,
  limiteDiasUteisAntes,
} from '../common/prazos/dias-uteis';

/**
 * ============================================================================
 * PUBLICAÇÃO E PRAZOS MÍNIMOS — regras PURAS (plano E7a)
 * ============================================================================
 *
 * Lei 14.133/2021, art. 55 (texto conferido no Planalto em 25/09/2026):
 *   "Os prazos mínimos para apresentação de propostas e lances, contados a
 *    partir da data de divulgação do edital de licitação, são de:
 *    I - para aquisição de bens:
 *      a) 8 dias úteis, quando adotados os critérios de julgamento de menor
 *         preço ou de maior desconto;
 *      b) 15 dias úteis, nas hipóteses não abrangidas pela alínea "a";
 *    II - no caso de serviços e obras:
 *      a) 10 dias úteis, menor preço ou maior desconto, no caso de serviços
 *         comuns e de obras e serviços comuns de engenharia;
 *      b) 25 dias úteis, menor preço ou maior desconto, no caso de serviços
 *         especiais e de obras e serviços especiais de engenharia;
 *      c) 60 dias úteis, quando o regime de execução for de contratação integrada;
 *      d) 35 dias úteis, quando o regime for o de contratação semi-integrada ou
 *         nas hipóteses não abrangidas pelas alíneas "a", "b" e "c";
 *    III - maior lance: 15 dias úteis;
 *    IV - técnica e preço ou melhor técnica ou conteúdo artístico: 35 dias úteis.
 *    §1º Eventuais modificações no edital implicarão nova divulgação na mesma
 *        forma de sua divulgação inicial, além do cumprimento dos mesmos prazos
 *        dos atos e procedimentos originais, exceto quando a alteração não
 *        comprometer a formulação das propostas."
 *  Diálogo competitivo (art. 32 §1º I): prazo mínimo de 25 dias úteis para
 *  manifestação de interesse (a fase competitiva, com 60 dias úteis — art. 32
 *  §1º VIII — é a E7c).
 *  Dispensa eletrônica (art. 75 §3º; IN SEGES 67/2021): 3 dias úteis.
 *
 * DECISÕES (a validar):
 *  - Quando mais de uma hipótese se aplica (ex.: bens com técnica e preço → I b
 *    = 15 e IV = 35), vale o MAIOR prazo — o mais longo nunca viola a lei.
 *  - Contagem (art. 183, caput e III): EXCLUI o dia da divulgação e INCLUI o
 *    do vencimento, contando só dias com expediente no CALENDÁRIO DO ÓRGÃO. O
 *    dia do vencimento é o da abertura da sessão (ou do fim do recebimento, na
 *    dispensa): ela pode ocorrer a partir das 00:00 (Brasília) do N-ésimo dia
 *    útil depois da divulgação — ex.: divulgação na segunda 01, 8 dias úteis
 *    (02, 03, 04, 05, 08, 09, 10, 11) → abertura a partir de 11. É a leitura
 *    corrente do "excluir o dia da divulgação e incluir o da abertura".
 *  - O art. 55 conta "a partir da data de divulgação do edital": é a
 *    disposição especial que afasta a regra geral do art. 183 §1º, I (dia do
 *    começo = 1º dia útil seguinte à disponibilização).
 *  - A divulgação é o próprio ato de publicar: conta-se de max(data informada,
 *    agora) — data retroativa não encurta o prazo.
 *  - Pregão só para bens e serviços COMUNS (art. 6º XLI; art. 29 parágrafo
 *    único: não se aplica a serviços técnicos especializados de natureza
 *    predominantemente intelectual nem a obras) — natureza implícita COMUM.
 *  - Locação é tratada como serviço (art. 6º XI).
 */

export type NaturezaObjeto = 'COMUM' | 'ESPECIAL';

export const MODALIDADES_ART55: ModalidadeLicitacao[] = [
  ModalidadeLicitacao.PREGAO_ELETRONICO,
  ModalidadeLicitacao.CONCORRENCIA,
  ModalidadeLicitacao.LEILAO,
  ModalidadeLicitacao.CONCURSO,
  ModalidadeLicitacao.DIALOGO_COMPETITIVO,
];

/** Modalidades cujo PUBLICAR exige o edital anexado (instrumento convocatório). */
export const MODALIDADES_COM_EDITAL: ModalidadeLicitacao[] = [
  ...MODALIDADES_ART55,
  // Edital de chamamento público (art. 79 par. único I) — plano E7b; sem prazo do art. 55
  ModalidadeLicitacao.CREDENCIAMENTO,
];

export const DIAS_UTEIS_DISPENSA = 3;

export interface DadosPrazoArt55 {
  modalidade: ModalidadeLicitacao | string;
  tipo_contratacao?: TipoContratacao | string | null;
  criterio_julgamento?: CriterioJulgamento | string | null;
  regime_execucao?: RegimeExecucao | string | null;
  natureza_objeto?: NaturezaObjeto | string | null;
}

export interface HipotesePrazo {
  dias: number;
  fundamento: string;
  descricao: string;
}

export interface PrazoMinimo {
  /** Dias úteis mínimos (maior das hipóteses aplicáveis); null = não se aplica. */
  dias: number | null;
  fundamento: string | null;
  descricao: string | null;
  hipoteses: HipotesePrazo[];
  /** Dados faltando/incompatíveis para decidir o prazo (bloqueiam a publicação). */
  pendencias: string[];
}

const PRECO = [CriterioJulgamento.MENOR_PRECO, CriterioJulgamento.MAIOR_DESCONTO] as string[];
const TECNICA = [CriterioJulgamento.TECNICA_E_PRECO, CriterioJulgamento.MELHOR_TECNICA] as string[];
const SERVICOS_OBRAS = [
  TipoContratacao.SERVICO,
  TipoContratacao.SERVICO_ENGENHARIA,
  TipoContratacao.OBRA,
  TipoContratacao.LOCACAO,
] as string[];

/**
 * Valor informado para `natureza_objeto` (cadastro/retificação): COMUM,
 * ESPECIAL ou vazio (ainda não classificado). Devolve o valor normalizado ou
 * lança o motivo (string) — quem chama converte em 400.
 */
export function normalizarNaturezaObjeto(v: unknown): NaturezaObjeto | null {
  if (v === undefined || v === null || v === '') return null;
  const t = String(v).trim().toUpperCase();
  if (t === 'COMUM' || t === 'ESPECIAL') return t;
  throw 'Natureza do objeto inválida: use COMUM ou ESPECIAL (Lei 14.133/2021, art. 6º, XIII e XIV).';
}

/** Natureza efetiva: no pregão é sempre COMUM (art. 6º XLI). */
export function naturezaEfetiva(d: DadosPrazoArt55): NaturezaObjeto | null {
  if (d.natureza_objeto === 'COMUM' || d.natureza_objeto === 'ESPECIAL') return d.natureza_objeto;
  if (d.modalidade === ModalidadeLicitacao.PREGAO_ELETRONICO) return 'COMUM';
  return null;
}

/** Categoria do objeto para o art. 55 (bens × serviços/obras). */
export function categoriaDoObjeto(d: DadosPrazoArt55): 'BENS' | 'SERVICOS_OBRAS' | 'ALIENACAO' {
  const tipo = String(d.tipo_contratacao ?? TipoContratacao.COMPRA);
  if (tipo === TipoContratacao.ALIENACAO) return 'ALIENACAO';
  return SERVICOS_OBRAS.includes(tipo) ? 'SERVICOS_OBRAS' : 'BENS';
}

/** O cadastro precisa informar "comum × especial" para decidir o prazo? */
export function exigeNaturezaDoObjeto(d: DadosPrazoArt55): boolean {
  if (!MODALIDADES_ART55.includes(d.modalidade as ModalidadeLicitacao)) return false;
  if (categoriaDoObjeto(d) !== 'SERVICOS_OBRAS') return false;
  const regime = String(d.regime_execucao ?? '');
  if (regime === RegimeExecucao.CONTRATACAO_INTEGRADA || regime === RegimeExecucao.CONTRATACAO_SEMI_INTEGRADA) return false;
  return PRECO.includes(String(d.criterio_julgamento ?? CriterioJulgamento.MENOR_PRECO));
}

/** Prazo mínimo de divulgação (art. 55 / art. 32 §1º I / art. 75 §3º). */
export function prazoMinimoDeDivulgacao(d: DadosPrazoArt55): PrazoMinimo {
  const hipoteses: HipotesePrazo[] = [];
  const pendencias: string[] = [];
  const criterio = String(d.criterio_julgamento ?? CriterioJulgamento.MENOR_PRECO);
  const regime = String(d.regime_execucao ?? '');
  const categoria = categoriaDoObjeto(d);
  const natureza = naturezaEfetiva(d);

  if (d.modalidade === ModalidadeLicitacao.DISPENSA_ELETRONICA) {
    hipoteses.push({ dias: DIAS_UTEIS_DISPENSA, fundamento: 'Lei 14.133/2021, art. 75, §3º; IN SEGES 67/2021', descricao: 'dispensa eletrônica — recebimento de propostas' });
  } else if (!MODALIDADES_ART55.includes(d.modalidade as ModalidadeLicitacao)) {
    return { dias: null, fundamento: null, descricao: null, hipoteses, pendencias };
  } else if (d.modalidade === ModalidadeLicitacao.DIALOGO_COMPETITIVO) {
    hipoteses.push({ dias: 25, fundamento: 'Lei 14.133/2021, art. 32, §1º, I', descricao: 'diálogo competitivo — manifestação de interesse' });
  } else {
    if (d.modalidade === ModalidadeLicitacao.PREGAO_ELETRONICO) {
      if (d.natureza_objeto === 'ESPECIAL') {
        pendencias.push('Pregão só se aplica a bens e serviços COMUNS (art. 6º, XLI e art. 29 da Lei 14.133/2021) — objeto especial exige concorrência.');
      }
      if (String(d.tipo_contratacao ?? '') === TipoContratacao.OBRA) {
        pendencias.push('Pregão não se aplica a obras (art. 29, parágrafo único, da Lei 14.133/2021) — use concorrência.');
      }
    }
    if (criterio === CriterioJulgamento.MAIOR_LANCE) {
      hipoteses.push({ dias: 15, fundamento: 'Lei 14.133/2021, art. 55, III', descricao: 'critério de maior lance' });
    }
    if (TECNICA.includes(criterio)) {
      hipoteses.push({ dias: 35, fundamento: 'Lei 14.133/2021, art. 55, IV', descricao: 'técnica e preço ou melhor técnica/conteúdo artístico' });
    }
    if (d.modalidade === ModalidadeLicitacao.CONCURSO && !TECNICA.includes(criterio)) {
      // Concurso: melhor técnica ou conteúdo artístico (art. 30)
      hipoteses.push({ dias: 35, fundamento: 'Lei 14.133/2021, art. 55, IV (art. 30)', descricao: 'concurso — melhor técnica ou conteúdo artístico' });
    }
    if (categoria === 'BENS' && criterio !== CriterioJulgamento.MAIOR_LANCE) {
      if (PRECO.includes(criterio)) {
        hipoteses.push({ dias: 8, fundamento: 'Lei 14.133/2021, art. 55, I, a', descricao: 'aquisição de bens — menor preço ou maior desconto' });
      } else {
        hipoteses.push({ dias: 15, fundamento: 'Lei 14.133/2021, art. 55, I, b', descricao: 'aquisição de bens — demais critérios' });
      }
    }
    if (categoria === 'SERVICOS_OBRAS' && criterio !== CriterioJulgamento.MAIOR_LANCE) {
      if (regime === RegimeExecucao.CONTRATACAO_INTEGRADA) {
        hipoteses.push({ dias: 60, fundamento: 'Lei 14.133/2021, art. 55, II, c', descricao: 'regime de contratação integrada' });
      } else if (regime === RegimeExecucao.CONTRATACAO_SEMI_INTEGRADA) {
        hipoteses.push({ dias: 35, fundamento: 'Lei 14.133/2021, art. 55, II, d', descricao: 'regime de contratação semi-integrada' });
      } else if (PRECO.includes(criterio)) {
        if (natureza === 'COMUM') {
          hipoteses.push({ dias: 10, fundamento: 'Lei 14.133/2021, art. 55, II, a', descricao: 'serviços comuns / obras e serviços comuns de engenharia — menor preço ou maior desconto' });
        } else if (natureza === 'ESPECIAL') {
          hipoteses.push({ dias: 25, fundamento: 'Lei 14.133/2021, art. 55, II, b', descricao: 'serviços especiais / obras e serviços especiais de engenharia — menor preço ou maior desconto' });
        } else {
          pendencias.push(
            'Informe se o objeto (serviço/obra) é COMUM ou ESPECIAL (art. 6º, XIII e XIV) — define o prazo mínimo do art. 55, II (10 ou 25 dias úteis).',
          );
        }
      } else {
        hipoteses.push({ dias: 35, fundamento: 'Lei 14.133/2021, art. 55, II, d', descricao: 'serviços e obras — demais hipóteses' });
      }
    }
    if (categoria === 'ALIENACAO' && criterio !== CriterioJulgamento.MAIOR_LANCE && !hipoteses.length) {
      hipoteses.push({ dias: 15, fundamento: 'Lei 14.133/2021, art. 55, III', descricao: 'alienação (leilão por maior lance)' });
    }
  }
  if (!hipoteses.length) return { dias: null, fundamento: null, descricao: null, hipoteses, pendencias };
  const maior = hipoteses.reduce((a, b) => (b.dias > a.dias ? b : a));
  return { dias: maior.dias, fundamento: maior.fundamento, descricao: maior.descricao, hipoteses, pendencias };
}

// ---------------------------------------------------------------------------
// Cronograma
// ---------------------------------------------------------------------------

export interface Cronograma {
  data_publicacao_edital?: Date | string | null;
  data_limite_impugnacao?: Date | string | null;
  data_inicio_acolhimento?: Date | string | null;
  data_fim_acolhimento?: Date | string | null;
  data_abertura_sessao?: Date | string | null;
}

function dt(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function formatarDataBrasilia(d: Date, comHora = true): string {
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

/** Referência do "prazo para apresentação de propostas": fim do recebimento (ou a abertura). */
export function fimDoRecebimento(c: Cronograma): Date | null {
  return dt(c.data_fim_acolhimento) ?? dt(c.data_abertura_sessao);
}

export interface AvaliacaoPrazos {
  prazo: PrazoMinimo;
  /** Início da contagem (divulgação efetiva). */
  divulgacao: Date;
  /** Vencimento do prazo mínimo (23:59:59 do N-ésimo dia útil). */
  vencimento: Date | null;
  /** Primeira data/hora admitida para o fim do recebimento e a abertura: 00:00 do N-ésimo dia útil (art. 183 — inclui o dia do vencimento). */
  minimo_abertura: Date | null;
  pendencias: string[];
}

/**
 * Confere o cronograma de publicação (ou de republicação, na retificação que
 * reabre prazos): prazo mínimo do art. 55 contado da divulgação no calendário
 * do órgão + ordem coerente das datas + art. 164 (o edital não pode fixar
 * limite de impugnação anterior aos 3 dias úteis antes da abertura).
 */
export function avaliarPrazosDePublicacao(
  d: DadosPrazoArt55 & { orgao_id?: string | null },
  c: Cronograma,
  agora: Date,
  opcoes: { cal?: CalendarioDiasUteis; rotuloAto?: string; exigirDatas?: boolean } = {},
): AvaliacaoPrazos {
  const cal = opcoes.cal ?? calendarioDoOrgao(d.orgao_id ?? null);
  const prazo = prazoMinimoDeDivulgacao(d);
  const pend: string[] = [...prazo.pendencias];
  const informada = dt(c.data_publicacao_edital);
  const divulgacao = informada && informada.getTime() > agora.getTime() ? informada : agora;

  const abertura = dt(c.data_abertura_sessao);
  const fim = dt(c.data_fim_acolhimento);
  const inicio = dt(c.data_inicio_acolhimento);
  const limite = dt(c.data_limite_impugnacao);
  const recebimento = fimDoRecebimento(c);
  const ehDispensa = d.modalidade === ModalidadeLicitacao.DISPENSA_ELETRONICA;
  const competitiva = MODALIDADES_ART55.includes(d.modalidade as ModalidadeLicitacao);

  if (opcoes.exigirDatas && (competitiva || ehDispensa) && !recebimento) {
    pend.push(
      ehDispensa
        ? 'Informe o fim do recebimento de propostas (dispensa eletrônica — art. 75, §3º).'
        : 'Informe a data de abertura da sessão pública (prazo mínimo do art. 55 da Lei 14.133/2021).',
    );
  }

  let vencimento: Date | null = null;
  let minimo: Date | null = null;
  if (prazo.dias) {
    vencimento = fimDoPrazoEmDiasUteis(divulgacao, prazo.dias, cal);
    minimo = inicioDoDia(vencimento);
  }
  if (prazo.dias && recebimento && vencimento && minimo) {
    for (const [rotulo, data] of [
      [ehDispensa ? 'o fim do recebimento de propostas' : 'a abertura da sessão pública', ehDispensa ? recebimento : abertura],
      ['o fim do recebimento de propostas', ehDispensa ? null : fim],
    ] as Array<[string, Date | null]>) {
      if (data && data.getTime() < minimo.getTime()) {
        pend.push(
          `Prazo mínimo de ${prazo.dias} dias úteis entre a divulgação e ${rotulo} (${prazo.fundamento} — ${prazo.descricao}; ` +
            `contagem do art. 183 no calendário do órgão): informado ${formatarDataBrasilia(data)}, ` +
            `mínimo ${formatarDataBrasilia(minimo, false)} (${prazo.dias}º dia útil depois da divulgação).`,
        );
      }
    }
  }

  // Ordem coerente das datas
  if (informada && inicio && inicio.getTime() < diaEmBrasilia(informada) + 3 * 3_600_000) {
    pend.push('O recebimento de propostas não pode começar antes do dia da divulgação do edital.');
  }
  if (inicio && fim && inicio.getTime() >= fim.getTime()) {
    pend.push('O início do recebimento de propostas deve ser anterior ao fim.');
  }
  if (!ehDispensa && fim && abertura && fim.getTime() > abertura.getTime()) {
    pend.push('O recebimento de propostas deve terminar até a abertura da sessão pública.');
  }
  if (limite) {
    const ref = ehDispensa ? recebimento : abertura ?? recebimento;
    if (ehDispensa) {
      // Contratação direta: não há "abertura do certame" (art. 164 trata do
      // edital de licitação) — o limite acompanha o recebimento (E1).
      if (ref && limite.getTime() > ref.getTime()) {
        pend.push('A data-limite de impugnação/esclarecimento não pode passar do fim do recebimento de propostas.');
      }
    } else if (ref && limite.getTime() >= ref.getTime()) {
      pend.push('A data-limite de impugnação/esclarecimento deve ser anterior à abertura do certame (art. 164).');
    }
    if (informada && limite.getTime() < informada.getTime()) {
      pend.push('A data-limite de impugnação/esclarecimento não pode ser anterior à divulgação do edital.');
    }
    if (ref && !ehDispensa) {
      const legal = limiteDiasUteisAntes(ref, 3, cal);
      if (diaEmBrasilia(limite) < diaEmBrasilia(legal)) {
        pend.push(
          `O edital não pode encurtar o prazo de impugnação/esclarecimento: qualquer pessoa pode pedir até 3 dias úteis antes da abertura ` +
            `(art. 164) — limite mínimo ${formatarDataBrasilia(legal, false)}.`,
        );
      }
    }
  }
  return { prazo, divulgacao, vencimento, minimo_abertura: minimo, pendencias: pend };
}

// ---------------------------------------------------------------------------
// Alteração do edital depois da publicação (art. 55 §1º)
// ---------------------------------------------------------------------------

/** Datas do cronograma do edital. */
export const CAMPOS_CRONOGRAMA_EDITAL = [
  'data_publicacao_edital',
  'data_limite_impugnacao',
  'data_inicio_acolhimento',
  'data_fim_acolhimento',
  'data_abertura_sessao',
] as const;

/**
 * Campos do cadastro da licitação que a RETIFICAÇÃO pode alterar (regras do
 * certame que constam do edital). Itens/lotes não se retificam por aqui (há
 * propostas vinculadas) — para mudar o objeto em si, revogue e republique.
 */
export const CAMPOS_EDITAL_RETIFICAVEIS = [
  'objeto',
  'objeto_detalhado',
  'justificativa',
  'tipo_contratacao',
  'criterio_julgamento',
  'modo_disputa',
  'regime_execucao',
  'natureza_objeto',
  'diferenca_minima_lances',
  'tipo_diferenca_minima_lances',
  'tempo_inatividade',
  'tempo_prorrogacao',
  'intervalo_minimo_lances',
  'entrega_local',
  'entrega_prazo',
  'garantia_produto',
  'ata_vigencia_meses',
  'valor_total_estimado',
  'sigilo_orcamento',
  'justificativa_sigilo',
  'margem_preferencia',
] as const;

/**
 * Campos que continuam livres DEPOIS da publicação — não são regras do
 * edital (equipe, anotações internas, identificação no PNCP...). Qualquer
 * outro campo alterado pelo PUT da licitação publicada → 409 (retificação).
 */
export const CAMPOS_LIVRES_APOS_PUBLICACAO = new Set<string>([
  'observacoes',
  'pregoeiro_id',
  'pregoeiro_nome',
  'equipe_apoio',
  'codigo_unidade_compradora',
  'nome_unidade_compradora',
  'link_pncp',
  'numero_edital',
  'demanda_id',
  'item_pca_id',
  'modo_vinculacao_pca',
  'sem_pca',
  'justificativa_sem_pca',
  'preparacao_automatica',
  'updated_at',
  'created_at',
  'orgao',
  'orgao_id',
  'id',
]);

function normalizarValor(v: any): any {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v.getTime();
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number(v);
  if (typeof v === 'string') {
    const t = v.trim();
    if (/^\d{4}-\d{2}-\d{2}T/.test(t)) {
      const d = new Date(t);
      return isNaN(d.getTime()) ? t : d.getTime();
    }
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    if (t === 'true' || t === 'false') return t === 'true';
    return t;
  }
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Os dois valores são o mesmo (datas, números em string, booleanos)? */
export function mesmoValor(a: any, b: any): boolean {
  return normalizarValor(a) === normalizarValor(b);
}

/**
 * Campos do corpo que ALTERAM regra do edital numa licitação já publicada
 * (ignora os livres e os que vieram iguais ao atual — a tela manda o
 * formulário inteiro).
 */
export function camposDoEditalAlterados(atual: Record<string, any>, corpo: Record<string, any>): string[] {
  const alterados: string[] = [];
  for (const [campo, valor] of Object.entries(corpo ?? {})) {
    if (CAMPOS_LIVRES_APOS_PUBLICACAO.has(campo)) continue;
    if (valor === undefined) continue;
    if (!(campo in atual)) continue; // campo desconhecido: não é gravado mesmo
    if (!mesmoValor(atual[campo], valor)) alterados.push(campo);
  }
  return alterados;
}

/** Fases em que o edital está divulgado e a retificação ainda cabe (antes da sessão). */
export const FASES_RETIFICAVEIS = ['PUBLICADO', 'IMPUGNACAO', 'ACOLHIMENTO_PROPOSTAS', 'ANALISE_PROPOSTAS'];

export interface DadosRetificacao {
  afeta_propostas?: boolean | string | null;
  alteracoes?: string | null;
  justificativa_nao_afeta?: string | null;
  cronograma?: Cronograma | null;
}

/** A retificação muda o fim do recebimento ou a abertura? */
export function cronogramaDoCertameMudou(atual: Cronograma, novo: Cronograma | null | undefined): boolean {
  if (!novo) return false;
  return (['data_fim_acolhimento', 'data_abertura_sessao'] as const).some((c) => {
    const n = dt(novo[c]);
    return !!n && !mesmoValor(dt(atual[c]), n);
  });
}

/**
 * Validação da retificação (art. 55 §1º):
 *  - motivo (no ato) e descrição do que mudou;
 *  - AFETA a formulação das propostas → nova divulgação com os MESMOS prazos
 *    dos atos originais: novo cronograma completo, conferido pelo art. 55 a
 *    partir da data da retificação (e pela ordem das datas / art. 164);
 *  - NÃO afeta → justificativa (é exceção à regra) e as datas só podem ser
 *    mantidas ou ADIADAS (antecipar prazo é sempre prejuízo aos licitantes).
 */
export function pendenciasDaRetificacao(
  d: DadosPrazoArt55 & { orgao_id?: string | null },
  atual: Cronograma,
  r: DadosRetificacao,
  agora: Date,
  cal?: CalendarioDiasUteis,
): string[] {
  const p: string[] = [];
  if (!r.alteracoes || String(r.alteracoes).trim().length < 10) {
    p.push('Descreva o que foi alterado no edital (mínimo 10 caracteres).');
  }
  const afeta = r.afeta_propostas === true || r.afeta_propostas === 'true';
  const naoAfeta = r.afeta_propostas === false || r.afeta_propostas === 'false';
  if (!afeta && !naoAfeta) {
    p.push('Informe se a alteração afeta a formulação das propostas (art. 55, §1º).');
    return p;
  }
  const novo: Cronograma = { ...atual, ...(r.cronograma ?? {}) };
  // Datas do certame mudaram e o limite de impugnação não foi informado: o
  // limite antigo cai e vale o do art. 164 (3 dias úteis antes da NOVA
  // abertura) — manter o antigo encurtaria o prazo de impugnação.
  if (cronogramaDoCertameMudou(atual, r.cronograma) && !r.cronograma?.data_limite_impugnacao) novo.data_limite_impugnacao = null;
  if (afeta) {
    const ab = dt(r.cronograma?.data_abertura_sessao) ?? dt(r.cronograma?.data_fim_acolhimento);
    if (!ab) {
      p.push('A alteração afeta as propostas: informe o novo cronograma (reabertura dos prazos — art. 55, §1º).');
      return p;
    }
    const av = avaliarPrazosDePublicacao(
      d,
      // o recebimento já em curso continua: só a data nova (se houver) entra na ordem
      { ...novo, data_inicio_acolhimento: r.cronograma?.data_inicio_acolhimento ?? null, data_publicacao_edital: agora },
      agora,
      { cal, exigirDatas: true },
    );
    p.push(...av.pendencias.map((x) => `Republicação: ${x}`));
  } else {
    if (!r.justificativa_nao_afeta || String(r.justificativa_nao_afeta).trim().length < 10) {
      p.push('Justifique por que a alteração não compromete a formulação das propostas (exceção do art. 55, §1º).');
    }
    for (const campo of CAMPOS_CRONOGRAMA_EDITAL) {
      if (campo === 'data_publicacao_edital') continue;
      const antes = dt(atual[campo]);
      const depois = dt(r.cronograma?.[campo]);
      if (antes && depois && depois.getTime() < antes.getTime()) {
        p.push(`Sem reabertura de prazos, as datas só podem ser mantidas ou adiadas (${campo.replace(/_/g, ' ')}).`);
      }
    }
    if (r.cronograma && Object.values(r.cronograma).some(Boolean)) {
      const ordem = avaliarPrazosDePublicacao({ ...d, modalidade: 'SEM_PRAZO' }, novo, agora, { cal });
      p.push(...ordem.pendencias);
    }
  }
  return p;
}

// ---------------------------------------------------------------------------
// Divulgação OFICIAL confirmada depois do ato de publicação (PNCP)
// ---------------------------------------------------------------------------

/** Campo do cronograma alterado na confirmação da divulgação. */
export interface AjusteCronograma {
  campo: keyof Cronograma;
  de: Date | null;
  para: Date | null;
}

export interface ReajusteDivulgacao {
  /** Alterações feitas (vazio = o cronograma planejado continua válido). */
  ajustes: AjusteCronograma[];
  /** Cronograma resultante (datas). */
  cronograma: Cronograma;
  /** 00:00 (Brasília) do N-ésimo dia útil depois da divulgação confirmada — null sem prazo mínimo. */
  minimo: Date | null;
  prazo: PrazoMinimo;
  /** Texto para o histórico/aviso (null sem ajuste). */
  descricao: string | null;
}

const ROTULO_CAMPO_CRONOGRAMA: Record<string, string> = {
  data_limite_impugnacao: 'limite de impugnação/esclarecimento',
  data_inicio_acolhimento: 'início do recebimento de propostas',
  data_fim_acolhimento: 'fim do recebimento de propostas',
  data_abertura_sessao: 'abertura da sessão',
};

/**
 * RECONFERÊNCIA DO CRONOGRAMA PELA DIVULGAÇÃO CONFIRMADA (arts. 54, 55 e
 * 75 §3º — os prazos são contados "a partir da data de divulgação do edital";
 * a divulgação oficial é a do PNCP). O PUBLICAR confere o cronograma contra o
 * momento do ato; se o PNCP só confirma depois (falha, fila, correção), o
 * prazo mínimo pode ter deixado de ser respeitado. Como o prazo legal é um
 * PISO, a Administração garante o mínimo estendendo as datas (nunca
 * encurtando): isonomia preservada — ninguém teve menos prazo que a lei dá.
 *
 *  - início do recebimento: mantido (nada é recebido antes da confirmação; o
 *    início efetivo é a própria `data_divulgacao_oficial`);
 *  - fim do recebimento (dispensa) / abertura e fim do recebimento (demais)
 *    antes do mínimo → mesmo horário no N-ésimo dia útil depois da divulgação
 *    (art. 183, calendário do órgão);
 *  - abertura da dispensa acompanha o fim do recebimento; nas demais o fim do
 *    recebimento nunca passa da abertura;
 *  - limite de impugnação: na dispensa acompanha o fim do recebimento quando
 *    coincidia com ele (ou estava antes da divulgação); nas demais, com a
 *    abertura adiada (ou limite anterior à divulgação), o limite do edital cai
 *    e vale o do art. 164 contado da nova abertura (mesma regra da retificação).
 * Sem prazo mínimo (credenciamento, inexigibilidade): nada é ajustado.
 */
export function reajustarCronogramaNaDivulgacao(
  d: DadosPrazoArt55 & { orgao_id?: string | null },
  c: Cronograma,
  divulgacao: Date,
  opcoes: { cal?: CalendarioDiasUteis } = {},
): ReajusteDivulgacao {
  const cal = opcoes.cal ?? calendarioDoOrgao(d.orgao_id ?? null);
  const prazo = prazoMinimoDeDivulgacao(d);
  const novo: Cronograma = {};
  for (const campo of Object.keys(ROTULO_CAMPO_CRONOGRAMA) as Array<keyof Cronograma>) novo[campo] = dt(c[campo]);
  novo.data_publicacao_edital = dt(c.data_publicacao_edital);
  const ajustes: AjusteCronograma[] = [];
  const definir = (campo: keyof Cronograma, valor: Date | null) => {
    const atual = dt(novo[campo]);
    if ((atual?.getTime() ?? null) === (valor?.getTime() ?? null)) return;
    const existente = ajustes.find((a) => a.campo === campo);
    if (existente) existente.para = valor;
    else ajustes.push({ campo, de: dt(c[campo]), para: valor });
    novo[campo] = valor;
  };

  // O início do recebimento NÃO é reescrito: nada é recebido antes da
  // confirmação (a fase AGUARDANDO_DIVULGACAO barra propostas) e o início
  // efetivo fica registrado em `data_divulgacao_oficial` — mexer nele só criaria
  // divergência com a compra já publicada no PNCP.

  let minimo: Date | null = null;
  if (prazo.dias) {
    minimo = inicioDoDia(fimDoPrazoEmDiasUteis(divulgacao, prazo.dias, cal));
    const noMinimo = (data: Date) => new Date(minimo!.getTime() + (data.getTime() - inicioDoDia(data).getTime()));
    const ehDispensa = d.modalidade === ModalidadeLicitacao.DISPENSA_ELETRONICA;
    const fimAntigo = dt(c.data_fim_acolhimento);
    const abAntiga = dt(c.data_abertura_sessao);
    if (ehDispensa) {
      const ref = fimAntigo ?? abAntiga;
      if (ref && ref.getTime() < minimo.getTime()) {
        const n = noMinimo(ref);
        if (fimAntigo) definir('data_fim_acolhimento', n);
        if (abAntiga && abAntiga.getTime() < n.getTime()) definir('data_abertura_sessao', n);
      }
    } else {
      if (abAntiga && abAntiga.getTime() < minimo.getTime()) definir('data_abertura_sessao', noMinimo(abAntiga));
      if (fimAntigo && fimAntigo.getTime() < minimo.getTime()) definir('data_fim_acolhimento', noMinimo(fimAntigo));
      const ab = dt(novo.data_abertura_sessao);
      const fim = dt(novo.data_fim_acolhimento);
      if (ab && fim && fim.getTime() > ab.getTime()) definir('data_fim_acolhimento', ab);
    }
    const limite = dt(c.data_limite_impugnacao);
    const moveu = ajustes.some((a) => a.campo === 'data_fim_acolhimento' || a.campo === 'data_abertura_sessao');
    if (limite && (moveu || limite.getTime() < divulgacao.getTime())) {
      if (ehDispensa) {
        const ref = fimAntigo ?? abAntiga;
        const novoFim = dt(novo.data_fim_acolhimento) ?? dt(novo.data_abertura_sessao);
        if ((ref && limite.getTime() === ref.getTime()) || limite.getTime() < divulgacao.getTime()) definir('data_limite_impugnacao', novoFim);
      } else {
        definir('data_limite_impugnacao', null);
      }
    }
  }

  const descricao = ajustes.length
    ? `Divulgação oficial confirmada em ${formatarDataBrasilia(divulgacao)}` +
      (prazo.dias ? ` — prazo mínimo de ${prazo.dias} dias úteis (${prazo.fundamento}) recontado da divulgação` : '') +
      ': ' +
      ajustes
        .map((a) => `${ROTULO_CAMPO_CRONOGRAMA[a.campo] ?? a.campo} ${a.de ? formatarDataBrasilia(a.de) : '—'} → ${a.para ? formatarDataBrasilia(a.para) : 'art. 164 (3 dias úteis antes da abertura)'}`)
        .join('; ') +
      '.'
    : null;
  return { ajustes, cronograma: novo, minimo, prazo, descricao };
}
