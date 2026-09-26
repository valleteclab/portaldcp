import { FaseLicitacao, ModalidadeLicitacao, SituacaoLicitacao } from '../licitacoes/entities/licitacao.entity';
import {
  CalendarioDiasUteis,
  calendarioDoOrgao,
  ehDiaUtil,
  limiteDiasUteisAntes as limiteDiasUteisAntesComum,
} from '../common/prazos/dias-uteis';

/**
 * ============================================================================
 * PRAZO DE IMPUGNAÇÃO E DE PEDIDO DE ESCLARECIMENTO (Lei 14.133/2021, art. 164)
 * ============================================================================
 *
 * "Qualquer pessoa é parte legítima para impugnar edital de licitação por
 * irregularidade na aplicação desta Lei ou para solicitar esclarecimento sobre
 * os seus termos, devendo protocolar o pedido até 3 (três) dias úteis antes da
 * data de abertura do certame." (art. 164, caput)
 *
 * Regra implementada (E1 item 6 / E7 item 5):
 *  - prazo-limite EFETIVO = `data_limite_impugnacao` quando o edital a fixa;
 *    senão, CALCULADO: fim do dia (23:59:59, horário de Brasília) do 3º dia
 *    útil anterior à data de abertura do certame
 *      · pregão/concorrência/…: `data_abertura_sessao` (ou, na falta, o fim do
 *        acolhimento);
 *      · dispensa eletrônica: fim do acolhimento (`data_fim_acolhimento`), que é
 *        quando o certame "abre" (ou, na falta, `data_abertura_sessao`).
 *    Ex.: abertura na segunda 19/10/2026 → contam-se sexta 16 (1), quinta 15
 *    (2), quarta 14 (3) → pedidos até quarta 14/10/2026, 23:59:59. O dia da
 *    abertura não conta (art. 183: exclui-se o dia do começo).
 *  - a aceitação é decidida por ESSA DATA, não pela fase: o acolhimento de
 *    propostas corre em paralelo com o prazo de impugnação;
 *  - salvaguardas (não decidem o prazo, só o limitam): a licitação precisa
 *    estar divulgada e ANTES da sessão (PUBLICADO, IMPUGNACAO legado,
 *    ACOLHIMENTO_PROPOSTAS) e não pode estar encerrada (revogada, anulada,
 *    deserta, fracassada, concluída);
 *  - sem data-limite nem data de abertura no cronograma: aceita enquanto a
 *    licitação estiver numa dessas fases (comportamento anterior).
 *
 * Dias úteis = segunda a sexta fora dos feriados do CALENDÁRIO DO ÓRGÃO da
 * licitação (art. 183, III — nacionais, estaduais, municipais e pontos
 * facultativos adotados; plano E7a): `calendarioDoOrgao(lic.orgao_id)`, a
 * mesma função única dos prazos de recurso (art. 165) e do art. 55.
 */

export const DIAS_UTEIS_ANTES_DA_ABERTURA = 3;

const DESLOCAMENTO_BRASILIA_MS = 3 * 3_600_000;

/** Fases em que ainda cabe impugnação/esclarecimento (antes da sessão). */
export const FASES_COM_PRAZO_DE_MANIFESTACAO: FaseLicitacao[] = [
  FaseLicitacao.PUBLICADO,
  FaseLicitacao.IMPUGNACAO, // legado: não se entra mais nesta fase
  FaseLicitacao.ACOLHIMENTO_PROPOSTAS,
];

const SITUACOES_ENCERRADAS: string[] = [
  SituacaoLicitacao.REVOGADA,
  SituacaoLicitacao.ANULADA,
  SituacaoLicitacao.DESERTA,
  SituacaoLicitacao.FRACASSADA,
  SituacaoLicitacao.CONCLUIDA,
];

export interface LicitacaoComPrazos {
  /** Órgão da licitação: define o calendário de feriados (art. 183, III). */
  orgao_id?: string | null;
  orgao?: { id?: string | null } | null;
  modalidade?: ModalidadeLicitacao | string | null;
  fase?: FaseLicitacao | string | null;
  situacao?: SituacaoLicitacao | string | null;
  data_limite_impugnacao?: Date | string | null;
  data_fim_acolhimento?: Date | string | null;
  data_abertura_sessao?: Date | string | null;
}

export type TipoManifestacao = 'IMPUGNACAO' | 'ESCLARECIMENTO';

export interface AvaliacaoPrazoManifestacao {
  aberto: boolean;
  /** Prazo-limite efetivo (null = cronograma sem datas). */
  limite: Date | null;
  /** Por que está fechado (texto para a tela / 400). */
  motivo: string | null;
}

function data(v: Date | string | null | undefined): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Dia útil: função ÚNICA de `common/prazos/dias-uteis.ts` (calendário do órgão — E7a). */
export { ehDiaUtil };

/** Calendário de feriados do órgão da licitação. */
export function calendarioDaLicitacao(lic: Pick<LicitacaoComPrazos, 'orgao_id' | 'orgao'>): CalendarioDiasUteis {
  return calendarioDoOrgao(lic.orgao_id ?? lic.orgao?.id ?? null);
}

