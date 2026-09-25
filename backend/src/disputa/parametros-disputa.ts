import { BaseLance, DiferencaMinima } from './modelo-lance';

/**
 * ============================================================================
 * PARÂMETROS EFETIVOS DA DISPUTA — resolvedor único (plano E2 item 6)
 * ============================================================================
 *
 * Toda regra de tempo/valor do motor lê daqui. Precedência:
 *
 *   sessão (cópia feita na criação; o pregoeiro pode ajustar tempos na sala)
 *     → licitação (overrides do edital; NULL = herda)
 *       → órgão (parametros_licitacao do órgão)
 *         → sistema (parametros_licitacao com orgao_id NULL)
 *
 * Os campos que não existem na sessão (cancelamento direto, % de reinício,
 * diferença mínima, base do lance) vêm direto de licitação → órgão → sistema.
 * A diferença mínima é regra do EDITAL: só a licitação a define.
 */

export interface ParametrosDisputa {
  /** Etapa inicial do modo aberto (min) — IN 73 art. 23 (10). */
  tempoInicialMinutos: number;
  /** Prorrogação automática (min) — IN 73 art. 23 (2). */
  prorrogacaoMinutos: number;
  /** Intervalo de TEMPO entre lances do mesmo fornecedor (s). 0 = sem (não é exigência legal). */
  intervaloProprioSegundos: number;
  /** Exclusão do próprio último lance (s) — IN 73 art. 21 §3º (15). */
  cancelamentoDiretoSegundos: number;
  /** Aviso ao pregoeiro de reinício possível — Lei 14.133 art. 56 §4º (5%). */
  percentualReinicioDisputa: number;
  /** Tempo aleatório (min) — modos aberto-fechado (gancho). */
  tempoAleatorioMinMinutos: number;
  tempoAleatorioMaxMinutos: number;
  diferencaMinima: DiferencaMinima | null;
  baseLance: BaseLance;
}

type Num = number | string | null | undefined;

export interface FontesParametrosDisputa {
  sessao?: {
    tempo_inatividade_minutos?: Num;
    tempo_prorrogacao_minutos?: Num;
    intervalo_minimo_lances_minutos?: Num;
    tempo_aleatorio_min_minutos?: Num;
    tempo_aleatorio_max_minutos?: Num;
  } | null;
  licitacao?: {
    tempo_inatividade?: Num;
    tempo_prorrogacao?: Num;
    intervalo_minimo_lances?: Num;
    diferenca_minima_lances?: Num;
    tipo_diferenca_minima_lances?: string | null;
    base_lance?: string | null;
  } | null;
  /** Parâmetro do órgão, se houver. */
  orgao?: Partial<Record<string, Num>> | null;
  /** Parâmetro do sistema (orgao_id NULL). */
  sistema?: Partial<Record<string, Num>> | null;
}

/** Padrões legais usados só se nem o sistema tiver o registro. */
export const PADROES_DISPUTA = {
  tempo_inatividade_minutos: 10,
  tempo_prorrogacao_minutos: 2,
  intervalo_minimo_lances_minutos: 0,
  cancelamento_direto_segundos: 15,
  percentual_reinicio_disputa: 5,
  tempo_aleatorio_min_minutos: 2,
  tempo_aleatorio_max_minutos: 30,
} as const;

const definido = (v: Num): v is number | string => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));

function primeiro(...vals: Num[]): number {
  for (const v of vals) if (definido(v)) return Number(v);
  return 0;
}

export function resolverParametrosDisputa(f: FontesParametrosDisputa): ParametrosDisputa {
  const s = f.sessao ?? {};
  const l = f.licitacao ?? {};
  const o = f.orgao ?? {};
  const sis = f.sistema ?? {};
  const cadeia = (campoSessao: keyof typeof PADROES_DISPUTA, campoLicitacao?: string) =>
    primeiro(
      (s as any)[campoSessao],
      campoLicitacao ? (l as any)[campoLicitacao] : undefined,
      o[campoSessao],
      sis[campoSessao],
      PADROES_DISPUTA[campoSessao],
    );

  const dif = Number(l.diferenca_minima_lances);
  const base = Object.values(BaseLance).includes(l.base_lance as BaseLance)
    ? (l.base_lance as BaseLance)
    : BaseLance.TOTAL_ITEM;

  return {
    tempoInicialMinutos: cadeia('tempo_inatividade_minutos', 'tempo_inatividade'),
    prorrogacaoMinutos: cadeia('tempo_prorrogacao_minutos', 'tempo_prorrogacao'),
    intervaloProprioSegundos: cadeia('intervalo_minimo_lances_minutos', 'intervalo_minimo_lances') * 60,
    cancelamentoDiretoSegundos: primeiro(o.cancelamento_direto_segundos, sis.cancelamento_direto_segundos, PADROES_DISPUTA.cancelamento_direto_segundos),
    percentualReinicioDisputa: primeiro(o.percentual_reinicio_disputa, sis.percentual_reinicio_disputa, PADROES_DISPUTA.percentual_reinicio_disputa),
    tempoAleatorioMinMinutos: cadeia('tempo_aleatorio_min_minutos'),
    tempoAleatorioMaxMinutos: cadeia('tempo_aleatorio_max_minutos'),
    diferencaMinima: dif > 0 ? { tipo: l.tipo_diferenca_minima_lances === 'PERCENTUAL' ? 'PERCENTUAL' : 'VALOR', valor: dif } : null,
    baseLance: base,
  };
}

/**
 * Valores que a sessão copia ao ser criada (licitação → órgão → sistema, sem
 * a sessão, que ainda não existe).
 */
export function valoresIniciaisDaSessao(f: Omit<FontesParametrosDisputa, 'sessao'>) {
  const p = resolverParametrosDisputa({ ...f, sessao: null });
  return {
    tempo_inatividade_minutos: p.tempoInicialMinutos,
    tempo_prorrogacao_minutos: p.prorrogacaoMinutos,
    intervalo_minimo_lances_minutos: Math.round(p.intervaloProprioSegundos / 60),
    tempo_aleatorio_min_minutos: p.tempoAleatorioMinMinutos,
    tempo_aleatorio_max_minutos: p.tempoAleatorioMaxMinutos,
  };
}