/**
 * Último instante (23:59:59.999, Brasília) do N-ésimo dia útil ANTERIOR ao dia
 * (em Brasília) de `abertura`. O dia da abertura não conta.
 */
export function limiteDiasUteisAntes(
  abertura: Date,
  dias = DIAS_UTEIS_ANTES_DA_ABERTURA,
  cal?: CalendarioDiasUteis,
): Date {
  return limiteDiasUteisAntesComum(abertura, dias, cal);
}

/** Data de abertura do certame usada como referência do art. 164. */
export function dataAberturaDoCertame(lic: LicitacaoComPrazos): Date | null {
  const abertura = data(lic.data_abertura_sessao);
  const fim = data(lic.data_fim_acolhimento);
  if (lic.modalidade === ModalidadeLicitacao.DISPENSA_ELETRONICA) return fim ?? abertura;
  return abertura ?? fim;
}

/** Prazo-limite efetivo: o do edital, ou 3 dias úteis antes da abertura. */
export function prazoLimiteManifestacao(lic: LicitacaoComPrazos): Date | null {
  const fixado = data(lic.data_limite_impugnacao);
  if (fixado) return fixado;
  const abertura = dataAberturaDoCertame(lic);
  return abertura ? limiteDiasUteisAntes(abertura, DIAS_UTEIS_ANTES_DA_ABERTURA, calendarioDaLicitacao(lic)) : null;
}

function formatar(d: Date): string {
  return d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Cabe impugnação / pedido de esclarecimento AGORA? */
export function avaliarPrazoManifestacao(
  lic: LicitacaoComPrazos,
  tipo: TipoManifestacao = 'IMPUGNACAO',
  agora: Date = new Date(),
): AvaliacaoPrazoManifestacao {
  const limite = prazoLimiteManifestacao(lic);
  const nome = tipo === 'IMPUGNACAO' ? 'impugnação' : 'pedido de esclarecimento';

  // DISPENSA ELETRÔNICA: não há impugnação nem pedido de esclarecimento formal
  // — a IN SEGES 67/2021 não os prevê e o art. 164 da Lei trata do edital de
  // LICITAÇÃO. A comunicação é pelas mensagens do sistema (IN 67, art. 10).
  if (lic.modalidade === ModalidadeLicitacao.DISPENSA_ELETRONICA) {
    return {
      aberto: false,
      limite: null,
      motivo:
        `Na dispensa eletrônica não há ${nome} formal (a IN SEGES 67/2021 não prevê; o art. 164 da Lei 14.133/2021 trata do edital de licitação) — ` +
        'use as mensagens do sistema no processo (IN SEGES 67/2021, art. 10).',
    };
  }
  if (lic.situacao && SITUACOES_ENCERRADAS.includes(lic.situacao as string)) {
    return { aberto: false, limite, motivo: `Licitação encerrada (${String(lic.situacao).toLowerCase()}): não cabe ${nome}.` };
  }
  if (!lic.fase || !FASES_COM_PRAZO_DE_MANIFESTACAO.includes(lic.fase as FaseLicitacao)) {
    return {
      aberto: false,
      limite,
      motivo: `Fora do prazo para ${nome}: o edital precisa estar publicado e a sessão ainda não pode ter sido aberta.`,
    };
  }
  if (limite && agora.getTime() > limite.getTime()) {
    return {
      aberto: false,
      limite,
      motivo:
        `Fora do prazo para ${nome}: o limite era ${formatar(limite)} ` +
        `(até ${DIAS_UTEIS_ANTES_DA_ABERTURA} dias úteis antes da abertura do certame — art. 164 da Lei 14.133/2021).`,
    };
  }
  return { aberto: true, limite, motivo: null };
}

/**
 * Relógio de parede de Brasília sem fuso ("YYYY-MM-DDTHH:mm:ss") — mesma
 * convenção das datas do cronograma devolvidas pela API (`formatarDataLocal`
 * do LicitacoesService; o `parseIsoLocal` das telas só aceita esse formato).
 */
export function formatarRelogioBrasilia(d: Date): string {
  const l = new Date(d.getTime() - DESLOCAMENTO_BRASILIA_MS);
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${l.getUTCFullYear()}-${p(l.getUTCMonth() + 1)}-${p(l.getUTCDate())}` +
    `T${p(l.getUTCHours())}:${p(l.getUTCMinutes())}:${p(l.getUTCSeconds())}`
  );
}

/**
 * Campos de prazo expostos nas visões da licitação (órgão, fornecedor,
 * público) para a tela não recalcular: `data_limite_impugnacao_efetiva`
 * (horário de Brasília, sem fuso) e `prazo_manifestacao_aberto` (impugnação e
 * esclarecimento seguem o mesmo prazo).
 */
export function camposDePrazoManifestacao(
  lic: LicitacaoComPrazos,
  agora: Date = new Date(),
): { data_limite_impugnacao_efetiva: string | null; prazo_manifestacao_aberto: boolean } {
  const av = avaliarPrazoManifestacao(lic, 'IMPUGNACAO', agora);
  return {
    data_limite_impugnacao_efetiva: av.limite ? formatarRelogioBrasilia(av.limite) : null,
    prazo_manifestacao_aberto: av.aberto,
  };
}
